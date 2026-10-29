import { describe, expect, it } from 'vitest';
import { addDays } from '../shared/dates';
import { simulate } from '../src/lib/cashflow';
import { ruleClassify } from '../src/lib/ml/classify';
import { parseSpendCsv } from '../src/lib/ml/csv';
import { ruleForecast } from '../src/lib/ml/forecast';
import { adviseTiming, sampleDay, spendPaths, worldRisk } from '../src/lib/ml/montecarlo';
import type { SpendEntry } from '../src/lib/ml/types';

const today = '2026-10-20';

describe('생활비 예측 (규칙 기반)', () => {
  it('기록도 입력값도 없으면 0원 예측', () => {
    const f = ruleForecast({ from: '2026-10-21', to: '2026-10-31', today, history: [] });
    expect(f.basis).toBe('none');
    expect(f.days.every((d) => d.p90 === 0)).toBe(true);
  });

  it('기록이 3건 미만이면 입력한 하루 평균만 사용', () => {
    const history: SpendEntry[] = [{ date: '2026-10-19', amount: 50000, category: '식비', from: 'record' }];
    const f = ruleForecast({ from: '2026-10-21', to: '2026-10-31', today, dailySpend: 10000, history });
    expect(f.basis).toBe('profile');
    expect(f.personalWeight).toBe(0);
    const weekday = f.days.find((d) => d.date === '2026-10-21')!; // 수요일
    expect(weekday.p50).toBe(Math.round(8000 * (7 / 7.5)));
    expect(weekday.p10).toBeLessThan(weekday.p50);
    expect(weekday.p90).toBeGreaterThan(weekday.p50);
  });

  it('기록이 쌓일수록 내 기록 비중이 커진다', () => {
    const mk = (days: number): SpendEntry[] => Array.from({ length: days }, (_, i) => ({ date: addDays(today, -i), amount: 20000, category: '식비', from: 'record' as const }));
    const short = ruleForecast({ from: '2026-10-21', to: '2026-10-21', today, dailySpend: 10000, history: mk(6) });
    const long = ruleForecast({ from: '2026-10-21', to: '2026-10-21', today, dailySpend: 10000, history: mk(40) });
    expect(short.basis).toBe('blend');
    expect(long.basis).toBe('history');
    expect(long.personalWeight).toBe(1);
    expect(long.days[0].p50).toBeGreaterThan(short.days[0].p50);
  });

  it('주말은 평일보다 많이 쓴다고 본다', () => {
    const f = ruleForecast({ from: '2026-10-23', to: '2026-10-24', today, dailySpend: 10000, history: [] });
    expect(f.days[1].p50).toBeGreaterThan(f.days[0].p50); // 금 → 토
  });
});

describe('확률 시뮬레이션', () => {
  const q = { date: today, p10: 1000, p50: 5000, p90: 15000 };
  it('분위수 분포 샘플링은 분위수를 지난다', () => {
    expect(sampleDay(q, 0.1)).toBeCloseTo(1000);
    expect(sampleDay(q, 0.5)).toBeCloseTo(5000);
    expect(sampleDay(q, 0.9)).toBeCloseTo(15000);
    expect(sampleDay(q, 0)).toBe(0);
  });

  it('같은 시드면 같은 경로', () => {
    const f = ruleForecast({ from: '2026-10-21', to: '2026-10-31', today, dailySpend: 10000, history: [] });
    expect(spendPaths(f, 5, 1).cum[3 * f.days.length + 5]).toBe(spendPaths(f, 5, 1).cum[3 * f.days.length + 5]);
  });

  it('잔고가 넉넉하면 부족 확률 0, 빠듯하면 높다', () => {
    const f = ruleForecast({ from: '2026-10-21', to: '2026-10-31', today, dailySpend: 10000, history: [] });
    const paths = spendPaths(f, 500);
    const rich = worldRisk(simulate(1_000_000, today, '2026-10-31', []), today, '2026-10-31', paths, 0);
    const poor = worldRisk(simulate(80_000, today, '2026-10-31', []), today, '2026-10-31', paths, 0);
    expect(rich.pShort).toBe(0);
    expect(poor.pShort).toBeGreaterThan(0.3);
    const end = poor.band[poor.band.length - 1];
    expect(end.p10).toBeLessThanOrEqual(end.p50);
    expect(end.p50).toBeLessThanOrEqual(end.p90);
  });

  it('월급 뒤로 미루면 부족 확률이 줄어 추천 날짜가 나온다', () => {
    const f = ruleForecast({ from: '2026-10-21', to: '2026-11-30', today, dailySpend: 8000, history: [] });
    const income = { date: '2026-11-10', amount: 700000, label: '알바비', kind: 'income' as const };
    const build = (d: string) => simulate(250_000, today, '2026-11-30', [income, { date: d, amount: -200000, label: '구매', kind: 'choice' as const }]);
    const cands = Array.from({ length: 30 }, (_, i) => addDays('2026-10-21', i));
    const t = adviseTiming(cands, build, today, '2026-11-30', f, 0, 300);
    expect(t.original.pShort).toBeGreaterThan(0.2);
    expect(t.best).not.toBeNull();
    expect(t.best!.date >= '2026-11-10').toBe(true);
  });
});

describe('상품명 자동 분류', () => {
  it('키워드로 분류', () => {
    expect(ruleClassify('겨울 운동화')?.category).toBe('패션');
    expect(ruleClassify('스타벅스 아메리카노')?.category).toBe('카페');
    expect(ruleClassify('넷플릭스 프리미엄')?.category).toBe('구독');
  });
  it('모르는 이름은 확신이 낮다', () => {
    const r = ruleClassify('ㅁㄴㅇㄹ');
    expect(r!.confidence).toBeLessThan(0.6);
  });
  it('직접 고친 분류를 1순위로 기억한다', () => {
    const r = ruleClassify('겨울 운동화', { 겨울운동화: '쇼핑' });
    expect(r?.category).toBe('쇼핑');
    expect(r?.engine).toBe('memory');
  });
});

describe('지출 CSV', () => {
  it('날짜·금액을 읽고 고정지출은 뺀다', () => {
    const csv = '날짜,금액,카테고리,내용\n2026-10-18,9000,식비,점심\n2026.10.19,"4,500",,아메리카노\n2026-10-15,350000,월세,월세\n2026-10-30,1000,식비,미래';
    const r = parseSpendCsv(csv, today);
    expect(r.entries).toHaveLength(2);
    expect(r.entries[1]).toMatchObject({ date: '2026-10-19', amount: 4500, category: '카페' });
    expect(r.skippedFixed).toBe(1);
  });
  it('필수 컬럼이 없으면 오류', () => {
    expect(parseSpendCsv('a,b\n1,2', today).errors[0]).toContain('필수 컬럼');
  });
});
