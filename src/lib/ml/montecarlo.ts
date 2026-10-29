import type { ISODate } from '../../../shared/dates';
import type { Simulation } from '../cashflow';
import { SAFE_SHORTFALL_PROB, type DailyQuantile, type SpendingForecast } from './types';

/** 홈·비교 화면 확률에 쓰는 생활비 경로 수 */
export const RISK_PATHS = 3000;
/** 구매 타이밍 추천(날짜 수십 개 × 경로)에 쓰는 경로 수 */
export const TIMING_PATHS = 1500;

/** 재현 가능한 난수 (같은 입력이면 같은 그래프) */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function normal(rand: () => number): number {
  const u = Math.max(1e-9, rand());
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/** 분위수 3개로 만든 분포에서 하나 뽑기 (구간별 선형 보간한 역누적분포) */
export function sampleDay(q: DailyQuantile, u: number): number {
  const top = q.p90 + (q.p90 - q.p50) * 1.5;
  if (u <= 0.1) return (u / 0.1) * q.p10;
  if (u <= 0.5) return q.p10 + ((u - 0.1) / 0.4) * (q.p50 - q.p10);
  if (u <= 0.9) return q.p50 + ((u - 0.5) / 0.4) * (q.p90 - q.p50);
  return q.p90 + ((u - 0.9) / 0.1) * (top - q.p90);
}

/** 분위수 분포의 평균 (sampleDay와 같은 분포) */
export function dailyMean(q: DailyQuantile): number {
  const top = q.p90 + (q.p90 - q.p50) * 1.5;
  return 0.1 * (q.p10 / 2) + 0.4 * ((q.p10 + q.p50) / 2) + 0.4 * ((q.p50 + q.p90) / 2) + 0.1 * ((q.p90 + top) / 2);
}

/**
 * 생활비 경로 n개. 경로마다 '이번 달은 좀 더 쓰는 달' 같은 공통 충격을 곱해
 * 날짜끼리 완전히 독립이라고 보는 것보다 넓고 현실적인 범위를 만든다.
 * cum[k * days + i] = k번째 경로에서 i번째 날까지의 누적 생활비 (메모리 한 덩어리)
 */
export interface SpendPaths {
  n: number;
  days: number;
  dates: ISODate[];
  cum: Float64Array;
}

export function spendPaths(forecast: SpendingForecast, n: number, seed = 20261020): SpendPaths {
  const rand = mulberry32(seed);
  const days = forecast.days.length;
  const cum = new Float64Array(n * days);
  for (let k = 0; k < n; k++) {
    const shock = Math.exp(0.22 * normal(rand) - 0.024);
    let s = 0;
    const off = k * days;
    for (let i = 0; i < days; i++) {
      s += sampleDay(forecast.days[i], rand()) * shock;
      cum[off + i] = s;
    }
  }
  return { n, days, dates: forecast.days.map((d) => d.date), cum };
}

export interface BandPoint {
  date: ISODate;
  p10: number;
  p50: number;
  p90: number;
}

export interface WorldRisk {
  /** 날짜별 잔고 범위 (생활비 포함) */
  band: BandPoint[];
  /** 기간 안에 잔고가 0원 아래로 내려갈 확률 */
  pShort: number;
  /** 지켜둘 금액 아래로 내려갈 확률 */
  pBelowMin: number;
  /** 기간 마지막 날 잔고 범위 */
  end: BandPoint;
  paths: number;
}

function q(sorted: Float64Array, p: number): number {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * 결정적 시뮬레이션(일정·선택) 위에 생활비 경로를 얹어 확률을 계산한다.
 * 같은 생활비 경로를 모든 세계에 똑같이 써서(공통 난수) 세계 간 차이는 선택 차이만 남는다.
 * withBand=false면 날짜별 범위 정렬을 건너뛰어 훨씬 빠르다 (타이밍 추천용).
 */
export function worldRisk(sim: Simulation, from: ISODate, until: ISODate, paths: SpendPaths, minBalance: number, withBand = true): WorldRisk {
  const days = sim.days.filter((d) => d.date >= from && d.date <= until);
  const D = days.length;
  const n = paths.n;
  // 날짜 → 경로 배열의 열 (예측 시작 전이면 -1: 아직 쓴 생활비 0)
  const col = new Int32Array(D);
  const dateIdx = new Map(paths.dates.map((d, i) => [d, i]));
  let last = -1;
  for (let i = 0; i < D; i++) {
    const j = dateIdx.get(days[i].date);
    if (j !== undefined) last = j;
    col[i] = last;
  }
  const lows = new Float64Array(D);
  const closes = new Float64Array(D);
  for (let i = 0; i < D; i++) {
    lows[i] = days[i].low;
    closes[i] = days[i].close;
  }
  const byDay = withBand ? Array.from({ length: D }, () => new Float64Array(n)) : null;
  let short = 0;
  let below = 0;
  const cum = paths.cum;
  const P = paths.days;
  for (let k = 0; k < n; k++) {
    const off = k * P;
    let minLow = Infinity;
    for (let i = 0; i < D; i++) {
      const c = col[i];
      const spent = c < 0 ? 0 : cum[off + c];
      const low = lows[i] - spent;
      if (low < minLow) minLow = low;
      if (byDay) byDay[i][k] = closes[i] - spent;
    }
    if (minLow < 0) short++;
    if (minLow < minBalance) below++;
  }
  const band: BandPoint[] = byDay
    ? days.map((d, i) => {
        const arr = byDay[i].sort();
        return { date: d.date, p10: q(arr, 0.1), p50: q(arr, 0.5), p90: q(arr, 0.9) };
      })
    : [];
  return {
    band,
    pShort: n ? short / n : 0,
    pBelowMin: n ? below / n : 0,
    end: band[band.length - 1] ?? { date: until, p10: 0, p50: 0, p90: 0 },
    paths: n,
  };
}

export interface TimingPoint {
  date: ISODate;
  pShort: number;
}

export interface TimingAdvice {
  points: TimingPoint[];
  /** 부족 확률이 기준 이하인 가장 이른 날. 없으면 null */
  best: TimingPoint | null;
  /** 원래 날짜의 부족 확률 */
  original: TimingPoint;
  until: ISODate;
  paths: number;
}

/**
 * 구매 타이밍 추천: 후보 날짜마다 '그날 산다'를 시뮬레이션하고 부족 확률을 비교.
 * 산 날부터 기간 끝까지의 부족 확률을 본다 — 사기 전 구간의 위험은 언제 사든 같으므로.
 */
export function adviseTiming(
  candidates: ISODate[],
  buildSim: (date: ISODate) => Simulation,
  from: ISODate,
  until: ISODate,
  forecast: SpendingForecast,
  minBalance: number,
  n = TIMING_PATHS,
): TimingAdvice {
  const paths = spendPaths(forecast, n, 7);
  const points = candidates.map((date) => ({ date, pShort: worldRisk(buildSim(date), date > from ? date : from, until, paths, minBalance, false).pShort }));
  const best = points.find((p) => p.pShort <= SAFE_SHORTFALL_PROB) ?? null;
  return { points, best, original: points[0], until, paths: n };
}
