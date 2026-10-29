import { useEffect, useMemo, useState } from 'react';
import { UNITS, dailyQuizFor, type DailyQuiz } from '../../shared/curriculum';
import { formatKDateTime, todayKST } from '../../shared/dates';
import { signedPct, signedWon, won } from '../../shared/format';
import { INSTRUMENTS, searchInstruments } from '../../shared/instruments';
import { IconChartBars, IconChevron, IconGear, IconSearch, IconStar } from '../components/Icons';
import { IconTile } from '../components/Glyph';
import { ChangeText, LiveBadge } from '../components/QuoteBits';
import { Empty, Notice, Spinner, useToast } from '../components/ui';
import { answerDailyQuiz } from '../lib/learning';
import { availableCash, totalAssets } from '../lib/trading';
import { useLiveQuotes, useMarket } from '../state/market';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';

export function DailyQuizCard({ quiz }: { quiz: DailyQuiz }) {
  const { state, update } = useStore();
  const toast = useToast();
  const answered = state.learning.dailyQuiz?.date === quiz.date ? state.learning.dailyQuiz : null;
  const [picked, setPicked] = useState<number | null>(answered?.picked ?? null);
  return (
    <div className="card">
      <div className="bold" style={{ fontSize: 16 }}>{quiz.q}</div>
      <div className="stack" style={{ marginTop: 12 }}>
        {quiz.options.map((o, k) => {
          const st = answered ? (k === quiz.answer ? 'right' : k === answered.picked ? 'wrong' : '') : '';
          return (
            <button key={k} className={`choice-btn quiz-opt ${st}`} style={{ width: '100%', minHeight: 48 }} aria-pressed={picked === k} disabled={!!answered} onClick={() => setPicked(k)}>
              {String.fromCharCode(65 + k)}. {o}
            </button>
          );
        })}
      </div>
      {answered ? (
        <div className={`feedback ${answered.correct ? 'right' : 'wrong'}`}>
          <div className="bold">{answered.correct ? '정답! 오늘 학습 완료' : `정답은 ${String.fromCharCode(65 + quiz.answer)}`}</div>
          <div className="small">{quiz.explain}</div>
        </div>
      ) : (
        <button className="btn primary block" style={{ marginTop: 12 }} disabled={picked === null} onClick={() => {
          const ok = picked === quiz.answer;
          update((s) => answerDailyQuiz(s, quiz.date, picked!, ok));
          toast(ok ? '정답이에요! 잘 이해했어요.' : '학습 기록을 저장했어요. 해설을 확인해 보세요.');
        }}>정답 확인</button>
      )}
    </div>
  );
}


export function Practice() {
  const [intro, setIntro] = useState(true);
  const { state, update } = useStore();
  const nav = useNav();
  const [q, setQ] = useState('');
  const [view, setView] = useState<'all' | 'watch'>('all');
  const p = state.portfolio;
  const allCodes = useMemo(() => INSTRUMENTS.map((i) => i.code), []);
  const m = useLiveQuotes(allCodes);

  const results = useMemo(() => {
    const r = searchInstruments(q);
    return view === 'watch' ? r.filter((i) => p.watchlist.includes(i.code)) : r;
  }, [q, view, p.watchlist]);

  const prices = Object.fromEntries(Object.values(m.quotes).map((x) => [x.code, x.price]));
  const ta = totalAssets(p, prices);
  const pnl = ta.total - p.initialCash;
  const toggleWatch = (code: string) =>
    update((s) => ({ ...s, portfolio: { ...s.portfolio, watchlist: s.portfolio.watchlist.includes(code) ? s.portfolio.watchlist.filter((c) => c !== code) : [...s.portfolio.watchlist, code] } }));
  const pending = p.orders.filter((o) => o.status === 'pending').length;
  const anyQuote = Object.values(m.quotes)[0];

  return (
    <div className="page t-page t-invest">
      <header className="t-head">
        <h1>모의투자</h1>
        <button className="t-head-icon" aria-label="설정" onClick={() => nav.push({ name: 'settings' })}><IconGear /></button>
      </header>

      <div className="t-ticker">
        <span className={`t-mkt ${m.status.state === 'open' ? 'open' : ''}`}><i />{m.status.label}</span>
        {m.kospi && <span className="t-kospi">코스피 <b className="num">{m.kospi.value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}</b> <em className={m.kospi.changePct && m.kospi.changePct > 0 ? 'up' : m.kospi.changePct && m.kospi.changePct < 0 ? 'down' : ''}>{m.kospi.changePct !== null ? signedPct(m.kospi.changePct) : ''}</em></span>}
        {anyQuote && <LiveBadge source={anyQuote.source} live={anyQuote.live} streaming={m.streaming} />}
      </div>

      <section className="t-card t-invest-hero">
        <div className="t-hero-top">
          <span className="t-label">모의 총자산</span>
          <span className="t-badge amber">실제 돈 아님</span>
        </div>
        <strong className="t-hero-num num">{won(ta.total)}</strong>
        <span className={`t-pnl num ${pnl > 0 ? 'up' : pnl < 0 ? 'down' : ''}`}>{pnl === 0 ? '시작 금액 그대로' : `시작 대비 ${signedWon(pnl)} (${signedPct((100 * pnl) / p.initialCash)})`}</span>
        {ta.missing.length > 0 && <p className="t-note">시세를 못 받은 {ta.missing.length}개 종목은 매수가로 계산했어요.</p>}
        <dl className="t-summary">
          <div><dt>현금</dt><dd className="num">{won(p.cash)}</dd></div>
          <div><dt>주문 가능</dt><dd className="num">{won(availableCash(p))}</dd></div>
          <div><dt>주식 평가</dt><dd className="num">{won(ta.stockValue)}</dd></div>
        </dl>
        <div className="t-btn-row">
          <button className="t-btn primary" onClick={() => nav.push({ name: 'portfolio' })}>내 보유·주문{pending ? ` · 대기 ${pending}` : ''}</button>
          <button className="t-btn tonal" onClick={() => nav.push({ name: 'cards' })}>카드뉴스</button>
        </div>
      </section>
      {intro && <div className="t-tip"><span><b>진짜 돈 없이, 투자 감각부터</b>1,000만 원 가상 자금은 홈의 생활비와 따로 관리돼요.</span><button type="button" aria-label="안내 닫기" onClick={() => setIntro(false)}>×</button></div>}

      <section className="t-card t-stocks">
        <label className="t-search">
          <IconSearch width={20} height={20} />
          <span className="sr-only">회사 이름 검색</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="회사 이름이나 ETF 검색" />
        </label>
        <div className="t-chips">
          <button aria-pressed={view === 'all'} onClick={() => setView('all')}>전체</button>
          <button aria-pressed={view === 'watch'} onClick={() => setView('watch')}>관심 {p.watchlist.length}</button>
        </div>
        {m.networkError && <div style={{ marginTop: 10 }}><Notice kind="danger">시세를 불러오지 못했어요. {m.networkError}{m.lastAttempt ? ` (마지막 시도 ${formatKDateTime(m.lastAttempt)})` : ''}</Notice></div>}
        <div className="t-list">
          {results.length === 0 && <Empty title={view === 'watch' ? '관심 종목이 없어요' : '검색 결과가 없어요'}>지원 종목 목록 안에서 찾을 수 있어요.</Empty>}
          {results.map((i) => <StockRow key={i.code} code={i.code} name={i.name} sub={`${i.code} · ${i.type === 'etf' ? 'ETF' : i.sector}`} watched={p.watchlist.includes(i.code)} onWatch={() => toggleWatch(i.code)} />)}
        </div>
        {m.loading && !anyQuote && <div style={{ marginTop: 8 }}><Spinner label="시세 불러오는 중" /></div>}
      </section>
      {anyQuote && <p className="t-foot">{anyQuote.delayNote}{m.lastUpdate ? ` · 마지막 갱신 ${formatKDateTime(m.lastUpdate)}` : ''}</p>}
    </div>
  );
}

function StockRow({ code, name, sub, watched, onWatch }: { code: string; name: string; sub: string; watched: boolean; onWatch: () => void }) {
  const m = useMarket();
  const nav = useNav();
  const qq = m.quotes[code];
  const err = m.errors[code];
  const [flash, setFlash] = useState('');
  const [prev, setPrev] = useState<number | null>(null);
  useEffect(() => {
    if (!qq) return;
    if (prev !== null && qq.price !== prev) {
      setFlash(qq.price > prev ? 'flash-up' : 'flash-down');
      const t = window.setTimeout(() => setFlash(''), 900);
      setPrev(qq.price);
      return () => window.clearTimeout(t);
    }
    setPrev(qq.price);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qq?.price]);
  return (
    <div className="t-stock">
      <button className={`t-star ${watched ? 'on' : ''}`} onClick={onWatch} aria-label={watched ? `${name} 관심 해제` : `${name} 관심 추가`} aria-pressed={watched}>
        <IconStar filled={watched} width={20} height={20} />
      </button>
      <button className="t-stock-main" onClick={() => nav.push({ name: 'stock', code })}>
        <span className="t-row-main"><b>{name}</b><small>{sub}</small></span>
        <span className={`t-stock-price ${flash}`}>
          {qq ? (<><b className="num">{won(qq.price)}</b><ChangeText q={qq} /></>) : err ? <small className="up">시세 오류</small> : m.loading ? <span className="skeleton" style={{ display: 'inline-block', width: 72, height: 16 }} /> : <small className="muted">—</small>}
        </span>
      </button>
    </div>
  );
}



/** 학습 본래 기능(개념→중간 퀴즈→피드백→실습)을 살린 짧은 주제 탐색 화면. */
export function Learn() {
  const { state } = useStore();
  const nav = useNav();
  const [unitId, setUnitId] = useState(1);
  const today = todayKST();
  const completedIds = state.learning.completed;
  const selected = UNITS.find(u=>u.id===unitId) ?? UNITS[0];
  const completed = Object.keys(completedIds).length;
  const total = UNITS.reduce((n,u)=>n+u.lessons.length,0);
  const recommend = UNITS.flatMap(u=>u.lessons).find(l=>!completedIds[l.id]) ?? UNITS[0].lessons[0];
  const quiz = dailyQuizFor(today, recommend.id);
  const labels: {icon: 'chart'|'wallet'|'trend'|'shield'|'piggy'|'target'; tone: 'blue'|'violet'|'teal'|'amber'|'pink'}[] = [
    {icon:'chart',tone:'blue'}, {icon:'wallet',tone:'violet'}, {icon:'trend',tone:'teal'},
    {icon:'shield',tone:'amber'}, {icon:'piggy',tone:'pink'}, {icon:'target',tone:'blue'}
  ];
  const pctDone = total ? Math.round((100 * completed) / total) : 0;
  return <div className="page t-page t-learn">
    <header className="t-head">
      <h1>금융 학습</h1>
      <button className="t-head-icon" aria-label="설정" onClick={() => nav.push({name:'settings'})}><IconGear/></button>
    </header>

    <section className="t-card t-learn-hero">
      <div className="t-learn-progress">
        <div className="t-ring" style={{ ['--p' as string]: `${pctDone}%` }} aria-label={`${total}개 중 ${completed}개 완료`}><b className="num">{pctDone}<small>%</small></b></div>
        <div><span className="t-label">학습 진행</span><strong className="num">{completed} / {total}개 완료</strong><button className="t-link" onClick={()=>nav.push({name:'placement'})}>내 수준 진단하기 <IconChevron width={14}/></button></div>
      </div>
      <button className="t-today" onClick={()=>nav.push({name:'lesson',id:recommend.id})}>
        <span className="t-today-tag">오늘의 학습 · {recommend.minutes}분</span>
        <b>{recommend.title}</b>
        <span className="t-today-flow">개념 → 퀴즈 → 피드백</span>
        <span className="t-today-go">시작하기 <IconChevron width={16}/></span>
      </button>
    </section>

    <section className="t-card">
      <div className="t-card-head"><h2>주제 고르기</h2></div>
      <div className="t-topics">{UNITS.map((u,idx)=>{const done=u.lessons.filter(l=>completedIds[l.id]).length;return <button key={u.id} className={`t-topic ${u.id===unitId?'on':''}`} aria-pressed={u.id===unitId} onClick={()=>setUnitId(u.id)}><IconTile name={labels[idx].icon} tone={labels[idx].tone} size={40}/><b>{u.title}</b><span className="t-topic-bar"><i style={{width:`${(100*done)/u.lessons.length}%`}}/></span><small>{done}/{u.lessons.length}</small></button>})}</div>
    </section>

    <section className="t-card">
      <div className="t-card-head"><div><h2>{selected.title}</h2><p className="t-card-desc">{selected.desc}</p></div></div>
      <div className="t-list">
        {selected.lessons.map((l,i)=><button key={l.id} className="t-row" onClick={()=>nav.push({name:'lesson',id:l.id})}><span className={`t-step ${completedIds[l.id]?'done':''}`}>{completedIds[l.id]?'✓':i+1}</span><span className="t-row-main"><b>{l.title}</b><small>{l.minutes}분 · 설명 + 퀴즈{l.steps.some(s=>s.kind==='practice')?' + 실습':''}</small></span><IconChevron className="t-chev"/></button>)}
      </div>
    </section>

    <section className="t-card t-quiz">
      <div className="t-card-head"><h2>오늘의 퀴즈</h2><span className="t-badge">1문제</span></div>
      <DailyQuizCard quiz={quiz}/>
    </section>

    <button className="t-cta-card" onClick={()=>nav.setTab('invest')}>
      <span className="t-cta-icon violet"><IconChartBars/></span>
      <span className="t-cta-text"><b>배운 걸 바로 써보기</b><small>가상의 1,000만 원으로 사고팔아요</small></span>
      <IconChevron className="t-chev"/>
    </button>
  </div>;
}
