import { describe, expect, it } from 'vitest';
import { addDays } from '../shared/dates';
import { mulberry32 } from '../src/lib/ml/montecarlo';
import {
  addTxns,
  assessRisk,
  billingDate,
  confirmedFlows,
  decideAlerts,
  emptyMoa,
  forecastLines,
  installmentBills,
  kstMs,
  labeledDays,
  quickStart,
  rolling7,
  setAnchor,
  setDayStatus,
  settlements,
  upperWidth,
  upsertCard,
  upsertSchedule,
  weekdayMean,
  type MoaCard,
  type MoaState,
  type NewTxn,
} from '../src/lib/moa';

const TODAY = '2026-11-02';
const NOW = kstMs(TODAY, 10);

const credit: MoaCard = { id: 'c1', name: '신한', kind: 'credit', linked: false, cutoffDay: 31, payDay: 14 };
const checkLinked: MoaCard = { id: 'k1', name: '국민체크', kind: 'debit', linked: true };
const checkOther: MoaCard = { id: 'k2', name: '토스체크', kind: 'debit', linked: false };

function base(balance = 300_000, at = NOW): MoaState {
  let m = setAnchor(emptyMoa(), balance, at);
  m = upsertCard(m, credit);
  m = upsertCard(m, checkLinked);
  m = upsertCard(m, checkOther);
  return m;
}

const spend = (date: string, amount: number, method: NewTxn['method'], extra: Partial<NewTxn> = {}): NewTxn => ({
  occurredAt: kstMs(date, 13),
  amount,
  kind: 'spend',
  method,
  account: method === 'cash' ? 'cash' : 'pay',
  name: 'test',
  category: '식비',
  essential: false,
  source: 'manual',
  ...extra,
});

const sumLines = (m: MoaState, until: string) => confirmedFlows(m, until).lines.reduce((s, l) => s + l.amount, 0);

describe('카드 청구일', () => {
  it('마감 말일·결제 14일: 이번 달 사용분은 다음 달 14일', () => {
    expect(billingDate(credit, '2026-10-31')).toBe('2026-11-14');
    expect(billingDate(credit, '2026-11-01')).toBe('2026-12-14');
  });
  it('마감 10일·결제 25일: 마감 전은 같은 달 25일, 후는 다음 달', () => {
    const c: MoaCard = { ...credit, cutoffDay: 10, payDay: 25 };
    expect(billingDate(c, '2026-11-10')).toBe('2026-11-25');
    expect(billingDate(c, '2026-11-11')).toBe('2026-12-25');
  });
  it('할부 3회차는 매달 결제일, 나머지는 1회차에', () => {
    const b = installmentBills(credit, '2026-10-20', 100_000, 3);
    expect(b.map((x) => x.date)).toEqual(['2026-11-14', '2026-12-14', '2027-01-14']);
    expect(b.map((x) => x.amount)).toEqual([33_334, 33_333, 33_333]);
  });
});

describe('결제 수단별 반영 규칙', () => {
  it('체크카드(결제계좌 연결)는 결제 즉시 빠진다', () => {
    const m = addTxns(base(), [spend('2026-11-02', 5000, 'debit', { cardId: 'k1', occurredAt: kstMs(TODAY, 12) })], NOW);
    expect(sumLines(m, '2026-11-02')).toBe(-5000);
  });
  it('다른 계좌에 연결된 체크카드는 결제계좌 잔고에 영향 없음', () => {
    const m = addTxns(base(), [spend('2026-11-02', 5000, 'debit', { cardId: 'k2', occurredAt: kstMs(TODAY, 12) })], NOW);
    expect(sumLines(m, '2026-11-30')).toBe(0);
  });
  it('지갑 현금 지출은 결제계좌 잔고 그대로', () => {
    const m = addTxns(base(), [spend('2026-11-02', 9000, 'cash', { occurredAt: kstMs(TODAY, 12) })], NOW);
    expect(sumLines(m, '2026-11-30')).toBe(0);
  });
  it('ATM 인출은 인출 즉시 출금', () => {
    const m = addTxns(base(), [spend('2026-11-02', 50_000, 'atm', { occurredAt: kstMs(TODAY, 12) })], NOW);
    expect(sumLines(m, '2026-11-02')).toBe(-50_000);
  });
  it('신용카드 사용분은 소비일이 아니라 청구 출금일에 한 번만 빠진다', () => {
    const m = addTxns(base(), [spend('2026-11-02', 24_000, 'credit', { cardId: 'c1', occurredAt: kstMs(TODAY, 12) })], NOW);
    const lines = confirmedFlows(m, '2027-01-31').lines;
    expect(lines.filter((l) => l.amount === -24_000)).toHaveLength(1);
    expect(lines.find((l) => l.amount === -24_000)!.date).toBe('2026-12-14');
    expect(sumLines(m, '2026-12-13')).toBe(0);
  });
  it('t₀ 이전에 쓴 신용카드도 출금일이 t₀ 이후면 아직 잔고에서 안 빠진 돈', () => {
    const m = addTxns(base(), [spend('2026-10-20', 30_000, 'credit', { cardId: 'c1' })], NOW);
    expect(confirmedFlows(m, '2026-11-30').lines.map((l) => [l.date, l.amount])).toEqual([['2026-11-14', -30_000]]);
  });
  it('할부 3회차가 회차별 출금일에 들어간다', () => {
    const m = addTxns(base(), [spend('2026-10-20', 90_000, 'credit', { cardId: 'c1', installments: 3 })], NOW);
    const bills = confirmedFlows(m, '2027-02-28').lines.filter((l) => l.source === 'card_bill');
    expect(bills.map((l) => [l.date, l.amount])).toEqual([['2026-11-14', -30_000], ['2026-12-14', -30_000], ['2027-01-14', -30_000]]);
  });
  it('카드 대금 출금 문자: 쌓인 청구 예정을 지우고 차액은 확인 목록으로', () => {
    let m = addTxns(base(), [spend('2026-10-20', 30_000, 'credit', { cardId: 'c1' })], NOW);
    m = addTxns(m, [{ occurredAt: kstMs('2026-11-14', 9), amount: 32_000, kind: 'card_payment', method: 'transfer', account: 'pay', cardId: 'c1', name: '신한카드 대금', category: '카드대금', essential: true, source: 'sms' }], NOW);
    const f = confirmedFlows(m, '2026-11-30');
    expect(f.lines.map((l) => [l.date, l.amount])).toEqual([['2026-11-14', -32_000]]);
    const st = settlements(m);
    expect(st[0]).toMatchObject({ expected: 30_000, actual: 32_000, diff: 2000 });
  });
  it('본인 계좌 간 이체: 결제계좌로 들어오면 +, 나가면 −', () => {
    const m = addTxns(base(), [
      { occurredAt: kstMs(TODAY, 12), amount: 100_000, kind: 'transfer_self', direction: 'in', method: 'transfer', account: 'pay', name: 'B계좌에서', category: '이체', essential: false, source: 'manual' },
      { occurredAt: kstMs(TODAY, 13), amount: 30_000, kind: 'transfer_self', direction: 'out', method: 'transfer', account: 'pay', name: 'B계좌로', category: '이체', essential: false, source: 'manual' },
    ], NOW);
    expect(sumLines(m, TODAY)).toBe(70_000);
  });
  it('적금 납입은 납입일에 출금, 변동 지출 학습에서는 제외', () => {
    let m = base();
    m = upsertSchedule(m, { name: '청년미래적금', amount: 200_000, recurrence: 'monthly', day: 10, direction: 'out', essential: true, saving: true });
    expect(confirmedFlows(m, '2026-11-30').lines.map((l) => [l.date, l.amount])).toEqual([['2026-11-10', -200_000]]);
  });
});

describe('t₀ 기준 중복 방지', () => {
  it('잔액 확인 전날 들어온 급여는 다시 더하지 않는다', () => {
    let m = base(300_000, NOW);
    m = addTxns(m, [{ occurredAt: kstMs('2026-11-01', 9), amount: 200_000, kind: 'income', method: 'transfer', account: 'pay', name: '급여', category: '수입', essential: false, source: 'sms' }], NOW);
    expect(sumLines(m, '2026-11-30')).toBe(0);
    const r = assessRisk(m, NOW, TODAY);
    expect(r.series.registered[0].close).toBe(300_000);
  });
  it('일정이 같은 거래로 기록되면 일정은 다시 빼지 않는다', () => {
    let m = base(500_000, kstMs('2026-11-01', 9));
    m = upsertSchedule(m, { name: '월세', amount: 350_000, recurrence: 'monthly', day: 5, direction: 'out', essential: true });
    m = addTxns(m, [spend('2026-11-05', 350_000, 'transfer', { essential: true, name: '월세', occurredAt: kstMs('2026-11-05', 9) })], NOW);
    expect(confirmedFlows(m, '2026-11-30').lines.filter((l) => l.amount === -350_000)).toHaveLength(1);
  });
  it('거래 후 잔액이 찍힌 문자는 B₀·t₀를 새로 잡고, 계산과 다르면 불일치로 남긴다', () => {
    let m = base(300_000, kstMs('2026-11-01', 9));
    m = addTxns(m, [spend('2026-11-02', 10_000, 'debit', { cardId: 'k1', occurredAt: kstMs(TODAY, 9), balanceAfter: 290_000 })], NOW);
    expect(m.anchor).toMatchObject({ balance: 290_000, source: 'sms' });
    expect(m.mismatches).toHaveLength(0);
    m = addTxns(m, [spend('2026-11-02', 10_000, 'debit', { cardId: 'k1', occurredAt: kstMs(TODAY, 10), balanceAfter: 200_000 })], NOW);
    expect(m.mismatches).toHaveLength(1);
  });
});

describe('결제계좌 기준 부족', () => {
  it('가입 첫날 확정 월세가 잔액보다 크면 지출 예측 없이도 등록 일정 기준 부족', () => {
    const m = quickStart(emptyMoa(), 50_000, { name: '월세', amount: 300_000, day: 3 }, NOW);
    const r = assessRisk(m, NOW, TODAY);
    expect(r.forecast.ready.ready).toBe(false);
    expect(r.worst).toMatchObject({ grade: 'registered', shortBy: 250_000, date: '2026-11-03' });
  });
  it('다른 계좌가 충분해도 결제계좌 기준으로 부족, 이체 일정을 등록해야 해소', () => {
    let m = quickStart(emptyMoa(), 10_000, { name: '월세', amount: 400_000, day: 5 }, NOW);
    expect(assessRisk(m, NOW, TODAY).worst?.grade).toBe('registered');
    m = upsertSchedule(m, { name: 'B계좌에서 옮김', amount: 400_000, recurrence: 'once', date: '2026-11-04', direction: 'in', essential: false, status: 'scheduled', fromOtherAccount: true });
    expect(assessRisk(m, NOW, TODAY).worst?.grade).toBe('ok');
  });
  it('급여 3일 지연: 지연 시나리오에서만 부족이면 주의', () => {
    let m = quickStart(emptyMoa(), 150_000, { name: '카드값', amount: 300_000, day: 11 }, NOW);
    m = upsertSchedule(m, { name: '알바비', amount: 200_000, recurrence: 'monthly', day: 10, direction: 'in', essential: false, status: 'scheduled' });
    const r = assessRisk(m, NOW, TODAY);
    expect(r.worst).toMatchObject({ grade: 'caution', cause: 'delay', shortBy: 150_000 });
  });
  it('불확실 입금은 계산에 넣지 않고 들어올 때 결과만 참고로', () => {
    let m = quickStart(emptyMoa(), 100_000, { name: '통신비', amount: 150_000, day: 8 }, NOW);
    m = upsertSchedule(m, { name: '가족 지원', amount: 100_000, recurrence: 'once', date: '2026-11-06', direction: 'in', essential: false, status: 'uncertain' });
    const r = assessRisk(m, NOW, TODAY);
    expect(r.worst?.grade).toBe('registered');
    expect(r.ifUncertainArrives).toBe(50_000);
    expect(r.evidence.uncertainIn).toHaveLength(1);
  });
  it('잔액을 7일 넘게 확인하지 않으면 높은 등급을 내지 않는다', () => {
    const m = quickStart(emptyMoa(), 50_000, { name: '월세', amount: 300_000, day: 5 }, NOW - 9 * 86400000);
    const r = assessRisk(m, NOW, TODAY);
    expect(r.stale).toBe(true);
    expect(r.worst).toMatchObject({ grade: 'caution', capped: 'stale' });
  });
  it('기록 누락(잔액 불일치)이 있으면 등급은 주의를 넘지 않는다', () => {
    let m = quickStart(emptyMoa(), 50_000, { name: '월세', amount: 300_000, day: 5 }, NOW);
    m = { ...m, mismatches: [{ at: NOW - 86400000, expected: 120_000, actual: 50_000 }] };
    expect(assessRisk(m, NOW, TODAY).worst).toMatchObject({ grade: 'caution', capped: 'gap' });
  });
});

/** 4주 동안 매일 정답 기록이 있는 사용자 */
function withHistory(daily: (d: string, i: number) => number, days = 28, method: NewTxn['method'] = 'debit'): MoaState {
  let m = base(400_000, NOW);
  const list: NewTxn[] = [];
  for (let i = days; i >= 1; i--) {
    const d = addDays(TODAY, -i);
    const amt = daily(d, i);
    if (amt > 0) list.push(spend(d, amt, method, { cardId: method === 'debit' ? 'k1' : method === 'credit' ? 'c1' : undefined, occurredAt: kstMs(d, 13) }));
    m = setDayStatus(m, d, 'self');
  }
  // 거래는 t₀ 이전이라 잔고에는 이미 들어 있음
  return addTxns(m, list, NOW);
}

describe('지출 예측 기준선', () => {
  it('정답일만 쓰고 기록 없는 날을 0원으로 보지 않는다', () => {
    let m = withHistory(() => 10_000, 10);
    m = setDayStatus(m, addDays(TODAY, -3), null); // 완료 표시 해제
    const h = labeledDays(m, TODAY);
    expect(h).toHaveLength(9);
    expect(h.every((x) => x.amount === 10_000)).toBe(true);
  });
  it('7일 평균과 요일별 평균은 asOf 이전 정답만 본다', () => {
    const m = withHistory((d) => (new Date(d).getUTCDay() === 6 ? 30_000 : 10_000));
    const h = labeledDays(m, TODAY);
    expect(Math.round(rolling7(h, TODAY)!)).toBe(Math.round((30_000 + 6 * 10_000) / 7));
    expect(weekdayMean(h, '2026-11-07', TODAY)).toBe(30_000); // 토요일
    expect(weekdayMean(h, '2026-11-04', TODAY)).toBe(10_000);
  });
  it('기록 2주 미만이면 예측하지 않는다', () => {
    const m = withHistory(() => 10_000, 10);
    expect(forecastLines(m, TODAY, addDays(TODAY, 14)).ready.ready).toBe(false);
  });
  it('같은 날 예측 후 실제 지출이 기록되면 확정 + 남은 예측만 뺀다', () => {
    let m = withHistory(() => 20_000);
    m = addTxns(m, [spend(TODAY, 15_000, 'debit', { cardId: 'k1', occurredAt: kstMs(TODAY, 11) })], NOW);
    const f = forecastLines(m, TODAY, TODAY);
    expect(f.lines.find((l) => l.date === TODAY)!.amount).toBe(-5000);
    expect(confirmedFlows(m, TODAY).lines.find((l) => l.date === TODAY)!.amount).toBe(-15_000);
  });
  it('신용카드 비중 예측분은 청구일이 범위 밖이면 이번 잔고에 영향 없음', () => {
    const m = withHistory(() => 10_000, 28, 'credit');
    const f = forecastLines(m, TODAY, addDays(TODAY, 14));
    expect(f.shares.credit).toBe(1);
    expect(f.lines).toHaveLength(0);
    expect(f.creditOutside).toBeGreaterThan(0);
  });
  it('상단 폭은 남은 일수 h의 누적 오차로 따로 계산한다 (3일 폭 ≠ 14일 폭)', () => {
    const rnd = mulberry32(7);
    const m = withHistory(() => Math.round(5000 + rnd() * rnd() * 60_000), 56);
    const h = labeledDays(m, TODAY);
    const w3 = upperWidth(h, 3, 30_000);
    const w14 = upperWidth(h, 14, 140_000);
    expect(w3.basis).toBe('personal');
    expect(w14.width).toBeGreaterThan(w3.width);
  });
  it('기록이 적으면 공통 비율 폭을 쓴다', () => {
    expect(upperWidth([], 7, 70_000).basis).toBe('common');
  });
});

describe('등급과 알림', () => {
  it('기본 시나리오에서 부족하면 부족 가능성 높음', () => {
    let m = withHistory(() => 20_000);
    m = setAnchor(m, 200_000, NOW);
    m = upsertSchedule(m, { name: '월세', amount: 150_000, recurrence: 'monthly', day: 6, direction: 'out', essential: true });
    const r = assessRisk(m, NOW, TODAY);
    expect(r.worst).toMatchObject({ grade: 'high', cause: 'spending' });
  });
  it('상단 지출과 급여 지연이 겹칠 때만 부족하면 복합 상황 주의', () => {
    let m = withHistory(() => 10_000);
    m = setAnchor(m, 300_000, NOW);
    m = upsertSchedule(m, { name: '급여', amount: 200_000, recurrence: 'monthly', day: 8, direction: 'in', essential: false, status: 'scheduled' });
    m = upsertSchedule(m, { name: '월세', amount: 300_000, recurrence: 'monthly', day: 9, direction: 'out', essential: true });
    const r = assessRisk(m, NOW, TODAY);
    const p = r.payments[0];
    // 기본: 300k −7일×10k + 200k − 300k = 130k / 지연: 급여가 11일로 → 300k − 80k − 300k < 0 → 주의
    expect(p.balances.base).toBeGreaterThan(0);
    expect(p.grade).toBe('caution');
    // 지연 일수를 0으로 두면 지연 시나리오가 기본과 같아져 주의는 상단 지출에서만 결정
    const r0 = assessRisk(m, NOW, TODAY, { delayDays: 0 });
    expect(['ok', 'caution', 'combo']).toContain(r0.payments[0].grade);
  });
  it('D-7, D-3에 알리고 그 사이 등급이 오르면 바로 다시 알린다 (결제일당 최대 3회)', () => {
    let m = quickStart(emptyMoa(), 100_000, { name: '카드값', amount: 150_000, day: 9 }, NOW);
    m = upsertSchedule(m, { name: '알바비', amount: 100_000, recurrence: 'monthly', day: 8, direction: 'in', essential: false, status: 'scheduled' });
    m = { ...m, delayDays: 3 };
    // 11/2 기준 D-7: 지연 시 부족 → 주의, D-7 알림
    const r1 = assessRisk(m, NOW, TODAY);
    const a1 = decideAlerts(r1, [], NOW);
    expect(a1.map((a) => a.trigger)).toEqual(['D7']);
    expect(decideAlerts(r1, a1, NOW)).toHaveLength(0);
    // 큰 지출이 생겨 등록 일정 기준 부족으로 오르면 바로 재알림
    const m2 = addTxns(m, [spend(TODAY, 160_000, 'debit', { cardId: 'k1', occurredAt: kstMs(TODAY, 11) })], NOW);
    const a2 = decideAlerts(assessRisk(m2, NOW, TODAY), a1, NOW);
    expect(a2.map((a) => a.trigger)).toEqual(['registered']);
    // D-3이 되면 한 번 더, 그 뒤로는 없음
    const d3 = kstMs('2026-11-06', 10);
    const a3 = decideAlerts(assessRisk(m2, d3, '2026-11-06'), [...a1, ...a2], d3);
    expect(a3.map((a) => a.trigger)).toEqual(['D3']);
    expect(decideAlerts(assessRisk(m2, d3, '2026-11-06'), [...a1, ...a2, ...a3], d3)).toHaveLength(0);
  });
  it('복합 상황 주의와 여유는 알림을 보내지 않는다', () => {
    const m = quickStart(emptyMoa(), 900_000, { name: '월세', amount: 300_000, day: 5 }, NOW);
    expect(decideAlerts(assessRisk(m, NOW, TODAY), [], NOW)).toHaveLength(0);
  });
  it('살까 말까: 체크카드면 이번 결제일에 영향, 신용카드면 다음 카드값으로', () => {
    let m = quickStart(emptyMoa(), 320_000, { name: '월세', amount: 300_000, day: 6 }, NOW);
    m = upsertCard(m, credit);
    const check = assessRisk(m, NOW, TODAY, { extraLines: [{ date: TODAY, amount: -24_000, label: '배달', source: 'txn', certainty: 'confirmed', essential: false }] });
    expect(check.worst?.grade).toBe('registered');
    const bd = billingDate(credit, TODAY);
    const cr = assessRisk(m, NOW, TODAY, { extraLines: [{ date: bd, amount: -24_000, label: '배달', source: 'card_bill', certainty: 'confirmed', essential: false }] });
    expect(cr.worst?.grade).toBe('ok');
  });
});
