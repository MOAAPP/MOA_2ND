import {
  addMonths,
  endOfMonth,
  maxDate,
  monthlyDate,
  parseISO,
  type ISODate,
} from '../../shared/dates';
import type { Choice, ChoiceParams, DecisionRecord, Profile, ScheduleItem } from './types';

export interface Flow {
  date: ISODate;
  /** 부호 있는 금액: 수입 +, 지출 − */
  amount: number;
  label: string;
  kind: 'income' | 'expense' | 'choice' | 'delta';
  /** 필수지출(사용자가 등록한 나갈 돈) */
  essential?: boolean;
  refId?: string;
}

export interface DayPoint {
  date: ISODate;
  open: number;
  /** 하루 중 최저점: 지출을 먼저 뺀 직후 */
  low: number;
  close: number;
  flows: Flow[];
}

export interface Simulation {
  start: ISODate;
  end: ISODate;
  opening: number;
  days: DayPoint[];
  min: { amount: number; date: ISODate };
}

/**
 * 날짜별 잔고 시뮬레이션.
 * - start 이전 날짜의 흐름은 시작 잔고에 합산한다.
 * - 같은 날에는 지출을 먼저 빼고 수입을 더한다(보수적).
 */
export function simulate(opening: number, start: ISODate, end: ISODate, flows: Flow[]): Simulation {
  let bal = opening;
  const byDate = new Map<ISODate, Flow[]>();
  for (const f of flows) {
    if (f.date < start) {
      bal += f.amount;
      continue;
    }
    if (f.date > end) continue;
    const list = byDate.get(f.date) ?? [];
    list.push(f);
    byDate.set(f.date, list);
  }
  const startOpening = bal;
  const days: DayPoint[] = [];
  let min = { amount: bal, date: start };
  let d = start;
  // 날짜 순회
  while (d <= end) {
    const fs = byDate.get(d) ?? [];
    const out = fs.filter((f) => f.amount < 0).reduce((s, f) => s + f.amount, 0);
    const inc = fs.filter((f) => f.amount > 0).reduce((s, f) => s + f.amount, 0);
    const open = bal;
    const low = bal + out;
    const close = low + inc;
    days.push({ date: d, open, low, close, flows: fs });
    if (low < min.amount) min = { amount: low, date: d };
    bal = close;
    d = nextDay(d);
  }
  return { start, end, opening: startOpening, days, min };
}

function nextDay(d: ISODate): ISODate {
  const { y, m, d: day } = parseISO(d);
  const dt = new Date(Date.UTC(y, m - 1, day + 1));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

export function balanceOn(sim: Simulation, date: ISODate): number | null {
  if (date < sim.start) return sim.opening;
  const p = sim.days.find((x) => x.date === date);
  return p ? p.close : null;
}

/** 등록한 일정을 기간 안의 실제 날짜로 펼친다. 기준일 이전·기준일에 이미 반영된 일정은 제외. */
export function expandSchedule(profile: Profile, end: ISODate): Flow[] {
  const flows: Flow[] = [];
  const start = profile.baseDate;
  for (const item of profile.items) {
    for (const date of occurrences(item, start, end)) {
      if (date === profile.baseDate && profile.reflectedOnBaseDate.includes(item.id)) continue;
      flows.push({
        date,
        amount: item.kind === 'income' ? item.amount : -item.amount,
        label: item.name,
        kind: item.kind,
        essential: item.kind === 'expense',
        refId: item.id,
      });
    }
  }
  return flows;
}

export function occurrences(item: ScheduleItem, start: ISODate, end: ISODate): ISODate[] {
  if (item.recurrence === 'once') {
    return item.date && item.date >= start && item.date <= end ? [item.date] : [];
  }
  const day = item.day ?? 1;
  const out: ISODate[] = [];
  let { y, m } = parseISO(start);
  for (let i = 0; i < 240; i++) {
    const date = monthlyDate(y, m, day);
    if (date > end) break;
    if (date >= start) out.push(date);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/** 오늘 이후 가장 가까운 일정 날짜 */
export function nextOccurrence(item: ScheduleItem, from: ISODate): ISODate | null {
  const list = occurrences(item, from, addMonths(from, 13));
  return list[0] ?? null;
}

/** 선택이 만드는 거래 */
export function choiceFlows(params: ChoiceParams, choice: Choice, label: string, refId?: string): Flow[] {
  const base = { label, kind: 'choice' as const, refId };
  switch (choice) {
    case 'skip':
      return [];
    case 'alt': {
      const amt = params.altAmount ?? 0;
      return amt > 0 ? [{ ...base, label: params.altName ? `${params.altName} (대안)` : `${label} 대안`, date: params.date, amount: -amt }] : [];
    }
    case 'delay':
      return params.delayDate ? [{ ...base, label: `${label} (미룬 날)`, date: params.delayDate, amount: -params.amount }] : [];
    case 'buy': {
      const n = params.installments && params.installments >= 2 ? Math.floor(params.installments) : 1;
      if (n === 1) return [{ ...base, date: params.date, amount: -params.amount }];
      return installmentSchedule(params.amount, n, params.date).map((p, i) => ({
        ...base,
        label: `${label} 할부 ${i + 1}/${n}`,
        date: p.date,
        amount: -p.amount,
      }));
    }
  }
}

/** 할부: 구매일부터 매월 같은 날(없으면 말일) n회. 원 단위 나머지는 1회차에 더한다. */
export function installmentSchedule(total: number, n: number, first: ISODate): { date: ISODate; amount: number }[] {
  const each = Math.floor(total / n);
  const rest = total - each * n;
  const day = parseISO(first).d;
  return Array.from({ length: n }, (_, i) => ({
    date: i === 0 ? first : addMonths(first, i, day),
    amount: i === 0 ? each + rest : each,
  }));
}

/** 기록의 기준일 이전·당일 거래가 기준 잔고에 이미 반영됐는지 */
export function isPrimaryReflected(rec: DecisionRecord, profile: Profile): boolean {
  const date = rec.params.date;
  if (date > profile.baseDate) return false;
  if (rec.reflectedOverride !== null) return rec.reflectedOverride;
  if (date < profile.baseDate) return true;
  return rec.createdAt <= profile.baseSetAt;
}

/** 현실 세계의 거래: 실제 선택한 기록의 거래 중 잔고에 아직 반영되지 않은 것 */
export function realityRecordFlows(records: DecisionRecord[], profile: Profile): Flow[] {
  const out: Flow[] = [];
  const seen = new Set<string>();
  for (const rec of records) {
    if (!rec.choice || seen.has(rec.id)) continue;
    seen.add(rec.id);
    const flows = choiceFlows(rec.params, rec.choice, recordLabel(rec), rec.id);
    const primaryReflected = isPrimaryReflected(rec, profile);
    for (const f of flows) {
      // 반영 여부는 '그 거래가 기준일 이전/당일인가'로 판단. 미래 회차·미룬 날은 항상 시뮬레이션.
      if (f.date <= profile.baseDate && primaryReflected) continue;
      out.push(f);
    }
  }
  return out;
}

/** 평행세계 델타: 기록 ID당 한 번만. 다른 선택의 거래 − 실제 선택의 거래 */
export function parallelDeltas(records: DecisionRecord[]): Flow[] {
  const seen = new Set<string>();
  const out: Flow[] = [];
  for (const rec of records) {
    if (!rec.inParallel || !rec.choice || rec.parallelAs === rec.choice) continue;
    if (seen.has(rec.id)) continue;
    seen.add(rec.id);
    const label = recordLabel(rec);
    const actual = choiceFlows(rec.params, rec.choice, label, rec.id);
    const alt = choiceFlows(rec.params, rec.parallelAs, label, rec.id);
    for (const f of alt) out.push({ ...f, kind: 'delta', label: `${f.label} (평행)` });
    for (const f of actual) out.push({ ...f, kind: 'delta', amount: -f.amount, label: `${f.label} 되돌림 (평행)` });
  }
  return out;
}

export function recordLabel(rec: DecisionRecord): string {
  return rec.name?.trim() || rec.category;
}

export interface Worlds {
  reality: Simulation;
  parallel: Simulation;
  hasParallel: boolean;
}

/** 홈 화면의 두 세계 */
export function buildWorlds(profile: Profile, records: DecisionRecord[], end: ISODate): Worlds {
  const end2 = maxDate(end, profile.baseDate);
  const common = [...expandSchedule(profile, end2), ...realityRecordFlows(records, profile)];
  const deltas = parallelDeltas(records);
  return {
    reality: simulate(profile.baseBalance, profile.baseDate, end2, common),
    parallel: simulate(profile.baseBalance, profile.baseDate, end2, [...common, ...deltas]),
    hasParallel: deltas.length > 0,
  };
}

/** 처음으로 하루 최저점이 기준값 아래로 내려가는 날 */
export function firstBelow(sim: Simulation, threshold: number, from?: ISODate): ISODate | null {
  for (const p of sim.days) {
    if (from && p.date < from) continue;
    if (p.low < threshold) return p.date;
  }
  return null;
}

export function lowestFrom(sim: Simulation, from: ISODate): { amount: number; date: ISODate } {
  let best: { amount: number; date: ISODate } | null = null;
  for (const p of sim.days) {
    if (p.date < from) continue;
    if (!best || p.low < best.amount) best = { amount: p.low, date: p.date };
  }
  return best ?? { amount: sim.opening, date: from };
}

export function monthEndOf(date: ISODate): ISODate {
  return endOfMonth(date);
}
