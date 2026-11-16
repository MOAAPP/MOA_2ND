/**
 * MOA FastAPI v4 savings/plan for the existing virtual savings product sheet.
 *
 * This endpoint NEVER creates a bank account or transfers money. Existing
 * planet/progress/virtual-product records stay local and distinct from the
 * payment account's canonical S01/S08 financial cashflow.
 *
 * The backend validates at most 90 days of affordability. Interest and final
 * maturity are hypothetical simple-interest projections, not guaranteed rates.
 */
import { DEMO_AS_OF, type DemoUserId } from './demoFinanceMap.ts';

export type PlanKind = 'deposit' | 'saving';
export type SavingsInput = {
  user: DemoUserId;
  currentBalance: number;
  minimumBalance: number;
  kind: PlanKind;
  amount: number;
  months: 3 | 6 | 12;
  ratePercent: number;
  goalAmount: number;
};

export type SavingsPlanResult = {
  dataset_id: string;
  source: string;
  user_id: string;
  as_of: string;
  goal_amount: number;
  current_savings: number;
  start_date: string;
  maturity_date: string;
  deposit_frequency: string;
  duration_months: number;
  planned_deposit_count: number;
  planned_deposits_total: number;
  projected_principal: number;
  estimated_interest_before_tax: number | null;
  projected_maturity_balance: number;
  projected_goal_progress_percent: number;
  remaining_goal_amount: number;
  goal_reached_by_maturity: boolean;
  cashflow_validation_days: number;
  cashflow_validated_through: string;
  cashflow_validation_status: 'satisfies_assumptions' | 'fails_assumptions';
  minimum_payment_account_balance: number;
  minimum_required_balance_met: boolean;
  essential_payments_covered: boolean;
  first_shortfall_date: string | null;
  deposits_within_validation: number;
  deposits_beyond_validation: number;
  cashflow_preview: Array<{
    date: string;
    opening_balance: number;
    closing_balance: number;
    lowest_balance: number;
  }>;
};

export type MappedSavingsPlan = {
  origin: 'fastapi_synthetic_savings';
  startDate: string;
  maturityDate: string;
  projectedPrincipal: number;
  interestBeforeTax: number | null;
  projectedMaturity: number;
  goalProgressPercent: number;
  goalReached: boolean;
  validationStatus: 'satisfies_assumptions' | 'fails_assumptions';
  validationDays: number;
  firstShortfall: string | null;
  minimumPaymentBalance: number;
  depositsBeyondValidation: number;
};

const atDay = (days: number) => {
  const d = new Date(DEMO_AS_OF + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

export function isSupportedSavingsMonths(months: number): months is SavingsInput['months'] {
  return months === 3 || months === 6 || months === 12;
}

export function buildSavingsPlanPayload(input: SavingsInput) {
  if ((input.user !== 'S01' && input.user !== 'S08') ||
      !Number.isSafeInteger(input.currentBalance) || input.currentBalance < 0 ||
      !Number.isSafeInteger(input.minimumBalance) || input.minimumBalance < 0 ||
      (input.kind !== 'saving' && input.kind !== 'deposit') ||
      !Number.isSafeInteger(input.amount) || input.amount < 1000 || input.amount > 10000000 ||
      !isSupportedSavingsMonths(input.months) ||
      !Number.isFinite(input.ratePercent) || input.ratePercent < 0 || input.ratePercent > 100 ||
      !Number.isSafeInteger(input.goalAmount) || input.goalAmount < 1) {
    throw new Error('savings_plan_invalid_input');
  }
  return {
    user_id: input.user,
    as_of: DEMO_AS_OF,
    goal_amount: input.goalAmount,
    current_savings: 0,
    // 적금: 첫 회와 후속 월납입. 예금: 첫 회만 목돈 예치.
    deposit_amount: input.kind === 'saving' ? input.amount : 0,
    first_deposit_amount: input.amount,
    deposit_frequency: 'monthly',
    duration_months: input.months,
    annual_rate_percent: input.ratePercent,
    minimum_required_balance: input.minimumBalance,
  };
}

export function mapSavingsPlanResponse(
  raw: SavingsPlanResult, input: SavingsInput,
): MappedSavingsPlan {
  const request = buildSavingsPlanPayload(input);
  if (raw.user_id !== input.user || raw.as_of !== DEMO_AS_OF ||
      !raw.dataset_id || raw.source !== 'hypothetical_synthetic_dataset' ||
      raw.goal_amount !== request.goal_amount || raw.current_savings !== 0 ||
      raw.duration_months !== input.months || raw.deposit_frequency !== 'monthly' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(raw.start_date) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(raw.maturity_date) ||
      raw.start_date <= DEMO_AS_OF || raw.maturity_date <= raw.start_date ||
      !Number.isSafeInteger(raw.planned_deposit_count) ||
      raw.planned_deposit_count !== (input.kind === 'saving' ? input.months : 1) ||
      !Number.isSafeInteger(raw.projected_principal) ||
      raw.projected_principal !== (input.kind === 'saving' ? input.amount * input.months : input.amount) ||
      raw.planned_deposits_total !== raw.projected_principal ||
      !Number.isSafeInteger(raw.projected_maturity_balance) ||
      (raw.estimated_interest_before_tax !== null &&
        (!Number.isSafeInteger(raw.estimated_interest_before_tax) ||
         raw.estimated_interest_before_tax < 0)) ||
      raw.projected_maturity_balance !== raw.projected_principal + (raw.estimated_interest_before_tax || 0) ||
      !Number.isFinite(raw.projected_goal_progress_percent) ||
      !Number.isSafeInteger(raw.remaining_goal_amount) ||
      !Number.isSafeInteger(raw.minimum_payment_account_balance) ||
      !Number.isInteger(raw.cashflow_validation_days) ||
      raw.cashflow_validation_days < 14 || raw.cashflow_validation_days > 90 ||
      raw.cashflow_validated_through !== atDay(raw.cashflow_validation_days) ||
      !Array.isArray(raw.cashflow_preview) ||
      raw.cashflow_preview.length !== raw.cashflow_validation_days ||
      raw.cashflow_preview[0].opening_balance !== input.currentBalance ||
      raw.deposits_within_validation + raw.deposits_beyond_validation !== raw.planned_deposits_total ||
      !Number.isSafeInteger(raw.deposits_within_validation) ||
      !Number.isSafeInteger(raw.deposits_beyond_validation) ||
      raw.deposits_within_validation < 0 || raw.deposits_beyond_validation < 0 ||
      !['satisfies_assumptions', 'fails_assumptions'].includes(raw.cashflow_validation_status) ||
      typeof raw.minimum_required_balance_met !== 'boolean' ||
      typeof raw.essential_payments_covered !== 'boolean' ||
      (raw.first_shortfall_date !== null &&
       (raw.first_shortfall_date < atDay(1) ||
        raw.first_shortfall_date > raw.cashflow_validated_through)) ||
      raw.cashflow_preview.some((p, i) => p.date !== atDay(i + 1) ||
        !Number.isSafeInteger(p.opening_balance) ||
        !Number.isSafeInteger(p.closing_balance) ||
        !Number.isSafeInteger(p.lowest_balance))) {
    throw new Error('savings_plan_invalid_or_mismatched_response');
  }
  // A server cannot call a plan safe if its own minimum-balance checks failed.
  if (raw.cashflow_validation_status === 'satisfies_assumptions' &&
      (!raw.minimum_required_balance_met || !raw.essential_payments_covered)) {
    throw new Error('savings_plan_inconsistent_safety');
  }
  return {
    origin: 'fastapi_synthetic_savings',
    startDate: raw.start_date,
    maturityDate: raw.maturity_date,
    projectedPrincipal: raw.projected_principal,
    interestBeforeTax: raw.estimated_interest_before_tax,
    projectedMaturity: raw.projected_maturity_balance,
    goalProgressPercent: raw.projected_goal_progress_percent,
    goalReached: raw.goal_reached_by_maturity,
    validationStatus: raw.cashflow_validation_status,
    validationDays: raw.cashflow_validation_days,
    firstShortfall: raw.first_shortfall_date,
    minimumPaymentBalance: raw.minimum_payment_account_balance,
    depositsBeyondValidation: raw.deposits_beyond_validation,
  };
}

export async function getSavingsPlan(
  input: SavingsInput, signal: AbortSignal,
): Promise<MappedSavingsPlan> {
  const body = buildSavingsPlanPayload(input);
  const response = await fetch('/api/v4/savings/plan', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok) throw new Error('savings_plan_http_' + response.status);
  if (!(response.headers.get('content-type') || '').includes('application/json')) {
    throw new Error('savings_plan_non_json_response');
  }
  return mapSavingsPlanResponse(await response.json() as SavingsPlanResult, input);
}
