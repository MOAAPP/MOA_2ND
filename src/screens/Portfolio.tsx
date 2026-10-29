import { useEffect, useState } from 'react';
import { formatKDate, formatKDateTime } from '../../shared/dates';
import { signedPct, signedWon, won, shares } from '../../shared/format';
import { ConfirmSheet, Empty, Seg, TopBar, useToast, WorldTag } from '../components/ui';
import { cancelOrder, fillWorlds } from '../lib/trading';
import { useMarket } from '../state/market';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';

const STATUS: Record<string, [string, string]> = {
  pending: ['대기', 'blue'],
  filled: ['체결', 'ok'],
  cancelled: ['취소', ''],
  expired: ['만료', 'warn'],
  rejected: ['거절', 'danger'],
};

export function Portfolio() {
  const { state, update } = useStore();
  const nav = useNav();
  const m = useMarket();
  const toast = useToast();
  const [tab, setTab] = useState<'hold' | 'orders' | 'fills'>('hold');
  const [cancelId, setCancelId] = useState<string | null>(null);
  const p = state.portfolio;
  const positions = Object.values(p.positions);

  useEffect(() => {
    update((s) => ({ ...s, learning: { ...s.learning, seen: { ...s.learning.seen, portfolioAt: Date.now() } } }));
    const codes = [...positions.map((x) => x.code), ...p.orders.filter((o) => o.status === 'pending').map((o) => o.code), ...p.fills.slice(0, 10).map((f) => f.code)];
    if (codes.length) void m.refresh(codes);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page no-nav">
      <TopBar onBack={nav.pop} title="모의투자 내역" center />
      <Seg label="보기" value={tab} onChange={setTab} options={[{ value: 'hold', label: `보유 ${positions.length}` }, { value: 'orders', label: '주문' }, { value: 'fills', label: '거래 내역' }]} />

      {tab === 'hold' && (
        <div className="card" style={{ marginTop: 12, padding: '4px 18px' }}>
          {positions.length === 0 && <Empty title="보유 종목이 없어요" action={<button className="btn secondary" onClick={() => { nav.pop(); nav.setTab('invest'); }}>종목 둘러보기</button>} />}
          {positions.map((pos) => {
            const q = m.quotes[pos.code];
            const pnl = q ? (q.price - pos.avgPrice) * pos.qty : null;
            return (
              <button key={pos.code} className="list-item" onClick={() => nav.push({ name: 'stock', code: pos.code })}>
                <div className="grow">
                  <div className="t">{pos.name}</div>
                  <div className="s">{shares(pos.qty)} · 평균 {won(Math.round(pos.avgPrice))}</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div className="num bold">{q ? won(q.price * pos.qty) : '시세 없음'}</div>
                  {pnl !== null && <div className={`small num ${pnl > 0 ? 'up' : pnl < 0 ? 'down' : 'muted'}`}>{signedWon(pnl)} ({signedPct((q!.price / pos.avgPrice - 1) * 100)})</div>}
                </div>
              </button>
            );
          })}
          {positions.length > 0 && <p className="xs muted">평가손익은 아직 팔지 않은 상태의 손익이에요. 수수료·세금 미반영.</p>}
        </div>
      )}

      {tab === 'orders' && (
        <div className="card" style={{ marginTop: 12, padding: '4px 18px' }}>
          {p.orders.length === 0 && <Empty title="주문 내역이 없어요" />}
          {p.orders.slice(0, 50).map((o) => (
            <div key={o.id} className="list-item">
              <div className="grow">
                <div className="t">{o.name} <span className={o.side === 'buy' ? 'up' : 'down'} style={{ fontSize: 14 }}>{o.side === 'buy' ? '매수' : '매도'}</span></div>
                <div className="s">
                  {o.type === 'market' ? '시장가' : `지정가 ${won(o.limitPrice!)}`} · {shares(o.qty)} · {formatKDateTime(o.createdAt)}
                  {o.status === 'pending' && ` · ${formatKDate(o.validDay)}까지`}
                </div>
                {o.note && <div className="xs muted">{o.note}</div>}
              </div>
              <div style={{ textAlign: 'right' }}>
                <span className={`pill ${STATUS[o.status][1]}`}>{STATUS[o.status][0]}</span>
                {o.status === 'pending' && <div><button className="link-btn small" onClick={() => setCancelId(o.id)}>취소</button></div>}
              </div>
            </div>
          ))}
          <p className="xs muted">대기 주문은 앱이 열려 있을 때 1분마다 시세를 확인해요. 대기 매수는 주문 금액만큼, 대기 매도는 수량만큼 예약돼요.</p>
        </div>
      )}

      {tab === 'fills' && (
        <div className="card" style={{ marginTop: 12, padding: '4px 18px' }}>
          {p.fills.length === 0 && <Empty title="체결된 거래가 없어요" />}
          {p.fills.slice(0, 50).map((f) => {
            const q = m.quotes[f.code];
            const w = fillWorlds(f, q?.price ?? null);
            const jobId = state.cardJobIds[f.id];
            return (
              <div key={f.id} className="list-item" style={{ alignItems: 'flex-start', flexDirection: 'column', gap: 8 }}>
                <div className="row between" style={{ width: '100%' }}>
                  <div>
                    <div className="t">{f.name} <span className={f.side === 'buy' ? 'up' : 'down'} style={{ fontSize: 14 }}>{f.side === 'buy' ? '매수' : '매도'}</span></div>
                    <div className="s">{shares(f.qty)} × {won(f.price)} · {formatKDateTime(f.time)}</div>
                  </div>
                  <button className="btn sm secondary" onClick={() => nav.push({ name: 'cardnews', tradeId: f.id })}>{jobId ? '카드뉴스' : '카드뉴스 만들기'}</button>
                </div>
                <div className="row small" style={{ gap: 10, flexWrap: 'wrap' }}>
                  <WorldTag kind="real">{w.mine.label}</WorldTag>
                  <span className="num">{w.mine.value !== null ? won(w.mine.value) : '—'}</span>
                  <WorldTag kind="para">{w.other.label}</WorldTag>
                  <span className="num">{w.other.value !== null ? won(w.other.value) : '시세 없음'}</span>
                </div>
                {f.realizedPnl !== undefined && <div className="xs">실현손익 <span className={`num ${f.realizedPnl > 0 ? 'up' : f.realizedPnl < 0 ? 'down' : ''}`}>{signedWon(f.realizedPnl)}</span> (확정)</div>}
              </div>
            );
          })}
        </div>
      )}

      {cancelId && (
        <ConfirmSheet
          title="주문을 취소할까요?"
          body="취소하면 예약된 금액이나 수량이 바로 풀려요."
          confirm="주문 취소"
          onClose={() => setCancelId(null)}
          onConfirm={() => {
            update((s) => ({ ...s, portfolio: cancelOrder(s.portfolio, cancelId) }));
            setCancelId(null);
            toast('주문을 취소했어요');
          }}
        />
      )}
    </div>
  );
}
