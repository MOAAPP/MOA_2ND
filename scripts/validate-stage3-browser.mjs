/** Real browser test: FastAPI canonical dataset -> Vite proxy -> React DOM.
 * Run in CI with backend and frontend servers already started.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const base = process.env.STAGE3_E2E_BASE || 'http://127.0.0.1:5173';
const python = process.env.STAGE3_E2E_API || 'http://127.0.0.1:8000';
const fetchJSON = async path => {
  const res = await fetch(python + path);
  if (res.status !== 200) throw new Error(path + ': ' + await res.text());
  return res.json();
};
const won = amount => Math.round(amount).toLocaleString('ko-KR') + '원';
const defaultUser = await fetchJSON('/api/v4/demo/default');
const users = await fetchJSON('/api/v4/users');
assert.equal(users.users.length, 20);
assert.equal(defaultUser.user_id, 'S01');
const s01 = await fetchJSON('/api/v4/users/S01/home?as_of=2026-11-04');
const s02 = await fetchJSON('/api/v4/users/S02/home?as_of=2026-11-04');
const s02Old = await fetchJSON('/api/v4/users/S02/home?as_of=2026-11-03');

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
page.on('pageerror', e => { throw e; });
try {
  await page.goto(base + '/?demo=1');
  const hero = page.locator('.st3-hero > strong');
  await hero.waitFor({timeout: 25000});
  await page.waitForFunction(expected =>
    document.querySelector('.st3-hero > strong')?.textContent?.trim() === expected,
    won(s01.available_cash));
  assert.equal((await page.locator('select[aria-label="가상 사용자 선택"] option').count()),20);
  assert.equal(await page.locator('input[aria-label="금융 관측 기준일"]').inputValue(),'2026-11-04');
  assert.equal(await hero.innerText(), won(s01.available_cash));
  // Proof that the real training artifact or explicit baseline reaches the visible Home.
  const spendForecast = await fetchJSON('/api/v4/users/S01/forecast?as_of=2026-11-04');
  assert.equal(spendForecast.model_type,s01.variable_forecast.model_type);
  assert.equal(spendForecast.forecast_run_id,s01.variable_forecast.forecast_run_id);
  assert.equal(spendForecast.daily.length,14);
  assert.ok(spendForecast.model_type !== 'unavailable');
  await page.getByText('앞으로 7일 변동 지출 전망').waitFor();
  const next7 = spendForecast.forecasts.find(f => f.horizon_days === 7).predicted_variable_outflow;
  assert.ok((await page.locator('.st3').innerText()).includes(won(next7)));


  await page.screenshot({ path: '/tmp/stage3-s01-home.png', fullPage: true });
  await page.locator('select[aria-label="가상 사용자 선택"]').selectOption('S02');
  await page.waitForFunction(expected =>
    document.querySelector('.st3-hero > strong')?.textContent?.trim() === expected,
    won(s02.available_cash));
  assert.equal(await hero.innerText(), won(s02.available_cash));
  assert.notEqual(await hero.innerText(), won(s01.available_cash));
  await page.locator('input[aria-label="금융 관측 기준일"]').fill('2026-11-03');
  await page.waitForFunction(expected =>
    document.querySelector('.st3-hero > strong')?.textContent?.trim() === expected,
    won(s02Old.available_cash));
  assert.equal(await hero.innerText(), won(s02Old.available_cash));

  await page.locator('select[aria-label="가상 사용자 선택"]').selectOption('S01');
  await page.locator('input[aria-label="금융 관측 기준일"]').fill('2026-11-04');
  await page.waitForFunction(expected =>
    document.querySelector('.st3-hero > strong')?.textContent?.trim() === expected,
    won(s01.available_cash));

  await page.getByRole('button',{name:'평행세계'}).click();
  await page.locator('.st3-world-card').first().waitFor({timeout:25000});
  assert.equal(await page.locator('.st3-world-card').count(),4);
  await page.getByRole('button',{name:'투자·혼합 배분까지 6개 모두 보기'}).click();
  assert.equal(await page.locator('.st3-world-card').count(),6);
  const amountInput = page.locator('.st3-section > .st3-money input').first();
  await amountInput.fill('7000');
  // Compare is POST-only. Validate DOM against its own FastAPI response below.
  const response = await fetch(python+'/api/v4/scenarios/compare',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({
      user_id:'S01',as_of:'2026-11-04',horizon_days:30,
      purchase_amount:7000,purchase_date:'2026-11-05',purchase_delay_days:7,
      payment_method:'debit',savings_amount:7000,savings_monthly_amount:0,
      savings_goal_current:0,investment_amount:7000,investment_return_percent:0,
      minimum_required_balance:0,stress:'baseline',
      allocation:{purchase:2800,savings:2100,investment:1400,cash:700},
    }),
  });
  assert.equal(response.status,200);
  const result=await response.json();
  const buy=result.paths.find(p=>p.scenario_id==='purchase_now');
  await page.waitForFunction(expected =>
    document.querySelector('.st3-world-card strong.num')?.textContent?.trim() === expected,
    won(buy.future_balances['14']));
  assert.equal(await page.locator('.st3-world-card strong.num').first().innerText(),won(buy.future_balances['14']));
  await page.screenshot({path:'/tmp/stage3-six-worlds.png',fullPage:true});

  // Previous versions persisted introSeen=true without a usable profile.
  // On a fresh normal navigation, the canonical API demo must still appear.
  const stale = await browser.newPage({ viewport: {width: 390,height: 844} });
  try {
    await stale.goto(base + '/');
    await stale.evaluate(() => localStorage.setItem('pb.state.v3', JSON.stringify({
      version:3,introSeen:true,profile:null,demo:false,setupDraft:null,
      records:[],spendLog:[],moa:{anchor:null},
    })));
    await stale.reload();
    await stale.locator('.st3-hero > strong').waitFor({timeout:25000});
    assert.equal(await stale.locator('.st3-hero > strong').innerText(),won(s01.available_cash));
  } finally {
    await stale.close();
  }

  // An invalid backend response must never silently display the previous user's money.
  await page.route('**/api/v4/users/S03/home**',route=>route.fulfill({
    status:200,contentType:'application/json',body:'{}',
  }));
  await page.locator('select[aria-label="가상 사용자 선택"]').selectOption('S03');
  await page.locator('.st3-error').first().waitFor({timeout:25000});
  assert.equal(await page.locator('.st3-hero > strong').count(),0);
  assert.match(await page.locator('.st3-error').innerText(),/응답 스키마/);
  console.log('STAGE3_BROWSER_PASS: 20 users, S01 home amount, S02 isolation, date movement, 6 worlds, API matching, schema-error state.');
} finally {
  await browser.close();
}
