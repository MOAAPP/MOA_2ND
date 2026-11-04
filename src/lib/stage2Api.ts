/** Stage 2 Python FastAPI bridge; no fake AI fallback or browser-side financial calculations. */
export type PaymentMethod = 'debit' | 'credit' | 'transfer' | 'cash' | 'atm' | 'unknown';
export type ParsedKind = 'debit_approval' | 'credit_approval' | 'card_bill' | 'installment_approval' |
  'account_in' | 'account_out' | 'automatic_transfer' | 'salary' | 'allowance' |
  'refund' | 'cancellation' | 'atm_withdrawal' | 'unclassified';
export interface ParsedTransaction {
  source_id: string;
  fingerprint: string;
  user_id: string;
  kind: ParsedKind;
  issuer: string | null;
  payment_method: PaymentMethod;
  merchant: string | null;
  amount: number | null;
  occurred_at: string | null;
  debit_at: string | null;
  card_id: string | null;
  installments: number | null;
  transaction_status: 'authorization' | 'posted' | 'cancelled' | 'unconfirmed';
  uncertainty: string[];
  duplicate_possible: boolean;
  parsing_source: 'rules' | 'llm' | 'manual_review';
  confidence: number;
}
export interface SmsAnalysis {
  analysis_status: 'parsed' | 'needs_manual_review';
  transactions: ParsedTransaction[];
  skipped: number;
  llm_called: boolean;
  masked_before_llm: boolean;
  warnings: string[];
}
export interface Rect { x: number; y: number; width: number; height: number }
export interface VisualEvidence {
  field: string;
  text: string | null;
  region: Rect | null;
  explanation: string | null;
}
export interface AlternativeProduct {
  product_name: string | null;
  selling_price: number | null;
  region: Rect | null;
  reason_not_main: string | null;
}
export interface VisionProduct {
  product_name: string | null;
  brand: string | null;
  category: string | null;
  main_product_candidate: string | null;
  alternative_candidates: AlternativeProduct[];
  product_image_region: Rect | null;
  original_price: number | null;
  selling_price: number | null;
  conditional_discount_price: number | null;
  selected_options: string[];
  quantity: number | null;
  option_extra_cost: number | null;
  shipping_fee: number | null;
  visual_evidence_regions: VisualEvidence[];
  uncertain_fields: string[];
  needs_user_confirmation: boolean;
}
export interface VisionAnalysis {
  analysis_id: string;
  user_id: string;
  analysis_status: 'succeeded';
  source: 'multimodal_llm';
  model: string;
  cached: boolean;
  latency_ms: number;
  input_tokens: number | null;
  output_tokens: number | null;
  product: VisionProduct;
  estimated_checkout_total: number | null;
  checkout_total_confirmed: boolean;
}
export interface PurchaseCandidate {
  id: string;
  user_id: string;
  analysis_id: string;
  status: 'candidate';
  product: VisionProduct;
  estimated_checkout_total: number | null;
  checkout_total_confirmed: boolean;
  created_at: string;
  actual_balance_impact: 0;
}
export interface SimulationResult {
  available_cash: number;
  future_balances: Record<string, number>;
  daily_cashflow: { date: string; closing_balance: number; events: {
    id: string; amount: number; transaction_status: string; debit_at: string
  }[] }[];
  warnings: string[];
}
const origin = (import.meta.env.VITE_FINANCE_API_BASE ?? '').replace(/\/$/, '');
const base = origin ? (origin.endsWith('/api/v4') ? origin : origin + '/api/v4') : '/api/v4';

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(base + path, { ...options, headers: {
      Accept: 'application/json', ...(options.headers ?? {}),
    } });
  } catch {
    throw new Error('Python FastAPI 서버가 응답하지 않아요. 로컬 백엔드 실행 상태를 확인해주세요.');
  }
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const envelope = data as { detail?: { code?: string; message?: string } | string } | null;
    const detail = typeof envelope?.detail === 'string' ? envelope.detail : envelope?.detail?.message;
    throw new Error(detail || 'FastAPI 요청에 실패했습니다 (' + response.status + ')');
  }
  if (!data) throw new Error('FastAPI 응답이 비어 있습니다.');
  return data as T;
}
const json = <T,>(path: string, body: unknown) => request<T>(path, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
});
export function analyzeSms(userId: string, text: string, useLlm = false) {
  return json<SmsAnalysis>('/sms/analyze', { user_id: userId, text, use_llm_for_unknown: useLlm });
}
export function confirmSms(userId: string, transaction: ParsedTransaction, accountId?: string) {
  return json<{ status: 'confirmed'; warnings: string[] }>('/sms/confirm', {
    user_id: userId, transaction, account_id: accountId ?? null,
    acknowledge_unresolved: true,
  });
}
export function analyzeShopScreenshot(userId: string, image: File) {
  const form = new FormData();
  form.set('user_id', userId);
  form.set('privacy_acknowledged', 'true');
  form.set('file', image);
  return request<VisionAnalysis>('/vision/analyze', { method: 'POST', body: form });
}
export function confirmProduct(userId: string, analysisId: string, product: VisionProduct,
  useConditionalDiscount = false) {
  return json<PurchaseCandidate>('/purchase-candidates/confirm', {
    user_id: userId, analysis_id: analysisId, product,
    shipping_confirmed: true, use_conditional_discount: useConditionalDiscount,
    discount_eligible_confirmed: useConditionalDiscount, confirm_total: true,
  });
}
export function listCandidates(userId: string) {
  return request<PurchaseCandidate[]>('/users/' + encodeURIComponent(userId) + '/purchase-candidates');
}
export function simulateCandidate(userId: string, candidateId: string, debitAt: string) {
  return json<SimulationResult>('/users/' + encodeURIComponent(userId) +
    '/purchase-candidates/' + encodeURIComponent(candidateId) + '/simulate', {
    debit_at: debitAt, payment_method: 'debit', horizon_days: 14,
  });
}
