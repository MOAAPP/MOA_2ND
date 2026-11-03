/**
 * 모아 AI 진입점. 화면은 runAi / useAi 만 쓴다.
 * - 기본(auto): 처음 한 번 /api/health 로 서버에 AI 키(FactChat 등)가 있는지 보고, 있으면 /api/ai/:task 로 실제 모델을 부른다.
 *   키가 없거나 호출이 실패하면 예시 응답(example.ts)으로 돌아오고, 결과에 source·fallback을 남긴다.
 * - VITE_AI_MODE=example 이면 항상 예시 응답, live 이면 확인 없이 항상 서버를 부른다.
 * 작업 정의·프롬프트: shared/aiPrompts.ts · 문서: docs/AI.md
 */
import { useEffect, useRef, useState } from 'react';
import type { AiInput, AiOutput, AiTask } from '../../../shared/aiPrompts';
import { exampleAsk, exampleBrief, exampleCategorize, exampleCoach, exampleLedgerSummary, exampleParseSchedule, exampleParseSpend } from './example';

export type AiSource = 'example' | 'live';
export interface AiResult<T extends AiTask> {
  data: AiOutput<T>;
  source: AiSource;
  ms: number;
  /** live 모드에서 예시 응답으로 바뀐 이유 (서버 오류 코드). 평가 기록에서 live와 example을 섞지 않기 위해 남긴다. */
  fallback?: string;
  /** 실제 모델이 답한 경우 모델 이름 */
  model?: string;
}

const EXAMPLE: { [T in AiTask]: (i: AiInput<T>) => AiOutput<T> } = {
  brief: exampleBrief,
  coach: exampleCoach,
  ledgerSummary: exampleLedgerSummary,
  parseSpend: exampleParseSpend,
  parseSchedule: exampleParseSchedule,
  categorize: exampleCategorize,
  ask: exampleAsk,
};

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
const MODE: 'auto' | 'live' | 'example' = env.VITE_AI_MODE === 'live' ? 'live' : env.VITE_AI_MODE === 'example' ? 'example' : 'auto';
/** 화면 첫 표시용 기본값 (확인 전에는 예시로 그린다) */
export const AI_MODE: AiSource = MODE === 'live' ? 'live' : 'example';

let liveCheck: Promise<boolean> | null = null;
/** 서버에 실제 AI가 설정돼 있는지 (세션당 한 번만 확인). 테스트 환경처럼 fetch가 없으면 false. */
export function liveAvailable(): Promise<boolean> {
  if (MODE === 'example') return Promise.resolve(false);
  if (MODE === 'live') return Promise.resolve(true);
  if (!liveCheck) {
    liveCheck = typeof fetch === 'function' && typeof window !== 'undefined'
      ? fetch('/api/health').then((r) => (r.ok ? r.json() : null)).then((j: { ai?: boolean } | null) => !!j?.ai).catch(() => false)
      : Promise.resolve(false);
  }
  return liveCheck;
}

/** 예시 응답도 모델처럼 잠깐 생각하는 시간을 둔다(화면 흐름을 실제와 같게). 테스트에서는 0. */
let exampleDelay: (task: AiTask) => number = (task) => (task === 'categorize' ? 120 : task === 'ask' ? 700 : 450);
export function setExampleDelay(f: (task: AiTask) => number) { exampleDelay = f; }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runAi<T extends AiTask>(task: T, input: AiInput<T>): Promise<AiResult<T>> {
  const t0 = Date.now();
  let fallback: string | undefined;
  if (await liveAvailable()) {
    try {
      const res = await fetch(`/api/ai/${task}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input }) });
      const j = (await res.json().catch(() => ({}))) as { data?: AiOutput<T>; meta?: { model?: string }; error?: { code?: string } | string; code?: string };
      if (res.ok && j.data) return { data: j.data, source: 'live', ms: Date.now() - t0, model: j.meta?.model };
      fallback = (typeof j.error === 'object' ? j.error?.code : undefined) ?? j.code ?? `http_${res.status}`;
    } catch { fallback = 'network'; }
  }
  const d = exampleDelay(task);
  if (d > 0) await sleep(d);
  return { data: EXAMPLE[task](input), source: 'example', ms: Date.now() - t0, fallback };
}

/** 동기 예시 응답(첫 화면 깜빡임 없이 바로 그릴 때) */
export function exampleNow<T extends AiTask>(task: T, input: AiInput<T>): AiOutput<T> {
  return EXAMPLE[task](input);
}

/**
 * 입력이 바뀔 때마다 AI를 다시 부른다. key가 같으면 다시 부르지 않는다.
 * 반환: { data, loading, source }
 */
export function useAi<T extends AiTask>(task: T, input: AiInput<T> | null, key: string) {
  const [state, setState] = useState<{ data: AiOutput<T> | null; loading: boolean; source: AiSource; key: string }>({ data: null, loading: !!input, source: AI_MODE, key: '' });
  const last = useRef('');
  const inputRef = useRef(input);
  inputRef.current = input;
  useEffect(() => {
    const i = inputRef.current;
    if (!i) { setState({ data: null, loading: false, source: AI_MODE, key }); return; }
    if (last.current === key) return;
    last.current = key;
    let alive = true;
    setState((s) => ({ ...s, loading: true }));
    void runAi(task, i).then((r) => { if (alive) setState({ data: r.data, loading: false, source: r.source, key }); });
    return () => { alive = false; last.current = ''; };
  }, [task, key]);
  return state;
}
