import { todayKST } from '../../../shared/dates';
import type { SpendEntry } from '../ml/types';
import type { Profile, ScheduleItem } from '../types';
import { emptyMoa, type MoaSchedule, type MoaState, type Txn } from './types';

/**
 * 기존 화면(평행세계 비교·가계부)과 모아 엔진을 잇는 다리.
 * 모아 엔진이 결제계좌의 기준(B₀·t₀·일정)을 갖고, 기존 Profile은 같은 값을 따라간다.
 */

export function moaFromProfile(p: Profile): MoaState {
  const m = emptyMoa();
  const schedule: MoaSchedule[] = p.items.map((i) => ({
    id: i.id,
    name: i.name,
    amount: i.amount,
    direction: i.kind === 'income' ? 'in' : 'out',
    recurrence: i.recurrence,
    day: i.day,
    date: i.date,
    essential: i.kind === 'expense',
    status: i.kind === 'income' ? 'scheduled' : undefined,
  }));
  return { ...m, anchor: { balance: p.baseBalance, at: p.baseSetAt, source: 'manual', reflected: p.reflectedOnBaseDate.map((id) => `${id}:${p.baseDate}`) }, schedule };
}

export function profileFromMoa(m: MoaState, prev: Profile | null): Profile {
  const items: ScheduleItem[] = m.schedule.map((s) => ({
    id: s.id,
    kind: s.direction === 'in' ? 'income' : 'expense',
    name: s.name,
    amount: s.amount,
    recurrence: s.recurrence,
    day: s.day,
    date: s.date,
  }));
  const at = m.anchor?.at ?? Date.now();
  return {
    baseBalance: m.anchor?.balance ?? 0,
    baseDate: todayKST(new Date(at)),
    baseSetAt: at,
    minBalance: prev?.minBalance ?? 0,
    dailySpend: prev?.dailySpend,
    items,
    reflectedOnBaseDate: (m.anchor?.reflected ?? []).map((k) => k.split(':')[0]),
    goal: prev?.goal,
  };
}

/** 가계부 목록에 보일 지출 (소비만) */
export function spendEntryOf(t: Txn): SpendEntry | null {
  if (t.kind !== 'spend') return null;
  return { date: t.date, amount: t.amount, category: t.category, name: t.name, from: 'record', txnId: t.id };
}

/** Synthetic MOA account derives from the same canonical 92-day fixture. */
export { demoMoa } from '../commonDemo';
