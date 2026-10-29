import { addDays, diffDays, weekdayOf, type ISODate } from '../../../shared/dates';
import type { ForecastInput } from './forecast';
import type { DailyQuantile, SpendingForecast } from './types';

/** Small on-device supervised model: ridge regression with weekday and recency features.
 * Uses a chronological holdout so the model is NEVER applied if it doesn't beat
 * a training-only mean baseline by at least 5%. No server upload is required.
 * This is not a bank balance model; only discretionary daily spending is learned.
 */
export interface PersonalModelReport {
  status: 'insufficient' | 'baseline' | 'active';
  historyDays: number;
  transactions: number;
  holdoutDays: number;
  modelMae: number | null;
  baselineMae: number | null;
  improvementPct: number | null;
  topCategory: { name: string; amount: number; share: number } | null;
  busyWeekday: { day: string; average: number } | null;
  advice: string;
  forecast: SpendingForecast | null;
}

const DAY_NAMES = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const N = 8; // bias + Mon..Sat contrasts (Sun reference) + trend
const MAX_DAYS = 90;

function features(date: ISODate, age: number): number[] {
  const wd = weekdayOf(date);
  return [1, ...[1, 2, 3, 4, 5, 6].map((d) => Number(wd === d)), Math.min(1.5, age / 60)];
}
function solve(a: number[][], b: number[]): number[] | null {
  const rows = a.map((r, i) => [...r, b[i]]);
  for (let c = 0; c < N; c++) {
    let pivot = c;
    for (let j = c + 1; j < N; j++) if (Math.abs(rows[j][c]) > Math.abs(rows[pivot][c])) pivot = j;
    if (Math.abs(rows[pivot][c]) < 1e-9) return null;
    [rows[c], rows[pivot]] = [rows[pivot], rows[c]];
    const div = rows[c][c];
    for (let k = c; k <= N; k++) rows[c][k] /= div;
    for (let r = 0; r < N; r++) {
      if (r === c) continue;
      const f = rows[r][c];
      for (let k = c; k <= N; k++) rows[r][k] -= f * rows[c][k];
    }
  }
  return rows.map((r) => r[N]);
}
function fit(xs: number[][], ys: number[], scale: number): number[] | null {
  const a = Array.from({ length: N }, () => Array(N).fill(0));
  const b = Array(N).fill(0);
  xs.forEach((x, i) => {
    const wt = Math.pow(0.985, xs.length - i - 1);
    const y = Math.min(ys[i] / scale, 5);
    for (let j = 0; j < N; j++) {
      b[j] += wt * x[j] * y;
      for (let k = 0; k < N; k++) a[j][k] += wt * x[j] * x[k];
    }
  });
  for (let j = 0; j < N; j++) a[j][j] += j === 0 ? 0.05 : j === N - 1 ? 6 : 3;
  return solve(a, b);
}
const predict = (beta: number[], x: number[], scale: number): number => Math.max(0, Math.round(x.reduce((sum, v, i) => sum + v * beta[i], 0) * scale));

export function analyzePersonalSpending(input: ForecastInput): PersonalModelReport {
  const start = addDays(input.today, -MAX_DAYS + 1);
  const history = input.history.filter((r) => r.date >= start && r.date <= input.today && r.amount > 0 && Number.isFinite(r.amount));
  const earliest = history.length ? history.reduce((m, r) => r.date < m ? r.date : m, history[0].date) : input.today;
  const historyDays = history.length ? diffDays(earliest, input.today) + 1 : 0;
  const cat = new Map<string, number>();
  for (const h of history) cat.set(h.category || '기타', (cat.get(h.category || '기타') ?? 0) + h.amount);
  const total = history.reduce((s, x) => s + x.amount, 0);
  const leading = [...cat.entries()].sort((a, b) => b[1] - a[1])[0];
  const topCategory = leading ? { name: leading[0], amount: leading[1], share: total ? leading[1] / total : 0 } : null;
  const insufficient = (advice: string): PersonalModelReport => ({ status: 'insufficient', historyDays, transactions: history.length, holdoutDays: 0, modelMae: null, baselineMae: null, improvementPct: null, topCategory, busyWeekday: null, advice, forecast: null });
  if (historyDays < 28 || history.length < 14) return insufficient(`최근 지출 기록 ${history.length}건이에요. 28일 이상·14건 이상 쌓이면 요일별 소비 모델을 학습해요.`);
  const byDate = new Map<string, number>();
  for (const h of history) byDate.set(h.date, (byDate.get(h.date) ?? 0) + h.amount);
  const y = Array.from({ length: historyDays }, (_, i) => byDate.get(addDays(earliest, i)) ?? 0);
  const x = y.map((_, i) => features(addDays(earliest, i), i));
  const holdoutDays = Math.min(14, Math.max(7, Math.floor(historyDays * 0.2)));
  const trainLen = y.length - holdoutDays;
  if (trainLen < 21) return insufficient('학습 가능한 기간이 더 필요해요.');
  const scale = Math.max(1000, y.slice(0, trainLen).reduce((s, v) => s + v, 0) / trainLen);
  const beta = fit(x.slice(0, trainLen), y.slice(0, trainLen), scale);
  if (!beta) return insufficient('기록을 처리하지 못했어요. 기본 예측을 사용해요.');
  const baseline = y.slice(0, trainLen).reduce((s, v) => s + v, 0) / trainLen;
  let errM = 0, errB = 0;
  for (let i = trainLen; i < y.length; i++) {
    errM += Math.abs(y[i] - predict(beta, x[i], scale));
    errB += Math.abs(y[i] - baseline);
  }
  const modelMae = Math.round(errM / holdoutDays);
  const baselineMae = Math.round(errB / holdoutDays);
  const improvementPct = baselineMae > 0 ? Math.round((1 - modelMae / baselineMae) * 100) : 0;
  const active = baselineMae > 0 && modelMae < baselineMae * 0.95;
  const weekdays = Array.from({ length: 7 }, (_, wd) => {
    const entries = y.filter((_, i) => weekdayOf(addDays(earliest, i)) === wd);
    return { day: DAY_NAMES[wd], average: Math.round(entries.reduce((s, v) => s + v, 0) / Math.max(1, entries.length)) };
  });
  weekdays.sort((a, b) => b.average - a.average);
  const busyWeekday = weekdays[0];
  if (!active) return { status: 'baseline', historyDays, transactions: history.length, holdoutDays, modelMae, baselineMae, improvementPct, topCategory, busyWeekday, advice: '최근 기록을 학습해 검증했지만 기존 평균 예측보다 좋아지지 않아 기본 예측을 유지해요.', forecast: null };
  const reFit = fit(x, y, Math.max(1000, total / historyDays))!;
  const refScale = Math.max(1000, total / historyDays);
  const residuals = y.map((val, i) => Math.abs(val - predict(reFit, x[i], refScale))).sort((a, b) => a - b);
  const errorRadius = residuals[Math.floor(residuals.length * 0.8)] ?? 0;
  const days: DailyQuantile[] = [];
  for (let date = input.from, i = 0; date <= input.to && i < 366; date = addDays(date, 1), i++) {
    const mid = predict(reFit, features(date, diffDays(earliest, date)), refScale);
    days.push({ date, p10: Math.max(0, mid - Math.round(errorRadius)), p50: mid, p90: mid + Math.round(errorRadius) });
  }
  const forecast: SpendingForecast = { engine: 'local', modelName: '요일·추세 릿지 회귀', basis: 'history', historyCount: history.length, historyDays, personalWeight: 1, days, dummy: history.every(h => h.from === 'demo') };
  return { status: 'active', historyDays, transactions: history.length, holdoutDays, modelMae, baselineMae, improvementPct, topCategory, busyWeekday, advice: '요일별 소비와 최근 변화량을 반영하는 모델이 검증 기준을 통과했어요.', forecast };
}
