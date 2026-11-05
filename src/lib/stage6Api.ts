/** Stage-6 read-only UI bridge. Python owns every financial calculation. */
const configured = (import.meta.env.VITE_FINANCE_API_BASE ?? '').replace(/\/$/, '');
const api = configured ? configured + (configured.endsWith('/api/v4') ? '' : '/api/v4') : '/api/v4';

export interface SpendCapacity {
  user_id: string; as_of_date: string; current_cash: number;
  projected_minimum_balance: number; estimated_additional_spend: number;
  baseline_constraints_met: boolean; minimum_required_balance: number;
  payment_method: string; calculation_method: string;
  forecast_model_type: string; predictive_not_permission: boolean; message: string;
}
export interface FinanceChange {
  code: string; importance: 'low' | 'medium' | 'high'; title: string; delta?: number | null;
}
export interface SavedPlan {
  id: string; kind: 'world'|'agent'; label: string;
  saved_at: string; analysis_as_of: string; has_immutable_snapshot: boolean;
}
export interface MorningBriefing {
  user_id: string; as_of_date: string; summary: string; llm_used: boolean;
  generation_mode: string; spending_capacity: SpendCapacity;
  change_detection: {status: 'first_analysis'|'changed'|'unchanged'; events: FinanceChange[]; previous_as_of_date: string|null};
  nearest_essential_payment: {date: string; name: string; amount: number; balance_after: number; covered: boolean} | null;
  variable_forecast: {model_type: string; model_version?: string; forecasts: {horizon_days: number; predicted_variable_outflow: number}[]};
  projected_minimum_balance: number; saved_plans_count: number; saved_plans: SavedPlan[];
  news: { status: string; articles: unknown[]; is_real_news: boolean };
  savings_goals: unknown[]; virtual_investments: unknown;
}
export interface PlanTracking {
  user_id: string; id: string; status: string;
  saved_analysis_date?: string; tracking_date?: string;
  daily_spend_comparison?: {date: string; predicted: number; observed: number|null; classification: string}[];
  note?: string; message?: string;
}
function isObject(x: unknown): x is Record<string, unknown> {
  return !!x && typeof x === 'object' && !Array.isArray(x);
}
async function read<T>(path: string, signal: AbortSignal | undefined, validate: (data: unknown) => data is T): Promise<T> {
  let response: Response;
  try {
    response = await fetch(api + path, { signal, headers: { Accept: 'application/json' } });
  } catch (error) {
    if (signal?.aborted) throw error;
    throw new Error('금융 분석 서버에 연결할 수 없어요. FastAPI 실행 상태를 확인해 주세요.');
  }
  const result: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = isObject(result) && isObject(result.detail) ? result.detail.message : undefined;
    throw new Error(typeof detail === 'string' ? detail : `분석 요청을 처리하지 못했어요. (HTTP ${response.status})`);
  }
  if (!validate(result)) throw new Error('분석 데이터의 응답 형식이 올바르지 않아요.');
  return result;
}
const pathFor = (user: string, day: string) => `/users/${encodeURIComponent(user)}?as_of=${encodeURIComponent(day)}`;
export function getMorningBriefing(user: string, day: string, signal?: AbortSignal) {
  return read(`/users/${encodeURIComponent(user)}/briefing?as_of=${encodeURIComponent(day)}`, signal,
    (x): x is MorningBriefing => isObject(x) && x.user_id === user && x.as_of_date === day &&
      typeof x.summary === 'string' && isObject(x.spending_capacity) &&
      Number.isFinite(x.spending_capacity.estimated_additional_spend) &&
      isObject(x.change_detection) && Array.isArray(x.change_detection.events) &&
      isObject(x.variable_forecast) && isObject(x.news));
}
export function getSavedPlans(user: string, signal?: AbortSignal) {
  return read(`/users/${encodeURIComponent(user)}/plans`, signal,
    (x): x is { user_id: string; plans: SavedPlan[] } =>
      isObject(x) && x.user_id === user && Array.isArray(x.plans));
}
export function getSavedPlanTracking(user: string, plan: string, day: string, signal?: AbortSignal) {
  return read(`/users/${encodeURIComponent(user)}/plans/${encodeURIComponent(plan)}/tracking?as_of=${encodeURIComponent(day)}`,
    signal, (x): x is PlanTracking => isObject(x) && x.user_id === user && x.id === plan && typeof x.status === 'string');
}
export function getAssetNews(user: string, signal?: AbortSignal) {
  return read(`/users/${encodeURIComponent(user)}/assets/news`, signal,
    (x): x is { user_id: string; status: string; articles: {title: string; source: string; published_at: string; url: string}[] } =>
      isObject(x) && x.user_id === user && typeof x.status === 'string' && Array.isArray(x.articles));
}
