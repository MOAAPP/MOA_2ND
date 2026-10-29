import { addDays, isoFromEpochKST, minutesKST, todayKST } from '../../shared/dates';
import { INSTRUMENT_BY_CODE, yahooSymbol } from '../../shared/instruments';
import { isTradingDay, prevTradingDay, SESSION_CLOSE_MIN, SESSION_OPEN_MIN } from '../../shared/krx';
import { changeFrom, previousClose, type Candle, type IndexQuote, type Quote, type QuoteSource } from '../../shared/market';
import { ApiError } from './http';
import { kisConfigured, kisDaily, kisIndex, kisPrice } from './providers/kis';
import { latestTick, wantRealtime } from './providers/kisRealtime';
import { naverIndex, naverStocks } from './providers/naver';
import { yahooChart } from './providers/yahoo';

export type ProviderSetting = 'auto' | 'kis' | 'naver' | 'yahoo' | 'demo';

export function providerSetting(): ProviderSetting {
  const v = (process.env.QUOTE_PROVIDER ?? 'auto').toLowerCase();
  return (['auto', 'kis', 'naver', 'yahoo', 'demo'] as const).includes(v as ProviderSetting) ? (v as ProviderSetting) : 'auto';
}

/** 실시간 가격을 시도할 순서 */
export function providerChain(): QuoteSource[] {
  const s = providerSetting();
  if (s === 'demo') return ['demo'];
  if (s === 'yahoo') return ['yahoo'];
  if (s === 'naver') return ['naver', 'yahoo'];
  if (s === 'kis') return ['kis', 'naver', 'yahoo'];
  return kisConfigured() ? ['kis', 'naver', 'yahoo'] : ['naver', 'yahoo'];
}

export function primaryProvider(): QuoteSource {
  return providerChain()[0];
}

/** 화면 갱신 주기(초): 실시간 제공처는 짧게, 지연 시세는 길게 */
export function refreshSeconds(src: QuoteSource): number {
  return src === 'yahoo' ? 30 : src === 'demo' ? 5 : 3;
}

const NOTES: Record<QuoteSource, string> = {
  kis: '한국투자증권 Open API 시세예요. 실시간 체결 스트림이 연결되면 체결 즉시 반영돼요.',
  naver: '네이버 금융 시세(비공식 경로)를 몇 초마다 다시 받아와요. 형식이 바뀌면 다른 제공처로 자동 전환돼요.',
  yahoo: 'Yahoo Finance 지연 시세예요. 실시간이 아니며 약 20분 이상 늦을 수 있어요.',
  demo: '예시 시세 — 실제 시장 가격이 아닌 연습용 숫자예요.',
};

/* ── 일봉(변동성·전 거래일 확인용): 10분 캐시 ── */
const candleCache = new Map<string, { at: number; candles: Candle[]; source: QuoteSource }>();

async function candlesFor(code: string): Promise<{ candles: Candle[]; source: QuoteSource | null }> {
  const hit = candleCache.get(code);
  if (hit && Date.now() - hit.at < 10 * 60_000) return { candles: hit.candles, source: hit.source };
  const tries: (() => Promise<{ candles: Candle[]; source: QuoteSource }>)[] = [];
  if (kisConfigured() && providerSetting() !== 'yahoo' && providerSetting() !== 'naver') tries.push(async () => ({ candles: await kisDaily(code), source: 'kis' }));
  tries.push(async () => ({ candles: (await yahooChart(yahooSymbol(code))).candles, source: 'yahoo' }));
  for (const t of tries) {
    try {
      const r = await t();
      if (r.candles.length) {
        candleCache.set(code, { at: Date.now(), ...r });
        return r;
      }
    } catch {
      /* 다음 제공처 */
    }
  }
  return hit ? { candles: hit.candles, source: hit.source } : { candles: [], source: null };
}

/* ── 가격 캐시 ── */
const priceCache = new Map<string, { at: number; quote: Quote }>();
const errors = new Map<string, string>();

function assemble(code: string, src: QuoteSource, live: boolean, p: { price: number; timeMs: number; change?: number | null; changePct?: number | null; prevClose?: number | null; open?: number | null; high?: number | null; low?: number | null; volume?: number | null }, candles: Candle[], candleSource: QuoteSource | null): Quote {
  const date = isoFromEpochKST(p.timeMs);
  const prevFromCandles = previousClose(candles, date);
  // 제공처의 전일 대비가 있으면 그 값을 우선, 없으면 일봉으로 계산
  let prevClose = p.prevClose ?? (p.change !== undefined && p.change !== null ? p.price - p.change : null) ?? prevFromCandles?.close ?? null;
  if (prevClose === null && prevFromCandles) prevClose = prevFromCandles.close;
  const ch = changeFrom(prevClose, p.price);
  const today = candles.find((c) => c.date === date);
  return {
    code,
    name: INSTRUMENT_BY_CODE[code]?.name ?? code,
    price: p.price,
    time: p.timeMs,
    date,
    prevClose,
    prevCloseDate: prevFromCandles?.date ?? (prevClose !== null ? prevTradingDay(date) : null),
    change: ch?.change ?? null,
    changePct: ch?.pct ?? null,
    dayOpen: p.open ?? today?.open ?? null,
    dayHigh: p.high ?? today?.high ?? null,
    dayLow: p.low ?? today?.low ?? null,
    volume: p.volume ?? today?.volume ?? null,
    source: src,
    live,
    delayed: src === 'yahoo',
    delayNote: NOTES[src],
    fetchedAt: Date.now(),
    candles: candles.slice(-60),
    candleSource,
  };
}

async function fetchFrom(src: QuoteSource, codes: string[]): Promise<Record<string, Quote>> {
  const out: Record<string, Quote> = {};
  const candleMap = Object.fromEntries(await Promise.all(codes.map(async (c) => [c, await candlesFor(c)] as const)));
  if (src === 'demo') {
    for (const c of codes) out[c] = demoQuote(c);
    return out;
  }
  if (src === 'naver') {
    const r = await naverStocks(codes);
    for (const c of codes) {
      const q = r[c];
      if (q) out[c] = assemble(c, 'naver', false, { price: q.price, timeMs: q.timeMs, change: q.change, open: q.open, high: q.high, low: q.low, volume: q.volume }, candleMap[c].candles, candleMap[c].source);
    }
    return out;
  }
  if (src === 'kis') {
    wantRealtime(codes);
    await Promise.all(
      codes.map(async (c) => {
        const tick = latestTick(c);
        if (tick) {
          out[c] = assemble(c, 'kis', true, { price: tick.price, timeMs: tick.timeMs, change: tick.change, open: tick.open, high: tick.high, low: tick.low, volume: tick.volume }, candleMap[c].candles, candleMap[c].source);
          return;
        }
        const p = await kisPrice(c);
        out[c] = assemble(c, 'kis', false, { price: p.price, timeMs: kisTimeNow(), change: p.change, prevClose: p.prevClose, open: p.open, high: p.high, low: p.low, volume: p.volume }, candleMap[c].candles, candleMap[c].source);
      }),
    );
    return out;
  }
  // yahoo
  await Promise.all(
    codes.map(async (c) => {
      const y = await yahooChart(yahooSymbol(c));
      out[c] = assemble(c, 'yahoo', false, { price: y.price, timeMs: y.timeMs, high: y.dayHigh, low: y.dayLow, volume: y.volume }, y.candles.length ? y.candles : candleMap[c].candles, y.candles.length ? 'yahoo' : candleMap[c].source);
    }),
  );
  return out;
}

/** KIS REST 현재가에는 체결 시각이 없어, 장중엔 지금 시각·장 밖엔 마지막 장 마감 시각으로 표시 */
function kisTimeNow(): number {
  const today = todayKST();
  const min = minutesKST();
  if (isTradingDay(today) && min >= SESSION_OPEN_MIN && min < SESSION_CLOSE_MIN) return Date.now();
  const d = isTradingDay(today) && min >= SESSION_CLOSE_MIN ? today : prevTradingDay(today);
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day, 6, 30);
}

/** 여러 종목 시세. 제공처 순서대로 시도하고 실패한 종목만 다음 제공처로 넘긴다. */
export async function getQuotes(codes: string[]): Promise<{ quotes: Record<string, Quote>; errors: Record<string, string> }> {
  const valid = [...new Set(codes)].filter((c) => INSTRUMENT_BY_CODE[c]);
  const quotes: Record<string, Quote> = {};
  const errs: Record<string, string> = {};
  let pending: string[] = [];
  for (const c of valid) {
    const hit = priceCache.get(c);
    if (hit && Date.now() - hit.at < refreshSeconds(hit.quote.source) * 1000 * 0.8) quotes[c] = hit.quote;
    else pending.push(c);
  }
  const chain = providerChain();
  for (const src of chain) {
    if (!pending.length) break;
    try {
      const got = await fetchFrom(src, pending);
      for (const [c, q] of Object.entries(got)) {
        quotes[c] = q;
        priceCache.set(c, { at: Date.now(), quote: q });
        errors.delete(c);
      }
      pending = pending.filter((c) => !got[c]);
    } catch (e) {
      for (const c of pending) errs[c] = e instanceof ApiError ? e.message : '시세를 받지 못했어요.';
    }
  }
  for (const c of pending) {
    errs[c] = errs[c] ?? '시세를 받지 못했어요.';
    errors.set(c, errs[c]);
  }
  for (const c of Object.keys(quotes)) delete errs[c];
  return { quotes, errors: errs };
}

export async function getQuote(code: string): Promise<Quote> {
  if (!INSTRUMENT_BY_CODE[code]) throw new ApiError(404, 'unknown_instrument', '지원하지 않는 종목이에요.');
  const r = await getQuotes([code]);
  if (!r.quotes[code]) throw new ApiError(502, 'quote_failed', r.errors[code] ?? '시세를 받지 못했어요.', true);
  return r.quotes[code];
}

/* ── 지수·해외 지표 ── */
const idxCache = new Map<string, { at: number; v: IndexQuote }>();

export async function getIndex(id: 'KOSPI' | 'KOSDAQ'): Promise<IndexQuote> {
  const hit = idxCache.get(id);
  const chain = providerChain();
  if (hit && Date.now() - hit.at < refreshSeconds(hit.v.source) * 1000) return hit.v;
  const name = id === 'KOSPI' ? '코스피' : '코스닥';
  let lastErr = '지수를 받지 못했어요.';
  for (const src of chain) {
    try {
      let v: IndexQuote;
      if (src === 'demo') v = demoIndex(id);
      else if (src === 'kis') {
        const k = await kisIndex(id);
        v = { id, name, value: k.value, change: k.change, changePct: k.changePct, time: kisTimeNow(), source: 'kis', delayed: false, advancers: k.advancers, decliners: k.decliners };
      } else if (src === 'naver') {
        const q = await naverIndex(id);
        v = { id, name, value: q.price, change: q.change, changePct: q.changePct, time: q.timeMs, source: 'naver', delayed: false };
      } else {
        const y = await yahooChart(id === 'KOSPI' ? '^KS11' : '^KQ11', '1mo');
        const prev = previousClose(y.candles, isoFromEpochKST(y.timeMs));
        const ch = changeFrom(prev?.close ?? null, y.price);
        v = { id, name, value: y.price, change: ch?.change ?? null, changePct: ch?.pct ?? null, time: y.timeMs, source: 'yahoo', delayed: true };
      }
      idxCache.set(id, { at: Date.now(), v });
      return v;
    } catch (e) {
      lastErr = (e as Error).message;
    }
  }
  throw new ApiError(502, 'index_failed', lastErr, true);
}

export interface GlobalIndicator {
  id: 'SPX' | 'NDX' | 'USDKRW';
  name: string;
  value: number;
  changePct: number | null;
  date: string;
  source: QuoteSource;
}

const GLOBAL: { id: GlobalIndicator['id']; name: string; symbol: string }[] = [
  { id: 'SPX', name: 'S&P500', symbol: '^GSPC' },
  { id: 'NDX', name: '나스닥', symbol: '^IXIC' },
  { id: 'USDKRW', name: '원/달러 환율', symbol: 'KRW=X' },
];
const globalCache = new Map<string, { at: number; v: GlobalIndicator }>();

/** 미국 증시(직전 마감)와 환율: 마지막 두 일봉으로 등락률 계산 */
export async function getGlobal(): Promise<GlobalIndicator[]> {
  const out: GlobalIndicator[] = [];
  for (const g of GLOBAL) {
    const hit = globalCache.get(g.id);
    if (hit && Date.now() - hit.at < 10 * 60_000) {
      out.push(hit.v);
      continue;
    }
    try {
      let v: GlobalIndicator;
      if (providerSetting() === 'demo') {
        const demo = { SPX: [6800, -0.42], NDX: [23100, -0.88], USDKRW: [1395, 0.31] }[g.id];
        v = { id: g.id, name: g.name, value: demo[0], changePct: demo[1], date: prevTradingDay(todayKST()), source: 'demo' };
      } else {
        const y = await yahooChart(g.symbol, '5d');
        const c = y.candles;
        if (c.length < 2) throw new Error('데이터 부족');
        const last = c[c.length - 1];
        const prev = c[c.length - 2];
        v = { id: g.id, name: g.name, value: last.close, changePct: ((last.close - prev.close) / prev.close) * 100, date: last.date, source: 'yahoo' };
      }
      globalCache.set(g.id, { at: Date.now(), v });
      out.push(v);
    } catch {
      /* 해외 지표는 없어도 카드 생성 가능 — 빠진 값은 '확인 불가'로 표시 */
    }
  }
  return out;
}

/* ── 예시 시세(QUOTE_PROVIDER=demo) ── */
const BASE_PRICE: Record<string, number> = {
  '005930': 72000, '000660': 210000, '005380': 230000, '000270': 98000, '035420': 210000, '035720': 45000,
  '373220': 380000, '207940': 1050000, '068270': 185000, '105560': 95000, '005490': 360000,
  '069500': 42000, '360750': 21000, '133690': 125000,
};

function seeded(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function tick(p: number) {
  const t = p >= 500000 ? 1000 : p >= 200000 ? 500 : p >= 50000 ? 100 : p >= 20000 ? 50 : p >= 5000 ? 10 : 5;
  return Math.round(p / t) * t;
}

function demoCandles(code: string): Candle[] {
  const base = BASE_PRICE[code] ?? 10000;
  const today = todayKST();
  const days: string[] = [];
  let d = addDays(today, -120);
  while (d <= today) {
    if (isTradingDay(d)) days.push(d);
    d = addDays(d, 1);
  }
  const rnd = seeded(Number(code) + 7);
  let p = base;
  return days.map((date) => {
    const open = p;
    const close = tick(open * (1 + (rnd() - 0.5) * 0.04));
    const high = tick(Math.max(open, close) * (1 + rnd() * 0.012));
    const low = tick(Math.min(open, close) * (1 - rnd() * 0.012));
    p = close;
    return { date, open, high, low, close, volume: Math.round(500000 + rnd() * 1500000) };
  });
}

export function demoQuote(code: string): Quote {
  const candles = demoCandles(code);
  const today = todayKST();
  const min = minutesKST();
  const isSession = isTradingDay(today) && min >= SESSION_OPEN_MIN && min < SESSION_CLOSE_MIN;
  const last = candles[candles.length - 1];
  let price = last.close;
  let timeMs = Date.now();
  if (last.date === today && isSession) {
    // 장중에는 몇 초마다 조금씩 움직이는 예시 가격
    const r2 = seeded(Number(code) + Math.floor(Date.now() / 5000));
    price = tick(last.open * (1 + (r2() - 0.5) * 0.03));
    last.close = price;
    last.high = Math.max(last.high, price);
    last.low = Math.min(last.low, price);
  } else {
    const [y, m, day] = last.date.split('-').map(Number);
    timeMs = Date.UTC(y, m - 1, day, 6, 30);
  }
  return assemble(code, 'demo', false, { price, timeMs, open: last.open, high: last.high, low: last.low, volume: last.volume }, candles, 'demo');
}

function demoIndex(id: 'KOSPI' | 'KOSDAQ'): IndexQuote {
  const r = seeded((id === 'KOSPI' ? 11 : 13) + Number(todayKST().replace(/-/g, '')));
  const value = id === 'KOSPI' ? 2950 + r() * 100 : 860 + r() * 40;
  const pct = (r() - 0.55) * 3;
  return { id, name: id === 'KOSPI' ? '코스피' : '코스닥', value: Math.round(value * 100) / 100, change: Math.round(value * pct) / 100, changePct: pct, time: Date.now(), source: 'demo', delayed: false, advancers: Math.round(300 + r() * 400), decliners: Math.round(300 + r() * 400) };
}
