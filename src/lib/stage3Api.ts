/** Stage-3 canonical FastAPI bridge. No numeric finance calculations in React. */
const origin = (import.meta.env.VITE_FINANCE_API_BASE ?? '').replace(/\/$/, '');
const root = origin ? `${origin}${origin.endsWith('/api/v4') ? '' : '/api/v4'}` : '/api/v4';

export class FinanceLoadError extends Error {
  constructor(public code: string, message: string) { super(message); this.name = 'FinanceLoadError'; }
}
async function request<T>(path: string, options: RequestInit = {}, valid: (item: unknown) => item is T): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${root}${path}`, { ...options,
      headers: { Accept: 'application/json', ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...options.headers } });
  } catch (e) {
    if (options.signal?.aborted) throw e;
    throw new FinanceLoadError('server_unreachable', 'FastAPI 연결에 실패했어요. 백엔드(127.0.0.1:8000)를 실행하고 다시 시도해 주세요.');
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = (data as { detail?: { code?: string; message?: string } | string } | null)?.detail;
    const code = typeof detail === 'object' ? detail?.code : undefined;
    const message = typeof detail === 'object' ? detail?.message : typeof detail === 'string' ? detail : undefined;
    throw new FinanceLoadError(code ?? (response.status === 503 ? 'dataset_unavailable' : response.status === 404 ? 'user_not_found' : 'api_error'), message ?? `금융 API 오류 ${response.status}`);
  }
  if (!valid(data)) throw new FinanceLoadError('schema_invalid', 'FastAPI 응답 스키마가 예상과 달라요. 프론트·백엔드 버전을 확인해 주세요.');
  return data;
}
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

export interface DemoDefault {
  user_id: string; display_name: string; as_of_date: string; observation_start: string;
  observation_end: string; data_source: string; is_synthetic: boolean; user_count: number;
}
export interface HomeEvent {
  id: string; debit_at: string; amount: number; label: string; kind: string;
  essential: boolean; payment_method: string; transaction_status: string;
}
export interface HomeDay {
  date: string; opening_balance: number; inflow: number; outflow: number;
  closing_balance: number; lowest_balance: number; events: HomeEvent[];
}
export interface HomeState {
  user_id: string; display_name: string; as_of_date: string;
  observation_start: string; observation_end: string; has_observation_on_date: boolean;
  financial_state_status: string; data_source: string; is_synthetic: boolean;
  current_account_id: string; available_cash: number; observed_transaction_count: number;
  recent_transactions: { id: string; name: string; date: string; kind: string; amount: number; method: string }[];
  upcoming_essential_payments: HomeEvent[]; upcoming_income: HomeEvent[];
  daily_cashflow: HomeDay[]; future_balances: Record<string, number>; minimum_balance: number;
  savings_goals: unknown[]; savings_goal_status: string;
  virtual_investments: { virtual_cash: number | null; positions: Record<string, { qty: number; cost_basis: number }>; status: string; actual_payment_account_impact: number };
  purchase_candidates: { id: string; date: string; main_product: { name: string; final_estimated_payment: number } }[];
  warnings: string[];
}
export interface Allocation { purchase: number; savings: number; investment: number; cash: number }
export interface CompareRequest {
  user_id: string; as_of: string; purchase_amount: number; horizon_days: number;
  purchase_date: string; purchase_delay_days: number; payment_method: 'debit'|'credit'|'transfer';
  credit_debit_date?: string;
  delayed_credit_debit_date?: string;
  savings_date?: string;
  savings_amount: number; savings_monthly_amount: number;
  savings_goal_target?: number; savings_goal_current: number;
  investment_amount: number; investment_code?: string;
  investment_return_percent: number; minimum_required_balance: number;
  virtual_sell_qty?: number; virtual_sell_unit_price?: number;
  virtual_sell_date?: string; virtual_sell_settlement_date?: string;
  stress: 'baseline'|'higher_spending'|'delayed_income'|'combined'|'investment_loss';
  allocation: Allocation;
}
export interface ScenarioEvent {
  event_id: string; scenario_id: string; user_id: string; event_type: string;
  effective_at: string; debit_at: string|null; account_id: string|null;
  payment_method: string; amount: number;
}
export interface ScenarioPath {
  scenario_id: string; label: string; status: string; events: ScenarioEvent[];
  available_cash: number; minimum_balance: number; first_shortfall_date: string | null;
  minimum_balance_met: boolean; essential_payments_covered: boolean;
  future_balances: Record<string, number>; daily_cashflow: (HomeDay & {
    savings_balance: number; investment_value: number; investment_profit_loss: number })[];
  virtual_savings: number; virtual_investment_value: number; virtual_investment_profit_loss: number;
  investment_quantity: number; investment_average_price: number|null;
  virtual_investment_realized_profit_loss: number;
  savings_goal_reached_date: string|null; purchase_completed: boolean;
  purchase_delay_days: number; assumptions: string[];
}
export interface CompareResult {
  user_id: string; dataset_id: string; as_of: string;
  account_id: string; available_cash: number;
  baseline_source: string; baseline_daily_variable_expense: number;
  reference_investment_price: number|null; reference_investment_code: string|null;
  paths: ScenarioPath[]; warnings: string[];
}
export interface Instrument {
  code: string; name: string; price: number; price_date: string; price_source: string;
}

export const getDemoDefault = (signal?: AbortSignal) =>
  request('/demo/default', { signal }, (x): x is DemoDefault =>
    isObject(x) && typeof x.user_id === 'string' && typeof x.as_of_date === 'string' && typeof x.user_count === 'number');

export const getDemoUsers = (signal?: AbortSignal) =>
  request('/users', { signal }, (x): x is { users: string[] } =>
    isObject(x) && Array.isArray(x.users) && x.users.every((v: unknown) => typeof v === 'string'));

export const getDemoHome = (user: string, day: string, signal?: AbortSignal) =>
  request(`/users/${encodeURIComponent(user)}/home?as_of=${encodeURIComponent(day)}`, { signal }, (x): x is HomeState =>
    isObject(x) && x.user_id === user && x.as_of_date === day &&
    Number.isFinite(x.available_cash) && Array.isArray(x.recent_transactions) &&
    Array.isArray(x.daily_cashflow) && isObject(x.virtual_investments) &&
    Array.isArray(x.upcoming_essential_payments));

export const getInstruments = (user: string, day: string, signal?: AbortSignal) =>
  request(`/instruments?user_id=${encodeURIComponent(user)}&as_of=${encodeURIComponent(day)}`,
    { signal }, (x): x is { prices: Instrument[]; is_live: boolean } =>
    isObject(x) && Array.isArray(x.prices) && x.is_live === false);

export const compareScenarios = (payload: CompareRequest, signal?: AbortSignal) =>
  request('/scenarios/compare', { method: 'POST', signal, body: JSON.stringify(payload) },
    (x): x is CompareResult =>
      isObject(x) && x.user_id === payload.user_id && x.as_of === payload.as_of &&
      Array.isArray(x.paths) && x.paths.length === 6 &&
      x.paths.every((p: unknown) => isObject(p) && Array.isArray(p.daily_cashflow) &&
        Number.isFinite(p.minimum_balance) && isObject(p.future_balances)));

export const saveScenario = (payload: CompareRequest, signal?: AbortSignal) =>
  request('/scenarios/save', { method: 'POST', signal,
    body: JSON.stringify({ request: payload, label: '내가 선택한 금융 시나리오' }) },
  (x): x is { id: string; saved: boolean } => isObject(x) && typeof x.id === 'string' && x.saved === true);
