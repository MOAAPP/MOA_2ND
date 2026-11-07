import { ShortfallCard } from './moa/parts';
import { HomeIntelligence } from '../components/HomeIntelligence';
import { HomeMoney } from '../components/HomeMoney';
import { HomeCompare } from '../components/HomeCompare';
import { useHomeFinance } from '../lib/homeFinance';
import { QuickExpense } from '../components/QuickExpense';
import { useMemo, useState } from 'react';
import { won } from '../../shared/format';
import { addDays, parseISO, startOfMonth } from '../../shared/dates';
import { appDay, appNow, DEMO_END_DAY, DEMO_SNAPSHOT_DAY } from '../lib/appClock';
import { IconChevron, IconGear } from '../components/Icons';
import { Logo } from '../components/Glyph';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { transactWorldWallet, type WorldWalletAction } from '../lib/worldWallet';
import { worldHistory } from '../lib/worldHistory';
import { useWallet } from '../state/wallet';
import { Row, useSpending } from './Ledger';

const fmt = (n: number) => won(Math.max(0, Math.round(n)));

type AvatarKind = 'cash' | 'saving' | 'deposit' | 'installment' | 'invest';
const AVATAR: Record<AvatarKind, { tone: string; glyph: JSX.Element }> = {
  cash: { tone: 'blue', glyph: <svg viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10.5h18" /></svg> },
  saving: { tone: 'green', glyph: <svg viewBox="0 0 24 24"><path d="M5 16 10 11l3 3 6-6" /><path d="M15 8h4v4" /></svg> },
  deposit: { tone: 'sky', glyph: <svg viewBox="0 0 24 24"><rect x="5" y="10" width="14" height="10" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg> },
  installment: { tone: 'amber', glyph: <svg viewBox="0 0 24 24"><path d="M5 19h14M7 15v4M12 11v8M17 7v12" /></svg> },
  invest: { tone: 'violet', glyph: <svg viewBox="0 0 24 24"><path d="M4 18 9 12l4 3 7-8" /><circle cx="20" cy="7" r="1.4" /></svg> },
};
export function TAvatar({ kind }: { kind: AvatarKind }) {
  const a = AVATAR[kind];
  return <span className={`t-avatar ${a.tone}`} aria-hidden="true">{a.glyph}</span>;
}

export function TopHeader({ title, sub, logo = false, quickAdd = false }: { title: string; sub?: string; logo?: boolean; quickAdd?: boolean }) {
  const nav = useNav();
  return (
    <header className="t-head">
      <div>
        <h1 className={logo ? 'with-logo' : ''}>{logo && <Logo size={26} />}{title}</h1>
        {sub && <p className="t-head-sub">{sub}</p>}
      </div>
      <div className="ux-home-header-actions">
        {quickAdd && <button type="button" className="ux-home-header-add" aria-label="바로 지출 기록"
          onClick={() => {
            const input = document.querySelector<HTMLInputElement>('#quick-expense-home');
            input?.scrollIntoView({ behavior: 'smooth', block: 'center' });
            input?.focus({ preventScroll: true });
          }}>＋ 기록</button>}
        <button aria-label="설정 열기" className="t-head-icon" onClick={() => nav.push({ name: 'settings' })}><IconGear /></button>
      </div>
    </header>
  );
}

/** Home block 02 — the everyday action: one line, one tap, totals update in place. */
function HomeSpend() {
  const nav = useNav();
  const { all, today } = useSpending();
  const { state } = useStore();
  const todayItems = all.filter(e => e.date === today);
  const todayTotal = todayItems.reduce((s, e) => s + e.amount, 0);
  const monthTotal = all.filter(e => e.date >= startOfMonth(today) && e.date <= today)
    .reduce((s, e) => s + e.amount, 0);
  const completedZero = !todayItems.length && state.moa.dayStatus[today] === 'self';
  const d = parseISO(today);
  return (
    <section className="v23-block v23-spend" aria-labelledby="v23-spend-title">
      <div className="v23-block-head">
        <h2 id="v23-spend-title">오늘 쓴 돈</h2>
        <span className="v23-muted">{d.m}월 {d.d}일</span>
      </div>
      <QuickExpense compact />
      <div className="v23-spend-totals">
        <div><span>오늘</span><b className="num">{won(todayTotal)}</b><small>{todayItems.length ? `${todayItems.length}건` : completedZero ? '지출 없음' : '아직 기록 없음'}</small></div>
        <div><span>이번 달</span><b className="num">{won(monthTotal)}</b><small>고정비 포함</small></div>
      </div>
      {todayItems.length > 0 && (
        <div className="v23-spend-list">
          {todayItems.slice(-3).reverse().map((e, i) => <Row key={e.txnId ?? i} e={e} />)}
        </div>
      )}
      <button type="button" className="v23-textlink" onClick={() => nav.setTab('ledger')}>
        {todayItems.length > 3 ? `오늘 내역 ${todayItems.length}건 모두 보기` : '가계부에서 고치거나 자세히 보기'} <IconChevron />
      </button>
    </section>
  );
}

/**
 * Presenter/developer date control. On a phone it is a single compact row;
 * on wide screens it sits outside the phone column so the product UI stays clean.
 */
function DemoDayBar() {
  const { state, update } = useStore();
  if (!state.demo) return null;
  const day = appDay(state);
  const date = parseISO(day);
  const change = (next: string) => {
    if (next < DEMO_SNAPSHOT_DAY || next > DEMO_END_DAY) return;
    update(s => ({ ...s, demoDay: next }));
  };
  const future = day > DEMO_SNAPSHOT_DAY;
  return (
    <aside className="v23-devbar" aria-label="체험 기준일 (시연용)">
      <span className="v23-devbar-label">체험 S01</span>
      <b>{date.m}월 {date.d}일</b>
      {future && <span className="v23-tag assume">가정</span>}
      <span className="v23-devbar-actions">
        <button type="button" aria-label="시연 날짜 하루 전" disabled={day <= DEMO_SNAPSHOT_DAY} onClick={() => change(addDays(day, -1))}>‹</button>
        <button type="button" aria-label="시연 날짜 하루 뒤" disabled={day >= DEMO_END_DAY} onClick={() => change(addDays(day, 1))}>›</button>
        {future && <button type="button" className="reset" onClick={() => change(DEMO_SNAPSHOT_DAY)}>기준일</button>}
      </span>
      {future && <p>11월 5일부터는 아직 일어나지 않은 날이에요. 새 거래는 기록되지 않고, 잔액 분석은 11월 4일 기록 기준이에요.</p>}
      {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1' && <a className="ux-home-demo-exit" href="/">내 기록으로 돌아가기</a>}
    </aside>
  );
}

function WorldSummary() {
  const nav = useNav();
  const { state } = useStore();
  const { wallet: walletData } = useWallet();
  const when = appNow(state);
  const gap = useMemo(() => worldHistory(walletData, 30, when).at(-1)?.gap ?? 0, [walletData, when]);
  const decisions = walletData.decisions.filter(d => d.at <= when);
  const latest = decisions.at(-1);
  return (
    <section className="v23-block v23-world" aria-labelledby="v23-world-title">
      <div className="v23-block-head">
        <h2 id="v23-world-title">나의 평행세계</h2>
        <span className="v23-tag virtual">가상</span>
      </div>
      {decisions.length ? (
        <button type="button" className="v23-world-row" onClick={() => nav.setTab('forks')}>
          <span className="v23-world-copy">
            <small>선택 {decisions.length}건을 모두 정가로 샀을 때와의 차이</small>
            <strong className="num">{gap >= 0 ? '+' : '−'}{won(Math.abs(gap))}</strong>
            {latest && <small>최근 · {latest.title} · {latest.choice === 'buy' ? '구매' : latest.choice === 'wait' ? '보류' : '대안 선택'}</small>}
          </span>
          <svg viewBox="0 0 112 70" aria-hidden="true" className="v23-world-fork">
            <path className="real" d="M8 35 C39 35 58 19 105 14" />
            <path className="alt" d="M8 35 C39 35 58 48 105 58" />
            <circle cx="8" cy="35" r="4" />
          </svg>
          <IconChevron />
        </button>
      ) : <p className="v23-muted">아직 남긴 선택이 없어요. 위에서 비교한 뒤 기록하면 두 갈래 길이 생겨요.</p>}
    </section>
  );
}

export function V8Home() {
  const { state } = useStore();
  const fin = useHomeFinance('S01', DEMO_SNAPSHOT_DAY, state.demo);
  return (
    <div className="page t-page t-home ux-home v23-home">
      <TopHeader title="모아" logo quickAdd />
      <DemoDayBar />

      {/* 01 · 결제계좌: 실제 기록 / 예상 / 확정 일정을 구분 */}
      {state.demo ? <HomeMoney fin={fin} /> : <>
        <HomeIntelligence />
        {/* Manual account keeps its own on-device schedule; never mixed with S01. */}
        <div className="ux-home-risk" aria-label="다가오는 결제일 상태"><ShortfallCard /></div>
      </>}

      {/* 02 · 오늘 지출 한 줄 기록 */}
      <HomeSpend />

      {/* 03 · 필요할 때만: 사기 전 비교 */}
      {state.demo
        ? <HomeCompare user="S01" asOf={DEMO_SNAPSHOT_DAY} cash={fin.home?.available_cash ?? null} />
        : <ManualCompareEntry />}

      {/* 04 · 평행세계 누적 차이 → 움직이는 그래프 */}
      <WorldSummary />

      <p className="ux-home-legal">은행과 자동 연결되지 않아요. 평행세계·가상 저축·모의투자 금액은 결제계좌 잔액과 합산하지 않아요.</p>
    </div>
  );
}

function ManualCompareEntry() {
  const nav = useNav();
  return (
    <section className="v23-block v23-compare" aria-labelledby="v23-compare-title">
      <span className="v23-eyebrow">사기 전에</span>
      <h2 id="v23-compare-title">이거 사면, 다음 결제일은 괜찮을까?</h2>
      <p className="v23-muted">금액 하나로 사는 경우와 안 사는 경우를 비교해요. 기록하기 전에는 잔액이 바뀌지 않아요.</p>
      <button type="button" className="v23-btn primary" onClick={() => nav.push({ name: 'choose' })}>사기 전 비교하기</button>
      <button type="button" className="v23-textlink" onClick={() => nav.push({ name: 'newChoice' })}>상품 캡처로 가격 불러오기 ›</button>
    </section>
  );
}

function useAction() {
  const { state, update } = useStore();
  const priced = useWallet().summary;
  const [toast, setToast] = useState('');
  const action = (a: WorldWalletAction, success: string) => {
    if (!transactWorldWallet(state.worldWallet, a)) { setToast('이번 달 쓸 수 있는 돈 또는 모은 금액이 부족해요.'); return; }
    update((s) => { const w = transactWorldWallet(s.worldWallet, a); return w ? { ...s, worldWallet: w } : s; });
    setToast(success);
  };
  return { w: priced, action, toast };
}

const SAVINGS_TABS = [{ key: 'free', label: '자유 저축' }, { key: 'deposit', label: '예금' }, { key: 'installment', label: '적금' }] as const;
type SavingsKind = typeof SAVINGS_TABS[number]['key'];

export function V8Savings() {
  const { w, action, toast } = useAction();
  const [kind, setKind] = useState<SavingsKind>('deposit');
  const [amount, setAmount] = useState(10000);
  const [months, setMonths] = useState(6);
  const cfg = ({
    free: { title: '자유 저축', desc: '쓰지 않을 돈을 따로 떼어두는 연습이에요', v: w.freeSavings, add: 'save', del: 'withdraw', avatar: 'saving' },
    deposit: { title: '정기예금', desc: '목돈을 묶어두면 이번 달 쓸 돈이 줄어들어요', v: w.deposit, add: 'deposit', del: 'redeemDeposit', avatar: 'deposit' },
    installment: { title: '적금', desc: '매달 같은 금액을 모으는 습관을 연습해요', v: w.installment, add: 'installment', del: 'cancelInstallment', avatar: 'installment' },
  } as const)[kind];
  const interest = kind === 'deposit' ? amount * 0.03 * (months / 12) : kind === 'installment' ? (amount * 0.03 * months * (months + 1)) / 24 : 0;
  const after = w.monthlyUsable - amount;
  const over = amount > w.monthlyUsable;

  return (
    <div className="page t-page t-save">
      <TopHeader title="예금 · 적금" />

      <section className="t-card t-save-hero">
        <span className="t-label">모은 돈</span>
        <strong className="t-hero-num num">{fmt(w.savings)}</strong>
        <div className="t-save-split">
          <div><small>자유 저축</small><b className="num">{fmt(w.freeSavings)}</b></div>
          <div><small>예금</small><b className="num">{fmt(w.deposit)}</b></div>
          <div><small>적금</small><b className="num">{fmt(w.installment)}</b></div>
        </div>
      </section>

      <div className="t-seg" role="tablist" aria-label="저축 유형">
        {SAVINGS_TABS.map((t) => <button key={t.key} role="tab" aria-selected={kind === t.key} onClick={() => setKind(t.key)}>{t.label}</button>)}
      </div>

      <section className="t-card">
        <div className="t-product">
          <TAvatar kind={cfg.avatar} />
          <div><h2>가상 {cfg.title}</h2><p>{cfg.desc}</p></div>
        </div>

        <div className="t-field">
          <label htmlFor="t-amount">얼마를 옮길까요?</label>
          <div className="t-amount-input">
            <input id="t-amount" inputMode="numeric" type="text" value={amount ? amount.toLocaleString('ko-KR') : ''} placeholder="0" onChange={(e) => setAmount(Math.min(100_000_000, Number(e.target.value.replace(/[^0-9]/g, '')) || 0))} />
            <span>원</span>
          </div>
          <div className="t-quick">
            {[5000, 10000, 30000].map((v) => <button key={v} aria-pressed={amount === v} onClick={() => setAmount(v)}>{v / 10000 >= 1 ? `${v / 10000}만` : `${v / 1000}천`}원</button>)}
            <button onClick={() => setAmount(Math.max(0, w.monthlyUsable))}>최대</button>
          </div>
          {over && <p className="t-error">이번 달 쓸 수 있는 돈({fmt(w.monthlyUsable)})보다 많아요.</p>}
        </div>

        {kind !== 'free' && (
          <div className="t-field">
            <label>기간</label>
            <div className="t-seg sm">
              {[3, 6, 12].map((m) => <button key={m} aria-pressed={months === m} onClick={() => setMonths(m)}>{m}개월</button>)}
            </div>
          </div>
        )}

        <dl className="t-summary">
          {kind !== 'free' && <div><dt>예상 이자 <small>연 3% 가정</small></dt><dd className="num pos">+{fmt(interest)}</dd></div>}
          <div><dt>옮긴 뒤 이번 달 쓸 수 있는 돈</dt><dd className={`num ${after < 0 ? 'neg' : ''}`}>{after < 0 ? '−' : ''}{fmt(Math.abs(after))}</dd></div>
          <div><dt>현재 모은 원금</dt><dd className="num">{fmt(cfg.v)}</dd></div>
        </dl>

        <button className="t-btn primary" disabled={amount <= 0 || over} onClick={() => action({ type: cfg.add, amount }, `${cfg.title}에 ${fmt(amount)}을 옮겼어요.`)}>
          {amount > 0 ? `${fmt(amount)} 넣기` : '금액을 입력해 주세요'}
        </button>
        {cfg.v > 0 && (
          <button className="t-btn ghost" onClick={() => action({ type: cfg.del, amount: Math.min(cfg.v, amount || cfg.v) }, `${fmt(Math.min(cfg.v, amount || cfg.v))}을 현금으로 돌렸어요.`)}>
            현금으로 돌려놓기
          </button>
        )}
        {toast && <p className="t-toast" role="status">{toast}</p>}
      </section>

      <section className="t-card t-two-worlds">
        <div className="t-card-head"><h2>이 돈의 두 갈래 길</h2></div>
        <div className="t-fork">
          <div className="t-fork-side">
            <small>그냥 두면</small>
            <b className="num">{fmt(w.monthlyUsable)}</b>
            <span>이번 달 바로 쓸 수 있지만 모인 돈은 그대로</span>
          </div>
          <div className="t-fork-side on">
            <small>{cfg.title}에 넣으면</small>
            <b className="num">{fmt(Math.max(0, after))}</b>
            <span>{fmt(amount)}은 사라지지 않고 {cfg.title}로 이동{kind !== 'free' ? ` · ${months}개월 뒤 +${fmt(interest)}` : ''}</span>
          </div>
        </div>
      </section>

      <p className="t-foot">단순 이자 예시예요. 세금·우대금리·중도해지 조건은 반영하지 않았고 실제 상품이 아니에요.</p>
    </div>
  );
}
