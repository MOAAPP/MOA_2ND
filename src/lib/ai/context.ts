/** 앱 상태 → AI 입력. 숫자는 전부 여기서 계산하고 AI에는 결과만 넘긴다. */
import type { AskIn, BriefIn, CoachIn, LedgerSummaryIn } from '../../../shared/aiPrompts';
import { addDays, addMonths, daysInMonth, endOfMonth, parseISO, startOfMonth, weekdayOf, type ISODate } from '../../../shared/dates';
import type { SpendEntry } from '../ml/types';
import { koreaDay } from '../worldHistory';
import { WORLD_FIXED_BILLS, walletSummary, type WorldWallet } from '../worldWallet';

const WD = ['일요일', '월요일', '화요일', '수요일', '목요일', '금요일', '토요일'];
const sum = (xs: SpendEntry[]) => xs.reduce((s, e) => s + e.amount, 0);

export function byCategory(items: SpendEntry[]) {
  const m = new Map<string, number>();
  for (const e of items) m.set(e.category, (m.get(e.category) ?? 0) + e.amount);
  return [...m].map(([name, amount]) => ({ name, amount })).sort((a, b) => b.amount - a.amount);
}

export function monthSlice(all: SpendEntry[], month: ISODate, today: ISODate) {
  const end = endOfMonth(month);
  const items = all.filter((e) => e.date >= month && e.date <= end && e.date <= today);
  const { y, m } = parseISO(month);
  const elapsed = end < today ? daysInMonth(y, m) : Math.max(1, parseISO(today).d);
  const prevStart = addMonths(month, -1);
  const pm = parseISO(prevStart);
  const prevEnd = addDays(prevStart, Math.min(elapsed, daysInMonth(pm.y, pm.m)) - 1);
  const hasPrev = all.some((e) => e.date >= prevStart && e.date < month);
  const prevTotal = hasPrev ? sum(all.filter((e) => e.date >= prevStart && e.date <= prevEnd)) : null;
  return { items, elapsed, prevTotal, total: sum(items) };
}

export function ledgerSummaryInput(all: SpendEntry[], month: ISODate, today: ISODate): LedgerSummaryIn {
  const { items, elapsed, prevTotal, total } = monthSlice(all, month, today);
  const wd = [0, 1, 2, 3, 4, 5, 6].map((w) => {
    const list = items.filter((e) => weekdayOf(e.date) === w);
    const days = new Set(list.map((e) => e.date)).size;
    return { day: WD[w], average: days ? Math.round(sum(list) / days) : 0, days };
  }).filter((x) => x.days >= 2).sort((a, b) => b.average - a.average);
  const big = [...items].sort((a, b) => b.amount - a.amount)[0];
  return {
    month: month.slice(0, 7), total, prevTotal, count: items.length, elapsedDays: elapsed,
    byCategory: byCategory(items).slice(0, 5),
    busiestWeekday: wd[0] ? { day: wd[0].day, average: wd[0].average } : null,
    biggest: big ? { name: big.name || big.category, amount: big.amount } : null,
  };
}

function decisionsThisMonth(w: WorldWallet, today: ISODate) {
  const m = today.slice(0, 7);
  return (w.decisions || []).filter((d) => koreaDay(d.at).slice(0, 7) === m);
}

export function briefInput(w: WorldWallet, all: SpendEntry[], today: ISODate): BriefIn {
  const s = walletSummary(w);
  const month = startOfMonth(today);
  const { total, prevTotal } = monthSlice(all, month, today);
  const ds = decisionsThisMonth(w, today);
  const top = byCategory(all.filter((e) => e.date >= month && e.date <= today))[0] ?? null;
  return {
    usable: s.monthlyUsable,
    daysLeftInMonth: Math.max(1, parseISO(endOfMonth(today)).d - parseISO(today).d + 1),
    monthSpent: total,
    lastMonthSameDay: prevTotal,
    topCategory: top,
    savedThisMonth: ds.reduce((x, d) => x + d.price - d.paid, 0),
    holdsThisMonth: ds.filter((d) => d.choice !== 'buy').length,
    nextBill: { date: addMonths(month, 1), amount: WORLD_FIXED_BILLS },
  };
}

export function coachInput(p: { item: string; category: string; price: number; frequency: CoachIn['frequency']; usableNow: number; usableAfter: number; afterBills: number; yearGap: number }, all: SpendEntry[], today: ISODate): CoachIn {
  const month = startOfMonth(today);
  const from30 = addDays(today, -29);
  const same = all.filter((e) => e.category === p.category);
  return {
    ...p,
    categorySpentThisMonth: sum(same.filter((e) => e.date >= month && e.date <= today)),
    categoryCount30: same.filter((e) => e.date >= from30 && e.date <= today).length,
  };
}

export function askContext(w: WorldWallet, all: SpendEntry[], today: ISODate, goal: AskIn['context']['goal']): AskIn['context'] {
  const s = walletSummary(w);
  const month = startOfMonth(today);
  const items = all.filter((e) => e.date >= month && e.date <= today);
  const ds = w.decisions || [];
  return {
    usable: s.monthlyUsable,
    monthSpent: sum(items),
    topCategories: byCategory(items).slice(0, 3),
    savedTotal: ds.reduce((x, d) => x + d.price - d.paid, 0),
    holdRate: ds.length ? ds.filter((d) => d.choice !== 'buy').length / ds.length : null,
    goal,
  };
}
