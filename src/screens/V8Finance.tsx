import { ShortfallCard } from './moa/parts';
import { HomeIntelligence } from '../components/HomeIntelligence';
import { HomeGoalExplorer } from '../components/HomeGoalExplorer';
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

/** Daily ledger is the second screen priority, immediately below payment risk. */
function HomeSpend() {
  const nav = useNav();
  const { all, today } = useSpending();
  const { state } = useStore();
  const todayItems = all.filter(e => e.date === today);
  const todayTotal = todayItems.reduce((s, e) => s + e.amount, 0);
  const monthTotal = all.filter(e => e.date >= startOfMonth(today) && e.date <= today)
    .reduce((s, e) => s + e.amount, 0);
  const completedZero = !todayItems.length && state.moa.dayStatus[today] === 'self';
  return (
    <section className="ux-home-ledger" aria-label="오늘의 가계부">
      <header className="ux-home-section-heading">
        <div><small className="ux-home-overline">TODAY · 기록한 소비</small><h2>오늘의 가계부</h2></div>
        <span className="ux-home-date">{parseISO(today).m}월 {parseISO(today).d}일</span>
      </header>
      <QuickExpense compact />
      {todayItems.length ? (
        <>
          <div className="ux-home-today-number">
            <strong className="num">−{won(todayTotal)}</strong>
            <span>기록 {todayItems.length}건</span>
          </div>
          <div className="ux-home-ledger-items">
            {todayItems.slice(0, 3).map((e, i) => <Row key={e.txnId ?? i} e={e} />)}
          </div>
        </>
      ) : (
        <div className="ux-home-empty">
          <strong>{completedZero ? '오늘은 지출 없음으로 기록했어요' : '오늘 등록된 소비 내역이 없어요'}</strong>
          <p>{completedZero ? '새 지출이 생겼다면 언제든 추가할 수 있어요.' : '아직 입력하지 않은 날일 수 있어요. 0원 소비로 확정하지 않았어요.'}</p>
        </div>
      )}
      <div className="ux-home-ledger-bottom">
        <span>이번 달 기록된 지출 <b className="num">{won(monthTotal)}</b></span>
        <small>고정비 포함 · 입력한 기록 기준</small>
      </div>
      <div className="ux-home-ledger-actions">
        <button type="button" onClick={() => nav.setTab('ledger')}>오늘 내역 보기 <IconChevron /></button>
        <button type="button" onClick={() => nav.push({ name: 'ledgerAdd' })}>＋ 지출 추가하기</button>
      </div>
    </section>
  );
}

function DemoDayBar() {
  const { state, update } = useStore();
  if (!state.demo) return null;
  const day = appDay(state);
  const date = parseISO(day);
  const change = (next: string) => {
    if (next < DEMO_SNAPSHOT_DAY || next > DEMO_END_DAY) return;
    update(s => ({ ...s, demoDay: next }));
  };
  return (
    <div className="ux-home-demo-clock" aria-label="가상 시연 기준일">
      <div><span>가상 체험 · S01</span><b>{date.m}월 {date.d}일 기준</b></div>
      <div className="ux-home-demo-clock-actions">
        <button type="button" aria-label="시연 날짜 하루 전" disabled={day <= DEMO_SNAPSHOT_DAY} onClick={() => change(addDays(day, -1))}>‹</button>
        <button type="button" aria-label="시연 날짜 하루 뒤" disabled={day >= DEMO_END_DAY} onClick={() => change(addDays(day, 1))}>›</button>
        {day !== DEMO_SNAPSHOT_DAY && <button type="button" className="reset" onClick={() => change(DEMO_SNAPSHOT_DAY)}>기준일</button>}
      </div>
      <p>{day > DEMO_SNAPSHOT_DAY ? '11월 4일 이후는 가정 시나리오예요. 새로운 날짜의 거래는 아직 기록되지 않았어요.' : '11월 4일까지 관측된 합성 기록을 보여줘요. 날짜를 넘겨도 과거 기록은 유지돼요.'}</p>
      {typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('demo') === '1' && <a className="ux-home-demo-exit" href="/">내 기록으로 돌아가기</a>}
    </div>
  );
}

export function V8Home() {
  const { state } = useStore();
  const nav = useNav();
  const { wallet: walletData } = useWallet();
  const when = appNow(state);
  const gap = useMemo(() => {
    const points = worldHistory(walletData, 30, when);
    return points.at(-1)?.gap ?? 0;
  }, [walletData, when]);
  const decisions = walletData.decisions.filter(d => d.at <= when);
  const latest = decisions.at(-1);
  return (
    <div className="page t-page t-home ux-home">
      <TopHeader title="모아" logo sub="결제일을 살펴보고, 내 선택의 미래를 비교해요" quickAdd />
      <DemoDayBar />

      {/* 01 · Visible AI briefing and user-facing cashflow from one source. */}
      <HomeIntelligence />
      {/* The manual account's own on-device payment schedule stays separate
          from S01 FastAPI data: never mix two conflicting cash balances. */}
      {!state.demo && <div className="ux-home-risk" aria-label="다가오는 결제일 상태"><ShortfallCard /></div>}

      {/* 02 · The everyday action: enter one expense immediately. */}
      <HomeSpend />

      {/* 03 · Optional exploration only when the user is considering a purchase. */}
      <section className="ux-home-decision" aria-label="소비 선택 비교하기">
        <small className="ux-home-overline">필요할 때 비교하기</small>
        <h2>이 돈, 지금 써도 괜찮을까?</h2>
        <p>{state.demo
          ? '금액을 선택하면 AI가 다음 결제일까지의 선택지를 비교해요.'
          : '금액 하나로 구매와 보류를 비교해요. 기록하기 전에는 잔액을 바꾸지 않아요.'}</p>
        {state.demo && <HomeGoalExplorer />}
        <div className="ux-home-decision-links">
          {state.demo ? (
            <button type="button" className="ux-home-decision-link" onClick={() => nav.push({ name: 'choose' })}>
              금액만 입력해서 비교하기 <IconChevron />
            </button>
          ) : (
            <button type="button" className="ux-home-primary" onClick={() => nav.push({ name: 'choose' })}>
              구매 전 결과 비교하기 <span aria-hidden="true">→</span>
            </button>
          )}
          <button type="button" className="ux-home-capture" onClick={() => nav.push({ name: 'newChoice' })}>
            <span aria-hidden="true">▧</span> 상품 캡처로 입력하기 <IconChevron />
          </button>
        </div>
      </section>

      {/* 04 · Preserve the original gestural WorldTimeline without changing its charts. */}
      <section className="ux-home-world" aria-label="평행세계 비교 결과">
        <div className="ux-home-section-heading">
          <div><small className="ux-home-overline">선택으로 달라지는 미래</small><h2>나의 평행세계</h2></div>
          <span className="ux-home-virtual">가상 선택 기록</span>
        </div>
        {decisions.length ? (
          <div className="ux-home-world-comparison">
            <div><span>기록한 선택 {decisions.length}건의 누적 비교 차이</span>
              <strong className="num">{gap >= 0 ? '+' : '−'}{won(Math.abs(gap))}</strong>
              <small>모든 선택을 정가로 구매한 경우와의 차이 · 실제 통장 잔액 아님</small>
            </div>
            <svg viewBox="0 0 112 70" role="img" aria-label="같은 지점에서 갈라지는 두 가상 경로">
              <path d="M8 35 C39 35 58 19 105 14" fill="none" stroke="#545DE8" strokeWidth="3.5" strokeLinecap="round" />
              <path d="M8 35 C39 35 58 48 105 58" fill="none" stroke="#8993A8" strokeDasharray="5 5" strokeWidth="2.5" strokeLinecap="round" />
              <circle cx="8" cy="35" r="4" fill="#545DE8"/>
              <circle cx="105" cy="14" r="4" fill="#545DE8"/>
              <circle cx="105" cy="58" r="3.5" fill="#8993A8"/>
            </svg>
          </div>
        ) : <p className="ux-home-muted">비교한 선택이 아직 없어요. 선택을 남기면 두 경로가 나타나요.</p>}
        {latest && <p className="ux-home-recent-choice">최근 선택 · {latest.title} · {latest.choice === 'buy' ? '구매' : latest.choice === 'wait' ? '보류' : '대안 선택'}</p>}
        <button type="button" className="ux-home-textlink" onClick={() => nav.setTab('forks')}>움직이는 그래프로 비교하기 <IconChevron /></button>
      </section>

      <p className="ux-home-legal">결제계좌는 입력하거나 합성한 잔액 기준으로 예측해요. 은행과 자동 연결되지 않으며, 평행세계·모의투자 기록은 실제 돈과 합산하지 않아요.</p>


    </div>
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
