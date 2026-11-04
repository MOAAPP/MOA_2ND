/** Browser E2E of Stage 5 React UX against real Python route search.
 * LLM request is intentionally intercepted because CI holds no paid API key.
 * This validates real finance API response -> UI, not live LLM inference.
 */
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const browser = await chromium.launch({headless: true});
const base = process.env.STAGE3_E2E_BASE || 'http://127.0.0.1:5173';
const api = process.env.STAGE3_E2E_API || 'http://127.0.0.1:8000';
const post = async (path, data) => {
  const res = await fetch(api + path, {
    method:'POST', headers:{'Content-Type':'application/json'},
    body:JSON.stringify(data),
  });
  if (res.status !== 200) throw new Error(path + ': ' + await res.text());
  return res.json();
};
const conditions = {
  user_id:'S01', as_of:'2026-11-04', purchase_required:false,
  purchase_amount:7000, investment_allowed:false, maximum_investment_amount:0,
  allowed_payment_methods:['debit'], hard_constraints:['필수 결제 보호'],
  soft_preferences:['가능하면 구매'], confirmations_required:[],
};
const searchPayload = {conditions, horizon_days:30, max_evaluations:8, max_results:4, stress:'baseline'};
const real = await post('/api/v4/agent/search', searchPayload);
const page = await browser.newPage({ viewport:{width:390,height:844}});
try {
  await page.goto(base + '/?demo=1');
  await page.locator('.st3-hero').waitFor({timeout:25000});
  await page.getByRole('button',{name:'평행세계',exact:true}).click();
  await page.locator('.st5-agent').waitFor({timeout:20000});
  await page.locator('.st3-world-card').first().waitFor({timeout:25000});
  // CI does not have a provider key: verify that fallback preserves normal six worlds.
  await page.locator('#st5-goal').fill('운동화를 사고 싶어요. 월세는 반드시 지켜주세요.');
  await page.getByRole('button',{name:'내 목표 분석하기'}).click();
  await page.locator('.st5-error').waitFor({timeout:12000});
  assert.match(await page.locator('.st5-error').innerText(),/AI 서버 키|AI 연결/);
  assert.equal(await page.locator('.st3-world-card').count(),4);
  // Feed *actual Python output*, with a stubbed interpretation layer. Never assert live LLM here.
  await page.route('**/api/v4/agent/analyze', route => route.fulfill({
    status:200,contentType:'application/json',
    body:JSON.stringify({
      conditions, search:real, tool_execution_log:[],
      tokens:{input_tokens:0,output_tokens:0},
      cost_status:'unverified_test_stub', estimated_cost_usd:null,
    }),
  }));
  await page.getByRole('button',{name:'내 목표 분석하기'}).click();
  await page.locator('.st5-summary').waitFor({timeout:20000});
  assert.match(await page.locator('.st5-summary').innerText(),
               new RegExp('검증된 금융 경로 ' + real.routes.length + '개'));
  assert.equal(await page.locator('.st5-route').count(),real.routes.length);
  if (real.routes.length) {
    const expected = Math.round(real.routes[0].ending_balance).toLocaleString('ko-KR') + '원';
    assert.ok((await page.locator('.st5-route').first().innerText()).includes(expected));
  } else {
    await page.locator('.st5-confirm').waitFor();
  }
  // React retains the original fixed six paths, even after an agent result.
  assert.equal(await page.locator('.st3-world-card').count(),4);
  await page.getByRole('button',{name:'투자·혼합 배분까지 6개 모두 보기'}).click();
  assert.equal(await page.locator('.st3-world-card').count(),6);
  await page.screenshot({path:'/tmp/stage5-agent.png',fullPage:true});
  console.log('STAGE5_BROWSER_PASS: agent location, 503 fallback, real Python path/result mapping, six-world preservation; live LLM not tested.');
} finally { await browser.close(); }
