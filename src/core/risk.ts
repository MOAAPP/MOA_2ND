/**
 * 위험 판단 (기획서 '위험 판단: 설명 가능한 네 시나리오로 시작', '데이터 양에 따른 예측 방식').
 *
 * 같은 계산 엔진에 조건만 바꿔 넣는다.
 *   등록 일정 기준: 예측 지출 없이 확정 입출금 + 등록 일정만
 *   기본:         일별 예측값 + 예정 입금
 *   상단 지출:     기본 + 결제일까지 남은 기간 h에 맞춘 상단 폭
 *   입금 지연:     기본 예측 + 예정 입금 +3일
 *   복합:         상단 지출 + 입금 지연
 * 확률은 만들지 않는다. 등급만 낸다.
 */
import { addDays, diffDays, type ISODate } from '../../shared/dates';
import { dayOf, latestAnchor, projectBalance, type Anchor, type DayBalance } from './balance';
import { cumulativeErrors, upperWidth } from './evaluate';
import { chooseStage, labeledDays, methodShares, placeForecast, predictFrom, recordPeriodDays, recordedToday, weekdayMean, type DailyPredictor, type ForecastStage, type ShareResult } from './forecast';
import { buildLedger, type BillReconciliation, type Posting } from './ledger';
import { hasRecentGap, reconcileBalances, type ReconcileItem } from './reconcile';
import { expandFixed, expandIncomes } from './schedule';
import { dateRange, kstDate, kstStart, DAY_MS } from './time';
import { paymentAccount, type BalanceObservation, type DayStatus, type Ms, type Txn, type UserSetup } from './types';

export type Grade = 'ok' | 'combined_caution' | 'caution' | 'high' | 'registered_short';
export const GRADE_ORDER: Grade[] = ['ok', 'combined_caution', 'caution', 'high', 'registered_short'];
export const gradeRank = (g: Grade) => GRADE_ORDER.indexOf(g);
export const maxGrade = (a: Grade, b: Grade): Grade => (gradeRank(a) >= gradeRank(b) ? a : b);

export const GRADE_LABEL: Record<Grade, string> = {
  registered_short: '등록 일정 기준 부족',
  high: '부족 가능성 높음',
  caution: '주의',
  combined_caution: '복합 상황 주의',
  ok: '여유',
};

/** 성능 주장 범위 */
export const HORIZON_DAYS = 14;
/** 화면 참고용 잔고 흐름 */
export const REFERENCE_DAYS = 30;
/** 잔액 정보가 이보다 오래되면 '잔액 확인 필요', '부족 가능성 높음'을 내지 않음 */
export const STALE_DAYS = 7;
export const DEFAULT_DELAY_DAYS = 3;
/**
 * 본인·공통 오차가 모두 없을 때(첫 2~3주)의 임시 상단 폭: 기본 누적 예측의 50%.
 * 데이터에서 정한 값이 아닌 보수적 가정이며, 공통 오차가 쌓이면 쓰이지 않는다.
 */
export const FALLBACK_UPPER_RATIO = 0.5;

export type Scenario = 'registered' | 'base' | 'upper' | 'delay' | 'combined';

export interface PaymentEvent {
  date: ISODate;
  label: string;
  kind: 'fixed' | 'card';
  /** 결제일까지 남은 일수 */
  h: number;
  /** 시나리오별 결제일 하루 최저 잔고 (계산하지 않은 시나리오는 null) */
  balance: Record<Scenario, number | null>;
  /** 시나리오별 부족 금액 (0 이상) */
  shortage: Record<Scenario, number | null>;
  grade: Grade;
  /** 등급 제한 전 원래 등급 */
  rawGrade: Grade;
  /** 기본 시나리오에서 결제일에 빠지는 금액 */
  amount: number;
  upperWidth: { width: number; source: 'personal' | 'global' | 'fallback' } | null;
}

export interface RiskReport {
  now: Ms;
  today: ISODate;
  anchor: (Anchor & { ageDays: number }) | null;
  stage: ForecastStage;
  predictor: string | null;
  shares: ShareResult | null;
  events: PaymentEvent[];
  /** 14일 안 결제일 중 가장 높은 등급 (같으면 가장 이른 날) */
  top: PaymentEvent | null;
  grade: Grade;
  /** 시나리오별 일별 잔고 (기본은 30일 참고 범위까지) */
  paths: Partial<Record<Scenario, DayBalance[]>>;
  /** 불확실 입금이 들어온다고 가정했을 때의 등급 — 참고로만 */
  ifUncertainArrives: Grade | null;
  flags: {
    needsBalanceCheck: boolean;
    recordGap: boolean;
    unknownCards: string[];
    overdueIncomes: { id: string; name: string; date: ISODate; amount: number }[];
    sameDayIncomes: string[];
    billsToConfirm: BillReconciliation[];
  };
  reconcile: ReconcileItem[];
  /** 근거 화면: 확정 출금 합계, 예상 변동 지출, 입금 상태 */
  basis: { confirmedOut: number; forecastOut: number; scheduledIn: number; uncertainIn: number };
}

export interface RiskInput {
  setup: UserSetup;
  txns: Txn[];
  observations: BalanceObservation[];
  dayStatus: Map<ISODate, DayStatus>;
  now: Ms;
  /** ML 채택 조건을 넘은 경우에만 */
  ml?: { adopted: boolean; predictor: DailyPredictor };
  /** 전체 사용자 공통 h일 누적 오차 (h → 오차 목록) */
  globalErrors?: Record<number, number[]>;
  horizonDays?: number;
}

export function assessRisk(input: RiskInput): RiskReport {
  const { setup, txns, now } = input;
  const H = input.horizonDays ?? HORIZON_DAYS;
  const today = kstDate(now);
  const until = addDays(today, H);
  const refUntil = addDays(today, REFERENCE_DAYS);
  const pay = paymentAccount(setup);
  const delay = setup.incomeDelayDays ?? DEFAULT_DELAY_DAYS;
  const ledger = buildLedger(txns, setup.cards);
  const anchor = latestAnchor(input.observations, pay.id);
  const reconcile = reconcileBalances(input.observations, ledger.postings, setup.fixed, txns, pay.id);

  const empty: RiskReport = {
    now,
    today,
    anchor: null,
    stage: 'none',
    predictor: null,
    shares: null,
    events: [],
    top: null,
    grade: 'ok',
    paths: {},
    ifUncertainArrives: null,
    flags: { needsBalanceCheck: true, recordGap: false, unknownCards: ledger.unknownCards, overdueIncomes: [], sameDayIncomes: [], billsToConfirm: ledger.bills.filter((b) => b.needsConfirm) },
    reconcile,
    basis: { confirmedOut: 0, forecastOut: 0, scheduledIn: 0, uncertainIn: 0 },
  };
  if (!anchor) return empty;

  const ageDays = (now - anchor.t0) / DAY_MS;
  const stale = ageDays > STALE_DAYS;
  const recordGap = hasRecentGap(reconcile, now);

  // 확정분: t₀ 이후 확정 거래 + 고정 출금 일정
  const confirmed = ledger.postings.filter((p) => p.debitAt > anchor.t0);
  const fixed = expandFixed(setup.fixed, anchor.t0, refUntil, txns);
  const inc = expandIncomes(setup.incomes, anchor.t0, refUntil, txns, delay);

  // 예측
  const labels = labeledDays(txns, input.dayStatus);
  const period = recordPeriodDays(txns, input.dayStatus, today);
  const stage = chooseStage(period, labels.length, !!input.ml?.adopted);
  const model: DailyPredictor | null = stage === 'ml' ? input.ml!.predictor : stage === 'baseline' ? weekdayMean : null;

  let forecast: Posting[] = [];
  let totals: { date: ISODate; total: number }[] = [];
  let shares: ShareResult | null = null;
  if (model) {
    shares = methodShares(txns, setup.cards, pay.id, today, setup.mainMethod);
    const targets = dateRange(today, refUntil);
    // 예측 시점은 오늘 아침: 어제까지 라벨로 오늘부터 예측 (오늘 라벨은 하루가 끝나야 확정)
    const preds = predictFrom(model, labels, addDays(today, -1), targets);
    const placed = placeForecast({
      runId: `r${now}`,
      r: Math.max(now, anchor.t0),
      until: refUntil,
      daily: targets.map((date, i) => ({ date, amount: preds[i] })),
      shares,
      todayRecorded: recordedToday(txns, setup.cards, pay.id, now),
      paymentAccountId: pay.id,
    });
    forecast = placed.postings;
    totals = placed.totals;
  }

  const run = (parts: Posting[]) => projectBalance(anchor, parts, pay.id, refUntil);
  const paths: RiskReport['paths'] = {
    registered: run([...confirmed, ...fixed, ...inc.scheduled]),
  };
  if (model) {
    paths.base = run([...confirmed, ...fixed, ...inc.scheduled, ...forecast]);
    paths.delay = run([...confirmed, ...fixed, ...inc.delayed, ...forecast]);
  }

  // 결제일 목록: 필수 고정 출금 + 카드 결제일 (오늘 ~ 14일)
  const evMap = new Map<string, { date: ISODate; label: string; kind: 'fixed' | 'card' }>();
  for (const p of fixed) {
    const d = kstDate(p.debitAt);
    if (p.essential && d >= today && d <= until) evMap.set(`f:${p.id}`, { date: d, label: p.label ?? '고정 지출', kind: 'fixed' });
  }
  for (const p of [...confirmed, ...forecast]) {
    if (p.role !== 'card_charge' || !p.payDate || p.accountId !== pay.id) continue;
    if (p.payDate >= today && p.payDate <= until) evMap.set(`c:${p.cardId}:${p.payDate}`, { date: p.payDate, label: `${cardName(setup, p.cardId)} 카드값`, kind: 'card' });
  }

  const events: PaymentEvent[] = [];
  for (const ev of evMap.values()) {
    const h = Math.max(1, diffDays(today, ev.date));
    const low = (s: Scenario) => (paths[s] ? dayOf(paths[s]!, ev.date)?.low ?? null : null);
    const balance: Record<Scenario, number | null> = { registered: low('registered'), base: low('base'), upper: null, delay: low('delay'), combined: null };
    let width: PaymentEvent['upperWidth'] = null;
    if (model && balance.base !== null) {
      const fcUpTo = totals.filter((t) => t.date <= ev.date).reduce((s, t) => s + t.total, 0);
      const hitUpTo = -forecast.filter((p) => p.accountId === pay.id && p.debitAt < kstStart(ev.date) + DAY_MS).reduce((s, p) => s + p.amount, 0);
      const hitRatio = fcUpTo > 0 ? Math.min(1, hitUpTo / fcUpTo) : 0;
      const w = upperWidth(cumulativeErrors(model, labels, h, addDays(today, -1)), input.globalErrors?.[h]);
      width = w ?? { width: Math.round(fcUpTo * FALLBACK_UPPER_RATIO), source: 'fallback' };
      const shift = Math.round(width.width * hitRatio);
      balance.upper = balance.base - shift;
      balance.combined = balance.delay !== null ? balance.delay - shift : null;
    }
    const shortage = Object.fromEntries(Object.entries(balance).map(([k, v]) => [k, v === null ? null : Math.max(0, -v)])) as Record<Scenario, number | null>;
    const neg = (s: Scenario) => (balance[s] ?? 0) < 0;
    const rawGrade: Grade = neg('registered') ? 'registered_short' : neg('base') ? 'high' : neg('upper') || neg('delay') ? 'caution' : neg('combined') ? 'combined_caution' : 'ok';
    // 잔액 확인이 오래됐거나 기록이 비는 구간이 있으면 '주의'를 넘지 않는다
    const grade: Grade = (stale || recordGap) && gradeRank(rawGrade) > gradeRank('caution') ? 'caution' : rawGrade;
    const dayOut = (paths.base ?? paths.registered!).find((d) => d.date === ev.date);
    const amount = -(dayOut?.out ?? [])
      .filter((p) => (ev.kind === 'card' ? p.role === 'card_charge' : p.role === 'fixed' && p.label === ev.label))
      .reduce((s, p) => s + p.amount, 0);
    events.push({ ...ev, h, balance, shortage, grade, rawGrade, amount, upperWidth: width });
  }
  events.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  let top: PaymentEvent | null = null;
  for (const e of events) if (!top || gradeRank(e.grade) > gradeRank(top.grade)) top = e;

  // 불확실 입금이 들어온다고 가정한 참고 등급 (기본 시나리오 기준, 없으면 등록 일정 기준)
  let ifUncertainArrives: Grade | null = null;
  if (inc.uncertain.length && top) {
    const alt = run([...confirmed, ...fixed, ...inc.scheduled, ...inc.uncertain, ...forecast]);
    const lows = events.map((e) => dayOf(alt, e.date)?.low ?? 0);
    ifUncertainArrives = lows.some((v) => v < 0) ? (model ? 'high' : 'registered_short') : 'ok';
  }

  const sumNeg = (ps: Posting[]) => -ps.filter((p) => p.accountId === pay.id && p.amount < 0 && kstDate(p.debitAt) <= until).reduce((s, p) => s + p.amount, 0);
  const sumPos = (ps: Posting[]) => ps.filter((p) => p.accountId === pay.id && kstDate(p.debitAt) <= until).reduce((s, p) => s + p.amount, 0);

  return {
    now,
    today,
    anchor: { ...anchor, ageDays },
    stage,
    predictor: model?.name ?? null,
    shares,
    events,
    top,
    grade: top?.grade ?? 'ok',
    paths,
    ifUncertainArrives,
    flags: {
      needsBalanceCheck: stale,
      recordGap,
      unknownCards: ledger.unknownCards,
      overdueIncomes: inc.overdue,
      sameDayIncomes: inc.sameDayAsAnchor,
      billsToConfirm: ledger.bills.filter((b) => b.needsConfirm),
    },
    reconcile,
    basis: {
      confirmedOut: sumNeg([...confirmed, ...fixed]),
      forecastOut: sumNeg(forecast),
      scheduledIn: sumPos(inc.scheduled),
      uncertainIn: sumPos(inc.uncertain),
    },
  };
}

function cardName(setup: UserSetup, id?: string): string {
  return setup.cards.find((c) => c.id === id)?.name ?? '';
}
