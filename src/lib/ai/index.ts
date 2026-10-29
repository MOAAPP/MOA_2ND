/**
 * 모아 AI 진입점. 화면은 runAi / useAi 만 쓴다.
 * - 기본: 예시 응답(example.ts). 네트워크 없이 내 데이터로 문장을 만든다.
 * - VITE_AI_MODE=live 이면 /api/ai/:task 로 실제 모델을 부르고, 실패하면 예시 응답으로 돌아온다.
 * 작업 정의·프롬프트: shared/aiPrompts.ts · 문서: docs/AI.md
 */
import { useEffect, useRef, useState } from 'react';
import type { AiInput, AiOutput, AiTask } from '../../../shared/aiPrompts';
import { exampleAsk, exampleBrief, exampleCategorize, exampleCoach, exampleLedgerSummary, exampleParseSpend } from './example';

export type AiSource = 'example' | 'live';
export interface AiResult<T extends AiTask> { data: AiOutput<T>; source: AiSource; ms: number }

const EXAMPLE: { [T in AiTask]: (i: AiInput<T>) => AiOutput<T> } = {
  brief: exampleBrief,
  coach: exampleCoach,
  ledgerSummary: exampleLedgerSummary,
  parseSpend: exampleParseSpend,
  categorize: exampleCategorize,
  ask: exampleAsk,
};

const env = (import.meta as unknown as { env?: Record<string, string | undefined> }).env ?? {};
export const AI_MODE: AiSource = env.VITE_AI_MODE === 'live' ? 'live' : 'example';

/** 예시 응답도 모델처럼 잠깐 생각하는 시간을 둔다(화면 흐름을 실제와 같게). 테스트에서는 0. */
let exampleDelay: (task: AiTask) => number = (task) => (task === 'categorize' ? 120 : task === 'ask' ? 700 : 450);
export function setExampleDelay(f: (task: AiTask) => number) { exampleDelay = f; }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function runAi<T extends AiTask>(task: T, input: AiInput<T>): Promise<AiResult<T>> {
  const t0 = Date.now();
  if (AI_MODE === 'live') {
    try {
      const res = await fetch(`/api/ai/${task}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ input }) });
      if (res.ok) {
        const j = (await res.json()) as { data?: AiOutput<T> };
        if (j.data) return { data: j.data, source: 'live', ms: Date.now() - t0 };
      }
    } catch { /* 예시 응답으로 */ }
  }
  const d = exampleDelay(task);
  if (d > 0) await sleep(d);
  return { data: EXAMPLE[task](input), source: 'example', ms: Date.now() - t0 };
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
