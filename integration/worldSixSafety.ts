/**
 * Safety-only bridge for the unchanged 3D World explorer.
 * Existing 1-10 year asset figures remain scenario assumptions, NOT
 * a 10-year FastAPI forecast. FastAPI validates exactly 90 days.
 *
 * Uses the canonical S01/S08 account snapshot, not the frontend fixtures.
 * Never credits pretend ETF/savings balances to the payment account.
 */
import { DEMO_AS_OF, type DemoUserId } from './demoFinanceMap.ts';

export const SIX_WORLD_IDS = [
  'purchase_now', 'no_purchase', 'purchase_delay',
  'virtual_savings', 'virtual_investment', 'mixed',
] as const;
export type SixWorldId = typeof SIX_WORLD_IDS[number];

export type SixWorldInput = {
  user: DemoUserId;
  currentBalance: number;
  amount: number;
  minimumBalance: number;
  delayMonths: number;
  mix: number[];
  saveRate: number; // annual percentage as shown in the existing UI
};
export type SixWorldPath = {
  scenario_id: SixWorldId;
  status: 'calculated' | 'needs_confirmation' | 'invalid';
  available_cash: number;
  minimum_balance: number;
  minimum_balance_met: boolean;
  essential_payments_covered: boolean;
  first_shortfall_date: string | null;
  daily_cashflow: { date: string; closing_balance: number; lowest_balance: number }[];
};
export type SixWorldResponse = {
  dataset_id: string; user_id: string; as_of: string; source: string;
  available_cash: number; paths: SixWorldPath[];
};
export type SixWorldSafetyPath = {
  id: SixWorldId;
  result: 'protected' | 'shortfall' | 'needs_confirmation' | 'invalid' | 'out_of_horizon';
  minimumBalance: number | null;
  endingCash: number | null;
  firstShortfall: string | null;
  essentialCovered: boolean | null;
};
export type SixWorldSafety = {
  user: DemoUserId;
  asOf: string;
  horizonDays: 90;
  paths: SixWorldSafetyPath[];
};

function isoOffset(offset: number) {
  const d = new Date(DEMO_AS_OF + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

/** No 3- or 6-month delay is described as verified by a 90-day window. */
export function delayInHorizon(months: number) {
  return months === 0.25 || months === 1;
}

export function buildSixWorldPayload(input: SixWorldInput) {
  if (!['S01', 'S08'].includes(input.user) ||
      !Number.isSafeInteger(input.amount) || input.amount < 1000 || input.amount > 10000000 ||
      !Number.isSafeInteger(input.currentBalance) ||
      !Number.isSafeInteger(input.minimumBalance) || input.minimumBalance < 0 ||
      !Number.isFinite(input.saveRate) || input.saveRate < 0 || input.saveRate > 100 ||
      ![0.25, 1, 3, 6].includes(input.delayMonths) ||
      !Array.isArray(input.mix) || input.mix.length !== 3 ||
      input.mix.some(n => !Number.isSafeInteger(n) || n < 0) ||
      input.mix.reduce((a, b) => a + b, 0) <= 0) {
    throw new Error('world_safety_invalid_input');
  }
  const [p, s, i] = input.mix;
  const total = p + s + i;
  const purchase = Math.floor(input.amount * p / total);
  const savings = Math.floor(input.amount * s / total);
  const investment = Math.floor(input.amount * i / total);
  return {
    user_id: input.user,
    as_of: DEMO_AS_OF,
    horizon_days: 90,
    purchase_amount: input.amount,
    payment_method: 'debit',
    // 90 days is the largest backend-supported delay. Longer configured
    // delays are explicitly marked OUT OF HORIZON in the frontend result.
    purchase_delay_days: input.delayMonths === 0.25 ? 7 :
      input.delayMonths === 1 ? 30 : 90,
    savings_amount: input.amount,
    savings_annual_rate: input.saveRate / 100,
    investment_amount: input.amount,
    // Do NOT reinterpret the UI's ANNUAL 7.2% as a guaranteed 90-day gain.
    // Cashflow safety does not require any hypothetical investment appreciation.
    investment_return_percent: 0,
    minimum_required_balance: input.minimumBalance,
    allocation: {
      purchase, savings, investment,
      cash: input.amount - purchase - savings - investment,
    },
  };
}

export function mapSixWorldSafety(
  response: SixWorldResponse, input: SixWorldInput,
): SixWorldSafety {
  if (response.user_id !== input.user || response.as_of !== DEMO_AS_OF ||
      response.source !== 'synthetic_dataset' || !response.dataset_id ||
      response.available_cash !== input.currentBalance ||
      !Array.isArray(response.paths) || response.paths.length !== SIX_WORLD_IDS.length) {
    throw new Error('world_safety_snapshot_mismatch');
  }
  const seen = new Set<string>();
  const paths: SixWorldSafetyPath[] = [];
  for (const row of response.paths) {
    if (!SIX_WORLD_IDS.includes(row.scenario_id) || seen.has(row.scenario_id) ||
        !['calculated', 'needs_confirmation', 'invalid'].includes(row.status) ||
        row.available_cash !== response.available_cash ||
        !Number.isFinite(row.minimum_balance) ||
        typeof row.minimum_balance_met !== 'boolean' ||
        typeof row.essential_payments_covered !== 'boolean' ||
        !Array.isArray(row.daily_cashflow) || row.daily_cashflow.length !== 90 ||
        (row.first_shortfall_date !== null &&
          (typeof row.first_shortfall_date !== 'string' ||
           row.first_shortfall_date < isoOffset(1) ||
           row.first_shortfall_date > isoOffset(90)))) {
      throw new Error('world_safety_invalid_path');
    }
    seen.add(row.scenario_id);
    row.daily_cashflow.forEach((day, idx) => {
      if (day.date !== isoOffset(idx + 1) ||
          !Number.isFinite(day.closing_balance) ||
          !Number.isFinite(day.lowest_balance)) {
        throw new Error('world_safety_invalid_timeline');
      }
    });
    const unverifiedDelay = row.scenario_id === 'purchase_delay' &&
      !delayInHorizon(input.delayMonths);
    const result: SixWorldSafetyPath['result'] = unverifiedDelay ? 'out_of_horizon'
      : row.status === 'invalid' ? 'invalid'
      : row.status === 'needs_confirmation' ? 'needs_confirmation'
      : row.minimum_balance_met && row.essential_payments_covered
        ? 'protected' : 'shortfall';
    const calculated = row.status === 'calculated' && !unverifiedDelay;
    paths.push({
      id: row.scenario_id,
      result,
      minimumBalance: calculated ? row.minimum_balance : null,
      endingCash: calculated ? row.daily_cashflow[89].closing_balance : null,
      firstShortfall: calculated ? row.first_shortfall_date : null,
      essentialCovered: calculated ? row.essential_payments_covered : null,
    });
  }
  return { user: input.user, asOf: DEMO_AS_OF, horizonDays: 90, paths };
}

export async function getSixWorldSafety(
  input: SixWorldInput, signal: AbortSignal,
): Promise<SixWorldSafety> {
  const body = buildSixWorldPayload(input);
  const res = await fetch('/api/v4/scenarios/compare', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) throw new Error('world_safety_http_' + res.status);
  if (!(res.headers.get('content-type') || '').includes('application/json')) {
    throw new Error('world_safety_non_json');
  }
  return mapSixWorldSafety(await res.json() as SixWorldResponse, input);
}
