/**
 * Real HTTP end-to-end contract tests.
 * Called against the actual FastAPI server checked out from the backend feature
 * branch on localhost. This is NOT a mocked JSON/unit test and NOT production.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import { mapDemoSnapshot, DEMO_AS_OF } from '../integration/demoFinanceMap.ts';
import { getWorldProjection } from '../integration/worldComparison.ts';
import { buildSixWorldPayload, mapSixWorldSafety } from '../integration/worldSixSafety.ts';
import { getSavingsPlan } from '../integration/savingsPlan.ts';
import { getPortfolioValidation } from '../integration/portfolioSimulation.ts';
import { buildPersonalSnapshot, comparePersonal, analyzePersonalGoal,
  validatePersonalSixWorlds } from '../integration/personalFinance.ts';

const origin = process.env.MOA_TEST_API_ORIGIN || 'http://127.0.0.1:8137';
const originalFetch = globalThis.fetch.bind(globalThis);
globalThis.fetch = (url, options) =>
  originalFetch(new URL(String(url), origin), options);

async function request(path, body) {
  const response = await fetch(path, body === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  const result = await response.json();
  assert.equal(response.status, 200,
    `${path} returned ${response.status}: ${JSON.stringify(result).slice(0, 1300)}`);
  return result;
}
async function loadedUser(user) {
  const date = '?as_of=' + DEMO_AS_OF;
  const [home, ledger, schedules] = await Promise.all([
    request('/api/v4/users/' + user + '/home' + date),
    request('/api/v4/users/' + user + '/transactions' + date + '&limit=1000'),
    request('/api/v4/users/' + user + '/schedules' + date),
  ]);
  return { home, ledger, schedules, mapped: mapDemoSnapshot(user,home,ledger,schedules) };
}
const signal = () => new AbortController().signal;
const fixture = {};
test('FastAPI reports healthy dataset and S01/S08 demo home+ledger+schedule map end-to-end', async () => {
  const health = await request('/api/v4/health');
  assert(health);
  for (const user of ['S01','S08']) {
    const loaded = await loadedUser(user);
    fixture[user] = loaded;
    assert.equal(loaded.home.available_cash, loaded.mapped.balance);
    assert.equal(loaded.home.user_id, user);
    assert(loaded.mapped.balance >= 0);
    assert(loaded.mapped.txs.every(x=>x.sample && x.balanceApplied===false));
  }
  assert.notEqual(fixture.S01.home.user_id, fixture.S08.home.user_id);
});

test('purchase / no-purchase 7d & 30d plots map actual six-path FastAPI response', async () => {
  const { mapped } = fixture.S01 || await loadedUser('S01');
  for(const period of [7,30]){
    const result = await getWorldProjection('S01', 6000, period, mapped.balance, signal());
    assert.equal(result.origin,'fastapi_synthetic_finance');
    assert.equal(result.checked_paths.length,6);
    assert.equal(result.validated_days,period===7?14:30);
    assert.equal(result.boughtNow,mapped.balance);
    assert.equal(result.points.at(-1).day,period);
  }
});

test('90-day six world diagnostic maps exact FastAPI path statuses without 10-year ROI', async () => {
  const { mapped } = fixture.S01 || await loadedUser('S01');
  const input = {
    user:'S01',currentBalance:mapped.balance,amount:6000,
    minimumBalance:0,delayMonths:1,mix:[1,1,1],saveRate:3.2,
  };
  const raw = await request('/api/v4/scenarios/compare',buildSixWorldPayload(input));
  const result = mapSixWorldSafety(raw,input);
  assert.equal(result.paths.length,6);
  assert.equal(result.horizonDays,90);
  assert.equal(result.user,'S01');
  assert.equal(result.paths[0].id,'purchase_now');
});

test('actual S01 backend 3-month savings plan maps projected interest and 90d cash check',async()=>{
  const { mapped } = fixture.S01 || await loadedUser('S01');
  const result = await getSavingsPlan({
    user:'S01',currentBalance:mapped.balance,minimumBalance:0,
    kind:'saving',amount:3000,months:3,ratePercent:3.2,goalAmount:20000,
  }, signal());
  assert.equal(result.origin,'fastapi_synthetic_savings');
  assert.equal(result.projectedPrincipal,9000);
  assert(result.validationDays<=90);
  assert(['fails_assumptions','satisfies_assumptions'].includes(result.validationStatus));
});

test('actual FastAPI ETF trade returns 90-day debit risk, accounting separate from mock wallet',async()=>{
  const { mapped } = fixture.S01 || await loadedUser('S01');
  const result = await getPortfolioValidation({
    user:'S01',balance:mapped.balance,minBalance:0,
    orders:[{id:'buy1',name:'TIGER 미국S&P500',side:'buy',shares:1,
      price:1000,status:'filled',at:'2026-11-05T09:00:00+09:00'}],
  },signal());
  assert.equal(result.origin,'fastapi_hypothetical_portfolio');
  assert.equal(result.user,'S01');
  assert.equal(result.count,1);
  assert.equal(result.marketValue,1000);
  assert.equal(result.totalProfitLoss,0);
});

test('real personal compare uses supplied amounts and rejects demo persona leak',async()=>{
  const now=new Intl.DateTimeFormat('en-CA',{
    timeZone:'Asia/Seoul',year:'numeric',month:'2-digit',day:'2-digit'
  }).format(new Date());
  const store={
    finance:{balance:825000,minBalance:120000,salary:2100000},
    profile:{payday:25,monthlyBudget:500000},
    bills:[{day:20,amount:350000,kind:'rent',name:'private address'}],
    txs:[],
  };
  const snapshot=buildPersonalSnapshot(store,now);
  const result=await comparePersonal(snapshot,150000,7,signal());
  assert.equal(result.origin,'personal_user_input_python');
  assert.equal(result.boughtNow,825000);
  assert.equal(result.delta,150000);
  assert.equal(result.points.at(-1).day,7);
  const personalSix=await validatePersonalSixWorlds(snapshot,150000,6,signal());
  assert.equal(personalSix.paths.length,6);
  assert.equal(personalSix.paths[2].result,'out_of_horizon');
  const goal=await analyzePersonalGoal(snapshot,{amount:100000,kind:'purchase'},signal());
  assert.equal(goal.source,'personal_rules_not_llm');
  assert.equal(goal.inputs_not_saved,true);
});

test('actual API rejects invalid user and forged data, not silent mock result',async()=>{
  const bad=await fetch('/api/v4/users/S99/home?as_of='+DEMO_AS_OF);
  assert(bad.status>=400);
  const err=await fetch('/api/v4/personal/compare',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({snapshot:{as_of:'2026-11-16',
      balance:-500,minimum_balance:0,monthly_income:0,payday:25,
      name:'DO NOT ACCEPT USER NAME'},purchase_amount:5000,horizon_days:7}),
  });
  assert.equal(err.status,422);
});
