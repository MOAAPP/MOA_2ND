import { describe, expect, it } from 'vitest';
import { demoSetupPreview, DEMO_FIXTURE_VERSION, seedDemoState } from '../src/lib/demoSeed';
import { initialState } from '../src/state/store';
import { pendingBills } from '../src/lib/moa/ledger';

const NOW = Date.parse('2026-11-04T16:02:00+09:00');

describe('first-use setup: one-tap fully populated synthetic S01', () => {
  it('shows a meaningful source-backed account preview instead of a blank zero balance', () => {
    const p = demoSetupPreview(NOW);
    expect(p.date).toBe('2026-11-04');
    expect(p.balance).toBe(27_800);
    expect(p.rentAmount).toBe(350_000);
    expect(p.rentDay).toBe(25);
    expect(p.salaryAmount).toBe(950_000);
    expect(p.salaryDay).toBe(10);
    expect(p.nextCardAmount).toBe(347_000);
    expect(p.nextCardDate).toBe('2026-11-14');
    expect(p.expenseCountToday).toBeGreaterThanOrEqual(5);
    expect(p.totalRecordedExpenses).toBeGreaterThanOrEqual(55 * 5);
    expect(p.scheduleCount).toBeGreaterThanOrEqual(7);
    expect(p.cardCount).toBeGreaterThanOrEqual(2);
  });

  it('loads the same complete records across profile, ledger, risk and parallel world', () => {
    const state = seedDemoState(initialState(), NOW);
    const preview = demoSetupPreview(NOW);
    expect(state.introSeen).toBe(true);
    expect(state.demo).toBe(true);
    expect(state.demoFixtureVersion).toBe(DEMO_FIXTURE_VERSION);
    expect(state.profile?.baseBalance).toBe(preview.balance);
    expect(state.moa.anchor?.balance).toBe(preview.balance);
    expect(state.worldWallet.cash).toBe(preview.balance);
    expect(state.spendLog.filter(x=>x.date === preview.date)).toHaveLength(preview.expenseCountToday);
    expect(state.moa.txns.filter(x=>x.date === preview.date && x.kind === 'spend' && !x.essential)).toHaveLength(preview.expenseCountToday);
    expect(state.profile?.items.find(x=>x.name==='월세')?.amount).toBe(preview.rentAmount);
    expect(state.moa.schedule.find(x=>x.name==='월세')?.amount).toBe(preview.rentAmount);
    expect(pendingBills(state.moa).find(x=>x.date===preview.nextCardDate)?.amount).toBe(preview.nextCardAmount);
    expect(state.worldWallet.fixedBills).toBe(
      state.moa.schedule.filter(x=>x.essential && x.direction === 'out').reduce((sum,x)=>sum+x.amount,0));
  });

  it('does not inject fictitious personal transactions unless sample mode is explicitly chosen', () => {
    const blank = initialState();
    expect(blank.demo).toBe(false);
    expect(blank.profile).toBeNull();
    expect(blank.moa.anchor).toBeNull();
    expect(blank.spendLog).toHaveLength(0);
    expect(blank.moa.txns).toHaveLength(0);
  });
});
