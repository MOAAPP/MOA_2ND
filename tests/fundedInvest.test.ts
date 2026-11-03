import { describe, expect, it } from 'vitest';
import { marketStatus } from '../shared/krx';
import type { Quote } from '../shared/market';
import { emptyWorldWallet, transactWorldWallet, walletSummary } from '../src/lib/worldWallet';
import { emptyInvestJournal, fundedAvailableCash, fundedPortfolio, placeFundedOrder, settleFundedOrders } from '../src/lib/fundedInvest';

const now = Date.parse('2026-10-19T10:00:00+09:00');
const ctx = (price: number, time = now) => ({
  now: time,
  market: marketStatus(new Date(time)),
  quote: {
    code: '005930', name: '삼성전자', price, time: time - 1_000, date: '2026-10-19',
    prevClose: price, prevCloseDate: '2026-10-16',
    change: null, changePct: null, dayHigh: null, dayLow: null, volume: null,
    source: 'demo' as const, live: false, delayed: true, delayNote: '', fetchedAt: time,
    candles: [],
  } satisfies Quote,
});
const buy = (id = 'funded-o1') => ({
  id, code: '005930', name: '삼성전자', side: 'buy' as const,
  type: 'market' as const, qty: 1,
});

describe('한 가상 지갑을 사용하는 투자', () => {
  it('투자 시작금은 별도 1,000만 원이 아니라 홈의 남는 가상 현금', () => {
    const w = emptyWorldWallet();
    expect(fundedPortfolio(w, emptyInvestJournal()).cash).toBe(120_000);
    expect(walletSummary(w).totalAssets).toBe(800_000);
  });

  it('가상 매수하면 현금이 감소하고 주식 평가액은 홈 총자산에 들어간다', () => {
    const w = emptyWorldWallet();
    const r = placeFundedOrder(w, emptyInvestJournal(), buy(), ctx(50_000));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wallet.cash).toBe(750_000);
    expect(r.wallet.etfs['005930']).toMatchObject({ qty: 1, cost: 50_000 });
    expect(walletSummary(r.wallet, { '005930': 50_000 }).totalAssets).toBe(800_000);
    expect(fundedAvailableCash(r.wallet, r.journal)).toBe(70_000);
    expect(r.fill?.cashAfter).toBe(750_000);
  });

  it('같은 주문 ID를 다시 제출해도 가상 지갑에서 두 번 차감되지 않는다', () => {
    const first = placeFundedOrder(emptyWorldWallet(), emptyInvestJournal(), buy(), ctx(50_000));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const again = placeFundedOrder(first.wallet, first.journal, buy(), ctx(50_000));
    expect(again.ok && again.duplicate).toBe(true);
    expect(again.wallet.cash).toBe(750_000);
    expect(again.journal.fills).toHaveLength(1);
  });

  it('가상 매도 수익도 같은 현금으로 돌아온다', () => {
    const first = placeFundedOrder(emptyWorldWallet(), emptyInvestJournal(), buy(), ctx(50_000));
    if (!first.ok) throw Error('buy failed');
    const r = placeFundedOrder(first.wallet, first.journal, { ...buy('sell'), side: 'sell' }, ctx(55_000));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.wallet.cash).toBe(805_000);
    expect(Object.keys(r.wallet.etfs)).toHaveLength(0);
    expect(walletSummary(r.wallet).totalAssets).toBe(805_000);
  });

  it('저축·고정지출 안전금액을 침범하는 매수를 거절한다', () => {
    const r = placeFundedOrder(emptyWorldWallet(), emptyInvestJournal(), { ...buy(), qty: 3 }, ctx(50_000));
    expect(r.ok).toBe(false);
    expect(r.wallet.cash).toBe(800_000);
    const saved = transactWorldWallet(emptyWorldWallet(), { type: 'save', amount: 90_000 })!;
    expect(fundedAvailableCash(saved, emptyInvestJournal())).toBe(30_000);
  });

  it('지정가 예약금은 중복 주문할 수 없고 체결 후에만 같은 지갑에서 차감된다', () => {
    const req = { ...buy('limit'), type: 'limit' as const, limitPrice: 45_000 };
    const first = placeFundedOrder(emptyWorldWallet(), emptyInvestJournal(), req, ctx(50_000));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.wallet.cash).toBe(800_000);
    expect(fundedAvailableCash(first.wallet, first.journal)).toBe(75_000);
    const r = settleFundedOrders(first.wallet, first.journal, {
      '005930': { ...ctx(44_000).quote, time: now + 60_000, fetchedAt: now + 60_000 } as Quote,
    }, now + 60_000);
    expect(r.fills).toHaveLength(1);
    expect(r.wallet.cash).toBe(756_000);
    expect(r.journal.fills).toHaveLength(1);
  });

  it('예약 후 사용 가능 현금이 줄었다면 체결을 거절하고 마이너스를 만들지 않는다', () => {
    const req = { ...buy('limit'), type: 'limit' as const, limitPrice: 100_000 };
    const first = placeFundedOrder(emptyWorldWallet(), emptyInvestJournal(), req, ctx(110_000));
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const saved = transactWorldWallet(first.wallet, { type: 'save', amount: 80_000 })!;
    const r = settleFundedOrders(saved, first.journal, {
      '005930': { ...ctx(98_000).quote, time: now + 60_000, fetchedAt: now + 60_000 } as Quote,
    }, now + 60_000);
    expect(r.fills).toHaveLength(0);
    expect(r.wallet.cash).toBe(saved.cash);
    expect(r.journal.orders[0].status).toBe('rejected');
  });

  it('기존 가상 ETF 보유분도 바로 같은 투자 계좌에 표시된다', () => {
    const w = transactWorldWallet(emptyWorldWallet(), { type: 'buyEtf', code: '360750', name: 'TIGER 미국S&P500', qty: 2, price: 20_000 })!;
    const linked = fundedPortfolio(w, emptyInvestJournal());
    expect(linked.positions['360750'].qty).toBe(2);
    expect(linked.cash).toBe(walletSummary(w).monthlyUsable);
  });
});
