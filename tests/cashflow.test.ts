import { describe, expect, it } from 'vitest';
import {
  buildWorlds,
  installmentSchedule,
  occurrences,
  realityRecordFlows,
  simulate,
} from '../src/lib/cashflow';
import { compareChoices, extraDays } from '../src/lib/scenarios';
import { projectGoal } from '../src/lib/goals';
import type { DecisionRecord, Profile } from '../src/lib/types';

const BASE_AT = Date.UTC(2026, 9, 17, 0, 0); // 10/17 09:00 KST

function profile(over: Partial<Profile> = {}): Profile {
  return {
    baseBalance: 380000,
    baseDate: '2026-10-17',
    baseSetAt: BASE_AT,
    minBalance: 50000,
    reflectedOnBaseDate: [],
    items: [
      { id: 'in1', kind: 'income', name: '용돈', amount: 120000, recurrence: 'once', date: '2026-10-25' },
      { id: 'ex1', kind: 'expense', name: '월세', amount: 300000, recurrence: 'once', date: '2026-10-20' },
      { id: 'ex2', kind: 'expense', name: '카드값', amount: 170000, recurrence: 'once', date: '2026-10-27' },
    ],
    ...over,
  };
}

function rec(over: Partial<DecisionRecord> = {}): DecisionRecord {
  return {
    id: 'r1',
    createdAt: BASE_AT + 3600000,
    source: 'spent',
    category: '쇼핑',
    params: { amount: 120000, date: '2026-10-17' },
    choice: 'buy',
    reflectedOverride: null,
    inParallel: false,
    parallelAs: 'skip',
    ...over,
  };
}

describe('기본 예시 (기획서)', () => {
  const p = profile();
  const c = compareChoices({
    profile: p,
    records: [],
    params: { amount: 120000, date: '2026-10-17' },
    label: '운동화',
    choices: ['buy', 'skip'],
    today: '2026-10-17',
  });

  it('구매 없음 → 월말 30,000원, 구매 있음 → 월말 −90,000원', () => {
    expect(c.results.skip!.monthEnd.balance).toBe(30000);
    expect(c.results.buy!.monthEnd.balance).toBe(-90000);
  });

  it('월말 합계뿐 아니라 중간 날짜(월세일) 부족을 잡는다', () => {
    // 구매 시 10/20 월세 후 380-120-300 = -40,000
    expect(c.results.buy!.shortfall).toMatchObject({ date: '2026-10-20', name: '월세', balanceAfter: -40000 });
    expect(c.results.skip!.shortfall).toBeNull();
    expect(c.results.buy!.low).toEqual({ amount: -90000, date: '2026-10-27' });
  });

  it('선택 직후 잔고와 최소 잔고 이탈일', () => {
    expect(c.results.buy!.afterChoice).toBe(260000);
    expect(c.results.skip!.afterChoice).toBe(380000);
    expect(c.results.buy!.belowMinDate).toBe('2026-10-20');
    expect(c.results.skip!.belowMinDate).toBe('2026-10-27'); // 10/27 카드값 후 30,000 < 50,000
  });

  it('며칠 더 여유는 실제 날짜 차이로만 계산', () => {
    expect(extraDays(c.results.buy!, c.results.skip!, 'min', 50000, '2026-10-17')).toBe(7);
    // 0원 기준: 안 산 나는 기간 내에 0 아래로 내려가지 않으므로 계산하지 않음
    expect(extraDays(c.results.buy!, c.results.skip!, 'zero', 50000, '2026-10-17')).toBeNull();
  });
});

describe('같은 날 입출금 순서', () => {
  it('지출을 먼저 빼고 수입을 더한다', () => {
    const sim = simulate(10000, '2026-10-01', '2026-10-01', [
      { date: '2026-10-01', amount: 50000, label: '알바비', kind: 'income' },
      { date: '2026-10-01', amount: -30000, label: '통신비', kind: 'expense' },
    ]);
    expect(sim.days[0].low).toBe(-20000);
    expect(sim.days[0].close).toBe(30000);
    expect(sim.min).toEqual({ amount: -20000, date: '2026-10-01' });
  });
  it('시작일 이전 흐름은 시작 잔고에 합산', () => {
    const sim = simulate(10000, '2026-10-05', '2026-10-06', [{ date: '2026-10-01', amount: 5000, label: 'x', kind: 'delta' }]);
    expect(sim.opening).toBe(15000);
  });
});

describe('말일 처리', () => {
  it('31일 반복은 짧은 달의 마지막 날로', () => {
    const d = occurrences({ id: 'a', kind: 'expense', name: '관리비', amount: 1, recurrence: 'monthly', day: 31 }, '2027-01-15', '2027-04-30');
    expect(d).toEqual(['2027-01-31', '2027-02-28', '2027-03-31', '2027-04-30']);
  });
  it('윤년 2월', () => {
    const d = occurrences({ id: 'a', kind: 'expense', name: 'x', amount: 1, recurrence: 'monthly', day: 30 }, '2028-02-01', '2028-02-29');
    expect(d).toEqual(['2028-02-29']);
  });
});

describe('미루기·대안·할부', () => {
  const p = profile();
  const c = compareChoices({
    profile: p,
    records: [],
    params: { amount: 120000, date: '2026-10-17', delayDate: '2026-11-05', altAmount: 50000, installments: 3 },
    label: '운동화',
    choices: ['buy', 'skip', 'delay', 'alt'],
    today: '2026-10-17',
  });

  it('미룬 나는 이번 달엔 안 산 나와 같지만 비용이 사라지지 않는다', () => {
    expect(c.results.delay!.monthEnd.balance).toBe(c.results.skip!.monthEnd.balance);
    expect(c.results.delay!.laterMonthEnd!.balance).toBe(c.results.skip!.laterMonthEnd!.balance - 120000);
    expect(c.uncertain.length).toBeGreaterThan(0); // 다음 달 수입 미등록 안내
  });

  it('대안은 대안 금액만 빠진다', () => {
    expect(c.results.alt!.monthEnd.balance).toBe(30000 - 50000);
  });

  it('할부는 회차별 날짜·금액으로 미래 지출에 들어간다', () => {
    expect(installmentSchedule(100000, 3, '2026-01-31')).toEqual([
      { date: '2026-01-31', amount: 33334 },
      { date: '2026-02-28', amount: 33333 },
      { date: '2026-03-31', amount: 33333 },
    ]);
    // 10월에는 1회차(40,000)만
    expect(c.results.buy!.monthEnd.balance).toBe(30000 - 40000);
    // 11/17 2회차는 비교 기간(11월 말) 안, 12/17 3회차는 기간 밖으로 표시
    expect(c.outsideHorizon.map((f) => f.date)).toEqual(['2026-12-17']);
  });
});

describe('이미 쓴 돈: 중복 차감 방지', () => {
  const p = profile();
  it('기준일 이전 소비는 이미 잔고에 반영된 것으로 보고 다시 빼지 않는다', () => {
    expect(realityRecordFlows([rec({ params: { amount: 20000, date: '2026-10-15' } })], p)).toEqual([]);
  });
  it('기준 잔고 입력 이후 기록한 오늘 소비는 뺀다', () => {
    expect(realityRecordFlows([rec({ params: { amount: 20000, date: '2026-10-17' } })], p)).toHaveLength(1);
  });
  it('기준 잔고 입력 전에 기록한 오늘 소비는 이미 반영', () => {
    expect(realityRecordFlows([rec({ createdAt: BASE_AT - 1000, params: { amount: 20000, date: '2026-10-17' } })], p)).toHaveLength(0);
  });
  it('사용자가 "아직 반영 안 됨"으로 바꾸면 뺀다', () => {
    const f = realityRecordFlows([rec({ reflectedOverride: false, params: { amount: 20000, date: '2026-10-15' } })], p);
    expect(f).toHaveLength(1);
  });
  it('할부의 미래 회차는 기준일 이전 구매여도 계속 시뮬레이션', () => {
    const f = realityRecordFlows([rec({ params: { amount: 90000, date: '2026-10-10', installments: 3 } })], p);
    expect(f.map((x) => x.date)).toEqual(['2026-11-10', '2026-12-10']);
  });
});

describe('평행세계', () => {
  const p = profile();
  it('고른 소비만, 한 번만 되돌린다', () => {
    const r = rec({ params: { amount: 20000, date: '2026-10-18' }, inParallel: true });
    const other = rec({ id: 'r2', params: { amount: 10000, date: '2026-10-18' }, inParallel: false });
    const w = buildWorlds(p, [r, r, other], '2026-10-31');
    const end = (s: typeof w.reality) => s.days[s.days.length - 1].close;
    expect(end(w.reality)).toBe(30000 - 30000);
    expect(end(w.parallel)).toBe(30000 - 10000);
    expect(w.hasParallel).toBe(true);
  });

  it('이미 잔고에 반영된 과거 소비도 평행세계에선 차이만 더한다', () => {
    const r = rec({ params: { amount: 20000, date: '2026-10-10' }, inParallel: true });
    const w = buildWorlds(p, [r], '2026-10-31');
    expect(w.reality.opening).toBe(380000);
    expect(w.parallel.opening).toBe(400000);
  });

  it('안 샀다를 기록하면 평행세계는 "샀다면"이 되어 더 적을 수 있다', () => {
    const r = rec({ choice: 'skip', parallelAs: 'buy', params: { amount: 20000, date: '2026-10-18' }, inParallel: true });
    const w = buildWorlds(p, [r], '2026-10-31');
    const end = (s: typeof w.reality) => s.days[s.days.length - 1].close;
    expect(end(w.parallel) - end(w.reality)).toBe(-20000);
  });

  it('미룬 기록의 평행(지금 샀다면): 이번 달 −, 미룬 날 +', () => {
    const r = rec({ choice: 'delay', parallelAs: 'buy', params: { amount: 20000, date: '2026-10-18', delayDate: '2026-11-03' }, inParallel: true });
    const w = buildWorlds(p, [r], '2026-11-30');
    const on = (s: typeof w.reality, d: string) => s.days.find((x) => x.date === d)!.close;
    expect(on(w.parallel, '2026-10-31') - on(w.reality, '2026-10-31')).toBe(-20000);
    expect(on(w.parallel, '2026-11-30') - on(w.reality, '2026-11-30')).toBe(0);
  });

  it('기준일 당일 이미 반영된 일정은 다시 빼지 않는다', () => {
    const p2 = profile({ items: [{ id: 'ex', kind: 'expense', name: '통신비', amount: 50000, recurrence: 'monthly', day: 17 }], reflectedOnBaseDate: ['ex'] });
    const w = buildWorlds(p2, [], '2026-10-31');
    expect(w.reality.days[0].close).toBe(380000);
  });
});

describe('목표', () => {
  it('월 저축으로 도달 개월 계산', () => {
    const g = projectGoal({ target: 1000000, saved: 200000, monthlySaving: 100000, annualRate: 0, today: '2026-10-17' });
    expect(g.months).toBe(8);
    expect(g.arrival).toBe('2027-06-17');
  });
  it('매주 반복 절약 가정은 기간 동안만 반영', () => {
    const base = projectGoal({ target: 1000000, saved: 0, monthlySaving: 100000, annualRate: 0, today: '2026-10-17' });
    const alt = projectGoal({ target: 1000000, saved: 0, monthlySaving: 100000, annualRate: 0, today: '2026-10-17', extra: { amount: 10000, frequency: 'weekly', months: 6 } });
    expect(base.months).toBe(10);
    expect(alt.months).toBe(8); // 6개월간 월 약 143,333 → 6개월 860,000, 이후 2개월
  });
  it('저축액이 없으면 계산 불가', () => {
    expect(projectGoal({ target: 100, saved: 0, monthlySaving: 0, annualRate: 0, today: '2026-10-17' }).months).toBeNull();
  });
});
