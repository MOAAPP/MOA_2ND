import { fetchWithTimeout } from './http';
import type { Explanation } from './explain';

/**
 * 선택 기능: ANTHROPIC_API_KEY가 있으면 분석 엔진이 찾은 사실만 근거로 2~3문장 설명을 다듬는다.
 * 숫자 계산·원인 판단은 코드가 하고, AI는 문장 정리만 한다. 실패하면 null → 규칙 기반 문장을 쓴다.
 */
export function aiConfigured() {
  return !!process.env.ANTHROPIC_API_KEY;
}

export async function aiSummary(name: string, e: Explanation, level: 1 | 2 | 3): Promise<string | null> {
  if (!aiConfigured() || e.direction === 'unknown') return null;
  const system = [
    '당신은 대학생을 위한 금융 학습 앱의 시장 해설가입니다.',
    '주어진 사실과 후보 요인만 사용하세요. 새로운 숫자, 사건, 기사를 만들지 마세요.',
    '원인을 단정하지 말고 "~로 보여요", "~영향일 수 있어요"처럼 표현하세요.',
    '매수·매도 권유, 미래 가격 예측을 하지 마세요.',
    `독자 수준: ${level === 1 ? '주식이 처음인 사람(전문용어 없이)' : level === 2 ? '기본 개념을 아는 사람' : '지표를 이해하는 사람'}.`,
    '한국어 존댓말(해요체) 2~3문장, 160자 이내, 마크다운 없이.',
  ].join('\n');
  const user = JSON.stringify({ 종목: name, 등락률: e.pct, 확인된사실: e.facts, 후보요인: e.reasons.map((r) => `${r.label}(${r.strength}): ${r.detail}`), 기사제목: e.newsUsed.map((n) => n.title), 원인불명: e.unknown });
  try {
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5', max_tokens: 300, system, messages: [{ role: 'user', content: user }] }),
    }, 15000);
    if (!res.ok) return null;
    const j = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = j.content?.find((c) => c.type === 'text')?.text?.trim();
    if (!text) return null;
    // 숫자를 지어내지 않았는지 간단히 확인: 응답에 나온 % 숫자는 사실 목록에 있어야 함
    const known = (e.facts.join(' ') + e.reasons.map((r) => r.detail).join(' ')).replace(/\s/g, '');
    const pcts = text.match(/\d+(\.\d+)?%/g) ?? [];
    if (pcts.some((p) => !known.includes(p))) return null;
    return text.slice(0, 220);
  } catch {
    return null;
  }
}

/* ───────── 모아 AI 작업 (shared/aiPrompts.ts · docs/AI.md) ───────── */
import { AI_PROMPTS, buildUserMessage, numbersGrounded, type AiTask } from '../../shared/aiPrompts';
import { maskPayment } from '../../shared/masking';

export const AI_TASKS = Object.keys(AI_PROMPTS) as AiTask[];

/**
 * 작업 하나를 실제 모델로 실행한다. 키가 없거나, JSON이 아니거나, 입력에 없는 금액을 지어내면 null.
 * 클라이언트는 null(503)을 받으면 예시 응답을 쓴다.
 */
export async function runAiTask(task: AiTask, input: unknown): Promise<unknown | null> {
  if (!aiConfigured()) return null;
  const p = AI_PROMPTS[task];
  // 결제 문자는 외부 LLM에 원문으로 보내지 않는다. 앱에서 사용자가 확인한 문장이 와도 서버에서 한 번 더 가린다.
  // 요청 본문(원문)은 어디에도 로그로 남기지 않는다.
  if (task === 'parseSpend' && input && typeof (input as { text?: unknown }).text === 'string') {
    input = { ...(input as object), text: maskPayment((input as { text: string }).text).text };
  }
  try {
    const res = await fetchWithTimeout('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5', max_tokens: p.maxTokens, system: p.system, messages: [{ role: 'user', content: buildUserMessage(task, input as never) }] }),
    }, 20000);
    if (!res.ok) return null;
    const j = (await res.json()) as { content?: { type: string; text?: string }[] };
    const text = j.content?.find((c) => c.type === 'text')?.text ?? '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const out = JSON.parse(m[0]) as unknown;
    return numbersGrounded(task, input, out) ? out : null;
  } catch {
    return null;
  }
}
