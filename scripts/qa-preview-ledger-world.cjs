/* Browser smoke for the non-production MOA home + ledger semicircle preview. */
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { chromium } = require(path.resolve(__dirname, '../moa-web/node_modules/playwright'));
const root = 'http://127.0.0.1:5173';
const evidence = path.resolve(__dirname, '../preview-evidence');
fs.mkdirSync(evidence, { recursive:true });
(async () => {
  const browser = await chromium.launch({ headless:true, args:['--no-sandbox','--disable-dev-shm-usage'] });
  try {
    for (const width of [375,390]) {
      const page = await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
      const errors=[];
      page.on('pageerror', e => errors.push(String(e)));
      await page.addInitScript(() => {
        localStorage.setItem('moa.v1', JSON.stringify({ onboarded:true }));
      });
      await page.goto(root+'/',{waitUntil:'networkidle'});
      await page.getByTestId('moa-preview-home').waitFor();
      assert.equal(await page.getByRole('heading',{name:'내 돈, 지금 어디쯤 있을까?'}).count(),1);
      assert.equal(await page.getByRole('button',{name:/소비 선택 비교하기/}).count(),1);
      assert.equal(await page.getByRole('button',{name:/오늘의 지출/}).count(),1);
      assert.equal(await page.locator('header img[alt="MOA"]').count(),1);
      assert.equal(await page.getByRole('link',{name:'가계부'}).count(),1);
      assert.equal(await page.getByRole('progressbar',{name:'이번 달 생활비 사용률'}).count(),1);
      await page.screenshot({path:path.join(evidence,'home-'+width+'.png'),fullPage:false});
      await page.getByRole('button',{name:/소비 선택 비교하기/}).click();
      await page.waitForURL(/\/world$/);
      assert((await page.locator('body').innerText()).includes('구매'));
      await page.goto(root+'/ledger',{waitUntil:'networkidle'});
      await page.getByRole('heading',{name:'가계부'}).waitFor();
      const gauge=page.locator('.moa-budget-preview');
      assert.equal(await gauge.count(),1,'Half ring summary is missing');
      assert.equal(await gauge.locator('svg path').count(),2,'Half ring paths missing');
      assert((await gauge.innerText()).includes('월 예산, 얼마나 썼을까?'));
      assert((await gauge.innerText()).includes('남은 예산'));
      assert.equal(await page.locator('header img[alt="MOA"]').count(),1);
      await page.screenshot({path:path.join(evidence,'ledger-'+width+'.png'),fullPage:false});
      await page.locator('#selected-month-display').evaluate(el=>{el.textContent='2026년 10월';});
      await page.getByText('10월 예산, 얼마나 썼을까?').waitFor();
      const altMonth=await gauge.innerText();
      assert(altMonth.includes('0%'),'Prior month with no demo expenses should be 0%, got '+altMonth.slice(0,180));
      assert.equal(errors.length,0,'Runtime exceptions: '+errors.join('\n'));
      console.log('PASS preview width='+width+'px, home, world, half-arc, month switch; no runtime errors');
      await page.close();
    }
    console.log('PREVIEW_HOME_LEDGER_E2E_PASS 2/2');
  } finally {await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
