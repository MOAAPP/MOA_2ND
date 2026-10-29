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
