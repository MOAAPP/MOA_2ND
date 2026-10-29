import { useEffect, useMemo, useRef, useState } from 'react';
import { addDays, type ISODate } from '../../../shared/dates';
import type { Simulation } from '../cashflow';
import type { CompareInput } from '../scenarios';
import type { DecisionRecord, Profile } from '../types';
import { compute } from './engine';
import { isEmptyForecast } from './forecast';
import { RISK_PATHS, TIMING_PATHS, type TimingAdvice, type WorldRisk } from './montecarlo';
import { spendHistory, useSpendingForecast } from './provider';
import type { SpendEntry, SpendingForecast } from './types';

/** 화면에서 쓰는 생활비 예측: 오늘 다음 날부터 until까지 */
export function useAppForecast(profile: Profile, records: DecisionRecord[], log: SpendEntry[], today: ISODate, from: ISODate, until: ISODate): SpendingForecast {
  const history = useMemo(() => spendHistory(records, log, today), [records, log, today]);
  return useSpendingForecast({ from: addDays(from, 1), to: until, today, dailySpend: profile.dailySpend, history });
}

function simKey(s: Simulation | null | undefined) {
  if (!s) return '-';
  let h = 0;
  for (const d of s.days) h = (h * 31 + d.low + d.close * 7) % 1e9;
  return `${s.start}${s.end}${s.days.length}:${h}`;
}

/**
 * 비싼 계산을 워커에 맡기고, 새 결과가 올 때까지는 직전 결과를 보여준다 (깜빡임 없음).
 */
function useAsync<T>(key: string | null, run: () => Promise<T>): { data: T | null; pending: boolean } {
  const [state, setState] = useState<{ key: string; data: T } | null>(null);
  const latest = useRef<string | null>(null);
  useEffect(() => {
    latest.current = key;
    if (!key) return;
    let alive = true;
    run().then((data) => {
      if (alive && latest.current === key) setState({ key, data });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  if (!key) return { data: null, pending: false };
  return { data: state?.data ?? null, pending: state?.key !== key };
}

/**
 * 여러 세계의 확률 (같은 생활비 경로 3,000개를 공통으로 사용).
 * 생활비 정보가 없으면 data=null — 화면은 일정 기준 값만 보여준다.
 */
export function useWorldRisks(forecast: SpendingForecast, sims: (Simulation | undefined)[], from: ISODate, until: ISODate, minBalance: number, n = RISK_PATHS) {
  const empty = isEmptyForecast(forecast);
  const key = empty ? null : JSON.stringify([forecast.days.length, forecast.days[0], forecast.days[forecast.days.length - 1], forecast.personalWeight, sims.map(simKey), from, until, minBalance, n]);
  return useAsync<(WorldRisk | null)[]>(key, () => compute({ type: 'risks', forecast, sims: sims.map((s) => s ?? null), from, until, minBalance, n }));
}

/** 구매 타이밍 추천 (날짜 수십 개 × 경로 1,500개) */
export function useTiming(forecast: SpendingForecast, base: Omit<CompareInput, 'choices'> | null, candidates: ISODate[], from: ISODate, until: ISODate, n = TIMING_PATHS) {
  const empty = isEmptyForecast(forecast);
  const key =
    empty || !base || candidates.length < 2
      ? null
      : JSON.stringify([forecast.days.length, forecast.days[0], forecast.personalWeight, base.params, base.label, base.records.length, base.profile.baseBalance, base.profile.baseDate, base.profile.items.length, base.profile.minBalance, candidates[0], candidates.length, until, n]);
  return useAsync<TimingAdvice>(key, () => compute({ type: 'timing', forecast, base: base!, candidates, from, until, n }));
}

export function pctText(p: number): string {
  if (p < 0.01) return '1% 미만';
  if (p > 0.99) return '99% 이상';
  return `${Math.round(p * 100)}%`;
}

export function riskTone(p: number): 'ok' | 'warn' | 'danger' {
  return p <= 0.2 ? 'ok' : p <= 0.5 ? 'warn' : 'danger';
}

/** 확률을 사람 말로 */
export function riskWords(p: number): string {
  if (p < 0.05) return '거의 없어요';
  if (p <= 0.2) return '낮아요';
  if (p <= 0.5) return '조금 있어요';
  if (p <= 0.8) return '높아요';
  return '매우 높아요';
}
