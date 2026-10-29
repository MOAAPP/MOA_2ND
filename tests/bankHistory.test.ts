import { describe, expect, it } from 'vitest';
import type { BankEvent, Settlement } from '../src/lib/bank/engine';
import { historyView } from '../src/lib/bank/history';

const ev = (on: string, type: BankEvent['type'], cash: number): BankEvent => ({ id: `${on}-${type}`, on, contractId: 'c1', type, cash, memo: type });

const events: BankEvent[] = [
  ev('2026-01-05', 'open', -100_000),
  ev('2026-02-05', 'autoPay', -100_000),
  ev('2026-03-05', 'missed', 0),
  ev('2026-03-20', 'pay', -50_000),
  ev('2026-07-05', 'mature', 253_318),
];
const settlement: Settlement = { principal: 250_000, interest: 3_920, tax: 602, net: 253_318, reason: 'maturity', on: '2026-07-05', appliedRate: 3.5 };

describe('계좌 거래내역 필터', () => {
  it('전체는 최신순, 합계는 순현금', () => {
    const v = historyView(events, 'all', settlement);
    expect(v.rows.map((r) => r.event.type)).toEqual(['mature', 'pay', 'missed', 'autoPay', 'open']);
    expect(v.total).toBe(253_318 - 250_000);
  });
  it('넣은 돈은 납입·자동이체·미납만, 합계는 넣은 원금', () => {
    const v = historyView(events, 'in', settlement);
    expect(v.count).toBe(4);
    expect(v.total).toBe(250_000);
  });
  it('받은 돈은 만기·해지만', () => {
    const v = historyView(events, 'out', settlement);
    expect(v.rows.map((r) => r.event.type)).toEqual(['mature']);
    expect(v.total).toBe(253_318);
  });
  it('이자는 정산 기준 세전·세금·세후(원 단위 정수)', () => {
    const v = historyView(events, 'interest', settlement);
    expect(v.rows[0].interest).toEqual({ gross: 3_920, tax: 602, net: 3_318 });
    expect(v.total).toBe(3_318);
    expect(Number.isInteger(v.total)).toBe(true);
  });
  it('정산 전에는 이자 내역이 비어 있음', () => {
    const v = historyView(events.slice(0, 4), 'interest');
    expect(v.count).toBe(0);
    expect(v.total).toBe(0);
  });
  it('원본 배열을 바꾸지 않음', () => {
    const copy = events.slice();
    historyView(events, 'all');
    expect(events).toEqual(copy);
  });
});
