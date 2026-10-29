import { diffDays, endOfMonth, maxDate, type ISODate } from '../../shared/dates';
import {
  balanceOn,
  choiceFlows,
  expandSchedule,
  firstBelow,
  lowestFrom,
  realityRecordFlows,
  simulate,
  type Flow,
  type Simulation,
} from './cashflow';
import type { Choice, ChoiceParams, DecisionRecord, Profile, ScenarioSnapshot } from './types';

export interface EssentialCheck {
  date: ISODate;
  name: string;
  amount: number;
  /** 그 날 지출을 뺀 직후 잔고 */
  balanceAfter: number;
}

export interface ScenarioResult {
  choice: Choice;
  sim: Simulation;
  afterChoice: number;
  monthEnd: { date: ISODate; balance: number };
  /** 미룬 날이 다음 달 이후라면 그 달 말 잔고 */
  laterMonthEnd?: { date: ISODate; balance: number };
  low: { amount: number; date: ISODate };
  essentials: EssentialCheck[];
  /** 필수지출이 있는 날 잔고가 0 아래로 내려가는 첫 날 */
  shortfall: EssentialCheck | null;
  /** 최소 잔고 아래로 내려가는 첫 날 */
  belowMinDate: ISODate | null;
  choiceFlows: Flow[];
}

export interface Comparison {
  from: ISODate;
  horizon: ISODate;
  results: Partial<Record<Choice, ScenarioResult>>;
  uncertain: string[];
  /** 할부가 비교 기간 밖으로 이어지는 경우 */
  outsideHorizon: Flow[];
}

export interface CompareInput {
  profile: Profile;
  records: DecisionRecord[];
  params: ChoiceParams;
  label: string;
  choices: Choice[];
  today: ISODate;
  /** 이 기록 자체는 공통 일정에서 제외(기록 다시 계산 시) */
  excludeRecordId?: string;
}

export function compareChoices(input: CompareInput): Comparison {
  const { profile, params, choices, today } = input;
  const records = input.records.filter((r) => r.id !== input.excludeRecordId);
  const from = maxDate(today, profile.baseDate);
  const monthEnd = endOfMonth(maxDate(params.date, from));
  let horizon = monthEnd;
  if (choices.includes('delay') && params.delayDate) horizon = maxDate(horizon, endOfMonth(params.delayDate));

  const common = [...expandSchedule(profile, horizon), ...realityRecordFlows(records, profile)];
  const results: Partial<Record<Choice, ScenarioResult>> = {};
  const outside: Flow[] = [];

  for (const choice of choices) {
    const cf = choiceFlows(params, choice, input.label);
    for (const f of cf) if (f.date > horizon && choice === 'buy') outside.push(f);
    const sim = simulate(profile.baseBalance, profile.baseDate, horizon, [...common, ...cf]);
    const after = balanceOn(sim, maxDate(params.date, from)) ?? sim.opening;
    const essentials: EssentialCheck[] = [];
    for (const p of sim.days) {
      if (p.date < from) continue;
      for (const f of p.flows) {
        if (f.essential) essentials.push({ date: p.date, name: f.label, amount: -f.amount, balanceAfter: p.low });
      }
    }
    const shortfall = essentials.find((e) => e.balanceAfter < 0) ?? null;
    const res: ScenarioResult = {
      choice,
      sim,
      afterChoice: after,
      monthEnd: { date: monthEnd, balance: balanceOn(sim, monthEnd) ?? sim.opening },
      low: lowestFrom(sim, from),
      essentials,
      shortfall,
      belowMinDate: firstBelow(sim, profile.minBalance, from),
      choiceFlows: cf,
    };
    if (horizon > monthEnd) res.laterMonthEnd = { date: horizon, balance: balanceOn(sim, horizon) ?? sim.opening };
    results[choice] = res;
  }

  const uncertain: string[] = [];
  const hasMonthlyIncome = profile.items.some((i) => i.kind === 'income' && i.recurrence === 'monthly');
  if (horizon > endOfMonth(from)) {
    if (!hasMonthlyIncome) uncertain.push('다음 달에 들어올 돈이 등록돼 있지 않아요. 수입이 있다면 설정에서 추가하면 더 정확해져요.');
    uncertain.push('다음 달은 매월 반복 일정과 이미 입력한 일정만 반영했어요.');
  }
  return { from, horizon, results, uncertain, outsideHorizon: outside };
}

/** '며칠 더 여유' — 두 세계 모두 기간 안에서 기준 아래로 내려가는 날이 있을 때만 */
export function extraDays(a: ScenarioResult, b: ScenarioResult, threshold: 'min' | 'zero', minBalance: number, from: ISODate): number | null {
  const t = threshold === 'min' ? minBalance : 0;
  const da = firstBelow(a.sim, t, from);
  const db = firstBelow(b.sim, t, from);
  if (!da || !db) return null;
  const d = diffDays(da, db);
  return d === 0 ? null : d;
}

export function toSnapshot(c: Comparison): ScenarioSnapshot {
  const byChoice: ScenarioSnapshot['byChoice'] = {};
  for (const [k, r] of Object.entries(c.results)) {
    if (!r) continue;
    byChoice[k as Choice] = {
      monthEnd: r.monthEnd.balance,
      low: r.low.amount,
      lowDate: r.low.date,
      afterChoice: r.afterChoice,
      shortfall: !!r.shortfall,
      belowMin: !!r.belowMinDate,
    };
  }
  return { computedAt: Date.now(), byChoice };
}

/**
 * '그 날짜에 산다'의 시뮬레이션 (구매 타이밍 추천용).
 * 비교 기간을 until로 고정해야 날짜끼리 공정하게 비교된다.
 */
export function buySimAt(input: Omit<CompareInput, 'choices'>, date: ISODate, until: ISODate): Simulation {
  const { profile } = input;
  const records = input.records.filter((r) => r.id !== input.excludeRecordId);
  const common = [...expandSchedule(profile, until), ...realityRecordFlows(records, profile)];
  const p: ChoiceParams = { amount: input.params.amount, date, installments: input.params.installments };
  return simulate(profile.baseBalance, profile.baseDate, until, [...common, ...choiceFlows(p, 'buy', input.label)]);
}
