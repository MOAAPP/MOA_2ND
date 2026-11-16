import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPortfolioPayload, mapPortfolioResponse, filledOrderKey,
  readPortfolioValidation, commitPortfolioValidation,
} from '../integration/portfolioSimulation.ts';

const orders = [
  { id: 'latest-sell', name: 'TIGER 미국S&P500', side: 'sell', shares: 1,
    price: 12000, status: 'filled', at: '2026-11-16T05:10:00Z' },
  { id: 'stock-buy', name: 'ACE 미국나스닥100', side: 'buy', shares: 1,
    price: 5000, status: 'filled', at: '2026-11-16T05:09:00Z' },
  { id: 'first-buy', name: 'TIGER 미국S&P500', side: 'buy', shares: 2,
    price: 10000, status: 'filled', at: '2026-11-16T05:08:00Z' },
  { id: 'unfilled', name: 'MOA 평행 우주·AI', side: 'buy', shares: 3,
    price: 10000, status: 'pending', at: '2026-11-16T05:07:00Z' },
  { id: 'cancelled', name: 'SOL 한국고배당', side: 'buy', shares: 2,
    price: 10000, status: 'canceled', at: '2026-11-16T05:06:00Z' },
];
const input = {
  user: 'S01', balance: 27800, minBalance: 0, orders,
};
function iso(days) {
  const d = new Date('2026-11-04T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}
function serverResponse(req = input) {
  const expected = buildPortfolioPayload(req);
  const positions = [
    { code: 'SP500', asset_type: 'etf', quantity: 1, cost_basis: 10000,
      market_value: 12000, realized_profit_loss: 2000,
      unrealized_profit_loss: 2000, total_profit_loss: 4000 },
    { code: 'QQQ', asset_type: 'etf', quantity: 1, cost_basis: 5000,
      market_value: 5000, realized_profit_loss: 0,
      unrealized_profit_loss: 0, total_profit_loss: 0 },
  ];
  return {
    source: 'hypothetical_synthetic_dataset',
    dataset_id: 'MOA-20PERSONAS-92D-HIGH-FIDELITY-JSON-v3',
    user_id: req.user, as_of: '2026-11-04',
    available_cash: req.balance, horizon_days: 90,
    trades: expected.trades.map(t => ({
      ...t, settlement_date: t.settlement_date ?? t.trade_date,
      gross_amount: t.quantity * t.unit_price,
      cash_in_validation_window: true,
    })),
    positions,
    daily_chart: Array.from({ length: 90 }, (_, i) => ({
      date: iso(i+1), payment_account_balance: 27800 - i*50,
      payment_account_lowest_balance: 27800 - i*50,
      balance_delta_vs_no_trades: i === 89 ? -13000 : -25000,
      investment_market_value: i === 89 ? 17000 : 20000,
      total_profit_loss: i === 89 ? 4000 : 0,
    })),
    total_buy_amount: 25000, total_sell_proceeds: 12000,
    settled_sell_proceeds: 12000, unsettled_sell_proceeds: 0,
    net_payment_account_cash_impact: -13000,
    market_value: 17000, remaining_cost_basis: 15000,
    realized_profit_loss: 2000, unrealized_profit_loss: 2000,
    total_profit_loss: 4000, minimum_payment_account_balance: -1000,
    baseline_minimum_payment_account_balance: 10000,
    minimum_required_balance_met: false,
    essential_payments_covered: false,
    first_shortfall_date: iso(30),
    cashflow_validation_status: 'fails_assumptions',
  };
}

test('replay filled virtual ETF trades only, with two-business-day sale settlement', () => {
  const payload = buildPortfolioPayload(input);
  assert.equal(payload.as_of, '2026-11-04');
  assert.equal(payload.horizon_days, 90);
  assert.equal(payload.trades.length, 3);
  assert.deepEqual(payload.trades.map(t => t.code), ['SP500', 'QQQ', 'SP500']);
  assert.deepEqual(payload.trades.map(t => t.side), ['buy', 'buy', 'sell']);
  assert(payload.trades.every(t => t.trade_date === '2026-11-05'));
  assert.equal(payload.trades[2].settlement_date, '2026-11-09');
  assert.equal(payload.price_marks.length, 0);
  assert.equal(payload.valuation_loss_percent, 0);
  assert.equal(payload.forecast_daily_spend_override, undefined);
});

test('cash reconciliation, realized vs unrealized P&L, and shortest cash remain separate', () => {
  const mapped = mapPortfolioResponse(serverResponse(), input);
  assert.equal(mapped.user, 'S01');
  assert.equal(mapped.count, 3);
  assert.equal(mapped.marketValue, 17000);
  assert.equal(mapped.realizedProfitLoss, 2000);
  assert.equal(mapped.unrealizedProfitLoss, 2000);
  assert.equal(mapped.totalProfitLoss, 4000);
  assert.equal(mapped.minimumPaymentBalance, -1000);
  assert.equal(mapped.baselineMinimumBalance, 10000);
  assert.equal(mapped.status, 'fails_assumptions');
  assert.equal(mapped.firstShortfall, iso(30));
  assert.equal(mapped.endingPaymentBalance, 27800 - 89*50);
});

test('prevent selling seeded mock holdings without a prior hypothetical buy', () => {
  const bad = { ...input, orders: [{ ...orders[0] }] };
  assert.throws(() => buildPortfolioPayload(bad), /sell_without_simulated_purchase/);
  const oversell = { ...input, orders: [
    { ...orders[0], shares: 3 }, { ...orders[2], shares: 2 },
  ] };
  assert.throws(() => buildPortfolioPayload(oversell), /sell_without_simulated_purchase/);
});

test('reject fractional shares, fake instruments, and >60 executed trades', () => {
  assert.throws(() => buildPortfolioPayload({
    ...input, orders: [{ ...orders[2], shares: 1.45 }] }), /unsupported_virtual_order/);
  assert.throws(() => buildPortfolioPayload({
    ...input, orders: [{ ...orders[2], name: 'UNRECOGNIZED' }] }), /unsupported_virtual_order/);
  assert.throws(() => buildPortfolioPayload({
    ...input, orders: Array.from({ length: 61 }, (_, i) =>
      ({ ...orders[2], id: String(i) })) }), /max_60/);
  assert.throws(() => buildPortfolioPayload({ ...input, balance: -4 }), /invalid_snapshot/);
  assert.throws(() => buildPortfolioPayload({
    ...input, orders: orders.filter(o => o.status !== 'filled') }), /no_filled_trades/);
});

test('cannot show another user or stale backend cash as verified', () => {
  const data = serverResponse();
  assert.throws(() => mapPortfolioResponse({ ...data, user_id: 'S08' }, input), /mismatched/);
  assert.throws(() => mapPortfolioResponse({ ...data, available_cash: 420000 }, input), /mismatched/);
  assert.throws(() => mapPortfolioResponse({ ...data, as_of: '2026-11-05' }, input), /mismatched/);
  assert.throws(() => mapPortfolioResponse({ ...data, horizon_days: 14 }, input), /mismatched/);
});

test('cannot present fabricated trade receipts, settled proceeds or portfolio profit', () => {
  const data = serverResponse();
  assert.throws(() => mapPortfolioResponse({ ...data,
    trades: [{ ...data.trades[0], unit_price: 9999 }, ...data.trades.slice(1)] }, input), /receipt/);
  assert.throws(() => mapPortfolioResponse({ ...data,
    net_payment_account_cash_impact: -12 }, input), /reconciliation/);
  assert.throws(() => mapPortfolioResponse({ ...data,
    total_profit_loss: 999999 }, input), /reconciliation/);
  assert.throws(() => mapPortfolioResponse({ ...data,
    daily_chart: data.daily_chart.slice(0, 80) }, input), /mismatched/);
  assert.throws(() => mapPortfolioResponse({ ...data,
    daily_chart: data.daily_chart.map((x,i) => i===0 ? {...x, date:'2026-11-16'}:x) }, input), /daily_chart/);
});

test('validated cache is scoped to exact persona, balance, and filled orders', () => {
  const report = mapPortfolioResponse(serverResponse(), input);
  commitPortfolioValidation(input, report);
  assert.equal(readPortfolioValidation(input)?.count, 3);
  assert.equal(readPortfolioValidation({ ...input, user: 'S08' }), null);
  assert.equal(readPortfolioValidation({ ...input, balance: 27801 }), null);
  assert.equal(readPortfolioValidation({ ...input, orders: orders.slice(1) }), null);
  assert.equal(filledOrderKey(input),
    filledOrderKey({ ...input, orders: orders.slice(0,-1) })); // canceled orders ignored
});
