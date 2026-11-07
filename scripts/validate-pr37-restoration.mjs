import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.STAGE3_E2E_BASE || 'http://127.0.0.1:5173';
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/');
  await page.locator('.t-home.ux-home.v23-home').waitFor({timeout:30000});
  // V23 home: payment-account facts -> one-line spending -> optional compare -> worlds.
  assert.equal(await page.locator('.ux-canonical-home').count(),0);
  assert.equal(await page.locator('.ux-home-risk').count(),0,
    'synthetic S01 must not mix local account risk with FastAPI balances');
  assert.equal(await page.locator('.ux-python-audit').count(),0,
    'Python implementation details must be hidden from the customer');
  for (const sel of ['.v23-money','.v23-spend','.v23-compare','.v23-world']) {
    assert.equal(await page.locator(sel).count(),1,sel+' should render once');
  }
  assert.equal(await page.locator('.v23-compare textarea').count(),0,
    'no requirement to compose a natural-language AI prompt');
  const api=(process.env.STAGE3_E2E_API||'http://127.0.0.1:8000');
  const homeRes=await fetch(api+'/api/v4/users/S01/home?as_of=2026-11-04');
  assert.equal(homeRes.status,200);
  const home=await homeRes.json();
  const won=n=>(n<0?'−':'')+Math.abs(Math.round(n)).toLocaleString('ko-KR')+'원';
  // Balance comes straight from FastAPI, never guessed.
  await page.waitForFunction(v => document.querySelector('.v23-money-num')?.textContent?.trim()===v,
    won(home.available_cash),{timeout:20000});
  const dip=home.daily_cashflow.find(d=>Math.min(d.lowest_balance,d.closing_balance)<0);
  if (dip) {
    const [,m,d]=dip.date.split('-').map(Number);
    assert.ok((await page.locator('.v23-alert').innerText()).includes(`${m}월 ${d}일부터`),
      'first projected dip date must match the API daily cashflow');
    assert.ok((await page.locator('.v23-alert').innerText()).includes(won(home.minimum_balance)));
  }
  const positions = await page.evaluate(() => [
    '.v23-money','.v23-spend','.v23-compare','.v23-world'
  ].map(selector => document.querySelector(selector)?.getBoundingClientRect().top ?? -9999));
  assert.ok(positions.every((x,i) => i === 0 || x > positions[i-1]),
    'money facts -> instant expense -> optional comparison -> worlds');
  const homeText = await page.locator('.ux-home').innerText();
  for (const forbidden of ['Python 계산','FastAPI','API 키','SANDBOX','LightGBM']) {
    assert.ok(!homeText.includes(forbidden),'internal implementation label leaked: '+forbidden);
  }
  const rect=await page.locator('.v23-money').boundingBox();
  assert.ok(rect && rect.x >= 0 && rect.x+rect.width <= 392,'mobile money block must fit in viewport');
  // Chart is operable with the keyboard.
  await page.locator('.v23-chart-frame').focus();
  const vt0=await page.locator('.v23-chart-frame').getAttribute('aria-valuetext');
  await page.keyboard.press('ArrowRight');
  assert.notEqual(vt0,await page.locator('.v23-chart-frame').getAttribute('aria-valuetext'));
  await page.screenshot({path:'/tmp/pr37-original-home.png',fullPage:true});
  // The user's main job is recording spending, not entering a ChatGPT prompt.
  const quick = page.locator('.v23-spend .quick-expense');
  await page.getByRole('button',{name:'바로 지출 기록'}).click();
  assert.equal(await page.locator('#quick-expense-home').evaluate(el => document.activeElement === el),true);
  await quick.getByRole('textbox',{name:'지출 한 줄 입력'}).fill('커피 4,500원');
  await quick.getByRole('button',{name:'기록',exact:true}).click();
  await page.waitForFunction(() => document.querySelector('.v23-spend-totals b')?.textContent?.includes('35,500원'),null,{timeout:10000});
  assert.ok((await page.locator('.v23-spend-totals').innerText()).includes('6건'));
  // A locally added ledger item never changes the observed FastAPI balance.
  assert.equal((await page.locator('.v23-money-num').innerText()).trim(),won(home.available_cash));
  const quickBox=await quick.boundingBox();
  assert.ok(quickBox && quickBox.x>=0 && quickBox.x+quickBox.width<=392,
    'one-line input should fit in mobile width');
  // Deterministic compare works with AI switched off and does not touch the ledger.
  await page.getByRole('button',{name:'1만원',exact:true}).click();
  await page.getByRole('button',{name:'10,000원 사면 · 안 사면 비교'}).click();
  await page.locator('.v23-compare-result').waitFor({timeout:20000});
  await page.locator('.v23-more summary').click();
  assert.equal(await page.locator('.v23-more li').count(),4,'delay/savings/investment/mixed paths');
  assert.ok((await page.locator('.v23-spend-totals').innerText()).includes('35,500원'));
  await page.getByRole('button',{name:'직접 입력'}).click();
  await page.getByRole('textbox',{name:'비교할 금액'}).fill('89000');
  assert.equal(await page.getByRole('button',{name:'89,000원 사면 · 안 사면 비교'}).isDisabled(),false);
  // Assets tab merges savings + mock investing; quiz is not in the main nav.
  await page.getByRole('button',{name:'자산',exact:true}).click();
  await page.getByRole('tab',{name:'모의투자'}).click();
  await page.locator('.t-invest').waitFor({timeout:10000});
  assert.equal(await page.getByRole('tab',{name:'금융 학습'}).count(),0);
  await page.getByRole('button',{name:'홈',exact:true}).click();
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
