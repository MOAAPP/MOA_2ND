import { runJob, type Job } from './compute';

/**
 * 계산 엔진: Web Worker가 있으면 백그라운드에서, 없으면(테스트·구형 브라우저) 메인 스레드에서.
 * 같은 종류의 작업이 새로 오면 이전 결과는 버린다 (입력이 바뀌는 중엔 최신 것만).
 */
let worker: Worker | null | undefined;
let seq = 0;
const pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>();

function getWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = typeof Worker === 'undefined' ? null : new Worker(new URL('./mc.worker.ts', import.meta.url), { type: 'module' });
    worker?.addEventListener('message', (e: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      const p = pending.get(e.data.id);
      if (!p) return;
      pending.delete(e.data.id);
      if (e.data.error) p.reject(new Error(e.data.error));
      else p.resolve(e.data.result);
    });
    worker?.addEventListener('error', () => {
      // 워커가 죽으면 메인 스레드로 계산
      for (const [, p] of pending) p.reject(new Error('worker'));
      pending.clear();
      worker = null;
    });
  } catch {
    worker = null;
  }
  return worker;
}

export function compute<T>(job: Job): Promise<T> {
  const w = getWorker();
  if (!w) return new Promise((res) => setTimeout(() => res(runJob(job) as T), 0));
  const id = ++seq;
  return new Promise<T>((resolve, reject) => {
    pending.set(id, { resolve: resolve as (v: unknown) => void, reject });
    w.postMessage({ id, job });
  }).catch(() => runJob(job) as T);
}
