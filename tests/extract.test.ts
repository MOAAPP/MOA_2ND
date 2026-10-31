import { describe, expect, it } from 'vitest';
import { amountsInText, extractionGrounded } from '../shared/aiPrompts';
import { maskText } from '../shared/mask';
import { ruleParseSchedule, ruleParseSpend } from '../src/lib/ai/parseRules';
import { sanitizeInput } from '../server/lib/ai';

const today = '2026-10-31';

describe('정규식 파서 — 결제 문자', () => {
  it('체크카드 승인: 결제 수단 debit, 시각, 날짜', () => {
    const r = ruleParseSpend({ text: '[Web발신]\nKB국민체크(5678)승인\n18,500원\n10/30 19:10\n배달의민족', today });
    expect(r.items[0]).toMatchObject({ amount: 18_500, method: 'debit', kind: 'spend', date: '2026-10-30', time: '19:10', issuer: 'KB국민' });
  });
  it('신용카드 할부', () => {
    const r = ruleParseSpend({ text: '[Web발신]\n현대카드 신용 120,000원 할부3개월 10/29 무신사', today });
    expect(r.items[0]).toMatchObject({ method: 'credit', installments: 3 });
  });
  it("'카드 승인'만으로는 결제 수단을 지어내지 않는다", () => {
    const r = ruleParseSpend({ text: '[Web발신]\n신한카드 승인 6,800원 10/31 08:42 메가커피', today });
    expect(r.items[0].method).toBeNull();
  });
  it('날짜가 없으면 null로 둔다 (오늘로 채우지 않는다)', () => {
    const r = ruleParseSpend({ text: '스벅 6800원 친구랑', today });
    expect(r.items[0]).toMatchObject({ amount: 6800, date: null });
  });
  it('입금 문자: 거래 후 잔액을 뽑고, 누적은 잔액이 아니다', () => {
    const r = ruleParseSpend({ text: '[KB]10/29 13:20\n[계좌번호]\n[이름]\n입금\n200,000\n잔액350,000', today });
    expect(r.items[0]).toMatchObject({ kind: 'income', amount: 200_000, balanceAfter: 350_000, method: 'transfer' });
    const c = ruleParseSpend({ text: '[Web발신]\n신한카드 승인 6,800원 10/31 메가커피\n누적 412,300원', today });
    expect(c.items[0].balanceAfter).toBeNull();
  });
  it('승인취소는 refund, 카드 대금은 card_payment', () => {
    expect(ruleParseSpend({ text: '[Web발신]\n삼성카드 승인취소\n32,000원\n10/28 무신사', today }).items[0].kind).toBe('refund');
    expect(ruleParseSpend({ text: '[우리] 10/14 신한카드 대금 출금 312,000원 잔액 88,000원', today }).items[0]).toMatchObject({ kind: 'card_payment', balanceAfter: 88_000 });
  });
  it('월세는 필수 결제', () => {
    expect(ruleParseSpend({ text: '[우리] 11/05 월세 출금 350,000원', today }).items[0]).toMatchObject({ essential: true, method: 'transfer' });
  });
});

describe('정규식 파서 — 일정 문장', () => {
  it('다음 달 5일 월세 35만원, 10일에 알바비 48만원 들어오고, 8일에 카드값 12만원 나가', () => {
    const r = ruleParseSchedule({ text: '다음 달 5일 월세 35만원, 10일에 알바비 48만원 들어오고, 8일에 카드값 12만원 나가', today });
    expect(r.items).toHaveLength(3);
    expect(r.items[0]).toMatchObject({ amount: 350_000, direction: 'out', date: '2026-11-05', recurrence: 'once' });
    expect(r.items[1]).toMatchObject({ amount: 480_000, direction: 'in', date: '2026-11-10' });
    expect(r.items[2]).toMatchObject({ amount: 120_000, direction: 'out', date: '2026-11-08' });
  });
  it('매달 반복', () => {
    expect(ruleParseSchedule({ text: '매달 25일 통신비 5만 5천원', today }).items[0]).toMatchObject({ amount: 55_000, day: 25, recurrence: 'monthly', direction: 'out' });
  });
  it('금액이 없으면 null', () => {
    expect(ruleParseSchedule({ text: '15일에 관리비 나가', today }).items[0]).toMatchObject({ amount: null, direction: 'out' });
  });
});

describe('추출 결과 검증', () => {
  it('원문에 없는 금액은 버린다', () => {
    const input = { text: '스벅 6,800원', today };
    expect(extractionGrounded('parseSpend', input, { items: [{ amount: 6800 }] })).toBe(true);
    expect(extractionGrounded('parseSpend', input, { items: [{ amount: 7000 }] })).toBe(false);
  });
  it('만원 단위도 원문 숫자로 인정', () => {
    expect(amountsInText('월세 35만원').has(350_000)).toBe(true);
    expect(amountsInText('5만 5천원').has(55_000)).toBe(true);
  });
  it('서버는 받은 문장을 한 번 더 가린다', () => {
    const raw = '우리은행 출금 110-432-987654 보낸분 김지현 350,000원';
    const out = sanitizeInput('parseSpend', { text: raw, today }) as { text: string };
    expect(out.text).toBe(maskText(raw).text);
    expect(out.text).not.toContain('김지현');
    expect(out.text).not.toContain('987654');
  });
});
