import { addDays, minutesKST, todayKST, weekdayOf, type ISODate } from './dates';

/**
 * 한국거래소(KRX) 휴장일 — 주말 제외 평일 휴장일.
 * 2026년: 공휴일·대체공휴일·지방선거일·연말 휴장 반영. 매년 KRX 공지로 갱신해야 한다.
 */
export const KRX_HOLIDAYS: ReadonlySet<ISODate> = new Set([
  // 2026
  '2026-01-01',
  '2026-02-16', '2026-02-17', '2026-02-18', // 설날
  '2026-03-02', // 삼일절 대체
  '2026-05-01', // 근로자의 날
  '2026-05-05', // 어린이날
  '2026-05-25', // 부처님오신날 대체
  '2026-06-03', // 전국동시지방선거
  '2026-08-17', // 광복절 대체
  '2026-09-24', '2026-09-25', '2026-09-28', // 추석·대체
  '2026-10-05', // 개천절 대체
  '2026-10-09', // 한글날
  '2026-12-25',
  '2026-12-31', // 연말 휴장
  // 2027 (일부 — 확정 공지 후 갱신 필요)
  '2027-01-01',
]);

export const SESSION_OPEN_MIN = 9 * 60; // 09:00
export const SESSION_CLOSE_MIN = 15 * 60 + 30; // 15:30

export function isTradingDay(d: ISODate): boolean {
  const w = weekdayOf(d);
  return w !== 0 && w !== 6 && !KRX_HOLIDAYS.has(d);
}

export function prevTradingDay(d: ISODate): ISODate {
  let x = addDays(d, -1);
  for (let i = 0; i < 30 && !isTradingDay(x); i++) x = addDays(x, -1);
  return x;
}

export function nextTradingDay(d: ISODate): ISODate {
  let x = addDays(d, 1);
  for (let i = 0; i < 30 && !isTradingDay(x); i++) x = addDays(x, 1);
  return x;
}

export type SessionState = 'pre' | 'open' | 'closed' | 'holiday';

export interface MarketStatus {
  state: SessionState;
  today: ISODate;
  label: string;
  /** 지금 지정가 주문을 내면 유효한 거래일 */
  orderDay: ISODate;
}

export function marketStatus(now: Date = new Date()): MarketStatus {
  const today = todayKST(now);
  const min = minutesKST(now);
  if (!isTradingDay(today)) {
    return { state: 'holiday', today, label: '휴장일', orderDay: nextTradingDay(today) };
  }
  if (min < SESSION_OPEN_MIN) return { state: 'pre', today, label: '장 시작 전', orderDay: today };
  if (min < SESSION_CLOSE_MIN) return { state: 'open', today, label: '장 운영 중', orderDay: today };
  return { state: 'closed', today, label: '장 마감', orderDay: nextTradingDay(today) };
}

/** 주어진 거래일의 장 마감 시각(ms) */
export function sessionCloseMs(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day, 15 - 9, 30);
}

/** KRX 호가 단위(2023년 개편 기준). ETF는 5원 단위 */
export function tickSize(price: number, type: 'stock' | 'etf'): number {
  if (type === 'etf') return 5;
  if (price < 2000) return 1;
  if (price < 5000) return 5;
  if (price < 20000) return 10;
  if (price < 50000) return 50;
  if (price < 200000) return 100;
  if (price < 500000) return 500;
  return 1000;
}

export function roundToTick(price: number, type: 'stock' | 'etf'): number {
  const t = tickSize(price, type);
  return Math.max(t, Math.round(price / t) * t);
}
