import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_LESSONS, LESSON_BY_ID, UNITS, dailyQuizFor } from '../../shared/curriculum';
import { INSTRUMENT_BY_CODE } from '../../shared/instruments';
import { isTradingDay, marketStatus } from '../../shared/krx';
import type { Level } from '../../shared/knowledge';
import type { Quote } from '../../shared/market';
import { aiSummary } from './ai';
import { buildCards, buildDailyCards, dailySummary, discordSummary, type CardSpec, type DailyCardInput } from './cardContent';
import { DiscordError, sendToDiscord } from './discord';
import { explainMove, peersOf } from './explain';
import { ApiError } from './http';
import { fetchNews } from './news';
import { PhotoError, photosConfigured, pickPhotos } from './photos';
import { getGlobal, getIndex, getQuote, getQuotes } from './quotes';
import { renderCard } from './render';
import { jobDir, store } from './store';
import type { CardJob, Subscription, TradeInput } from './types';

export function hashDevice(deviceId: string): string {
  return createHash('sha256').update('pb:' + deviceId).digest('hex').slice(0, 32);
}

const running = new Set<string>();

function patch(id: string, p: Partial<CardJob>) {
  store.update((s) => {
    const j = s.jobs[id];
    if (j) s.jobs[id] = { ...j, ...p, updatedAt: Date.now() };
  });
}

export function getJob(id: string): CardJob | undefined {
  return store.get().jobs[id];
}

function newJob(p: Pick<CardJob, 'kind' | 'deviceHash' | 'tradeId' | 'name' | 'level' | 'autoSend'> & Partial<CardJob>): CardJob {
  const now = Date.now();
  return {
    id: randomUUID(),
    token: randomBytes(16).toString('hex'),
    createdAt: now,
    updatedAt: now,
    status: 'generating',
    retryable: false,
    autoSendDone: false,
    noPhoto: false,
    images: [],
    photos: [],
    news: [],
    titles: [],
    summary: '',
    sends: [],
    ...p,
  };
}

/** 거래 ID 기준으로 멱등: 같은 거래로 두 번 요청해도 작업은 하나 */
export function createJob(deviceId: string, trade: TradeInput, level: Level, autoSend: boolean): { job: CardJob; created: boolean } {
  const deviceHash = hashDevice(deviceId);
  const key = `${deviceHash}:${trade.tradeId}`;
  const existingId = store.get().jobByTrade[key];
  if (existingId && store.get().jobs[existingId]) return { job: store.get().jobs[existingId], created: false };
  const inst = INSTRUMENT_BY_CODE[trade.code];
  if (!inst) throw new ApiError(400, 'unknown_instrument', '지원하지 않는 종목이에요.');
  const job = newJob({ kind: 'trade', deviceHash, tradeId: trade.tradeId, trade, name: inst.name, level, autoSend, noPhoto: !photosConfigured(), notice: photosConfigured() ? undefined : '서버에 사진 키(PIXABAY_API_KEY 또는 PEXELS_API_KEY)가 없어 사진 없이 만들었어요. 카드에도 표시돼요.' });
  store.update((s) => {
    s.jobs[job.id] = job;
    s.jobByTrade[key] = job.id;
  });
  void runGenerate(job.id);
  return { job, created: true };
}

/** 데일리 작업: 기기·날짜당 하나 */
export function ensureDailyJob(sub: Subscription, date: string, autoSend: boolean): CardJob {
  const key = `${sub.deviceHash}:daily-${date}`;
  const existingId = store.get().jobByTrade[key];
  if (existingId && store.get().jobs[existingId]) return store.get().jobs[existingId];
  const job = newJob({ kind: 'daily', deviceHash: sub.deviceHash, tradeId: `daily-${date}`, dailyDate: date, name: '데일리 브리핑', level: sub.level, autoSend, noPhoto: !sub.includePhotos || !photosConfigured() });
  store.update((s) => {
    s.jobs[job.id] = job;
    s.jobByTrade[key] = job.id;
  });
  return job;
}

export function listJobs(deviceId: string): CardJob[] {
  const h = hashDevice(deviceId);
  return Object.values(store.get().jobs)
    .filter((j) => j.deviceHash === h)
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, 40);
}

function fail(id: string, stage: CardJob['stage'], error: string) {
  patch(id, { status: 'failed', stage, error, retryable: true });
}

/* ── 카드 내용 만들기 ── */
async function tradeContent(job: CardJob) {
  const trade = job.trade!;
  const inst = INSTRUMENT_BY_CODE[trade.code];
  const quote = await getQuote(trade.code);
  const [kospi, peersRes, global, news] = await Promise.all([
    getIndex('KOSPI').catch(() => null),
    getQuotes(peersOf(trade.code)).catch(() => ({ quotes: {} as Record<string, Quote>, errors: {} })),
    getGlobal().catch(() => []),
    fetchNews(inst.name),
  ]);
  const explanation = explainMove({ inst, quote, kospi, peers: Object.values(peersRes.quotes), global, news: news.items });
  const ai = await aiSummary(inst.name, explanation, job.level);
  const cards = buildCards({ trade, inst, quote, explanation, ai, level: job.level });
  return { cards, news: explanation.newsUsed, quote, headline: explanation.headline, summary: discordSummary(trade, inst.name, quote, explanation) };
}

async function dailyContent(job: CardJob) {
  const sub = store.get().subscriptions[job.deviceHash];
  if (!sub) throw new ApiError(404, 'no_subscription', '데일리 구독 정보가 없어요.');
  const date = job.dailyDate!;
  const holdCodes = sub.holdings.map((h) => h.code).filter((c) => INSTRUMENT_BY_CODE[c]);
  const watchCodes = sub.watchlist.filter((c) => INSTRUMENT_BY_CODE[c] && !holdCodes.includes(c)).slice(0, 4);
  const [{ quotes }, kospi, kosdaq, global] = await Promise.all([
    getQuotes([...holdCodes, ...watchCodes]),
    getIndex('KOSPI').catch(() => null),
    getIndex('KOSDAQ').catch(() => null),
    getGlobal().catch(() => []),
  ]);
  if (!kospi && !Object.keys(quotes).length) throw new ApiError(502, 'no_data', '시세와 지수를 모두 받지 못했어요.', true);
  const holdings = sub.holdings.filter((h) => INSTRUMENT_BY_CODE[h.code]).map((h) => ({ inst: INSTRUMENT_BY_CODE[h.code], qty: h.qty, avgPrice: h.avgPrice, quote: quotes[h.code] ?? null }));
  const watch = watchCodes.map((c) => ({ inst: INSTRUMENT_BY_CODE[c], quote: quotes[c] ?? null }));
  // 분석할 종목: 보유 종목 중 가장 크게 움직인 것(하락 우선), 없으면 관심 종목
  const candidates = (holdings.length ? holdings : watch).filter((x) => x.quote && x.quote.changePct !== null);
  candidates.sort((a, b) => {
    const pa = a.quote!.changePct!, pb = b.quote!.changePct!;
    const wa = Math.abs(pa) * (pa < 0 ? 1.3 : 1), wb = Math.abs(pb) * (pb < 0 ? 1.3 : 1);
    return wb - wa;
  });
  let focus: DailyCardInput['focus'] = null;
  let newsUsed: CardJob['news'] = [];
  if (candidates[0]) {
    const { inst, quote } = candidates[0];
    const [peersRes, news] = await Promise.all([getQuotes(peersOf(inst.code)).catch(() => ({ quotes: {} as Record<string, Quote> })), fetchNews(inst.name)]);
    const explanation = explainMove({ inst, quote: quote!, kospi, peers: Object.values(peersRes.quotes), global, news: news.items });
    const ai = await aiSummary(inst.name, explanation, sub.level);
    focus = { inst, quote: quote!, explanation, ai };
    newsUsed = explanation.newsUsed;
  }
  const lesson = sub.nextLessonId ? LESSON_BY_ID[sub.nextLessonId] : null;
  const unit = lesson ? UNITS.find((u) => u.id === lesson.unit) : null;
  const ms = marketStatus();
  const input: DailyCardInput = {
    date,
    tradingDay: isTradingDay(date),
    session: ms.state,
    kospi,
    kosdaq,
    global,
    holdings,
    watch,
    focus,
    level: sub.level,
    streak: sub.streak,
    nextLesson: lesson && unit ? { title: lesson.title, unitTitle: `${unit.id}단원 ${unit.title}`, minutes: lesson.minutes } : null,
    quiz: dailyQuizFor(date, sub.nextLessonId ?? ALL_LESSONS[0].id),
    nickname: sub.nickname,
    appUrl: process.env.APP_URL,
  };
  const cards = buildDailyCards(input);
  const q = focus?.quote ?? Object.values(quotes)[0];
  return { cards, news: newsUsed, quote: q ?? null, headline: focus?.explanation.headline ?? '', summary: dailySummary(input) };
}

export async function runGenerate(id: string, opts: { noPhoto?: boolean } = {}): Promise<void> {
  if (running.has(id)) return;
  running.add(id);
  try {
    const job = getJob(id)!;
    const noPhoto = opts.noPhoto ?? job.noPhoto;
    patch(id, { status: 'generating', stage: 'data', error: undefined, retryable: false, noPhoto });

    let content: { cards: CardSpec[]; news: CardJob['news']; quote: Quote | null; headline: string; summary: string };
    try {
      content = job.kind === 'daily' ? await dailyContent(job) : await tradeContent(job);
    } catch (e) {
      return fail(id, 'data', `카드뉴스에 필요한 시세를 받지 못했어요. ${(e as Error).message}`);
    }
    const { cards } = content;

    patch(id, { stage: 'photo' });
    let photos: { meta: CardJob['photos'][number]; dataUri: string | null }[];
    if (noPhoto) {
      photos = cards.map((c) => ({ meta: { id: null, query: c.photoQuery, photographer: null, sourceUrl: null, provider: 'none' as const }, dataUri: null }));
    } else {
      try {
        photos = await pickPhotos(cards.map((c) => c.photoQuery));
      } catch (e) {
        return fail(id, 'photo', e instanceof PhotoError ? e.message : '사진을 고르지 못했어요.');
      }
    }

    patch(id, { stage: 'render' });
    const dir = jobDir(id);
    mkdirSync(dir, { recursive: true });
    const images: string[] = [];
    try {
      for (let i = 0; i < cards.length; i++) {
        writeFileSync(join(dir, `${i + 1}.png`), await renderCard(cards[i], photos[i]));
        images.push(`${i + 1}.png`);
      }
    } catch (e) {
      console.error('[cardnews] 렌더링 실패:', (e as Error).message);
      return fail(id, 'render', '카드 이미지를 만들지 못했어요.');
    }

    patch(id, {
      status: 'generated',
      stage: undefined,
      images,
      photos: photos.map((p) => p.meta),
      news: content.news,
      quoteMeta: content.quote ? { source: content.quote.source, time: content.quote.time, delayed: content.quote.delayed, live: content.quote.live, delayNote: content.quote.delayNote } : undefined,
      titles: cards.map((c) => c.title.replace('\n', ' ')),
      summary: content.summary,
      headline: content.headline,
    });

    const fresh = getJob(id)!;
    if (fresh.autoSend && !fresh.autoSendDone) {
      patch(id, { autoSendDone: true });
      running.delete(id);
      await sendJob(id, true);
    }
  } finally {
    running.delete(id);
  }
}

/** 전송: 자동(체결 직후·매일 정해진 시각) 또는 실패 후 사용자가 '다시 시도'를 눌렀을 때 */
export async function sendJob(id: string, auto: boolean): Promise<CardJob> {
  const job = getJob(id);
  if (!job) throw new ApiError(404, 'not_found', '카드뉴스를 찾지 못했어요.');
  if (!job.images.length) throw new ApiError(409, 'not_ready', '카드뉴스 이미지가 아직 없어요.');
  if (running.has(id)) throw new ApiError(409, 'busy', '이미 처리 중이에요.');
  running.add(id);
  patch(id, { status: 'sending', stage: 'send', error: undefined });
  try {
    const files = job.images.map((f, i) => ({ name: `parallel-bank-${job.kind}-${i + 1}.png`, data: readFileSync(join(jobDir(id), f)), description: job.titles[i] }));
    await sendToDiscord(job.summary, files);
    patch(id, { status: 'sent', stage: undefined, sends: [...job.sends, { at: Date.now(), auto, ok: true }] });
  } catch (e) {
    const msg = e instanceof DiscordError ? e.message : 'Discord 전송 중 오류가 생겼어요.';
    patch(id, { status: 'failed', stage: 'send', error: msg, retryable: e instanceof DiscordError ? e.retryable : true, sends: [...job.sends, { at: Date.now(), auto, ok: false, error: msg }] });
  } finally {
    running.delete(id);
  }
  return getJob(id)!;
}

export function isRunning(id: string) {
  return running.has(id);
}

/** 생성이 끝날 때까지 기다림 (스케줄러용) */
export async function waitFor(id: string, timeoutMs = 120_000): Promise<CardJob> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const j = getJob(id)!;
    if (!running.has(id) && j.status !== 'generating' && j.status !== 'sending') return j;
    await new Promise((r) => setTimeout(r, 300));
  }
  return getJob(id)!;
}
