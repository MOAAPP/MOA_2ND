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

/** 자동으로 들어오는 기록(문자·사진·가져오기). 같은 원문이 두 번 들어와도 한 번만 반영한다. */
const AUTO_SOURCES: ReadonlySet<Txn['source']> = new Set(['sms', 'photo', 'import']);

/**
 * 거래 중복 판정 키. 같은 문자를 다시 붙여넣거나 저장이 재시도돼도 같은 키가 나온다.
 * 분 단위 시각·계좌·결제 수단·카드·종류·금액·가게 이름·거래 후 잔액을 묶는다.
 * 승인과 취소(환불)는 kind가 달라 서로 다른 거래로 남는다.
 */
export function txnFingerprint(t: Pick<Txn, 'occurredAt' | 'account' | 'method' | 'cardId' | 'kind' | 'amount' | 'name' | 'balanceAfter' | 'direction'>): string {
  const minute = Math.floor(t.occurredAt / 60_000);
  const name = t.name.replace(/\s+/g, '').toLowerCase();
  return [minute, t.account, t.method, t.cardId ?? '', t.kind, t.direction ?? '', t.amount, name, t.balanceAfter ?? ''].join('|');
}

/** 이미 저장된 거래와 겹치는지. id가 같거나, 자동 기록끼리 키가 같으면 중복. 직접 입력은 같은 걸 두 번 사는 경우가 있어 막지 않는다. */
export function isDuplicateTxn(existing: Txn[], n: NewTxn): boolean {
  if (n.id && existing.some((x) => x.id === n.id)) return true;
  if (!AUTO_SOURCES.has(n.source)) return false;
  const key = txnFingerprint(n);
  return existing.some((x) => AUTO_SOURCES.has(x.source) && txnFingerprint(x) === key);
}

export interface AddResult { state: MoaState; added: Txn[]; skipped: NewTxn[] }

/**
 * 거래 저장 (멱등).
 * - 같은 id, 또는 자동 기록 중 같은 중복 키는 건너뛴다 (같은 묶음 안의 중복 포함). 건너뛴 목록을 돌려준다.
 * - 등록 일정과 같은 거래면 scheduleRef로 묶어 두 번 빼지 않는다.
 * - 결제계좌 거래에 거래 후 잔액이 있으면 B₀·t₀를 새로 잡는다. 이때 계산 잔고와 다르면 불일치로 기록한다.
 */
export function addTxnsChecked(m: MoaState, list: NewTxn[], now = Date.now()): AddResult {
  let s = m;
  const added: Txn[] = [];
  const skipped: NewTxn[] = [];
  const sorted = [...list].sort((a, b) => a.occurredAt - b.occurredAt);
  for (const n of sorted) {
    if (isDuplicateTxn(s.txns, n)) { skipped.push(n); continue; }
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
    added.push(t);
  }
  return { state: s, added, skipped };
}

export function addTxns(m: MoaState, list: NewTxn[], now = Date.now()): MoaState {
  return addTxnsChecked(m, list, now).state;
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

/**
 * 1분 설정 입력이 오타처럼 보이는지. 계산은 맞아도 입력이 틀리면 엉뚱한 경고가 뜬다.
 * (예: 잔액 22원·카드값 800만 원 → "7,999,978원이 모자라요")
 * 막지는 않고, 한 번 더 확인할 문장만 돌려준다.
 */
export function suspiciousSetup(balance: number, amount: number): string | null {
  if (balance > 0 && balance < 1_000) return `결제계좌 잔액을 ${balance.toLocaleString('ko-KR')}원으로 넣었어요. 맞나요?`;
  if (amount >= 1_000_000 && amount > Math.max(balance, 1) * 10) return `필수결제 ${amount.toLocaleString('ko-KR')}원이 잔액의 10배가 넘어요. 0을 더 누르지 않았나요?`;
  return null;
}

/** 카드 이름으로 찾거나 새로 만든다 (문자에서 처음 보는 카드) */
export function findCardByName(m: MoaState, name: string, kind?: MoaCard['kind']): MoaCard | undefined {
  const norm = (s: string) => s.toUpperCase().replace(/\s|카드|체크|신용|KB|뱅크|은행/g, '');
  const key = norm(name);
  if (!key) return undefined;
  const hits = m.cards.filter((c) => { const n = norm(c.name); return n === key || (n.length >= 2 && (n.includes(key) || key.includes(n))); });
  return (kind && hits.find((c) => c.kind === kind)) || hits[0];
}
