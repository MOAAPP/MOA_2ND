import test from 'node:test';
import assert from 'node:assert/strict';
import { mapWorldResponse } from '../integration/worldComparison.ts';

const IDs = ['purchase_now', 'no_purchase', 'purchase_delay',
  'virtual_savings', 'virtual_investment', 'mixed'];
const dateOf = day => {
  const date = new Date('2026-11-04T00:00:00Z');
  date.setUTCDate(date.getUTCDate() + day);
  return date.toISOString().slice(0, 10);
};
function response(days = 14) {
  return {
    dataset_id: 'MOA-20PERSONAS-92D-HIGH-FIDELITY-JSON-v3',
    user_id: 'S01', as_of: '2026-11-04', source: 'synthetic_dataset',
    available_cash: 27800,
    paths: IDs.map(id => ({
      scenario_id: id,
      status: id === 'mixed' ? 'invalid' : 'calculated',
      available_cash: 27800,
      first_shortfall_date: id === 'purchase_now' ? dateOf(20) : null,
      daily_cashflow: Array.from({ length: days }, (_, i) => ({
        date: dateOf(i + 1),
        closing_balance: 27800 - (i + 1) * 100 -
          (id === 'purchase_now' ? 9000 : id === 'virtual_savings' ? 4000 : 0),
        lowest_balance: 27800 - (i + 1) * 100 -
          (id === 'purchase_now' ? 9000 : 0),
      })),
    })),
  };
}

test('7-day UI uses 14-day FastAPI result without extra local forecast', () => {
  const out = mapWorldResponse(response(), 'S01', 9000, 7, 27800);
  assert.equal(out.validated_days, 14);
  assert.equal(out.points[0].date, '2026-11-04');
  assert.equal(out.points[0].bought, 27800);
  assert.equal(out.boughtEnd, 27800 - 700 - 9000);
  assert.equal(out.keptEnd, 27800 - 700);
  assert.equal(out.delta, 9000);
  assert.equal(out.boughtRisk, null);
  assert.equal(out.checked_paths.length, 6);
});

test('30-day risk is derived from backend first shortfall, not browser heuristics', () => {
  const out = mapWorldResponse(response(30), 'S01', 9000, 30, 27800, 'transfer');
  assert.equal(out.boughtRisk, dateOf(20));
  assert.equal(out.keptRisk, null);
  assert.equal(out.payment, '계좌이체 (직접 이체)');
  assert.equal(out.points.at(-1).date, dateOf(30));
});

test('90-day results preserve server day 90 without five-year investment fantasies', () => {
  const out = mapWorldResponse(response(90), 'S01', 9000, 90, 27800);
  assert.equal(out.validated_days, 90);
  assert.equal(out.boughtEnd, 27800 - 9000 - 9000);
  assert.equal(out.keptEnd, 27800 - 9000);
  assert.equal(out.delta, 9000);
});

test('reject mixed users and financial drift before rendering any number', () => {
  assert.throws(() => mapWorldResponse(response(), 'S08', 9000, 7, 27800), /mismatch/);
  assert.throws(() => mapWorldResponse(response(), 'S01', 9000, 7, 27801), /mismatch/);
  assert.throws(() => mapWorldResponse({ ...response(), as_of: '2026-11-05' },
    'S01', 9000, 7, 27800), /mismatch/);
});

test('reject missing, duplicate and malformed backend paths', () => {
  const r = response();
  assert.throws(() => mapWorldResponse({ ...r, paths: r.paths.slice(0, 5) },
    'S01', 9000, 7, 27800), /mismatch/);
  const duplicate = response(); duplicate.paths[5].scenario_id = 'no_purchase';
  assert.throws(() => mapWorldResponse(duplicate, 'S01', 9000, 7, 27800), /incomplete/);
  const invalid = response(); invalid.paths[0].daily_cashflow[0].date = '2026-12-01';
  assert.throws(() => mapWorldResponse(invalid, 'S01', 9000, 7, 27800), /timeline/);
  const needsConfirmation = response(); needsConfirmation.paths[0].status = 'needs_confirmation';
  assert.throws(() => mapWorldResponse(needsConfirmation, 'S01', 9000, 7, 27800), /confirmation/);
});
