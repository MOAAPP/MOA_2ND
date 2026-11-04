import { todayKST } from '../../shared/dates';
import half from '../data/moa-half1.json';
import type { SpendEntry } from './ml/types';
import type { DecisionRecord, Profile, ScheduleItem } from './types';

/** Frontend demo uses the very same generated dataset shared with the Python/FastAPI team. */
export function demoData(now = Date.now()): { profile: Profile; records: DecisionRecord[]; spendLog: SpendEntry[] } {
  const today = todayKST(new Date(now));
  const user = half.profiles.find((x) => x.user_id === 'S01')!;
  const last = half.daily.filter((d) => d.user_id === user.user_id && d.date <= today).at(-1);
  const profile: Profile = {
    baseBalance: last?.account_balance_eod ?? user.opening_balance,
    baseDate: today, baseSetAt: now, minBalance: 100_000,
    dailySpend: Math.round(
      half.daily.filter((d) => d.user_id === user.user_id && d.date <= today && d.observation_complete)
        .reduce((s, d) => s + d.observed_variable_spend, 0) /
      Math.max(1, half.daily.filter((d) => d.user_id === user.user_id && d.date <= today && d.observation_complete).length),
    ),
    items: user.schedule.map((x): ScheduleItem => ({
      id: x.id, kind: x.direction === 'in' ? 'income' : 'expense', name: x.name,
      amount: x.amount, recurrence: 'monthly', day: x.day,
    })),
    reflectedOnBaseDate: [],
    goal: { name: '겨울 여행', target: 800_000, saved: 150_000, monthlySaving: 100_000, annualRate: 0 },
  };
  const spendLog: SpendEntry[] = half.transactions
    .filter((t) => t.user_id === user.user_id && t.date <= today && t.logged && t.kind === 'spend' && !t.essential)
    .map((t) => ({ date: t.date, amount: t.amount, name: t.name, category: t.category, from: 'demo', txnId: t.id }));
  // Decision scenarios are represented in the virtual wallet; don't count them
  // as additional real purchases in the ledger or double-count spending.
  return { profile, records: [], spendLog };
}
