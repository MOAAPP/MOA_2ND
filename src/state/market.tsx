import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { nextLesson } from '../../shared/curriculum';
import { currentStreak } from '../../shared/curriculum';
import { todayKST } from '../../shared/dates';
import { marketStatus, type MarketStatus } from '../../shared/krx';
import type { IndexQuote, Quote, QuoteSource } from '../../shared/market';
import { api, errorMessage } from '../lib/api';
import { getDeviceId } from '../lib/id';
import { progressOf } from '../lib/learning';
import { evaluatePending, totalAssets, type Fill } from '../lib/trading';
import { useStore } from './store';

export interface MarketInfo {
  setting: string;
  chain: QuoteSource[];
  primary: QuoteSource;
  refreshSec: number;
  kis: boolean;
  realtime: { enabled: boolean; connected: boolean; subscribed: string[]; lastError: string | null };
}

interface QuoteState {
  quotes: Record<string, Quote>;
  errors: Record<string, string>;
  lastAttempt: number | null;
  lastUpdate: number | null;
  loading: boolean;
  info: MarketInfo | null;
  networkError: string | null;
  streaming: boolean;
  kospi: IndexQuote | null;
}

interface MarketCtx extends QuoteState {
  status: MarketStatus;
  refresh: (codes: string[]) => Promise<void>;
  /** 화면에서 보고 있는 종목을 실시간 스트림에 등록 (해제 함수 반환) */
  watch: (codes: string[]) => () => void;
  requestCard: (fill: Fill) => Promise<string | null>;
  cardErrors: Record<string, string>;
  dailySync: { ok: boolean; error: string | null; at: number | null };
}

const Ctx = createContext<MarketCtx | null>(null);

export function MarketProvider({ children }: { children: ReactNode }) {
  const { state, update } = useStore();
  const [qs, setQs] = useState<QuoteState>({ quotes: {}, errors: {}, lastAttempt: null, lastUpdate: null, loading: false, info: null, networkError: null, streaming: false, kospi: null });
  const [status, setStatus] = useState(() => marketStatus());
  const [cardErrors, setCardErrors] = useState<Record<string, string>>({});
  const [dailySync, setDailySync] = useState<{ ok: boolean; error: string | null; at: number | null }>({ ok: false, error: null, at: null });
  const stateRef = useRef(state);
  stateRef.current = state;
  const inflight = useRef(new Set<string>());
  const quotesRef = useRef(qs.quotes);
  quotesRef.current = qs.quotes;

  useEffect(() => {
    const t = window.setInterval(() => setStatus(marketStatus()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const requestCard = useCallback(
    async (fill: Fill) => {
      const s = stateRef.current;
      if (s.cardJobIds[fill.id]) return s.cardJobIds[fill.id];
      if (inflight.current.has(fill.id)) return null;
      inflight.current.add(fill.id);
      try {
        const pos = s.portfolio.positions[fill.code];
        const prices = Object.fromEntries(Object.values(quotesRef.current).map((q) => [q.code, q.price]));
        const ta = totalAssets(s.portfolio, prices);
        const posValue = pos ? pos.qty * (prices[fill.code] ?? fill.price) : 0;
        const res = await api<{ job: { id: string } }>('/api/cardnews', {
          method: 'POST',
          body: {
            trade: {
              tradeId: fill.id, code: fill.code, side: fill.side, qty: fill.qty, price: fill.price, filledAt: fill.time,
              avgPriceBefore: fill.avgPriceBefore, holdingQty: pos?.qty ?? 0, holdingAvg: pos?.avgPrice,
              weightPct: ta.total > 0 ? Math.round((posValue / ta.total) * 1000) / 10 : undefined,
              priceSource: fill.quoteSource ?? 'yahoo',
            },
            level: s.level ?? 1,
            autoSend: s.settings.discordConsent && s.settings.autoSendDiscord,
          },
        });
        update((st) => ({ ...st, cardJobIds: { ...st.cardJobIds, [fill.id]: res.job.id } }));
        setCardErrors((e) => {
          const n = { ...e };
          delete n[fill.id];
          return n;
        });
        return res.job.id;
      } catch (e) {
        setCardErrors((er) => ({ ...er, [fill.id]: errorMessage(e) }));
        return null;
      } finally {
        inflight.current.delete(fill.id);
      }
    },
    [update],
  );

  /** 새 시세가 들어올 때마다 대기 주문 확인 */
  const onQuotes = useCallback(
    (quotes: Record<string, Quote>) => {
      const current = stateRef.current.portfolio;
      if (!current.orders.some((o) => o.status === 'pending')) return;
      const r = evaluatePending(current, quotes, Date.now());
      if (r.state !== current) {
        update((st) => ({ ...st, portfolio: r.state }));
        r.fills.forEach((f) => window.setTimeout(() => void requestCard(f), 50));
      }
    },
    [update, requestCard],
  );

  const merge = useCallback((quotes: Record<string, Quote>, errors: Record<string, string>, info?: MarketInfo) => {
    setQs((s) => {
      const nextErrors = { ...s.errors, ...errors };
      for (const c of Object.keys(quotes)) delete nextErrors[c];
      return { ...s, quotes: { ...s.quotes, ...quotes }, errors: nextErrors, lastAttempt: Date.now(), lastUpdate: Object.keys(quotes).length ? Date.now() : s.lastUpdate, loading: false, info: info ?? s.info, networkError: null };
    });
  }, []);

  const refresh = useCallback(
    async (codes: string[]) => {
      const uniq = [...new Set(codes)].filter(Boolean);
      if (!uniq.length) return;
      setQs((s) => ({ ...s, loading: true }));
      try {
        const res = await api<{ market: MarketInfo; results: { code: string; quote?: Quote; error?: string }[] }>(`/api/quotes?codes=${uniq.join(',')}`);
        const quotes: Record<string, Quote> = {};
        const errors: Record<string, string> = {};
        for (const r of res.results) {
          if (r.quote) quotes[r.code] = r.quote;
          else errors[r.code] = r.error ?? '시세 오류';
        }
        merge(quotes, errors, res.market);
        onQuotes(quotes);
      } catch (e) {
        setQs((s) => ({ ...s, loading: false, lastAttempt: Date.now(), networkError: errorMessage(e) }));
      }
    },
    [merge, onQuotes],
  );

  /* ── 실시간 스트림(SSE): 보고 있는 종목 + 보유·대기 종목 ── */
  const watchers = useRef(new Map<string, number>());
  const [watchKey, setWatchKey] = useState('');
  const watch = useCallback((codes: string[]) => {
    for (const c of codes) watchers.current.set(c, (watchers.current.get(c) ?? 0) + 1);
    setWatchKey([...watchers.current.keys()].sort().join(','));
    return () => {
      for (const c of codes) {
        const n = (watchers.current.get(c) ?? 1) - 1;
        if (n <= 0) watchers.current.delete(c);
        else watchers.current.set(c, n);
      }
      setWatchKey([...watchers.current.keys()].sort().join(','));
    };
  }, []);

  const holdKey = useMemo(() => {
    const p = state.portfolio;
    return [...new Set([...Object.keys(p.positions), ...p.orders.filter((o) => o.status === 'pending').map((o) => o.code)])].sort().join(',');
  }, [state.portfolio]);

  useEffect(() => {
    const codes = [...new Set([...watchKey.split(','), ...holdKey.split(',')])].filter(Boolean).slice(0, 20);
    if (!codes.length || typeof EventSource === 'undefined') return;
    let es: EventSource | null = null;
    let fallback: number | null = null;
    let closed = false;
    const startFallback = () => {
      if (fallback) return;
      setQs((s) => ({ ...s, streaming: false }));
      void refresh(codes);
      fallback = window.setInterval(() => document.visibilityState === 'visible' && void refresh(codes), 15_000);
    };
    const open = () => {
      if (closed || document.visibilityState !== 'visible') return;
      es = new EventSource(`/api/stream?codes=${codes.join(',')}&device=${getDeviceId()}`);
      es.addEventListener('quotes', (ev) => {
        try {
          const d = JSON.parse((ev as MessageEvent).data) as { quotes: Record<string, Quote>; errors: Record<string, string>; market: MarketInfo };
          merge(d.quotes, d.errors, d.market);
          setQs((s) => ({ ...s, streaming: true }));
          onQuotes(d.quotes);
          if (fallback) {
            window.clearInterval(fallback);
            fallback = null;
          }
        } catch {
          /* 잘못된 이벤트 무시 */
        }
      });
      es.addEventListener('index', (ev) => {
        try {
          setQs((s) => ({ ...s, kospi: (JSON.parse((ev as MessageEvent).data) as { kospi: IndexQuote }).kospi }));
        } catch {
          /* 무시 */
        }
      });
      es.onerror = () => {
        // 스트림이 끊기면 15초 간격 새로고침으로 대체하고, 브라우저가 자동 재연결을 시도한다
        startFallback();
      };
    };
    const onVis = () => {
      if (document.visibilityState === 'visible' && !es) open();
      if (document.visibilityState !== 'visible' && es) {
        es.close();
        es = null;
      }
    };
    open();
    document.addEventListener('visibilitychange', onVis);
    return () => {
      closed = true;
      es?.close();
      if (fallback) window.clearInterval(fallback);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [watchKey, holdKey, merge, onQuotes, refresh]);

  /* ── 데일리 카드뉴스 구독 동기화: 켜져 있을 때만, 모의 보유·학습 진행만 보낸다 ── */
  const prog = progressOf(state);
  const nl = nextLesson(prog);
  const subPayload = useMemo(() => {
    const d = state.daily;
    if (!d.enabled || !state.settings.discordConsent) return null;
    return {
      enabled: true,
      time: d.time,
      nickname: d.nickname.trim() || undefined,
      includePhotos: d.includePhotos,
      level: state.level ?? 1,
      nextLessonId: nl?.id ?? null,
      streak: currentStreak(state.learning.streak, todayKST()),
      holdings: Object.values(state.portfolio.positions).map((p) => ({ code: p.code, qty: p.qty, avgPrice: Math.round(p.avgPrice * 100) / 100 })),
      watchlist: state.portfolio.watchlist.slice(0, 20),
    };
  }, [state.daily, state.settings.discordConsent, state.level, nl?.id, state.learning.streak, state.portfolio.positions, state.portfolio.watchlist]);
  const subKey = JSON.stringify(subPayload);
  const wasEnabled = useRef(false);
  useEffect(() => {
    const t = window.setTimeout(async () => {
      try {
        if (subPayload) {
          await api('/api/daily/subscription', { method: 'PUT', body: subPayload });
          wasEnabled.current = true;
        } else if (wasEnabled.current) {
          await api('/api/daily/subscription', { method: 'DELETE' });
          wasEnabled.current = false;
        }
        setDailySync({ ok: true, error: null, at: Date.now() });
      } catch (e) {
        setDailySync({ ok: false, error: errorMessage(e), at: Date.now() });
      }
    }, 1200);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [subKey]);

  const value = useMemo(() => ({ ...qs, status, refresh, watch, requestCard, cardErrors, dailySync }), [qs, status, refresh, watch, requestCard, cardErrors, dailySync]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMarket() {
  const c = useContext(Ctx);
  if (!c) throw new Error('MarketProvider 필요');
  return c;
}

/** 이 컴포넌트가 보이는 동안 종목을 실시간으로 받는다 */
export function useLiveQuotes(codes: string[]) {
  const m = useMarket();
  const key = codes.join(',');
  useEffect(() => {
    if (!key) return;
    return m.watch(key.split(','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return m;
}
