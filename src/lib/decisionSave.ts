import { todayKST } from '../../shared/dates';
import type { AppState } from '../state/store';
import { appDay, appNow } from './appClock';
import { addTxnsChecked, type NewTxn } from './moa';
import { profileFromMoa, spendEntryOf } from './moa/bridge';
import { transactWorldWallet, type WorldDecision } from './worldWallet';

export interface SavedChoice {
  decision: WorldDecision;
  paid: number;
  date: string;
  name: string;
  category: string;
  method: 'debit' | 'credit';
}

/**
 * Save one explicit choice. Previewing a comparison never calls this.
 * For a demo, hypothetical choice effects are kept separate from the
 * payment-account balance, while an explicit purchase gets one real-world
 * ledger entry and one Moa transaction (same txn ID).
 */
export function saveChoice(state: AppState, input: SavedChoice): AppState | null {
  const wallet = transactWorldWallet(state.worldWallet, {
    type: 'spend', decision: input.decision,
  });
  if (!wallet) return null;
  if (input.paid <= 0) return { ...state, worldWallet: wallet };

  const { date, paid, method, name, category } = input;
  const stamp = state.demo && date === appDay(state)
    ? appNow(state) - 1000
    : date === todayKST()
      ? Date.now()
      : Date.parse(date + 'T12:00:00+09:00');
  const txn: NewTxn = {
    occurredAt: stamp,
    date,
    amount: paid,
    kind: 'spend',
    method,
    account: method === 'credit' ? 'other' : 'pay',
    cardId: state.moa.cards.find(c => c.kind === (method === 'credit' ? 'credit' : 'debit'))?.id,
    name, category, essential: false, source: 'manual',
  };
  const result = addTxnsChecked(state.moa, [txn]);
  if (!result.added.length) return null;

  let moa = result.state;
  // The seeded anchor represents an already-reconciled end-of-day balance.
  // Recording an additional debit on that day updates B0 exactly once.
  // Credit purchase is billed on its actual later settlement date instead.
  const sameAnchorDay = moa.anchor && date === todayKST(new Date(moa.anchor.at));
  if (state.demo && sameAnchorDay && method === 'debit' && moa.anchor) {
    moa = {
      ...moa,
      anchor: { ...moa.anchor, balance: moa.anchor.balance - paid },
    };
  }
  const entries = result.added
    .map(spendEntryOf)
    .filter((entry): entry is NonNullable<typeof entry> => entry !== null);

  return {
    ...state,
    worldWallet: wallet,
    moa,
    profile: state.profile ? profileFromMoa(moa, state.profile) : state.profile,
    spendLog: [...state.spendLog, ...entries],
  };
}
