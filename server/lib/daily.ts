import { minutesKST, todayKST } from '../../shared/dates';
import { ensureDailyJob, getJob, runGenerate, sendJob, waitFor } from './jobs';
import { store } from './store';
import { photosConfigured } from './photos';
import type { CardJob, Subscription } from './types';

/**
 * 데일리 카드뉴스 스케줄러 — 앱 화면이 아니라 서버에서 돈다.
 * 30초마다 구독을 확인해, 설정한 시각(한국 시간)이 지났고 오늘 아직 보내지 않았으면 생성·전송한다.
 * 실패하면 10분 간격으로 하루 최대 3번까지 다시 시도한다.
 */
export const MAX_ATTEMPTS = 3;
export const RETRY_GAP_MS = 10 * 60_000;

export function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

export function isDue(sub: Subscription, now = new Date()): boolean {
  if (!sub.enabled) return false;
  const today = todayKST(now);
  if (minutesKST(now) < timeToMinutes(sub.time)) return false;
  const r = sub.lastRun;
  if (!r || r.date !== today) return true;
  if (r.status === 'ok' || r.status === 'running') return false;
  return r.attempts < MAX_ATTEMPTS && now.getTime() - r.lastAttemptAt >= RETRY_GAP_MS;
}

/** 다음 전송 예정 시각(ms) */
export function nextRunAt(sub: Subscription, now = new Date()): number | null {
  if (!sub.enabled) return null;
  const today = todayKST(now);
  const [y, m, d] = today.split('-').map(Number);
  const [hh, mm] = sub.time.split(':').map(Number);
  const todayRun = Date.UTC(y, m - 1, d, hh - 9, mm);
  const doneToday = sub.lastRun?.date === today && sub.lastRun.status === 'ok';
  if (!doneToday && now.getTime() <= todayRun) return todayRun;
  if (!doneToday && isDue(sub, now)) return now.getTime();
  if (!doneToday && sub.lastRun?.date === today && sub.lastRun.status === 'failed' && sub.lastRun.attempts < MAX_ATTEMPTS) return sub.lastRun.lastAttemptAt + RETRY_GAP_MS;
  return todayRun + 86400000;
}

function setRun(hash: string, p: Partial<NonNullable<Subscription['lastRun']>>) {
  store.update((s) => {
    const sub = s.subscriptions[hash];
    if (!sub) return;
    const prev = sub.lastRun;
    sub.lastRun = { date: p.date ?? prev?.date ?? todayKST(), jobId: p.jobId ?? prev?.jobId ?? null, status: p.status ?? prev?.status ?? 'running', error: p.error, attempts: p.attempts ?? prev?.attempts ?? 0, lastAttemptAt: p.lastAttemptAt ?? prev?.lastAttemptAt ?? Date.now() };
  });
}

export async function runDaily(sub: Subscription, now = new Date()): Promise<CardJob> {
  const date = todayKST(now);
  const attempts = sub.lastRun?.date === date ? sub.lastRun.attempts + 1 : 1;
  setRun(sub.deviceHash, { date, status: 'running', attempts, lastAttemptAt: now.getTime(), error: undefined });
  let job = ensureDailyJob(sub, date, true);
  setRun(sub.deviceHash, { jobId: job.id });
  try {
    if (job.sends.some((x) => x.ok)) {
      // 이미 보냄
    } else if (job.images.length && (job.status === 'generated' || (job.status === 'failed' && job.stage === 'send'))) {
      job = await sendJob(job.id, true);
    } else {
      store.update((s) => {
        const j = s.jobs[job.id];
        if (j) {
          j.autoSend = true;
          j.autoSendDone = false;
          j.noPhoto = !sub.includePhotos || !photosConfigured();
        }
      });
      await runGenerate(job.id, { noPhoto: !sub.includePhotos || !photosConfigured() });
      job = await waitFor(job.id);
    }
  } catch (e) {
    console.error('[daily] 실행 오류:', (e as Error).message);
  }
  job = getJob(job.id)!;
  const ok = job.sends.some((x) => x.ok);
  setRun(sub.deviceHash, { status: ok ? 'ok' : 'failed', error: ok ? undefined : job.error ?? '알 수 없는 오류' });
  return job;
}

let timer: NodeJS.Timeout | null = null;
const inProgress = new Set<string>();

export function startScheduler(intervalMs = 30_000) {
  if (timer) return;
  const tick = () => {
    const now = new Date();
    for (const sub of Object.values(store.get().subscriptions)) {
      if (inProgress.has(sub.deviceHash) || !isDue(sub, now)) continue;
      inProgress.add(sub.deviceHash);
      void runDaily(sub, now).finally(() => inProgress.delete(sub.deviceHash));
    }
  };
  timer = setInterval(tick, intervalMs);
  setTimeout(tick, 2000);
  console.log('[daily] 데일리 카드뉴스 스케줄러 시작 (30초 간격 확인)');
}

export function stopScheduler() {
  if (timer) clearInterval(timer);
  timer = null;
}
