import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import express from 'express';
import { z } from 'zod';

try {
  process.loadEnvFile?.(resolve(process.cwd(), '.env'));
} catch {
  /* .env 없음 — 환경변수를 직접 설정한 경우 */
}

const { INSTRUMENT_BY_CODE } = await import('../shared/instruments');
const { ALL_LESSONS } = await import('../shared/curriculum');
const { discordStatus, sendToDiscord, DiscordError } = await import('./lib/discord');
const { ApiError, errorHandler, methodNotAllowed, route, sendError } = await import('./lib/http');
const { createJob, ensureDailyJob, getJob, hashDevice, isRunning, listJobs, runGenerate, sendJob } = await import('./lib/jobs');
const { isDue, nextRunAt, startScheduler } = await import('./lib/daily');
const { fetchNews } = await import('./lib/news');
const { photosConfigured } = await import('./lib/photos');
const { getGlobal, getIndex, getQuote, getQuotes, primaryProvider, providerChain, providerSetting, refreshSeconds } = await import('./lib/quotes');
const { kisConfigured } = await import('./lib/providers/kis');
const { realtimeStatus } = await import('./lib/providers/kisRealtime');
const { aiConfigured, runAiTask, AI_TASKS } = await import('./lib/ai');
const { rateLimit } = await import('./lib/rateLimit');
const { purchaseRouter, naverConfigured } = await import('./lib/purchase');
const { jobDir, store } = await import('./lib/store');
const { publicJob } = await import('./lib/types');
const { todayKST } = await import('../shared/dates');
import type { Quote } from '../shared/market';
import type { Subscription } from './lib/types';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', 'loopback');
// 사진 판독은 본문이 커서 전역 20kb 제한보다 먼저 연결한다
app.use('/api/purchase', purchaseRouter());
app.use(express.json({ limit: '20kb' }));

const DeviceId = z.string().regex(/^[0-9a-f-]{20,64}$/i, '기기 ID 형식 오류');

function deviceOf(req: express.Request): string {
  const r = DeviceId.safeParse(req.header('x-device-id') ?? req.query.device);
  if (!r.success) throw new ApiError(400, 'device_required', '기기 식별값이 없어요. 앱을 새로고침해 주세요.');
  return r.data;
}

const api = express.Router();

function marketInfo() {
  const p = primaryProvider();
  return { setting: providerSetting(), chain: providerChain(), primary: p, refreshSec: refreshSeconds(p), kis: kisConfigured(), realtime: realtimeStatus() };
}

api
  .route('/health')
  .get((_req, res) => {
    res.json({ ok: true, market: marketInfo(), photos: photosConfigured(), ai: aiConfigured(), priceSearch: naverConfigured(), discord: discordStatus().configured, time: Date.now() });
  })
  .all(methodNotAllowed(['GET']));

/* ── 모아 AI (실제 모델은 ANTHROPIC_API_KEY 있을 때만) ── */
const aiLimiter = rateLimit('ai', 30, 60_000);
api
  .route('/ai/:task')
  .post(
    aiLimiter,
    route(async (req, res) => {
      const task = String(req.params.task) as (typeof AI_TASKS)[number];
      if (!AI_TASKS.includes(task)) throw new ApiError(404, 'unknown_task', '알 수 없는 AI 작업이에요.');
      const input = (req.body as { input?: unknown })?.input;
      if (!input || typeof input !== 'object') throw new ApiError(400, 'bad_input', '입력이 없어요.');
      const data = await runAiTask(task, input);
      if (data === null) throw new ApiError(503, 'ai_unavailable', 'AI를 지금 쓸 수 없어요.');
      res.json({ data });
    }),
  )
  .all(methodNotAllowed(['POST']));

/* ── 시세 ── */
const quoteLimiter = rateLimit('quotes', 240, 60_000);
const slim = (q: Quote, keep = 5) => ({ ...q, candles: q.candles.slice(-keep) });

api
  .route('/quotes')
  .get(
    quoteLimiter,
    route(async (req, res) => {
      const codes = String(req.query.codes ?? '').split(',').map((c) => c.trim()).filter((c) => INSTRUMENT_BY_CODE[c]).slice(0, 20);
      const r = await getQuotes(codes);
      res.json({ market: marketInfo(), results: codes.map((code) => (r.quotes[code] ? { code, quote: slim(r.quotes[code]) } : { code, error: r.errors[code] ?? '시세를 가져오지 못했어요.' })) });
    }),
  )
  .all(methodNotAllowed(['GET']));

api
  .route('/quotes/:code')
  .get(
    quoteLimiter,
    route(async (req, res) => {
      res.json({ quote: await getQuote(req.params.code), market: marketInfo() });
    }),
  )
  .all(methodNotAllowed(['GET']));

api
  .route('/market')
  .get(
    quoteLimiter,
    route(async (_req, res) => {
      const [kospi, kosdaq, global] = await Promise.all([getIndex('KOSPI').catch((e) => ({ error: (e as Error).message })), getIndex('KOSDAQ').catch((e) => ({ error: (e as Error).message })), getGlobal().catch(() => [])]);
      res.json({ kospi, kosdaq, global, market: marketInfo() });
    }),
  )
  .all(methodNotAllowed(['GET']));

/** 실시간 스트림(SSE): 보고 있는 종목 시세를 제공처 주기에 맞춰 밀어준다 */
const streamsByIp = new Map<string, number>();
api.get('/stream', (req, res) => {
  const codes = String(req.query.codes ?? '').split(',').map((c) => c.trim()).filter((c) => INSTRUMENT_BY_CODE[c]).slice(0, 20);
  const ip = req.ip ?? 'x';
  if ((streamsByIp.get(ip) ?? 0) >= 6) return sendError(res, 429, 'too_many_streams', '동시에 열 수 있는 실시간 연결 수를 넘었어요.', true);
  streamsByIp.set(ip, (streamsByIp.get(ip) ?? 0) + 1);
  res.writeHead(200, { 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-cache, no-transform', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
  let closed = false;
  let lastIdx = 0;
  const push = async () => {
    if (closed) return;
    try {
      if (codes.length) {
        const r = await getQuotes(codes);
        res.write(`event: quotes\ndata: ${JSON.stringify({ quotes: Object.fromEntries(Object.entries(r.quotes).map(([c, q]) => [c, slim(q)])), errors: r.errors, at: Date.now(), market: marketInfo() })}\n\n`);
      }
      if (Date.now() - lastIdx > 15_000) {
        lastIdx = Date.now();
        const kospi = await getIndex('KOSPI').catch(() => null);
        if (kospi) res.write(`event: index\ndata: ${JSON.stringify({ kospi })}\n\n`);
      }
    } catch (e) {
      res.write(`event: error\ndata: ${JSON.stringify({ message: (e as Error).message })}\n\n`);
    }
    if (!closed) timer = setTimeout(push, refreshSeconds(primaryProvider()) * 1000);
  };
  let timer: NodeJS.Timeout = setTimeout(push, 0);
  const ping = setInterval(() => res.write(': ping\n\n'), 15_000);
  req.on('close', () => {
    closed = true;
    clearTimeout(timer);
    clearInterval(ping);
    streamsByIp.set(ip, Math.max(0, (streamsByIp.get(ip) ?? 1) - 1));
  });
});

api
  .route('/news/:code')
  .get(
    rateLimit('news', 30, 60_000),
    route(async (req, res) => {
      const inst = INSTRUMENT_BY_CODE[req.params.code];
      if (!inst) throw new ApiError(404, 'unknown_instrument', '지원하지 않는 종목이에요.');
      const r = await fetchNews(inst.name);
      res.json({ items: r.items.slice(0, 5), error: r.error, source: 'Google 뉴스 검색(최근 3일)' });
    }),
  )
  .all(methodNotAllowed(['GET']));

/* ── Discord ── */
api
  .route('/discord/status')
  .get((_req, res) => res.json(discordStatus()))
  .all(methodNotAllowed(['GET']));

api
  .route('/discord/test')
  .post(
    rateLimit('discord-test', 3, 60_000),
    route(async (req, res) => {
      deviceOf(req);
      try {
        await sendToDiscord('✅ 평행통장 연결 확인 메시지예요. 데일리 카드뉴스와 모의투자 카드뉴스가 이 채널로 전송됩니다.');
        res.json({ ok: true, status: discordStatus() });
      } catch (e) {
        const msg = e instanceof DiscordError ? e.message : 'Discord 연결 확인에 실패했어요.';
        sendError(res, 502, 'discord_failed', msg, e instanceof DiscordError ? e.retryable : true);
      }
    }),
  )
  .all(methodNotAllowed(['POST']));

/* ── 데일리 카드뉴스 구독 ── */
const SubSchema = z.object({
  enabled: z.boolean(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  nickname: z.string().trim().max(12).optional(),
  includePhotos: z.boolean(),
  level: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  nextLessonId: z.string().refine((id) => ALL_LESSONS.some((l) => l.id === id)).nullable(),
  streak: z.number().int().min(0).max(10000),
  holdings: z.array(z.object({ code: z.string().refine((c) => !!INSTRUMENT_BY_CODE[c]), qty: z.number().int().min(1).max(1_000_000), avgPrice: z.number().positive().max(100_000_000) })).max(30),
  watchlist: z.array(z.string().refine((c) => !!INSTRUMENT_BY_CODE[c])).max(20),
});

function publicSub(s: Subscription | undefined) {
  if (!s) return null;
  return { enabled: s.enabled, time: s.time, nickname: s.nickname ?? '', includePhotos: s.includePhotos, lastRun: s.lastRun ?? null, nextRunAt: nextRunAt(s), dueNow: isDue(s), updatedAt: s.updatedAt };
}

api
  .route('/daily/subscription')
  .get(
    route(async (req, res) => {
      const h = hashDevice(deviceOf(req));
      res.json({ subscription: publicSub(store.get().subscriptions[h]), discord: discordStatus().configured, photos: photosConfigured() });
    }),
  )
  .put(
    rateLimit('daily-sub', 60, 60_000),
    route(async (req, res) => {
      const h = hashDevice(deviceOf(req));
      const body = SubSchema.parse(req.body);
      store.update((s) => {
        const prev = s.subscriptions[h];
        s.subscriptions[h] = { ...prev, ...body, nickname: body.nickname || undefined, deviceHash: h, createdAt: prev?.createdAt ?? Date.now(), updatedAt: Date.now() };
      });
      res.json({ subscription: publicSub(store.get().subscriptions[h]) });
    }),
  )
  .delete(
    route(async (req, res) => {
      const h = hashDevice(deviceOf(req));
      store.update((s) => {
        delete s.subscriptions[h];
      });
      res.json({ subscription: null });
    }),
  )
  .all(methodNotAllowed(['GET', 'PUT', 'DELETE']));

api
  .route('/daily/latest')
  .get(
    route(async (req, res) => {
      const jobs = listJobs(deviceOf(req)).filter((j) => j.kind === 'daily');
      res.json({ job: jobs[0] ? publicJob(jobs[0]) : null, history: jobs.slice(0, 14).map(publicJob) });
    }),
  )
  .all(methodNotAllowed(['GET']));

/** 앱에서 오늘 카드를 미리 보기 (Discord로 보내지 않음 — 전송은 스케줄러가 정해진 시각에) */
api
  .route('/daily/preview')
  .post(
    rateLimit('daily-preview', 6, 10 * 60_000),
    route(async (req, res) => {
      const h = hashDevice(deviceOf(req));
      const sub = store.get().subscriptions[h];
      if (!sub) throw new ApiError(409, 'no_subscription', '먼저 데일리 카드뉴스를 켜 주세요.');
      const job = ensureDailyJob(sub, todayKST(), false);
      if (!isRunning(job.id) && (job.status === 'failed' ? job.stage !== 'send' : !job.images.length)) void runGenerate(job.id, { noPhoto: !sub.includePhotos || !photosConfigured() });
      res.status(202).json({ job: publicJob(getJob(job.id)!) });
    }),
  )
  .all(methodNotAllowed(['POST']));

/* ── 카드뉴스 ── */
const TradeSchema = z.object({
  tradeId: z.string().min(4).max(80).regex(/^[\w-]+$/),
  code: z.string().refine((c) => !!INSTRUMENT_BY_CODE[c], '지원 종목 아님'),
  side: z.enum(['buy', 'sell']),
  qty: z.number().int().min(1).max(1_000_000),
  price: z.number().positive().max(100_000_000),
  filledAt: z.number().int().positive(),
  avgPriceBefore: z.number().positive().optional(),
  holdingQty: z.number().int().min(0).optional(),
  holdingAvg: z.number().positive().optional(),
  weightPct: z.number().min(0).max(100).optional(),
  priceSource: z.enum(['kis', 'naver', 'yahoo', 'demo']),
});

const CreateSchema = z.object({ trade: TradeSchema, level: z.union([z.literal(1), z.literal(2), z.literal(3)]), autoSend: z.boolean() });

api
  .route('/cardnews')
  .get(route(async (req, res) => res.json({ jobs: listJobs(deviceOf(req)).map(publicJob) })))
  .post(
    rateLimit('cardnews-create', 12, 10 * 60_000),
    route(async (req, res) => {
      const device = deviceOf(req);
      const body = CreateSchema.parse(req.body);
      const q = await getQuote(body.trade.code).catch(() => null);
      if (q) {
        const lo = Math.min(...q.candles.map((c) => c.low), q.price) * 0.7;
        const hi = Math.max(...q.candles.map((c) => c.high), q.price) * 1.3;
        if (body.trade.price < lo || body.trade.price > hi) throw new ApiError(400, 'price_out_of_range', '체결가가 최근 시세 범위와 맞지 않아요.');
      }
      if (body.trade.filledAt > Date.now() + 60_000) throw new ApiError(400, 'bad_time', '체결 시각이 올바르지 않아요.');
      const { job, created } = createJob(device, body.trade, body.level, body.autoSend);
      res.status(created ? 201 : 200).json({ job: publicJob(job), created });
    }),
  )
  .all(methodNotAllowed(['GET', 'POST']));

function ownJob(req: express.Request) {
  const device = deviceOf(req);
  const job = getJob(req.params.id);
  if (!job || job.deviceHash !== hashDevice(device)) throw new ApiError(404, 'not_found', '카드뉴스를 찾지 못했어요.');
  return job;
}

api
  .route('/cardnews/:id')
  .get(route(async (req, res) => { const job = ownJob(req); res.json({ job: publicJob(job), running: isRunning(job.id) }); }))
  .all(methodNotAllowed(['GET']));

api
  .route('/cardnews/:id/regenerate')
  .post(
    rateLimit('cardnews-regen', 10, 10 * 60_000),
    route(async (req, res) => {
      const job = ownJob(req);
      if (isRunning(job.id)) throw new ApiError(409, 'busy', '이미 처리 중이에요.');
      const noPhoto = z.object({ noPhoto: z.boolean().optional() }).parse(req.body ?? {}).noPhoto;
      // 아직 한 번도 보내지 못한 자동 전송 작업은 다시 만든 뒤 자동으로 보낸다
      if (job.autoSend && !job.sends.some((s) => s.ok)) store.update((s) => { s.jobs[job.id].autoSendDone = false; });
      void runGenerate(job.id, { noPhoto });
      res.status(202).json({ job: publicJob(getJob(job.id)!) });
    }),
  )
  .all(methodNotAllowed(['POST']));

/** 전송 실패 후 '다시 시도' 전용 (평소 전송은 자동) */
api
  .route('/cardnews/:id/retry-send')
  .post(
    rateLimit('cardnews-send', 10, 10 * 60_000),
    route(async (req, res) => {
      const job = ownJob(req);
      if (!(job.status === 'failed' && job.stage === 'send')) throw new ApiError(409, 'not_failed', '전송에 실패한 카드뉴스만 다시 보낼 수 있어요.');
      res.json({ job: publicJob(await sendJob(job.id, false)) });
    }),
  )
  .all(methodNotAllowed(['POST']));

api.get('/cardnews/:id/images/:file', (req, res) => {
  const job = getJob(req.params.id);
  const file = req.params.file;
  if (!job || req.query.t !== job.token || !/^[1-4]\.png$/.test(file) || !job.images.includes(file)) return sendError(res, 404, 'not_found', '이미지를 찾지 못했어요.');
  const path = join(jobDir(job.id), file);
  if (!existsSync(path)) return sendError(res, 404, 'not_found', '이미지 파일이 없어요.');
  res.setHeader('Cache-Control', 'private, max-age=86400');
  res.type('image/png').send(readFileSync(path));
});

api.all('*', (_req, res) => sendError(res, 404, 'not_found', '없는 API 주소예요.'));

app.use('/api', api);
app.use(errorHandler);

const dist = resolve(process.cwd(), 'dist');
if (process.env.NODE_ENV === 'production' && existsSync(dist)) {
  app.use(express.static(dist, { index: false, maxAge: '1h' }));
  app.get('*', (_req, res) => res.sendFile(join(dist, 'index.html')));
}

const port = Number(process.env.PORT ?? 8787);
if (process.env.VITEST !== 'true' && !process.env.VERCEL) {
  app.listen(port, () => {
    const s = discordStatus();
    const m = marketInfo();
    console.log(`[평행통장 API] http://localhost:${port}`);
    console.log(`  시세: ${m.chain.join(' → ')} (설정 ${m.setting}${m.kis ? ', KIS 키 있음' : ''})  사진: ${photosConfigured() ? '설정됨' : '미설정'}  AI 요약: ${aiConfigured() ? '켜짐' : '꺼짐'}  Discord: ${s.configured ? '설정됨' : s.misconfigured ? '형식 오류' : '미설정'}`);
    if (process.env.DAILY_SCHEDULER !== 'off') startScheduler();
  });
}

export { app };
