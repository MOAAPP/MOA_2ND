/** Typed bridge to the Python FastAPI engine. No client-side balance arithmetic. */
export interface CashEvent {
  id: string;
  user_id: string;
  account_id: string;
  amount: number;
  debit_at: string;
  occurred_at: string | null;
  kind: string;
  label: string;
  essential: boolean;
  payment_method: string;
  transaction_status: 'actual' | 'scheduled' | 'predicted' | 'simulated';
  transaction_source: string;
}

export interface DailyCashflow {
  date: string;
  opening_balance: number;
  inflow: number;
  outflow: number;
  lowest_balance: number;
  closing_balance: number;
  events: CashEvent[];
}

export interface FinancialResult {
  dataset_id: string;
  user_id: string;
  account_id: string;
  as_of: string;
  balance_snapshot_at: string;
  balance_snapshot_source: string;
  available_cash: number;
  minimum_required_balance: number | null;
  future_balances: Record<string, number>;
  daily_cashflow: DailyCashflow[];
  minimum_balance: number;
  minimum_cash_cushion: number | null;
  essential_payments_covered: boolean | null;
  essential_payment_results: {
    id: string; date: string; name: string; amount: number; balance_after: number; covered: boolean;
  }[];
  virtual_investments: { actual_payment_account_impact: number; status: string };
  warnings: string[];
  forecast_applied: boolean;
}

export interface SimulationEventInput {
  id: string;
  user_id: string;
  account_id: string;
  debit_at: string;
  occurred_at?: string;
  amount: number;
  kind: string;
  label: string;
  essential?: boolean;
  payment_method?: string;
  status: 'simulated';
  source: 'simulation';
}

/** Dev: Vite proxy /api/v4 -> :8000. Production: VITE_FINANCE_API_BASE points at FastAPI origin. */
const origin = (import.meta.env.VITE_FINANCE_API_BASE ?? '').replace(/\/$/, '');
const base = origin ? `${origin}${origin.endsWith('/api/v4') ? '' : '/api/v4'}` : '/api/v4';

async function financeRequest<T>(path: string, signal?: AbortSignal, body?: unknown): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${base}${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { Accept: 'application/json', ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body), signal,
    });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('Python 금융 계산 서버에 연결하지 못했어요. 서버 주소와 실행 상태를 확인해 주세요.');
  }
  const data = await response.json().catch(() => null) as { detail?: string | { message?: string } } | null;
  if (!response.ok) {
    const detail = typeof data?.detail === 'string' ? data.detail : data?.detail?.message;
    throw new Error(detail || `금융 계산 API 오류 (${response.status})`);
  }
  if (!data) throw new Error('금융 계산 결과가 비어 있어요.');
  return data as T;
}

export function getFinancialState(userId: string, signal?: AbortSignal) {
  return financeRequest<{ available_cash: number; account_id: string; warnings: string[] }>(`/users/${encodeURIComponent(userId)}/state`, signal);
}

export function getFinancialCashflow(userId: string, signal?: AbortSignal) {
  return financeRequest<FinancialResult>(`/users/${encodeURIComponent(userId)}/cashflow?horizon_days=14`, signal);
}

export function simulateFinancialChoice(userId: string, events: SimulationEventInput[], signal?: AbortSignal) {
  return financeRequest<FinancialResult>('/cashflow/simulate', signal,
    { user_id: userId, horizon_days: 14, simulation_events: events });
}

/** Canonical read-only user partition of the real 20-person Python dataset. */
export interface DatasetTransaction {
  id?: string;
  user_id: string;
  occurred_at?: number;
  debit_at?: number | null;
  amount?: number;
  kind?: string;
  method?: string;
  name?: string;
  category?: string;
  essential?: boolean;
  status?: string;
}
export interface DatasetSnapshot {
  dataset_id: string;
  user_id: string;
  snapshot_date: string;
  synthetic: true;
  profile: Record<string, unknown>;
  accounts: Record<string, unknown>[];
  schedules: Record<string, unknown>[];
  transactions: DatasetTransaction[];
  daily: { user_id: string; date: string; [key: string]: unknown }[];
  balance_checks: Record<string, unknown>[];
  pending_card_liabilities: Record<string, unknown>[];
  investments: Record<string, unknown>[];
  purchase_intents: Record<string, unknown>[];
}
export function getDatasetSnapshot(userId: string, signal?: AbortSignal) {
  return financeRequest<DatasetSnapshot>(`/users/${encodeURIComponent(userId)}/dataset-snapshot`, signal);
}
export function getConfirmedCashflow(userId: string, asOf: string, signal?: AbortSignal) {
  return financeRequest<FinancialResult>(
    `/users/${encodeURIComponent(userId)}/confirmed-cashflow?as_of=${encodeURIComponent(asOf)}&horizon_days=14`,
    signal,
  );
}
