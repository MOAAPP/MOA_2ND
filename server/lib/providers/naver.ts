import { ApiError, fetchWithTimeout } from '../http';

/**
 * 네이버 금융 실시간 polling 엔드포인트(비공식). 키 없이 쓸 수 있지만 공식 API가 아니어서
 * 형식이 바뀌거나 막힐 수 있다. 서비스 운영에는 KIS 등 공식 API를 쓰는 것을 권장.
 */
export interface NaverQuote {
  price: number;
  change: number;
  changePct: number;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  timeMs: number;
  marketOpen: boolean;
}

export const toNum = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const n = Number(v.replace(/[,+\s%]/g, ''));
  return Number.isFinite(n) ? n : null;
};

interface NaverItem {
  closePrice?: string | number;
  compareToPreviousClosePrice?: string | number;
  compareToPreviousPrice?: { code?: string; name?: string };
  fluctuationsRatio?: string | number;
  openPrice?: string | number;
  highPrice?: string | number;
  lowPrice?: string | number;
  accumulatedTradingVolume?: string | number;
  localTradedAt?: string;
  marketStatus?: string;
}

/** 부호: compareToPreviousPrice.name 이 FALLING/LOWER_LIMIT 이면 하락 */
export function parseNaverItem(it: NaverItem, now = Date.now()): NaverQuote {
  const price = toNum(it.closePrice);
  if (price === null) throw new ApiError(502, 'quote_empty', '네이버 시세에 가격이 없어요.', true);
  const name = it.compareToPreviousPrice?.name ?? '';
  const code = it.compareToPreviousPrice?.code ?? '';
  const falling = /FALL|LOWER/i.test(name) || code === '4' || code === '5';
  const sign = falling ? -1 : 1;
  const ch = toNum(it.compareToPreviousClosePrice);
  const pct = toNum(it.fluctuationsRatio);
  const t = it.localTradedAt ? Date.parse(it.localTradedAt) : NaN;
  return {
    price,
    change: ch === null ? 0 : sign * Math.abs(ch),
    changePct: pct === null ? 0 : sign * Math.abs(pct),
    open: toNum(it.openPrice),
    high: toNum(it.highPrice),
    low: toNum(it.lowPrice),
    volume: toNum(it.accumulatedTradingVolume),
    timeMs: Number.isFinite(t) ? t : now,
    marketOpen: (it.marketStatus ?? '').toUpperCase() === 'OPEN',
  };
}

async function poll(path: string): Promise<NaverItem[]> {
  let res;
  try {
    res = await fetchWithTimeout(`https://polling.finance.naver.com/api/realtime/domestic/${path}`, { headers: { 'User-Agent': 'Mozilla/5.0 (parallel-bank)', Referer: 'https://m.stock.naver.com/' } }, 6000);
  } catch {
    throw new ApiError(502, 'quote_unreachable', '네이버 시세에 연결하지 못했어요.', true);
  }
  if (!res.ok) throw new ApiError(502, 'quote_failed', `네이버 시세 응답 오류(${res.status})`, true);
  const text = await res.text();
  let data: { datas?: NaverItem[] };
  try {
    data = JSON.parse(text);
  } catch {
    throw new ApiError(502, 'quote_bad_format', '네이버 시세 형식이 예상과 달라요.', true);
  }
  if (!data.datas?.length) throw new ApiError(502, 'quote_empty', '네이버 시세가 비어 있어요.', true);
  return data.datas;
}

/** 여러 종목을 한 번에 (쉼표 구분) */
export async function naverStocks(codes: string[]): Promise<Record<string, NaverQuote>> {
  const items = await poll(`stock/${codes.join(',')}`);
  const out: Record<string, NaverQuote> = {};
  for (const it of items as (NaverItem & { itemCode?: string })[]) {
    if (it.itemCode) out[it.itemCode] = parseNaverItem(it);
  }
  return out;
}

export async function naverIndex(id: 'KOSPI' | 'KOSDAQ'): Promise<NaverQuote> {
  const items = await poll(`index/${id}`);
  return parseNaverItem(items[0]);
}
