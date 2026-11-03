import { INSTRUMENT_BY_CODE } from '../../shared/instruments';
import type { Quote } from '../../shared/market';
import { availableCash, cancelOrder, evaluatePending, placeOrder, type Fill, type Order, type OrderContext, type OrderRequest, type PortfolioState } from './trading';
import { transactWorldWallet, walletSummary, type WorldWallet } from './worldWallet';

/**
 * Orders and fills are a journal, NOT a second account.
 * Cash and positions always come from the same virtual wallet shown on Home.
 * The historical standalone 10,000,000 KRW portfolio stays untouched for recovery.
 */
export interface InvestJournal {
  orders: Order[];
  fills: Fill[];
  watchlist: string[];
}

export const emptyInvestJournal = (watchlist = ['005930', '069500']): InvestJournal => ({
  orders: [],
  fills: [],
  watchlist: [...watchlist],
});

export function fundedPortfolio(wallet: WorldWallet, journal: InvestJournal): PortfolioState {
  const summary = walletSummary(wallet);
  const positions: PortfolioState['positions'] = {};
  for (const [code, holding] of Object.entries(wallet.etfs || {})) {
    if (!holding.qty) continue;
    positions[code] = {
      code,
      name: INSTRUMENT_BY_CODE[code]?.name ?? code,
      qty: holding.qty,
      avgPrice: holding.cost / holding.qty,
    };
  }
  // Protect the wallet's rent/bills and living buffer from stock orders.
  return {
    initialCash: summary.monthlyUsable,
    cash: Math.max(0, Math.floor(summary.monthlyUsable)),
    positions,
    orders: journal.orders,
    fills: journal.fills,
    watchlist: journal.watchlist,
  };
}

export type FundedPlaceResult =
  | { ok: true; wallet: WorldWallet; journal: InvestJournal; order: Order; fill?: Fill; duplicate?: boolean }
  | { ok: false; wallet: WorldWallet; journal: InvestJournal; error: string };

function applyToWallet(wallet: WorldWallet, fill: Fill): WorldWallet | null {
  return transactWorldWallet(wallet, {
    type: fill.side === 'buy' ? 'buyEtf' : 'sellEtf',
    code: fill.code,
    name: fill.name,
    qty: fill.qty,
    price: fill.price,
  });
}

export function placeFundedOrder(wallet: WorldWallet, journal: InvestJournal, req: OrderRequest, ctx: OrderContext): FundedPlaceResult {
  const r = placeOrder(fundedPortfolio(wallet, journal), req, ctx);
  if (!r.ok) return { ok: false, wallet, journal, error: r.error };
  if (r.duplicate) return { ok: true, wallet, journal, order: r.order, fill: r.fill, duplicate: true };
  if (!r.fill) {
    return { ok: true, wallet, journal: { ...journal, orders: r.state.orders }, order: r.order };
  }
  const after = applyToWallet(wallet, r.fill);
  if (!after) return { ok: false, wallet, journal, error: '홈의 가상 지갑에서 사용할 수 있는 돈이나 보유 수량이 부족해요.' };
  const fill = { ...r.fill, cashAfter: after.cash };
  return {
    ok: true,
    wallet: after,
    journal: { ...journal, orders: r.state.orders, fills: [fill, ...journal.fills] },
    order: r.order,
    fill,
  };
}

export function settleFundedOrders(
  wallet: WorldWallet,
  journal: InvestJournal,
  quotes: Record<string, Quote | undefined>,
  now: number,
): { wallet: WorldWallet; journal: InvestJournal; fills: Fill[]; changed: boolean } {
  if (!journal.orders.some((o) => o.status === 'pending')) return { wallet, journal, fills: [], changed: false };
  const r = evaluatePending(fundedPortfolio(wallet, journal), quotes, now);
  let nextWallet = wallet;
  let orders = r.state.orders;
  const fills: Fill[] = [];
  for (const candidate of r.fills) {
    const after = applyToWallet(nextWallet, candidate);
    if (after) {
      nextWallet = after;
      fills.push({ ...candidate, cashAfter: nextWallet.cash });
    } else {
      // A later spending/savings decision may have used cash that was only
      // tentatively reserved by a limit order. Never overdraw the wallet.
      orders = orders.map((o) => o.id === candidate.orderId
        ? { ...o, status: 'rejected' as const, note: '다른 가상 소비·저축 후 주문 가능한 금액 또는 보유 수량이 부족해졌어요.' }
        : o);
    }
  }
  const changed = orders !== journal.orders || fills.length > 0;
  return {
    wallet: nextWallet,
    journal: changed ? { ...journal, orders, fills: [...fills.slice().reverse(), ...journal.fills] } : journal,
    fills,
    changed,
  };
}

export function cancelFundedOrder(journal: InvestJournal, id: string): InvestJournal {
  const state = cancelOrder({
    initialCash: 0,
    cash: 0,
    positions: {},
    orders: journal.orders,
    fills: journal.fills,
    watchlist: journal.watchlist,
  }, id);
  return { ...journal, orders: state.orders };
}

export const fundedAvailableCash = (wallet: WorldWallet, journal: InvestJournal): number =>
  availableCash(fundedPortfolio(wallet, journal));
