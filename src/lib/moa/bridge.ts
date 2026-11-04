import { todayKST } from '../../../shared/dates';
import half from '../../data/moa-half1.json';
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

/** Same S01 fixture as the ledger and the team's ML data; no invented extra 21-day transactions. */
export function demoMoa(nowMs: number): MoaState {
  const today = todayKST(new Date(nowMs));
  const user = half.profiles.find((p) => p.user_id === 'S01')!;
  const current = half.daily.filter((d) => d.user_id === user.user_id && d.date <= today).at(-1);
  const txns: Txn[] = half.transactions
    .filter((t) => t.user_id === user.user_id && t.date <= today && t.logged)
    .map((t) => ({
      id: t.id, occurredAt: t.occurred_at, date: t.date,
      amount: t.amount, kind: t.kind as Txn['kind'], method: t.method as Txn['method'],
      account: t.account as Txn['account'], name: t.name, category: t.category,
      essential: t.essential, source: 'demo' as const, createdAt: t.occurred_at,
      ...(('direction' in t) ? { direction: t.direction as 'in' | 'out' } : {}),
      ...(('schedule_ref' in t) ? { scheduleRef: t.schedule_ref as string } : {}),
      ...(t.method === 'credit' ? { cardId: 'demo_credit' } : {}),
      ...(t.method === 'debit' ? { cardId: 'demo_debit' } : {}),
    }));
  const m = emptyMoa();
  return {
    ...m,
    payAccountName: '가상 결제계좌 · S01',
    anchor: { balance: current?.account_balance_eod ?? user.opening_balance, at: nowMs, source: 'manual', reflected: [] },
    cards: [
      { id: 'demo_credit', name: '가상 신용카드', kind: 'credit', linked: false, cutoffDay: 31, payDay: 14 },
      { id: 'demo_debit', name: '가상 체크카드', kind: 'debit', linked: true },
    ],
    schedule: user.schedule.map((x) => ({
      id: x.id, name: x.name, direction: x.direction as 'in' | 'out',
      amount: x.amount, recurrence: 'monthly' as const, day: x.day,
      essential: x.essential, ...(x.direction === 'in' ? { status: 'scheduled' as const } : {}),
    })),
    txns,
    // The app does not ask for daily "completion" clicks. Unrecorded dates
    // remain unknown; only the offline synthetic oracle has complete truth.
    dayStatus: {},
    mainMethod: 'debit',
    aiNoticeSeen: false,
  };
}
