import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base = process.env.STAGE3_E2E_BASE || 'http://127.0.0.1:5173';
const browser = await chromium.launch({headless:true});
try {
  const page = await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base+'/');
  await page.locator('.t-home.ux-home').waitFor({timeout:30000});
  assert.equal(await page.locator('.ux-canonical-home').count(),0);
  assert.equal(await page.locator('.ux-home-risk').count(),1);
  assert.equal(await page.locator('.ux-home-ledger').count(),1);
  assert.equal(await page.locator('.ux-home-decision').count(),1);
  await page.locator('.ux-home-expand').filter({hasText:'AI 소비 분석'}).click();
  await page.locator('.ux-home-brief').waitFor({timeout:10000});
  const response=await fetch((process.env.STAGE3_E2E_API||'http://127.0.0.1:8000')+'/api/v4/users/S01/briefing?as_of=2026-11-04');
  assert.equal(response.status,200);
  const facts=await response.json();
  const expected=facts.spending_capacity.estimated_additional_spend.toLocaleString('ko-KR')+'원';
  await page.waitForFunction(amount =>
    document.querySelector('.ux-home-brief .ai-body')?.textContent?.includes(amount),
    expected,{timeout:20000});
  assert.match(await page.locator('.ux-home-brief').innerText(),/확인된 기록을 바탕으로 계산했어요|AI가 금융 기록에 근거해 설명했어요/);
  await page.screenshot({path:'/tmp/pr37-original-home.png',fullPage:true});
  // Actual AI consultation is available in the original in-app chat; in a
  // no-key CI run it must tell the truth instead of showing a fake LLM reply.
  await page.getByRole('button',{name:'분석에 대해 물어보기'}).click();
  await page.locator('.ask-page').waitFor({timeout:10000});
  await page.getByRole('textbox',{name:'질문'}).fill('다음 결제일에 지출해도 괜찮을까?');
  await page.getByRole('button',{name:'보내기'}).click();
  await page.getByText('지금은 모아 AI 상담을 준비 중이에요.',{exact:false}).waitFor({timeout:15000});
  await page.getByRole('button',{name:'뒤로 가기'}).click();
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
  console.log('ORIGINAL_PR37_UI_PASS');
} finally {await browser.close();}
