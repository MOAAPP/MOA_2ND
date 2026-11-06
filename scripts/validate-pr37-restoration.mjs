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
  assert.equal(await page.getByRole('button',{name:'30,000원 지금 써도 될까?'}).isDisabled(),false);
  assert.equal(await page.locator('.ux-home-goal textarea').count(),0,
    'no requirement to compose a natural-language AI prompt');
  assert.equal(await page.locator('.ux-home-world').count(),1);
  const positions = await page.evaluate(() => [
    '.ux-home-ai-hero','.ux-home-ledger','.ux-home-decision','.ux-home-world'
  ].map(selector => document.querySelector(selector)?.getBoundingClientRect().top ?? -9999));
  assert.ok(positions.every((x,i) => i === 0 || x > positions[i-1]),
    'daily insight -> instant expense -> optional comparison -> original worlds');
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
    /기록으로 계산한 안내|AI 설명/);
  const rect=await page.locator('.ux-home-ai-hero').boundingBox();
  assert.ok(rect && rect.x >= 0 && rect.x+rect.width <= 392,'mobile AI hero must fit in viewport');
  await page.screenshot({path:'/tmp/pr37-original-home.png',fullPage:true});
  // The user's main job is recording spending, not entering a ChatGPT prompt.
  const quick = page.locator('.ux-home-ledger .quick-expense');
  await quick.waitFor({timeout:10000});
  await quick.getByRole('textbox',{name:'지출 한 줄 입력'}).fill('커피 4,500원');
  await quick.getByRole('button',{name:'기록',exact:true}).click();
  await page.getByText('기록 6건',{exact:false}).waitFor({timeout:10000});
  assert.ok((await page.locator('.ux-home-today-number').innerText()).includes('35,500원'));
  // S01 canonical AI briefing stays anchored; this locally added ledger
  // item must not be represented as a new observation by the public model.
  assert.ok((await page.locator('.ux-home-ai-cash').innerText()).includes(expected));
  await page.getByRole('button',{name:'10,000원',exact:true}).click();
  assert.equal(await page.getByRole('button',{name:'10,000원 지금 써도 될까?'}).isDisabled(),false);
  await page.getByRole('button',{name:'직접 입력'}).click();
  await page.getByRole('textbox',{name:'비교할 금액'}).fill('89000');
  assert.equal(await page.getByRole('button',{name:'89,000원 지금 써도 될까?'}).isDisabled(),false);
  assert.equal(await page.locator('.ux-home-goal textarea').count(),0);
  const quickBox=await quick.boundingBox();
  assert.ok(quickBox && quickBox.x>=0 && quickBox.x+quickBox.width<=392,
    'one-line input should fit in mobile width');
  await page.getByRole('button',{name:'금액만 입력해서 비교하기'}).click();
  await page.locator('.c-page').waitFor({timeout:10000});
  await page.getByRole('button',{name:'뒤로 가기'}).click();
  await page.locator('.ux-home-decision').waitFor({timeout:10000});
  await page.getByRole('button',{name:'가계부',exact:true}).click();
  await page.locator('.lg-page > .quick-expense').waitFor({timeout:10000});
  assert.equal(await page.locator('.lg-ai-disclosure').count(),0,
    'no fake monthly AI analysis accordion');
  await page.getByRole('tab',{name:'분석'}).click();
  await page.getByText('이번 달 한눈에').waitFor({timeout:10000});
  assert.ok((await page.locator('.lg-record-insights').innerText()).includes('AI가 생성한 내용은 아니에요'));
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
  console.log('LEDGER_FIRST_QUICK_WRITE_NO_MOCK_AI_AND_ORIGINAL_WORLD_MOTION_PASS');
} finally {await browser.close();}
