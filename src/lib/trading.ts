import type { ISODate } from '../../shared/dates';
import { SESSION_OPEN_MIN, sessionCloseMs, type MarketStatus } from '../../shared/krx';
import type { Quote, QuoteSource } from '../../shared/market';

export const INITIAL_MOCK_CASH = 10_000_000;
/** 시장가 주문에 쓸 수 있는 시세의 최대 나이(지연 시세를 고려해 40분) */
export const MAX_QUOTE_AGE_MS = 40 * 60 * 1000;

export type Side = 'buy' | 'sell';
export type OrderType = 'market' | 'limit';
export type OrderStatus = 'pending' | 'filled' | 'cancelled' | 'expired' | 'rejected';

export interface Position {
  code: string;
  name: string;
  qty: number;
  avgPrice: number;
}

export interface Order {
  id: string;
  code: string;
  name: string;
  side: Side;
  type: OrderType;
  qty: number;
  limitPrice?: number;
  status: OrderStatus;
  createdAt: number;
  /** 주문이 유효한 거래일 */
  validDay: ISODate;
  filledAt?: number;
  fillPrice?: number;
  /** 어떤 근거로 체결됐는지 */
  fillBasis?: 'observed' | 'range' | 'market';
  note?: string;
}

export interface Fill {
  id: string;
  orderId: string;
  code: string;
  name: string;
  side: Side;
  qty: number;
  price: number;
  time: number;
  cashAfter: number;
  /** 매도 시 기존 평균단가 */
  avgPriceBefore?: number;
  realizedPnl?: number;
  quoteTime?: number;
  quoteSource?: QuoteSource;
  basis: 'observed' | 'range' | 'market';
}

export interface PortfolioState {
  initialCash: number;
  cash: number;
  positions: Record<string, Position>;
  orders: Order[];
  fills: Fill[];
  watchlist: string[];
}

export function emptyPortfolio(): PortfolioState {
  return { initialCash: INITIAL_MOCK_CASH, cash: INITIAL_MOCK_CASH, positions: {}, orders: [], fills: [], watchlist: ['005930', '069500'] };
}

export function reservedCash(s: PortfolioState): number {
  return s.orders.filter((o) => o.status === 'pending' && o.side === 'buy').reduce((t, o) => t + o.qty * (o.limitPrice ?? 0), 0);
}

export function availableCash(s: PortfolioState): number {
  return s.cash - reservedCash(s);
}

export function reservedQty(s: PortfolioState, code: string): number {
  return s.orders.filter((o) => o.status === 'pending' && o.side === 'sell' && o.code === code).reduce((t, o) => t + o.qty, 0);
}

export function availableQty(s: PortfolioState, code: string): number {
  return (s.positions[code]?.qty ?? 0) - reservedQty(s, code);
}

export interface OrderRequest {
  id: string;
  code: string;
  name: string;
  side: Side;
  type: OrderType;
  qty: number;
  limitPrice?: number;
}

export interface OrderContext {
  now: number;
  market: MarketStatus;
  quote: Quote | null;
}

export type PlaceResult =
  | { ok: true; state: PortfolioState; order: Order; fill?: Fill; duplicate?: boolean }
  | { ok: false; state: PortfolioState; error: string };

function isQuoteUsableNow(q: Quote | null, ctx: OrderContext): q is Quote {
  return !!q && q.date === ctx.market.today && ctx.now - q.time <= MAX_QUOTE_AGE_MS;
}

export function placeOrder(state: PortfolioState, req: OrderRequest, ctx: OrderContext): PlaceResult {
  const existing = state.orders.find((o) => o.id === req.id);
  if (existing) {
    const fill = state.fills.find((f) => f.orderId === existing.id);
    return { ok: true, state, order: existing, fill, duplicate: true };
  }
  if (!Number.isInteger(req.qty) || req.qty < 1) return { ok: false, state, error: '수량은 1주 이상 정수로 입력해 주세요.' };

  if (req.type === 'market') {
    if (ctx.market.state !== 'open') return { ok: false, state, error: '장 운영 시간(평일 09:00~15:30)이 아니라 시장가로 주문할 수 없어요. 지정가로 예약해 보세요.' };
    if (!isQuoteUsableNow(ctx.quote, ctx)) return { ok: false, state, error: '최근 시세를 확인하지 못해 시장가 주문을 받을 수 없어요. 시세를 새로고침해 주세요.' };
    const price = ctx.quote.price;
    if (req.side === 'buy' && req.qty * price > availableCash(state)) return { ok: false, state, error: '주문 가능 금액이 부족해요.' };
    if (req.side === 'sell' && req.qty > availableQty(state, req.code)) return { ok: false, state, error: '매도 가능 수량이 부족해요.' };
    const order: Order = { ...req, status: 'pending', createdAt: ctx.now, validDay: ctx.market.today };
    const withOrder = { ...state, orders: [order, ...state.orders] };
    const r = applyFill(withOrder, order.id, price, ctx.now, 'market', ctx.quote);
    return { ok: true, state: r.state, order: r.order, fill: r.fill };
  }

  const limit = req.limitPrice;
  if (!limit || !Number.isFinite(limit) || limit <= 0 || !Number.isInteger(limit)) return { ok: false, state, error: '지정 가격을 원 단위로 입력해 주세요.' };
  if (req.side === 'buy' && req.qty * limit > availableCash(state)) return { ok: false, state, error: '주문 가능 금액이 부족해요.' };
  if (req.side === 'sell' && req.qty > availableQty(state, req.code)) return { ok: false, state, error: '매도 가능 수량이 부족해요.' };

  const order: Order = { ...req, limitPrice: limit, status: 'pending', createdAt: ctx.now, validDay: ctx.market.orderDay };
  const next: PortfolioState = { ...state, orders: [order, ...state.orders] };
  // 장중이고 지금 시세가 조건을 만족하면 그 가격에 바로 체결
  if (ctx.market.state === 'open' && isQuoteUsableNow(ctx.quote, ctx) && satisfies(order, ctx.quote.price)) {
    const r = applyFill(next, order.id, ctx.quote.price, ctx.now, 'observed', ctx.quote);
    return { ok: true, state: r.state, order: r.order, fill: r.fill };
  }
  return { ok: true, state: next, order };
}

function satisfies(o: Order, price: number): boolean {
  if (o.limitPrice === undefined) return false;
  return o.side === 'buy' ? price <= o.limitPrice : price >= o.limitPrice;
}

function applyFill(state: PortfolioState, orderId: string, price: number, time: number, basis: Fill['basis'], quote: Quote | null) {
  const order = state.orders.find((o) => o.id === orderId)!;
  const positions = { ...state.positions };
  const pos = positions[order.code];
  let cash = state.cash;
  let realized: number | undefined;
  let avgBefore: number | undefined;
  if (order.side === 'buy') {
    cash -= order.qty * price;
    const qty = (pos?.qty ?? 0) + order.qty;
    const avg = ((pos?.qty ?? 0) * (pos?.avgPrice ?? 0) + order.qty * price) / qty;
    positions[order.code] = { code: order.code, name: order.name, qty, avgPrice: avg };
  } else {
    cash += order.qty * price;
    avgBefore = pos.avgPrice;
    realized = (price - pos.avgPrice) * order.qty;
    const qty = pos.qty - order.qty;
    if (qty === 0) delete positions[order.code];
    else positions[order.code] = { ...pos, qty };
  }
  const filled: Order = { ...order, status: 'filled', filledAt: time, fillPrice: price, fillBasis: basis };
  const fill: Fill = {
    id: `fill_${order.id}`,
    orderId: order.id,
    code: order.code,
    name: order.name,
    side: order.side,
    qty: order.qty,
    price,
    time,
    cashAfter: cash,
    avgPriceBefore: avgBefore,
    realizedPnl: realized,
    quoteTime: quote?.time,
    quoteSource: quote?.source,
    basis,
  };
  return {
    state: { ...state, cash, positions, orders: state.orders.map((o) => (o.id === orderId ? filled : o)), fills: [fill, ...state.fills] },
    order: filled,
    fill,
  };
}

export function cancelOrder(state: PortfolioState, id: string): PortfolioState {
  return { ...state, orders: state.orders.map((o) => (o.id === id && o.status === 'pending' ? { ...o, status: 'cancelled' as const } : o)) };
}

function sessionOpenMs(d: ISODate): number {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day, 0, 0) + (SESSION_OPEN_MIN - 9 * 60) * 60000;
}

/**
 * 대기 주문 확인. 모의 체결 규칙:
 * 1) 주문 이후 관측한 시세(같은 거래일)가 조건을 만족하면 그 시세로 체결.
 * 2) 장 시작 전에 낸 주문은 그 거래일 저가(매수)·고가(매도)가 지정가에 닿으면 지정가로 체결.
 * 3) 유효 거래일 장 마감이 지나도 체결되지 않으면 만료.
 */
export function evaluatePending(state: PortfolioState, quotes: Record<string, Quote | undefined>, now: number): { state: PortfolioState; fills: Fill[] } {
  let s = state;
  const fills: Fill[] = [];
  for (const o of state.orders) {
    if (o.status !== 'pending' || o.type !== 'limit') continue;
    const q = quotes[o.code];
    const placedBeforeOpen = o.createdAt <= sessionOpenMs(o.validDay);
    if (q) {
      // 1) 관측 시세
      if (q.date === o.validDay && q.time > o.createdAt && q.time <= sessionCloseMs(o.validDay) && satisfies(o, q.price)) {
        const r = applyFill(s, o.id, q.price, q.time, 'observed', q);
        s = r.state;
        fills.push(r.fill);
        continue;
      }
      // 2) 장 시작 전 주문의 당일 가격 범위
      if (placedBeforeOpen && o.limitPrice !== undefined) {
        const range = q.date === o.validDay && q.dayLow !== null && q.dayHigh !== null
          ? { low: q.dayLow, high: q.dayHigh }
          : q.candles.find((c) => c.date === o.validDay);
        if (range) {
          const touched = o.side === 'buy' ? range.low <= o.limitPrice : range.high >= o.limitPrice;
          if (touched) {
            const r = applyFill(s, o.id, o.limitPrice, Math.min(now, sessionCloseMs(o.validDay)), 'range', q);
            s = r.state;
            fills.push(r.fill);
            continue;
          }
        }
      }
    }
    // 3) 만료
    if (now > sessionCloseMs(o.validDay)) {
      s = { ...s, orders: s.orders.map((x) => (x.id === o.id ? { ...x, status: 'expired' as const, note: '유효 거래일 장 마감까지 체결 조건을 만족하지 않았어요.' } : x)) };
    }
  }
  return { state: s, fills };
}

export function totalAssets(s: PortfolioState, prices: Record<string, number | undefined>): { total: number; stockValue: number; missing: string[] } {
  let stockValue = 0;
  const missing: string[] = [];
  for (const p of Object.values(s.positions)) {
    const px = prices[p.code];
    if (px === undefined) {
      missing.push(p.code);
      stockValue += p.qty * p.avgPrice; // 시세가 없으면 매수가로 평가하고 '시세 없음' 표시
    } else stockValue += p.qty * px;
  }
  return { total: s.cash + stockValue, stockValue, missing };
}

/** 투자 평행세계: 체결 1건 기준 두 세계 */
export function fillWorlds(fill: Fill, currentPrice: number | null) {
  if (fill.side === 'buy') {
    return {
      mine: { label: '산 나', value: currentPrice === null ? null : fill.qty * currentPrice, note: '주식 평가액' },
      other: { label: '현금으로 둔 나', value: fill.qty * fill.price, note: '현금 그대로' },
      diff: currentPrice === null ? null : fill.qty * (currentPrice - fill.price),
      kind: 'unrealized' as const,
    };
  }
  return {
    mine: { label: '판 나', value: fill.qty * fill.price, note: '확정된 현금' },
    other: { label: '계속 보유한 나', value: currentPrice === null ? null : fill.qty * currentPrice, note: '지금 평가액' },
    diff: currentPrice === null ? null : fill.qty * (fill.price - currentPrice),
    kind: 'realized' as const,
  };
}
