import { addDays, addMonths, diffDays, isoFromEpochKST, monthlyDate, parseISO, type ISODate } from '../../../shared/dates';
import { billingDate, installmentBills, isCreditCardReady } from './billing';
import type { Anchor, Line, MoaCard, MoaSchedule, MoaState, Txn } from './types';

/**
 * 결제계좌 기준 확정·등록 흐름 (기획서 일별 잔고 계산식의 I, F, 확정 D, 확정 C).
 *
 *   B̂(t) = B₀ + I(t₀~t) − F(t₀~t) − D̂(t₀~t) − Ĉ(t₀~t)
 *
 * - t₀ 이전 거래는 이미 B₀에 들어 있으므로 더하거나 빼지 않는다.
 * - 날짜만 있는 흐름(일정·카드 대금)이 t₀ 날짜에 있으면 anchor.reflected에 키가 있을 때만 이미 반영된 것으로 본다.
 */

export const anchorDate = (a: Anchor) => isoFromEpochKST(a.at);

/** 일정 한 회차의 키 */
export const occKey = (id: string, date: ISODate) => `${id}:${date}`;
/** 카드 청구 한 건의 키 */
export const billKey = (cardId: string, date: ISODate) => `card:${cardId}:${date}`;

export function scheduleOccurrences(item: MoaSchedule, start: ISODate, end: ISODate): ISODate[] {
  if (item.recurrence === 'once') return item.date && item.date >= start && item.date <= end ? [item.date] : [];
  const day = item.day ?? 1;
  const out: ISODate[] = [];
  let { y, m } = parseISO(start);
  for (let i = 0; i < 60; i++) {
    const d = monthlyDate(y, m, day);
    if (d > end) break;
    if (d >= start) out.push(d);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

/** 거래가 결제계좌에서 빠지는(들어오는) 즉시형인지 */
function hitsPayAccountNow(t: Txn, cards: MoaCard[]): boolean {
  if (t.account !== 'pay') return false;
  if (t.kind === 'card_payment') return true;
  if (t.method === 'cash') return false;
  if (t.method === 'credit') return false;
  if (t.method === 'debit') {
    const card = t.cardId ? cards.find((c) => c.id === t.cardId) : undefined;
    // 카드를 모르면 account 값을 믿는다. 알면 결제계좌 연결 여부를 따른다.
    return card ? card.kind === 'debit' && card.linked : true;
  }
  return true; // transfer, atm
}

function signedOf(t: Txn): number {
  switch (t.kind) {
    case 'income':
    case 'refund':
      return t.amount;
    case 'transfer_self':
      return t.direction === 'in' ? t.amount : -t.amount;
    default:
      return -t.amount;
  }
}

export interface PendingBill {
  cardId: string;
  date: ISODate;
  amount: number;
  /** 이 청구에 들어간 거래 */
  txnIds: string[];
}

/** 신용카드 사용분을 카드·출금일별 청구 예정으로 묶는다 (할부는 회차별) */
export function pendingBills(state: Pick<MoaState, 'cards' | 'txns'>): PendingBill[] {
  const map = new Map<string, PendingBill>();
  const refunded = new Map<string, number>();
  for (const t of state.txns) if (t.kind === 'refund' && t.refundOf) refunded.set(t.refundOf, (refunded.get(t.refundOf) ?? 0) + t.amount);
  for (const t of state.txns) {
    if (t.method !== 'credit' || !t.cardId) continue;
    const card = state.cards.find((c) => c.id === t.cardId);
    if (!card || !isCreditCardReady(card)) continue;
    if (t.kind === 'refund') continue;
    if (t.kind !== 'spend' && t.kind !== 'saving') continue;
    const net = Math.max(0, t.amount - (refunded.get(t.id) ?? 0));
    if (!net) continue;
    const bills = t.installments && t.installments >= 2 ? installmentBills(card, t.date, net, t.installments) : [{ date: billingDate(card, t.date), amount: net, no: 1 }];
    for (const b of bills) {
      const k = billKey(card.id, b.date);
      const cur = map.get(k) ?? { cardId: card.id, date: b.date, amount: 0, txnIds: [] };
      cur.amount += b.amount;
      cur.txnIds.push(t.id);
      map.set(k, cur);
    }
  }
  return [...map.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface Settlement {
  cardId: string;
  billDate: ISODate;
  expected: number;
  actual: number;
  /** 실제 − 예정 */
  diff: number;
  paymentTxnId: string;
}

/**
 * 카드 대금 출금 문자를 청구 예정과 맞춘다.
 * 같은 카드의 출금일 ±3일 안의 청구 예정 한 건과 짝을 짓고, 그 청구 예정은 지운다(출금 문자가 실제 값).
 */
export function settlements(state: Pick<MoaState, 'cards' | 'txns'>, bills = pendingBills(state)): Settlement[] {
  const out: Settlement[] = [];
  const used = new Set<string>();
  const pays = state.txns.filter((t) => t.kind === 'card_payment' && t.cardId).sort((a, b) => a.occurredAt - b.occurredAt);
  for (const p of pays) {
    const cand = bills
      .filter((b) => b.cardId === p.cardId && !used.has(billKey(b.cardId, b.date)) && Math.abs(diffDays(b.date, p.date)) <= 3)
      .sort((a, b) => Math.abs(diffDays(a.date, p.date)) - Math.abs(diffDays(b.date, p.date)))[0];
    const expected = cand?.amount ?? 0;
    const billDate = cand?.date ?? p.date;
    if (cand) used.add(billKey(cand.cardId, cand.date));
    out.push({ cardId: p.cardId!, billDate, expected, actual: p.amount, diff: p.amount - expected, paymentTxnId: p.id });
  }
  return out;
}

export interface ConfirmedFlows {
  lines: Line[];
  /** 결제계좌에 영향 없는 소비(지갑 현금, 다른 계좌 체크카드 등) — 화면 설명용 */
  outsideCount: number;
  settlements: Settlement[];
  bills: PendingBill[];
}

/** t₀ 이후 결제계좌의 확정·등록 흐름. until까지. */
export function confirmedFlows(state: MoaState, until: ISODate, opts: { incomeDelay?: number } = {}): ConfirmedFlows {
  const anchor = state.anchor;
  if (!anchor) return { lines: [], outsideCount: 0, settlements: [], bills: [] };
  const t0 = anchor.at;
  const d0 = anchorDate(anchor);
  const reflected = new Set(anchor.reflected);
  const lines: Line[] = [];
  let outside = 0;

  // 1) 기록된 거래 중 즉시형 (체크·이체·ATM·입금)
  const matched = new Set<string>();
  for (const t of state.txns) {
    if (t.scheduleRef) matched.add(t.scheduleRef);
    if (t.method === 'credit' && t.kind !== 'card_payment') continue; // 청구로 처리
    if (!hitsPayAccountNow(t, state.cards)) {
      if (t.kind === 'spend') outside += 1;
      continue;
    }
    if (t.occurredAt <= t0) continue; // 이미 B₀에 있음
    if (t.date > until) continue;
    lines.push({ date: t.date, amount: signedOf(t), label: t.name, source: 'txn', certainty: 'confirmed', essential: t.essential, refId: t.id, cardId: t.cardId });
  }

  // 2) 신용카드 청구 예정 (출금 문자로 정산된 것은 제외 — 출금 문자 자체가 1)에서 이미 들어감)
  const bills = pendingBills(state);
  const settled = settlements(state, bills);
  const settledKeys = new Set(settled.filter((s) => s.expected > 0).map((s) => billKey(s.cardId, s.billDate)));
  for (const b of bills) {
    const k = billKey(b.cardId, b.date);
    if (settledKeys.has(k)) continue;
    if (b.date < d0 || b.date > until) continue;
    if (b.date === d0 && reflected.has(k)) continue;
    const card = state.cards.find((c) => c.id === b.cardId);
    lines.push({ date: b.date, amount: -b.amount, label: `${card?.name ?? '카드'} 카드값`, source: 'card_bill', certainty: 'confirmed', essential: true, refId: k, cardId: b.cardId });
  }

  // 3) 등록 일정 (고정 출금·예정/불확실 입금·계좌 간 이체)
  const delay = opts.incomeDelay ?? 0;
  for (const item of state.schedule) {
    // 지연 시나리오를 위해 입금은 조금 앞에서부터 펼친다
    const start = item.direction === 'in' && delay > 0 ? addDays(d0, -delay) : d0;
    for (const date of scheduleOccurrences(item, start, until)) {
      const k = occKey(item.id, date);
      if (matched.has(k)) continue; // 같은 거래가 이미 기록됨
      if (date === d0 && reflected.has(k)) continue;
      if (item.direction === 'out') {
        if (date < d0) continue;
        lines.push({ date, amount: -item.amount, label: item.name, source: 'fixed', certainty: 'scheduled', essential: item.essential, refId: k });
        continue;
      }
      // 내 다른 계좌에서 옮기는 돈은 내가 정하는 일이라 지연시키지 않는다
      const shifted = item.status === 'uncertain' || item.fromOtherAccount ? date : addDays(date, delay);
      if (date < d0) continue; // 원래 날짜가 t₀ 이전이면 이미 들어온 돈
      if (shifted > until) continue;
      lines.push({
        date: shifted,
        amount: item.amount,
        label: item.name,
        source: 'income',
        certainty: item.status === 'uncertain' ? 'uncertain' : 'scheduled',
        essential: false,
        refId: k,
      });
    }
  }
  lines.sort((a, b) => a.date.localeCompare(b.date) || a.amount - b.amount);
  return { lines, outsideCount: outside, settlements: settled, bills };
}

/** 등록 일정 회차와 같은 거래인지 (금액 ±10%, 날짜 ±3일, 방향 일치) */
export function matchSchedule(t: Txn, schedule: MoaSchedule[]): string | undefined {
  const dir = t.kind === 'income' || (t.kind === 'transfer_self' && t.direction === 'in') ? 'in' : 'out';
  for (const item of schedule) {
    if (item.direction !== dir) continue;
    if (Math.abs(item.amount - t.amount) > item.amount * 0.1) continue;
    const near = scheduleOccurrences(item, addDays(t.date, -3), addDays(t.date, 3));
    if (near.length) return occKey(item.id, near[0]);
  }
  return undefined;
}

/** 한 달 뒤까지의 날짜 (일정 펼치기 기본 범위) */
export const defaultUntil = (today: ISODate) => addMonths(today, 1);
