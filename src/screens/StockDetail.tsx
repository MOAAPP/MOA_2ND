import { useCallback, useEffect, useState } from 'react';
import { formatKDateTime, formatShort } from '../../shared/dates';
import { pct, signedPct, signedWon, won, shares } from '../../shared/format';
import { INSTRUMENT_BY_CODE } from '../../shared/instruments';
import { CONCEPTS, LEVEL_LABEL } from '../../shared/knowledge';
import { averageVolume, volatility, type Quote } from '../../shared/market';
import { IconRefresh, IconStar } from '../components/Icons';
import { ChangeText, QuoteMeta, SourceBadge, Spark } from '../components/QuoteBits';
import { CtaBar, Notice, Spinner, TopBar, WorldTag } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import type { Side } from '../lib/trading';
import { useLiveQuotes } from '../state/market';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';
import { OrderSheet } from './OrderSheet';

interface NewsResp {
  items: { title: string; source: string; publishedAt: number; link: string }[];
  error: string | null;
  source: string;
}

export function StockDetail({ code }: { code: string }) {
  const { state, update } = useStore();
  const nav = useNav();
  const m = useLiveQuotes([code]);
  const inst = INSTRUMENT_BY_CODE[code];
  const [detailQuote, setQuote] = useState<Quote | null>(m.quotes[code] ?? null);
  let quote = detailQuote;
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastTry, setLastTry] = useState<number | null>(null);
  const [news, setNews] = useState<NewsResp | null>(null);
  const [order, setOrder] = useState<Side | null>(null);
  const level = state.level ?? 1;

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const r = await api<{ quote: Quote }>(`/api/quotes/${code}`);
      setQuote(r.quote);
      void m.refresh([code]);
    } catch (e) {
      setErr(errorMessage(e));
    } finally {
      setLoading(false);
      setLastTry(Date.now());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  useEffect(() => {
    update((s) => ({ ...s, learning: { ...s.learning, seen: { ...s.learning.seen, stockAt: Date.now() } } }));
    void load();
    api<NewsResp>(`/api/news/${code}`).then(setNews).catch((e) => setNews({ items: [], error: errorMessage(e), source: '' }));
  }, [code, load]);

  if (!inst) return <div className="page no-nav"><TopBar onBack={nav.pop} title="종목" center /><Notice kind="danger">지원하지 않는 종목이에요.</Notice></div>;

  // 실시간 스트림 값이 더 최신이면 가격·등락만 바꾸고, 일봉은 상세 조회 값을 유지
  const liveQ = m.quotes[code];
  if (quote && liveQ && liveQ.fetchedAt > quote.fetchedAt) {
    quote = { ...liveQ, candles: quote.candles.length >= liveQ.candles.length ? quote.candles : liveQ.candles };
  }
  const pos = state.portfolio.positions[code];
  const watched = state.portfolio.watchlist.includes(code);
  const vol = quote ? volatility(quote.candles, 20) : null;
  const avgVol = quote ? averageVolume(quote.candles, quote.date) : null;
  const evalPnl = pos && quote ? (quote.price - pos.avgPrice) * pos.qty : null;
  const toggleWatch = () =>
    update((s) => ({ ...s, portfolio: { ...s.portfolio, watchlist: watched ? s.portfolio.watchlist.filter((c) => c !== code) : [...s.portfolio.watchlist, code] } }));

  return (
    <div className="page no-nav has-cta">
      <TopBar
        onBack={nav.pop}
        title={inst.name}
        center
        right={
          <button className="icon-btn" onClick={toggleWatch} aria-pressed={watched} aria-label={watched ? '관심 해제' : '관심 추가'} style={{ color: watched ? '#f5a524' : undefined }}>
            <IconStar filled={watched} />
          </button>
        }
      />
      <div className="row" style={{ gap: 6, padding: '0 4px' }}>
        <span className="pill mock">모의투자</span>
        {quote && <SourceBadge q={quote} />}
        <span className={`pill ${m.status.state === 'open' ? 'ok' : ''}`}>{m.status.label}</span>
      </div>

      <section className="hero">
        <div className="small muted">{inst.code} · {inst.type === 'etf' ? 'ETF' : inst.sector}</div>
        {quote ? (
          <>
            <div className="stock-price num">{won(quote.price)}</div>
            <ChangeText q={quote} />
            <div><QuoteMeta q={quote} /></div>
          </>
        ) : loading ? (
          <div className="skeleton" style={{ width: 180, height: 40, marginTop: 6 }} />
        ) : null}
      </section>

      {err && (
        <div style={{ marginTop: 12 }}>
          <Notice kind="danger">
            시세를 불러오지 못했어요: {err}
            {quote ? ` 화면의 가격은 ${formatKDateTime(quote.time)} 기준 마지막 시세예요.` : ''}
            {lastTry ? ` (시도 ${formatKDateTime(lastTry)})` : ''}
            <div><button className="link-btn" onClick={load}>다시 시도</button></div>
          </Notice>
        </div>
      )}

      {quote && (
        <>
          <div className="card" style={{ marginTop: 14 }}>
            <Spark q={quote} />
            <div className="row between" style={{ marginTop: 6 }}>
              <span className="xs muted">{quote.delayNote}</span>
              <button className="icon-btn" onClick={load} aria-label="시세 새로고침" disabled={loading}>{loading ? <Spinner label="" /> : <IconRefresh />}</button>
            </div>
          </div>

          <div className="card">
            <dl className="kv">
              <dt>전 거래일 종가</dt><dd className="num">{quote.prevClose !== null ? `${won(quote.prevClose)} (${formatShort(quote.prevCloseDate!)})` : '데이터 없음'}</dd>
              <dt>당일 고가 / 저가</dt><dd className="num">{quote.dayHigh !== null && quote.dayLow !== null ? `${won(quote.dayHigh)} / ${won(quote.dayLow)}` : '데이터 없음'}</dd>
              <dt>거래량</dt><dd className="num">{quote.volume !== null ? `${quote.volume.toLocaleString('ko-KR')}주${avgVol ? ` (20일 평균의 ${(quote.volume / avgVol).toFixed(1)}배)` : ''}` : '데이터 없음'}</dd>
              <dt>20거래일 변동성</dt><dd className="num">{vol ? `일 ${pct(vol.dailyPct, 2)} · 연 ${pct(vol.annualPct)}` : '데이터 부족'}</dd>
            </dl>
          </div>
        </>
      )}

      {pos && (
        <section className="section">
          <div className="section-head"><h2>내 모의 보유</h2></div>
          <div className="card">
            <dl className="kv">
              <dt>보유 수량</dt><dd className="num">{shares(pos.qty)}</dd>
              <dt>평균단가</dt><dd className="num">{won(Math.round(pos.avgPrice))}</dd>
              <dt>평가손익</dt><dd className={`num ${evalPnl && evalPnl > 0 ? 'up' : evalPnl && evalPnl < 0 ? 'down' : ''}`}>{evalPnl !== null ? `${signedWon(evalPnl)} (${signedPct((quote!.price / pos.avgPrice - 1) * 100)})` : '시세 없음'}</dd>
            </dl>
            {quote && (
              <div className="world-pair" style={{ marginTop: 12 }}>
                <div className="world-card real" style={{ padding: 14, boxShadow: 'none', background: 'var(--surface-2)' }}>
                  <WorldTag kind="real">산 나</WorldTag>
                  <div className="num bold" style={{ marginTop: 6 }}>{won(pos.qty * quote.price)}</div>
                  <div className="xs muted">평가액</div>
                </div>
                <div className="world-card para" style={{ padding: 14 }}>
                  <WorldTag kind="para">현금으로 둔 나</WorldTag>
                  <div className="num bold" style={{ marginTop: 6 }}>{won(Math.round(pos.qty * pos.avgPrice))}</div>
                  <div className="xs muted">산 금액 그대로</div>
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head"><h2>이해하기</h2><span className="xs muted">{LEVEL_LABEL[level]}</span></div>
        <div className="card">
          <p style={{ margin: 0, fontSize: 15 }}>{inst.summary}{inst.type === 'etf' ? '예요. 여러 종목을 한 번에 담아요.' : '예요.'}</p>
          <hr className="divider" />
          <div className="bold small">{CONCEPTS.changePct[level].title}</div>
          <p className="small ink2" style={{ margin: '2px 0 10px' }}>{CONCEPTS.changePct[level].body}</p>
          <div className="bold small">{inst.type === 'etf' ? CONCEPTS.diversification[level].title : CONCEPTS.volatility[level].title}</div>
          <p className="small ink2" style={{ margin: '2px 0 0' }}>{inst.type === 'etf' ? CONCEPTS.diversification[level].body : CONCEPTS.volatility[level].body}</p>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>관련 기사</h2><span className="xs muted">원인 단정 아님</span></div>
        <div className="card" style={{ padding: '4px 18px' }}>
          {!news && <div style={{ padding: 14 }}><Spinner label="기사 찾는 중" /></div>}
          {news?.error && <p className="small muted">기사를 불러오지 못했어요. {news.error}</p>}
          {news && !news.error && news.items.length === 0 && <p className="small muted">최근 7일 관련 기사를 찾지 못했어요.</p>}
          {news?.items.map((n) => (
            <a key={n.link} className="list-item" href={n.link} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit', textDecoration: 'none' }}>
              <div className="grow">
                <div className="t" style={{ fontSize: 15 }}>{n.title}</div>
                <div className="s">{n.source} · {formatKDateTime(n.publishedAt)}</div>
              </div>
            </a>
          ))}
          {news && news.items.length > 0 && <p className="xs muted">{news.source} · 제목만 보여줘요. 기사가 가격 변화의 원인이라고 확인된 것은 아니에요.</p>}
        </div>
      </section>

      <CtaBar>
        <button className="btn ghost flex" style={{ color: 'var(--down)' }} disabled={!pos} onClick={() => setOrder('sell')}>모의 매도</button>
        <button className="btn danger flex" onClick={() => setOrder('buy')}>모의 매수</button>
      </CtaBar>
      {order && <OrderSheet code={code} side={order} quote={quote} onClose={() => setOrder(null)} />}
    </div>
  );
}
