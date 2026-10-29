import type { Level } from '../../shared/knowledge';
import type { QuoteSource } from '../../shared/market';

export interface TradeInput {
  tradeId: string;
  code: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  filledAt: number;
  /** 매도 시 체결 전 평균단가 */
  avgPriceBefore?: number;
  holdingQty?: number;
  holdingAvg?: number;
  /** 모의 자산 중 이 종목 비중(%) — 생활비와 무관 */
  weightPct?: number;
  priceSource: QuoteSource;
}

/** 데일리 카드뉴스 구독: 생활비 정보는 받지 않는다 (모의 보유 종목·학습 진행만) */
export interface Subscription {
  deviceHash: string;
  enabled: boolean;
  /** 'HH:MM' 한국 시간 */
  time: string;
  nickname?: string;
  includePhotos: boolean;
  level: Level;
  nextLessonId: string | null;
  streak: number;
  holdings: { code: string; qty: number; avgPrice: number }[];
  watchlist: string[];
  updatedAt: number;
  createdAt: number;
  lastRun?: { date: string; jobId: string | null; status: 'ok' | 'failed' | 'running'; error?: string; attempts: number; lastAttemptAt: number };
}

export interface PhotoMeta {
  id: number | null;
  query: string;
  photographer: string | null;
  sourceUrl: string | null;
  provider: 'pexels' | 'pixabay' | 'none';
}

export interface NewsItem {
  title: string;
  source: string;
  publishedAt: number;
  link: string;
}

export type JobStatus = 'generating' | 'generated' | 'sending' | 'sent' | 'failed';
export type JobStage = 'data' | 'photo' | 'render' | 'send';

export interface SendAttempt {
  at: number;
  auto: boolean;
  ok: boolean;
  error?: string;
}

export interface CardJob {
  id: string;
  kind: 'trade' | 'daily';
  token: string;
  deviceHash: string;
  /** trade: 체결 ID · daily: 'daily-YYYY-MM-DD' */
  tradeId: string;
  dailyDate?: string;
  createdAt: number;
  updatedAt: number;
  status: JobStatus;
  stage?: JobStage;
  error?: string;
  retryable: boolean;
  trade?: TradeInput;
  name: string;
  level: Level;
  autoSend: boolean;
  autoSendDone: boolean;
  noPhoto: boolean;
  images: string[];
  photos: PhotoMeta[];
  news: NewsItem[];
  quoteMeta?: { source: QuoteSource; time: number; delayed: boolean; live: boolean; delayNote: string };
  titles: string[];
  summary: string;
  headline?: string;
  notice?: string;
  sends: SendAttempt[];
}

/** 클라이언트에 보내는 형태 (토큰은 이미지 URL에만 사용) */
export function publicJob(j: CardJob) {
  return {
    id: j.id,
    kind: j.kind ?? 'trade',
    tradeId: j.tradeId,
    dailyDate: j.dailyDate ?? null,
    createdAt: j.createdAt,
    updatedAt: j.updatedAt,
    status: j.status,
    stage: j.stage ?? null,
    error: j.error ?? null,
    retryable: j.retryable,
    code: j.trade?.code ?? null,
    name: j.name,
    side: j.trade?.side ?? null,
    qty: j.trade?.qty ?? null,
    price: j.trade?.price ?? null,
    level: j.level,
    autoSend: j.autoSend,
    noPhoto: j.noPhoto,
    images: j.images.map((_, i) => `/api/cardnews/${j.id}/images/${i + 1}.png?t=${j.token}&v=${j.updatedAt}`),
    titles: j.titles,
    photos: j.photos,
    news: j.news,
    quoteMeta: j.quoteMeta ?? null,
    summary: j.summary,
    headline: j.headline ?? null,
    notice: j.notice ?? null,
    sends: j.sends,
  };
}
