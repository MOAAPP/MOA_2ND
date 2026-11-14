import { fetchWithTimeout } from './http';

/**
 * LLM 호출 한 곳. 서버에서만 쓰고, 키는 브라우저 번들에 들어가지 않는다.
 *
 * 우선순위
 *  1) FACTCHAT_API_KEY — 서울여대 FactChat 게이트웨이 (OpenAI 호환 chat/completions)
 *     https://swu.factchat.bot/dashboard/developers?tab=keys 에서 발급
 *  2) ANTHROPIC_API_KEY — Anthropic Messages API 직접 호출
 *
 * 환경변수
 *  AI_ENABLED=off — 키는 그대로 두고 AI 호출만 끈다(크레딧 아끼기). 앱은 예시 응답으로 동작. 지우거나 on이면 다시 켜짐
 *  FACTCHAT_API_KEY, FACTCHAT_BASE_URL(기본 https://factchat-cloud.mindlogic.ai/v1/gateway), FACTCHAT_MODEL(기본 claude-haiku-4-5-20251001)
 *  - 기본 모델은 백엔드(MOA_2ND_BE)가 같은 게이트웨이에서 실제로 쓰고 있는 모델과 같다.
 *  - 게이트웨이의 Claude 모델은 출력 토큰을 짧게 주면 JSON이 잘리거나 빈 응답이 오므로 최소 FACTCHAT_MIN_TOKENS를 보장한다.
 *  ANTHROPIC_API_KEY, ANTHROPIC_MODEL(기본 claude-haiku-5-5)
 */

export type LlmProvider = 'factchat' | 'anthropic';

export const FACTCHAT_DEFAULT_BASE = 'https://factchat-cloud.mindlogic.ai/v1/gateway';
export const FACTCHAT_DEFAULT_MODEL = 'claude-haiku-4-5-20251001';
export const FACTCHAT_MIN_TOKENS = 1024;

export function llmProvider(): LlmProvider | null {
  if (/^(off|false|0)$/i.test(process.env.AI_ENABLED ?? '')) return null;
  if (process.env.FACTCHAT_API_KEY) return 'factchat';
  if (process.env.ANTHROPIC_API_KEY) return 'anthropic';
  return null;
}

export function llmModel(): string {
  return llmProvider() === 'factchat'
    ? process.env.FACTCHAT_MODEL || FACTCHAT_DEFAULT_MODEL
    : process.env.ANTHROPIC_MODEL || 'claude-haiku-5-5';
}

export interface LlmImage { mediaType: string; base64: string }
export interface LlmRequest { system: string; user: string; image?: LlmImage; maxTokens: number; timeoutMs?: number }
export type LlmResult = { ok: true; text: string; model: string; truncated?: boolean } | { ok: false; reason: 'not_configured' | 'http_error' | 'network'; status?: number };

type Fetcher = typeof fetchWithTimeout;

export async function llmComplete(req: LlmRequest, fetcher: Fetcher = fetchWithTimeout): Promise<LlmResult> {
  const provider = llmProvider();
  if (!provider) return { ok: false, reason: 'not_configured' };
  const model = llmModel();
  const timeout = req.timeoutMs ?? 20000;
  try {
    if (provider === 'factchat') {
      const base = (process.env.FACTCHAT_BASE_URL || FACTCHAT_DEFAULT_BASE).replace(/\/+$/, '');
      const content = req.image
        ? [{ type: 'image_url', image_url: { url: `data:${req.image.mediaType};base64,${req.image.base64}` } }, { type: 'text', text: req.user }]
        : req.user;
      const res = await fetcher(`${base}/chat/completions`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.FACTCHAT_API_KEY}` },
        body: JSON.stringify({ model, max_tokens: Math.max(FACTCHAT_MIN_TOKENS, req.maxTokens), messages: [{ role: 'system', content: req.system }, { role: 'user', content }] }),
      }, timeout);
      if (!res.ok) return { ok: false, reason: 'http_error', status: res.status };
      type Part = { type?: string; text?: string };
      const j = (await res.json()) as { choices?: { finish_reason?: string; message?: { content?: string | Part[] | null } }[] };
      const choice = j.choices?.[0];
      const c = choice?.message?.content;
      // 문자열 또는 [{type:'text'|'output_text', text}] 배열. 생각(thinking) 블록은 건너뛴다.
      const text = typeof c === 'string' ? c : Array.isArray(c) ? c.filter((x) => x && x.type !== 'thinking' && x.type !== 'reasoning').map((x) => x.text ?? '').join('') : '';
      return { ok: true, text, model, truncated: choice?.finish_reason === 'length' };
    }
    const content = req.image
      ? [{ type: 'image', source: { type: 'base64', media_type: req.image.mediaType, data: req.image.base64 } }, { type: 'text', text: req.user }]
      : req.user;
    const res = await fetcher('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: req.maxTokens, system: req.system, messages: [{ role: 'user', content }] }),
    }, timeout);
    if (!res.ok) return { ok: false, reason: 'http_error', status: res.status };
    const j = (await res.json()) as { content?: { type: string; text?: string }[] };
    return { ok: true, text: j.content?.find((x) => x.type === 'text')?.text ?? '', model };
  } catch {
    return { ok: false, reason: 'network' };
  }
}
