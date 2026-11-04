import { todayKST } from '../../shared/dates';
import { emptyBank } from './bank/engine';
import { demoData } from './demo';
import { demoWorldWalletFromShared } from './demoWorld';
import { emptyInvestJournal } from './fundedInvest';
import { pendingBills } from './moa/ledger';
import { demoMoa } from './moa/bridge';
import type { AppState } from '../state/store';

/**
 * Single entry point for the S01 presentation persona. The three screens
 * (home, account setup, and ledger) must not build independent fake balances.
 * Never invoke without an explicit "example" action or for actual user data.
 */
export const DEMO_FIXTURE_VERSION = 5;

export function seedDemoState(state: AppState, now = Date.now()): AppState {
  return {
    ...state,
    ...demoData(now),
    moa: demoMoa(now),
    worldWallet: demoWorldWalletFromShared(now),
    investJournal: emptyInvestJournal(state.investJournal.watchlist),
    bank: emptyBank(),
    demo: true,
    demoFixtureVersion: DEMO_FIXTURE_VERSION,
    introSeen: true,
    setupDraft: null,
  };
}

/** Preview numbers derived from exactly the S01 dataset loaded at demo entry. */
export function demoSetupPreview(now = Date.now()) {
  const date = todayKST(new Date(now));
  const { profile, spendLog } = demoData(now);
  const account = demoMoa(now);
  const rent = profile.items.find((x) => x.name === '월세' && x.kind === 'expense');
  const salary = profile.items.find((x) => x.kind === 'income' && x.name === '알바비');
  const nextBill = pendingBills(account).find((x) => x.date >= date);
  return {
    date,
    balance: profile.baseBalance,
    rentAmount: rent?.amount ?? null,
    rentDay: rent?.day ?? null,
    salaryAmount: salary?.amount ?? null,
    salaryDay: salary?.day ?? null,
    nextCardAmount: nextBill?.amount ?? null,
    nextCardDate: nextBill?.date ?? null,
    expenseCountToday: spendLog.filter((x) => x.date === date).length,
    totalRecordedExpenses: spendLog.length,
    scheduleCount: account.schedule.length,
    cardCount: account.cards.length,
  };
}
