/** One DB-free, deterministic synthetic fixture shared by ledger, payment risk and virtual assets.
 *  All future dates are DEMO SCENARIOS, not real observed user data.
 *  At any real current time, the UI includes only events that have happened by that time.
 */
import raw from '../data/moa92.json';
import { todayKST } from '../../shared/dates';
import { WORLD_FIXED_BILLS, WORLD_MONTHLY_INCOME, WORLD_START_CASH, type WorldDecision, type WorldMovement, type WorldWallet } from './worldWallet';
import { emptyMoa, type MoaSchedule, type MoaState, type Txn } from './moa/types';
import type { DecisionRecord, Profile } from './types';
import type { SpendEntry } from './ml/types';
import type { InvestJournal } from './fundedInvest';
import type { Fill, Order } from './trading';

type SourceTxn = {
  id: string; date: string; at_kst: string; kind: 'spend' | 'income' | 'fixed_bill' | 'card_payment';
  category: string; merchant: string; amount_krw: number; method: Txn['method'];
  account: Txn['account']; essential: number; recorded: number; bank_delta_krw: number; card_id: string;
};
type SourceChoice = {
  id: string; date: string; at_kst: string; item: string; category: string;
  original_price_krw: number; paid_krw: number; choice: 'buy'|'wait'|'alternative';
};
type SourceTrade = {
  id: string; date: string; at_kst: string; code: string; stock_name: string;
  side: 'buy'|'sell'; qty: number; price_krw: number; amount_krw: number;
};
type SourceSchedule = {
  id: string; name: string; direction: MoaSchedule['direction']; amount: number;
  recurrence: 'monthly'; day: number; essential: boolean; status?: 'scheduled';
};
type SourceData = {
  start: string; end: string; as_of: string; start_cash_krw: number;
  profile: { minBalance: number; dailySpend: number; goal: Profile['goal'] };
  cards: MoaState['cards']; schedule: SourceSchedule[];
  transactions: SourceTxn[]; choices: SourceChoice[]; investments: SourceTrade[];
};
const data: SourceData = raw as unknown as SourceData;
const toMs = (at: string) => Date.parse(at);
const visible = (at: string, now: number) => toMs(at) <= now;
const knownTransactions = (now: number) => data.transactions.filter((t) => visible(t.at_kst, now));
const recordedTransactions = (now: number) => knownTransactions(now).filter((t) => t.recorded === 1);
const monthDates = ['2026-10-01', '2026-11-01', '2026-12-01'];

export const COMMON_DEMO_PERIOD = { start: data.start, end: data.end, reference: data.as_of, synthetic: true } as const;

/** Bank balance after ALL synthetic cash movements, including intentionally unlogged purchases.
 *  This is a manually supplied synthetic anchor, NOT inferred from the ledger's completeness. */
export function demoCashBalance(now = Date.now()): number {
  return data.start_cash_krw + knownTransactions(now).reduce((sum, t) => sum + t.bank_delta_krw, 0);
}

export function demoData(now = Date.now()): { profile: Profile; records: DecisionRecord[]; spendLog: SpendEntry[] } {
  const today = todayKST(new Date(now));
  const profile: Profile = {
    baseBalance: demoCashBalance(now), baseDate: today, baseSetAt: now,
    minBalance: data.profile.minBalance, dailySpend: data.profile.dailySpend,
    items: data.schedule.map((s) => ({
      id: s.id, kind: s.direction === 'in' ? 'income' as const : 'expense' as const,
      name: s.name, amount: s.amount, recurrence: s.recurrence, day: s.day,
    })),
    reflectedOnBaseDate: [],
    goal: data.profile.goal,
  };
  const spendLog: SpendEntry[] = recordedTransactions(now).filter((t) => t.kind === 'spend').map((t) => ({
    date: t.date, amount: t.amount_krw, category: t.category,
    name: t.merchant, from: 'demo', txnId: t.id,
  }));
  // Only skipped decisions: 'buy' decisions already appear in daily spending and
  // must never be duplicated by spendHistory(records, spendLog, today).
  const records: DecisionRecord[] = data.choices.filter((c) => visible(c.at_kst, now) && c.choice === 'wait').map((c) => ({
    id: c.id, createdAt: toMs(c.at_kst), source: 'decide',
    category: c.category, name: c.item,
    choice: 'skip', choiceAt: toMs(c.at_kst), reflectedOverride: true,
    inParallel: false, parallelAs: 'buy', params: { amount: c.original_price_krw, date: c.date },
  }));
  return { profile, records, spendLog };
}

export function demoMoa(now = Date.now()): MoaState {
  const txns: Txn[] = recordedTransactions(now).map((t) => ({
    id: t.id, date: t.date, occurredAt: toMs(t.at_kst), createdAt: toMs(t.at_kst),
    amount: t.amount_krw, kind: t.kind === 'fixed_bill' ? 'spend' : t.kind,
    method: t.method, account: t.account,
    ...(t.card_id ? { cardId: t.card_id } : {}),
    name: t.merchant, category: t.category, essential: !!t.essential, source: 'demo',
    // Historical data is behind the current snapshot anchor, not replayed.
  }));
  return {
    ...emptyMoa(),
    anchor: { balance: demoCashBalance(now), at: now, source: 'manual', reflected: [] },
    cards: data.cards,
    schedule: data.schedule.map((s) => ({ ...s, status: s.status ?? undefined })),
    txns, dayStatus: {}, mainMethod: 'debit',
  };
}

export function demoWorldWallet(now = Date.now()): WorldWallet {
  const decisions: WorldDecision[] = data.choices.filter((c) => visible(c.at_kst, now)).map((c) => ({
    id: c.id, title: c.item, price: c.original_price_krw, paid: c.paid_krw,
    choice: c.choice, at: toMs(c.at_kst), note: '',
  }));
  const movements: WorldMovement[] = [];
  for (const d of monthDates) {
    const at = Date.parse(d + 'T00:00:00+09:00');
    if (at > now) break;
    movements.push(
      { id: `bills-${d}`, kind: 'bills', amount: WORLD_FIXED_BILLS, at, memo: `${Number(d.slice(5,7))}월 고정지출 결제` },
      { id: `income-${d}`, kind: 'income', amount: WORLD_MONTHLY_INCOME, at: at+1, memo: `${Number(d.slice(5,7))}월 알바비 입금` },
    );
  }
  // Virtual savings, separate from the observed payment account.
  for (const d of ['2026-10-02', '2026-11-03', '2026-12-02']) {
    const at = Date.parse(d + 'T10:00:00+09:00');
    if (at <= now) movements.push({ id: `moa92-save-${d}`, kind: 'save', amount: 35_000, at, memo: '평행세계 자유 저축' });
  }
  const etfs: WorldWallet['etfs'] = {};
  for (const t of data.investments.filter((t) => visible(t.at_kst, now))) {
    const current = etfs[t.code] ?? { qty: 0, cost: 0 };
    const newQty = t.side === 'buy' ? current.qty + t.qty : current.qty - t.qty;
    if (newQty < 0) throw new Error('Synthetic sell without shares: ' + t.id);
    if (newQty === 0) delete etfs[t.code];
    else etfs[t.code] = t.side === 'buy'
      ? { qty: newQty, cost: current.cost + t.amount_krw }
      : { qty: newQty, cost: Math.round(current.cost * newQty / current.qty) };
    movements.push({
      id: t.id, kind: t.side === 'buy' ? 'buyStock' : 'sellStock', at: toMs(t.at_kst),
      amount: t.amount_krw, code: t.code, qty: t.qty,
      memo: `${t.stock_name} ${t.qty}주 ${t.side === 'buy' ? '가상 매수' : '가상 매도'}`,
    });
  }
  movements.sort((a, b) => a.at - b.at);
  const inKinds = new Set<WorldMovement['kind']>(['income','withdraw','redeemDeposit','cancelInstallment','sellStock']);
  const cashDelta = movements.reduce((sum, m) => sum + (inKinds.has(m.kind) ? m.amount : -m.amount), 0);
  const cash = WORLD_START_CASH + cashDelta - decisions.reduce((sum, d) => sum + d.paid, 0);
  const savings = movements.filter((m) => m.kind === 'save').reduce((sum, m) => sum + m.amount, 0);
  return { cash, savings, deposit: 0, installment: 0, etfs, movements, decisions };
}

/** Historical simulated buys and sells are shown in the same order history as new user trades.
 *  No extra 10,000,000 KRW portfolio or market/live-price claim is created. */
export function demoInvestmentJournal(now = Date.now()): InvestJournal {
  const rows = data.investments.filter((t) => visible(t.at_kst, now));
  const orders: Order[] = rows.map((t) => ({
    id: t.id, code: t.code, name: t.stock_name, side: t.side,
    type: 'market', qty: t.qty, status: 'filled', validDay: t.date,
    createdAt: toMs(t.at_kst), filledAt: toMs(t.at_kst),
    fillPrice: t.price_krw, fillBasis: 'market',
    note: '3개월 합성 데이터 체결 예시 · 실제 주문 아님',
  }));
  const fills: Fill[] = rows.map((t) => ({
    id: t.id + '-fill', orderId: t.id, code: t.code, name: t.stock_name,
    side: t.side, qty: t.qty, price: t.price_krw,
    time: toMs(t.at_kst), cashAfter: demoWorldWallet(toMs(t.at_kst)).cash,
    basis: 'market',
  })).reverse();
  return { orders, fills, watchlist: ['360750','069500'] };
}

export function isEmptyWorld(w: WorldWallet): boolean {
  return (w.decisions?.length ?? 0) === 0
    && !(w.movements ?? []).some((m) => m.kind !== 'income' && m.kind !== 'bills');
}
