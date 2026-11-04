import { describe, expect, it } from 'vitest';
import { addDays } from '../shared/dates';
import { appDay, appNow, DEMO_END_DAY, DEMO_SNAPSHOT_DAY } from '../src/lib/appClock';
import { seedDemoState } from '../src/lib/demoSeed';
import { initialState } from '../src/state/store';
import { saveChoice } from '../src/lib/decisionSave';
import { walletSummary } from '../src/lib/worldWallet';
import { assessRisk } from '../src/lib/moa/risk';
import { pendingBills } from '../src/lib/moa/ledger';
import { catchUp, bankContext } from '../src/lib/bank/sync';
import { emptyBank } from '../src/lib/bank/engine';

const DATE = '2026-11-04';
const state = () => seedDemoState(initialState(), Date.parse('2026-11-20T10:00:00+09:00'));

describe('unified 2026-11-04 S01 presentation day', () => {
  it('never rolls with the real device clock or treats unobserved future balances as actual', () => {
    const s = state();
    expect(s.demoDay).toBe(DEMO_SNAPSHOT_DAY);
    expect(appDay(s, new Date('2026-12-10T09:30:00+09:00'))).toBe(DATE);
    expect(appNow(s)).toBe(Date.parse(DATE + 'T23:59:00+09:00'));
    expect(s.moa.anchor?.balance).toBe(27800);
    expect(s.profile?.baseBalance).toBe(27800);
    expect(s.worldWallet.cash).toBe(27800);
    expect(s.spendLog.filter(x => x.date === DATE)).toHaveLength(5);
    expect(s.spendLog.filter(x => x.date === DATE).reduce((a, x) => a + x.amount, 0)).toBe(31000);
    expect(walletSummary(s.worldWallet).protectedBills).toBe(486000);
  });

  it('advancing the clock keeps all previous spending without importing future oracle observations', () => {
    const old = state();
    const later = { ...old, demoDay: addDays(DATE, 1) };
    expect(appDay(later)).toBe('2026-11-05');
    expect(later.spendLog.filter(x => x.date === '2026-11-05')).toHaveLength(0);
    expect(later.spendLog.filter(x => x.date === DATE)).toHaveLength(5);
    expect(later.moa.anchor?.balance).toBe(old.moa.anchor?.balance);
    expect(later.moa.anchor?.at).toBe(old.moa.anchor?.at);
    expect(assessRisk(later.moa, appNow(later), appDay(later)).today).toBe('2026-11-05');
    const december = { ...old, demoDay: '2026-12-01' };
    expect(appDay(december)).toBe('2026-12-01');
    expect(december.spendLog.filter(x => x.date === DATE)).toHaveLength(5);
    expect(appDay({ ...old, demoDay: '2027-01-01' })).toBe(DEMO_END_DAY);
    expect(appDay({ demo: false, demoDay: DATE }, new Date('2026-11-05T09:00:00+09:00'))).toBe('2026-11-05');
  });

  it('the risk report comes from the actual account engine, not a hardcoded UI amount', () => {
    const s = state();
    const risk = assessRisk(s.moa, appNow(s), appDay(s));
    expect(risk.anchorBalance).toBe(s.profile?.baseBalance);
    const insurance = risk.payments.find(p => p.date === '2026-11-08' && p.name.includes('보험'));
    expect(insurance).toBeDefined();
    expect(insurance?.shortBy).toBeGreaterThan(0);
  });
});

describe('choosing and saving without double-counting', () => {
  const decision = (paid: number) => ({
    id: 'ux-test-' + paid, title: '비교용 지출', price: 120000, paid,
    choice: paid ? 'buy' as const : 'wait' as const,
    at: Date.parse('2026-11-04T19:00:00+09:00'),
    note: 'test synthetic choice', simulatedOnly: true,
  });
  it('a compare-only action has no side effects; saved delay/hold has no spending entry', () => {
    const s = state();
    const d = saveChoice(s, { decision: decision(0), paid: 0, date: DATE,
      name: '비교용 지출', category: '기타', method: 'debit' });
    expect(d?.spendLog.length).toBe(s.spendLog.length);
    expect(d?.moa.txns.length).toBe(s.moa.txns.length);
    expect(d?.worldWallet.decisions.length).toBe(s.worldWallet.decisions.length + 1);
    expect(s.worldWallet.decisions).toHaveLength(13);
  });
  it('one saved debit creates one shared ledger ID and correct EOD account adjustment', () => {
    const s = state();
    const d = saveChoice(s, { decision: decision(6500), paid: 6500, date: DATE,
      name: '비교용 지출', category: '식비', method: 'debit' });
    expect(d).not.toBeNull();
    expect(d!.spendLog.length).toBe(s.spendLog.length + 1);
    expect(d!.moa.txns.length).toBe(s.moa.txns.length + 1);
    expect(d!.profile?.baseBalance).toBe(21300);
    expect(d!.moa.anchor?.balance).toBe(21300);
    expect(d!.worldWallet.cash).toBe(s.worldWallet.cash);
    const added = d!.spendLog.at(-1)!;
    expect(d!.moa.txns.some(t => t.id === added.txnId)).toBe(true);
  });
  it('a saved credit purchase increases future card due but not current payment-account cash', () => {
    const s = state();
    // A November purchase joins the December 14 bill, not October's November bill.
    const before = pendingBills(s.moa).find(b => b.date === '2026-12-14')?.amount ?? 0;
    const d = saveChoice(s, { decision: decision(100000), paid: 100000, date: DATE,
      name: '비교용 지출', category: '쇼핑', method: 'credit' });
    expect(d).not.toBeNull();
    expect(d!.moa.anchor?.balance).toBe(s.moa.anchor?.balance);
    expect(d!.worldWallet.cash).toBe(s.worldWallet.cash);
    const after = pendingBills(d!.moa).find(b => b.date === '2026-12-14')!.amount;
    expect(after).toBe(before + 100000);
    expect(d!.spendLog.length).toBe(s.spendLog.length + 1);
  });
});

describe('bank maturity simulation does not invent a duplicate S01 payday', () => {
  it('can advance date without reapplying fake 530,000 KRW first-of-month bills', () => {
    const s = state();
    const b = { ...emptyBank(), lastProcessed: '2026-11-04' };
    const res = catchUp(b, s.worldWallet, bankContext(s),
      new Date('2026-12-01T23:59:00+09:00'), false);
    expect(res?.paydays).toBe(0);
    expect(res?.wallet.cash).toBe(s.worldWallet.cash);
    expect(res?.wallet.movements.filter(m => m.id === 'bills-2026-12-01')).toHaveLength(0);
  });
});
