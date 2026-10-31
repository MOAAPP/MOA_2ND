import { describe, expect, it } from 'vitest';
import { buildFeatures } from '../../src/core/features';
import type { LabeledDay } from '../../src/core/forecast';
import { kst } from '../../src/core/time';

describe('ML 특징량', () => {
  const L: LabeledDay[] = [
    { date: '2026-10-01', amount: 10000, status: 'self_reported' },
    { date: '2026-10-02', amount: 20000, status: 'reconciled' },
    { date: '2026-10-03', amount: 90000, status: 'self_reported' },
  ];
  const rows = buildFeatures('u', L, [{ id: 'i', type: 'income', occurredAt: kst('2026-10-01 10:00'), amount: 1, accountId: 'pay' }], [{ id: 's', name: '월급', amount: 1, accountId: 'pay', recurrence: 'monthly', day: 10, certainty: 'scheduled' }], '2026-10-02');
  it('날짜 d의 특징량은 d−1까지만 본다 (당일 정답이 새지 않음)', () => {
    expect(rows[2].mean7).toBe(15000);
    expect(rows[2].prev_day).toBe(20000);
    expect(rows[2].observed_days).toBe(2);
    expect(rows[0].mean7).toBeNull();
  });
  it('사용자 평균은 학습 구간에서만, 잔액은 입력에 없다', () => {
    expect(rows[0].user_mean).toBe(15000);
    expect(Object.keys(rows[0])).not.toContain('balance');
    expect(rows[2].days_to_next_income).toBe(7);
    expect(rows[2].days_since_last_income).toBe(2);
  });
});
