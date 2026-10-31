import { describe, expect, it } from 'vitest';
import { groundSchedule } from '../../src/core/extract';
import { generate, PERSONAS } from '../../src/core/synthetic';
import { evaluateDetection } from '../../src/core/syntheticEval';

describe('LLM 일정 추출 검증 — 빈칸을 지어내지 않는다', () => {
  const text = '다음 달 5일 월세 35만원, 10일에 알바비 48만원 들어오고, 8일에 카드값 12만원 나가';
  it('문장에 있는 금액·날짜는 통과, 입금은 기본값 예정', () => {
    const r = groundSchedule(text, [
      { name: '월세', amount: 350000, day: 5, direction: 'out' },
      { name: '알바비', amount: 480000, day: 10, direction: 'in' },
      { name: '카드값', amount: 120000, day: 8, direction: 'out' },
    ]);
    expect(r.map((x) => x.missing)).toEqual([[], [], []]);
    expect(r[1].certainty).toBe('scheduled');
  });
  it('문장에 없는 금액·날짜는 비운다', () => {
    const r = groundSchedule('월세는 다음 달에 나가', [{ name: '월세', amount: 350000, day: 25, direction: 'out' }]);
    expect(r[0]).toMatchObject({ amount: null, day: null, missing: ['amount', 'day'] });
  });
  it('3만 5천원, 12,000원 같은 표기도 인식', () => {
    const r = groundSchedule('15일 통신비 3만 5천원, 20일 구독 12,000원', [
      { name: '통신비', amount: 35000, day: 15, direction: 'out' },
      { name: '구독', amount: 12000, day: 20, direction: 'out' },
    ]);
    expect(r.every((x) => x.missing.length === 0)).toBe(true);
  });
});

describe('합성 사용자', () => {
  it('시드가 같으면 같은 데이터', () => {
    const a = generate(PERSONAS[0]);
    const b = generate(PERSONAS[0]);
    expect(a.truth.length).toBe(b.truth.length);
    expect(a.labels).toEqual(b.labels);
  });
  it('S03(통학생)은 부족이 없고 부족 가능성 높음 경고도 없다', () => {
    const r = evaluateDetection(generate(PERSONAS.find((p) => p.id === 'S03')!));
    expect(r.shortEvents).toBe(0);
    expect(r.falseHigh).toEqual([]);
  });
  it('S08 급여 3일 지연으로 생긴 부족을 결제일 전에 짚는다', () => {
    const u = generate(PERSONAS.find((p) => p.id === 'S08')!);
    const r = evaluateDetection(u);
    expect(r.shortEvents).toBeGreaterThan(0);
    expect(r.missed).toEqual([]);
  });
});
