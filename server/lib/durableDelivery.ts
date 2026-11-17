import { createHash, randomUUID, timingSafeEqual } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RequestHandler } from 'express';
import { learningBackend, learningJson } from './learningBackend';
import { store, jobDir } from './store';

let queue: Promise<void> = Promise.resolve();
let transaction: {device:string; owner:string; saved:string} | null = null;
const uploaded = new Map<string,string>();

export function internalAuthorized(value: string | undefined): boolean {
  const expected = process.env.MOA_INTERNAL_SECRET;
  return !!expected && !!value && value.length === expected.length && timingSafeEqual(Buffer.from(value),Buffer.from(expected));
}

export async function checkpointDelivery() {
  if (!transaction) return;
  const state = store.get();
  for (const job of Object.values(state.jobs)) for (const file of job.images) {
    const path = join(jobDir(job.id),file);
    if (!existsSync(path)) continue;
    const stamp = `${statSync(path).mtimeMs}:${statSync(path).size}`;
    if (uploaded.get(path) === stamp) continue;
    await learningJson(`/internal/card-images/${job.id}/${Number(file.split('.')[0])}`, 'PUT', {png_base64:readFileSync(path).toString('base64')});
    uploaded.set(path,stamp);
  }
  const snapshot = JSON.stringify(state);
  if (snapshot === transaction.saved) return;
  await learningJson(`/internal/card-state/${transaction.device}`, 'POST', {action:'save',owner:transaction.owner,state});
  transaction.saved = snapshot;
}

/** Serialize the legacy in-memory renderer per process; lease each device across instances. */
export const durableDelivery: RequestHandler = async (req,res,next) => {
  if (process.env.MOA_DURABLE_DELIVERY !== 'on' || !/^\/api\/(?:cardnews|discord\/trade-card|daily\/|internal\/daily\/run)/.test(req.originalUrl)) return next();
  let device = '';
  if (/^\/api\/cardnews\/[a-f0-9-]{36}\/images\//.test(req.originalUrl) && typeof req.query.dh==='string' && /^[a-f0-9]{32}$/.test(req.query.dh)) {
    // Image links already carry an unguessable per-job capability, checked by the image route.
    device=req.query.dh;
  } else if (req.originalUrl.startsWith('/api/internal/daily/run')) {
    if (!internalAuthorized(req.header('X-MOA-Internal-Secret'))) return res.status(401).json({error:{code:'internal_access_required'}});
    device = req.header('X-MOA-Device-Hash') || '';
  } else {
    const raw = req.header('x-device-id') || String(req.query.device || '');
    if (!/^[0-9a-f-]{20,64}$/i.test(raw)) return res.status(400).json({error:{code:'device_required',message:'기기 식별값이 필요해요.'}});
    device = createHash('sha256').update('pb:'+raw).digest('hex').slice(0,32);
  }
  if (!/^[a-f0-9]{32}$/.test(device)) return res.status(400).json({error:{code:'invalid_device'}});
  const previous = queue;
  let unlock!: () => void;
  queue = new Promise<void>(resolve => {unlock=resolve;});
  await previous;
  const owner = randomUUID();
  const readOnly = req.method === 'GET';
  const release = async () => {
    transaction = null;
    if (!readOnly) await learningJson(`/internal/card-state/${device}`, 'POST', {action:'release',owner}).catch(()=>undefined);
    unlock();
  };
  try {
    const loaded = await learningJson<{state:ReturnType<typeof store.get>|null}>(`/internal/card-state/${device}`, readOnly ? 'GET' : 'POST', readOnly ? undefined : {action:'acquire',owner});
    store.reset();
    if (loaded.state) store.replace(loaded.state);
    transaction = readOnly ? null : {device,owner,saved:JSON.stringify(store.get())};
    // A persisted send intent has an uncertain outcome after a crash: never resend automatically.
    for (const job of Object.values(store.get().jobs)) {
      if (job.status === 'sending') {
        job.status='failed'; job.stage='send'; job.retryable=false;
        job.error='이전 전송의 응답이 확인되지 않았어요. Discord 채널에서 먼저 확인해 주세요.';
      } else if (job.status === 'generating') {
        job.status='failed'; job.retryable=true; job.error='중단된 생성을 다시 시도할 수 있어요.';
      }
    }
    const jobId = req.originalUrl.match(/\/cardnews\/([a-f0-9-]{36})/)?.[1];
    const needsDaily = req.originalUrl.startsWith('/api/internal/daily/run');
    for (const job of Object.values(store.get().jobs).filter(j=>j.id===jobId || (needsDaily && j.kind==='daily'))) {
      for (const file of job.images) {
        const response = await learningBackend(`/internal/card-images/${job.id}/${Number(file.split('.')[0])}`);
        if (!response.ok) continue;
        mkdirSync(jobDir(job.id),{recursive:true});
        const path=join(jobDir(job.id),file);
        writeFileSync(path,Buffer.from(await response.arrayBuffer()));
        uploaded.set(path,`${statSync(path).mtimeMs}:${statSync(path).size}`);
      }
    }
    const end = res.end;
    let finishing=false;
    res.end = ((...args: any[]) => {
      if (finishing) return res;
      finishing=true;
      void (async()=>{
        try {await checkpointDelivery(); await release(); end.apply(res,args as Parameters<typeof end>);}
        catch {await release(); res.removeHeader('content-length');res.statusCode=503;res.setHeader('Content-Type','application/json');end.apply(res,[JSON.stringify({error:{code:'durable_save_failed',message:'카드 저장에 실패했어요. 성공으로 처리하지 않았어요.'}}),'utf8',()=>undefined]);}
      })();
      return res;
    }) as typeof res.end;
    next();
  } catch {
    await release();
    res.status(503).json({error:{code:'delivery_store_busy',message:'카드 저장소를 처리 중이에요. 잠시 후 다시 시도해 주세요.',retryable:true}});
  }
};
