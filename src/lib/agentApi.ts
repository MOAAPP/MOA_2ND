/** Stage 5 agent transport. The browser never holds an LLM API key or computes balances. */
const origin = (import.meta.env.VITE_FINANCE_API_BASE ?? '').replace(/\/$/, '');
const root = origin ? `${origin}${origin.endsWith('/api/v4') ? '' : '/api/v4'}` : '/api/v4';

export type Stress = 'baseline' | 'higher_spending' | 'delayed_income' | 'combined' | 'investment_loss';

export interface Conditions {
  user_id: string;
  as_of: string;
  purchase_required: boolean;
  target_product_id?: string | null;
  purchase_amount?: number | null;
  preferred_purchase_date?: string | null;
  latest_purchase_date?: string | null;
  minimum_balance?: number | null;
  savings_goal_id?: string | null;
  required_savings_amount?: number | null;
  investment_allowed: boolean;
  maximum_investment_amount: number;
  allowed_payment_methods: ('debit' | 'transfer' | 'credit')[];
  hard_constraints: string[];
  soft_preferences: string[];
  confirmations_required: string[];
}

export interface AgentRoute {
  id: string;
  label: string;
  kind: string;
  purchase_date: string | null;
  payment_method: 'debit' | 'transfer' | 'credit';
  purchase_amount: number;
  savings_amount: number;
  investment_amount: number;
  purchase_delay_days: number;
  minimum_balance: number;
  ending_balance: number;
  savings_goal_impact: number;
  investment_profit_loss: number;
  investment_risk: string;
  hard_constraints_met: boolean;
  checks: Record<string, boolean>;
  scenario: {
    daily_cashflow: { date: string; closing_balance: number; lowest_balance: number }[];
    assumptions: string[];
    essential_payments_covered: boolean;
  };
}

export interface AgentSearch {
  user_id: string;
  as_of: string;
  dataset_id: string;
  forecast_source: string | null;
  status: 'ok' | 'no_valid_route' | 'needs_confirmation';
  routes: AgentRoute[];
  evaluated_count: number;
  valid_count: number;
  rejection_counts: Record<string, number>;
  conflict_explanations: string[];
  confirmations_required: string[];
  elapsed_ms: number;
}

export interface AgentAnalysis {
  conditions: Conditions;
  search: AgentSearch;
  tool_execution_log: { tool: string; status: string; error?: string }[];
  tokens: { input_tokens: number; output_tokens: number };
  cost_status: string;
  estimated_cost_usd: number | null;
}

export interface AgentSearchRequest {
  conditions: Conditions;
  horizon_days: number;
  max_evaluations: number;
  max_results: number;
  stress: Stress;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === 'object' && !Array.isArray(v);
}
function isSearch(v: unknown): v is AgentSearch {
  if (!isObject(v) || !['ok', 'no_valid_route', 'needs_confirmation'].includes(String(v.status)) ||
      !Array.isArray(v.routes) || typeof v.user_id !== 'string') return false;
  return v.routes.every(r => isObject(r) &&
    typeof r.id === 'string' && r.hard_constraints_met === true &&
    Number.isFinite(r.minimum_balance) && Number.isFinite(r.ending_balance) &&
    isObject(r.scenario) && Array.isArray(r.scenario.daily_cashflow));
}

async function call<T>(path: string, body: unknown, check: (v: unknown) => v is T, signal?: AbortSignal): Promise<T> {
  let response: Response;
  try {
    response = await fetch(root + path, {
      method: 'POST', signal, headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error('FastAPI 서버에 연결할 수 없어요. 기존 평행세계 비교는 그대로 사용할 수 있어요.');
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const detail = isObject(data) ? data.detail : null;
    const code = isObject(detail) ? detail.code : null;
    if (code === 'llm_unavailable') throw new Error('AI 서버 키가 설정되지 않았어요. 기본 평행세계 비교를 이용해 주세요.');
    if (code === 'dataset_unavailable') throw new Error('공통 금융 데이터셋을 불러오지 못했어요. 백엔드 설정을 확인해 주세요.');
    if (code === 'llm_provider_error') throw new Error('AI 연결에 실패했어요. 일반 평행세계 계산은 계속 사용할 수 있어요.');
    throw new Error(isObject(detail) && typeof detail.message === 'string' ? detail.message : `경로 분석을 완료하지 못했어요 (HTTP ${response.status}).`);
  }
  if (!check(data)) throw new Error('서버의 AI 경로 데이터 구조가 맞지 않아 결과를 표시하지 않았어요.');
  return data;
}

export function analyzeGoal(user_id: string, as_of: string, goal: string, stress: Stress, signal?: AbortSignal) {
  return call('/agent/analyze', { user_id, as_of, goal, stress }, (v): v is AgentAnalysis =>
    isObject(v) && isObject(v.conditions) && isSearch(v.search) &&
    v.search.user_id === user_id && v.search.as_of === as_of &&
    Array.isArray(v.tool_execution_log) && isObject(v.tokens), signal);
}

export function searchAgentPaths(request: AgentSearchRequest, signal?: AbortSignal) {
  return call('/agent/search', request, (v): v is AgentSearch =>
    isSearch(v) && v.user_id === request.conditions.user_id && v.as_of === request.conditions.as_of, signal);
}

export function saveAgentRoute(request: AgentSearchRequest, route_id: string) {
  return call('/agent/routes/save', {
    search_request: request, route_id, label: '선택한 AI 금융 경로',
  }, (v): v is { saved: true; id: string } =>
    isObject(v) && v.saved === true && typeof v.id === 'string');
}
