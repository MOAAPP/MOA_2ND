import { runJob, type Job } from './compute';

/** 확률 계산 전용 워커: 경로 수천 개를 돌려도 화면이 멈추지 않게 */
self.onmessage = (e: MessageEvent<{ id: number; job: Job }>) => {
  const { id, job } = e.data;
  try {
    const t = performance.now();
    const result = runJob(job);
    (self as unknown as Worker).postMessage({ id, result, ms: Math.round(performance.now() - t) });
  } catch (err) {
    (self as unknown as Worker).postMessage({ id, error: err instanceof Error ? err.message : String(err) });
  }
};
