import { addDays, daysInMonth, parseISO, toISO, type ISODate } from '../../shared/dates';
import type { Ms } from './types';

const KST = 9 * 3600_000;
export const DAY_MS = 86_400_000;

/** 한국 시간 기준 날짜 */
export function kstDate(t: Ms): ISODate {
  const d = new Date(t + KST);
  return toISO(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
}

/** 한국 시간 기준 그 날 00:00 */
export function kstStart(date: ISODate): Ms {
  const { y, m, d } = parseISO(date);
  return Date.UTC(y, m - 1, d) - KST;
}

/** 한국 시간 'YYYY-MM-DD HH:mm' → Ms (테스트·시드용) */
export function kst(s: string): Ms {
  const [date, time = '00:00'] = s.split(' ');
  const [hh, mm] = time.split(':').map(Number);
  return kstStart(date) + hh * 3600_000 + mm * 60_000;
}

/** 매월 day일. 그 달에 없으면 말일 */
export function dayOfMonth(y: number, m: number, day: number): ISODate {
  return toISO(y, m, Math.min(day, daysInMonth(y, m)));
}

/** date 이상인 첫 '매월 day일' */
export function nextMonthlyOnOrAfter(date: ISODate, day: number): ISODate {
  let { y, m } = parseISO(date);
  for (let i = 0; i < 3; i++) {
    const cand = dayOfMonth(y, m, day);
    if (cand >= date) return cand;
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  throw new Error('unreachable');
}

/** date보다 뒤인 첫 '매월 day일' */
export function nextMonthlyAfter(date: ISODate, day: number): ISODate {
  return nextMonthlyOnOrAfter(addDays(date, 1), day);
}

export function weekday(date: ISODate): number {
  const { y, m, d } = parseISO(date);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function dateRange(from: ISODate, to: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) out.push(d);
  return out;
}
