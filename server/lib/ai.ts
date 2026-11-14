import { fetchWithTimeout } from './http';
import { llmComplete, llmModel, llmProvider } from './llm';
import type { Explanation } from './explain';

/**
 * 선택 기능: ANTHROPIC_API_KEY가 있으면 분석 엔진이 찾은 사실만 근거로 2~3문장 설명을 다듬는다.
 * 숫자 계산·원인 판단은 코드가 하고, AI는 문장 정리만 한다. 실패하면 null → 규칙 기반 문장을 쓴다.
 */
export function aiConfigured() {
  return llmProvider() !== null;
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
  const r = await llmComplete({ system, user, maxTokens: 300, timeoutMs: 15000 });
  if (!r.ok) return null;
  const text = r.text.trim();
  if (!text) return null;
  // 숫자를 지어내지 않았는지 간단히 확인: 응답에 나온 % 숫자는 사실 목록에 있어야 함
  const known = (e.facts.join(' ') + e.reasons.map((x) => x.detail).join(' ')).replace(/\s/g, '');
  const pcts = text.match(/\d+(\.\d+)?%/g) ?? [];
  if (pcts.some((p) => !known.includes(p))) return null;
  return text.slice(0, 220);
}

/* ───────── 모아 AI 작업 (shared/aiPrompts.ts · docs/AI.md) ───────── */
import { AI_PROMPTS, buildUserMessage, extractionGrounded, numbersGrounded, type AiTask } from '../../shared/aiPrompts';
import { maskText } from '../../shared/mask';
import { checkAiOutput } from '../../shared/aiSchemas';

/** 원문을 다루는 작업은 서버에서도 한 번 더 가린 뒤에만 모델에 보낸다. 요청 본문은 로그에 남기지 않는다. */
export function sanitizeInput(task: AiTask, input: unknown): unknown {
  if ((task === 'parseSpend' || task === 'parseSchedule') && input && typeof input === 'object' && typeof (input as { text?: unknown }).text === 'string') {
    const i = input as { text: string };
    return { ...i, text: maskText(i.text.slice(0, 4000)).text };
  }
  return input;
}

export const AI_TASKS = Object.keys(AI_PROMPTS) as AiTask[];

export type AiFailure = 'not_configured' | 'http_error' | 'no_json' | 'invalid_output' | 'ungrounded' | 'network' | 'rules_only';
export type AiRun = { ok: true; data: unknown; model: string; ms: number } | { ok: false; reason: AiFailure; ms: number; issues?: string[] };

/* ── 운영 지표: 개인정보 원문 없이 작업별 성공·실패 사유·응답 시간만 센다 (인스턴스별 메모리) ── */
interface TaskStat { ok: number; fail: Partial<Record<AiFailure, number>>; totalMs: number }
const stats = new Map<AiTask, TaskStat>();
function record(task: AiTask, r: AiRun) {
  const s = stats.get(task) ?? { ok: 0, fail: {}, totalMs: 0 };
  if (r.ok) s.ok += 1; else s.fail[r.reason] = (s.fail[r.reason] ?? 0) + 1;
  s.totalMs += r.ms;
  stats.set(task, s);
}
export function aiStats() {
  const out: Record<string, { ok: number; fail: Partial<Record<AiFailure, number>>; avgMs: number | null }> = {};
  for (const [task, s] of stats) {
    const n = s.ok + Object.values(s.fail).reduce((a, b) => a + (b ?? 0), 0);
    out[task] = { ok: s.ok, fail: s.fail, avgMs: n ? Math.round(s.totalMs / n) : null };
  }
  return out;
}
export function resetAiStats() { stats.clear(); }

export const aiModel = () => llmModel();

/**
 * 모델 응답에서 JSON 객체 하나를 꺼낸다. ```json 코드블록, 앞뒤 설명 문장, 문자열 안의 중괄호를 견딘다.
 * 찾지 못하면 undefined.
 */
export function extractJson(text: string): unknown {
  if (!text) return undefined;
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = fenced ? [fenced[1], text] : [text];
  for (const src of candidates) {
    for (let start = src.indexOf('{'); start !== -1; start = src.indexOf('{', start + 1)) {
      let depth = 0, inStr = false, esc = false;
      for (let i = start; i < src.length; i++) {
        const ch = src[i];
        if (inStr) { if (esc) esc = false; else if (ch === '\\') esc = true; else if (ch === '"') inStr = false; continue; }
        if (ch === '"') inStr = true;
        else if (ch === '{') depth++;
        else if (ch === '}' && --depth === 0) {
          try { return JSON.parse(src.slice(start, i + 1)); } catch { break; }
        }
      }
    }
  }
  return undefined;
}

/**
 * 작업 하나를 실제 모델로 실행한다. 입력은 라우트에서 checkAiInput을 통과한 값이다.
 * 실패하면 사유를 돌려주고, 클라이언트는 예시 응답으로 바꿔 쓰되 '예시 응답'이라고 표시한다.
 * 성공 조건: JSON 하나 + 작업별 출력 스키마(strict) 통과 + 입력에 없는 금액을 지어내지 않음.
 */
export async function runAiTask(task: AiTask, input: unknown, fetcher: typeof fetchWithTimeout = fetchWithTimeout): Promise<AiRun> {
  const t0 = Date.now();
  const done = (r: AiRun) => { record(task, r); return r; };
  if (task === 'parseSpend' || task === 'parseSchedule') return done({ ok: false, reason: 'rules_only', ms: 0 });
  if (!aiConfigured()) return done({ ok: false, reason: 'not_configured', ms: 0 });
  const p = AI_PROMPTS[task];
  input = sanitizeInput(task, input);
  const user = buildUserMessage(task, input as never);
  const r = await llmComplete({ system: p.system, user, maxTokens: p.maxTokens }, fetcher);
  if (!r.ok) return done({ ok: false, reason: r.reason === 'network' ? 'network' : 'http_error', ms: Date.now() - t0 });
  let model = r.model;
  let raw = extractJson(r.text);
  if (raw === undefined) {
    // 빈 응답·잘린 JSON·설명이 섞인 응답은 한 번만 더 요청한다(토큰 여유 + JSON만 다시 강조).
    const again = await llmComplete({ system: `${p.system}\n설명이나 코드블록 없이 JSON 객체 하나만 응답해요.`, user, maxTokens: p.maxTokens * 4 }, fetcher);
    if (again.ok) { raw = extractJson(again.text); model = again.model; }
  }
  if (raw === undefined) return done({ ok: false, reason: 'no_json', ms: Date.now() - t0 });
  const checked = checkAiOutput(task, raw);
  if (!checked.ok) return done({ ok: false, reason: 'invalid_output', ms: Date.now() - t0, issues: checked.issues });
  if (!numbersGrounded(task, input, checked.data) || !extractionGrounded(task, input, checked.data)) return done({ ok: false, reason: 'ungrounded', ms: Date.now() - t0 });
  return done({ ok: true, data: checked.data, model, ms: Date.now() - t0 });
}
