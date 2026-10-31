import { isoFromEpochKST, type ISODate } from '../../../shared/dates';
import { uid } from '../id';
import { matchSchedule } from './ledger';
import { expectedBalanceAt, mismatchThreshold } from './risk';
import type { AlertLog, Anchor, DayStatus, MoaCard, MoaSchedule, MoaState, Txn } from './types';

/** 상태를 바꾸는 순수 함수들. 화면은 update((s) => ({...s, moa: f(s.moa)})) 로만 쓴다. */

export function setAnchor(m: MoaState, balance: number, at: number, source: Anchor['source'] = 'manual', reflected: string[] = []): MoaState {
  return { ...m, anchor: { balance: Math.round(balance), at, source, reflected } };
}

export type NewTxn = Omit<Txn, 'id' | 'createdAt' | 'date'> & { date?: ISODate; id?: string };

const signed = (t: Pick<Txn, 'kind' | 'amount' | 'direction'>) => (t.kind === 'income' || t.kind === 'refund' || (t.kind === 'transfer_self' && t.direction === 'in') ? t.amount : -t.amount);

/**
 * 거래 저장.
 * - 등록 일정과 같은 거래면 scheduleRef로 묶어 두 번 빼지 않는다.
 * - 결제계좌 거래에 거래 후 잔액이 있으면 B₀·t₀를 새로 잡는다. 이때 계산 잔고와 다르면 불일치로 기록한다.
 */
export function addTxns(m: MoaState, list: NewTxn[], now = Date.now()): MoaState {
  let s = m;
  const sorted = [...list].sort((a, b) => a.occurredAt - b.occurredAt);
  for (const n of sorted) {
    const t: Txn = { ...n, id: n.id ?? uid('tx'), date: n.date ?? isoFromEpochKST(n.occurredAt), createdAt: now };
    if (!t.scheduleRef && t.kind !== 'card_payment') {
      const ref = matchSchedule(t, s.schedule);
      if (ref && !s.txns.some((x) => x.scheduleRef === ref)) t.scheduleRef = ref;
    }
    let next: MoaState = { ...s, txns: [...s.txns, t] };
    if (t.balanceAfter !== undefined && t.account === 'pay' && (!s.anchor || t.occurredAt > s.anchor.at)) {
      const before = expectedBalanceAt(s, t.occurredAt, t.date);
      if (before !== null) {
        const expected = before + signed(t);
        if (Math.abs(expected - t.balanceAfter) > mismatchThreshold(expected)) next = { ...next, mismatches: [...next.mismatches, { at: t.occurredAt, expected: Math.round(expected), actual: t.balanceAfter }].slice(-20) };
      }
      next = setAnchor(next, t.balanceAfter, t.occurredAt, 'sms', t.scheduleRef ? [t.scheduleRef] : []);
    }
    s = next;
  }
  return s;
}

export function removeTxn(m: MoaState, id: string): MoaState {
  return { ...m, txns: m.txns.filter((t) => t.id !== id) };
}

export function updateTxn(m: MoaState, id: string, patch: Partial<Txn>): MoaState {
  return { ...m, txns: m.txns.map((t) => (t.id === id ? { ...t, ...patch } : t)) };
}

export function setDayStatus(m: MoaState, date: ISODate, status: DayStatus | null): MoaState {
  const dayStatus = { ...m.dayStatus };
  if (status) dayStatus[date] = status;
  else delete dayStatus[date];
  return { ...m, dayStatus };
}

export function upsertSchedule(m: MoaState, item: Omit<MoaSchedule, 'id'> & { id?: string }): MoaState {
  const id = item.id ?? uid('sc');
  const exists = m.schedule.some((x) => x.id === id);
  const full = { ...item, id } as MoaSchedule;
  return { ...m, schedule: exists ? m.schedule.map((x) => (x.id === id ? full : x)) : [...m.schedule, full] };
}

export function removeSchedule(m: MoaState, id: string): MoaState {
  return { ...m, schedule: m.schedule.filter((x) => x.id !== id) };
}

export function upsertCard(m: MoaState, card: Omit<MoaCard, 'id'> & { id?: string }): MoaState {
  const id = card.id ?? uid('cd');
  const exists = m.cards.some((x) => x.id === id);
  const full = { ...card, id } as MoaCard;
  return { ...m, cards: exists ? m.cards.map((x) => (x.id === id ? full : x)) : [...m.cards, full] };
}

export function removeCard(m: MoaState, id: string): MoaState {
  return { ...m, cards: m.cards.filter((c) => c.id !== id), txns: m.txns.map((t) => (t.cardId === id ? { ...t, cardId: undefined } : t)) };
}

export function pushAlerts(m: MoaState, alerts: AlertLog[]): MoaState {
  return alerts.length ? { ...m, alerts: [...m.alerts, ...alerts].slice(-200) } : m;
}

export function markAlertsRead(m: MoaState): MoaState {
  return { ...m, alerts: m.alerts.map((a) => (a.read ? a : { ...a, read: true })) };
}

/** 1분 설정: 결제계좌 잔액 + 가장 가까운 필수결제 1건 */
export function quickStart(m: MoaState, balance: number, payment: { name: string; amount: number; day: number }, now = Date.now()): MoaState {
  const withAnchor = setAnchor(m, balance, now);
  return upsertSchedule(withAnchor, { name: payment.name, amount: payment.amount, day: payment.day, recurrence: 'monthly', direction: 'out', essential: true });
}

/** 카드 이름으로 찾거나 새로 만든다 (문자에서 처음 보는 카드) */
export function findCardByName(m: MoaState, name: string): MoaCard | undefined {
  const key = name.replace(/\s|카드/g, '');
  return m.cards.find((c) => c.name.replace(/\s|카드/g, '') === key);
}
