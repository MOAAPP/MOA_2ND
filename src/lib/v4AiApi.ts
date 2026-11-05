/** Browser-safe FastAPI AI APIs. Secrets remain in backend .env only. */
const configured = (import.meta.env.VITE_FINANCE_API_BASE ?? '').replace(/\/$/, '');
const root = configured ? configured + (configured.endsWith('/api/v4') ? '' : '/api/v4') : '/api/v4';

async function json<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(root + path, {
      ...options, headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error('금융 AI 서버에 연결하지 못했어요. FastAPI 실행 상태를 확인해주세요.');
  }
  const data = await response.json().catch(() => null) as {
    detail?: { message?: string; code?: string } | string; [key: string]: unknown
  } | null;
  if (!response.ok) {
    const message = typeof data?.detail === 'string' ? data.detail :
      typeof data?.detail === 'object' ? data.detail.message : undefined;
    throw new Error(message ?? `요청 실패 (HTTP ${response.status}). API 키와 모델 설정을 확인해 주세요.`);
  }
  return data as T;
}

export interface AiStatus {
  llm_configured: boolean;
  agent_configured: boolean;
  vision_configured: boolean;
  text_model: string | null;
  keys_exposed: false;
}
export interface AgentRoute {
  id: string; label: string; kind: string; purchase_amount: number;
  purchase_date: string | null; payment_method: string;
  minimum_balance: number; ending_balance: number;
  hard_constraints_met: boolean;
  checks: Record<string, boolean>;
}
export interface AgentResponse {
  status: 'ok' | 'no_valid_route' | 'needs_confirmation';
  conditions: Record<string, unknown>;
  search: {
    status: string; routes: AgentRoute[]; conflict_explanations: string[];
    confirmations_required: string[]; evaluated_count: number; valid_count: number;
  };
  tool_execution_log: { tool: string; status: string }[];
  llm_model: string; tokens: { input_tokens: number; output_tokens: number };
  estimated_cost_usd: number | null;
}
export interface DailyQuiz {
  id: string; user_id: string; date: string; topic: string;
  selection_reason: string; source: 'llm' | 'rule_based'; model: string | null;
  question: string; options: string[]; answer_record: { choice: number; correct: boolean } | null;
  correct_answer: number | null; explanation: string | null;
}
export const getAiStatus = (signal?: AbortSignal) => json<AiStatus>('/ai/status', { signal });
export const askFinanceAgent = (user: string, day: string, goal: string) =>
  json<AgentResponse>('/agent/analyze', {
    method: 'POST', body: JSON.stringify({ user_id: user, as_of: day, goal, max_evaluations: 72 }),
  });
export const getDailyQuiz = (user: string, day: string) =>
  json<DailyQuiz>(`/users/${encodeURIComponent(user)}/daily-quiz?day=${encodeURIComponent(day)}`);
export const answerDailyQuiz = (user: string, day: string, id: string, choice: number) =>
  json<DailyQuiz>(`/users/${encodeURIComponent(user)}/daily-quiz/answer?day=${encodeURIComponent(day)}`, {
    method: 'POST', body: JSON.stringify({ quiz_id: id, choice }),
  });
