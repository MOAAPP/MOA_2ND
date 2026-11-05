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
// UI shows negatives with the typographic minus (U+2212), e.g. −8,200원
const won = amount => { const r = Math.round(amount); return (r < 0 ? '\u2212' : '') + Math.abs(r).toLocaleString('ko-KR') + '원'; };
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
// Account/date pickers are developer controls outside the user screen:
// on phone width they live in the '체험 설정' sheet.
const openDev = async () => {
  if (await page.locator('select[aria-label="가상 사용자 선택"]').count()) return;
  await page.getByRole('button',{name:'체험 설정',exact:true}).click();
};
const closeDev = async () => {
  const close = page.getByRole('button',{name:'체험 설정 닫기'}).last();
  if (await close.count()) await close.click();
};
try {
  // The regular landing URL preserves v22 visual styling but shares the
  // exact canonical FastAPI balances with ?demo=1 and ignores tracking params.
  const desktop = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  try {
    await desktop.goto(base + '/');
    await desktop.waitForFunction(expected =>
      document.querySelector('.ux-canonical-risk-value > strong')?.textContent?.trim() === expected,
      won(s01.available_cash), { timeout: 25000 });

    const personalFixture = JSON.stringify({
      version: 3, introSeen: true, demo: false,
      profile: { fullName: 'SAVED_PERSONAL_DATA_MUST_REMAIN' },
      records: [{ id: 'persisted-private-choice' }],
    });
    await desktop.evaluate(raw => localStorage.setItem('pb.state.v3', raw), personalFixture);
    await desktop.goto(base + '/?utm_source=chatgpt.com');
    await desktop.waitForFunction(expected =>
      document.querySelector('.ux-canonical-risk-value > strong')?.textContent?.trim() === expected,
      won(s01.available_cash), { timeout: 25000 });
    assert.equal(await desktop.evaluate(() => localStorage.getItem('pb.state.v3')), personalFixture);
    assert.equal(new URL(desktop.url()).search, '', 'UTM query should be removed from the browser address bar');
    assert.equal(await desktop.locator('.ux-canonical-home').count(), 1, 'root should preserve the classic v22 home design');

    const panel = desktop.locator('aside.st3-dev-panel[aria-label="체험 설정"]');
    await panel.waitFor({ timeout: 10000 });
    assert.equal(await panel.isVisible(), true);
    assert.equal(await desktop.locator('select[aria-label="가상 사용자 선택"] option').count(), 20);
    const panelBox = await panel.boundingBox();
    const appBox = await desktop.locator('.app').boundingBox();
    assert.ok(panelBox && appBox, 'desktop panel and app are visible');
    assert.ok(panelBox.x >= appBox.x + appBox.width, 'demo panel must sit to the right of the app');
    assert.ok(panelBox.x + panelBox.width <= 1280, 'demo panel must not be clipped off-screen');
    await desktop.locator('select[aria-label="가상 사용자 선택"]').selectOption('S02');
    await desktop.waitForFunction(expected =>
      document.querySelector('.ux-canonical-risk-value > strong')?.textContent?.trim() === expected,
      won(s02.available_cash), { timeout: 25000 });

    // Nov 5 is not an observed dataset snapshot, but must be selectable as
    // a projected day without leaking synthetic future-oracle transactions.
    const dateInput = desktop.locator('input[aria-label="금융 관측 기준일"]');
    assert.equal(await dateInput.inputValue(), '2026-11-04');
    assert.ok((await dateInput.getAttribute('max')) >= '2026-11-05');
    await desktop.getByRole('button', {name: '하루 뒤'}).click();
    assert.equal(await dateInput.inputValue(), '2026-11-05');
    assert.match(await desktop.locator('.ux-home-demo-clock').innerText(), /예상/);
    const projectedS02 = s02.daily_cashflow.find(d => d.date === '2026-11-05').closing_balance;
    assert.equal(await desktop.locator('.ux-canonical-risk-value > strong').innerText(), won(projectedS02));
    await desktop.screenshot({ path: '/tmp/stage3-classic-root.png', fullPage: true });
    await desktop.getByRole('button', {name: '하루 전'}).click();
    assert.equal(await dateInput.inputValue(), '2026-11-04');
    assert.equal(await desktop.locator('.ux-canonical-risk-value > strong').innerText(), won(s02.available_cash));
  } finally { await desktop.close(); }

  await page.goto(base + '/?demo=1');
  const hero = page.locator('.st3-hero > strong');
  await hero.waitFor({timeout: 25000});
  await page.waitForFunction(expected =>
    document.querySelector('.st3-hero > strong')?.textContent?.trim() === expected,
    won(s01.available_cash));
  await openDev();
  assert.equal((await page.locator('select[aria-label="가상 사용자 선택"] option').count()),20);
  assert.equal(await page.locator('input[aria-label="금융 관측 기준일"]').inputValue(),'2026-11-04');
  await page.getByRole('button', { name:'하루 뒤' }).click();
  assert.equal(await page.locator('input[aria-label="금융 관측 기준일"]').inputValue(),'2026-11-05');
  assert.match(await page.locator('.st3-note[role="note"]').innerText(),/아직 관측된 거래가 없는 미래 예상일/);
  await page.getByRole('button', { name:'하루 전' }).click();
  assert.equal(await page.locator('input[aria-label="금융 관측 기준일"]').inputValue(),'2026-11-04');
  assert.equal(await hero.innerText(), won(s01.available_cash));
  // Assert a real Stage-4 model/baseline forecast is visible in PR37 design.
  const forecast = await fetchJSON('/api/v4/users/S01/forecast?as_of=2026-11-04');
  assert.equal(forecast.model_type,s01.variable_forecast.model_type);
  assert.equal(forecast.forecast_run_id,s01.variable_forecast.forecast_run_id);
  assert.equal(forecast.daily.length,14);
  assert.notEqual(forecast.model_type,'unavailable');
  const next7 = forecast.forecasts.find(f => f.horizon_days === 7).predicted_variable_outflow;
  // Stage-6 data must be visible in actual React DOM, not merely HTTP 200.
  const stage6 = await fetchJSON('/api/v4/users/S01/briefing?as_of=2026-11-04');
  assert.equal(stage6.user_id, 'S01');
  assert.equal(stage6.llm_used, false);
  await page.getByText('오늘의 예상 추가 소비 여유').waitFor({timeout:25000});
  await page.waitForFunction(expected =>
    document.querySelector('.st6-spend-capacity')?.textContent?.includes(expected),
    won(stage6.spending_capacity.estimated_additional_spend));
  assert.match(await page.locator('.st6-morning').innerText(), /오늘의 금융 변화/);
  assert.ok((await page.locator('.st6-morning').innerText()).length > 20);
  assert.equal(stage6.spending_capacity.current_cash, s01.available_cash);
  await page.getByText('앞으로 7일 변동 지출 전망').waitFor();
  assert.ok((await page.locator('.st3-home').innerText()).includes(won(next7)));


  await page.screenshot({ path: '/tmp/stage3-s01-home.png', fullPage: true });
  await page.locator('select[aria-label="가상 사용자 선택"]').selectOption('S02');
  await page.waitForFunction(expected =>
    document.querySelector('.st3-hero > strong')?.textContent?.trim() === expected,
    won(s02.available_cash));
  assert.equal(await hero.innerText(), won(s02.available_cash));
  const stage6S02 = await fetchJSON('/api/v4/users/S02/briefing?as_of=2026-11-04');
  await page.waitForFunction(expected =>
    document.querySelector('.st6-spend-capacity')?.textContent?.includes(expected),
    won(stage6S02.spending_capacity.estimated_additional_spend));
  assert.equal(stage6S02.spending_capacity.current_cash, s02.available_cash);
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

  await closeDev();
  await page.getByRole('button',{name:'평행세계',exact:true}).click();
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

  // Regression: an unavailable OPTIONAL investment price API must never hide
  // canonical FastAPI cash balances, recent transactions or the main graph.
  const noQuotes = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await noQuotes.route('**/api/v4/instruments**', route => route.fulfill({
      status: 503, contentType: 'application/json',
      body: JSON.stringify({ detail: { code: 'quotes_unavailable' } }),
    }));
    await noQuotes.goto(base + '/?demo=1');
    await noQuotes.waitForFunction(expected =>
      document.querySelector('.st3-hero > strong')?.textContent?.trim() === expected,
      won(s01.available_cash), { timeout: 25000 });
    assert.equal(await noQuotes.locator('.st3-error').count(), 0);
    assert.ok((await noQuotes.locator('.st3-home').innerText()).includes(won(s01.available_cash)));
  } finally { await noQuotes.close(); }

  // Reproduce old persisted introSeen=true without any actual finance profile.
  const stale = await browser.newPage({ viewport: { width: 390, height: 844 } });
  try {
    await stale.goto(base + '/');
    await stale.evaluate(() => localStorage.setItem('pb.state.v3', JSON.stringify({
      version: 3, introSeen: true, profile: null, demo: false, setupDraft: null,
      records: [], spendLog: [], moa: { anchor: null },
    })));
    await stale.reload();
    await stale.locator('.ux-canonical-risk-value > strong').waitFor({ timeout: 25000 });
    assert.equal(await stale.locator('.ux-canonical-risk-value > strong').innerText(), won(s01.available_cash));
  } finally { await stale.close(); }

  // An invalid backend response must never silently display the previous user's money.
  await page.route('**/api/v4/users/S03/home**',route=>route.fulfill({
    status:200,contentType:'application/json',body:'{}',
  }));
  await openDev();
  await page.locator('select[aria-label="가상 사용자 선택"]').selectOption('S03');
  await page.locator('.st3-error').first().waitFor({timeout:25000});
  assert.equal(await page.locator('.st3-hero > strong').count(),0);
  assert.match(await page.locator('.st3-error').innerText(),/데이터 형식/);
  console.log('STAGE6_BROWSER_PASS: classic v22 root design, clean URL, S01/S02 canonical data, preserved localStorage, 20-user desktop sidebar, observed Nov 4 and projected Nov 5 date, six worlds, briefing, schema validation.');
} finally {
  await browser.close();
}
