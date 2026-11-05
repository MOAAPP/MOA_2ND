import { createContext, useContext, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

import { useNav } from '../state/nav';
import { Logo } from './Glyph';
import { Stage3AiAgent, Stage3DailyQuiz } from './Stage3Ai';
import { AiMark } from './Ai';
import { HomeWorldPreview } from './HomeWorldPreview';
import { Stage2Vision } from './Stage2Vision';
import {
  compareScenarios, getDemoDefault, getDemoHome, getDemoUsers, getInstruments, getTransactions, saveScenario,
  type CompareRequest, type CompareResult, type HomeState, type Instrument,
  type LedgerTransaction, type ScenarioPath,
} from '../lib/stage3Api';
import { getMorningBriefing, getSavedPlans, getAssetNews, getSavedPlanTracking,
  type MorningBriefing, type SavedPlan, type PlanTracking } from '../lib/stage6Api';

/* ───────────────────────── 표시 형식 ───────────────────────── */

/** 금액 문자열. 음수는 타이포그래피 마이너스(−)를 쓴다. */
export function balanceText(amount: number) {
  const r = Math.round(amount);
  return `${r < 0 ? '−' : ''}${Math.abs(r).toLocaleString('ko-KR')}원`;
}
function signedText(amount: number) {
  const r = Math.round(amount);
  if (r === 0) return '0원';
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toLocaleString('ko-KR')}원`;
}
/** 숫자와 단위를 구분해 그린다. textContent는 balanceText()와 같다. */
function Money({ value, signed, className = '', as: Tag = 'strong' }: { value: number | null | undefined; signed?: boolean; className?: string; as?: 'strong' | 'span' | 'b' }) {
  if (value == null || !Number.isFinite(value)) return <Tag className={`num money ${className}`}>—</Tag>;
  const text = signed ? signedText(value) : balanceText(value);
  return <Tag className={`num money ${className}`}>{text.slice(0, -1)}<span className="unit">원</span></Tag>;
}
const WD = ['일', '월', '화', '수', '목', '금', '토'];
function dateParts(iso: string) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return { y, m, d, wd: WD[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
}
const md = (iso: string) => { const p = dateParts(iso); return `${p.m}월 ${p.d}일`; };
const mdw = (iso: string) => { const p = dateParts(iso); return `${p.m}월 ${p.d}일 (${p.wd})`; };
const mdShort = (iso: string) => { const p = dateParts(iso); return `${p.m}.${p.d}`; };
function kstToday(): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const value = (type: string) => parts.find(p => p.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}
function shiftDate(iso: string, days: number) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}
function axisMoney(n: number) {
  const a = Math.abs(n);
  const sign = n < 0 ? '−' : '';
  if (a >= 10000) return `${sign}${Number((a / 10000).toFixed(a >= 1000000 ? 0 : 1)).toLocaleString('ko-KR')}만`;
  return `${sign}${Math.round(a).toLocaleString('ko-KR')}`;
}
const accountLabel = (id: string) => {
  const n = Number(id.replace(/\D/g, ''));
  return Number.isFinite(n) && n > 0 ? `체험 계정 ${n}` : '체험 계정';
};

/** 백엔드 가정 코드 → 사용자 문장. 모르는 코드는 개발 화면에서만 보여준다. */
const ASSUMPTION_TEXT: Record<string, string> = {
  observed_7_day_mean_not_ml: '평소 소비는 최근 7일 평균으로 계산했어요.',
  credit_settlement_date_requires_confirmation: '신용카드 출금일을 정해야 계산돼요.',
  investment_reference_price_missing: '기준일 가격이 없어 투자 금액을 계산하지 못했어요.',
  investment_budget_below_one_share_price_cash_retained: '투자 금액이 1주 가격보다 적어 현금으로 남겨 두었어요.',
  virtual_sell_unit_price_requires_confirmation: '모의 매도 가격을 입력해야 매도가 반영돼요.',
  virtual_sell_same_day_settlement_is_explicit_sandbox_assumption: '매도 대금이 같은 날 들어온다고 가정했어요.',
  mixed_allocation_exceeds_available_cash: '나눈 금액이 지금 잔액보다 커서 계산할 수 없어요.',
  invalid_allocation: '나눈 금액을 다시 확인해 주세요.',
  editable_40_30_20_10_allocation_assumption_not_user_record: '나누는 비율은 기본값(40·30·20·10%)이에요.',
  no_scenario_debit_applied_until_required_fields_confirmed: '필요한 정보가 채워지기 전까지 출금은 반영하지 않았어요.',
};
const HIDDEN_CODES = new Set(['baseline_is_not_trained_ml']);
function assumptionNotes(codes: string[]) {
  return codes.filter(c => !HIDDEN_CODES.has(c) && !c.startsWith('observed_')).map(c => ASSUMPTION_TEXT[c]).filter(Boolean) as string[];
}
const STATUS_TEXT: Record<string, string> = {
  calculated: '', needs_confirmation: '확인 필요', invalid: '계산 불가',
};

/* ───────────────────────── 데이터 컨텍스트 (기존 로직 유지) ───────────────────────── */

function splitBudget(amount: number) {
  const purchase = Math.floor(amount * .4);
  const savings = Math.floor(amount * .3);
  const investment = Math.floor(amount * .2);
  return { purchase, savings, investment, cash: amount - purchase - savings - investment };
}
const emptyReq: CompareRequest = {
  user_id: '', as_of: '', horizon_days: 30, purchase_amount: 0,
  purchase_date: '', purchase_delay_days: 7, payment_method: 'debit',
  savings_amount: 0, savings_monthly_amount: 0, savings_goal_current: 0,
  investment_amount: 0, investment_return_percent: 0, minimum_required_balance: 0,
  stress: 'baseline', allocation: splitBudget(0),
};

type ContextState = {
  user: string; day: string; viewDay: string; previewEnd: string; users: string[]; dateStart: string; dateEnd: string;
  home: HomeState | null; instruments: Instrument[]; comparison: CompareResult | null;
  params: CompareRequest; loading: boolean; comparing: boolean; error: string;
  compareError: string; retry: () => void; selectUser: (v: string) => void;
  briefing: MorningBriefing | null; briefingError: string; savedPlans: SavedPlan[];
  planTracking: PlanTracking | null; newsStatus: string; refreshSummary: () => void;
  selectDay: (v: string) => void; updateParams: (value: Partial<CompareRequest>) => void;
};
const Context = createContext<ContextState | null>(null);
function useTwin() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('Stage3Provider required');
  return ctx;
}

export function Stage3Provider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState('');
  const [day, setDay] = useState('');
  const [previewDay, setPreviewDay] = useState<string | null>(null);
  const [users, setUsers] = useState<string[]>([]);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');
  const [home, setHome] = useState<HomeState | null>(null);
  const [homeKey, setHomeKey] = useState('');
  const [instruments, setInstruments] = useState<Instrument[]>([]);
  const [comparison, setComparison] = useState<CompareResult | null>(null);
  const [comparisonParamsKey, setComparisonParamsKey] = useState('');
  const [instrumentsKey, setInstrumentsKey] = useState('');
  const [savedPlansKey, setSavedPlansKey] = useState('');
  const [params, setParams] = useState<CompareRequest>(emptyReq);
  const [error, setError] = useState('');
  const [compareError, setCompareError] = useState('');
  const [loading, setLoading] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [retryCount, setRetryCount] = useState(0);
  const [summaryVersion, setSummaryVersion] = useState(0);
  const [briefing, setBriefing] = useState<MorningBriefing | null>(null);
  const [briefingKey, setBriefingKey] = useState('');
  const [briefingError, setBriefingError] = useState('');
  const [savedPlans, setSavedPlans] = useState<SavedPlan[]>([]);
  const [planTracking, setPlanTracking] = useState<PlanTracking | null>(null);
  const [newsStatus, setNewsStatus] = useState('');
  const retry = () => setRetryCount(n => n + 1);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError('');
    Promise.all([getDemoDefault(controller.signal), getDemoUsers(controller.signal)])
      .then(([main, list]) => {
        if (controller.signal.aborted) return;
        if (!list.users.includes(main.user_id)) throw new Error('기본 체험 계정을 목록에서 찾지 못했어요.');
        setUsers(list.users); setDateStart(main.observation_start); setDateEnd(main.observation_end);
        setUser(v => v || main.user_id); setDay(v => v || main.as_of_date);
      })
      .catch(e => { if (!controller.signal.aborted) { setError(e instanceof Error ? e.message : '기본 데이터를 불러오지 못했어요.'); setLoading(false); } });
    return () => controller.abort();
  }, [retryCount]);

  useEffect(() => {
    if (!user || !day) return;
    const controller = new AbortController();
    setLoading(true); setHome(null); setHomeKey(''); setComparison(null); setComparisonParamsKey('');
    setError(''); setCompareError(''); setInstruments([]); setInstrumentsKey('');
    // The canonical home must render as soon as its own endpoint responds:
    // instrument quotes can be absent, slow or unavailable without hiding money.
    getDemoHome(user, day, controller.signal)
      .then(current => {
        if (controller.signal.aborted) return;
        setHome(current); setHomeKey(`${user}:${day}`);
        const candidate = current.purchase_candidates.at(-1);
        const total = candidate?.main_product?.final_estimated_payment ?? 0;
        // Clearly labeled simulated 20,000-won example when no candidate exists:
        // only changes the what-if comparison, never the confirmed ledger.
        const amount = Number.isSafeInteger(total) && total > 0 ? total : 20000;
        setParams({
          ...emptyReq, user_id: user, as_of: day, purchase_date: shiftDate(day, 1),
          purchase_amount: amount, savings_amount: amount, investment_amount: amount,
          allocation: splitBudget(Math.min(amount, Math.max(0, current.available_cash))),
        });
        setLoading(false);
      })
      .catch(e => {
        if (!controller.signal.aborted) {
          setError(e instanceof Error ? e.message : '금융 데이터를 불러오지 못했어요.'); setLoading(false);
        }
      });
    getInstruments(user, day, controller.signal)
      .then(assets => {
        if (controller.signal.aborted) return;
        setInstruments(assets.prices); setInstrumentsKey(`${user}:${day}`);
        setParams(previous => previous.user_id === user && previous.as_of === day
          && !previous.investment_code && assets.prices[0]
          ? { ...previous, investment_code: assets.prices[0].code } : previous);
      })
      .catch(() => {
        // A missing market reference must not be represented as a verified quote.
        if (!controller.signal.aborted) { setInstruments([]); setInstrumentsKey(`${user}:${day}`); }
      });
    return () => controller.abort();
  }, [user, day, retryCount]);

  // Independent stage-6 data. The core home balance must stay visible if briefing fails.
  // Abort or discard every stale response whenever the persona or observation date changes.
  useEffect(() => {
    if (!user || !day) return;
    const controller = new AbortController();
    setBriefing(null); setBriefingKey(''); setBriefingError('');
    setSavedPlans([]); setSavedPlansKey(''); setPlanTracking(null); setNewsStatus('');
    Promise.allSettled([
      getMorningBriefing(user, day, controller.signal),
      getSavedPlans(user, controller.signal),
      getAssetNews(user, controller.signal),
    ]).then(([b, p, n]) => {
      if (controller.signal.aborted) return;
      if (b.status === 'fulfilled') {
        setBriefing(b.value); setBriefingKey(`${user}:${day}`);
      } else setBriefingError(b.reason instanceof Error ? b.reason.message : '금융 변화를 불러오지 못했어요.');
      if (p.status === 'fulfilled') {
        setSavedPlans(p.value.plans); setSavedPlansKey(`${user}:${day}`);
        const latest = p.value.plans.find(plan => plan.has_immutable_snapshot && plan.analysis_as_of <= day);
        if (latest) getSavedPlanTracking(user, latest.id, day, controller.signal)
          .then(value => { if (!controller.signal.aborted) setPlanTracking(value); })
          .catch(() => { if (!controller.signal.aborted) setPlanTracking(null); });
      }
      if (n.status === 'fulfilled') setNewsStatus(n.value.status);
    });
    return () => controller.abort();
  }, [user, day, retryCount, summaryVersion]);

  const paramsKey = JSON.stringify(params);
  useEffect(() => {
    if (!home || homeKey !== `${user}:${day}` || params.user_id !== user || params.as_of !== day) return;
    const controller = new AbortController();
    setComparison(null); setComparisonParamsKey('');
    const timer = window.setTimeout(() => {
      setComparing(true); setCompareError('');
      compareScenarios(params, controller.signal).then(data => {
        if (!controller.signal.aborted) { setComparison(data); setComparisonParamsKey(paramsKey); }
      }).catch(e => {
        if (!controller.signal.aborted) { setComparison(null); setCompareError(e instanceof Error ? e.message : '비교 결과를 계산하지 못했어요.'); }
      }).finally(() => { if (!controller.signal.aborted) setComparing(false); });
    }, 180);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [home, homeKey, user, day, params, paramsKey]);

  // 사용자·날짜가 바뀌면 이전 사람의 비교 결과를 즉시 지운다.
  const visibleHome = homeKey === `${user}:${day}` ? home : null;
  const visibleComparison = comparison && comparison.user_id === user && comparison.as_of === day && comparisonParamsKey === paramsKey ? comparison : null;
  const visibleInstruments = instrumentsKey === `${user}:${day}` ? instruments : [];
  const visibleSavedPlans = savedPlansKey === `${user}:${day}` ? savedPlans : [];
  const visibleBriefing = briefingKey === `${user}:${day}` ? briefing : null;
  const previewEnd = dateEnd && kstToday() > dateEnd
    ? (kstToday() <= shiftDate(dateEnd, 14) ? kstToday() : shiftDate(dateEnd, 14))
    : dateEnd;
  const viewDay = previewDay ?? day;
  const selectionRef = useRef(0);
  useEffect(() => {
    // Never apply another persona's delayed post-snapshot lookup.
    selectionRef.current += 1;
    setPreviewDay(null);
  }, [user]);
  const selectDay = (selected: string) => {
    if (!selected || selected < dateStart || selected > previewEnd) return;
    const seq = ++selectionRef.current;
    if (selected <= dateEnd) {
      setPreviewDay(null);
      setDay(selected);
      return;
    }
    // No confirmed post-snapshot transactions? Keep the 11/04 anchor and show
    // the requested forecast day without pretending it was observed.
    setPreviewDay(selected);
    setDay(dateEnd);
    void getDemoHome(user, selected).then(actual => {
      if (seq !== selectionRef.current || actual.user_id !== user) return;
      setPreviewDay(null);
      setDay(selected); // Confirmed local transactions: all APIs share this day.
    }).catch(() => {
      // A 422 is an expected forecast-only date, not a blank financial home.
      // Other API errors are left to the canonical home fetch/retry UX.
    });
  };
  const updateParams = (value: Partial<CompareRequest>) => setParams(old => ({ ...old, ...value }));
  return <Context.Provider value={{
    user, day, viewDay, previewEnd, users, dateStart, dateEnd, home: visibleHome,
    instruments: visibleInstruments, comparison: visibleComparison, params, loading, comparing, error, compareError, retry,
    selectUser: setUser, selectDay, updateParams,
    briefing: visibleBriefing, briefingError, savedPlans: visibleSavedPlans,
    planTracking: savedPlansKey === `${user}:${day}` ? planTracking : null, newsStatus,
    refreshSummary: () => setSummaryVersion(v => v + 1),
  }}>{children}</Context.Provider>;
}

/* ───────────────────────── 공통 조각 ───────────────────────── */

function ErrorNotice({ message, retry }: { message: string; retry: () => void }) {
  return <div className="st3-error" role="alert">
    <p className="st3-error-title">데이터를 표시하지 못했어요</p>
    <p>{message}</p>
    <button type="button" className="st3-btn" onClick={retry}>다시 불러오기</button>
    {import.meta.env.DEV && <p className="st3-dev">로컬 실행에는 React와 FastAPI 서버가 모두 필요해요. 백엔드 터미널에서 <code>cd ~/Projects/MOA_2ND_BE && source .venv/bin/activate && python -m uvicorn app.main:app --reload --port 8000</code>을 실행하고 <a href="http://localhost:8000/api/v4/demo/default" target="_blank" rel="noreferrer">기본 데이터 API</a>가 열리는지 확인해 주세요. API 키는 금융 잔액 조회에 필요하지 않아요.</p>}
  </div>;
}

function useMedia(query: string) {
  const [match, setMatch] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setMatch(mq.matches);
    on(); mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [query]);
  return match;
}

/** 시뮬레이션 세부 조건: 사용자 화면이 아니라 개발·시연 패널에서만 조정한다. */
function WorldDevControls() {
  const { home, params, updateParams } = useTwin();
  const allocated = Object.values(params.allocation).reduce((sum, n) => sum + n, 0);
  const capExceeded = allocated > params.purchase_amount || (home != null && allocated > home.available_cash);
  return <>
    <fieldset className="st3-dev-group">
      <legend>가상 저축</legend>
      <div className="st3-formgrid">
        <Field label="넣는 날"><input type="date" min={shiftDate(params.as_of, 1)} value={params.savings_date ?? params.purchase_date}
          onChange={e => e.target.value && updateParams({ savings_date: e.target.value })} /></Field>
        <MoneyControl title="매달 추가" value={params.savings_monthly_amount} onChange={savings_monthly_amount => updateParams({ savings_monthly_amount })} />
        <MoneyControl title="저축 목표 (0 = 없음)" value={params.savings_goal_target ?? 0}
          onChange={savings_goal_target => updateParams({ savings_goal_target: savings_goal_target || undefined })} />
        <MoneyControl title="보호할 최소 잔액" value={params.minimum_required_balance} onChange={minimum_required_balance => updateParams({ minimum_required_balance })} />
      </div>
    </fieldset>
    <fieldset className="st3-dev-group">
      <legend>모의 매도</legend>
      <div className="st3-formgrid">
        <Field label="수량 (0 = 미매도)"><input type="number" min="0" inputMode="numeric" value={params.virtual_sell_qty ?? 0}
          onChange={e => updateParams({ virtual_sell_qty: Math.max(0, Math.round(Number(e.target.value) || 0)) })} /></Field>
        <Field label="1주 가격 (원)"><input type="number" min="1" inputMode="numeric" value={params.virtual_sell_unit_price ?? ''}
          onChange={e => updateParams({ virtual_sell_unit_price: e.target.value ? Number(e.target.value) : undefined })} /></Field>
        <Field label="매도일"><input type="date" min={params.purchase_date} value={params.virtual_sell_date ?? shiftDate(params.purchase_date, 1)}
          onChange={e => e.target.value && updateParams({ virtual_sell_date: e.target.value })} /></Field>
        <Field label="정산일"><input type="date" min={params.virtual_sell_date ?? shiftDate(params.purchase_date, 1)}
          value={params.virtual_sell_settlement_date ?? params.virtual_sell_date ?? shiftDate(params.purchase_date, 1)}
          onChange={e => e.target.value && updateParams({ virtual_sell_settlement_date: e.target.value })} /></Field>
      </div>
    </fieldset>
    <fieldset className="st3-dev-group">
      <legend>혼합 배분 (기본 40·30·20·10%)</legend>
      <div className="st3-formgrid">
        {(['purchase', 'savings', 'investment', 'cash'] as const).map(k =>
          <MoneyControl key={k} title={{ purchase: '구매', savings: '저축', investment: '투자', cash: '현금' }[k]}
            value={params.allocation[k]} onChange={v => updateParams({ allocation: { ...params.allocation, [k]: v } })} />)}
      </div>
      <p className={`st3-alloc${capExceeded ? ' over' : ''}`}>합계 {balanceText(allocated)} / 예산 {balanceText(params.purchase_amount)} / 잔액 {balanceText(home?.available_cash ?? 0)}</p>
    </fieldset>
    <fieldset className="st3-dev-group">
      <legend>스트레스 가정</legend>
      <div className="st3-formgrid">
        <Field label="조건" wide><select value={params.stress} onChange={e => updateParams({ stress: e.target.value as CompareRequest['stress'] })}>
          <option value="baseline">기준선 (최근 7일 평균)</option><option value="higher_spending">지출 증가</option>
          <option value="delayed_income">소득 입금 지연</option><option value="combined">지출 증가 + 입금 지연</option>
          <option value="investment_loss">가상 투자 손실</option>
        </select></Field>
        <Field label="주가 변화 (%)" wide><input type="number" min="-100" max="1000" value={params.investment_return_percent}
          onChange={e => updateParams({ investment_return_percent: Number(e.target.value) || 0 })} /></Field>
      </div>
    </fieldset>
  </>;
}

/**
 * 개발·시연 패널. 사용자 화면(폰) 밖에 둔다.
 * 컴퓨터: 폰 화면 오른쪽에 고정 / 폰: '체험 설정' 버튼 → 아래에서 올라오는 시트.
 */
export function Stage3CurrentQuiz() {
  const { user } = useTwin();
  return <Stage3DailyQuiz user={user} />;
}

export function Stage3DevPanel() {
  const nav = useNav();
  const { user, viewDay, previewEnd, users, dateStart, dateEnd, selectUser, selectDay, comparison } = useTwin();
  const wide = useMedia('(min-width: 960px)');
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);
  const body = <>
    <div className="st3-dev-head">
      <p>체험 설정<small>개발·시연용 · 사용자 화면에는 보이지 않아요</small></p>
      {!wide && <button type="button" className="st3-dev-close" aria-label="체험 설정 닫기" onClick={() => setOpen(false)}>닫기</button>}
    </div>
    <fieldset className="st3-dev-group">
      <legend>체험 계정 (20명)</legend>
      <select value={user} onChange={e => selectUser(e.target.value)} aria-label="가상 사용자 선택">
        {users.map(id => <option key={id} value={id}>{accountLabel(id)} · {id}</option>)}
      </select>
    </fieldset>
    <fieldset className="st3-dev-group">
      <legend>날짜 선택 · {dateEnd && md(dateEnd)}까지 관측 기록</legend>
      <div className="st3-date">
        <button type="button" aria-label="하루 전" disabled={!viewDay || viewDay <= dateStart} onClick={() => selectDay(shiftDate(viewDay, -1))}>‹</button>
        <input type="date" value={viewDay} min={dateStart} max={previewEnd} onChange={e => e.target.value && selectDay(e.target.value)} aria-label="금융 관측 기준일" />
        <button type="button" aria-label="하루 뒤" disabled={!viewDay || viewDay >= previewEnd} onClick={() => selectDay(shiftDate(viewDay, 1))}>›</button>
      </div>
    </fieldset>
    {viewDay > dateEnd && <p className="st3-dev-projection" role="note">{mdw(viewDay)}은 원본 관측 종료일 이후예요. 확인된 새 거래가 있으면 부분 잔액을, 없으면 마지막 관측일을 기준으로 한 예측을 보여줘요.</p>}
    {nav.tab === 'forks' && <WorldDevControls />}
    <dl className="st3-dev-meta">
      <div><dt>데이터</dt><dd>합성 데이터셋 · 실제 계좌 아님</dd></div>
      {comparison && <div><dt>소비 기준선</dt><dd>{comparison.baseline_source} · {balanceText(comparison.baseline_daily_variable_expense)}/일</dd></div>}
      {comparison && <div><dt>경고</dt><dd>{comparison.warnings.join(', ')}</dd></div>}
    </dl>
  </>;
  if (wide) return <aside className="st3-dev-panel" aria-label="체험 설정">{body}</aside>;
  return <>
    <button type="button" className="st3-dev-fab" onClick={() => setOpen(true)} aria-expanded={open}>체험 설정</button>
    {open && <div className="st3-dev-sheet-wrap">
      <button type="button" className="st3-dev-backdrop" aria-label="체험 설정 닫기" onClick={() => setOpen(false)} />
      <div className="st3-dev-panel sheet" role="dialog" aria-modal="true" aria-label="체험 설정">{body}</div>
    </div>}
  </>;
}

function PageHead({ title, sub, logo }: { title: string; sub?: string; logo?: boolean }) {
  return <header className="st3-head">
    <h1>{logo && <Logo size={22} />}{title}<span className="st3-tag" title="실제 계좌와 연결되지 않은 체험용 예시 데이터예요">예시 데이터</span></h1>
    {sub && <p>{sub}</p>}
  </header>;
}

/** 정보 한 덩어리 = 카드 하나. 제목 아래 한 줄로 '이게 뭔지'를 설명한다. */
function Card({ title, desc, step, action, className = '', id, children }: {
  title: ReactNode; desc?: ReactNode; step?: number; action?: ReactNode; className?: string; id: string; children: ReactNode;
}) {
  return <section className={`st3-card ${className}`} aria-labelledby={id}>
    <div className="st3-card-head">
      <div>
        <h2 id={id}>{step != null && <span className="st3-step" aria-label={`${step}단계`}>{step}</span>}{title}</h2>
        {desc && <p className="st3-card-desc">{desc}</p>}
      </div>
      {action}
    </div>
    {children}
  </section>;
}

function Loading({ label }: { label: string }) {
  return <div className="st3-loading" role="status" aria-live="polite">
    <span className="st3-skel w60" /><span className="st3-skel w40 tall" /><span className="st3-skel w80" />
    <span className="sr-only">{label}</span>
  </div>;
}

/* ───────────────────────── 잔액 흐름 차트 ───────────────────────── */

type ChartPoint = { date: string; value: number };
type ChartSeries = { id: string; label: string; points: ChartPoint[]; tone: 'baseline' | 'alt' | 'muted' | 'single' };

function useWidth<T extends HTMLElement>(fallback = 360) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    setWidth(el.clientWidth || fallback);
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, width] as const;
}

/**
 * 하나의 시간축 위에 여러 세계의 잔액을 그린다.
 * 0원 아래는 옅은 경고 면, 선택한 날짜는 세로 안내선으로 표시한다.
 */
function FlowChart({ series, selected, onSelect, marks = [], divergeAt, height = 200, label }: {
  series: ChartSeries[]; selected: number; onSelect: (i: number) => void;
  marks?: number[]; divergeAt?: number | null; height?: number; label: string;
}) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const titleId = useId();
  const base = series[0]?.points ?? [];
  const n = base.length;
  const padL = 44, padR = 12, padT = 14, padB = 26;
  const values = series.flatMap(s => s.points.map(p => p.value));
  let lo = Math.min(0, ...values), hi = Math.max(0, ...values);
  if (hi === lo) hi = lo + 1;
  const pad = (hi - lo) * .08; lo -= lo < 0 ? pad : 0; hi += pad;
  const x = (i: number) => padL + (n <= 1 ? 0 : (i * (width - padL - padR)) / (n - 1));
  const y = (v: number) => padT + ((hi - v) * (height - padT - padB)) / (hi - lo);
  const path = (pts: ChartPoint[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join('');
  const ticks = [hi - pad, (hi - pad + Math.max(lo, lo)) / 2, lo].filter((v, i, a) => a.findIndex(o => Math.abs(o - v) < (hi - lo) * .12) === i && Math.abs(v) > (hi - lo) * .06);
  const labelIdx = n > 1 ? Array.from(new Set([0, Math.round((n - 1) / 2), n - 1])) : [0];
  const pick = (clientX: number, target: Element) => {
    const r = target.getBoundingClientRect();
    const rel = ((clientX - r.left) / r.width) * width;
    const i = Math.round(((rel - padL) / (width - padL - padR)) * (n - 1));
    onSelect(Math.max(0, Math.min(n - 1, i)));
  };
  const onPointer = (e: PointerEvent<SVGSVGElement>) => { if (e.buttons || e.pointerType === 'mouse') pick(e.clientX, e.currentTarget); };
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    if (e.key === 'ArrowLeft') { e.preventDefault(); onSelect(Math.max(0, selected - 1)); }
    if (e.key === 'ArrowRight') { e.preventDefault(); onSelect(Math.min(n - 1, selected + 1)); }
  };
  const order = { muted: 0, baseline: 1, single: 2, alt: 3 } as const;
  const drawn = [...series].sort((a, b) => order[a.tone] - order[b.tone]);
  if (!n) return <p className="st3-muted">표시할 잔액 기록이 없어요.</p>;
  return <div className="st3-chart" ref={ref}>
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-labelledby={titleId}
      tabIndex={0} onPointerDown={e => pick(e.clientX, e.currentTarget)} onPointerMove={onPointer} onKeyDown={onKey}>
      <title id={titleId}>{label}</title>
      {lo < 0 && <rect className="st3-chart-neg" x={padL} y={y(0)} width={width - padL - padR} height={Math.max(0, height - padB - y(0))} />}
      {ticks.map(v => <g key={v}>
        <line className="st3-chart-grid" x1={padL} x2={width - padR} y1={y(v)} y2={y(v)} />
        <text className="st3-chart-ylabel" x={padL - 6} y={y(v) + 4} textAnchor="end">{axisMoney(v)}</text>
      </g>)}
      <line className="st3-chart-zero" x1={padL} x2={width - padR} y1={y(0)} y2={y(0)} />
      <text className="st3-chart-ylabel zero" x={padL - 6} y={y(0) + 4} textAnchor="end">0</text>
      {labelIdx.map(i => <text key={i} className="st3-chart-xlabel" x={x(i)} y={height - 7}
        textAnchor={i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle'}>{i === 0 ? '오늘' : mdShort(base[i].date)}</text>)}
      {divergeAt != null && divergeAt > 0 && <g className="st3-chart-diverge">
        <line x1={x(divergeAt)} x2={x(divergeAt)} y1={padT} y2={height - padB} />
        <text x={x(divergeAt) + 5} y={padT + 10}>갈라지는 날</text>
      </g>}
      <line className="st3-chart-cursor" x1={x(selected)} x2={x(selected)} y1={padT - 4} y2={height - padB} />
      {drawn.map(s => <path key={s.tone === 'alt' || s.tone === 'single' ? `${s.id}-draw` : s.id} className={`st3-chart-line ${s.tone}`} d={path(s.points)}
        pathLength={s.tone === 'alt' || s.tone === 'single' ? 1 : undefined} />)}
      {marks.map(i => base[i] && <circle key={i} className="st3-chart-mark" cx={x(i)} cy={y(series[0].points[i].value)} r={3.2} />)}
      {drawn.filter(s => s.tone !== 'muted').map(s => s.points[selected] &&
        <circle key={s.id} className={`st3-chart-dot ${s.tone}`} cx={x(selected)} cy={y(s.points[selected].value)} r={4.5} />)}
      <circle className="st3-chart-today" cx={x(0)} cy={y(base[0].value)} r={4} />
    </svg>
  </div>;
}

/* ───────────────────────── 홈 ───────────────────────── */

/**
 * Main-screen AI experience. The backend owns all financial amounts.
 * A real LLM answer is never implied when only the Python rule/ML layer ran.
 * Reuses the existing original v22 hierarchy and the Stage3 AI planner rather
 * than replacing the user's motion graphics with another dashboard.
 */
function HomeAiSpotlight() {
  const nav = useNav();
  const { user, day, home, briefing, briefingError, updateParams } = useTwin();
  const [agentOpen, setAgentOpen] = useState(false);
  useEffect(() => setAgentOpen(false), [user, day]);

  const capacity = briefing?.spending_capacity.estimated_additional_spend;
  const bill = briefing?.nearest_essential_payment;
  const warning = Boolean((bill && !bill.covered) || (home && home.minimum_balance < 0));
  const todayTitle = warning
    ? '다가오는 결제일에 잔액을 확인해요'
    : bill && capacity != null && capacity <= 0
      ? '이번에는 결제일을 먼저 챙겨볼까요?'
      : capacity != null && capacity > 0
        ? '예정된 지출까지 함께 살펴봤어요'
        : '오늘 내 돈의 흐름을 확인해요';
  const grounded = warning
    ? '예상 잔액이 부족해지는 날이 있을 수 있어요. 다가오는 결제부터 확인해 보세요.'
    : bill && capacity != null && capacity <= 0
      ? '예정된 결제에 필요한 돈을 고려하면 지금은 추가 지출에 신중할 때예요.'
      : capacity != null && capacity > 0
        ? '예정된 결제와 변동 지출을 고려한 예상 여유가 남아 있어요. 실제 결제는 달라질 수 있어요.'
        : '입력된 지출과 예정된 결제를 함께 살펴보고 있어요.';
  const aiExplanation = briefing?.llm_used
    ? briefing.summary.replace(/^이전 분석 이후 새로 감지된 주요 변화가 없어요\.\s*/, '').trim()
    : '';
  const applyAmount = (amount: number) => {
    const value = Math.max(0, Math.round(amount));
    updateParams({
      purchase_amount: value,
      savings_amount: value,
      investment_amount: value,
      allocation: splitBudget(Math.min(value, Math.max(0, home?.available_cash ?? 0))),
    });
    setAgentOpen(false);
    nav.setTab('forks');
  };
  return <section className={`ux-ai-spotlight${warning ? ' is-caution' : ''}`} aria-labelledby="ux-ai-home-title">
    <div className="ux-ai-spotlight-top">
      <div className="ux-ai-identity"><AiMark label="" /><span>MOA AI</span><span className="ux-ai-tag">내 금융 브리핑</span></div>
      <time className="ux-ai-provenance" dateTime={day}>{md(day)} 기준</time>
    </div>
    <div className="ux-ai-lead">
      <div className="ux-ai-lead-copy">
        <h2 id="ux-ai-home-title">{briefing ? todayTitle : '오늘 내 금융 상태를 살펴볼게요'}</h2>
        <p className="ux-ai-spotlight-summary" aria-live="polite">
          {briefing ? (aiExplanation || grounded) : (briefingError ? '지금은 분석 정보를 불러오지 못했어요. 금융 내역은 계속 볼 수 있어요.' : '결제일과 앞으로의 지출을 확인하고 있어요…')}
        </p>
      </div>
      <svg className="ux-ai-orbit" viewBox="0 0 110 92" aria-hidden="true">
        <circle cx="49" cy="45" r="27" className="ux-ai-orbit-ring" />
        <path className="ux-ai-orbit-path" d="M5 70 C20 70 26 42 49 42 S80 18 105 18" />
        <path className="ux-ai-orbit-path alt" d="M5 70 C22 70 28 50 49 50 S85 71 105 75" />
        <circle cx="49" cy="46" r="5" className="ux-ai-orbit-core" />
        <circle cx="105" cy="18" r="3" className="ux-ai-orbit-end" />
        <circle cx="105" cy="75" r="3" className="ux-ai-orbit-end alt" />
      </svg>
    </div>
    {briefing && <div className="ux-ai-facts" aria-label="금융 분석에 사용된 주요 정보">
      <div>
        <span>다음 결제</span>
        <strong>{bill ? `${md(bill.date)} · ${bill.name}` : '등록된 일정 없음'}</strong>
      </div>
      <div>
        <span>예상 추가 여유</span>
        <strong>{capacity == null ? '확인 중' : balanceText(capacity)}</strong>
      </div>
    </div>}
    <button type="button" className="ux-ai-home-ask" aria-expanded={agentOpen}
      aria-controls="ux-ai-home-agent" onClick={() => setAgentOpen(v => !v)}>
      <span className="ux-ai-ask-icon"><AiMark label="" /></span>
      <span>모아에게 내 소비를 물어보기</span>
      <span aria-hidden="true">{agentOpen ? '−' : '↗'}</span>
    </button>
    {agentOpen && <div id="ux-ai-home-agent" className="ux-ai-home-planner">
      <Stage3AiAgent user={user} day={day} onApplyAmount={applyAmount} />
    </div>}
    <p className="ux-ai-home-source">
      예상 현금흐름을 바탕으로 안내해요. 실제 거래나 소비 가능 금액을 보장하지 않아요.
    </p>
  </section>;
}

function firstShortfall(days: { date: string; closing_balance: number; lowest_balance: number }[]) {
  return days.find(d => Math.min(d.closing_balance, d.lowest_balance) < 0) ?? null;
}

export function Stage3Home() {
  const nav = useNav();
  const { home, comparison, loading, error, retry, params, briefing, savedPlans, day, viewDay } = useTwin();
  const [sel, setSel] = useState<number | null>(null);

  const points = useMemo<ChartPoint[]>(() => home ? [
    { date: home.as_of_date, value: home.available_cash },
    ...home.daily_cashflow.map(d => ({ date: d.date, value: d.closing_balance })),
  ] : [], [home]);
  const shortfall = home ? firstShortfall(home.daily_cashflow) : null;
  const shortIdx = shortfall ? points.findIndex(p => p.date === shortfall.date) : -1;
  const lowestIdx = points.length ? points.reduce((m, p, i) => (p.value < points[m].value ? i : m), 0) : 0;
  const selected = sel ?? (shortIdx > 0 ? shortIdx : Math.max(0, points.length - 1));
  useEffect(() => setSel(null), [home]);

  if (error) return <div className="page st3 st3-home"><PageHead title="모아" logo /><ErrorNotice message={error} retry={retry} /></div>;
  if (loading || !home) return <div className="page st3 st3-home"><PageHead title="모아" logo /><Loading label="체험 계정의 금융 정보를 불러오는 중이에요" /></div>;

  const eventDays = home.daily_cashflow.map((d, i) => (d.events.some(e => e.transaction_status === 'scheduled') ? i + 1 : -1)).filter(i => i > 0);
  const selDay = selected > 0 ? home.daily_cashflow[selected - 1] : null;
  const flow = [...home.upcoming_essential_payments, ...home.upcoming_income]
    .sort((a, b) => a.debit_at.localeCompare(b.debit_at));
  const closingOn = (iso: string) => home.daily_cashflow.find(d => d.date === iso.slice(0, 10))?.closing_balance;
  const candidate = home.purchase_candidates.at(-1);
  const buy = comparison?.paths.find(p => p.scenario_id === 'purchase_now');
  const keep = comparison?.paths.find(p => p.scenario_id === 'no_purchase');
  const positions = Object.entries(home.virtual_investments.positions ?? {});

  return <div className="page st3 st3-home">
    <PageHead title="모아" logo sub="결제일에 돈이 모자라지 않는지 확인하고, 사기 전에 미래를 비교해요" />
    <HomeAiSpotlight />
    {viewDay > home.observation_end && <p className="st3-note warn" role="note">
      {viewDay !== day
        ? <>{mdw(viewDay)}은 아직 관측된 거래가 없는 미래 예상일이에요. {mdw(home.observation_end)}의 관측 잔액과 예정된 현금흐름을 기준으로 추정한 예상 마감 잔액: <Money as="span" value={home.daily_cashflow.find(d => d.date === viewDay)?.closing_balance} /></>
        : <>{mdw(viewDay)}은 원본 관측 종료일 이후예요. 직접 확인한 거래만 반영한 부분 잔액이며 미기록 소비가 있을 수 있어요. 확인된 항목 기준 잔액: <Money as="span" value={home.available_cash} /></>}
    </p>}

    
    <div className="st3-layout">
      <div className="st3-col-main">
        <section className="st3-card st3-hero" aria-labelledby="st3-hero-label">
          <p id="st3-hero-label" className="st3-hero-label">현재 결제계좌 현금<span>결제계좌 · {mdw(home.as_of_date)} 기준</span></p>
          <Money value={home.available_cash} />
          {briefing && <div className="st6-spend-capacity">
            <div><span>오늘의 예상 추가 소비 여유</span><Money value={briefing.spending_capacity.estimated_additional_spend}/></div>
            <small>{briefing.spending_capacity.message}</small>
          </div>}
          {shortfall
            ? <div className="st3-status danger" role="note">
                <span aria-hidden className="st3-status-icon">!</span>
                <p><b>{mdw(shortfall.date)}에 {balanceText(Math.abs(Math.min(shortfall.closing_balance, shortfall.lowest_balance)))} 부족해질 수 있어요</b>
                  <small>예정된 결제가 들어오는 돈보다 먼저 빠져나가요. 아래 그래프에서 날짜별로 확인해 보세요.</small></p>
              </div>
            : <div className="st3-status ok" role="note"><span aria-hidden className="st3-status-icon">✓</span>
                <p><b>앞으로 14일 동안 잔액이 부족한 날은 없어요</b><small>등록된 결제·입금과 미래 변동 지출 전망 기준이에요.</small></p></div>}
        </section>

        <Card id="st3-forecast" title="앞으로 14일 잔액" desc="예정된 결제·입금과 미래 변동 지출 전망을 반영했어요. 그래프에서 날짜별로 확인할 수 있어요.">
          <FlowChart label="오늘부터 14일 동안의 예상 결제계좌 잔액" selected={selected} onSelect={setSel}
            marks={eventDays} series={[{ id: 'home', label: '예상 잔액', points, tone: 'single' }]} />
          <div className="st3-readout" aria-live="polite" key={selected}>
            <div>
              <span>{selected === 0 ? `오늘 · ${mdw(home.as_of_date)}` : `${mdw(points[selected].date)} 예상 잔액`}</span>
              <Money value={points[selected].value} className={points[selected].value < 0 ? 'neg' : ''} />
            </div>
            {selDay && selDay.events.filter(e => e.transaction_status === 'scheduled').length > 0 &&
              <ul>{selDay.events.filter(e => e.transaction_status === 'scheduled').map(e =>
                <li key={e.id}><span>{e.label}</span><Money as="span" signed value={e.amount} /></li>)}</ul>}
          </div>
          <dl className="st3-horizons">
            {[3, 7, 14].map(k => <div key={k}><dt>{k}일 뒤</dt>
              <dd><Money as="span" value={home.future_balances[String(k)]} className={(home.future_balances[String(k)] ?? 0) < 0 ? 'neg' : ''} /></dd></div>)}
            <div><dt>가장 낮은 날</dt><dd><Money as="span" value={home.minimum_balance} className={home.minimum_balance < 0 ? 'neg' : ''} />
              {lowestIdx > 0 && <small>{md(points[lowestIdx].date)}</small>}</dd></div>
          </dl>
          {home.variable_forecast.model_type === 'unavailable'
            ? <p className="st3-note warn">변동 지출 전망에 사용할 관측 기록이 부족해요. 그래프에는 확정 일정만 반영했어요.</p>
            : <div className="st3-forecast-meta" aria-label="미래 변동 지출 전망">
                <p><span>앞으로 7일 변동 지출 전망</span>
                  <Money as="span" value={home.variable_forecast.forecasts?.find(f => f.horizon_days === 7)?.predicted_variable_outflow} /></p>
                <small>{home.variable_forecast.model_type === 'lightgbm' ? '학습 모델 기반 전망'
                  : home.variable_forecast.model_type === 'recent7' ? '최근 7일 소비 기반 전망' : '요일별 소비 패턴 기반 전망'}
                  {' · '}{home.variable_forecast.data_quality_status === 'complete' ? '관측 기록 기준' : '관측 기록 일부 제한'}
                  {' · '}확정 출금액이 아닌 예상 금액이에요</small>
                {home.variable_forecast.upper_scenario?.daily && <small>지출 25% 증가 가정: 향후 7일 <Money as="span" value={home.variable_forecast.upper_scenario.daily.slice(0, 7).reduce((sum, row) => sum + row.amount, 0)} /> · 검증된 위험 확률은 아니에요</small>}
              </div>}
          {!home.has_observation_on_date && <p className="st3-note warn">이 날짜는 하루치 기록이 완전하지 않아 직전 기록 기준으로 보여드려요.</p>}
        </Card>

        <Card id="st3-flow" title="다가오는 돈의 흐름" desc="앞으로 14일 동안 빠져나갈 필수 결제와 들어올 돈이에요.">
          {flow.length ? <ol className="st3-timeline">
            {flow.slice(0, 8).map(e => {
              const after = closingOn(e.debit_at);
              return <li key={e.id} className={after != null && after < 0 ? 'short' : ''}>
                <time dateTime={e.debit_at.slice(0, 10)}><b>{dateParts(e.debit_at).d}</b>{dateParts(e.debit_at).wd}</time>
                <span className="st3-tl-name">{e.label}<small>{e.amount > 0 ? '들어올 돈' : e.payment_method === 'credit' ? '카드 대금' : '필수 결제'}{after != null && after < 0 ? ` · 이날 잔액 ${balanceText(after)}` : ''}</small></span>
                <Money as="span" signed value={e.amount} className={e.amount > 0 ? 'pos' : ''} />
              </li>;
            })}
          </ol> : <p className="st3-empty">앞으로 14일 동안 등록된 결제나 입금이 없어요.</p>}
        </Card>
      </div>

      <aside className="st3-col-side">
        <Card id="st3-decide" className="st3-decision" title="사기 전에 평행세계로 비교해요"
          desc="같은 잔액에서 '산 세계'와 '안 산 세계'를 나란히 계산해요. 실제 돈은 움직이지 않아요.">
          {candidate && <p className="st3-decision-item"><span>고민 중인 상품</span><b>{candidate.main_product.name}</b><Money as="span" value={candidate.main_product.final_estimated_payment} /></p>}
          {buy && keep && buy.status === 'calculated' && keep.status === 'calculated' && params.purchase_amount > 0 && <>
            <dl className="st3-pair">
              <div><dt>사지 않으면</dt><dd><Money as="span" value={keep.future_balances['14']} /></dd></div>
              <div className="alt"><dt>지금 사면</dt><dd><Money as="span" value={buy.future_balances['14']} /></dd></div>
            </dl>
            <p className="st3-pair-note">14일 뒤 잔액 비교 · 위 그래프와 동일한 기본 지출 전망에 구매 선택만 추가했어요.</p>
          </>}
          <button type="button" className="st3-btn primary" onClick={() => nav.setTab('forks')}>평행세계에서 자세히 비교하기</button>
        </Card>

        <Card id="st3-recent" title="최근 거래" desc="결제계좌에서 실제로 기록된 거래예요."
          action={<button type="button" className="st3-link" onClick={() => nav.setTab('ledger')}>전체 {home.observed_transaction_count}건</button>}>
          {home.recent_transactions.length ? <ul className="st3-list">
            {home.recent_transactions.slice(0, 5).map(tx => <TxRow key={tx.id} tx={tx} />)}
          </ul> : <p className="st3-empty">이 날짜까지 기록된 거래가 없어요.</p>}
        </Card>

        <Card id="st3-virtual" title="가상 자산" desc="모의투자 계좌예요. 결제계좌 잔액과 섞지 않고 따로 계산해요."
          action={<button type="button" className="st3-link" onClick={() => nav.setTab('invest')}>자세히</button>}>
          <ul className="st3-list compact">
            <li><span>모의투자 현금</span><Money as="span" value={home.virtual_investments.virtual_cash} /></li>
            <li><span>보유 종목</span><span className="num">{positions.length}개</span></li>
          </ul>
        </Card>
      </aside>
    </div>

    <section className="st6-insights" aria-labelledby="st6-insights-title">
      <div className="st6-insights-head">
        <h2 id="st6-insights-title">내 금융 변화 살펴보기</h2>
        <button type="button" className="st3-link" onClick={() => nav.push({name:'insights'})}>자세히 보기</button>
      </div>
      <p>저장한 경로 {savedPlans.length}개 · {briefing?.change_detection.events.length ?? '—'}건의 주요 변화</p>
    </section>
    <footer className="st3-foot">
      <p>체험용 합성 데이터와 예측 결과이며 실제 은행 잔액·시세·소비 허가액이 아니에요.</p>
      <button type="button" className="st3-btn" onClick={() => window.location.assign("/?personal=1&intro=1")}>내 재무 정보로 시작하기</button>
    </footer>
  </div>;
}

function txSign(tx: { kind: string; amount: number; direction?: string }) {
  if (tx.kind === 'transfer_self') return tx.direction === 'in' ? 1 : -1;
  if (tx.kind === 'income' || tx.direction === 'in') return 1;
  return -1;
}
const METHOD: Record<string, string> = { debit: '체크카드', credit: '신용카드', transfer: '계좌이체', cash: '현금' };
function TxRow({ tx }: { tx: { id: string; name: string; date: string; kind: string; amount: number; method: string; category?: string; direction?: string } }) {
  const s = txSign(tx);
  return <li>
    <span className="st3-tx-name">{tx.name}<small>{[tx.category && tx.category !== '이체' ? tx.category : tx.kind === 'transfer_self' ? '내 계좌 간 이체' : '', METHOD[tx.method] ?? ''].filter(Boolean).join(' · ')}</small></span>
    <Money as="span" signed value={s * Math.abs(tx.amount)} className={s > 0 ? 'pos' : ''} />
  </li>;
}

/* ───────────────────────── 평행세계 ───────────────────────── */

function MoneyControl({ title, value, onChange, hint }: { title: string; value: number; onChange: (v: number) => void; hint?: string }) {
  return <label className="st3-money"><span className="st3-label">{title}</span>
    <span className="st3-input-unit">
      <input type="number" inputMode="numeric" min="0" step="100" value={value}
        onChange={e => onChange(Math.max(0, Math.round(Number(e.target.value) || 0)))} />
      <span aria-hidden>원</span>
    </span>
    {hint && <small>{hint}</small>}
  </label>;
}
function Field({ label, children, hint, wide }: { label: string; children: ReactNode; hint?: string; wide?: boolean }) {
  return <label className={`st3-field${wide ? ' wide' : ''}`}><span className="st3-label">{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function pathPoints(cash: number, asOf: string, path: ScenarioPath): ChartPoint[] {
  return [{ date: asOf, value: cash }, ...path.daily_cashflow.map(d => ({ date: d.date, value: d.closing_balance }))];
}

const PATH_HINT: Record<string, string> = {
  purchase_now: '지금 결제했을 때',
  no_purchase: '아무것도 하지 않았을 때',
  purchase_delay: '정한 날짜만큼 미뤘을 때',
  virtual_savings: '살 돈을 가상 저축에 넣었을 때',
  virtual_investment: '살 돈으로 가상 투자했을 때',
  mixed: '같은 돈을 나눠 썼을 때',
};

function PathCard({ path, base, active, onPick }: { path: ScenarioPath; base?: ScenarioPath; active: boolean; onPick: () => void }) {
  const ok = path.status === 'calculated';
  const diff = ok && base && base.status === 'calculated' && base.scenario_id !== path.scenario_id
    ? path.future_balances['14'] - base.future_balances['14'] : null;
  const notes = assumptionNotes(path.assumptions);
  return <article className={`st3-world-card${active ? ' active' : ''}${ok ? '' : ' blocked'}`}>
    <button type="button" className="st3-world-pick" aria-pressed={active} onClick={onPick}>
      <span className="st3-world-name">{path.label}{path.scenario_id === 'no_purchase' && <em>기준</em>}
        {STATUS_TEXT[path.status] && <small className="st3-world-status">{STATUS_TEXT[path.status]}</small>}</span>
      {ok ? <strong className="num money">{balanceText(path.future_balances['14']).slice(0, -1)}<span className="unit">원</span></strong>
        : <strong className="num money muted">계산 전</strong>}
      <span className="st3-world-hint">{PATH_HINT[path.scenario_id]}</span>
      <span className="st3-world-diff">{diff == null ? (path.scenario_id === 'no_purchase' ? '비교 기준' : '') : diff === 0 ? '기준과 같아요' : `기준보다 ${signedText(diff)}`}</span>
    </button>
    {ok && <dl className="st3-world-facts">
      <div><dt>30일 중 최저</dt><dd><Money as="span" value={path.minimum_balance} className={path.minimum_balance < 0 ? 'neg' : ''} /></dd></div>
      <div><dt>부족 시작</dt><dd>{path.first_shortfall_date ? md(path.first_shortfall_date) : '없음'}</dd></div>
      {path.virtual_savings > 0 && <div><dt>가상 저축</dt><dd><Money as="span" value={path.virtual_savings} /></dd></div>}
      {(path.virtual_investment_value > 0 || path.investment_quantity > 0) && <div><dt>투자 평가액</dt><dd><Money as="span" value={path.virtual_investment_value} />
        {path.virtual_investment_profit_loss !== 0 && <small> (<Money as="span" signed value={path.virtual_investment_profit_loss} />)</small>}</dd></div>}
      {path.virtual_investment_realized_profit_loss !== 0 && <div><dt>매도 실현손익</dt><dd><Money as="span" signed value={path.virtual_investment_realized_profit_loss} /></dd></div>}
      {path.savings_goal_reached_date && <div><dt>목표 달성</dt><dd>{md(path.savings_goal_reached_date)}</dd></div>}
      {path.purchase_delay_days > 0 && <div><dt>구매 시점</dt><dd>{path.purchase_delay_days}일 뒤</dd></div>}
    </dl>}
    {notes.length > 0 && <p className="st3-world-note">{notes.join(' ')}</p>}
  </article>;
}


export function Stage3Worlds() {
  const { user, day, home, params, updateParams, comparison, comparing, compareError, loading, error, retry, instruments, savedPlans, refreshSummary } = useTwin();
  const [visionFile, setVisionFile] = useState<File | null>(null);
  const [all, setAll] = useState(false);
  const [picked, setPicked] = useState('purchase_now');
  const [sel, setSel] = useState<number | null>(null);
  const [saveMessage, setSaveMessage] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { setSaveMessage(''); }, [params]);

  const updateAmount = (purchase_amount: number) => updateParams({
    purchase_amount, savings_amount: purchase_amount, investment_amount: purchase_amount,
    allocation: splitBudget(Math.min(purchase_amount, Math.max(0, home?.available_cash ?? 0))),
  });
  const allocated = Object.values(params.allocation).reduce((sum, n) => sum + n, 0);
  const capExceeded = allocated > params.purchase_amount || (home != null && allocated > home.available_cash);
  async function save() {
    if (!comparison || capExceeded) return;
    setSaving(true); setSaveMessage('');
    try { await saveScenario(params, picked); setSaveMessage('이 조건과 당시 예상 결과를 가상 기록에 보존했어요.'); refreshSummary(); }
    catch (e) { setSaveMessage(e instanceof Error ? e.message : '저장하지 못했어요. 다시 시도해 주세요.'); }
    finally { setSaving(false); }
  }

  const base = comparison?.paths.find(p => p.scenario_id === 'no_purchase');
  const active = comparison?.paths.find(p => p.scenario_id === picked) ?? comparison?.paths[0];
  const series: ChartSeries[] = comparison && base ? [
    { id: base.scenario_id, label: base.label, points: pathPoints(comparison.available_cash, comparison.as_of, base), tone: 'baseline' },
    ...comparison.paths.filter(p => p.scenario_id !== base.scenario_id && p.status === 'calculated').map(p => ({
      id: p.scenario_id, label: p.label, points: pathPoints(comparison.available_cash, comparison.as_of, p),
      tone: (p.scenario_id === active?.scenario_id ? 'alt' : 'muted') as ChartSeries['tone'],
    })),
  ] : [];
  const altSeries = series.find(s => s.tone === 'alt');
  const diverge = altSeries ? altSeries.points.findIndex((p, i) => p.value !== series[0].points[i]?.value) : -1;
  const n = series[0]?.points.length ?? 0;
  const selected = Math.min(sel ?? Math.min(14, n - 1), Math.max(0, n - 1));
  const candidate = home?.purchase_candidates.at(-1);
  const baselineNote = comparison
    ? comparison.baseline_source.startsWith('observed_7_day_mean')
      ? `평소 소비는 최근 7일 평균(하루 ${balanceText(comparison.baseline_daily_variable_expense)})으로 계산했어요.`
      : `평소 소비는 하루 ${balanceText(comparison.baseline_daily_variable_expense)}으로 가정했어요.`
    : '';

  const VERB: Record<string, string> = {
    purchase_now: '지금 사면', no_purchase: '사지 않으면', purchase_delay: '미뤄서 사면',
    virtual_savings: '그 돈을 가상 저축하면', virtual_investment: '그 돈으로 가상 투자하면', mixed: '돈을 나눠 쓰면',
  };
  const activeDiff = active && base && active.status === 'calculated' && base.status === 'calculated'
    ? active.future_balances['14'] - base.future_balances['14'] : null;

  return <div className="page st3 st3-worlds-page">
    <PageHead title="평행세계" sub="같은 시작 잔액에서 선택만 바꿔 계산한 가상의 미래예요. 실제 계좌의 돈은 움직이지 않아요." />
    {savedPlans.length > 0 && <p className="st6-saved-summary">저장한 경로 {savedPlans.length}개 · 저장 당시 예상 결과를 보존하고 있어요.</p>}
    <Stage3AiAgent user={user} day={day} onApplyAmount={amount => updateAmount(amount)} />
    <div className="st3-ai-vision-line">
      <label className="st3-ai-vision-upload">
        <span>쇼핑몰 화면을 AI로 분석해 결제 금액 가져오기</span>
        <input type="file" accept="image/png,image/jpeg,image/webp"
          onChange={e => { const file = e.currentTarget.files?.[0]; if (file) setVisionFile(file); e.currentTarget.value = ''; }} />
      </label>
      <small>이미지 지원 API 키가 있어야 호출돼요 · 인식한 가격은 확인 후 가상 비교에만 반영해요</small>
    </div>
    {visionFile && <Stage2Vision key={user + visionFile.name + visionFile.lastModified}
      userId={user} file={visionFile} onClose={() => setVisionFile(null)}
      onApply={({ amount }) => updateAmount(amount)} />}
    
    {error ? <ErrorNotice message={error} retry={retry} /> : loading || !home ? <Loading label="체험 계정 상태를 불러오는 중이에요" /> :
      <div className="st3-layout worlds">
        <div className="st3-col-side st3-controls">
          <section className="st3-card st3-section" aria-labelledby="st3-choice">
            <div className="st3-card-head"><div>
              <h2 id="st3-choice"><span className="st3-step" aria-label="1단계">1</span>무엇을 비교할까요</h2>
              <p className="st3-card-desc">금액을 바꾸면 여섯 세계가 바로 다시 계산돼요.</p>
            </div></div>
            {candidate && params.purchase_amount === candidate.main_product.final_estimated_payment &&
              <p className="st3-choice-product"><span>고민 중인 상품</span><b>{candidate.main_product.name}</b><small>쿠폰·배송비를 반영한 결제 예상액이에요</small></p>}
            <MoneyControl title="결제 금액" value={params.purchase_amount} onChange={updateAmount} />
            <div className="st3-formgrid">
              <Field label="사는 날"><input type="date" min={shiftDate(params.as_of, 1)} value={params.purchase_date}
                onChange={e => e.target.value && updateParams({ purchase_date: e.target.value })} /></Field>
              <Field label="미룬다면 며칠 뒤에"><span className="st3-input-unit"><input type="number" min="1" max="90" value={params.purchase_delay_days}
                onChange={e => updateParams({ purchase_delay_days: Math.min(90, Math.max(1, Math.round(Number(e.target.value) || 1))) })} /><span aria-hidden>일</span></span></Field>
              <Field label="결제 수단" wide><select value={params.payment_method}
                onChange={e => updateParams({ payment_method: e.target.value as CompareRequest['payment_method'] })}>
                <option value="debit">체크카드 (바로 출금)</option><option value="transfer">계좌이체</option>
                <option value="credit">신용카드 (출금일 지정)</option>
              </select></Field>
              {params.payment_method === 'credit' && <>
                <Field label="지금 살 때 카드 출금일"><input type="date" value={params.credit_debit_date ?? ''}
                  min={params.purchase_date} onChange={e => updateParams({ credit_debit_date: e.target.value || undefined })} /></Field>
                <Field label="미뤄 살 때 카드 출금일"><input type="date" value={params.delayed_credit_debit_date ?? ''}
                  min={shiftDate(params.purchase_date, params.purchase_delay_days)}
                  onChange={e => updateParams({ delayed_credit_debit_date: e.target.value || undefined })} /></Field>
              </>}
            </div>
            <details className="st3-more">
              <summary>저축·투자할 금액<small>{balanceText(params.savings_amount)} · {balanceText(params.investment_amount)}</small></summary>
              <p className="st3-note first">'가상 저축'과 '가상 투자' 세계에서 이 금액을 넣었다고 보고 계산해요.</p>
              <div className="st3-formgrid">
                <MoneyControl title="가상 저축" value={params.savings_amount} onChange={savings_amount => updateParams({ savings_amount })} />
                <MoneyControl title="가상 투자" value={params.investment_amount} onChange={investment_amount => updateParams({ investment_amount })} />
                <Field label="투자할 종목" wide hint={instruments.find(i => i.code === params.investment_code) ? `${md(instruments.find(i => i.code === params.investment_code)!.price_date)} 기준 1주 ${balanceText(instruments.find(i => i.code === params.investment_code)!.price)} (체험용 가격)` : undefined}>
                  <select value={params.investment_code ?? ''} onChange={e => updateParams({ investment_code: e.target.value })}>
                    {instruments.map(x => <option key={x.code} value={x.code}>{x.name}</option>)}
                  </select></Field>
              </div>
            </details>
          </section>
        </div>

        <div className="st3-col-main st3-results" aria-busy={comparing}>
          {compareError && <ErrorNotice message={compareError} retry={retry} />}
          {capExceeded && <p className="st3-card st3-note warn">나눠 쓸 금액의 합계가 결제 금액이나 지금 잔액보다 커서 계산할 수 없어요.</p>}
          {!comparison && !compareError && !capExceeded && <div className="st3-card"><Loading label="여섯 가지 세계를 계산하는 중이에요" /></div>}
          {comparison && !capExceeded && active && <>
            <section className="st3-card st3-compare" aria-labelledby="st3-compare">
              <div className="st3-card-head">
                <div>
                  <h2 id="st3-compare"><span className="st3-step" aria-label="2단계">2</span>결과 한눈에 보기</h2>
                  <p className="st3-card-desc">점선은 사지 않은 <b>기준 세계</b>, 파란 선은 고른 세계예요.</p>
                </div>
                {comparing && <span className="st3-updating" role="status">다시 계산 중</span>}
              </div>
              <p className="st3-summary"><span>
                {active.scenario_id === 'no_purchase'
                  ? <>사지 않으면 14일 뒤 잔액은 <Money as="b" value={active.future_balances['14']} />이에요.</>
                  : activeDiff == null ? <>{active.label} 세계는 조건을 더 채워야 계산할 수 있어요.</>
                  : activeDiff === 0 ? <>{VERB[active.scenario_id] ?? active.label} 14일 뒤 잔액은 기준 세계와 같아요.</>
                  : <>{VERB[active.scenario_id] ?? active.label} 14일 뒤 잔액이 기준보다 <b className={activeDiff < 0 ? 'neg' : 'pos'}>{balanceText(Math.abs(activeDiff))} {activeDiff < 0 ? '적어요' : '많아요'}</b>.</>}
                </span>{active.status === 'calculated' && <small>{active.first_shortfall_date ? `${mdw(active.first_shortfall_date)}부터 잔액이 0원 아래로 내려가요.` : '30일 동안 잔액이 부족한 날이 없어요.'}</small>}
              </p>
              <div className="st3-chips" role="group" aria-label="그래프에 표시할 세계">
                {comparison.paths.map(p => <button key={p.scenario_id} type="button" aria-pressed={p.scenario_id === active.scenario_id}
                  disabled={p.status !== 'calculated'} onClick={() => setPicked(p.scenario_id)}>{p.label}</button>)}
              </div>
              {series.length > 0 && <>
                <FlowChart label={`${active.label}와 기준 세계의 30일 잔액 비교`} series={series} selected={selected} onSelect={setSel}
                  divergeAt={diverge > 0 ? diverge : null} height={220} />
                <div className="st3-legend" aria-hidden>
                  <span className="baseline">기준 세계 (사지 않음)</span>
                  {active.scenario_id !== 'no_purchase' && <span className="alt">{active.label}</span>}
                  <span className="muted">나머지 세계</span>
                </div>
                <div className="st3-readout pair" aria-live="polite">
                  <span className="st3-readout-date">{selected === 0 ? '오늘' : `${mdw(series[0].points[selected].date)} 예상`}</span>
                  <div><span>기준 세계</span><Money value={series[0].points[selected].value} /></div>
                  {altSeries && <div className="alt"><span>{active.label}</span><Money value={altSeries.points[selected].value} /></div>}
                  {altSeries && <div className="diff"><span>차이</span><Money signed value={altSeries.points[selected].value - series[0].points[selected].value} /></div>}
                </div>
              </>}
              <p className="st3-note">{baselineNote} 결제·입금 일정은 모든 세계에 똑같이 들어가요.</p>
            </section>

            <section className="st3-card" aria-labelledby="st3-all">
              <div className="st3-card-head"><div>
                <h2 id="st3-all"><span className="st3-step" aria-label="3단계">3</span>세계별 14일 뒤 잔액</h2>
                <p className="st3-card-desc">모든 세계는 같은 잔액 <Money as="b" value={comparison.available_cash} />에서 출발해요. 누르면 그래프에 표시돼요.</p>
              </div></div>
              <div className="st3-worlds">{comparison.paths.slice(0, all ? 6 : 4).map(p =>
                <PathCard key={p.scenario_id} path={p} base={base} active={p.scenario_id === active.scenario_id} onPick={() => setPicked(p.scenario_id)} />)}</div>
              <button type="button" className="st3-btn ghost st3-expand" onClick={() => setAll(v => !v)}>{all ? '핵심 경로만 보기' : '투자·혼합 배분까지 6개 모두 보기'}</button>
            </section>

            <div className="st3-save-row">
              <button type="button" className="st3-btn primary st3-save" disabled={saving || comparing} onClick={() => void save()}>{saving ? '저장 중…' : '이 비교 조건 저장하기'}</button>
              {saveMessage && <p role="status" className="st3-note">{saveMessage}</p>}
            </div>
          </>}
        </div>
      </div>}
  </div>;
}

/* ───────────────────────── 가상 저축 · 투자 ───────────────────────── */

export function Stage3Assets({ focus = 'save' }: { focus?: 'save' | 'invest' }) {
  const nav = useNav();
  const { home, instruments, comparison, error, loading, retry, newsStatus } = useTwin();
  const title = focus === 'invest' ? '가상 투자' : '모으기';
  const sub = focus === 'invest' ? '체험용 가격으로 하는 모의투자예요. 결제계좌와 따로 계산해요.' : '평행세계에서 아낀 돈을 가상 저축으로 모아요.';
  const byCode = new Map(instruments.map(i => [i.code, i]));
  const positions = Object.entries(home?.virtual_investments.positions ?? {});
  const saved = comparison?.paths.filter(p => p.status === 'calculated' && (p.virtual_savings > 0 || p.virtual_investment_value > 0)) ?? [];

  const invest = home && <section className="st3-block" aria-labelledby="st3-portfolio">
    <div className="st3-block-head"><h2 id="st3-portfolio">모의투자 계좌</h2>
      <p>{home.virtual_investments.snapshot_date ? `${md(home.virtual_investments.snapshot_date)} 기준` : ''} 체험용 포트폴리오</p></div>
    <div className="st3-kpi"><span>투자에 쓸 수 있는 가상 현금</span><Money value={home.virtual_investments.virtual_cash} /></div>
    <button type="button" className="st3-btn ghost st3-learning-link" onClick={() => nav.setTab('learn')}>
      오늘의 맞춤 금융 퀴즈 풀기
    </button>
    {positions.length ? <table className="st3-table">
      <thead><tr><th scope="col">종목</th><th scope="col">수량</th><th scope="col">매수 금액</th><th scope="col">기준일 가격 환산</th></tr></thead>
      <tbody>{positions.map(([code, v]) => {
        const inst = byCode.get(code);
        const value = inst ? inst.price * v.qty : null;
        const pl = value != null ? value - v.cost_basis : null;
        return <tr key={code}>
          <th scope="row">{inst?.name ?? code}<small>{code}</small></th>
          <td className="num">{v.qty.toLocaleString('ko-KR')}주</td>
          <td><Money as="span" value={v.cost_basis} /></td>
          <td>{value != null ? <><Money as="span" value={value} />{pl != null && <small className={pl > 0 ? 'up' : pl < 0 ? 'down' : ''}><Money as="span" signed value={pl} /></small>}</> : '가격 없음'}</td>
        </tr>;
      })}</tbody>
    </table> : <p className="st3-empty">보유한 종목이 없어요.</p>}
    <p className="st3-note">평가 금액은 기준일 체험용 가격 × 보유 수량이에요. 실제 시세가 아니고, 실제 투자라면 원금 손실이 날 수 있어요.</p>
  </section>;

  const prices = <section className="st3-block" aria-labelledby="st3-prices">
    <div className="st3-block-head"><h2 id="st3-prices">체험용 종목 가격</h2><p>과거 기록으로 만든 테스트 가격이에요.</p></div>
    {instruments.length ? <ul className="st3-list">{instruments.map(i => <li key={i.code}>
      <span className="st3-tx-name">{i.name}<small>{i.code} · {md(i.price_date)}</small></span><Money as="span" value={i.price} /></li>)}</ul>
      : <p className="st3-empty">기준일까지의 가격 기록이 없어요.</p>}
  </section>;

  const savings = home && <section className="st3-block" aria-labelledby="st3-savings">
    <div className="st3-block-head"><h2 id="st3-savings">평행세계에서 모은 돈</h2><p>지금 비교 중인 조건 기준이에요. 결제계좌에서 실제로 빠져나가지 않아요.</p></div>
    {saved.length ? <ul className="st3-list">{saved.map(p => <li key={p.scenario_id}>
      <span className="st3-tx-name">{p.label}{p.scenario_id === 'mixed' && <small>{[p.virtual_savings > 0 && `저축 ${balanceText(p.virtual_savings)}`, p.virtual_investment_value > 0 && `투자 ${balanceText(p.virtual_investment_value)}`].filter(Boolean).join(' · ')}</small>}</span>
      <Money as="span" value={p.virtual_savings + p.virtual_investment_value} /></li>)}</ul>
      : <p className="st3-empty">평행세계에서 저축이나 투자를 고르면 여기에 모여요.</p>}
    <div className="st3-kpi muted"><span>저축 목표</span><b>{home.savings_goals.length ? `${home.savings_goals.length}개` : '아직 없어요'}</b></div>
    <button type="button" className="st3-btn" onClick={() => nav.setTab('forks')}>평행세계에서 저축 조건 바꾸기</button>
  </section>;

  return <div className="page st3 st3-assets">
    <PageHead title={title} sub={sub} />
    
    {error ? <ErrorNotice message={error} retry={retry} /> : loading || !home ? <Loading label="가상 자산을 불러오는 중이에요" /> :
      <div className="st3-layout">
        <div className="st3-col-main">{focus === 'invest' ? invest : savings}
          {focus === 'invest' && <section className="st6-news" aria-label="보유 종목 관련 뉴스">
            <h2>내 보유 종목 관련 뉴스</h2>
            <p>{newsStatus === 'provider_not_configured' ? '확인 가능한 뉴스 출처가 아직 연결되지 않았어요. 실제 뉴스가 확인되기 전까지 가상 뉴스를 보여주지 않아요.' : '관련 뉴스를 확인할 수 없어요.'}</p>
          </section>}
        </div>
        <aside className="st3-col-side">{focus === 'invest' ? prices : invest}{focus === 'invest' && savings}</aside>
      </div>}
  </div>;
}

/* ─────────────── Stage 6: personal Insights (same FastAPI data) ─────────────── */

export function Stage3Insights() {
  const nav = useNav();
  const { home, briefing, briefingError, savedPlans, planTracking, error, loading, retry } = useTwin();
  const week = home?.daily_cashflow.slice(0, 7) ?? [];
  const changes = briefing?.change_detection.events ?? [];
  const observed = planTracking?.daily_spend_comparison ?? [];
  return <div className="page st3 st3-insights">
    <header className="st6-insights-title">
      <button type="button" className="st3-link" onClick={() => nav.pop()}>‹ 홈으로</button>
      <h1>내 금융 변화</h1>
      <p>금융 선택 이후의 계획과 관측 기록을 비교해요.</p>
    </header>
    {error ? <ErrorNotice message={error} retry={retry}/> : loading || !home ? <Loading label="금융 기록을 불러오는 중이에요"/> : <>
      <p className="st6-insights-asof">{mdw(home.as_of_date)} 기준 · 가상 체험 데이터</p>
      <section className="st6-insights-section" aria-labelledby="st6-week">
        <h2 id="st6-week">앞으로 7일 결제계좌 현금흐름</h2>
        <ul className="st3-list">
          {week.map(d => <li key={d.date}><time dateTime={d.date}>{mdw(d.date)}</time>
            <span><Money as="span" value={d.closing_balance} className={d.closing_balance < 0 ? 'neg' : ''} /></span></li>)}
        </ul>
        <small className="st3-muted">확정된 금융 일정과 변동 지출 전망 기준이며 미래 관측 잔액이 아니에요.</small>
      </section>
      <section className="st6-insights-section" aria-labelledby="st6-differences">
        <h2 id="st6-differences">이번에 달라진 점</h2>
        {changes.length ? <ul className="st3-list">{changes.map((e,i) =>
          <li key={e.code+i}><span>{e.title}</span><small>{e.importance === 'high' ? '확인 필요' : '변화 감지'}</small></li>)}</ul> :
          <p>{briefing?.change_detection.status === 'first_analysis'
            ? '첫 분석이라 지난 결과와 비교할 수 없어요.'
            : briefingError || '지난 분석 이후 새로 확인된 주요 변화가 없어요.'}</p>}
      </section>
      <section className="st6-insights-section" aria-labelledby="st6-plans">
        <h2 id="st6-plans">저장한 평행세계</h2>
        {savedPlans.length ? <ul className="st3-list">{savedPlans.map(p => <li key={p.id}>
          <span>{p.label}<small>{p.analysis_as_of} 기준 · {p.kind === 'agent' ? '추천 경로' : '직접 비교'}</small></span>
          <span>{p.has_immutable_snapshot ? '당시 결과 보존' : '기존 기록'}</span>
        </li>)}</ul> : <p>저장한 계획이 없어요. 평행세계에서 경로를 저장하면 이후 기록과 비교할 수 있어요.</p>}
      </section>
      <section className="st6-insights-section" aria-labelledby="st6-plan-actual">
        <h2 id="st6-plan-actual">예상 지출과 이후 관측 지출</h2>
        {observed.length ? <table className="st3-table">
          <thead><tr><th scope="col">날짜</th><th scope="col">당시 예상</th><th scope="col">이후 관측</th></tr></thead>
          <tbody>{observed.map(row => <tr key={row.date}>
            <th scope="row">{md(row.date)}</th>
            <td><Money as="span" value={row.predicted}/></td>
            <td>{row.observed == null ? '기록 없음' : <Money as="span" value={row.observed}/>}</td>
          </tr>)}</tbody></table> :
          <p>{planTracking?.message || '저장 시점 이후 관측 기록이 있어야 차이를 계산할 수 있어요.'}</p>}
        <small className="st3-muted">누락된 관측 기록이나 결제일 변경을 무조건 AI 예측 오류로 판단하지 않아요.</small>
      </section>
      <section className="st6-insights-section" aria-labelledby="st6-goal">
        <h2 id="st6-goal">가상 저축·투자</h2>
        <p>{home.savings_goals.length ? '설정한 가상 저축 목표가 있어요.' :
          '원본 기록에는 저축 목표가 없어요. 평행세계에서 금액과 목표를 설정해 비교할 수 있어요.'}</p>
        <p>모의투자 현금 <Money as="span" value={home.virtual_investments.virtual_cash}/> ·
          보유 종목 {Object.keys(home.virtual_investments.positions ?? {}).length}개</p>
      </section>
      <p className="st3-note">실제 은행 거래와 연결하지 않은 합성 관측 데이터입니다. 미래 날짜의 기록을 과거 거래로 표시하지 않아요.</p>
    </>}
  </div>;
}

/* ───────────────────────── 가계부 ───────────────────────── */

type LedgerFilter = 'all' | 'spend' | 'transfer';
export function Stage3Ledger() {
  const { home, user, day, error, loading, retry } = useTwin();
  const [rows, setRows] = useState<LedgerTransaction[] | null>(null);
  const [rowsKey, setRowsKey] = useState('');
  const [rowsError, setRowsError] = useState('');
  const [filter, setFilter] = useState<LedgerFilter>('all');
  const [limit, setLimit] = useState(40);
  useEffect(() => {
    if (!user || !day) return;
    const controller = new AbortController();
    setRows(null); setRowsKey(''); setRowsError(''); setLimit(40);
    getTransactions(user, day, controller.signal)
      .then(r => { if (!controller.signal.aborted) { setRows(r.transactions); setRowsKey(`${user}:${day}`); } })
      .catch(e => { if (!controller.signal.aborted) setRowsError(e instanceof Error ? e.message : '거래 내역을 불러오지 못했어요.'); });
    return () => controller.abort();
  }, [user, day]);
  const visible = rowsKey === `${user}:${day}` ? rows : null;

  const monthStart = shiftDate(day || '2026-01-01', -29);
  const recent = (visible ?? []).filter(t => t.kind === 'spend' && t.date >= monthStart && t.date <= day);
  const spendTotal = recent.reduce((s, t) => s + Math.abs(t.amount), 0);
  const byCat = Object.entries(recent.reduce<Record<string, number>>((m, t) => { m[t.category || '기타'] = (m[t.category || '기타'] ?? 0) + Math.abs(t.amount); return m; }, {}))
    .sort((a, b) => b[1] - a[1]);
  const list = (visible ?? []).filter(t => filter === 'all' || (filter === 'spend' ? t.kind === 'spend' : t.kind !== 'spend'));
  const groups: { date: string; items: LedgerTransaction[] }[] = [];
  for (const t of list.slice(0, limit)) {
    const g = groups.at(-1);
    if (g && g.date === t.date) g.items.push(t); else groups.push({ date: t.date, items: [t] });
  }

  return <div className="page st3 st3-ledger">
    <PageHead title="가계부" sub={day ? `${mdw(day)}까지 기록된 거래` : undefined} />
    
    {error ? <ErrorNotice message={error} retry={retry} /> : loading || !home ? <Loading label="거래 내역을 불러오는 중이에요" /> :
      <div className="st3-layout">
        <div className="st3-col-main">
          <section className="st3-block" aria-labelledby="st3-tx">
            <div className="st3-block-head row"><h2 id="st3-tx">거래 내역</h2>
              <div className="st3-seg" role="group" aria-label="거래 종류">
                {([['all', '전체'], ['spend', '지출'], ['transfer', '이체']] as const).map(([v, l]) =>
                  <button key={v} type="button" aria-pressed={filter === v} onClick={() => { setFilter(v); setLimit(40); }}>{l}</button>)}
              </div></div>
            {rowsError ? <ErrorNotice message={rowsError} retry={retry} /> : !visible ? <Loading label="거래 내역을 불러오는 중이에요" /> :
              groups.length ? <>
                {groups.map(g => {
                  const out = g.items.reduce((s, t) => s + (txSign(t) < 0 ? Math.abs(t.amount) : 0), 0);
                  return <div className="st3-day" key={g.date}>
                    <h3><span>{mdw(g.date)}</span>{out > 0 && <Money as="span" signed value={-out} />}</h3>
                    <ul className="st3-list">{g.items.map(t => <TxRow key={t.id} tx={t} />)}</ul>
                  </div>;
                })}
                {list.length > limit && <button type="button" className="st3-btn ghost st3-expand" onClick={() => setLimit(l => l + 60)}>이전 거래 더 보기 ({list.length - limit}건)</button>}
              </> : <p className="st3-empty">이 조건에 맞는 거래가 없어요.</p>}
          </section>
        </div>
        <aside className="st3-col-side">
          <section className="st3-block" aria-labelledby="st3-month">
            <div className="st3-block-head"><h2 id="st3-month">최근 30일 지출</h2><p>{md(monthStart)}~{md(day)} · 내 계좌 간 이체 제외</p></div>
            {visible ? <>
              <Money value={spendTotal} className="st3-total" />
              {byCat.length > 0 && <ul className="st3-bars">{byCat.slice(0, 6).map(([c, v]) => <li key={c}>
                <span className="st3-bar-label">{c}</span>
                <span className="st3-bar"><i style={{ width: `${Math.max(2, (v / byCat[0][1]) * 100)}%` }} /></span>
                <Money as="span" value={v} /></li>)}</ul>}
            </> : <Loading label="지출 합계를 계산하는 중이에요" />}
          </section>
          <section className="st3-block" aria-labelledby="st3-scheduled">
            <div className="st3-block-head"><h2 id="st3-scheduled">예정된 결제</h2><p>앞으로 14일</p></div>
            {home.upcoming_essential_payments.length ? <ul className="st3-list">{home.upcoming_essential_payments.map(e =>
              <li key={e.id}><span className="st3-tx-name">{e.label}<small>{mdw(e.debit_at)} · {METHOD[e.payment_method] ?? '자동 출금'}</small></span>
                <Money as="span" signed value={e.amount} /></li>)}</ul> : <p className="st3-empty">예정된 필수 결제가 없어요.</p>}
          </section>
        </aside>
      </div>}
  </div>;
}

/* ───────────────────────── 기존 v22 홈 디자인 + 실제 FastAPI 데이터 ─────────────────────────
 * 공개 기본 주소에서는 기존 홈의 정보 위계와 스타일을 보존한다.
 * v22의 로컬 S01 숫자를 그대로 보여주지 않고 20명 각각의 API 값을 사용한다.
 */
export function Stage3ClassicHome() {
  const nav = useNav();
  const { user, day, viewDay, home, comparison, params, updateParams, loading, error, retry } = useTwin();
  const [expandedAssets, setExpandedAssets] = useState(false);
  const [chartSelected, setChartSelected] = useState<number | null>(null);
  useEffect(() => setChartSelected(null), [user, viewDay]);

  if (error) return <div className="page t-page ux-home ux-canonical-home">
    <header className="t-head"><div><h1 className="with-logo"><Logo size={26} />모아</h1></div></header>
    <ErrorNotice message={error} retry={retry} />
  </div>;
  if (loading || !home) return <div className="page t-page ux-home ux-canonical-home">
    <header className="t-head"><div><h1 className="with-logo"><Logo size={26} />모아</h1></div></header>
    <Loading label="공통 금융 데이터셋을 불러오는 중이에요" />
  </div>;

  const forecastDay = viewDay > home.observation_end;
  const forecastOnly = viewDay !== day;
  // Distinguish an unobserved future projection from confirmed local transactions.
  const forecastRow = home.daily_cashflow.find(d => d.date === viewDay);
  const shownBalance = forecastOnly ? (forecastRow?.closing_balance ?? null) : home.available_cash;
  const horizon = [3, 7, 14];
  const points = [
    { date: home.as_of_date, value: home.available_cash },
    ...home.daily_cashflow.map(d => ({ date: d.date, value: d.closing_balance })),
  ];
  const defaultIndex = forecastDay ? Math.max(0, points.findIndex(p => p.date === viewDay)) : 0;
  const selected = chartSelected == null ? defaultIndex : Math.min(chartSelected, points.length - 1);
  const shortfall = firstShortfall(home.daily_cashflow);
  const recent = home.recent_transactions.slice(0, 3);
  const investmentCount = Object.keys(home.virtual_investments.positions ?? {}).length;

  return <div className="page t-page t-home ux-home ux-canonical-home">
    <header className="t-head">
      <div><h1 className="with-logo"><Logo size={26} />모아</h1>
        <p className="t-head-sub">결제일을 확인하고, 오늘의 소비를 관리해요</p></div>
    </header>

    <div className="ux-home-demo-clock" aria-label="가상 시연 기준일">
      <div><span>체험 데이터 · {user}</span><b>{mdw(viewDay)} {forecastDay ? '예상' : '기준'}</b></div>
      <span className="ux-home-date">{forecastDay ? '예상 수치 · 실제 거래 아님' : '실제 계좌가 아닌 예시 기록'}</span>
    </div>

    <HomeAiSpotlight />

    <div className="ux-home-risk">
      <section className={`t-card mo-home ux-canonical-risk ${shortfall ? 'g-caution' : ''}`} aria-label="다가오는 결제일 상태">
        <div className="mo-home-top">
          <span className="h-tag real">내 결제계좌 · 가상 데이터</span>
          <span className={`ux-canonical-risk-flag ${shortfall ? 'warning' : ''}`}>{shortfall ? '결제일 주의' : '결제 예정 확인'}</span>
        </div>
        <p className="mo-home-title">{shortfall
          ? `${mdw(shortfall.date)}에 결제계좌 잔액이 부족해질 수 있어요`
          : '예정된 결제일까지 잔액 흐름을 확인했어요'}</p>
        <div className="ux-canonical-risk-value">
          <small>{forecastDay
            ? `${mdw(viewDay)} ${forecastOnly ? '예상 마감 잔액' : '확인된 거래 기준 부분 잔액'}`
            : `${mdw(home.as_of_date)} 관측 결제계좌 잔액`}</small>
          <strong className="num">{shownBalance == null ? '예측 범위를 벗어났어요' : balanceText(shownBalance)}</strong>
          <span>{forecastDay
            ? (forecastOnly ? '미래 현금흐름 예측 · 실제 결제 기록 아님' : '확정 잔액 아님 · 확인한 거래만 반영 · 미기록 지출 제외')
            : '관측된 합성 금융 기록 기준 · 실제 은행 잔액 아님'}</span>
        </div>
        <div className="ux-python-audit">
          <div className="ux-python-audit-head"><strong>앞으로 14일 <span>· 예상 잔액</span></strong>
            <small>{mdw(home.as_of_date)} 관측 기준</small></div>
          <div className="ux-python-audit-values">
            {horizon.map(days => <div key={days}><span>{days}일 뒤</span>
              <strong className="num">{balanceText(home.future_balances[String(days)])}</strong></div>)}
          </div>
          <div className="st3 ux-canonical-chart">
            <FlowChart label="앞으로 14일 예상 결제계좌 잔액" series={[{id:'canonical',label:'예상 잔액',tone:'single',points}]}
              selected={selected} onSelect={setChartSelected} height={150} />
            <p className="ux-canonical-chart-caption">{mdw(points[selected].date)} {selected === 0 ? '관측 잔액' : '예상 마감 잔액'} · <b>{balanceText(points[selected].value)}</b></p>
          </div>
          {shortfall && <p className="ux-home-finance-caution">{mdw(shortfall.date)}에 최소 잔액 {balanceText(Math.min(shortfall.lowest_balance, shortfall.closing_balance))}이 예상돼요. 필수 결제 일정을 확인해 주세요.</p>}
        </div>
      </section>
    </div>

    <section className="ux-home-ledger" aria-label="최근 거래 기록">
      <header className="ux-home-section-heading">
        <div><small className="ux-home-overline">RECENT · 결제계좌 거래</small><h2>최근 가계부</h2></div>
        <span className="ux-home-date">{mdw(home.as_of_date)}까지</span>
      </header>
      {recent.length
        ? <div className="ux-canonical-tx-list">{recent.map(tx => <div className="ux-canonical-tx" key={tx.id}>
            <span><b>{tx.name}</b><small>{mdShort(tx.date)} · {tx.category || METHOD[tx.method] || '금융 거래'}</small></span>
            <strong className="num">{signedText(txSign(tx) * Math.abs(tx.amount))}</strong>
          </div>)}</div>
        : <div className="ux-home-empty"><strong>표시할 관측 거래가 없어요</strong><p>기준일까지 기록된 거래를 확인해 주세요.</p></div>}
      <div className="ux-home-ledger-bottom"><span>관측된 거래 <b className="num">{home.observed_transaction_count}건</b></span>
        <small>미래 예상 거래는 실제 내역으로 표시하지 않아요</small></div>
      <div className="ux-home-ledger-actions">
        <button type="button" onClick={() => nav.setTab('ledger')}>전체 거래 보기 ›</button>
        <button type="button" onClick={() => nav.setTab('forks')}>미래 지출 비교 ›</button>
      </div>
    </section>

    <section className="ux-home-decision" aria-label="소비 선택 비교하기">
      <small className="ux-home-overline">BEFORE YOU BUY · 소비 결정</small>
      <h2>지금 사면, 다음 결제일은 괜찮을까요?</h2>
      <p>현재 관측된 잔액에서 구매와 보류를 계산해요. 가상 선택만으로 실제 잔액은 움직이지 않아요.</p>
      <button type="button" className="ux-home-primary" onClick={() => nav.setTab('forks')}>소비 선택 비교하기 <span aria-hidden="true">→</span></button>
    </section>

    <HomeWorldPreview
      comparison={comparison}
      amount={params.purchase_amount}
      onAmount={price => updateParams({
        purchase_amount: price,
        savings_amount: price,
        investment_amount: price,
        allocation: splitBudget(Math.min(price, Math.max(0, home.available_cash))),
      })}
      onExpand={() => nav.setTab('forks')}
    />

    <section className="ux-home-extras" aria-label="가상 자산">
      <div className="ux-home-section-heading">
        <div><small className="ux-home-overline">SANDBOX · 가상 실험</small><h2>가상 자산</h2></div>
      </div>
      <button type="button" className="ux-home-expand" aria-expanded={expandedAssets} onClick={() => setExpandedAssets(v => !v)}>
        <span><b>가상 자산 구성</b><small>모의 계좌·ETF 평가액 · 실제 금융자산 아님</small></span>
        <strong className="num">{investmentCount}개 종목</strong><span aria-hidden="true">{expandedAssets ? '−' : '+'}</span>
      </button>
      {expandedAssets && <div className="ux-home-assets">
        <div className="ux-home-asset-detail"><span>모의투자 현금</span><b className="num">{balanceText(home.virtual_investments.virtual_cash ?? 0)}</b></div>
        <div className="ux-home-asset-detail"><span>보유 종목</span><b>{investmentCount}개</b></div>
        <button type="button" onClick={() => nav.setTab('invest')}>가상 투자 상세로 이동 ›</button>
      </div>}
    </section>
    <p className="ux-home-legal">공통 20명 합성 금융 데이터셋과 Python 예측·시뮬레이션을 사용해요. 은행과 자동 연결되지 않으며, 가상 자산은 실제 잔액과 합산하지 않아요.</p>
  </div>;
}
