import { describe, expect, it } from 'vitest';
import { addDays } from '../shared/dates';
import { ruleForecast } from '../src/lib/ml/forecast';
import { analyzePersonalSpending } from '../src/lib/ml/personalModel';
import type { SpendEntry } from '../src/lib/ml/types';

const today = '2026-10-20';
const record = (daysAgo: number, amount = 10_000): SpendEntry => ({
  date: addDays(today, -daysAgo), amount, category: '식비', from: 'record',
});

describe('사용자에게 하루 기록 완료 확인을 강요하지 않는 예측', () => {
  it('기록되지 않은 날을 0원 지출로 간주하지 않는다', () => {
    const history = [record(30), record(15), record(0)];
    const result = ruleForecast({ from: addDays(today, 1), to: addDays(today, 1), today, history });
    expect(result.historyDays).toBe(3); // 31 calendar days, only 3 observed
    expect(result.basis).toBe('history');
    expect(result.days[0].p50).toBeGreaterThan(8_000);
  });

  it('누락 날짜가 많은 개인화 모델은 억지로 학습하지 않고 기본 예측으로 돌아간다', () => {
    const history = Array.from({ length: 16 }, (_, i) => record(i * 4 + 1, 8_000 + i * 50));
    const result = analyzePersonalSpending({
      from: addDays(today, 1), to: addDays(today, 7), today, history,
    });
    expect(result.status).toBe('insufficient');
    expect(result.forecast).toBeNull();
    expect(result.advice).toContain('0원으로 가정하지');
  });
});
