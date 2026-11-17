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
import { AI_PROMPTS, buildUserMessage, extractionGrounded, numbersGrounded, briefEvidenceAligned, type AiTask } from '../../shared/aiPrompts';
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

export type AiFailure = 'not_configured' | 'http_error' | 'no_json' | 'invalid_output' | 'ungrounded' | 'impolite' | 'network' | 'rules_only';
export type AiRun = { ok: true; data: unknown; model: string; ms: number } | { ok: false; reason: AiFailure; ms: number; issues?: string[] };

/** 금융 AI 텍스트 품질 게이트: 사용자 대상 설명 문장의 존댓말을 확인합니다. */
export function politeOutput(task: AiTask, output: unknown): boolean {
  if (task === 'parseSpend' || task === 'parseSchedule' || task === 'categorize') return true;
  if (!output || typeof output !== 'object') return false;
  const v = output as Record<string, unknown>;
  const sentences: unknown[] = task === 'brief' ? [v.body] :
    task === 'coach' ? [v.message, ...(v.tip == null ? [] : [v.tip])] :
    task === 'ledgerSummary' ? (Array.isArray(v.points) ? v.points : []) :
    [v.answer, ...(Array.isArray(v.followUps) ? v.followUps : [])];
  if (!sentences.length || sentences.some(x => typeof x !== 'string' || !x.trim())) return false;
  return sentences.every(x => {
    const parts = (x as string).trim().replace(/(\d)\.(\d)/gu, '$1·$2').split(/[.!?。]\s*/u).map(y => y.trim()).filter(Boolean);
    return parts.length > 0 && parts.every(y =>
      !/(?:^|\s)(?:너는|네가|니가)(?:\s|$)/u.test(y) &&
      /(?:요|니다|니까|세요|십시오|죠|까요)$/u.test(y),
    );
  });
}

/** 금융 위험 수준은 계산된 숫자로 판정하며, LLM의 자유로운 tone 선택을 신뢰하지 않습니다. */
export function coachRiskAligned(task: AiTask, input: unknown, output: unknown): boolean {
  if (task !== 'coach') return true;
  if (!input || typeof input !== 'object' || !output || typeof output !== 'object') return false;
  const i = input as { usableNow: number; usableAfter: number; afterBills: number;
    price: number; categoryCount30: number; frequency: string; yearGap: number };
  const o = output as { tone?: string; message?: string };
  const expected = i.usableAfter < 0 || i.afterBills < 0 ? 'warn' :
    i.categoryCount30 >= 3 || i.price >= i.usableNow * 0.5 ||
    (i.frequency !== 'once' && i.yearGap > Math.max(0, i.usableNow)) ? 'careful' : 'ok';
  if (o.tone !== expected) return false;
  // 계좌 자체가 부족하지 않은데 '마이너스'라는 표현을 쓰는 오해를 방지합니다.
  if (i.afterBills >= 0 && /(?:계좌|통장).{0,8}(?:마이너스|잔액 부족)/u.test(o.message || '')) return false;
  return true;
}

/* ── 운영 지표: 개인정보 원문 없이 작업별 성공·실패 사유·응답 시간만 센다 (인스턴스별 메모리) ── */
interface TaskStat { ok: number; fail: Partial<Record<AiFailure, number>>; totalMs: number; recentMs: number[] }
const stats = new Map<AiTask, TaskStat>();
function record(task: AiTask, r: AiRun) {
  const s = stats.get(task) ?? { ok: 0, fail: {}, totalMs: 0, recentMs: [] };
  if (r.ok) s.ok += 1; else s.fail[r.reason] = (s.fail[r.reason] ?? 0) + 1;
  s.totalMs += r.ms;
  s.recentMs.push(r.ms);
  if (s.recentMs.length > 200) s.recentMs.shift();
  stats.set(task, s);
  // Vercel 함수는 재시작될 수 있으므로, 개인정보 없는 구조화 로그도 남깁니다.
  console.info(JSON.stringify({ event: 'moa_ai_request', task, ok: r.ok, reason: r.ok ? null : r.reason, elapsed_ms: r.ms }));
}
export function aiStats() {
  const out: Record<string, { ok: number; fail: Partial<Record<AiFailure, number>>; avgMs: number | null; p95Ms: number | null; sampleCount: number }> = {};
  for (const [task, s] of stats) {
    const n = s.ok + Object.values(s.fail).reduce((a, b) => a + (b ?? 0), 0);
    const sorted = [...s.recentMs].sort((a, b) => a - b);
    out[task] = { ok: s.ok, fail: s.fail, avgMs: n ? Math.round(s.totalMs / n) : null,
      p95Ms: sorted.length ? sorted[Math.ceil(sorted.length * 0.95) - 1] : null, sampleCount: sorted.length };
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

/** Claude's valid briefing may omit optional navigation or wrap the payload.
 * Keep only explicit text and a validated navigation target; never add facts.
 * Strict schema, financial-number and polite checks still run afterwards.
 */
export function normalizeBriefOutput(raw: unknown): unknown {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return raw;
  const root = raw as Record<string, unknown>;
  const nested = root.brief ?? root.data ?? root.result;
  const source = (typeof root.headline === 'string' && typeof root.body === 'string') ? root :
    (nested && typeof nested === 'object' && !Array.isArray(nested) ? nested as Record<string, unknown> : root);
  if (typeof source.headline !== 'string' || typeof source.body !== 'string') return raw;
  const headline = source.headline.trim();
  const body = source.body.trim();
  const a = source.action;
  let action: { label: string; to: 'choose' | 'ledger' | 'save' | 'forks' } | null = null;
  if (a && typeof a === 'object' && !Array.isArray(a)) {
    const next = a as Record<string, unknown>;
    if (typeof next.label === 'string' && typeof next.to === 'string' &&
        ['choose', 'ledger', 'save', 'forks'].includes(next.to) &&
        next.label.trim().length >= 1 && next.label.trim().length <= 20) {
      action = { label: next.label.trim(), to: next.to as 'choose' | 'ledger' | 'save' | 'forks' };
    }
  }
  return { headline, body, action };
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

  // Home briefing must be live and factual rather than silently downgraded on
  // Claude's occasional extra JSON keys or missing optional action field.
  // Retry once only for format/grounding/politeness failures, not API outages.
  if (task === 'brief') {
    let reason: AiFailure = 'no_json';
    let issues: string[] | undefined;
    for (let attempt = 0; attempt < 2; attempt++) {
      const factRules = '\n입력 숫자는 원 단위 정수입니다. 90000은 90,000원(9만 원), 300000은 300,000원(30만 원)입니다. ' +
        '숫자 단위나 자리수를 절대로 바꾸지 마세요. 숫자를 재계산하거나 퍼센트를 만들지 마세요. ' +
        'nextBill에는 결제 종류가 없으므로 월세·카드대금·보험료 같은 항목을 지어내지 마세요. ' +
        'nextBill이 null이면 결제가 없다는 뜻이 아니라 확인된 정보가 없다는 뜻입니다. ' +
        '상대 날짜(다음 달·내일) 대신 입력에 명시된 결제 날짜만 활용하세요. ' +
        '불확실한 사실은 추측하지 말고 필요한 확인만 요청하세요.';
      const system = (attempt === 0 ? p.system :
        p.system + '\n이전 브리핑은 출력 검증에 실패했습니다. 다음 필드 세 개만 포함한 JSON 객체로 다시 작성하세요: ' +
        '{"headline":"25자 이내의 짧은 제목","body":"입력된 사실만 설명하는 70자 이내의 존댓말 완결 문장","action":null}. ' +
        'action은 필요할 때만 {"label":"20자 이내","to":"choose|ledger|save|forks"}를 사용하세요. ' +
        '새로운 금액·일정·원인을 만들지 말고 불확실하면 숫자를 생략하세요. JSON 밖의 텍스트는 쓰지 마세요.') + factRules;
      const response = await llmComplete({
        system, user, maxTokens: attempt === 0 ? p.maxTokens : p.maxTokens * 3,
      }, fetcher);
      if (!response.ok) {
        return done({ ok: false, reason: response.reason === 'network' ? 'network' :
          response.reason === 'not_configured' ? 'not_configured' : 'http_error', ms: Date.now() - t0 });
      }
      if (response.truncated) { reason = 'no_json'; continue; }
      const parsed = extractJson(response.text);
      if (parsed === undefined) { reason = 'no_json'; continue; }
      const checked = checkAiOutput(task, normalizeBriefOutput(parsed));
      if (!checked.ok) { reason = 'invalid_output'; issues = checked.issues; continue; }
      if (!numbersGrounded(task, input, checked.data) ||
          !briefEvidenceAligned(input, checked.data) ||
          !extractionGrounded(task, input, checked.data)) {
        reason = 'ungrounded'; issues = undefined; continue;
      }
      if (!politeOutput(task, checked.data)) { reason = 'impolite'; issues = undefined; continue; }
      return done({ ok: true, data: checked.data, model: response.model, ms: Date.now() - t0 });
    }
    return done({ ok: false, reason, ms: Date.now() - t0, ...(issues ? { issues } : {}) });
  }

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
  if (!politeOutput(task, checked.data) || !coachRiskAligned(task, input, checked.data)) {
    // 반말이나 계산된 위험 등급과 불일치하는 응답은 한 번 재생성합니다.
    const retry = await llmComplete({
      system: p.system + '\n품질 검증 실패: 모든 문장을 정중한 존댓말로 작성하고, 계산된 잔액·소비 안전선과 일치하는 위험 등급(tone)을 선택하세요. JSON 객체만 출력하세요.',
      user, maxTokens: p.maxTokens * 2,
    }, fetcher);
    const second = retry.ok ? extractJson(retry.text) : undefined;
    const valid = second === undefined ? null : checkAiOutput(task, second);
    if (!valid || !valid.ok || !politeOutput(task, valid.data) || !coachRiskAligned(task, input, valid.data)) {
      const reason: AiFailure = valid?.ok && politeOutput(task, valid.data) ? 'invalid_output' : 'impolite';
      return done({ ok: false, reason, ms: Date.now() - t0 });
    }
    if (!numbersGrounded(task, input, valid.data) || !extractionGrounded(task, input, valid.data)) {
      return done({ ok: false, reason: 'ungrounded', ms: Date.now() - t0 });
    }
    return done({ ok: true, data: valid.data, model: retry.ok ? retry.model : model, ms: Date.now() - t0 });
  }
  return done({ ok: true, data: checked.data, model, ms: Date.now() - t0 });
}
