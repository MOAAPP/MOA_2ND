/**
 * MOA FastAPI v4 /scenarios/compare -> existing WorldChoice graph data.
 *
 * One canonical read-only S01/S08 snapshot drives all six paths. Only the
 * purchase/no-purchase PAYMENT ACCOUNT cashflows are plotted. Neither virtual
 * savings nor mock portfolio valuations are added to spendable cash.
 *
 * FastAPI validates 14..90 days; the existing 7-day button uses day 7 of a
 * 14-day server calculation, not a client-side 7-day extrapolation.
 */
import { DEMO_AS_OF, type DemoUserId } from './demoFinanceMap.ts';
import type { ChoiceProjection } from './choiceComparison';

const ids = ['purchase_now', 'no_purchase', 'purchase_delay',
  'virtual_savings', 'virtual_investment', 'mixed'] as const;
type WorldId = typeof ids[number];

export type WorldDay = { date: string; closing_balance: number; lowest_balance: number };
export type WorldPath = {
  scenario_id: WorldId;
  status: 'calculated' | 'needs_confirmation' | 'invalid';
  available_cash: number;
  first_shortfall_date: string | null;
  daily_cashflow: WorldDay[];
};
export type WorldResponse = {
  dataset_id: string;
  user_id: string;
  as_of: string;
  source: string;
  available_cash: number;
  paths: WorldPath[];
};

export type WorldProjection = ChoiceProjection & {
  origin: 'fastapi_synthetic_finance';
  checked_paths: WorldId[];
  validated_days: number;
};

function atDay(days: number) {
  const date = new Date(DEMO_AS_OF + 'T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/** Validate all six paths BEFORE showing any number. Never silently fake an answer. */
export function mapWorldResponse(
  response: WorldResponse, user: DemoUserId, amount: number, period: 7 | 30 | 90,
  currentBalance: number, paymentMethod: 'debit' | 'transfer' = 'debit',
): WorldProjection {
  if (response.user_id !== user || response.as_of !== DEMO_AS_OF ||
      response.source !== 'synthetic_dataset' ||
      !response.dataset_id || !Number.isFinite(response.available_cash) ||
      response.available_cash !== currentBalance || !Array.isArray(response.paths) ||
      response.paths.length !== ids.length) {
    throw new Error('world_snapshot_or_persona_mismatch');
  }
  const horizon = Math.max(14, period);
  const byId = new Map<WorldId, WorldPath>();
  for (const path of response.paths) {
    if (!ids.includes(path.scenario_id) || byId.has(path.scenario_id) ||
        !['calculated', 'needs_confirmation', 'invalid'].includes(path.status) ||
        path.available_cash !== response.available_cash ||
        !Array.isArray(path.daily_cashflow) || path.daily_cashflow.length !== horizon) {
      throw new Error('world_invalid_or_incomplete_paths');
    }
    path.daily_cashflow.forEach((day, index) => {
      if (day.date !== atDay(index + 1) || !Number.isFinite(day.closing_balance) ||
          !Number.isFinite(day.lowest_balance)) {
        throw new Error('world_invalid_cashflow_timeline');
      }
    });
    byId.set(path.scenario_id, path);
  }
  const bought = byId.get('purchase_now');
  const kept = byId.get('no_purchase');
  if (!bought || !kept || bought.status !== 'calculated' || kept.status !== 'calculated') {
    throw new Error('world_purchase_choice_requires_confirmation');
  }
  // Defensive: ensure this really compares a requested purchase amount.
  if (!Number.isSafeInteger(amount) || amount < 1000) throw new Error('world_invalid_purchase_amount');
  const ticks = [...new Set([0, Math.floor(period / 4),
    Math.floor(period / 2), Math.floor(period * 3 / 4), period])];
  const points = ticks.map(day => ({
    day, date: atDay(day),
    bought: day === 0 ? response.available_cash : bought.daily_cashflow[day - 1].closing_balance,
    kept: day === 0 ? response.available_cash : kept.daily_cashflow[day - 1].closing_balance,
  }));
  const last = points[points.length - 1];
  return {
    boughtNow: response.available_cash,
    keptNow: response.available_cash,
    boughtEnd: last.bought,
    keptEnd: last.kept,
    delta: last.kept - last.bought,
    points,
    boughtRisk: bought.first_shortfall_date && bought.first_shortfall_date <= atDay(period)
      ? bought.first_shortfall_date : null,
    keptRisk: kept.first_shortfall_date && kept.first_shortfall_date <= atDay(period)
      ? kept.first_shortfall_date : null,
    payment: paymentMethod === 'transfer' ? '계좌이체 (직접 이체)' : '체크카드 (즉시 출금)',
    actual: 'demo',
    isDemo: true,
    origin: 'fastapi_synthetic_finance',
    checked_paths: [...byId.keys()],
    validated_days: horizon,
  };
}

/** Abortable live request; never use mock JSON, local projections, or stale data. */
export async function getWorldProjection(
  user: DemoUserId, amount: number, period: 7 | 30 | 90, currentBalance: number,
  signal: AbortSignal, paymentMethod: 'debit' | 'transfer' = 'debit',
): Promise<WorldProjection> {
  const response = await fetch('/api/v4/scenarios/compare', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      user_id: user,
      as_of: DEMO_AS_OF,
      horizon_days: Math.max(14, period),
      purchase_amount: amount,
      payment_method: paymentMethod,
      minimum_required_balance: 0,
      investment_return_percent: 0,
    }),
  });
  if (!response.ok) throw new Error('world_backend_http_' + response.status);
  if (!(response.headers.get('content-type') || '').includes('application/json')) {
    throw new Error('world_backend_non_json_response');
  }
  return mapWorldResponse(await response.json() as WorldResponse,
    user, amount, period, currentBalance, paymentMethod);
}
