import { addDays, diffDays, weekdayOf, type ISODate } from '../../../shared/dates';
import { billingDate, isCreditCardReady } from './billing';
import type { Line, MoaCard, MoaState, PayMethod, Txn } from './types';

/**
 * 변동 지출 예측 (기획서 「데이터 양에 따른 예측 방식」, 「ML 모델 설계」).
 * - 하루 전체 변동 지출 합계 하나만 예측하고, 결제 수단 비중으로 나눠 출금 시점에 배치한다.
 * - 정답(학습·평가)으로 쓰는 날은 '기록 완료'(self) 또는 '대조 완료'(reconciled)뿐. 기록 없는 날을 0원으로 보지 않는다.
 * - 기록 2주 미만이면 예측하지 않는다(등록 일정 기준 부족만).
 * - 기준선 두 개: 최근 7일 평균, 요일별 평균. 서비스 기본값은 요일별 평균이고,
 *   ML은 오프라인 평가(scripts/eval)에서 채택 조건을 통과했을 때만 provider로 바꿔 끼운다.
 */

export type BaselineName = 'rolling7' | 'weekday';

export const MIN_SPAN_DAYS = 14;
export const MIN_LABELED_DAYS = 7;

/** 변동 지출로 볼 거래 (필수·저축·입금·카드대금 제외) */
export function isVariableSpend(t: Txn): boolean {
  return t.kind === 'spend' && !t.essential;
}

/** 날짜별 변동 지출 합계. 연결된 환불은 원거래에서 빼고 0원 아래로 내리지 않는다. */
export function dailyVariable(txns: Txn[]): Map<ISODate, number> {
  const refund = new Map<string, number>();
  for (const t of txns) if (t.kind === 'refund' && t.refundOf) refund.set(t.refundOf, (refund.get(t.refundOf) ?? 0) + t.amount);
  const m = new Map<ISODate, number>();
  for (const t of txns) {
    if (!isVariableSpend(t)) continue;
    const net = Math.max(0, t.amount - (refund.get(t.id) ?? 0));
    m.set(t.date, (m.get(t.date) ?? 0) + net);
  }
  return m;
}

export interface LabeledDay {
  date: ISODate;
  amount: number;
  status: 'self' | 'reconciled';
}

/** 정답으로 쓸 수 있는 날만 (오늘 이전) */
export function labeledDays(state: Pick<MoaState, 'txns' | 'dayStatus'>, before: ISODate): LabeledDay[] {
  const totals = dailyVariable(state.txns);
  return Object.entries(state.dayStatus)
    .filter(([d]) => d < before)
    .map(([date, status]) => ({ date, status, amount: totals.get(date) ?? 0 }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 최근 7개 정답일 평균. asOf 이전 정답만 쓴다(누수 방지). */
export function rolling7(history: LabeledDay[], _target: ISODate, asOf: ISODate = _target): number | null {
  const prior = history.filter((h) => h.date < asOf).slice(-7);
  if (prior.length < 3) return null;
  return prior.reduce((s, h) => s + h.amount, 0) / prior.length;
}

/** asOf 직전 8주에서 target과 같은 요일 평균 (2개 미만이면 전체 평균) */
export function weekdayMean(history: LabeledDay[], target: ISODate, asOf: ISODate = target): number | null {
  const since = addDays(asOf, -56);
  const prior = history.filter((h) => h.date < asOf && h.date >= since);
  if (prior.length < 3) return null;
  const wd = weekdayOf(target);
  const same = prior.filter((h) => weekdayOf(h.date) === wd);
  const pool = same.length >= 2 ? same : prior;
  return pool.reduce((s, h) => s + h.amount, 0) / pool.length;
}

export const BASELINES: Record<BaselineName, (h: LabeledDay[], target: ISODate, asOf?: ISODate) => number | null> = { rolling7, weekday: weekdayMean };

export interface ForecastReadiness {
  ready: boolean;
  spanDays: number;
  labeled: number;
  message: string;
}

export function readiness(state: Pick<MoaState, 'txns' | 'dayStatus'>, today: ISODate): ForecastReadiness {
  const dates = state.txns.filter(isVariableSpend).map((t) => t.date).concat(Object.keys(state.dayStatus)).filter((d) => d <= today).sort();
  const spanDays = dates.length ? diffDays(dates[0], today) + 1 : 0;
  const labeled = labeledDays(state, today).length;
  const ready = spanDays >= MIN_SPAN_DAYS && labeled >= MIN_LABELED_DAYS;
  const message = ready
    ? `요일별 평균으로 지출을 예측해요 (정답 기록 ${labeled}일)`
    : spanDays < MIN_SPAN_DAYS
      ? `지출 예측은 기록이 2주 쌓이면 시작해요 (지금 ${spanDays}일)`
      : `'오늘 기록 완료'를 ${MIN_LABELED_DAYS - labeled}일 더 누르면 지출 예측을 시작해요`;
  return { ready, spanDays, labeled, message };
}

/* ───────── 결제 수단 비중 ───────── */

export type MethodGroup = 'pay' | 'credit' | 'outside';

export interface MethodShares {
  pay: number;
  credit: number;
  outside: number;
  basis: 'history' | 'asked' | 'default';
  /** 앞으로 쓸 신용카드 지출을 청구할 카드 (가장 많이 쓴 신용카드) */
  creditCardId?: string;
}

export function groupOf(t: Pick<Txn, 'method' | 'account' | 'cardId'>, cards: MoaCard[]): MethodGroup {
  if (t.method === 'credit') return 'credit';
  if (t.method === 'cash' || t.account !== 'pay') return 'outside';
  if (t.method === 'debit' && t.cardId) {
    const c = cards.find((x) => x.id === t.cardId);
    if (c && !(c.kind === 'debit' && c.linked)) return 'outside';
  }
  return 'pay';
}

const methodToGroup = (m: PayMethod): MethodGroup => (m === 'credit' ? 'credit' : m === 'cash' ? 'outside' : 'pay');

/** 최근 4주 기록의 결제 수단 비중. 5건 미만이면 사용자가 고른 주 결제 수단. */
export function methodShares(state: Pick<MoaState, 'txns' | 'cards' | 'mainMethod'>, today: ISODate): MethodShares {
  const since = addDays(today, -28);
  const recent = state.txns.filter((t) => isVariableSpend(t) && t.date >= since && t.date <= today);
  const creditUse = new Map<string, number>();
  for (const t of recent) if (t.method === 'credit' && t.cardId) creditUse.set(t.cardId, (creditUse.get(t.cardId) ?? 0) + t.amount);
  const readyCards = state.cards.filter(isCreditCardReady);
  const creditCardId = [...creditUse.entries()].filter(([id]) => readyCards.some((c) => c.id === id)).sort((a, b) => b[1] - a[1])[0]?.[0] ?? readyCards[0]?.id;
  if (recent.length >= 5) {
    const sum = { pay: 0, credit: 0, outside: 0 };
    for (const t of recent) sum[groupOf(t, state.cards)] += t.amount;
    const total = sum.pay + sum.credit + sum.outside || 1;
    return { pay: sum.pay / total, credit: sum.credit / total, outside: sum.outside / total, basis: 'history', creditCardId };
  }
  const g = methodToGroup(state.mainMethod ?? 'debit');
  return { pay: g === 'pay' ? 1 : 0, credit: g === 'credit' ? 1 : 0, outside: g === 'outside' ? 1 : 0, basis: state.mainMethod ? 'asked' : 'default', creditCardId };
}

/* ───────── 상단 폭 ───────── */

export const UPPER_QUANTILE = 0.8;
/** 본인 기록으로 h일 오차를 낼 수 없을 때 쓰는 공통 비율 (기본 예측 누적액 대비). 합성·팀원 데이터로 다시 정한다. */
export const COMMON_UPPER_RATIO = (h: number) => Math.min(0.9, 0.18 + 0.6 / Math.sqrt(Math.max(1, h)));

function quantileOf(xs: number[], q: number): number {
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/**
 * 결제일까지 남은 h일의 누적 지출 상단 폭.
 * 과거의 'h일 누적 실제 − h일 누적 예측' 오차의 상위 20% 수준. 날짜별 분위를 더하지 않는다.
 * 창 안의 모든 날이 정답일이어야 쓴다. 창이 5개 미만이면 공통 비율.
 */
export function upperWidth(history: LabeledDay[], h: number, baseCum: number, model: BaselineName = 'weekday'): { width: number; basis: 'personal' | 'common'; windows: number } {
  if (h <= 0) return { width: 0, basis: 'common', windows: 0 };
  const byDate = new Map(history.map((x) => [x.date, x.amount]));
  const errs: number[] = [];
  for (const start of history.map((x) => x.date)) {
    let actual = 0, pred = 0, ok = true;
    for (let i = 0; i < h; i++) {
      const d = addDays(start, i);
      const a = byDate.get(d);
      const p = BASELINES[model](history, d, start); // 창 시작 이전 정답만 사용 (누수 방지)
      if (a === undefined || p === null) { ok = false; break; }
      actual += a;
      pred += p;
    }
    if (ok) errs.push(actual - pred);
  }
  if (errs.length >= 5) return { width: Math.max(0, quantileOf(errs, UPPER_QUANTILE)), basis: 'personal', windows: errs.length };
  return { width: baseCum * COMMON_UPPER_RATIO(h), basis: 'common', windows: errs.length };
}

/* ───────── 예측 줄 ───────── */

export interface ForecastResult {
  ready: ForecastReadiness;
  model: BaselineName;
  runId: string;
  shares: MethodShares;
  /** 날짜별 전체 변동 지출 예측 */
  daily: { date: ISODate; total: number }[];
  /** 결제계좌에 들어갈 예측 줄 (체크·이체분 + 계산 범위 안에 청구되는 신용카드분) */
  lines: Line[];
  /** 신용카드 예측분 중 계산 범위 밖으로 청구되는 금액 */
  creditOutside: number;
  history: LabeledDay[];
}

/**
 * today부터 until까지 변동 지출 예측.
 * 오늘은 '오늘 전체 예측 − 오늘 이미 기록된 같은 결제 수단 그룹의 변동 지출'만 남은 예측으로 넣는다(0 미만이면 0).
 */
export function forecastLines(state: MoaState, today: ISODate, until: ISODate, model: BaselineName = 'weekday'): ForecastResult {
  const ready = readiness(state, today);
  const history = labeledDays(state, today);
  const shares = methodShares(state, today);
  const runId = `run_${today}_${model}`;
  const empty: ForecastResult = { ready, model, runId, shares, daily: [], lines: [], creditOutside: 0, history };
  if (!ready.ready) return empty;

  const card = shares.creditCardId ? state.cards.find((c) => c.id === shares.creditCardId) : undefined;
  const todaySpent = { pay: 0, credit: 0, outside: 0 };
  for (const t of state.txns) if (isVariableSpend(t) && t.date === today) todaySpent[groupOf(t, state.cards)] += t.amount;

  const daily: { date: ISODate; total: number }[] = [];
  const lines: Line[] = [];
  const creditByBill = new Map<ISODate, number>();
  let creditOutside = 0;
  for (let d = today; d <= until; d = addDays(d, 1)) {
    const total = Math.max(0, BASELINES[model](history, d, today) ?? 0);
    daily.push({ date: d, total: Math.round(total) });
    let pay = total * shares.pay;
    let credit = total * shares.credit;
    if (d === today) {
      pay = Math.max(0, pay - todaySpent.pay);
      credit = Math.max(0, credit - todaySpent.credit);
    }
    if (pay >= 1) lines.push({ date: d, amount: -Math.round(pay), label: '예상 변동 지출', source: 'forecast', certainty: 'forecast', essential: false });
    if (credit >= 1) {
      if (!card) { creditOutside += credit; continue; }
      const bd = billingDate(card, d);
      if (bd <= until) creditByBill.set(bd, (creditByBill.get(bd) ?? 0) + credit);
      else creditOutside += credit;
    }
  }
  for (const [date, amt] of creditByBill) {
    lines.push({ date, amount: -Math.round(amt), label: `${card!.name} 예상 사용분`, source: 'forecast_card', certainty: 'forecast', essential: false, cardId: card!.id });
  }
  lines.sort((a, b) => a.date.localeCompare(b.date));
  return { ready, model, runId, shares, daily, lines, creditOutside: Math.round(creditOutside), history };
}
