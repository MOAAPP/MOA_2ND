import { isoFromEpochKST } from '../../../shared/dates';
import type { Candle } from '../../../shared/market';
import { ApiError, fetchWithTimeout } from '../http';

interface YahooChart {
  chart?: {
    result?: Array<{
      meta: {
        regularMarketPrice?: number;
        regularMarketTime?: number;
        regularMarketDayHigh?: number;
        regularMarketDayLow?: number;
        regularMarketVolume?: number;
      };
      timestamp?: number[];
      indicators?: { quote?: Array<{ open?: (number | null)[]; high?: (number | null)[]; low?: (number | null)[]; close?: (number | null)[]; volume?: (number | null)[] }> };
    }>;
    error?: { description?: string } | null;
  };
}

export interface YahooResult {
  price: number;
  timeMs: number;
  dayHigh: number | null;
  dayLow: number | null;
  volume: number | null;
  candles: Candle[];
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

export function parseYahooChart(data: YahooChart): YahooResult {
  const r = data.chart?.result?.[0];
  const price = r?.meta.regularMarketPrice;
  const time = r?.meta.regularMarketTime;
  if (!r || typeof price !== 'number' || typeof time !== 'number') {
    throw new ApiError(502, 'quote_empty', data.chart?.error?.description ? `시세 없음: ${data.chart.error.description}` : '시세 데이터가 비어 있어요.', true);
  }
  const q = r.indicators?.quote?.[0] ?? {};
  const candles: Candle[] = [];
  (r.timestamp ?? []).forEach((t, i) => {
    const close = q.close?.[i];
    if (typeof close !== 'number') return;
    candles.push({ date: isoFromEpochKST(t * 1000), open: num(q.open?.[i]) ?? close, high: num(q.high?.[i]) ?? close, low: num(q.low?.[i]) ?? close, close, volume: num(q.volume?.[i]) });
  });
  return { price, timeMs: time * 1000, dayHigh: num(r.meta.regularMarketDayHigh), dayLow: num(r.meta.regularMarketDayLow), volume: num(r.meta.regularMarketVolume), candles };
}

/** symbol 예: 005930.KS, ^KS11, ^GSPC, KRW=X */
export async function yahooChart(symbol: string, range = '3mo'): Promise<YahooResult> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=${range}&interval=1d`;
  let res;
  try {
    res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0 (parallel-bank)', Accept: 'application/json' } }, 8000);
  } catch {
    throw new ApiError(502, 'quote_unreachable', 'Yahoo 시세에 연결하지 못했어요.', true);
  }
  if (!res.ok) throw new ApiError(502, 'quote_failed', `Yahoo 시세 응답 오류(${res.status})`, true);
  if (!(res.headers.get('content-type') ?? '').includes('json')) throw new ApiError(502, 'quote_bad_format', 'Yahoo 시세 형식이 예상과 달라요.', true);
  return parseYahooChart((await res.json()) as YahooChart);
}
