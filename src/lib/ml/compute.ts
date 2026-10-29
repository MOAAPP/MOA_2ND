import type { ISODate } from '../../../shared/dates';
import type { Simulation } from '../cashflow';
import { buySimAt, type CompareInput } from '../scenarios';
import { adviseTiming, RISK_PATHS, spendPaths, TIMING_PATHS, worldRisk, type TimingAdvice, type WorldRisk } from './montecarlo';
import type { SpendingForecast } from './types';

/** 워커와 메인 스레드가 같이 쓰는 순수 계산 (UI 없음) */

export interface RiskJob {
  type: 'risks';
  forecast: SpendingForecast;
  sims: (Simulation | null)[];
  from: ISODate;
  until: ISODate;
  minBalance: number;
  n?: number;
}

export interface TimingJob {
  type: 'timing';
  forecast: SpendingForecast;
  base: Omit<CompareInput, 'choices'>;
  candidates: ISODate[];
  from: ISODate;
  until: ISODate;
  n?: number;
}

export type Job = RiskJob | TimingJob;

export function runRisks(j: RiskJob): (WorldRisk | null)[] {
  const paths = spendPaths(j.forecast, j.n ?? RISK_PATHS);
  return j.sims.map((s) => (s ? worldRisk(s, j.from, j.until, paths, j.minBalance) : null));
}

export function runTiming(j: TimingJob): TimingAdvice {
  return adviseTiming(j.candidates, (d) => buySimAt(j.base, d, j.until), j.from, j.until, j.forecast, j.base.profile.minBalance, j.n ?? TIMING_PATHS);
}

export function runJob(j: Job): unknown {
  return j.type === 'risks' ? runRisks(j) : runTiming(j);
}
