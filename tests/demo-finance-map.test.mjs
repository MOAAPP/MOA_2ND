import test from 'node:test';
import assert from 'node:assert/strict';
import { mapDemoSnapshot, DEMO_AS_OF } from '../integration/demoFinanceMap.ts';

const home = { user_id: 'S01', as_of_date: DEMO_AS_OF,
  is_synthetic: true, available_cash: 27800 };
const ledger = {
  user_id: 'S01', as_of_date: DEMO_AS_OF, total: 7,
  transactions: [
    { id: 'S01-1', user_id: 'S01', date: DEMO_AS_OF, kind: 'spend',
      status: 'confirmed_synthetic', logged: true, amount: 1500,
      name: '지하철', category: '교통', method: 'debit', occurred_at: 1793747940000 },
    { id: 'S01-2', user_id: 'S01', date: DEMO_AS_OF, kind: 'spend',
      status: 'confirmed_synthetic', logged: true, amount: 3000,
      name: '아이스 아메리카노', category: '카페', method: 'credit' },
    { id: 'S01-3', user_id: 'S01', date: DEMO_AS_OF, kind: 'income',
      status: 'confirmed_synthetic', logged: true, amount: 950000,
      name: '알바비', method: 'transfer' },
    { id: 'S01-4', user_id: 'S01', date: DEMO_AS_OF, kind: 'card_payment',
      status: 'confirmed_synthetic', amount: 100000, name: '카드 청구' },
    { id: 'S01-5', user_id: 'S01', date: DEMO_AS_OF, kind: 'transfer_self',
      status: 'confirmed_synthetic', direction: 'in', amount: 160000,
      name: '비상금 이체' },
    { id: 'S01-6', user_id: 'S01', date: '2026-11-05', kind: 'spend',
      status: 'confirmed_synthetic', amount: 5500, name: '미래 지출', future_scenario: true },
    { id: 'S01-7', user_id: 'S01', date: DEMO_AS_OF, kind: 'spend',
      status: 'confirmed_synthetic', logged: false, amount: 4400, name: '미확인 거래' },
  ],
};
const schedule = {
  user_id: 'S01', as_of_date: DEMO_AS_OF,
  schedules: [
    { id: 'S01-wage', user_id: 'S01', direction: 'in', name: '알바비', kind: 'salary',
      amount: 950000, day: 10, recurrence: 'monthly', status: 'scheduled' },
    { id: 'S01-side', user_id: 'S01', direction: 'in', name: '과외비', kind: 'side_income',
      amount: 120000, day: 19, recurrence: 'monthly', status: 'uncertain' },
    { id: 'S01-rent', user_id: 'S01', direction: 'out', name: '월세', kind: 'rent',
      amount: 350000, day: 25, essential: true, recurrence: 'monthly' },
    { id: 'S01-phone', user_id: 'S01', direction: 'out', name: '통신비', kind: 'phone',
      amount: 55000, day: 15, essential: true, recurrence: 'monthly' },
  ],
  pending_card_liabilities: [
    { id: 'S01-future', user_id: 'S01', due_date: '2026-12-14',
      amount: 501300, status: 'scheduled_unpaid', future_scenario: true },
    { id: 'S01-due', user_id: 'S01', due_date: '2026-11-14',
      amount: 99000, status: 'scheduled_unpaid', future_scenario: false },
  ],
};

test('authoritative S01 balance, salary, schedule and observed ledger are mapped together', () => {
  const s = mapDemoSnapshot('S01', home, ledger, schedule);
  assert.equal(s.balance, 27800);
  assert.equal(s.salary, 950000);
  assert.equal(s.payday, 10);
  assert.deepEqual(s.bills.map(x => x.amount), [350000, 55000, 99000]);
  assert.equal(s.txs.length, 3);
  assert(s.txs.every(t => t.sample === true && t.balanceApplied === false));
  assert.equal(s.txs.find(t => t.id === 'S01-2')?.category, '카페/간식');
  assert.match(s.txs.find(t => t.id === 'S01-2')?.payment || '', /신용카드/);
  assert(!s.txs.some(t => ['S01-4', 'S01-5', 'S01-6', 'S01-7'].includes(t.id)));
});

test('reject cross-user and stale snapshot data rather than mixing the display', () => {
  assert.throws(() => mapDemoSnapshot('S08', home, ledger, schedule), /mismatch/);
  assert.throws(() => mapDemoSnapshot('S01', { ...home, as_of_date: '2026-11-03' }, ledger, schedule), /mismatch/);
  assert.throws(() => mapDemoSnapshot('S01', { ...home, is_synthetic: false }, ledger, schedule), /mismatch/);
  assert.throws(() => mapDemoSnapshot('S01', home, { ...ledger,
    transactions: [{ ...ledger.transactions[0], user_id: 'S02' }, ...ledger.transactions.slice(1)] }, schedule), /cross_user/);
});

test('reject incomplete list instead of silently leaving missing transactions', () => {
  assert.throws(() => mapDemoSnapshot('S01', home, { ...ledger, total: 99 }, schedule), /partial/);
});

test('support the other demo persona when all three endpoints agree', () => {
  const change = obj => ({ ...obj, user_id: 'S08' });
  const s = mapDemoSnapshot('S08', change({ ...home, available_cash: 116200 }),
    { ...change(ledger), transactions: ledger.transactions.map(change) },
    { ...change(schedule), schedules: schedule.schedules.map(change),
      pending_card_liabilities: schedule.pending_card_liabilities.map(change) });
  assert.equal(s.balance, 116200);
  assert.equal(s.txs.length, 3);
});
