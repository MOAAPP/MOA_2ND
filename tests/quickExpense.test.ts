import { describe, expect, it } from 'vitest';
import { parseQuickExpense } from '../src/lib/quickExpense';

describe('one-line ledger entry', () => {
  it('accepts everyday Korean quick spending without an AI call', () => {
    expect(parseQuickExpense('커피 4,500원')).toEqual({ name: '커피', amount: 4500 });
    expect(parseQuickExpense('점심 12000')).toEqual({ name: '점심', amount: 12000 });
    expect(parseQuickExpense('지하철 1,500')).toEqual({ name: '지하철', amount: 1500 });
    expect(parseQuickExpense('5천 택시')).toEqual({ name: '택시', amount: 5000 });
    expect(parseQuickExpense('치킨 1.5만원')).toEqual({ name: '치킨', amount: 15000 });
    expect(parseQuickExpense('아이폰 16 케이스 9,900원')).toEqual({ name: '아이폰 16 케이스', amount: 9900 });
  });
  it('never silently parses multi-line bank SMS or unbounded/invalid amounts', () => {
    expect(parseQuickExpense('')).toBeNull();
    expect(parseQuickExpense('스타벅스')).toBeNull();
    expect(parseQuickExpense('커피 0원')).toBeNull();
    expect(parseQuickExpense('커피 10000001원')).toBeNull();
    expect(parseQuickExpense('하나카드\n승인 5800원\n잔액 40000원')).toBeNull();
  });
});
