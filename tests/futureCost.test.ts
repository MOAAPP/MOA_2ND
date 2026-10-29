import { describe, expect, it } from 'vitest';
import { emptyContext } from '../src/lib/bank/engine';
import { bestYearPlan, futureCost, skipsInLast30, timesLeftInMonth } from '../src/lib/futureCost';

const wallet = { cash: 800_000, fixedBills: 530_000, safetyBuffer: 150_000 };

describe('timesLeftInMonth', () => {
  it('오늘 포함 말일까지 횟수', () => {
    expect(timesLeftInMonth('2026-10-29', 'once')).toBe(1);
    expect(timesLeftInMonth('2026-10-29', 'daily')).toBe(3); // 29·30·31
    expect(timesLeftInMonth('2026-10-29', 'weekly')).toBe(1);
    expect(timesLeftInMonth('2026-10-01', 'weekly')).toBe(5); // 31일 → ceil(31/7)
    expect(timesLeftInMonth('2026-02-01', 'daily')).toBe(28);
  });
});

describe('futureCost', () => {
  it('한 번 사는 12만 9천 원 운동화', () => {
    const f = futureCost({ price: 129_000, frequency: 'once', wallet, today: '2026-10-29' });
    expect(f.now.usable).toBe(120_000);
    expect(f.buy.usable).toBe(-9_000); // 지켜둘 생활비를 9천 원 깎아 씀
    expect(f.hold.usable).toBe(120_000);
    expect(f.nextBillDate).toBe('2026-11-01');
    expect(f.daysToBill).toBe(3);
    expect(f.buy.afterBills).toBe(141_000);
    expect(f.hold.afterBills).toBe(270_000);
    expect(f.savedOnce).toBe(129_000);
    expect(f.yearSpend).toBe(129_000);
    // 12개월 예금 중 세후가 가장 큰 상품을 고름 (원금 그대로 + 이자)
    expect(f.year.how).toBe('deposit');
    expect(f.year.principal).toBe(129_000);
    expect(f.year.net).toBeGreaterThan(129_000);
    expect(f.year.net).toBe(f.year.principal + f.year.interest - f.year.tax);
  });

  it('대안은 차액만 아낀 것으로 계산', () => {
    const f = futureCost({ price: 129_000, altPrice: 59_000, frequency: 'once', wallet, today: '2026-10-29' });
    expect(f.savedOnce).toBe(70_000);
    expect(f.hold.spendThisMonth).toBe(59_000);
    expect(f.hold.usable).toBe(61_000);
    expect(f.year.principal).toBe(70_000);
  });

  it('대안이 원래 가격보다 비싸면 원래 가격으로 자른다', () => {
    const f = futureCost({ price: 10_000, altPrice: 30_000, frequency: 'once', wallet, today: '2026-10-29' });
    expect(f.savedOnce).toBe(0);
    expect(f.year.how).toBe('none');
    expect(f.year.net).toBe(0);
  });

  it('매일 5,500원 라떼: 이번 달 남은 날 × 가격, 1년은 적금으로', () => {
    const f = futureCost({ price: 5_500, frequency: 'daily', wallet, today: '2026-10-20' });
    expect(f.timesThisMonth).toBe(12);
    expect(f.buy.spendThisMonth).toBe(66_000);
    expect(f.yearSpend).toBe(2_007_500);
    expect(f.year.how).toBe('installment');
    expect(f.year.monthly).toBe(167_291); // 2,007,500 / 12 절사
    expect(f.year.principal).toBe(2_007_500); // 적금 원금 + 자투리
    expect(f.year.net).toBeGreaterThan(2_007_500);
  });
});

describe('bestYearPlan', () => {
  it('최소 가입금액보다 작으면 다음 상품, 아무 데도 못 넣으면 이자 없음', () => {
    const tiny = bestYearPlan(500, 'once', '2026-10-29', emptyContext());
    expect(tiny.how).toBe('none');
    expect(tiny.net).toBe(500);
    // 50만 원은 10만 원 이상 월복리 상품도 가능 → 이자가 0보다 큼
    const big = bestYearPlan(500_000, 'once', '2026-10-29', emptyContext());
    expect(big.how).toBe('deposit');
    expect(big.interest).toBeGreaterThan(0);
  });

  it('참기 3번 기록이 있으면 참기 연동 우대금리가 붙을 수 있다', () => {
    const plain = bestYearPlan(50_000, 'once', '2026-10-29', emptyContext());
    const ctx = { ...emptyContext(), skipDates: ['2026-10-10', '2026-10-15', '2026-10-28'] };
    const pref = bestYearPlan(50_000, 'once', '2026-10-29', ctx);
    expect(pref.appliedRate).toBeGreaterThanOrEqual(plain.appliedRate);
    expect(pref.net).toBeGreaterThanOrEqual(plain.net);
  });
});

describe('skipsInLast30', () => {
  it('오늘 포함 30일 이내만 센다', () => {
    expect(skipsInLast30(['2026-09-28', '2026-09-29', '2026-10-29', '2026-10-30'], '2026-10-29')).toBe(2);
  });
});
