import { addDays, diffDays, type ISODate } from '../../../shared/dates';
import { MIN_PERSONAL_RECORDS, type DailyQuantile, type SpendEntry, type SpendingForecast } from './types';

export interface ForecastInput {
  /** 예측 시작일(이 날 포함) */
  from: ISODate;
  to: ISODate;
  today: ISODate;
  /** 온보딩에서 입력한 하루 평균 생활비 (없으면 undefined) */
  dailySpend?: number;
  /** 지난 생활비 기록 */
  history: SpendEntry[];
  /** 몇 일치 기록까지 볼지 */
  lookbackDays?: number;
}

const WEEKEND_BOOST = 1.25;
/** 주말 가중을 주되 한 주 평균은 그대로 두도록 평일을 살짝 낮춘다 */
const WEEKDAY_K = 7 / (5 + 2 * WEEKEND_BOOST);

/** 정렬된 배열의 분위수 (선형 보간) */
export function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

function isWeekend(iso: ISODate): boolean {
  const [y, m, d] = iso.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return w === 0 || w === 6;
}

/** 입력한 하루 평균 → 분위수 (생활비는 오른쪽 꼬리가 긴 분포라 P90을 넉넉히) */
function priorFromAverage(avg: number) {
  return { p10: avg * 0.25, p50: avg * 0.8, p90: avg * 2.1 };
}

/**
 * 규칙 기반 생활비 예측 (모델이 없을 때의 기준선).
 * - 기록이 3건 미만 → 입력한 하루 평균만 사용 (콜드스타트)
 * - 기록이 쌓이면 기록 일수에 비례해 내 기록 비중을 올림 (30일이면 100%)
 * - 주말은 평일보다 25% 더 쓰는 것으로 가정
 * 팀원 LightGBM 분위수 회귀가 붙으면 같은 출력 모양으로 교체된다.
 */
export function ruleForecast(input: ForecastInput): SpendingForecast {
  const lookback = input.lookbackDays ?? 60;
  const since = addDays(input.today, -lookback);
  const hist = input.history.filter((h) => h.date >= since && h.date <= input.today && h.amount > 0);
  const dummy = hist.length > 0 && hist.every((h) => h.from === 'demo');

  // 날짜별 합계 (기록이 없는 날은 0원)
  let historyDays = 0;
  const daily: number[] = [];
  if (hist.length) {
    const first = hist.reduce((m, h) => (h.date < m ? h.date : m), hist[0].date);
    historyDays = diffDays(first, input.today) + 1;
    const byDate = new Map<ISODate, number>();
    for (const h of hist) byDate.set(h.date, (byDate.get(h.date) ?? 0) + h.amount);
    for (let i = 0; i < historyDays; i++) daily.push(byDate.get(addDays(first, i)) ?? 0);
  }
  daily.sort((a, b) => a - b);

  const hasPrior = (input.dailySpend ?? 0) > 0;
  const enough = hist.length >= MIN_PERSONAL_RECORDS;
  const personalWeight = enough ? (hasPrior ? Math.min(1, historyDays / 30) : 1) : 0;

  const emp = enough
    ? { p10: quantile(daily, 0.1), p50: quantile(daily, 0.5), p90: quantile(daily, 0.9) }
    : { p10: 0, p50: 0, p90: 0 };
  // 기록이 0원인 날이 많으면 P50이 0이 될 수 있어 평균으로 하한을 둔다
  if (enough) {
    const mean = daily.reduce((s, v) => s + v, 0) / daily.length;
    emp.p50 = Math.max(emp.p50, mean * 0.6);
    emp.p90 = Math.max(emp.p90, mean * 1.6);
  }
  const prior = hasPrior ? priorFromAverage(input.dailySpend!) : { p10: 0, p50: 0, p90: 0 };
  const mix = (a: number, b: number) => a * (1 - personalWeight) + b * personalWeight;
  const base = { p10: mix(prior.p10, emp.p10), p50: mix(prior.p50, emp.p50), p90: mix(prior.p90, emp.p90) };

  const days: DailyQuantile[] = [];
  const n = Math.max(0, diffDays(input.from, input.to) + 1);
  for (let i = 0; i < n; i++) {
    const date = addDays(input.from, i);
    const k = (isWeekend(date) ? WEEKEND_BOOST : 1) * WEEKDAY_K;
    days.push({ date, p10: Math.round(base.p10 * k), p50: Math.round(base.p50 * k), p90: Math.round(base.p90 * k) });
  }

  const basis = !hasPrior && !enough ? 'none' : !enough ? 'profile' : personalWeight >= 1 ? 'history' : 'blend';
  return { engine: 'rule', basis, historyDays, historyCount: hist.length, personalWeight, days, dummy };
}

/** 예측이 사실상 0인지 (생활비 정보 없음) */
export function isEmptyForecast(f: SpendingForecast): boolean {
  return f.days.every((d) => d.p90 <= 0);
}
