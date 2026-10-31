/**
 * 위험 판단·한계 상황 테스트 — 기획서 '3순위: 한계 상황 테스트' 표 + 예측 경계 규칙.
 */
import { describe, expect, it } from 'vitest';
import { addDays, type ISODate } from '../../shared/dates';
import { decideAlerts, type AlertState } from '../../src/core/alerts';
import { compareChoice } from '../../src/core/choice';
import { quantile } from '../../src/core/evaluate';
import { assessRisk, type RiskInput } from '../../src/core/risk';
import { kst } from '../../src/core/time';
import type { DayStatus, FixedItem, IncomeSchedule, Txn } from '../../src/core/types';
import { A, B, baseSetup, id, obs, spend, steadyHistory } from './fixtures';

const rent = (date: ISODate, amount: number, extra: Partial<FixedItem> = {}): FixedItem => ({ id: id('rent'), name: '월세', amount, accountId: A, recurrence: 'once', date, essential: true, kind: 'rent', ...extra });
const income = (date: ISODate, amount: number, certainty: 'scheduled' | 'uncertain' = 'scheduled', extra: Partial<IncomeSchedule> = {}): IncomeSchedule => ({ id: id('inc'), name: '알바비', amount, accountId: A, recurrence: 'once', date, certainty, ...extra });

function input(o: Partial<Omit<RiskInput, 'now'>> & { now: string }): RiskInput {
  return { setup: baseSetup(), txns: [], observations: [], dayStatus: new Map(), ...o, now: kst(o.now) };
}

describe('데이터가 없어도 확정 일정으로 즉시 경고', () => {
  it('가입 첫날, 확정 월세가 잔액보다 크면 지출 예측 없이 등록 일정 기준 부족', () => {
    const r = assessRisk(input({ now: '2026-10-29 10:00', setup: baseSetup({ fixed: [rent('2026-10-30', 300000)] }), observations: [obs('2026-10-29 09:00', 50000)] }));
    expect(r.stage).toBe('none');
    expect(r.grade).toBe('registered_short');
    expect(r.top?.date).toBe('2026-10-30');
    expect(r.top?.shortage.registered).toBe(250000);
    expect(r.top?.balance.base).toBeNull();
  });
  it('기록 2주 미만이면 지출 예측을 하지 않는다', () => {
    const h = steadyHistory('2026-10-20', '2026-10-28', 10000);
    const r = assessRisk(input({ now: '2026-10-29 10:00', txns: h.txns, dayStatus: h.status, setup: baseSetup({ fixed: [rent('2026-11-02', 100000)] }), observations: [obs('2026-10-29 09:00', 120000)] }));
    expect(r.stage).toBe('none');
    expect(r.grade).toBe('ok');
  });
});

describe('결제계좌 기준', () => {
  it('결제계좌는 부족, 다른 계좌는 충분 → 결제계좌 기준으로 부족 경고', () => {
    const r = assessRisk(input({ now: '2026-10-29 10:00', setup: baseSetup({ fixed: [rent('2026-11-05', 400000)] }), observations: [obs('2026-10-29 09:00', 10000), obs('2026-10-29 09:00', 500000, B)] }));
    expect(r.grade).toBe('registered_short');
    expect(r.top?.shortage.registered).toBe(390000);
  });
  it('B계좌에서 옮기는 이체 일정을 등록했을 때만 해소', () => {
    const move = income('2026-11-04', 400000, 'scheduled', { name: 'B에서 이체', kind: 'transfer' });
    const r = assessRisk(input({ now: '2026-10-29 10:00', setup: baseSetup({ fixed: [rent('2026-11-05', 400000)], incomes: [move] }), observations: [obs('2026-10-29 09:00', 10000)] }));
    expect(r.grade).toBe('ok');
  });
  it('지갑 현금으로만 쓰는 사람은 예측 지출이 결제계좌를 줄이지 않는다', () => {
    const h = steadyHistory('2026-10-01', '2026-10-28', 10000, 'cash');
    const r = assessRisk(input({ now: '2026-10-29 10:00', txns: h.txns, dayStatus: h.status, setup: baseSetup({ fixed: [rent('2026-11-05', 500000)] }), observations: [obs('2026-10-29 09:00', 600000)] }));
    expect(r.stage).toBe('baseline');
    expect(r.shares?.shares.cash).toBe(1);
    expect(r.top?.balance.base).toBe(100000);
  });
});

describe('입금 상태', () => {
  const h = steadyHistory('2026-10-01', '2026-10-28', 10000);
  it('급여 3일 지연: 지연 시나리오에서 부족 → 주의', () => {
    const r = assessRisk(input({ now: '2026-10-29 10:00', txns: h.txns, dayStatus: h.status, setup: baseSetup({ fixed: [rent('2026-11-02', 300000)], incomes: [income('2026-10-31', 210000)] }), observations: [obs('2026-10-29 09:00', 150000)] }));
    expect(r.top?.balance.base).toBe(10000); // 150,000 + 210,000 − 5일×10,000 − 300,000
    expect(r.top?.balance.delay).toBe(-200000);
    expect(r.grade).toBe('caution');
  });
  it('불확실 입금만 있으면 넣지 않고 계산, 들어온다면의 결과는 참고로만', () => {
    const r = assessRisk(input({ now: '2026-10-29 10:00', setup: baseSetup({ fixed: [rent('2026-11-01', 250000)], incomes: [income('2026-10-31', 300000, 'uncertain', { name: '가족 지원' })] }), observations: [obs('2026-10-29 09:00', 100000)] }));
    expect(r.grade).toBe('registered_short');
    expect(r.top?.shortage.registered).toBe(150000);
    expect(r.ifUncertainArrives).toBe('ok');
    expect(r.basis.uncertainIn).toBe(300000);
  });
  it('잔액 확인 전에 이미 들어온 급여(문자)는 다시 더하지 않는다', () => {
    const paid: Txn = { id: id(), type: 'income', occurredAt: kst('2026-10-28 09:00'), amount: 200000, accountId: A };
    const sched = income('2026-10-28', 200000);
    const r = assessRisk(input({ now: '2026-10-29 10:00', txns: [paid], setup: baseSetup({ fixed: [rent('2026-10-30', 400000)], incomes: [sched] }), observations: [obs('2026-10-29 09:00', 300000)] }));
    expect(r.top?.shortage.registered).toBe(100000); // 30만 − 40만, 급여 20만은 B₀에 포함
    expect(r.flags.overdueIncomes).toHaveLength(0);
  });
});

describe('기록과 예측의 경계', () => {
  it('같은 날 예측 후 실제 지출 기록: 확정값 + 남은 예측만 차감', () => {
    const h = steadyHistory('2026-10-01', '2026-10-28', 20000);
    const lunch = spend('2026-10-29 14:00', 15000, 'debit');
    const r = assessRisk(input({ now: '2026-10-29 15:00', txns: [...h.txns, lunch], dayStatus: h.status, setup: baseSetup({ fixed: [rent('2026-11-02', 10000)] }), observations: [obs('2026-10-29 09:00', 500000)] }));
    const today = r.paths.base!.find((d) => d.date === '2026-10-29')!;
    expect(today.out.map((p) => -p.amount).sort((a, b) => a - b)).toEqual([5000, 15000]);
    expect(today.low).toBe(480000);
  });
  it('다른 계좌에 연결된 체크카드로만 쓰면 결제계좌 예측 지출 0', () => {
    const h = steadyHistory('2026-10-01', '2026-10-28', 10000);
    const txns = h.txns.map((t) => (t.type === 'spend' ? { ...t, cardId: 'chkB' } : t));
    const r = assessRisk(input({ now: '2026-10-29 10:00', txns, dayStatus: h.status, setup: baseSetup({ fixed: [rent('2026-11-05', 100000)] }), observations: [obs('2026-10-29 09:00', 100000)] }));
    expect(r.shares?.shares.other).toBe(1);
    expect(r.top?.balance.base).toBe(0);
    expect(r.grade).toBe('ok');
  });
  it('신용카드 예측분은 청구 결제일이 14일 범위 밖이면 이번 판단에 영향 없음', () => {
    const h = steadyHistory('2026-10-01', '2026-10-28', 10000, 'credit');
    const r = assessRisk(input({ now: '2026-10-29 10:00', txns: h.txns, dayStatus: h.status, setup: baseSetup({ fixed: [rent('2026-11-05', 100000)] }), observations: [obs('2026-10-29 09:00', 100000)] }));
    // 10월 사용분(이미 쓴 것)은 11/14 청구 → 14일 범위(11/12) 밖
    expect(r.events.map((e) => e.kind)).toEqual(['fixed']);
    expect(r.top?.balance.base).toBe(0);
  });
});

describe('등급 제한', () => {
  it('잔액 7일 이상 미확인: 잔액 확인 필요, 부족 가능성 높음 이상을 내지 않음', () => {
    const r = assessRisk(input({ now: '2026-10-29 10:00', setup: baseSetup({ fixed: [rent('2026-10-30', 300000)] }), observations: [obs('2026-10-20 09:00', 50000)] }));
    expect(r.flags.needsBalanceCheck).toBe(true);
    expect(r.top?.rawGrade).toBe('registered_short');
    expect(r.grade).toBe('caution');
  });
  it('기록 일부 누락: 잔액 불일치 감지, 등급은 주의를 넘지 않음', () => {
    const coffee = spend('2026-10-28 10:00', 10000, 'debit');
    const r = assessRisk(input({ now: '2026-10-29 10:00', txns: [coffee], setup: baseSetup({ fixed: [rent('2026-10-30', 300000)] }), observations: [obs('2026-10-27 09:00', 200000), obs('2026-10-29 09:00', 150000)] }));
    expect(r.reconcile[0]).toMatchObject({ expected: 190000, observed: 150000, diff: -40000, mismatch: true });
    expect(r.flags.recordGap).toBe(true);
    expect(r.grade).toBe('caution');
  });
  it('잔액이 맞으면 불일치 없음 (자동이체 월세 포함)', () => {
    const coffee = spend('2026-10-28 10:00', 10000, 'debit');
    const r = assessRisk(input({ now: '2026-10-29 10:00', txns: [coffee], setup: baseSetup({ fixed: [rent('2026-10-28', 40000)] }), observations: [obs('2026-10-27 09:00', 200000), obs('2026-10-29 09:00', 150000)] }));
    expect(r.reconcile[0].mismatch).toBe(false);
    expect(r.flags.recordGap).toBe(false);
  });
});

describe('상단 지출 폭', () => {
  // 2주를 겨우 넘긴 기록 → 본인 오차가 모자라 공통 오차를 쓴다
  const h = steadyHistory('2026-10-14', '2026-10-28', 10000);
  const global = { 3: Array.from({ length: 20 }, (_, i) => 1000 * i), 4: Array(20).fill(30000), 14: Array(20).fill(90000) };

  it('결제일 3일 전에는 14일이 아니라 3일 누적 오차 폭', () => {
    const r = assessRisk(input({ now: '2026-10-29 10:00', txns: h.txns, dayStatus: h.status, setup: baseSetup({ fixed: [rent('2026-11-01', 10000)] }), observations: [obs('2026-10-29 09:00', 500000)], globalErrors: global }));
    const e = r.top!;
    expect(e.h).toBe(3);
    expect(e.upperWidth).toEqual({ width: quantile(global[3], 0.8), source: 'global' });
  });
  it('상단 지출과 급여 지연이 동시에 → 단독은 여유여도 복합 상황 주의 (푸시 없음)', () => {
    const r = assessRisk(input({ now: '2026-10-29 10:00', txns: h.txns, dayStatus: h.status, setup: baseSetup({ fixed: [rent('2026-11-02', 100000)], incomes: [income('2026-10-31', 80000)] }), observations: [obs('2026-10-29 09:00', 170000)], globalErrors: global }));
    expect(r.top?.balance).toMatchObject({ base: 100000, upper: 70000, delay: 20000, combined: -10000 });
    expect(r.grade).toBe('combined_caution');
    expect(decideAlerts(r, {}).send).toHaveLength(0);
  });
});

describe('선제 알림', () => {
  const h = steadyHistory('2026-10-01', '2026-10-28', 10000);
  const setup = baseSetup({ fixed: [rent('2026-11-05', 400000)], incomes: [income('2026-11-03', 100000)] });
  const anchor = [obs('2026-10-29 09:00', 420000)];

  it('D-7 알림 → 등급 그대로면 조용 → 결제 이틀 전 새 지출로 등급 상향 시 바로 재알림 → D-3 → 최대 3회', () => {
    let state: AlertState = {};
    const r1 = assessRisk(input({ now: '2026-10-29 10:00', txns: h.txns, dayStatus: h.status, setup, observations: anchor }));
    expect(r1.grade).toBe('caution');
    let d = decideAlerts(r1, state);
    expect(d.send.map((s) => s.reason)).toEqual(['d7']);
    state = d.next;

    const status2 = new Map<ISODate, DayStatus>([...h.status, ['2026-10-29', 'self_reported'], ['2026-10-30', 'self_reported']]);
    const txns2 = [...h.txns, spend('2026-10-29 12:00', 10000, 'debit'), spend('2026-10-30 12:00', 10000, 'debit')];
    const r2 = assessRisk(input({ now: '2026-10-31 10:00', txns: txns2, dayStatus: status2, setup, observations: anchor }));
    expect(r2.grade).toBe('caution');
    d = decideAlerts(r2, state);
    expect(d.send).toHaveLength(0);
    state = d.next;

    const txns3 = [...txns2, spend('2026-10-31 11:00', 60000, 'debit')];
    const r3 = assessRisk(input({ now: '2026-10-31 11:30', txns: txns3, dayStatus: status2, setup, observations: anchor }));
    expect(r3.top?.balance.base).toBe(-10000);
    expect(r3.grade).toBe('high');
    d = decideAlerts(r3, state);
    expect(d.send.map((s) => s.reason)).toEqual(['upgrade']);
    expect(d.send[0].text).toContain('1만원 모자랄 가능성이 높아요');
    state = d.next;

    const r4 = assessRisk(input({ now: '2026-11-02 10:00', txns: txns3, dayStatus: status2, setup, observations: anchor }));
    d = decideAlerts(r4, state);
    expect(d.send.map((s) => s.reason)).toEqual(['d3']);
    state = d.next;
    expect(decideAlerts({ ...r4, events: r4.events.map((e) => ({ ...e, grade: 'registered_short' as const })) }, state).send).toHaveLength(0);
  });
  it('여유는 알리지 않는다', () => {
    const r = assessRisk(input({ now: '2026-10-29 10:00', setup: baseSetup({ fixed: [rent('2026-10-30', 1000)] }), observations: [obs('2026-10-29 09:00', 50000)] }));
    expect(decideAlerts(r, {}).send).toHaveLength(0);
  });
  it('등록 일정 기준 부족은 즉시', () => {
    const r = assessRisk(input({ now: '2026-10-29 10:00', setup: baseSetup({ fixed: [rent('2026-11-10', 300000)] }), observations: [obs('2026-10-29 09:00', 50000)] }));
    const d = decideAlerts(r, {});
    expect(d.send[0].reason).toBe('immediate');
    expect(d.send[0].text).toBe('지금 등록된 일정대로라면 10일 월세 출금에 25만원이 모자라요.');
  });
});

describe('돌발 지출과 재계산', () => {
  it('돌발 지출 다음 재계산에서 부족 가능일 갱신', () => {
    const h = steadyHistory('2026-10-01', '2026-10-28', 10000);
    const setup = baseSetup({ fixed: [rent('2026-11-03', 200000), rent('2026-11-08', 100000, { name: '통신비' })] });
    const before = assessRisk(input({ now: '2026-10-29 10:00', txns: h.txns, dayStatus: h.status, setup, observations: [obs('2026-10-29 09:00', 450000)] }));
    expect(before.grade).toBe('ok');
    const after = assessRisk(input({ now: '2026-10-29 21:00', txns: [...h.txns, spend('2026-10-29 20:00', 150000, 'debit')], dayStatus: h.status, setup, observations: [obs('2026-10-29 09:00', 450000)] }));
    expect(after.grade).toBe('high');
    expect(after.top?.date).toBe('2026-11-08');
  });
});

describe('살까 말까 — 결제 수단에 따라 결과가 달라짐 (시연 4·5)', () => {
  const h = steadyHistory('2026-10-01', '2026-10-28', 10000);
  const base = input({ now: '2026-10-29 19:00', txns: h.txns, dayStatus: h.status, setup: baseSetup({ fixed: [rent('2026-11-02', 300000)] }), observations: [obs('2026-10-29 09:00', 360000)] });
  it('체크카드 2만4천원: 사면 부족 가능성 높음, 참으면 여유', () => {
    const c = compareChoice(base, { amount: 24000, method: 'debit', cardId: 'chk' });
    expect(c.skip.top?.balance.base).toBe(10000);
    expect(c.buy.top?.balance.base).toBe(-14000);
    expect([c.gradeIfSkip, c.gradeIfBuy]).toEqual(['ok', 'high']);
    expect(c.virtualSaving).toBe(24000);
  });
  it('같은 금액 신용카드: 청구가 범위 밖이라 이번 결제일엔 영향 없음, 다음 카드값에 더해짐', () => {
    const c = compareChoice(base, { amount: 24000, method: 'credit', cardId: 'cc' });
    expect(c.creditPayDate).toBe('2026-11-14');
    expect(c.outsideHorizon).toBe(true);
    expect(c.gradeIfBuy).toBe(c.gradeIfSkip);
    expect(addDays(c.skip.today, 14)).toBe('2026-11-12');
  });
});
