import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ALL_LESSONS, LESSON_BY_ID, UNITS, dailyQuizFor } from '../../shared/curriculum';
import { STOCKS, livePrice } from '../../shared/demoMarket';
import type { Instrument } from '../../shared/instruments';
import type { Explanation } from './explain';
import { INSTRUMENT_BY_CODE } from '../../shared/instruments';
import { isTradingDay, marketStatus } from '../../shared/krx';
import type { Level } from '../../shared/knowledge';
import { todayKST } from '../../shared/dates';
import type { Quote } from '../../shared/market';
import { aiConfigured, aiSummary, summaryModel } from './ai';
import { demoLearningQuiz } from './learningQuiz';
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
import type { NewsItem } from './types';
import { checkpointDelivery } from './durableDelivery';

export function hashDevice(deviceId: string): string {
  return createHash('sha256').update('pb:' + deviceId).digest('hex').slice(0, 32);
}

const running = new Set<string>();

/** Do not reuse article links or titles already successfully sent to this device. */
export function unsentNews(job: CardJob, items: NewsItem[]): NewsItem[] {
  const sent = Object.values(store.get().jobs).filter((other) =>
    other.id !== job.id && other.deviceHash === job.deviceHash && other.sends.some((s) => s.ok));
  const links = new Set(sent.flatMap((other) => other.news.map((n) => n.link)));
  const titles = new Set(sent.flatMap((other) => other.news.map((n) => n.title.trim().toLocaleLowerCase())));
  return items.filter((n) => !links.has(n.link) && !titles.has(n.title.trim().toLocaleLowerCase()));
}

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
export function createJob(deviceId: string, trade: TradeInput, level: Level, autoSend: boolean, learningUserId = 'S01'): { job: CardJob; created: boolean } {
  const deviceHash = hashDevice(deviceId);
  const key = `${deviceHash}:${trade.tradeId}`;
  const existingId = store.get().jobByTrade[key];
  if (existingId && store.get().jobs[existingId]) return { job: store.get().jobs[existingId], created: false };
  const inst = INSTRUMENT_BY_CODE[trade.code] ?? STOCKS.find(s=>s.code===trade.code);
  if (!inst) throw new ApiError(400, 'unknown_instrument', '지원하지 않는 종목이에요.');
  const job = newJob({ kind: 'trade', deviceHash, tradeId: trade.tradeId, trade, name: inst.name, level, autoSend, learningUserId, noPhoto: !photosConfigured(), notice: photosConfigured() ? undefined : '서버에 사진 키(PIXABAY_API_KEY 또는 PEXELS_API_KEY)가 없어 사진 없이 만들었어요. 카드에도 표시돼요.' });
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
  const job = newJob({ dailyInput: autoSend ? undefined : structuredClone(sub), kind: 'daily', deviceHash: sub.deviceHash, tradeId: `daily-${date}`, dailyDate: date, name: '데일리 브리핑', level: sub.level, autoSend, noPhoto: !sub.includePhotos || !photosConfigured() });
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
  const simulation=STOCKS.find(s=>s.code===trade.code);
  const inst:Instrument=INSTRUMENT_BY_CODE[trade.code] ?? {code:trade.code,name:simulation!.name,type:'etf',market:'KOSPI',sector:'가상 시연',group:'simulation',aliases:[],photoTopics:['stock market chart screen'],summary:'가상 투자 학습용 종목으로 실제 시세가 아니에요.'};
  const now=Date.now();
  const simulatedPrice=simulation?livePrice(simulation.name,now):0;
  const quote:Quote=simulation?{code:trade.code,name:inst.name,price:simulatedPrice,time:now,date:todayKST(),prevClose:simulation.prevClose,prevCloseDate:null,change:simulatedPrice-simulation.prevClose,changePct:(simulatedPrice/simulation.prevClose-1)*100,dayHigh:null,dayLow:null,volume:null,source:'demo',live:false,delayed:false,delayNote:'앱의 가상 시세 생성기를 재사용한 학습용 값이에요. 실제 시장 시세가 아니에요.',fetchedAt:now,candles:[]}:await getQuote(trade.code);
  let explanation:Explanation;
  if(simulation){explanation={direction:'unknown',pct:quote.changePct,headline:inst.name+' · 가상 시세로 거래를 복기해요',facts:['앱의 가상 시세이며 실제 시장 가격이 아니에요.','입력한 체결가와 현재 가상 가격을 비교해요.'],reasons:[],unknown:'실제 시장의 상승·하락 원인으로 해석할 수 없어요.',newsUsed:[],summary:'가상 체결 기록을 이용한 학습이에요.'};}
  else{
    const [kospi,peersRes,global,news]=await Promise.all([getIndex('KOSPI').catch(()=>null),getQuotes(peersOf(trade.code)).catch(()=>({quotes:{} as Record<string,Quote>})),getGlobal().catch(()=>[]),fetchNews(inst.name)]);
    explanation=explainMove({inst,quote,kospi,peers:Object.values(peersRes.quotes),global,news:unsentNews(job,news.items)});
  }
  const ai=await aiSummary(inst.name,explanation,job.level);
  const cards = buildCards({ trade, inst, quote, explanation, ai, level: job.level });
  if(simulation){cards[0].stats[1].label='가상 기준가';cards[0].stats[2].label='가상 기준가 대비';}
  const learningDate = new Date(trade.filledAt + 9*3600000).toISOString().slice(0,10);
  const linked = process.env.MOA_FINANCE_API_BASE ? await demoLearningQuiz(learningDate,job.learningUserId || 'S01') : null;
  if (linked) cards[3] = {...cards[3],sections:[...cards[3].sections.slice(0,1),{heading:'연결된 맞춤 퀴즈',lines:[linked.quiz.q,...linked.quiz.options.map((v,i)=>String.fromCharCode(65+i)+'. '+v)]}],footer:'정답은 평행통장 카드뉴스 화면에서 확인해요 · 투자 권유 아님'};
  if(simulation) for(const card of cards) card.footer='가상 생성 시세 · 실제 거래 아님 · '+card.footer;
  return { cards, news: explanation.newsUsed, quote, headline: explanation.headline, summary: discordSummary(trade, inst.name, quote, explanation),
    aiStatus: ai ? 'live' as const : aiConfigured() ? 'not_generated' as const : 'not_configured' as const,
    aiModel: ai ? summaryModel() : null, learningDate,
    learningUserId:linked?.userId ?? null,learningQuizId:linked?.quizId ?? null };
}

async function dailyContent(job: CardJob) {
  const sub = job.dailyInput ?? store.get().subscriptions[job.deviceHash];
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
  let aiStatus: 'live' | 'not_generated' | 'not_configured' = aiConfigured() ? 'not_generated' : 'not_configured';
  if (candidates[0]) {
    const { inst, quote } = candidates[0];
    const [peersRes, news] = await Promise.all([getQuotes(peersOf(inst.code)).catch(() => ({ quotes: {} as Record<string, Quote> })), fetchNews(inst.name)]);
    const explanation = explainMove({ inst, quote: quote!, kospi, peers: Object.values(peersRes.quotes), global, news: unsentNews(job, news.items) });
    const ai = await aiSummary(inst.name, explanation, sub.level);
    if (ai) aiStatus = 'live';
    focus = { inst, quote: quote!, explanation, ai };
    newsUsed = explanation.newsUsed;
  }
  const lesson = sub.nextLessonId ? LESSON_BY_ID[sub.nextLessonId] : null;
  const linkedQuiz = await demoLearningQuiz(date,process.env.MOA_FINANCE_API_BASE ? sub.learningUserId || 'S01' : undefined);
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
    quiz: linkedQuiz?.quiz ?? dailyQuizFor(date, sub.nextLessonId ?? ALL_LESSONS[0].id),
    nickname: sub.nickname,
    appUrl: process.env.APP_URL,
  };
  const cards = buildDailyCards(input);
  const q = focus?.quote ?? Object.values(quotes)[0];
  return { cards, news: newsUsed, quote: q ?? null, headline: focus?.explanation.headline ?? '', summary: dailySummary(input),
    aiStatus, aiModel: aiStatus === 'live' ? summaryModel() : null,
    learningUserId: linkedQuiz?.userId ?? null, learningQuizId: linkedQuiz?.quizId ?? null };
}

export async function runGenerate(id: string, opts: { noPhoto?: boolean } = {}): Promise<void> {
  if (running.has(id)) return;
  running.add(id);
  try {
    const job = getJob(id)!;
    const noPhoto = opts.noPhoto ?? job.noPhoto;
    patch(id, { status: 'generating', stage: 'data', error: undefined, retryable: false, noPhoto });

    let content: { cards: CardSpec[]; news: CardJob['news']; quote: Quote | null; headline: string; summary: string; aiStatus: 'live' | 'not_generated' | 'not_configured'; aiModel: string | null; learningUserId?: string | null; learningQuizId?: string | null; learningDate?:string };
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
      aiStatus: content.aiStatus,
      aiModel: content.aiModel,
      learningUserId: content.learningUserId ?? null,
      learningQuizId: content.learningQuizId ?? null,
      learningDate: content.learningDate ?? job.dailyDate ?? null,
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
  if (job.sends.some((attempt) => attempt.ok)) return job;
  if (job.status==='failed' && job.stage==='send' && !job.retryable) throw new ApiError(409,'send_outcome_unknown','전송 여부가 불확실해요. 채널에서 먼저 확인해 주세요.');
  if (!job.images.length) throw new ApiError(409, 'not_ready', '카드뉴스 이미지가 아직 없어요.');
  if (running.has(id)) throw new ApiError(409, 'busy', '이미 처리 중이에요.');
  running.add(id);
  patch(id, { status: 'sending', stage: 'send', error: undefined });
  try {
    // Persist the send intent before the external side effect; a crash cannot silently resend.
    await checkpointDelivery();
    const files = job.images.map((f, i) => ({ name: `moa-${job.kind}-${i + 1}.png`, data: readFileSync(join(jobDir(id), f)), description: job.titles[i] }));
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
