/**
 * 검증 계획 (기획서 '2순위: 기준선 대비 AI 성능').
 *
 * - 평가 구간은 비율이 아니라 날짜로 고정: 마지막 28일 최종 평가, 그 앞 14일 모델 선택, 나머지 학습.
 *   학습 구간의 앞 7일은 특징량 계산용 초기 관측 기간이라 정답으로 쓰지 않는다.
 * - 사용자당 70일 미만이면 7일 예측 평가에만 넣는다.
 * - 롤링 백테스트: origin 날까지의 라벨로만 다음 h일 누적 변동 지출을 예측. 창 안의 모든 날이 라벨이어야 완결.
 * - 주 지표 7일 누적 MAE, 14일은 탐색적. 완결 사례 수와 겹치지 않는 독립 사례 수를 함께 보고한다.
 */
import { addDays, diffDays, type ISODate } from '../../shared/dates';
import { predictFrom, type DailyPredictor, type LabeledDay } from './forecast';
import { dateRange } from './time';

export const FINAL_DAYS = 28;
export const SELECT_DAYS = 14;
export const WARMUP_DAYS = 7;
export const MIN_TRAIN_DAYS = 28;
export const MIN_DAYS_FOR_14 = FINAL_DAYS + SELECT_DAYS + MIN_TRAIN_DAYS; // 70

export interface Segment {
  from: ISODate;
  to: ISODate;
}

export interface UserSplit {
  first: ISODate;
  last: ISODate;
  warmup: Segment;
  train: Segment;
  select: Segment;
  final: Segment;
  /** 70일 이상이면 14일 예측 평가에도 넣는다 */
  eval14: boolean;
}

export function splitUser(first: ISODate, last: ISODate): UserSplit | null {
  const total = diffDays(first, last) + 1;
  if (total < FINAL_DAYS + SELECT_DAYS + WARMUP_DAYS + 7) return null; // 학습할 날이 최소 7일은 있어야
  const final = { from: addDays(last, -(FINAL_DAYS - 1)), to: last };
  const select = { from: addDays(final.from, -SELECT_DAYS), to: addDays(final.from, -1) };
  const train = { from: first, to: addDays(select.from, -1) };
  const warmup = { from: first, to: addDays(first, WARMUP_DAYS - 1) };
  return { first, last, warmup, train, select, final, eval14: total >= MIN_DAYS_FOR_14 };
}

/** 학습에 쓸 라벨: 학습 구간이면서 초기 관측 기간 이후 */
export function trainLabels(labels: LabeledDay[], split: UserSplit): LabeledDay[] {
  return labels.filter((d) => d.date > split.warmup.to && d.date <= split.train.to);
}

export interface WindowResult {
  origin: ISODate;
  h: number;
  actual: number;
  pred: number;
  err: number;
}

export interface BacktestResult {
  windows: WindowResult[];
  /** 창 안에 라벨 없는 날이 있어 빠진 사례 */
  skipped: number;
  /** 겹치지 않는 완결 창 수 */
  independent: number;
  mae: number | null;
}

/**
 * segment 안에 창 [origin+1, origin+h]가 통째로 들어가는 모든 origin에 대해 롤링 예측.
 * minTarget 이전 날짜는 정답으로 쓰지 않는다 (초기 관측 기간).
 */
export function rollingBacktest(model: DailyPredictor, labels: LabeledDay[], segment: Segment, h: number, minTarget?: ISODate): BacktestResult {
  const byDate = new Map(labels.map((d) => [d.date, d.amount]));
  const windows: WindowResult[] = [];
  let skipped = 0;
  for (const start of dateRange(segment.from, addDays(segment.to, -(h - 1)))) {
    if (minTarget && start < minTarget) continue;
    const targets = dateRange(start, addDays(start, h - 1));
    if (!targets.every((d) => byDate.has(d))) {
      skipped++;
      continue;
    }
    const origin = addDays(start, -1);
    const preds = predictFrom(model, labels, origin, targets);
    if (preds.some((v) => Number.isNaN(v))) {
      skipped++;
      continue;
    }
    const actual = targets.reduce((s, d) => s + byDate.get(d)!, 0);
    const pred = preds.reduce((s, v) => s + v, 0);
    windows.push({ origin, h, actual, pred, err: actual - pred });
  }
  return { windows, skipped, independent: countIndependent(windows, h), mae: maeOf(windows) };
}

export function maeOf(ws: WindowResult[]): number | null {
  return ws.length ? ws.reduce((s, w) => s + Math.abs(w.err), 0) / ws.length : null;
}

/** 앞에서부터 겹치지 않게 고른 창의 수 */
export function countIndependent(ws: WindowResult[], h: number): number {
  let n = 0;
  let nextFree = '';
  for (const w of [...ws].sort((a, b) => (a.origin < b.origin ? -1 : 1))) {
    if (w.origin >= nextFree) {
      n++;
      nextFree = addDays(w.origin, h);
    }
  }
  return n;
}

/** 오른쪽 위 분위수 (선형 보간) */
export function quantile(xs: number[], q: number): number {
  if (!xs.length) return NaN;
  const s = [...xs].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/** 과거 h일 누적 예측 오차 (실제 − 예측), origin ≤ until 인 창만 — 상단 폭 계산용 (누수 없음) */
export function cumulativeErrors(model: DailyPredictor, labels: LabeledDay[], h: number, until: ISODate): number[] {
  if (!labels.length) return [];
  const seg = { from: labels[0].date, to: until };
  return rollingBacktest(model, labels.filter((d) => d.date <= until), seg, h, addDays(labels[0].date, WARMUP_DAYS))
    .windows.filter((w) => addDays(w.origin, h) <= until)
    .map((w) => w.err);
}

// ─── ML 채택 판단 ───

export interface SelectionScores {
  user: string;
  ml: WindowResult[];
  last7: WindowResult[];
  weekday: WindowResult[];
}

export interface AdoptionDecision {
  useMl: boolean;
  chosen: 'ml' | 'weekday';
  pooled: { ml: number | null; last7: number | null; weekday: number | null };
  perUser: { user: string; ml: number | null; last7: number | null; weekday: number | null; mlWins: boolean | null }[];
  reason: string;
}

/**
 * 선택 구간의 7일 누적 MAE로 판단. 4명의 선택 구간을 합쳐 ML이 두 기준선보다 모두 낮고,
 * 사용자별 우열이 엇갈리지 않을 때만 ML을 쓴다. 아니면 요일별 평균.
 */
export function decideAdoption(scores: SelectionScores[]): AdoptionDecision {
  const pool = (k: 'ml' | 'last7' | 'weekday') => maeOf(scores.flatMap((s) => s[k]));
  const pooled = { ml: pool('ml'), last7: pool('last7'), weekday: pool('weekday') };
  const perUser = scores.map((s) => {
    const ml = maeOf(s.ml);
    const l7 = maeOf(s.last7);
    const wd = maeOf(s.weekday);
    const best = Math.min(l7 ?? Infinity, wd ?? Infinity);
    return { user: s.user, ml, last7: l7, weekday: wd, mlWins: ml === null || best === Infinity ? null : ml < best };
  });
  const verdicts = perUser.map((u) => u.mlWins).filter((v): v is boolean => v !== null);
  const pooledWin = pooled.ml !== null && pooled.last7 !== null && pooled.weekday !== null && pooled.ml < pooled.last7 && pooled.ml < pooled.weekday;
  const mixed = verdicts.some((v) => v) && verdicts.some((v) => !v);
  const allWin = verdicts.length > 0 && verdicts.every((v) => v);
  const useMl = pooledWin && allWin;
  const reason = !pooledWin
    ? '합친 선택 구간에서 ML이 두 기준선보다 모두 낮지 않음'
    : mixed
      ? '사용자별로 우열이 엇갈림'
      : !allWin
        ? '비교할 사용자 사례가 없음'
        : '합친 선택 구간과 모든 사용자에서 ML이 두 기준선보다 낮음';
  return { useMl, chosen: useMl ? 'ml' : 'weekday', pooled, perUser, reason };
}

// ─── 상단 시나리오 포함률 ───

export const UPPER_Q = 0.8;
export const MIN_ERROR_SAMPLES = 10;

/**
 * 결제일까지 남은 일수 h에 맞춘 상단 폭: 과거 h일 누적 오차의 상위 20% 수준.
 * 본인 오차가 MIN_ERROR_SAMPLES개 미만이면 전체 사용자 공통 오차, 그것도 없으면 null.
 */
export function upperWidth(personal: number[], global: number[] | undefined): { width: number; source: 'personal' | 'global' } | null {
  if (personal.length >= MIN_ERROR_SAMPLES) return { width: Math.max(0, quantile(personal, UPPER_Q)), source: 'personal' };
  if (global && global.length >= MIN_ERROR_SAMPLES) return { width: Math.max(0, quantile(global, UPPER_Q)), source: 'global' };
  return null;
}

/** 실제 누적 지출이 '기본 예측 + 상단 폭' 이하였던 비율 (목표 80% 근처) */
export function upperCoverage(model: DailyPredictor, labels: LabeledDay[], segment: Segment, h: number, global?: number[]): { rate: number | null; n: number } {
  const bt = rollingBacktest(model, labels, segment, h);
  let n = 0;
  let hit = 0;
  for (const w of bt.windows) {
    const width = upperWidth(cumulativeErrors(model, labels, h, w.origin), global);
    if (!width) continue;
    n++;
    if (w.actual <= w.pred + width.width) hit++;
  }
  return { rate: n ? hit / n : null, n };
}
