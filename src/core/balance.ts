/**
 * 결제계좌 일별 잔고.
 *
 *   B̂(t) = B₀ + I(t₀~t) − F(t₀~t) − D̂(t₀~t) − Ĉ(t₀~t)
 *
 * t₀(잔액 확인 시각) 이전 거래는 이미 B₀에 들어 있으므로 다시 더하거나 빼지 않는다.
 * account_id가 결제계좌이고 debit_at이 t₀ 이후인 Posting만 합친다.
 * 같은 날에는 출금을 먼저 빼고 입금을 더한다(보수적) — 하루 최저점(low)이 결제 판단 기준.
 */
import type { ISODate } from '../../shared/dates';
import { dateRange, kstDate, kstStart, DAY_MS } from './time';
import type { Posting } from './ledger';
import type { AccountRef, BalanceObservation, Ms } from './types';

export interface Anchor {
  b0: number;
  t0: Ms;
  source: BalanceObservation['source'];
}

/** 가장 최근 결제계좌 잔액 관측 */
export function latestAnchor(obs: BalanceObservation[], paymentAccountId: AccountRef): Anchor | null {
  let best: BalanceObservation | null = null;
  for (const o of obs) if (o.accountId === paymentAccountId && (!best || o.at > best.at)) best = o;
  return best ? { b0: best.balance, t0: best.at, source: best.source } : null;
}

export interface DayBalance {
  date: ISODate;
  open: number;
  /** 그날 출금을 다 뺀 직후 (최저점) */
  low: number;
  close: number;
  out: Posting[];
  in: Posting[];
}

export function projectBalance(anchor: Anchor, postings: Posting[], paymentAccountId: AccountRef, to: ISODate): DayBalance[] {
  const rel = postings.filter((p) => p.accountId === paymentAccountId && p.debitAt > anchor.t0).sort((a, b) => a.debitAt - b.debitAt);
  const days: DayBalance[] = [];
  let bal = anchor.b0;
  let i = 0;
  for (const date of dateRange(kstDate(anchor.t0), to)) {
    const end = kstStart(date) + DAY_MS;
    const out: Posting[] = [];
    const inc: Posting[] = [];
    while (i < rel.length && rel[i].debitAt < end) {
      (rel[i].amount < 0 ? out : inc).push(rel[i]);
      i++;
    }
    const open = bal;
    const low = open + out.reduce((s, p) => s + p.amount, 0);
    const close = low + inc.reduce((s, p) => s + p.amount, 0);
    days.push({ date, open, low, close, out, in: inc });
    bal = close;
  }
  return days;
}

export function dayOf(days: DayBalance[], date: ISODate): DayBalance | undefined {
  return days.find((d) => d.date === date);
}
