/** 날짜는 모두 'YYYY-MM-DD' 문자열(한국 시간 기준 달력 날짜)로 다룬다. */
export type ISODate = string;

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(y: number, m: number, d: number): ISODate {
  return `${y}-${pad(m)}-${pad(d)}`;
}

export function parseISO(iso: ISODate): { y: number; m: number; d: number } {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

export function isISODate(v: unknown): v is ISODate {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const { y, m, d } = parseISO(v);
  return m >= 1 && m <= 12 && d >= 1 && d <= daysInMonth(y, m);
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function toUTC(iso: ISODate): number {
  const { y, m, d } = parseISO(iso);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(t: number): ISODate {
  const dt = new Date(t);
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(iso: ISODate, n: number): ISODate {
  return fromUTC(toUTC(iso) + n * 86400000);
}

/** b - a (일) */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b) - toUTC(a)) / 86400000);
}

export function endOfMonth(iso: ISODate): ISODate {
  const { y, m } = parseISO(iso);
  return toISO(y, m, daysInMonth(y, m));
}

export function startOfMonth(iso: ISODate): ISODate {
  const { y, m } = parseISO(iso);
  return toISO(y, m, 1);
}

/** 달 이동. 일자가 그 달에 없으면 말일로 맞춘다. */
export function addMonths(iso: ISODate, n: number, preferredDay?: number): ISODate {
  const { y, m, d } = parseISO(iso);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  const day = Math.min(preferredDay ?? d, daysInMonth(ny, nm));
  return toISO(ny, nm, day);
}

/** 매월 day일. 그 달에 없으면 말일(예: 31 → 2월 28/29일). */
export function monthlyDate(y: number, m: number, day: number): ISODate {
  return toISO(y, m, Math.min(day, daysInMonth(y, m)));
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}
export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

/** 한국 시간 기준 오늘 */
export function todayKST(now: Date = new Date()): ISODate {
  const t = now.getTime() + 9 * 3600000;
  return fromUTC(Math.floor(t / 86400000) * 86400000);
}

/** 한국 시간 기준 분(0~1439) */
export function minutesKST(now: Date = new Date()): number {
  const t = now.getTime() + 9 * 3600000;
  const dt = new Date(t);
  return dt.getUTCHours() * 60 + dt.getUTCMinutes();
}

/** epoch ms → 한국 시간 날짜 */
export function isoFromEpochKST(ms: number): ISODate {
  return todayKST(new Date(ms));
}

export function weekdayOf(iso: ISODate): number {
  return new Date(toUTC(iso)).getUTCDay(); // 0=일
}

const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

export function formatKDate(iso: ISODate, opts: { weekday?: boolean; year?: boolean } = {}): string {
  const { y, m, d } = parseISO(iso);
  const base = `${opts.year ? `${y}년 ` : ''}${m}월 ${d}일`;
  return opts.weekday ? `${base} (${WEEK[weekdayOf(iso)]})` : base;
}

export function formatShort(iso: ISODate): string {
  const { m, d } = parseISO(iso);
  return `${m}.${d}`;
}

export function formatKDateTime(ms: number): string {
  const t = new Date(ms + 9 * 3600000);
  return `${t.getUTCMonth() + 1}월 ${t.getUTCDate()}일 ${pad(t.getUTCHours())}:${pad(t.getUTCMinutes())}`;
}
