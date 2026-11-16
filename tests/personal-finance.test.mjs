import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildPersonalSnapshot, mapPersonalComparison, parsePersonalGoal,
  comparePersonal, analyzePersonalGoal,
} from '../integration/personalFinance.ts';

const asOf = '2026-11-16';
const dateOf = day => {
  const dt = new Date(asOf + 'T00:00:00Z');
  dt.setUTCDate(dt.getUTCDate() + day);
  return dt.toISOString().slice(0,10);
};
const mockStore = () => ({
  finance: { balance: 825000, salary: 2100000, minBalance: 120000 },
  profile: { payday: 25, monthlyBudget: 500000, name: 'secret-person' },
  bills: [
    { id: 'b1', name: 'MY STREET ADDRESS', day: 20, amount: 350000, kind: 'rent' },
    { id: 'b2', name: 'MY BILL', day: 31, amount: 24000, kind: 'phone' },
  ],
  txs: [
    { id: 't1', date: '2026-11-15', type: 'expense', amount: 90000,
      payment: '체크카드 (즉시 출금)', title: 'REAL SECRET SHOP' },
    { id: 't2', date: '2026-11-17', type: 'expense', amount: 25000,
      payment: '체크카드 (즉시 출금)', title: 'FUTURE SECRET SHOP' },
    { id: 't3', date: '2026-11-20', type: 'expense', amount: 67000,
      payment: '신용카드', title: 'CREDIT SECRET SHOP' },
    { id: 't4', date: '2026-11-21', type: 'transfer', amount: 30000,
      payment: '계좌이체 (직접 이체)', title: 'Savings transfer' },
    { id: 't5', date: '2026-11-18', type: 'expense', amount: 18000,
      payment: '현금', title: 'Cash shop' },
  ],
});
function makeResponse(snapshot, amount = 259000, period = 7) {
  const ids = ['purchase_now','no_purchase','purchase_delay',
    'virtual_savings','virtual_investment','mixed'];
  return {
    source: 'user_entered_hypothetical',
    calculator: 'python_finance_cashflow_rules',
    as_of: snapshot.as_of, available_cash: snapshot.balance,
    minimum_required_balance: snapshot.minimum_balance,
    purchase_amount: amount, horizon_days: period,
    payment_method: 'debit', forecast_source: 'no_variable_spend_assumption',
    inputs_not_saved: true, warnings: [],
    paths: ids.map((id) => {
      const withdrawal = id === 'no_purchase' || id === 'purchase_delay' ? 0 : amount;
      const rows = Array.from({ length: period }, (_, i) => ({
        date: dateOf(i + 1),
        closing_balance: snapshot.balance - withdrawal - (i + 1) * 1000,
        lowest_balance: snapshot.balance - withdrawal - (i + 1) * 1000,
      }));
      return {
        scenario_id: id, status: 'calculated', available_cash: snapshot.balance,
        ending_balance: rows.at(-1).closing_balance,
        minimum_balance: Math.min(snapshot.balance, ...rows.map(x => x.lowest_balance)),
        minimum_balance_met: true, essential_payments_covered: true,
        first_shortfall_date: null, daily_cashflow: rows,
      };
    }),
  };
}

test('personal payload contains only numeric facts and future dates; no identifying fields or S01', () => {
  const snapshot = buildPersonalSnapshot(mockStore(), asOf);
  const serialized = JSON.stringify(snapshot);
  for(const secret of ['secret-person','MY STREET','MY BILL','REAL SECRET','FUTURE SECRET',
                        'CREDIT SECRET','Savings transfer','S01', 'S08']) {
    assert(!serialized.includes(secret), 'found PII or persona: ' + secret);
  }
  assert.equal(snapshot.balance, 825000);
  assert.equal(snapshot.minimum_balance, 120000);
  assert.equal(snapshot.monthly_income, 2100000);
  assert.equal(snapshot.payday, 25);
  // The ZIP's default 500k budget is NOT a user-approved forecast.
  assert.equal(snapshot.monthly_variable_budget, 0);
  assert.equal(snapshot.bills.length, 2);
  assert.equal(snapshot.planned_transactions.length, 4);
  assert.deepEqual(snapshot.planned_transactions.map(t=>t.payment_method),
    ['debit', 'credit', 'transfer', 'cash']);
  assert(!snapshot.planned_transactions.some(t=>t.date <= asOf));
});

test('translate verified backend cash only; no fabricated ML returns or off-by-one dates', () => {
  const s = buildPersonalSnapshot(mockStore(), asOf), amount = 259000;
  const output = mapPersonalComparison(makeResponse(s, amount), s, amount, 7);
  assert.equal(output.origin, 'personal_user_input_python');
  assert.equal(output.points[0].date, asOf);
  assert.equal(output.points.at(-1).date, dateOf(7));
  assert.equal(output.boughtEnd, 825000 - 259000 - 7000);
  assert.equal(output.keptEnd, 825000 - 7000);
  assert.equal(output.delta, 259000);
  assert.equal(output.boughtNow, 825000);
});

test('refuse synthetic response, mismatch balances, missing paths or bad timeline', () => {
  const s = buildPersonalSnapshot(mockStore(), asOf), r = makeResponse(s);
  assert.throws(() => mapPersonalComparison({ ...r, source:'synthetic_dataset' }, s, 259000, 7), /mismatch/);
  assert.throws(() => mapPersonalComparison({ ...r, available_cash: 420000 }, s, 259000, 7), /mismatch/);
  assert.throws(() => mapPersonalComparison({ ...r, horizon_days: 90 }, s, 259000, 7), /mismatch/);
  assert.throws(() => mapPersonalComparison({ ...r, paths: r.paths.slice(0,4) }, s, 259000, 7), /mismatch/);
  const duplicate = makeResponse(s); duplicate.paths[2].scenario_id = 'no_purchase';
  assert.throws(() => mapPersonalComparison(duplicate, s, 259000, 7), /invalid_paths/);
  const wrongDay = makeResponse(s); wrongDay.paths[0].daily_cashflow[0].date = '2026-11-19';
  assert.throws(() => mapPersonalComparison(wrongDay, s, 259000, 7), /daily_values/);
  const wrongClose = makeResponse(s); wrongClose.paths[0].ending_balance = 900000;
  assert.throws(() => mapPersonalComparison(wrongClose, s, 259000, 7), /ending_balance/);
});

test('goal amounts parsed locally and no user-free-text sent to Python', () => {
  assert.deepEqual(parsePersonalGoal('6만 7천 원짜리 참고서를 언제 살까?'), { amount:67000, kind:'purchase' });
  assert.deepEqual(parsePersonalGoal('3개월 안에 60만 원 모으기'), { amount:600000, kind:'savings' });
  assert.deepEqual(parsePersonalGoal('ETF도 10만 원 정도 경험'), { amount:100000, kind:'investment' });
  assert.equal(parsePersonalGoal('사고 싶어요'), null); // must not invent amount
  assert.equal(parsePersonalGoal('천만 원 벌기'), null); // no numeric number, don't guess
});

test('POST uses personal endpoints and returns no fallback data on HTTP error', async () => {
  const original = globalThis.fetch, s = buildPersonalSnapshot(mockStore(), asOf);
  let captured = [];
  try {
    globalThis.fetch = async (url, init) => {
      captured.push({ url, body: JSON.parse(init.body), method: init.method });
      return {
        ok:true, headers: { get: ()=>'application/json' },
        json:async()=>makeResponse(s),
      };
    };
    await comparePersonal(s, 259000, 7, new AbortController().signal);
    assert.equal(captured[0].url, '/api/v4/personal/compare');
    assert.equal(captured[0].body.snapshot.balance, 825000);
    assert.equal(captured[0].body.horizon_days, 7);
    assert(!JSON.stringify(captured[0].body).includes('secret'));
    globalThis.fetch = async () => ({ ok:false, status:503, headers:{ get:()=> 'application/json' } });
    await assert.rejects(comparePersonal(s, 259000, 7, new AbortController().signal), /http_503/);
  } finally { globalThis.fetch = original; }
});

test('goal endpoint requires explicit rules-not-LLM source', async () => {
  const original = globalThis.fetch, s = buildPersonalSnapshot(mockStore(), asOf);
  const goal = { amount: 50000, kind: 'purchase' };
  try {
    globalThis.fetch = async () => ({
      ok:true, headers:{ get:()=> 'application/json' },
      json:async()=>({
        source:'personal_rules_not_llm', as_of:asOf, target_amount:50000,
        goal_type:'purchase', horizon_days:30, evaluated_count:2, valid_count:0,
        routes:[], rejection_counts:{minimum_balance:2},
        confirmations_required:[], warnings:[], inputs_not_saved:true,
      }),
    });
    const out = await analyzePersonalGoal(s, goal, new AbortController().signal);
    assert.equal(out.source, 'personal_rules_not_llm');
    globalThis.fetch = async () => ({
      ok:true, headers:{ get:()=> 'application/json' },
      json:async()=>({
        source:'synthetic_dataset', as_of:asOf, target_amount:50000,
        goal_type:'purchase', horizon_days:30, evaluated_count:2, valid_count:0,
        routes:[], rejection_counts:{minimum_balance:2},
        confirmations_required:[], warnings:[], inputs_not_saved:true,
      }),
    });
    await assert.rejects(analyzePersonalGoal(s, goal, new AbortController().signal), /goal_mismatch/);
  } finally { globalThis.fetch = original; }
});
