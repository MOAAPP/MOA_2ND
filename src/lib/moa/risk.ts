import { addDays, diffDays, type ISODate } from '../../../shared/dates';
import { forecastLines, upperWidth, type BaselineName, type ForecastResult } from './forecast';
import { anchorDate, confirmedFlows, type Settlement } from './ledger';
import { GRADE_RANK, type Grade, type Line, type MoaState, type ScenarioKey } from './types';

/**
 * 위험 판단 (기획서 「위험 판단: 설명 가능한 네 시나리오로 시작」).
 * 같은 계산 엔진에 조건만 바꿔 넣는다. 확률은 계산하지도, 화면에 쓰지도 않는다.
 *
 * | 등급 | 조건 |
 * | 등록 일정 기준 부족 | 예측 지출 없이 확정·등록 입출금만으로 결제일 잔고 < 0 |
 * | 부족 가능성 높음 | 기본 시나리오에서 부족 |
 * | 주의 | 상단 지출 또는 입금 지연에서만 부족 |
 * | 복합 상황 주의 | 복합 시나리오에서만 부족 (푸시 없음) |
 * | 여유 | 모두 괜찮음 |
 */

export const RISK_HORIZON = 14;
export const CHART_HORIZON = 30;
export const STALE_DAYS = 7;
/** 잔액 불일치로 볼 차이 */
export const mismatchThreshold = (expected: number) => Math.max(5000, Math.abs(expected) * 0.05);

export interface DayBalance {
  date: ISODate;
  /** 그날 출금을 먼저 뺀 직후 (하루 최저점) */
  low: number;
  close: number;
}

export interface PaymentCheck {
  key: string;
  date: ISODate;
  name: string;
  amount: number;
  daysUntil: number;
  /** 그날 출금 직후 잔고 (시나리오별) */
  balances: Record<ScenarioKey, number>;
  grade: Grade;
  /** 등급을 정한 시나리오에서 모자라는 금액 (양수) */
  shortBy: number;
  cause: 'schedule' | 'spending' | 'delay' | 'both' | null;
  /** 잔액 미확인·기록 누락으로 등급을 낮췄는지 */
  capped: 'stale' | 'gap' | null;
  /** 상단 폭 (결제계좌 영향분) */
  upper: number;
  upperBasis: 'personal' | 'common' | 'none';
}

export interface RiskReport {
  today: ISODate;
  nowMs: number;
  hasAnchor: boolean;
  anchorAt: number | null;
  anchorBalance: number | null;
  staleDays: number;
  stale: boolean;
  gap: boolean;
  forecast: ForecastResult;
  /** 시나리오별 일별 잔고 (차트용, 30일) */
  series: Record<ScenarioKey, DayBalance[]>;
  /** 14일 안 필수결제 */
  payments: PaymentCheck[];
  /** 가장 심각한 결제 (등급 → 날짜 순) */
  worst: PaymentCheck | null;
  /** 근거 */
  evidence: {
    confirmedOut: number;
    confirmedIn: number;
    forecastOut: number;
    scheduledIn: { label: string; date: ISODate; amount: number }[];
    uncertainIn: { label: string; date: ISODate; amount: number }[];
    outsideCount: number;
  };
  settlements: Settlement[];
  /** 불확실 입금이 들어온다고 가정했을 때 가장 낮은 결제일 잔고 (참고용) */
  ifUncertainArrives: number | null;
  delayDays: number;
}

function simulate(start: number, d0: ISODate, until: ISODate, lines: Line[], extra?: (d: ISODate) => number): DayBalance[] {
  let bal = start;
  const by = new Map<ISODate, Line[]>();
  for (const l of lines) {
    if (l.date < d0 || l.date > until) continue;
    by.set(l.date, [...(by.get(l.date) ?? []), l]);
  }
  const out: DayBalance[] = [];
  let carried = 0;
  for (let d = d0; d <= until; d = addDays(d, 1)) {
    const ls = by.get(d) ?? [];
    const outflow = ls.filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0);
    const inflow = ls.filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
    const shift = extra ? extra(d) : 0; // 상단 폭은 누적값이라 그날 증가분만 반영
    const step = shift - carried;
    carried = shift;
    const low = bal + outflow - step;
    const close = low + inflow;
    out.push({ date: d, low: Math.round(low), close: Math.round(close) });
    bal = close;
  }
  return out;
}

const lowOn = (s: DayBalance[], d: ISODate) => s.find((x) => x.date === d)?.low ?? 0;

export interface RiskOptions {
  model?: BaselineName;
  /** 살까 말까 등 가정 줄 추가 */
  extraLines?: Line[];
  delayDays?: number;
}

export function assessRisk(state: MoaState, nowMs: number, today: ISODate, opts: RiskOptions = {}): RiskReport {
  const delay = opts.delayDays ?? state.delayDays;
  const until = addDays(today, CHART_HORIZON);
  const riskUntil = addDays(today, RISK_HORIZON);
  const anchor = state.anchor;
  const fc = forecastLines(state, today, until, opts.model);
  const emptySeries = { registered: [], base: [], high: [], delay: [], combo: [] };
  if (!anchor) {
    return {
      today, nowMs, hasAnchor: false, anchorAt: null, anchorBalance: null, staleDays: 0, stale: false, gap: false, forecast: fc,
      series: emptySeries, payments: [], worst: null,
      evidence: { confirmedOut: 0, confirmedIn: 0, forecastOut: 0, scheduledIn: [], uncertainIn: [], outsideCount: 0 },
      settlements: [], ifUncertainArrives: null, delayDays: delay,
    };
  }
  const d0 = anchorDate(anchor);
  const staleDays = Math.floor((nowMs - anchor.at) / 86400000);
  const stale = staleDays > STALE_DAYS;
  const gap = state.mismatches.some((m) => nowMs - m.at <= 7 * 86400000 && Math.abs(m.actual - m.expected) > mismatchThreshold(m.expected));

  const extra = opts.extraLines ?? [];
  const onTime = confirmedFlows(state, until);
  const late = confirmedFlows(state, until, { incomeDelay: delay });
  const certain = (ls: Line[]) => ls.filter((l) => l.certainty !== 'uncertain');
  const regLines = [...certain(onTime.lines), ...extra];
  const baseLines = [...regLines, ...fc.lines];
  const delayLines = [...certain(late.lines), ...extra, ...fc.lines];

  // 상단 폭: 결제일까지 남은 h일 누적 기준 (결제계좌 영향분 = 폭 × 결제계좌 비중)
  const cumBase = new Map<ISODate, number>();
  let run = 0;
  for (const x of fc.daily) { run += x.total; cumBase.set(x.date, run); }
  const widthCache = new Map<number, { width: number; basis: 'personal' | 'common' }>();
  const widthAt = (d: ISODate) => {
    if (!fc.ready.ready || d < today) return { width: 0, basis: 'common' as const };
    const h = diffDays(today, d) + 1;
    if (!widthCache.has(h)) widthCache.set(h, upperWidth(fc.history, h, cumBase.get(d) ?? 0, fc.model));
    const w = widthCache.get(h)!;
    return { width: w.width * fc.shares.pay, basis: w.basis };
  };
  const upperShift = (d: ISODate) => widthAt(d).width;

  const series: Record<ScenarioKey, DayBalance[]> = {
    registered: simulate(anchor.balance, d0, until, regLines),
    base: simulate(anchor.balance, d0, until, baseLines),
    high: simulate(anchor.balance, d0, until, baseLines, upperShift),
    delay: simulate(anchor.balance, d0, until, delayLines),
    combo: simulate(anchor.balance, d0, until, delayLines, upperShift),
  };

  // 14일 안 필수결제
  const seen = new Set<string>();
  const payments: PaymentCheck[] = [];
  for (const l of regLines) {
    if (!l.essential || l.amount >= 0 || l.date < today || l.date > riskUntil) continue;
    const key = `${l.refId ?? l.label}:${l.date}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const b = {
      registered: lowOn(series.registered, l.date),
      base: lowOn(series.base, l.date),
      high: lowOn(series.high, l.date),
      delay: lowOn(series.delay, l.date),
      combo: lowOn(series.combo, l.date),
    };
    let grade: Grade = 'ok';
    let cause: PaymentCheck['cause'] = null;
    let shortBy = 0;
    if (b.registered < 0) { grade = 'registered'; cause = 'schedule'; shortBy = -b.registered; }
    else if (b.base < 0) { grade = 'high'; cause = 'spending'; shortBy = -b.base; }
    else if (b.high < 0 || b.delay < 0) {
      grade = 'caution';
      cause = b.high < 0 && b.delay < 0 ? 'both' : b.delay < 0 ? 'delay' : 'spending';
      shortBy = -Math.min(b.high, b.delay);
    } else if (b.combo < 0) { grade = 'combo'; cause = 'both'; shortBy = -b.combo; }
    let capped: PaymentCheck['capped'] = null;
    if ((stale || gap) && GRADE_RANK[grade] > GRADE_RANK.caution) { grade = 'caution'; capped = stale ? 'stale' : 'gap'; }
    const w = widthAt(l.date);
    payments.push({
      key, date: l.date, name: l.label, amount: -l.amount, daysUntil: diffDays(today, l.date), balances: b, grade, shortBy: Math.round(shortBy), cause, capped,
      upper: Math.round(w.width), upperBasis: fc.ready.ready ? w.basis : 'none',
    });
  }
  payments.sort((a, b) => a.date.localeCompare(b.date));
  const worst = [...payments].sort((a, b) => GRADE_RANK[b.grade] - GRADE_RANK[a.grade] || a.date.localeCompare(b.date))[0] ?? null;

  // 근거
  const after = (ls: Line[]) => ls.filter((l) => l.date >= today && l.date <= riskUntil);
  const confirmedOut = -after(regLines).filter((l) => l.amount < 0).reduce((s, l) => s + l.amount, 0);
  const confirmedIn = after(regLines).filter((l) => l.amount > 0).reduce((s, l) => s + l.amount, 0);
  const forecastOut = -after(fc.lines).reduce((s, l) => s + l.amount, 0);
  const pick = (c: Line['certainty']) => after(onTime.lines).filter((l) => l.source === 'income' && l.certainty === c).map((l) => ({ label: l.label, date: l.date, amount: l.amount }));
  const uncertainIn = pick('uncertain');
  let ifUncertainArrives: number | null = null;
  if (uncertainIn.length && payments.length) {
    const s = simulate(anchor.balance, d0, until, [...baseLines, ...onTime.lines.filter((l) => l.certainty === 'uncertain')]);
    ifUncertainArrives = Math.min(...payments.map((p) => lowOn(s, p.date)));
  }

  return {
    today, nowMs, hasAnchor: true, anchorAt: anchor.at, anchorBalance: anchor.balance, staleDays, stale, gap, forecast: fc, series, payments, worst,
    evidence: { confirmedOut: Math.round(confirmedOut), confirmedIn: Math.round(confirmedIn), forecastOut: Math.round(forecastOut), scheduledIn: pick('scheduled'), uncertainIn, outsideCount: onTime.outsideCount },
    settlements: onTime.settlements, ifUncertainArrives, delayDays: delay,
  };
}

/** 지금 시점에 계산한 결제계좌 잔고 (잔액이 찍힌 문자가 왔을 때 불일치 확인용) */
export function expectedBalanceAt(state: MoaState, atMs: number, date: ISODate): number | null {
  const a = state.anchor;
  if (!a || atMs <= a.at) return null;
  const flows = confirmedFlows(state, date);
  // 그 시각까지 일어난 확정 거래 + 그 날짜까지의 일정·청구
  const sum = flows.lines.filter((l) => l.certainty !== 'uncertain' && l.date <= date).reduce((s, l) => s + l.amount, 0);
  return a.balance + sum;
}
