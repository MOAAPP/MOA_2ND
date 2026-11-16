import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SIX_WORLD_IDS, buildSixWorldPayload, mapSixWorldSafety, delayInHorizon,
} from '../integration/worldSixSafety.ts';

const input = {
  user: 'S01', currentBalance: 27800, amount: 259000,
  minimumBalance: 0, delayMonths: 0.25, mix: [1, 1, 1], saveRate: 3.8,
};
const iso = offset => {
  const date = new Date('2026-11-04T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
};
function response() {
  return {
    dataset_id: 'MOA-20PERSONAS-92D-HIGH-FIDELITY-JSON-v3',
    user_id: 'S01', as_of: '2026-11-04',
    source: 'synthetic_dataset', available_cash: 27800,
    paths: SIX_WORLD_IDS.map((scenario_id, i) => ({
      scenario_id,
      status: i === 5 ? 'invalid' : i === 3 ? 'needs_confirmation' : 'calculated',
      available_cash: 27800,
      minimum_balance: i === 0 ? -120000 : 5000,
      minimum_balance_met: i !== 0,
      essential_payments_covered: i !== 0,
      first_shortfall_date: i === 0 ? iso(18) : null,
      daily_cashflow: Array.from({ length: 90 }, (_, d) => ({
        date: iso(d + 1),
        closing_balance: 27800 - (d + 1) * 30,
        lowest_balance: 27800 - (d + 1) * 30,
      })),
    })),
  };
}

test('construct 90-day request without an unaffordable explicit allocation', () => {
  const body = buildSixWorldPayload(input);
  assert.equal(body.user_id, 'S01');
  assert.equal(body.as_of, '2026-11-04');
  assert.equal(body.horizon_days, 90);
  assert.equal(body.purchase_delay_days, 7);
  assert.equal(body.savings_annual_rate, 0.038);
  assert.equal(body.investment_return_percent, 0);
  assert.equal(body.minimum_required_balance, 0);
  // Sending this allocation on a 27,800 KRW account would make FastAPI
  // reject the entire six-world compare request with HTTP 422.
  assert.equal(Object.hasOwn(body, 'allocation'), false);
  const affordable = buildSixWorldPayload({ ...input, currentBalance: 350000 });
  assert.equal(Object.values(affordable.allocation).reduce((a, b) => a + b, 0), input.amount);
});

test('respect selection options and explicitly mark out-of-horizon delays', () => {
  assert.equal(delayInHorizon(0.25), true);
  assert.equal(delayInHorizon(1), true);
  assert.equal(delayInHorizon(3), false);
  assert.equal(delayInHorizon(6), false);
  const twoWay = buildSixWorldPayload({ ...input, currentBalance: 350000, delayMonths: 6, mix: [0, 1, 1] });
  assert.equal(twoWay.purchase_delay_days, 90);
  assert.equal(twoWay.allocation.purchase, 0);
  assert.equal(twoWay.allocation.savings + twoWay.allocation.investment, input.amount);
  const report = mapSixWorldSafety(response(), { ...input, delayMonths: 3 });
  assert.equal(report.paths[2].result, 'out_of_horizon');
  assert.equal(report.paths[2].minimumBalance, null);
  assert.equal(report.paths[2].endingCash, null);
});

test('distinguish six safe/unsafe/confirmation/invalid paths without adding ETF to cash', () => {
  const report = mapSixWorldSafety(response(), input);
  assert.equal(report.paths.length, 6);
  assert.equal(report.user, 'S01');
  assert.equal(report.asOf, '2026-11-04');
  assert.equal(report.horizonDays, 90);
  assert.deepEqual(report.paths.map(x => x.result), [
    'shortfall', 'protected', 'protected',
    'needs_confirmation', 'protected', 'invalid',
  ]);
  assert.equal(report.paths[0].minimumBalance, -120000);
  assert.equal(report.paths[0].firstShortfall, iso(18));
  assert.equal(report.paths[1].endingCash, 27800 - 90 * 30);
  assert.equal(report.paths[3].endingCash, null);
  assert.equal(report.paths[5].essentialCovered, null);
});

test('reject stale user or non-canonical balances and incomplete responses', () => {
  assert.throws(() => mapSixWorldSafety(response(), { ...input, user: 'S08' }), /mismatch/);
  assert.throws(() => mapSixWorldSafety(response(), { ...input, currentBalance: 99999 }), /mismatch/);
  const stale = response(); stale.as_of = '2026-11-05';
  assert.throws(() => mapSixWorldSafety(stale, input), /mismatch/);
  const missing = response(); missing.paths.pop();
  assert.throws(() => mapSixWorldSafety(missing, input), /mismatch/);
  const duplicate = response(); duplicate.paths[5].scenario_id = 'no_purchase';
  assert.throws(() => mapSixWorldSafety(duplicate, input), /path/);
});

test('reject malformed history and unsafe inputs', () => {
  const badDate = response();
  badDate.paths[0].daily_cashflow[0].date = '2026-11-07';
  assert.throws(() => mapSixWorldSafety(badDate, input), /timeline/);
  const wrongLength = response(); wrongLength.paths[0].daily_cashflow.pop();
  assert.throws(() => mapSixWorldSafety(wrongLength, input), /path/);
  assert.throws(() => buildSixWorldPayload({ ...input, amount: -1 }), /invalid_input/);
  assert.throws(() => buildSixWorldPayload({ ...input, mix: [0, 0, 0] }), /invalid_input/);
  assert.throws(() => buildSixWorldPayload({ ...input, delayMonths: 12 }), /invalid_input/);
});
