import type { ISODate } from './dates';

export interface Candle {
  date: ISODate;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number | null;
}

/** kis: 한국투자증권 Open API · naver: 네이버 금융(비공식) · yahoo: Yahoo Finance(지연) · demo: 예시 */
export type QuoteSource = 'kis' | 'naver' | 'yahoo' | 'demo';

export interface Quote {
  code: string;
  name: string;
  price: number;
  /** 가격 기준 시각(ms) — 데이터 제공처가 준 시각 */
  time: number;
  /** 가격 기준 날짜(한국 시간) */
  date: ISODate;
  prevClose: number | null;
  prevCloseDate: ISODate | null;
  change: number | null;
  changePct: number | null;
  dayOpen?: number | null;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  source: QuoteSource;
  /** 실시간 체결 스트림에서 온 값인지 */
  live: boolean;
  delayed: boolean;
  delayNote: string;
  fetchedAt: number;
  /** 최근 일봉(오래된 순) */
  candles: Candle[];
  candleSource?: QuoteSource | null;
}

export interface IndexQuote {
  id: string;
  name: string;
  value: number;
  change: number | null;
  changePct: number | null;
  time: number;
  source: QuoteSource;
  delayed: boolean;
  advancers?: number | null;
  decliners?: number | null;
}

/** 가격 기준일 이전의 마지막 일봉 = 전 거래일 종가 (휴장일 자동 건너뜀) */
export function previousClose(candles: Candle[], priceDate: ISODate): { close: number; date: ISODate } | null {
  for (let i = candles.length - 1; i >= 0; i--) {
    if (candles[i].date < priceDate) return { close: candles[i].close, date: candles[i].date };
  }
  return null;
}

export function changeFrom(base: number | null, now: number): { change: number; pct: number } | null {
  if (base === null || !Number.isFinite(base) || base === 0) return null;
  const change = now - base;
  return { change, pct: (change / base) * 100 };
}

export interface Volatility {
  days: number;
  from: ISODate;
  to: ISODate;
  /** 일간 수익률(로그) 표준편차 % */
  dailyPct: number;
  /** √252로 환산한 연환산 % */
  annualPct: number;
}

/** 최근 n거래일 일간 로그수익률의 표본표준편차. 데이터가 부족하면 null */
export function volatility(candles: Candle[], n = 20): Volatility | null {
  const closes = candles.filter((c) => Number.isFinite(c.close) && c.close > 0);
  if (closes.length < n + 1) return null;
  const slice = closes.slice(-(n + 1));
  const rets: number[] = [];
  for (let i = 1; i < slice.length; i++) rets.push(Math.log(slice[i].close / slice[i - 1].close));
  const mean = rets.reduce((s, r) => s + r, 0) / rets.length;
  const variance = rets.reduce((s, r) => s + (r - mean) ** 2, 0) / (rets.length - 1);
  const sd = Math.sqrt(variance);
  return {
    days: n,
    from: slice[1].date,
    to: slice[slice.length - 1].date,
    dailyPct: sd * 100,
    annualPct: sd * Math.sqrt(252) * 100,
  };
}

/** 오늘을 제외한 최근 n거래일 평균 거래량 */
export function averageVolume(candles: Candle[], beforeDate: ISODate, n = 20): number | null {
  const vols = candles.filter((c) => c.date < beforeDate && c.volume !== null && c.volume > 0).map((c) => c.volume as number);
  if (vols.length < Math.min(n, 5)) return null;
  const s = vols.slice(-n);
  return s.reduce((a, b) => a + b, 0) / s.length;
}

export function dayRange(high: number | null, low: number | null, prevClose: number | null): { width: number; pct: number | null } | null {
  if (high === null || low === null) return null;
  const width = high - low;
  return { width, pct: prevClose ? (width / prevClose) * 100 : null };
}

/** 최근 n거래일 수익률(%) */
export function periodReturn(candles: Candle[], n: number): number | null {
  if (candles.length < n + 1) return null;
  const a = candles[candles.length - 1 - n].close;
  const b = candles[candles.length - 1].close;
  return a > 0 ? ((b - a) / a) * 100 : null;
}
