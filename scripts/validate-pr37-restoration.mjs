import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.STAGE3_E2E_BASE || 'http://127.0.0.1:5173';
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/');
  await page.locator('.t-home.ux-home').waitFor({timeout:30000});
  // The restored V8 components and world swipe remain in use, but the
  // correct V4 home hierarchy now starts with real AI insights, not a
  // hidden accordion or a developer-facing Python audit.
  assert.equal(await page.locator('.ux-canonical-home').count(),0);
  assert.equal(await page.locator('.ux-home-ai-hero').count(),1);
  assert.equal(await page.locator('.ux-home-risk').count(),0,
    'synthetic S01 must not mix local account risk with FastAPI balances');
  assert.equal(await page.locator('.ux-python-audit').count(),0,
    'Python implementation details must be hidden from the customer');
  assert.equal(await page.locator('.ux-home-extras').count(),0,
    'AI can no longer be buried inside a collapsed virtual-assets section');
  assert.equal(await page.locator('.ux-home-ledger').count(),1);
  assert.equal(await page.locator('.ux-home-decision').count(),1);
  assert.equal(await page.locator('.ux-home-goal').count(),1);
  assert.equal(await page.getByRole('button',{name:'AI로 가능한 경로 찾아보기'}).isDisabled(),true);
  assert.equal(await page.locator('.ux-home-world').count(),1);
  const positions = await page.evaluate(() => [
    '.ux-home-ai-hero','.ux-home-decision','.ux-home-world','.ux-home-ledger'
  ].map(selector => document.querySelector(selector)?.getBoundingClientRect().top ?? -9999));
  assert.ok(positions.every((x,i) => i === 0 || x > positions[i-1]),
    'AI -> purchase decision -> parallel worlds -> ledger order');
  const homeText = await page.locator('.ux-home').innerText();
  for (const forbidden of ['Python 계산','FastAPI','API 키','SANDBOX','LightGBM']) {
    assert.ok(!homeText.includes(forbidden),'internal implementation label leaked: '+forbidden);
  }
  const response=await fetch((process.env.STAGE3_E2E_API||'http://127.0.0.1:8000')+'/api/v4/users/S01/briefing?as_of=2026-11-04');
  assert.equal(response.status,200);
  const facts=await response.json();
  const expected=facts.spending_capacity.estimated_additional_spend.toLocaleString('ko-KR')+'원';
  await page.waitForFunction(amount =>
    document.querySelector('.ux-home-ai-cash')?.textContent?.includes(amount),
    expected,{timeout:20000});
  assert.equal(await page.locator('.ux-home-ai-cash strong').innerText(),expected);
  assert.ok((await page.locator('.ux-home-ai-snapshot').innerText()).includes(
    facts.spending_capacity.current_cash.toLocaleString('ko-KR')+'원'),
    'cash and cashflow must come from one FastAPI source');
  assert.match(await page.locator('.ux-home-ai-interpretation').innerText(),
    /AI 생성 답변이 아닌 금융 계산 결과 안내예요|AI 생성 설명/);
  const rect=await page.locator('.ux-home-ai-hero').boundingBox();
  assert.ok(rect && rect.x >= 0 && rect.x+rect.width <= 392,'mobile AI hero must fit in viewport');
  await page.screenshot({path:'/tmp/pr37-original-home.png',fullPage:true});
  // AI consultation must be accessible from the FIRST screen, even without
  // configured credentials in CI. It must never forge a live LLM response.
  await page.getByRole('button',{name:'AI에게 내 소비 계획 물어보기'}).click();
  await page.locator('.ask-page').waitFor({timeout:10000});
  await page.getByRole('textbox',{name:'질문'}).fill('다음 결제일에 지출해도 괜찮을까?');
  await page.getByRole('button',{name:'보내기'}).click();
  await page.getByText('지금은 모아 AI 상담을 준비 중이에요.',{exact:false}).waitFor({timeout:15000});
  await page.getByRole('button',{name:'뒤로 가기'}).click();
  await page.locator('#ux-goal-prompt').waitFor({timeout:10000});
  await page.getByRole('button',{name:'금액만 입력해서 비교하기'}).click();
  await page.locator('.c-page').waitFor({timeout:10000});
  await page.getByRole('button',{name:'뒤로 가기'}).click();
  await page.locator('.ux-home-decision').waitFor({timeout:10000});
  await page.getByRole('button',{name:'평행세계',exact:true}).click();
  const chart=page.locator('.t-world .ps-svg');await chart.waitFor({timeout:30000});
  assert.ok(await chart.locator('path').count()>=4);
  await chart.scrollIntoViewIfNeeded();
  const r=await chart.boundingBox();assert.ok(r);
  await page.mouse.move(r.x+r.width*.85,r.y+r.height*.4);
  await page.mouse.down();
  await page.mouse.move(r.x+r.width*.12,r.y+r.height*.4,{steps:12});
  await page.mouse.up();await page.waitForTimeout(500);
  const before=await page.locator('.ps-date').innerText();
  await page.mouse.move(r.x+r.width*.12,r.y+r.height*.4);
  await page.mouse.down();
  await page.mouse.move(r.x+r.width*.88,r.y+r.height*.4,{steps:12});
  await page.mouse.up();await page.waitForTimeout(500);
  assert.notEqual(before,await page.locator('.ps-date').innerText());
  await page.screenshot({path:'/tmp/pr37-original-world.png',fullPage:true});
  assert.deepEqual(errors,[]);
  console.log('AI_FIRST_HOME_AND_ORIGINAL_WORLD_MOTION_PASS');
} finally {await browser.close();}
