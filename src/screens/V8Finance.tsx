import { useMemo, useState } from 'react';
import { won } from '../../shared/format';
import { addDays, addMonths, parseISO, startOfMonth, todayKST, weekdayOf } from '../../shared/dates';
import { IconChevron, IconGear } from '../components/Icons';
import { Logo } from '../components/Glyph';
import { Won } from '../components/ds';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { WORLD_FIXED_BILLS, WORLD_MONTHLY_INCOME, WORLD_SAFETY_BUFFER, transactWorldWallet, type WorldWalletAction } from '../lib/worldWallet';
import { Sheet } from '../components/ui';
import { worldHistory } from '../lib/worldHistory';
import { useWallet } from '../state/wallet';
import { Row, useSpending } from './Ledger';
import { INSTRUMENT_BY_CODE } from '../../shared/instruments';
import { AiCard, AiMark } from '../components/Ai';
import { useAi } from '../lib/ai';
import { briefInput } from '../lib/ai/context';

const fmt = (n: number) => won(Math.max(0, Math.round(n)));
const pct = (n: number, t: number) => (t > 0 ? (100 * n) / t : 0);
const WD = ['일', '월', '화', '수', '목', '금', '토'];

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

export function TopHeader({ title, sub, logo = false }: { title: string; sub?: string; logo?: boolean }) {
  const nav = useNav();
  return (
    <header className="t-head">
      <div>
        <h1 className={logo ? 'with-logo' : ''}>{logo && <Logo size={26} />}{title}</h1>
        {sub && <p className="t-head-sub">{sub}</p>}
      </div>
      <button aria-label="설정 열기" className="t-head-icon" onClick={() => nav.push({ name: 'settings' })}><IconGear /></button>
    </header>
  );
}

function AssetRow({ kind, title, detail, amount, onClick }: { kind: AvatarKind; title: string; detail: string; amount: number; onClick: () => void }) {
  return (
    <button className="t-row" onClick={onClick}>
      <TAvatar kind={kind} />
      <span className="t-row-main"><b>{title}</b><small>{detail}</small></span>
      <span className="t-row-amt num">{fmt(amount)}</span>
    </button>
  );
}

/** 오늘의 AI 브리핑 + 물어보기 */
function HomeBrief() {
  const { state } = useStore();
  const nav = useNav();
  const { all, today } = useSpending();
  const input = useMemo(() => briefInput(state.worldWallet, all, today), [state.worldWallet, all, today]);
  const ai = useAi('brief', input, JSON.stringify(input));
  const go = (to: 'choose' | 'ledger' | 'save' | 'forks') => (to === 'choose' ? nav.push({ name: 'choose' }) : nav.setTab(to));
  return (
    <AiCard title="오늘의 브리핑" loading={ai.loading} source={ai.source} tone="dark" className="t-brief" foot={false}>
      {ai.data && <>
        <strong className="ai-headline">{ai.data.headline}</strong>
        <p className="ai-body">{ai.data.body}</p>
        <div className="ai-row">
          {ai.data.action && <button type="button" className="ai-btn" onClick={() => go(ai.data!.action!.to)}>{ai.data.action.label}</button>}
          <button type="button" className="ai-btn ghost" onClick={() => nav.push({ name: 'ask' })}><AiMark label="" />물어보기</button>
        </div>
      </>}
    </AiCard>
  );
}

function HomeSpend() {
  const nav = useNav();
  const { all, today } = useSpending();
  const month = startOfMonth(today);
  const total = all.filter((e) => e.date >= month).reduce((s, e) => s + e.amount, 0);
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const perDay = week.map((d) => all.filter((e) => e.date === d).reduce((s, e) => s + e.amount, 0));
  const max = Math.max(1, ...perDay);
  return (
    <section className="t-card">
      <button className="t-card-head as-link" onClick={() => nav.setTab('ledger')}>
        <h2>가계부</h2><span className="t-more">전체 보기<IconChevron /></span>
      </button>
      {all.length ? (
        <>
          <button className="t-spend-top" onClick={() => nav.setTab('ledger')}>
            <span>
              <small>{parseISO(today).m}월에 쓴 돈</small>
              <strong className="num">{won(total)}</strong>
            </span>
            <span className="t-bars" aria-label="최근 7일 지출">
              {perDay.map((v, i) => (
                <span key={week[i]} className={i === 6 ? 'today' : ''}>
                  <i style={{ height: `${Math.max(8, (100 * v) / max)}%` }} />
                  <small>{i === 6 ? '오늘' : WD[weekdayOf(week[i])]}</small>
                </span>
              ))}
            </span>
          </button>
          <div className="t-spend-list">{all.slice(0, 3).map((e, i) => <Row key={i} e={e} showDate />)}</div>
        </>
      ) : (
        <p className="t-empty">아직 기록된 지출이 없어요.</p>
      )}
    </section>
  );
}

export function V8Home() {
  const { state } = useStore();
  const nav = useNav();
  const { summary: w, wallet } = useWallet();
  const held = Object.entries(wallet.etfs || {}).filter(([, h]) => h.qty > 0);
  const etfDetail = held.length ? held.map(([c, h]) => `${INSTRUMENT_BY_CODE[c]?.name ?? c} ${h.qty}주`).join(' · ') : '모의투자와 같은 ETF로 연습';
  const gap = useMemo(() => { const p = worldHistory(state.worldWallet, 30); return p[p.length - 1]?.gap ?? 0; }, [state.worldWallet]);
  const choices = state.worldWallet.decisions.length;
  const [how, setHow] = useState(false);
  const usable = Math.max(0, w.monthlyUsable);
  const cashBase = Math.max(1, WORLD_FIXED_BILLS + WORLD_SAFETY_BUFFER + usable);
  const assetRows = [
    { key: 'cash', label: '현금', v: w.cash, c: 'var(--moa)' },
    { key: 'save', label: '자유 저축', v: w.freeSavings, c: '#9B9AFA' },
    { key: 'deposit', label: '예금', v: w.deposit, c: '#19B6A0' },
    { key: 'install', label: '적금', v: w.installment, c: 'var(--coin)' },
    { key: 'stocks', label: 'ETF', v: w.stockValue, c: 'var(--ink)' },
  ].filter((r) => r.v > 0);

  return (
    <div className="page t-page t-home">
      <TopHeader title="모아" logo />

      <HomeBrief />

      {/* ── 이번 달 쓸 수 있는 돈 ── */}
      <section className="t-card t-hero">
        <div className="t-hero-top">
          <span className="t-label">이번 달 쓸 수 있는 돈</span>
          <span className="t-badge">가상</span>
        </div>
        <strong className="t-hero-num num"><Won n={usable} /></strong>
        <div className="t-meter" role="img" aria-label={`현금 ${fmt(w.cash)} 중 결제 예정 ${fmt(WORLD_FIXED_BILLS)}, 생활비 안전선 ${fmt(WORLD_SAFETY_BUFFER)}, 쓸 수 있는 돈 ${fmt(usable)}`}>
          <span className="m-bill" style={{ width: `${pct(WORLD_FIXED_BILLS, cashBase)}%` }} />
          <span className="m-safe" style={{ width: `${pct(WORLD_SAFETY_BUFFER, cashBase)}%` }} />
          <span className="m-free" style={{ width: `${Math.max(2, pct(usable, cashBase))}%` }} />
        </div>
        <dl className="t-meter-key">
          <div><dt><i className="m-bill" />월세·통신비 등 결제 예정</dt><dd className="num">{fmt(WORLD_FIXED_BILLS)}</dd></div>
          <div><dt><i className="m-safe" />지켜둘 생활비</dt><dd className="num">{fmt(WORLD_SAFETY_BUFFER)}</dd></div>
          <div><dt><i className="m-free" />자유롭게 쓸 수 있는 돈</dt><dd className="num strong">{fmt(usable)}</dd></div>
        </dl>
        <button type="button" className="t-how" onClick={() => setHow(true)}>어떻게 계산했어요?</button>
        <button className="t-btn primary" onClick={() => nav.push({ name: 'choose' })}>사기 전에 두 세계 비교하기</button>
      </section>
      {how && (
        <Sheet title="쓸 수 있는 돈 계산" onClose={() => setHow(false)}>
          <dl className="ob-calc t-how-calc">
            <div><dt>지금 가상 계좌 현금</dt><dd className="num">{fmt(w.cash)}</dd></div>
            <div><dt>{Number(addMonths(startOfMonth(todayKST()), 1).slice(5, 7))}월 1일 나갈 월세·통신비</dt><dd className="num">−{fmt(WORLD_FIXED_BILLS)}</dd></div>
            <div><dt>지켜둘 생활비</dt><dd className="num">−{fmt(WORLD_SAFETY_BUFFER)}</dd></div>
            <div className="total"><dt>이번 달 쓸 수 있는 돈</dt><dd className="num">{w.monthlyUsable < 0 ? '−' : ''}{fmt(Math.abs(w.monthlyUsable))}</dd></div>
          </dl>
          <p className="t-how-note">저축·예금·투자로 옮긴 돈은 사라진 게 아니라 '쓸 수 있는 돈'에서만 빠져요. 매달 1일에 고정지출이 나가고 월급 {fmt(WORLD_MONTHLY_INCOME)}이 들어와요.</p>
        </Sheet>
      )}

      {/* ── 평행세계 티저 ── */}
      <button className="t-portal" onClick={() => nav.setTab('forks')}>
        <span className="t-portal-text">
          <small>다르게 선택해서 지킨 돈</small>
          <strong className="num"><Won n={Math.abs(gap)} sign={gap >= 0 ? '+' : '−'} /></strong>
          <em>{choices}번의 선택 · 평행세계 보기 <IconChevron /></em>
        </span>
        <svg className="v17-mini-fork" width="96" height="56" viewBox="0 0 96 56" aria-hidden="true">
          <path d="M4 28 C 34 28, 58 8, 88 8" fill="none" stroke="#8D8CFF" strokeWidth="3" strokeLinecap="round" />
          <path d="M4 28 C 34 28, 58 46, 88 46" fill="none" stroke="#FF4F6E" strokeWidth="3" strokeLinecap="round" />
          <circle cx="4" cy="28" r="4" fill="#fff" /><circle cx="88" cy="8" r="4.5" fill="#8D8CFF" /><circle cx="88" cy="46" r="4.5" fill="#FF4F6E" />
        </svg>
      </button>

      {/* ── 내 자산 ── */}
      <section className="t-card">
        <div className="t-card-head"><h2>내 가상 자산</h2></div>
        <strong className="t-big num"><Won n={w.totalAssets} /></strong>
        <div className="t-stack" role="img" aria-label={assetRows.map((r) => `${r.label} ${fmt(r.v)}`).join(', ')}>
          {assetRows.map((r) => <span key={r.key} style={{ width: `${pct(r.v, w.totalAssets)}%`, background: r.c }} />)}
        </div>
        <div className="t-stack-key">
          {assetRows.map((r) => <span key={r.key}><i style={{ background: r.c }} />{r.label} {Math.round(pct(r.v, w.totalAssets))}%</span>)}
        </div>
        <div className="t-list">
          <AssetRow kind="cash" title="현금 · 가상 계좌" detail="결제 예정금 포함" amount={w.cash} onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })} />
          <AssetRow kind="saving" title="자유 저축" detail="언제든 꺼낼 수 있어요" amount={w.freeSavings} onClick={() => nav.setTab('save')} />
          <AssetRow kind="deposit" title="가상 정기예금" detail="목돈을 묶어두는 연습" amount={w.deposit} onClick={() => nav.setTab('save')} />
          <AssetRow kind="installment" title="가상 적금" detail="매달 조금씩 모으기" amount={w.installment} onClick={() => nav.setTab('save')} />
          <AssetRow kind="invest" title="생활비로 산 ETF" detail={etfDetail} amount={w.stockValue} onClick={() => nav.push({ name: 'budgetInvest' })} />
        </div>
      </section>

      <HomeSpend />

      <p className="t-foot">모든 금액은 학습용 가상 데이터예요. 실제 금융사와 연동하지 않아요.</p>
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
