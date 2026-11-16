import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildSavingsPlanPayload, mapSavingsPlanResponse, isSupportedSavingsMonths,
} from '../integration/savingsPlan.ts';

const iso = day => {
  const d = new Date('2026-11-04T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + day);
  return d.toISOString().slice(0, 10);
};
const input = {
  user: 'S01', kind: 'saving', currentBalance: 27800,
  minimumBalance: 0, amount: 50000, months: 6,
  ratePercent: 3.2, goalAmount: 1000000,
};
function response({ plan = input, risk = true } = {}) {
  const count = plan.kind === 'saving' ? plan.months : 1;
  const principal = plan.amount * count;
  const rate = plan.ratePercent > 0 ? 4100 : 0;
  const validated = 90;
  const within = plan.kind === 'saving' ? plan.amount * Math.min(3, count) : plan.amount;
  return {
    user_id: plan.user, as_of: '2026-11-04',
    dataset_id: 'MOA-20PERSONAS-92D-HIGH-FIDELITY-JSON-v3',
    source: 'hypothetical_synthetic_dataset',
    goal_amount: plan.goalAmount, current_savings: 0,
    start_date: '2026-11-05', maturity_date: '2027-05-05',
    deposit_frequency: 'monthly', duration_months: plan.months,
    planned_deposit_count: count, planned_deposits_total: principal,
    projected_principal: principal,
    estimated_interest_before_tax: rate,
    projected_maturity_balance: principal + rate,
    projected_goal_progress_percent: 30.41,
    remaining_goal_amount: plan.goalAmount - principal - rate,
    goal_reached_by_maturity: false,
    cashflow_validation_days: validated,
    cashflow_validated_through: iso(validated),
    cashflow_validation_status: risk ? 'fails_assumptions' : 'satisfies_assumptions',
    minimum_payment_account_balance: risk ? -40000 : 27800,
    minimum_required_balance_met: !risk,
    essential_payments_covered: !risk,
    first_shortfall_date: risk ? iso(25) : null,
    deposits_within_validation: within,
    deposits_beyond_validation: principal - within,
    cashflow_preview: Array.from({ length: validated }, (_, i) => ({
      date: iso(i + 1), opening_balance: i ? 27800 - i * 100 : plan.currentBalance,
      closing_balance: 27800 - (i + 1) * 100,
      lowest_balance: 27800 - (i + 1) * 100,
    })),
  };
}

test('monthly six-month savings maps to authoritative 90-day affordability only', () => {
  const body = buildSavingsPlanPayload(input);
  assert.deepEqual(Object.keys(body).sort(), [
    'annual_rate_percent', 'as_of', 'current_savings', 'deposit_amount',
    'deposit_frequency', 'duration_months', 'first_deposit_amount', 'goal_amount',
    'minimum_required_balance', 'user_id',
  ].sort());
  assert.equal(body.as_of, '2026-11-04');
  assert.equal(body.deposit_amount, 50000);
  assert.equal(body.first_deposit_amount, 50000);
  assert.equal(body.annual_rate_percent, 3.2);
  const mapped = mapSavingsPlanResponse(response(), input);
  assert.equal(mapped.projectedPrincipal, 300000);
  assert.equal(mapped.interestBeforeTax, 4100);
  assert.equal(mapped.projectedMaturity, 304100);
  assert.equal(mapped.validationDays, 90);
  assert.equal(mapped.validationStatus, 'fails_assumptions');
  assert.equal(mapped.firstShortfall, iso(25));
  assert.equal(mapped.depositsBeyondValidation, 150000);
  assert.equal(mapped.startDate, '2026-11-05');
});

test('one-time virtual deposit is not silently repeated every month', () => {
  const one = { ...input, kind: 'deposit', amount: 300000 };
  const body = buildSavingsPlanPayload(one);
  assert.equal(body.first_deposit_amount, 300000);
  assert.equal(body.deposit_amount, 0);
  const mapped = mapSavingsPlanResponse(response({ plan: one }), one);
  assert.equal(mapped.projectedPrincipal, 300000);
  assert.equal(mapped.depositsBeyondValidation, 0);
});

test('verified 90-day status does not imply six-month maturity is affordable', () => {
  const safe = mapSavingsPlanResponse(response({ risk: false }), input);
  assert.equal(safe.validationStatus, 'satisfies_assumptions');
  assert.equal(safe.validationDays, 90);
  assert.equal(safe.depositsBeyondValidation, 150000);
  assert.notEqual(safe.maturityDate, safe.startDate);
});

test('reject 24-month UI option and negative/invalid input before server call', () => {
  assert.equal(isSupportedSavingsMonths(24), false);
  assert.equal(isSupportedSavingsMonths(3), true);
  assert.throws(() => buildSavingsPlanPayload({ ...input, months: 24 }), /invalid_input/);
  assert.throws(() => buildSavingsPlanPayload({ ...input, amount: -100 }), /invalid_input/);
  assert.throws(() => buildSavingsPlanPayload({ ...input, ratePercent: -2 }), /invalid_input/);
  assert.throws(() => buildSavingsPlanPayload({ ...input, user: 'S99' }), /invalid_input/);
});

test('reject mismatched financial baseline, persona, date or bogus interest', () => {
  const data = response();
  assert.throws(() => mapSavingsPlanResponse({ ...data, user_id: 'S08' }, input), /mismatched/);
  assert.throws(() => mapSavingsPlanResponse({ ...data, as_of: '2026-11-05' }, input), /mismatched/);
  assert.throws(() => mapSavingsPlanResponse({ ...data, projected_principal: 400000 }, input), /mismatched/);
  assert.throws(() => mapSavingsPlanResponse({ ...data,
    estimated_interest_before_tax: 999 }, input), /mismatched/);
  assert.throws(() => mapSavingsPlanResponse({ ...data,
    cashflow_preview: data.cashflow_preview.map((x,i) => i===0 ?
      {...x, opening_balance: 420000}:x) }, input), /mismatched/);
  assert.throws(() => mapSavingsPlanResponse({ ...data,
    cashflow_preview: data.cashflow_preview.slice(0, 80) }, input), /mismatched/);
});

test('reject contradictory safe status and incomplete savings schedule', () => {
  const data = response();
  assert.throws(() => mapSavingsPlanResponse({ ...data,
    cashflow_validation_status: 'satisfies_assumptions' }, input), /inconsistent/);
  assert.throws(() => mapSavingsPlanResponse({ ...data,
    deposits_beyond_validation: 0 }, input), /mismatched/);
  assert.throws(() => mapSavingsPlanResponse({ ...data,
    first_shortfall_date: iso(100) }, input), /mismatched/);
});
