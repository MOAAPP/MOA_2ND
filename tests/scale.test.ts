import { describe, expect, it } from 'vitest';
import { addDays, endOfMonth, addMonths } from '../shared/dates';
import { buildWorlds } from '../src/lib/cashflow';
import { runRisks, runTiming } from '../src/lib/ml/compute';
import { ruleForecast } from '../src/lib/ml/forecast';
import { mulberry32 } from '../src/lib/ml/montecarlo';
import { spendHistory } from '../src/lib/ml/provider';
import { parseSpendCsv } from '../src/lib/ml/csv';
import type { SpendEntry } from '../src/lib/ml/types';
import type { DecisionRecord, Profile } from '../src/lib/types';

/** 기록 수천 건, 경로 수천 개에서도 빠르고 결과가 말이 되는지 */
const today = '2026-10-20';
const profile: Profile = {
  baseBalance: 1_500_000,
  baseDate: today,
  baseSetAt: 0,
  minBalance: 100000,
  dailySpend: 12000,
  items: [
    { id: 'i', kind: 'income', name: '알바비', amount: 900000, recurrence: 'monthly', day: 10 },
    { id: 'r', kind: 'expense', name: '월세', amount: 350000, recurrence: 'monthly', day: 25 },
  ],
  reflectedOnBaseDate: [],
};

function bigRecords(n: number): DecisionRecord[] {
  const rand = mulberry32(3);
  const choices = ['buy', 'skip', 'delay', 'alt', null] as const;
  return Array.from({ length: n }, (_, i) => {
    const c = choices[Math.floor(rand() * choices.length)];
    const date = addDays(today, -Math.floor(rand() * 120) + (c === null ? 10 : 0));
    return {
      id: `r${i}`,
      createdAt: i,
      source: rand() < 0.5 ? 'spent' : 'decide',
      category: '식비',
      params: { amount: 1000 + Math.floor(rand() * 30000), date, delayDate: addDays(date, 20), altAmount: 500 },
      choice: c,
      reflectedOverride: true,
      inParallel: rand() < 0.3,
      parallelAs: 'skip',
    } as DecisionRecord;
  });
}

describe('규모', () => {
  it('기록 5,000건 + 지출 5,000건 + 경로 3,000개 확률이 2초 안에', () => {
    const records = bigRecords(5000);
    const log: SpendEntry[] = Array.from({ length: 5000 }, (_, i) => ({ date: addDays(today, -(i % 90)), amount: 3000 + (i % 7) * 1000, category: '카페', from: 'csv' }));
    const t = performance.now();
    const horizon = addDays(today, 31);
    const w = buildWorlds(profile, records, horizon);
    const f = ruleForecast({ from: addDays(today, 1), to: horizon, today, dailySpend: profile.dailySpend, history: spendHistory(records, log, today) });
    const [r, p] = runRisks({ type: 'risks', forecast: f, sims: [w.reality, w.parallel], from: today, until: horizon, minBalance: profile.minBalance, n: 3000 });
    const ms = performance.now() - t;
    expect(ms).toBeLessThan(2000);
    expect(r!.paths).toBe(3000);
    expect(r!.band).toHaveLength(32);
    expect(p!.pShort).toBeGreaterThanOrEqual(0);
  });

  it('타이밍 추천: 날짜 60개 × 경로 1,500개가 3초 안에', () => {
    const until = endOfMonth(addMonths(today, 1));
    const f = ruleForecast({ from: addDays(today, 1), to: until, today, dailySpend: 12000, history: [] });
    const candidates = Array.from({ length: 41 }, (_, i) => addDays(today, i));
    const t = performance.now();
    const res = runTiming({ type: 'timing', forecast: f, base: { profile, records: bigRecords(2000), params: { amount: 400000, date: today }, label: '노트북', today }, candidates, from: today, until, n: 1500 });
    expect(performance.now() - t).toBeLessThan(3000);
    expect(res.points).toHaveLength(41);
    // 알바비(10일) 들어온 뒤에 사는 게 오늘 사는 것보다 안전해야 한다
    const after = res.points.find((p) => p.date === '2026-11-11')!;
    expect(after.pShort).toBeLessThanOrEqual(res.original.pShort);
  });

  it('CSV 2만 줄도 읽는다', () => {
    const rows = ['날짜,금액,내용'];
    for (let i = 0; i < 20000; i++) rows.push(`${addDays(today, -(i % 80))},${4000 + (i % 9) * 500},아메리카노`);
    const t = performance.now();
    const r = parseSpendCsv(rows.join('\n'), today);
    expect(performance.now() - t).toBeLessThan(1500);
    expect(r.entries).toHaveLength(20000);
    expect(r.entries[0].category).toBe('카페');
  });
});
