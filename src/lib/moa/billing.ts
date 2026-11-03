import { addMonths, monthlyDate, parseISO, type ISODate } from '../../../shared/dates';
import type { MoaCard } from './types';

/**
 * 신용카드 청구 규칙.
 * 이용기간 마감일(cutoffDay)까지 쓴 금액은 마감일 다음에 오는 첫 결제일(payDay)에 결제계좌에서 빠진다.
 * 예) 마감 말일·결제 14일 → 10/31까지 쓴 돈은 11/14 출금
 *     마감 10일·결제 25일 → 10/10까지는 10/25, 10/11부터는 11/25 출금
 */
export const DEFAULT_CUTOFF = 31;
export const DEFAULT_PAYDAY = 14;

export function isCreditCardReady(card: MoaCard): boolean {
  return card.kind === 'credit' && !!card.cutoffDay && !!card.payDay;
}

/** 구매일이 속한 이용기간의 마감일 */
export function closingDate(card: MoaCard, purchase: ISODate): ISODate {
  const cutoff = card.cutoffDay ?? DEFAULT_CUTOFF;
  const { y, m } = parseISO(purchase);
  const thisMonth = monthlyDate(y, m, cutoff);
  if (purchase <= thisMonth) return thisMonth;
  const next = addMonths(`${y}-${String(m).padStart(2, '0')}-01`, 1);
  const p = parseISO(next);
  return monthlyDate(p.y, p.m, cutoff);
}

/** 마감일 다음에 오는 첫 결제일 */
export function paymentAfter(card: MoaCard, closing: ISODate): ISODate {
  const payDay = card.payDay ?? DEFAULT_PAYDAY;
  const { y, m } = parseISO(closing);
  const same = monthlyDate(y, m, payDay);
  if (same > closing) return same;
  const next = addMonths(`${y}-${String(m).padStart(2, '0')}-01`, 1);
  const p = parseISO(next);
  return monthlyDate(p.y, p.m, payDay);
}

/** 일시불 구매의 출금일 */
export function billingDate(card: MoaCard, purchase: ISODate): ISODate {
  return paymentAfter(card, closingDate(card, purchase));
}

/**
 * 할부 회차별 출금일·금액. 1회차는 일시불과 같은 결제일, 이후 매달.
 * 원 단위 나머지는 1회차에 더한다. (할부 수수료는 MVP에서 계산하지 않는다)
 */
export function installmentBills(card: MoaCard, purchase: ISODate, total: number, n: number): { date: ISODate; amount: number; no: number }[] {
  const count = Math.max(1, Math.floor(n));
  const each = Math.floor(total / count);
  const rest = total - each * count;
  const first = billingDate(card, purchase);
  const payDay = card.payDay ?? DEFAULT_PAYDAY;
  return Array.from({ length: count }, (_, i) => ({
    date: i === 0 ? first : addMonths(first, i, payDay),
    amount: i === 0 ? each + rest : each,
    no: i + 1,
  }));
}

/** 오늘 이후 이 카드의 다음 출금일 */
export function nextPaymentDate(card: MoaCard, today: ISODate): ISODate {
  return billingDate(card, today);
}
