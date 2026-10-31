/**
 * 고정 출금(F)과 미래 입금(I) 일정을 날짜별 Posting으로 펼친다.
 *
 * - 기준 시각 t₀ 이전 일정은 이미 B₀에 들어 있으므로 넣지 않는다.
 * - 이미 거래로 기록된(실현된) 일정은 다시 넣지 않는다 — 실제 거래가 대신 계산된다.
 * - 입금은 확실성(예정/불확실)과 실현 여부를 따로 본다.
 */
import { addDays, diffDays, parseISO, type ISODate } from '../../shared/dates';
import { dayOfMonth, kstDate, kstStart } from './time';
import type { Posting } from './ledger';
import type { FixedItem, IncomeSchedule, Ms, Txn } from './types';

/** 고정 출금 일정이 이 날짜 차이 안에서 같은 금액 거래로 기록되면 실현된 것으로 본다 */
export const FIXED_MATCH_DAYS = 3;
/** 입금 일정: 예정일 5일 전 ~ 10일 뒤 사이에 들어온 같은 금액 입금이면 실현 */
export const INCOME_MATCH_BEFORE = 5;
export const INCOME_MATCH_AFTER = 10;
/** 지난 일정을 살펴보는 범위 (늦어진 입금 확인용) */
const LOOKBACK_DAYS = 10;
/** 입금은 그날 마지막에 들어온다고 본다 (같은 날 출금 먼저 — 보수적) */
const INCOME_TIME = 23 * 3600_000 + 59 * 60_000;

export function occurrences(item: { recurrence: 'monthly' | 'once'; day?: number; date?: ISODate }, from: ISODate, to: ISODate): ISODate[] {
  if (item.recurrence === 'once') return item.date && item.date >= from && item.date <= to ? [item.date] : [];
  const day = item.day ?? 1;
  const out: ISODate[] = [];
  let { y, m } = parseISO(from);
  for (let i = 0; i < 60; i++) {
    const d = dayOfMonth(y, m, day);
    if (d > to) break;
    if (d >= from) out.push(d);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

function realizedBy(txns: Txn[], used: Set<string>, ref: string, accountId: string, amount: number, date: ISODate, before: number, after: number, types: Txn['type'][]): Txn | null {
  let best: Txn | null = null;
  for (const t of txns) {
    if (used.has(t.id) || !types.includes(t.type)) continue;
    const d = diffDays(date, kstDate(t.occurredAt));
    if (d < -before || d > after) continue;
    const tRef = 'scheduleRef' in t ? t.scheduleRef : undefined;
    if (tRef && tRef !== ref) continue;
    // 변동 지출이 우연히 같은 금액인 경우를 막으려고, 지출은 필수 지출이거나 명시적으로 연결된 것만 본다
    if (t.type === 'spend' && !t.essential && tRef !== ref) continue;
    const tAcc = t.type === 'spend' ? t.accountId : 'accountId' in t ? t.accountId : undefined;
    const sameAmount = t.amount === amount;
    if (tRef === ref || (sameAmount && (!tAcc || tAcc === accountId))) {
      if (!best || Math.abs(diffDays(date, kstDate(t.occurredAt))) < Math.abs(diffDays(date, kstDate(best.occurredAt)))) best = t;
    }
  }
  if (best) used.add(best.id);
  return best;
}

export function expandFixed(items: FixedItem[], t0: Ms, to: ISODate, txns: Txn[]): Posting[] {
  const out: Posting[] = [];
  const used = new Set<string>();
  const from = addDays(kstDate(t0), -LOOKBACK_DAYS);
  for (const item of items) {
    for (const date of occurrences(item, from, to)) {
      const hit = realizedBy(txns, used, item.id, item.accountId, item.amount, date, FIXED_MATCH_DAYS, FIXED_MATCH_DAYS, ['spend', 'saving', 'own_transfer']);
      if (hit) continue;
      const debitAt = kstStart(date);
      if (debitAt <= t0) continue; // 이미 B₀에 반영
      out.push({
        id: `${item.id}@${date}`,
        sourceId: item.id,
        role: item.kind === 'saving' ? 'saving' : 'fixed',
        occurredAt: debitAt,
        debitAt,
        accountId: item.accountId,
        amount: -item.amount,
        status: 'confirmed',
        label: item.name,
        essential: item.essential,
      });
    }
  }
  return out;
}

export interface IncomePlan {
  /** 기본 계산에 넣는 입금 (예정) */
  scheduled: Posting[];
  /** 지연 시나리오의 입금 (예정 입금을 delay일 뒤로) */
  delayed: Posting[];
  /** 불확실 입금 — 기본 계산에서 빼고 '들어온다면' 참고로만 */
  uncertain: Posting[];
  /** 예정일이 t₀ 날짜보다 지났는데 아직 안 들어온 입금 (계산에서 빼고 화면에 표시) */
  overdue: { id: string; name: string; date: ISODate; amount: number }[];
  /** 잔액 확인한 날과 같은 날 예정인 입금 — 이미 들어왔는지 사용자에게 한 번 묻는다 */
  sameDayAsAnchor: string[];
}

export function expandIncomes(items: IncomeSchedule[], t0: Ms, to: ISODate, txns: Txn[], delayDays: number): IncomePlan {
  const plan: IncomePlan = { scheduled: [], delayed: [], uncertain: [], overdue: [], sameDayAsAnchor: [] };
  const used = new Set<string>();
  const anchorDate = kstDate(t0);
  const from = addDays(anchorDate, -LOOKBACK_DAYS);
  for (const item of items) {
    for (const date of occurrences(item, from, to)) {
      if (realizedBy(txns, used, item.id, item.accountId, item.amount, date, INCOME_MATCH_BEFORE, INCOME_MATCH_AFTER, ['income', 'own_transfer'])) continue;
      if (date < anchorDate) {
        if (item.certainty === 'scheduled') plan.overdue.push({ id: `${item.id}@${date}`, name: item.name, date, amount: item.amount });
        continue;
      }
      if (date === anchorDate) plan.sameDayAsAnchor.push(`${item.id}@${date}`);
      const mk = (d: ISODate): Posting => ({
        id: `${item.id}@${date}`,
        sourceId: item.id,
        role: 'income',
        occurredAt: kstStart(d) + INCOME_TIME,
        debitAt: kstStart(d) + INCOME_TIME,
        accountId: item.accountId,
        amount: item.amount,
        status: 'confirmed',
        label: item.name,
      });
      if (item.certainty === 'uncertain') {
        plan.uncertain.push(mk(date));
        continue;
      }
      plan.scheduled.push(mk(date));
      plan.delayed.push(mk(addDays(date, delayDays)));
    }
  }
  return plan;
}
