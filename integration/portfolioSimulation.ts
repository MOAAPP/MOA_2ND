/**
 * Demo-only bridge: existing LOCAL virtual ETF wallet -> FastAPI what-if trades.
 *
 * The payment account starts at S01/S08's canonical 2026-11-04 snapshot.
 * Filled local virtual orders are replayed as hypothetical trades on
 * 2026-11-05, NEVER actual orders, bank transfers or observed portfolio.
 *
 * Only explicit trade execution prices are provided: no invented live market
 * prices, guaranteed returns, or liquidation of seeded mock holdings.
 */
import { DEMO_AS_OF, type DemoUserId } from './demoFinanceMap.ts';

export type VirtualOrder = {
  name: string; side: 'buy' | 'sell'; shares: number; price: number;
  status: 'filled' | 'pending' | 'canceled'; id: string; at: string;
  filledAt?: string;
};
type Trade = {
  trade_id: string; code: string; asset_type: 'stock' | 'etf';
  side: 'buy' | 'sell'; trade_date: string; quantity: number; unit_price: number;
  settlement_date?: string;
};
const instruments: Record<string, { code: string; asset_type: 'etf' }> = {
  'TIGER 미국S&P500': { code: 'SP500', asset_type: 'etf' },
  'ACE 미국나스닥100': { code: 'QQQ', asset_type: 'etf' },
  'MOA 평행 우주·AI': { code: 'SPACE', asset_type: 'etf' },
  'SOL 한국고배당': { code: 'DIVIDEND', asset_type: 'etf' },
};

const offset = (days: number) => {
  const d = new Date(DEMO_AS_OF + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
const tradeDate = offset(1);
function twoBusinessDaysAfter(iso: string) {
  const d = new Date(iso + 'T00:00:00Z');
  for (let n = 0; n < 2;) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (d.getUTCDay() !== 0 && d.getUTCDay() !== 6) n++;
  }
  return d.toISOString().slice(0, 10);
}

export type PortfolioInput = {
  user: DemoUserId;
  balance: number;
  minBalance: number;
  orders: VirtualOrder[];
};

export type PortfolioResponse = {
  source: string; user_id: string; as_of: string; dataset_id: string;
  available_cash: number; horizon_days: number;
  trades: Array<Trade & { gross_amount: number; cash_in_validation_window: boolean }>;
  positions: Array<{
    code: string; asset_type: string; quantity: number; cost_basis: number;
    market_value: number; realized_profit_loss: number;
    unrealized_profit_loss: number; total_profit_loss: number;
  }>;
  daily_chart: Array<{
    date: string; payment_account_balance: number;
    payment_account_lowest_balance: number; balance_delta_vs_no_trades: number;
    investment_market_value: number; total_profit_loss: number;
  }>;
  total_buy_amount: number; total_sell_proceeds: number;
  settled_sell_proceeds: number; unsettled_sell_proceeds: number;
  net_payment_account_cash_impact: number; market_value: number;
  remaining_cost_basis: number; realized_profit_loss: number;
  unrealized_profit_loss: number; total_profit_loss: number;
  minimum_payment_account_balance: number;
  baseline_minimum_payment_account_balance: number;
  minimum_required_balance_met: boolean;
  essential_payments_covered: boolean;
  first_shortfall_date: string | null;
  cashflow_validation_status: 'satisfies_assumptions' | 'fails_assumptions';
};

export type PortfolioValidation = {
  origin: 'fastapi_hypothetical_portfolio';
  user: DemoUserId;
  count: number;
  marketValue: number;
  realizedProfitLoss: number;
  unrealizedProfitLoss: number;
  totalProfitLoss: number;
  minimumPaymentBalance: number;
  baselineMinimumBalance: number;
  firstShortfall: string | null;
  status: 'satisfies_assumptions' | 'fails_assumptions';
  endingPaymentBalance: number;
  // The separate local virtual defense wallet is NOT adjusted by this API.
};

export function filledOrderKey(input: PortfolioInput) {
  return JSON.stringify([input.user, input.balance, input.minBalance,
    input.orders.filter(o => o.status === 'filled')
      .map(o => [o.id, o.name, o.side, o.shares, o.price, o.filledAt ?? o.at])]);
}

export function buildPortfolioPayload(input: PortfolioInput) {
  if (!['S01', 'S08'].includes(input.user) ||
      !Number.isSafeInteger(input.balance) || input.balance < 0 ||
      !Number.isSafeInteger(input.minBalance) || input.minBalance < 0 ||
      !Array.isArray(input.orders)) {
    throw new Error('portfolio_invalid_snapshot');
  }
  const filled = input.orders.filter(o => o.status === 'filled').reverse();
  if (!filled.length) throw new Error('portfolio_no_filled_trades');
  if (filled.length > 60) throw new Error('portfolio_max_60_trades');
  const held: Record<string, number> = {};
  const trades: Trade[] = [];
  for (const [i, o] of filled.entries()) {
    const item = instruments[o.name];
    if (!item || !['buy', 'sell'].includes(o.side) ||
        !Number.isSafeInteger(o.shares) || o.shares < 1 || o.shares > 1000000 ||
        !Number.isSafeInteger(o.price) || o.price < 1 || o.price > 1000000000) {
      throw new Error('portfolio_unsupported_virtual_order');
    }
    const old = held[item.code] || 0;
    // Backend expressly forbids selling the ZIP's fabricated initial holdings:
    // only previously HYPOTHETICALLY BOUGHT shares can be sold.
    if (o.side === 'sell' && old < o.shares) {
      throw new Error('portfolio_sell_without_simulated_purchase');
    }
    held[item.code] = old + (o.side === 'buy' ? o.shares : -o.shares);
    trades.push({
      trade_id: 'demo_' + String(i + 1).padStart(3, '0'),
      code: item.code,
      asset_type: item.asset_type,
      side: o.side,
      trade_date: tradeDate,
      quantity: o.shares,
      unit_price: o.price,
      ...(o.side === 'sell' ? { settlement_date: twoBusinessDaysAfter(tradeDate) } : {}),
    });
  }
  return {
    user_id: input.user,
    as_of: DEMO_AS_OF,
    horizon_days: 90,
    trades,
    // Valuation remains last explicitly recorded transaction price.
    // We do NOT fabricate 90-day stock returns or pass live quotes.
    price_marks: [],
    valuation_loss_percent: 0,
    minimum_required_balance: input.minBalance,
  };
}

export function mapPortfolioResponse(
  raw: PortfolioResponse, input: PortfolioInput,
): PortfolioValidation {
  const requested = buildPortfolioPayload(input);
  if (raw.user_id !== input.user || raw.as_of !== DEMO_AS_OF ||
      raw.source !== 'hypothetical_synthetic_dataset' || !raw.dataset_id ||
      raw.available_cash !== input.balance || raw.horizon_days !== 90 ||
      !Array.isArray(raw.trades) || raw.trades.length !== requested.trades.length ||
      !Array.isArray(raw.positions) || !Array.isArray(raw.daily_chart) ||
      raw.daily_chart.length !== 90 ||
      !['satisfies_assumptions', 'fails_assumptions'].includes(raw.cashflow_validation_status)) {
    throw new Error('portfolio_mismatched_response');
  }
  raw.trades.forEach((r, i) => {
    const t = requested.trades[i];
    if (r.trade_id !== t.trade_id || r.code !== t.code ||
        r.side !== t.side || r.asset_type !== t.asset_type ||
        r.quantity !== t.quantity || r.unit_price !== t.unit_price ||
        r.trade_date !== t.trade_date ||
        (t.settlement_date && r.settlement_date !== t.settlement_date) ||
        r.gross_amount !== t.quantity * t.unit_price ||
        r.cash_in_validation_window !== true) {
      throw new Error('portfolio_unexpected_trade_receipt');
    }
  });
  const buys = requested.trades.filter(t => t.side === 'buy')
    .reduce((sum, t) => sum + t.quantity * t.unit_price, 0);
  const sells = requested.trades.filter(t => t.side === 'sell')
    .reduce((sum, t) => sum + t.quantity * t.unit_price, 0);
  const numeric = [
    raw.total_buy_amount, raw.total_sell_proceeds, raw.settled_sell_proceeds,
    raw.unsettled_sell_proceeds, raw.net_payment_account_cash_impact,
    raw.market_value, raw.remaining_cost_basis, raw.realized_profit_loss,
    raw.unrealized_profit_loss, raw.total_profit_loss,
    raw.minimum_payment_account_balance, raw.baseline_minimum_payment_account_balance,
  ];
  if (numeric.some(x => !Number.isSafeInteger(x)) ||
      raw.total_buy_amount !== buys ||
      raw.total_sell_proceeds !== sells ||
      raw.settled_sell_proceeds !== sells || raw.unsettled_sell_proceeds !== 0 ||
      raw.net_payment_account_cash_impact !== sells - buys ||
      raw.total_profit_loss !== raw.realized_profit_loss + raw.unrealized_profit_loss ||
      raw.total_profit_loss !== raw.market_value + sells - buys ||
      raw.positions.reduce((sum,p) => sum + p.market_value, 0) !== raw.market_value ||
      raw.positions.reduce((sum,p) => sum + p.cost_basis, 0) !== raw.remaining_cost_basis ||
      raw.positions.reduce((sum,p) => sum + p.realized_profit_loss, 0) !== raw.realized_profit_loss ||
      raw.positions.reduce((sum,p) => sum + p.unrealized_profit_loss, 0) !== raw.unrealized_profit_loss ||
      typeof raw.minimum_required_balance_met !== 'boolean' ||
      typeof raw.essential_payments_covered !== 'boolean' ||
      (raw.cashflow_validation_status === 'satisfies_assumptions' &&
        (!raw.minimum_required_balance_met || !raw.essential_payments_covered)) ||
      (raw.first_shortfall_date !== null &&
        (raw.first_shortfall_date < DEMO_AS_OF || raw.first_shortfall_date > offset(90)))) {
    throw new Error('portfolio_financial_reconciliation_failed');
  }
  raw.daily_chart.forEach((p, i) => {
    if (p.date !== offset(i+1) ||
        !Number.isSafeInteger(p.payment_account_balance) ||
        !Number.isSafeInteger(p.payment_account_lowest_balance) ||
        !Number.isSafeInteger(p.balance_delta_vs_no_trades) ||
        !Number.isSafeInteger(p.investment_market_value) ||
        !Number.isSafeInteger(p.total_profit_loss)) {
      throw new Error('portfolio_invalid_daily_chart');
    }
  });
  const last = raw.daily_chart[89];
  if (last.balance_delta_vs_no_trades !== sells-buys ||
      last.investment_market_value !== raw.market_value ||
      last.total_profit_loss !== raw.total_profit_loss) {
    throw new Error('portfolio_final_chart_mismatch');
  }
  return {
    origin: 'fastapi_hypothetical_portfolio', user: input.user,
    count: requested.trades.length, marketValue: raw.market_value,
    realizedProfitLoss: raw.realized_profit_loss,
    unrealizedProfitLoss: raw.unrealized_profit_loss,
    totalProfitLoss: raw.total_profit_loss,
    minimumPaymentBalance: raw.minimum_payment_account_balance,
    baselineMinimumBalance: raw.baseline_minimum_payment_account_balance,
    firstShortfall: raw.first_shortfall_date,
    status: raw.cashflow_validation_status,
    endingPaymentBalance: last.payment_account_balance,
  };
}

export async function getPortfolioValidation(
  input: PortfolioInput, signal: AbortSignal,
): Promise<PortfolioValidation> {
  const payload = buildPortfolioPayload(input);
  const res = await fetch('/api/v4/portfolio/simulate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(payload), signal,
  });
  if (!res.ok) throw new Error('portfolio_http_' + res.status);
  if (!(res.headers.get('content-type') || '').includes('application/json')) {
    throw new Error('portfolio_non_json_response');
  }
  return mapPortfolioResponse(await res.json() as PortfolioResponse, input);
}

let cache: { key: string; result: PortfolioValidation } | null = null;
export function readPortfolioValidation(input: PortfolioInput) {
  return cache?.key === filledOrderKey(input) ? cache.result : null;
}
export function commitPortfolioValidation(input: PortfolioInput, report: PortfolioValidation) {
  cache = { key: filledOrderKey(input), result: report };
}
