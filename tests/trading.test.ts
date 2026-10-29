import { describe, expect, it } from 'vitest';
import {
  availableCash,
  availableQty,
  cancelOrder,
  emptyPortfolio,
  evaluatePending,
  fillWorlds,
  placeOrder,
  totalAssets,
  type OrderRequest,
} from '../src/lib/trading';
import { marketStatus, prevTradingDay, isTradingDay, nextTradingDay } from '../shared/krx';
import { averageVolume, previousClose, volatility, type Candle, type Quote } from '../shared/market';


const kst = (d: string, hh: number, mm = 0) => {
  const [y, m, day] = d.split('-').map(Number);
  return Date.UTC(y, m - 1, day, hh - 9, mm);
};

function quote(price: number, time: number, over: Partial<Quote> = {}): Quote {
  const date = new Date(time + 9 * 3600000).toISOString().slice(0, 10);
  return {
    code: '005930', name: '삼성전자', price, time, date,
    prevClose: 70000, prevCloseDate: '2026-10-16', change: null, changePct: null,
    dayHigh: null, dayLow: null, volume: null, source: 'demo', live: false, delayed: true, delayNote: '', fetchedAt: time, candles: [],
    ...over,
  };
}

const MON = '2026-10-19';
const req = (over: Partial<OrderRequest> = {}): OrderRequest => ({ id: 'o1', code: '005930', name: '삼성전자', side: 'buy', type: 'market', qty: 10, ...over });

describe('KRX 거래일', () => {
  it('주말·한글날 휴장 처리', () => {
    expect(isTradingDay('2026-10-09')).toBe(false); // 한글날(금)
    expect(prevTradingDay('2026-10-12')).toBe('2026-10-08'); // 월 → 직전 거래일은 목
    expect(nextTradingDay('2026-10-17')).toBe('2026-10-19');
  });
  it('장 상태', () => {
    expect(marketStatus(new Date(kst(MON, 10))).state).toBe('open');
    expect(marketStatus(new Date(kst(MON, 8, 59))).state).toBe('pre');
    expect(marketStatus(new Date(kst(MON, 15, 30))).state).toBe('closed');
    const sat = marketStatus(new Date(kst('2026-10-17', 11)));
    expect(sat.state).toBe('holiday');
    expect(sat.orderDay).toBe(MON);
  });
});

describe('시장가 주문', () => {
  const now = kst(MON, 10);
  const ctx = { now, market: marketStatus(new Date(now)), quote: quote(70000, now - 60000) };

  it('장중 시장가 매수: 현금 감소·보유 증가', () => {
    const r = placeOrder(emptyPortfolio(), req(), ctx);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.state.cash).toBe(10_000_000 - 700_000);
    expect(r.state.positions['005930']).toMatchObject({ qty: 10, avgPrice: 70000 });
    expect(r.fill?.price).toBe(70000);
  });

  it('같은 주문 ID를 두 번 보내도 한 번만 체결 (중복 클릭)', () => {
    const r1 = placeOrder(emptyPortfolio(), req(), ctx);
    const r2 = placeOrder(r1.state, req(), ctx);
    expect(r2.ok && r2.duplicate).toBe(true);
    expect(r2.state.cash).toBe(10_000_000 - 700_000);
    expect(r2.state.fills).toHaveLength(1);
  });

  it('장 밖에서는 시장가 거절', () => {
    const t = kst('2026-10-17', 11);
    const r = placeOrder(emptyPortfolio(), req(), { now: t, market: marketStatus(new Date(t)), quote: quote(70000, t) });
    expect(r.ok).toBe(false);
  });

  it('오래된 시세로는 시장가 거절', () => {
    const r = placeOrder(emptyPortfolio(), req(), { ...ctx, quote: quote(70000, now - 3 * 3600000) });
    expect(r.ok).toBe(false);
  });

  it('잔액 부족·수량 부족 거절', () => {
    expect(placeOrder(emptyPortfolio(), req({ qty: 1000 }), ctx).ok).toBe(false);
    expect(placeOrder(emptyPortfolio(), req({ side: 'sell' }), ctx).ok).toBe(false);
  });

  it('매도 시 실현손익과 평균단가', () => {
    let s = placeOrder(emptyPortfolio(), req(), ctx).state;
    s = placeOrder(s, req({ id: 'o2', qty: 10 }), { ...ctx, quote: quote(80000, now) }).state;
    expect(s.positions['005930'].avgPrice).toBe(75000);
    const r = placeOrder(s, req({ id: 'o3', side: 'sell', qty: 5 }), { ...ctx, quote: quote(90000, now) });
    expect(r.ok && r.fill?.realizedPnl).toBe((90000 - 75000) * 5);
    expect(r.state.positions['005930'].qty).toBe(15);
  });
});

describe('지정가 주문', () => {
  const placedAt = kst(MON, 10);
  const ctx = { now: placedAt, market: marketStatus(new Date(placedAt)), quote: quote(70000, placedAt - 1000) };

  it('조건 불충족이면 대기 + 자금 예약, 즉시 체결하지 않음', () => {
    const r = placeOrder(emptyPortfolio(), req({ type: 'limit', limitPrice: 68000 }), ctx);
    expect(r.ok && r.order.status).toBe('pending');
    expect(r.state.cash).toBe(10_000_000);
    expect(availableCash(r.state)).toBe(10_000_000 - 680_000);
  });

  it('주문 후 관측 시세가 조건을 만족하면 그 시세로 체결', () => {
    const s = placeOrder(emptyPortfolio(), req({ type: 'limit', limitPrice: 68000 }), ctx).state;
    const later = kst(MON, 11);
    const r = evaluatePending(s, { '005930': quote(67500, later) }, later);
    expect(r.fills).toHaveLength(1);
    expect(r.fills[0].price).toBe(67500);
    expect(availableCash(r.state)).toBe(10_000_000 - 675_000);
  });

  it('장중에 낸 주문은 주문 이전의 당일 저가로 체결하지 않음', () => {
    const s = placeOrder(emptyPortfolio(), req({ type: 'limit', limitPrice: 68000 }), ctx).state;
    const later = kst(MON, 11);
    const r = evaluatePending(s, { '005930': quote(69000, later, { dayLow: 67000, dayHigh: 71000 }) }, later);
    expect(r.fills).toHaveLength(0);
  });

  it('장 시작 전 주문은 당일 저가가 닿으면 지정가로 체결', () => {
    const pre = kst('2026-10-17', 20); // 토요일 밤 → 월요일 유효
    const s = placeOrder(emptyPortfolio(), req({ type: 'limit', limitPrice: 68000 }), { now: pre, market: marketStatus(new Date(pre)), quote: null }).state;
    expect(s.orders[0].validDay).toBe(MON);
    const after = kst(MON, 16);
    const r = evaluatePending(s, { '005930': quote(69000, kst(MON, 15, 30), { dayLow: 67800, dayHigh: 70500 }) }, after);
    expect(r.fills[0]).toMatchObject({ price: 68000, basis: 'range' });
  });

  it('유효 거래일 마감 후 미체결이면 만료되고 예약 해제', () => {
    const s = placeOrder(emptyPortfolio(), req({ type: 'limit', limitPrice: 60000 }), ctx).state;
    const after = kst(MON, 16);
    const r = evaluatePending(s, { '005930': quote(69000, kst(MON, 15, 30)) }, after);
    expect(r.state.orders[0].status).toBe('expired');
    expect(availableCash(r.state)).toBe(10_000_000);
  });

  it('매도 지정가는 수량을 예약하고 취소하면 해제', () => {
    let s = placeOrder(emptyPortfolio(), req(), ctx).state;
    s = placeOrder(s, req({ id: 's1', side: 'sell', type: 'limit', qty: 4, limitPrice: 99000 }), ctx).state;
    expect(availableQty(s, '005930')).toBe(6);
    expect(placeOrder(s, req({ id: 's2', side: 'sell', type: 'limit', qty: 7, limitPrice: 99000 }), ctx).ok).toBe(false);
    s = cancelOrder(s, 's1');
    expect(availableQty(s, '005930')).toBe(10);
  });
});

describe('투자 평행세계', () => {
  it('매수: 총자산 = 남은 현금 + 평가액, 현금으로 둔 나와 비교', () => {
    const now = kst(MON, 10);
    const s = placeOrder(emptyPortfolio(), req(), { now, market: marketStatus(new Date(now)), quote: quote(70000, now) }).state;
    expect(totalAssets(s, { '005930': 77000 }).total).toBe(9_300_000 + 770_000);
    const w = fillWorlds(s.fills[0], 77000);
    expect(w.diff).toBe(70000);
    expect(w.other.value).toBe(700000);
  });
  it('매도: 판 나 vs 계속 보유한 나', () => {
    const w = fillWorlds({ id: 'f', orderId: 'o', code: 'x', name: 'x', side: 'sell', qty: 2, price: 100, time: 0, cashAfter: 0, basis: 'market' }, 120);
    expect(w.diff).toBe(-40);
    expect(fillWorlds({ id: 'f', orderId: 'o', code: 'x', name: 'x', side: 'sell', qty: 2, price: 100, time: 0, cashAfter: 0, basis: 'market' }, null).diff).toBeNull();
  });
});

describe('시장 계산', () => {
  const candles: Candle[] = Array.from({ length: 22 }, (_, i) => ({
    date: `2026-09-${String(i + 1).padStart(2, '0')}`,
    open: 100, high: 101, low: 99, close: i % 2 === 0 ? 100 : 110, volume: 1000 + i,
  }));
  it('전 거래일 종가는 가격일 이전 마지막 일봉 (휴장일 건너뜀)', () => {
    const c: Candle[] = [
      { date: '2026-10-08', open: 1, high: 1, low: 1, close: 500, volume: 1 },
      { date: '2026-10-12', open: 1, high: 1, low: 1, close: 510, volume: 1 },
    ];
    expect(previousClose(c, '2026-10-12')).toEqual({ close: 500, date: '2026-10-08' });
  });
  it('20거래일 변동성은 21개 종가가 있어야 계산', () => {
    expect(volatility(candles.slice(0, 20))).toBeNull();
    const v = volatility(candles)!;
    expect(v.days).toBe(20);
    expect(v.dailyPct).toBeCloseTo(9.77, 1);
  });
  it('평균 거래량', () => {
    expect(averageVolume(candles, '2026-09-22')).toBeCloseTo(1010.5, 1);
  });
});
