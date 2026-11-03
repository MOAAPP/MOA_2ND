import { describe, expect, it } from 'vitest';
import { addDays } from '../shared/dates';
import { addTxns, addTxnsChecked, calibratedLevel, emptyMoa, forecastLines, kstMs, setAnchor, setDayStatus, type MoaState, type NewTxn } from '../src/lib/moa';

const TODAY = '2026-11-02';
const NOW = kstMs(TODAY, 10);

const sms = (amount: number, hour = 12, extra: Partial<NewTxn> = {}): NewTxn => ({
  occurredAt: kstMs('2026-11-01', hour), amount, kind: 'spend', method: 'debit', account: 'pay', name: '스타벅스 강남', category: '카페', essential: false, source: 'sms', ...extra,
});

describe('거래 중복 방지', () => {
  it('같은 문자를 두 번 붙여넣어도 한 번만 저장', () => {
    const m1 = addTxns(emptyMoa(), [sms(5_000)]);
    const r = addTxnsChecked(m1, [sms(5_000)]);
    expect(r.state.txns).toHaveLength(1);
    expect(r.skipped).toHaveLength(1);
  });
  it('한 묶음 안의 중복도 건너뛴다 (가게 이름 공백 차이 무시)', () => {
    const r = addTxnsChecked(emptyMoa(), [sms(5_000), sms(5_000, 12, { name: '스타벅스강남' })]);
    expect(r.added).toHaveLength(1);
  });
  it('시각·금액이 다르거나 승인 취소(환불)면 다른 거래', () => {
    const r = addTxnsChecked(emptyMoa(), [sms(5_000), sms(5_000, 15), sms(6_000), sms(5_000, 12, { kind: 'refund' })]);
    expect(r.added).toHaveLength(4);
  });
  it('직접 입력은 같은 걸 두 번 사는 경우가 있어 막지 않지만, 같은 id 재시도는 막는다', () => {
    const manual = sms(4_500, 9, { source: 'manual' });
    expect(addTxns(addTxns(emptyMoa(), [manual]), [manual]).txns).toHaveLength(2);
    const withId = { ...manual, id: 'tx_retry' };
    expect(addTxns(addTxns(emptyMoa(), [withId]), [withId]).txns).toHaveLength(1);
  });
  it('중복으로 건너뛴 문자는 잔액 기준점을 다시 잡지 않는다', () => {
    const m1 = addTxns(setAnchor(emptyMoa(), 100_000, kstMs('2026-10-31', 9)), [sms(5_000, 12, { balanceAfter: 95_000 })]);
    const m2 = addTxns(m1, [sms(5_000, 12, { balanceAfter: 95_000 })]);
    expect(m2.anchor).toEqual(m1.anchor);
    expect(m2.mismatches).toEqual(m1.mismatches);
  });
});

function withHistory(days = 21): MoaState {
  let m = setAnchor(emptyMoa(), 300_000, NOW);
  const list: NewTxn[] = [];
  for (let i = days; i >= 1; i--) {
    const d = addDays(TODAY, -i);
    list.push({ occurredAt: kstMs(d, 13), date: d, amount: 10_000, kind: 'spend', method: 'debit', account: 'pay', name: '점심', category: '식비', essential: false, source: 'manual' });
    m = setDayStatus(m, d, 'self');
  }
  return addTxns(m, list);
}

describe('예측 추적 정보와 외부 예측', () => {
  const until = addDays(TODAY, 6);
  it('기본은 기준선 출처와 버전, 마지막 정답일을 남긴다', () => {
    const f = forecastLines(withHistory(), TODAY, until);
    expect(f.meta).toMatchObject({ source: 'baseline', modelVersion: 'baseline_weekday_v1', generatedAt: TODAY, inputDataUntil: '2026-11-01' });
  });
  it('검사를 통과한 외부 예측만 쓴다', () => {
    const daily = Array.from({ length: 7 }, (_, i) => ({ date: addDays(TODAY, i), amount: 20_000 }));
    const f = forecastLines(withHistory(), TODAY, until, 'weekday', { modelVersion: 'lightgbm_tweedie_v1', inputDataUntil: '2026-11-01', daily });
    expect(f.meta.source).toBe('ml');
    expect(f.daily[1].total).toBe(20_000);
  });
  it('날짜가 빠졌거나 음수·오래된 입력이면 기준선으로 돌아가고 이유를 남긴다', () => {
    const daily = Array.from({ length: 7 }, (_, i) => ({ date: addDays(TODAY, i), amount: 20_000 }));
    const cases: [typeof daily, string, string][] = [
      [daily.slice(0, 3), '2026-11-01', 'missing_days'],
      [daily.map((d, i) => (i === 2 ? { ...d, amount: -1 } : d)), '2026-11-01', 'invalid_amount'],
      [daily, '2026-10-01', 'stale_input'],
    ];
    for (const [d, until0, reason] of cases) {
      const f = forecastLines(withHistory(), TODAY, until, 'weekday', { modelVersion: 'x', inputDataUntil: until0, daily: d });
      expect(f.meta).toMatchObject({ source: 'baseline', fallbackReason: reason });
      expect(f.daily[1].total).toBe(10_000);
    }
  });
});

describe('상단 폭 보정 수준', () => {
  it('독립 창이 적을수록 더 높은 분위수를 쓰고, 많아지면 80%에 가까워진다', () => {
    expect(calibratedLevel(5, 14)).toBe(1);
    expect(calibratedLevel(30, 7)).toBeCloseTo(1, 5);
    expect(calibratedLevel(400, 3)).toBeGreaterThan(0.8);
    expect(calibratedLevel(400, 3)).toBeLessThan(0.82);
  });
});
