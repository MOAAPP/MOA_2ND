/**
 * One shared set of synthetic observation records for demo / frontend.
 * Future truth lives in datasets/moa-fall-2026 and is NEVER imported here.
 */
import data from '../data/moa-fall-observed.json';
import { emptyMoa, type MoaCard, type MoaSchedule, type MoaState, type PayMethod, type Txn } from './moa/types';
import { profileFromMoa } from './moa/bridge';
import type { SpendEntry } from './ml/types';
import type { WorldDecision, WorldMovement, WorldWallet } from './worldWallet';

type ProfileRow = (typeof data.profiles)[number];
type TransactionRow = (typeof data.transactions)[number];

const at = (date: string, hour = 12) => Date.parse(date + 'T' + String(hour).padStart(2, '0') + ':00:00+09:00');
const cutoffAt = () => Date.parse(data.as_of + 'T23:59:59+09:00');
export const FALL_DATASET_ID = data.dataset_id;
export const FALL_DATASET_AS_OF = data.as_of;
export const fallDemoProfiles = () => data.profiles.map((p) => ({ id: p.user_id, title: p.segment, scenario: p.scenario }));

function transaction(row: TransactionRow): Txn {
  const method: PayMethod = row.method === 'credit' || row.method === 'cash' || row.method === 'debit' ? row.method : 'transfer';
  const kind: Txn['kind'] = row.kind === 'income' ? 'income' : row.kind === 'card_payment' ? 'card_payment' : row.kind === 'fixed' && row.category === '저축' ? 'saving' : 'spend';
  return {
    id: row.id, occurredAt: row.occurred_at, date: row.date, amount: row.amount_krw,
    kind, method, account: method === 'credit' ? 'other' : method === 'cash' ? 'cash' : 'pay',
    cardId: method === 'credit' || row.kind === 'card_payment' ? 'fall-credit' : method === 'debit' ? 'fall-debit' : undefined,
    name: row.name, category: row.category, essential: row.essential,
    source: 'demo', createdAt: row.occurred_at,
    scheduleRef: row.kind === 'fixed'
      ? (data.profiles.find((p) => p.user_id === row.user_id)?.schedule.find((x) => x.direction === 'out' && x.name === row.name)?.id ?? '') + ':' + row.date
      : undefined,
  };
}

function makeWorldWallet(person: ProfileRow, rows: TransactionRow[]): WorldWallet {
  // Ledger events and virtual counterfactual decisions are distinct concepts.
  // The comparison is an explicitly fictional playthrough, not proof of real savings.
  const decisions: WorldDecision[] = rows.filter((r) => r.kind === 'spend' && !r.essential && r.method === 'debit')
    .filter((_, i) => i % 9 === 0).slice(-16)
    .map((r, i) => ({
      id: 'fall-choice-' + r.id, title: r.name, price: r.amount_krw,
      paid: i % 3 === 0 ? 0 : i % 3 === 1 ? Math.round(r.amount_krw * 0.65) : r.amount_krw,
      choice: i % 3 === 0 ? 'wait' : i % 3 === 1 ? 'alternative' : 'buy',
      at: r.occurred_at, note: '가상 소비 선택 비교용 시나리오',
    }));
  const movements: WorldMovement[] = rows.filter((r) =>
    r.kind === 'income' || r.kind === 'fixed' || r.kind === 'card_payment')
    .map((r) => ({
      id: 'fall-move-' + r.id, kind: r.kind === 'income' ? 'income' : 'bills',
      amount: r.amount_krw, at: r.occurred_at, memo: r.name,
    }));
  return { cash: person.balance_as_of, savings: 0, deposit: 0, installment: 0, etfs: {}, decisions, movements };
}

export function makeFallDemo(profileId = 'U03') {
  const person = data.profiles.find((p) => p.user_id === profileId) ?? data.profiles.find((p) => p.user_id === 'U03')!;
  const rows = data.transactions.filter((r) => r.user_id === person.user_id && r.date <= data.as_of && r.observed === 1)
    .sort((a, b) => a.occurred_at - b.occurred_at);
  const cards: MoaCard[] = [
    { id: 'fall-credit', name: '체험용 신용카드', kind: 'credit', linked: false, cutoffDay: 31, payDay: 14 },
    { id: 'fall-debit', name: '체험용 체크카드', kind: 'debit', linked: true },
  ];
  const schedule: MoaSchedule[] = person.schedule.map((x) => ({
    id: x.id, name: x.name, direction: x.direction as 'in' | 'out',
    amount: x.amount, recurrence: 'monthly', day: x.day,
    essential: x.essential,
    status: x.direction === 'in' ? 'scheduled' : undefined,
    saving: x.direction === 'out' && x.name.includes('적금'),
  }));
  const moa: MoaState = {
    ...emptyMoa(),
    anchor: { balance: person.balance_as_of, at: cutoffAt(), source: 'manual', reflected: [] },
    payAccountName: '가상 결제계좌',
    cards, schedule, txns: rows.map(transaction), dayStatus: {},
    mainMethod: 'debit',
  };
  const profile = { ...profileFromMoa(moa, null), dailySpend: person.daily_spend_prior, minBalance: 100_000 };
  const spendLog: SpendEntry[] = rows.filter((r) => r.kind === 'spend' && !r.essential)
    .map((r) => ({ date: r.date, name: r.name, amount: r.amount_krw, category: r.category, from: 'demo', txnId: r.id }));
  return { profile, spendLog, records: [], moa, worldWallet: makeWorldWallet(person, rows), demoProfileId: person.user_id };
}
