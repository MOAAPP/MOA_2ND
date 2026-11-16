/**
 * USER mode only. Anonymous numeric financial inputs -> stateless Python API.
 * Never send personal names, bank IDs, merchant titles, SMS, or past ledger.
 * Never use S01/S08 for personal results. Explicitly mark rule-based (not ML/LLM).
 */
export type PersonalState = {
  finance: { balance: number; minBalance: number; salary: number };
  profile: { payday: number; monthlyBudget: number };
  bills: Array<{ day: number; amount: number; kind: string; name?: string }>;
  txs: Array<{
    date: string; type: 'expense' | 'income' | 'transfer';
    amount: number; payment: string; sample?: boolean; title?: string;
  }>;
};
export type PersonalSnapshot = {
  as_of: string;
  balance: number;
  minimum_balance: number;
  monthly_income: number;
  payday: number;
  monthly_variable_budget: number;
  bills: Array<{
    day: number; amount: number;
    kind: 'card' | 'rent' | 'phone' | 'subscription' | 'loan' | 'etc';
  }>;
  planned_transactions: Array<{
    date: string; amount: number;
    kind: 'income' | 'expense' | 'transfer';
    payment_method: 'debit' | 'transfer' | 'credit' | 'cash';
  }>;
};
export type PersonalPath = {
  scenario_id: 'purchase_now' | 'no_purchase' | 'purchase_delay' |
    'virtual_savings' | 'virtual_investment' | 'mixed';
  status: 'calculated' | 'out_of_horizon';
  available_cash: number;
  ending_balance: number;
  minimum_balance: number;
  minimum_balance_met: boolean;
  essential_payments_covered: boolean;
  first_shortfall_date: string | null;
  daily_cashflow: Array<{ date: string; closing_balance: number; lowest_balance: number }>;
};
export type PersonalResponse = {
  source: 'user_entered_hypothetical';
  calculator: 'python_finance_cashflow_rules';
  as_of: string;
  available_cash: number;
  minimum_required_balance: number;
  purchase_amount: number;
  horizon_days: number;
  payment_method: string;
  forecast_source: string;
  inputs_not_saved: true;
  warnings: string[];
  paths: PersonalPath[];
};
export type PersonalProjection = {
  boughtNow: number; keptNow: number;
  boughtEnd: number; keptEnd: number; delta: number;
  points: Array<{ day: number; date: string; bought: number; kept: number }>;
  boughtRisk: string | null; keptRisk: string | null;
  payment: string; actual: 'demo'; isDemo: true;
  origin: 'personal_user_input_python';
};
export type PersonalGoal = {
  source: 'personal_rules_not_llm';
  as_of: string;
  target_amount: number;
  goal_type: 'purchase' | 'savings' | 'investment';
  horizon_days: number;
  evaluated_count: number; valid_count: number;
  routes: PersonalPath[];
  rejection_counts: Record<string, number>;
  confirmations_required: string[];
  warnings: string[];
  inputs_not_saved: true;
};
const kinds = new Set(['card', 'rent', 'phone', 'subscription', 'loan', 'etc']);
const allIds: PersonalPath['scenario_id'][] = [
  'purchase_now','no_purchase','purchase_delay',
  'virtual_savings','virtual_investment','mixed',
];
function dateAt(asOf: string, offset: number): string {
  const d = new Date(asOf + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0,10);
}
function bankMethod(p: string): PersonalSnapshot['planned_transactions'][number]['payment_method'] {
  if (/신용카드|credit/i.test(p)) return 'credit';
  if (/현금/.test(p)) return 'cash';
  if (/계좌이체|transfer/i.test(p)) return 'transfer';
  return 'debit';
}
/** DO NOT upload merchant labels, card IDs or old transactions! */
export function buildPersonalSnapshot(s: PersonalState, asOf: string): PersonalSnapshot {
  const money = (v: number, max: number) => {
    if (!Number.isSafeInteger(v) || v < 0 || v > max) throw new Error('personal_invalid_finance_input');
    return v;
  };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) ||
      !Number.isInteger(s.profile.payday) || s.profile.payday < 1 || s.profile.payday > 31)
    throw new Error('personal_invalid_date_or_payday');
  const bills = s.bills.map(b => {
    if (!Number.isInteger(b.day) || b.day < 1 || b.day > 31 ||
        !kinds.has(b.kind)) throw new Error('personal_invalid_bill');
    return { day: b.day, amount: money(b.amount, 100_000_000),
      kind: b.kind as PersonalSnapshot['bills'][number]['kind'] };
  });
  // The ZIP supplies a *default* 500,000 KRW monthly budget even before the
  // user edits it. Do not present that fixture as a user spending forecast.
  // A confirmed budgeting control can be wired separately in the next phase.
  const planned_transactions = s.txs.filter(t => !t.sample && t.date > asOf)
    .map(t => ({
      date: t.date, amount: money(t.amount, 100_000_000),
      kind: t.type, payment_method: bankMethod(t.payment),
    }));
  if (bills.length > 60 || planned_transactions.length > 120)
    throw new Error('personal_too_many_entries');
  return {
    as_of: asOf,
    balance: money(s.finance.balance, 10_000_000_000),
    minimum_balance: money(s.finance.minBalance, 10_000_000_000),
    monthly_income: money(s.finance.salary, 100_000_000),
    payday: s.profile.payday,
    monthly_variable_budget: 0,
    bills, planned_transactions,
  };
}

function ensureResponse(result: PersonalResponse, snapshot: PersonalSnapshot,
                        amount: number, horizon: number): void {
  if (result.source !== 'user_entered_hypothetical' ||
      result.calculator !== 'python_finance_cashflow_rules' ||
      result.as_of !== snapshot.as_of ||
      result.available_cash !== snapshot.balance ||
      result.minimum_required_balance !== snapshot.minimum_balance ||
      result.purchase_amount !== amount || result.horizon_days !== horizon ||
      result.inputs_not_saved !== true || !Array.isArray(result.paths) ||
      result.paths.length !== 6) throw new Error('personal_backend_snapshot_mismatch');
  const seen = new Set();
  for (const path of result.paths) {
    if (!allIds.includes(path.scenario_id) || seen.has(path.scenario_id) ||
        path.available_cash !== snapshot.balance ||
        !['calculated','out_of_horizon'].includes(path.status) ||
        !Number.isSafeInteger(path.minimum_balance) ||
        !Number.isSafeInteger(path.ending_balance) ||
        !Array.isArray(path.daily_cashflow) || path.daily_cashflow.length !== horizon)
      throw new Error('personal_backend_invalid_paths');
    seen.add(path.scenario_id);
    path.daily_cashflow.forEach((d,i) => {
      if (d.date !== dateAt(snapshot.as_of, i + 1) ||
          !Number.isSafeInteger(d.closing_balance) ||
          !Number.isSafeInteger(d.lowest_balance))
        throw new Error('personal_backend_invalid_daily_values');
    });
    if (path.ending_balance !== path.daily_cashflow[horizon - 1].closing_balance)
      throw new Error('personal_backend_invalid_ending_balance');
  }
}
export function mapPersonalComparison(
  result: PersonalResponse, snapshot: PersonalSnapshot,
  amount: number, horizon: 7 | 30 | 90,
): PersonalProjection {
  ensureResponse(result, snapshot, amount, horizon);
  const buy = result.paths.find(p => p.scenario_id === 'purchase_now')!;
  const no = result.paths.find(p => p.scenario_id === 'no_purchase')!;
  if (buy.status !== 'calculated' || no.status !== 'calculated')
    throw new Error('personal_backend_invalid_purchase_status');
  const ticks = [...new Set([0, Math.floor(horizon/4), Math.floor(horizon/2),
    Math.floor(horizon*3/4), horizon])];
  return {
    boughtNow: snapshot.balance, keptNow: snapshot.balance,
    boughtEnd: buy.ending_balance, keptEnd: no.ending_balance,
    delta: no.ending_balance - buy.ending_balance,
    points: ticks.map(day => ({
      day, date: dateAt(snapshot.as_of, day),
      bought: day ? buy.daily_cashflow[day - 1].closing_balance : snapshot.balance,
      kept: day ? no.daily_cashflow[day - 1].closing_balance : snapshot.balance,
    })),
    boughtRisk: buy.first_shortfall_date,
    keptRisk: no.first_shortfall_date,
    payment: '체크카드·계좌이체 (즉시 출금)',
    actual: 'demo', isDemo: true,
    origin: 'personal_user_input_python',
  };
}
async function post<T>(path: string, body: unknown, signal: AbortSignal): Promise<T> {
  const res = await fetch('/api/v4/personal/' + path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body), signal, cache: 'no-store',
  });
  if (!res.ok) throw new Error('personal_backend_http_' + res.status);
  if (!(res.headers.get('content-type') || '').includes('application/json'))
    throw new Error('personal_backend_non_json');
  return await res.json() as T;
}
export async function comparePersonal(
  snapshot: PersonalSnapshot, amount: number, horizon: 7|30|90, signal: AbortSignal,
): Promise<PersonalProjection> {
  const raw = await post<PersonalResponse>('compare', {
    snapshot, purchase_amount: amount, horizon_days: horizon,
    payment_method: 'debit', purchase_delay_days: Math.min(30, horizon),
  }, signal);
  return mapPersonalComparison(raw, snapshot, amount, horizon);
}
/** Parse numeric target LOCALLY; never transmit free-form goals or notes. */
export function parsePersonalGoal(text: string):
  { amount: number; kind: PersonalGoal['goal_type'] } | null {
  const man = [...text.matchAll(/(\d+)\s*만\s*(?:(\d)\s*천)?\s*원?/g)];
  const val = man.length ? Number(man[0][1])*10000 + (man[0][2] ? Number(man[0][2])*1000 : 0)
    : Number((text.match(/(\d[\d,]{3,})\s*원/) || [])[1]?.replace(/,/g,'')) || 0;
  if (!Number.isSafeInteger(val) || val < 1000 || val > 100_000_000) return null;
  return { amount: val,
    kind: /ETF|투자|주식/i.test(text) ? 'investment'
      : /저축|모으|적금|목돈/i.test(text) ? 'savings' : 'purchase' };
}
export async function analyzePersonalGoal(
  snapshot: PersonalSnapshot,
  goal: { amount: number; kind: PersonalGoal['goal_type'] },
  signal: AbortSignal,
): Promise<PersonalGoal> {
  const raw = await post<PersonalGoal>('goal-analyze', {
    snapshot, target_amount: goal.amount, goal_type: goal.kind,
    horizon_days: 30, investment_allowed: goal.kind === 'investment',
  }, signal);
  if (raw.source !== 'personal_rules_not_llm' ||
      raw.as_of !== snapshot.as_of || raw.target_amount !== goal.amount ||
      raw.goal_type !== goal.kind || raw.horizon_days !== 30 ||
      raw.inputs_not_saved !== true ||
      !Number.isInteger(raw.evaluated_count) ||
      !Number.isInteger(raw.valid_count) || raw.valid_count < 0 ||
      raw.valid_count > raw.evaluated_count ||
      !Array.isArray(raw.routes) ||
      raw.routes.length !== raw.valid_count)
    throw new Error('personal_backend_goal_mismatch');
  return raw;
}
