/* Real mobile browser QA for the MOA-brand learning-first home preview.
 * Runs against the ZIP actually used by Vercel, not the old Stitch Home.
 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require(path.resolve(__dirname, '../moa-web/node_modules/playwright'));

const base = 'http://127.0.0.1:5173';
const out = path.resolve(__dirname, '../e2e-brand-preview');
fs.mkdirSync(out, { recursive:true });
const sleep = n=>new Promise(resolve=>setTimeout(resolve,n));
(async()=>{
 const browser = await chromium.launch({headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
 try {
  for(const width of [375,390]){
   const page = await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
   const errors=[];
   page.on('pageerror',err=>errors.push(String(err)));
   await page.goto(base+'/onboarding',{waitUntil:'domcontentloaded',timeout:30000});
   await page.getByRole('button',{name:'시작하기'}).first().click();
   await page.getByRole('button',{name:'다음',exact:true}).click();
   await page.getByRole('button',{name:'다음',exact:true}).click();
   await page.getByRole('button',{name:/처음이에요/}).click();
   await page.getByRole('button',{name:'다음',exact:true}).click();
   await page.getByRole('button',{name:'시작하기',exact:true}).click();
   await page.waitForURL(/\/$/, {timeout:15000});
   await page.getByTestId('moa-learning-home').waitFor({state:'visible'});
   await sleep(500);

   assert.equal(await page.getByRole('heading',{level:1,name:/오늘은 이걸.*배워봐요/}).count(),1,'Large MOA headline missing');
   assert.equal(await page.locator('header button[aria-label="홈으로"] img[alt="MOA"]').count(),1,'Original MOA logo missing');
   assert.equal(await page.locator('nav a').count(),4,'Original bottom tab links changed');
   assert.equal(await page.getByRole('button',{name:'기록하기'}).count(),1,'Original record button missing');
   assert.equal(await page.getByRole('heading',{name:'오늘의 카드뉴스'}).count(),1,'Cardnews not first on home');
   assert.equal(await page.locator('.moa-brand-story').count(),4,'Four real lesson cards expected');
   assert.equal(await page.locator('.moa-brand-story-cover').count(),4,'Brand covers not present');
   assert.equal(await page.getByText('이번 달 남은 생활비').count(),0,'Balance block incorrectly above learning');
   assert.equal(await page.getByText('MOA JOURNAL').count(),0,'Foreign editorial brand copied into MOA');
   const card=page.locator('.moa-brand-story').first();
   const first=await card.boundingBox(), next=await page.locator('.moa-brand-story').nth(1).boundingBox();
   assert(first && next && next.x < width + 20 && next.x > first.x+first.width,
       'Next card should peek into view at edge');
   const hasOverflow=await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth+3);
   assert(!hasOverflow,'Unexpected whole-page horizontal overflow');
   await page.screenshot({path:path.join(out,'moa-brand-home-'+width+'.png'),fullPage:false});

   const track=page.locator('.moa-brand-carousel');
   const before=await track.evaluate(el=>el.scrollLeft);
   await page.getByRole('button',{name:'다음 카드뉴스 보기'}).click();
   await sleep(800);
   const after=await track.evaluate(el=>el.scrollLeft);
   assert(after>before+50,'Next story button did not advance carousel');

   const cardTitle=await card.getAttribute('aria-label');
   await card.click();
   await page.waitForURL(/\/learn\/[^/]+$/, {timeout:12000});
   assert(cardTitle?.includes('카드뉴스 읽기'),'Card lacks accessible name');
   assert.equal(errors.length,0,'Browser JS errors: '+errors.join('; '));
   console.log('PASS MOA home '+width+'px: logo, brand, first-fold learning, carousel, lesson navigation');
   await page.close();
  }
 } finally {await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
