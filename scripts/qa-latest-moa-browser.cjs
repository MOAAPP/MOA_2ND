/* Browser smoke for the actual moa-web React ZIP, not the older src/ app. */
const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");
const {chromium}=require(path.resolve(__dirname,"../moa-web/node_modules/playwright"));
const ORIGIN="http://127.0.0.1:5173";
const DIR=path.resolve(__dirname,"../e2e-evidence");
fs.mkdirSync(DIR,{recursive:true});
const sleep=n=>new Promise(resolve=>setTimeout(resolve,n));
(async()=>{
 const browser=await chromium.launch({headless:true,args:["--no-sandbox","--disable-dev-shm-usage"]});
 let count=0;
 try {
  for(const width of [375,390]){
   const page=await browser.newPage({viewport:{width,height:844},deviceScaleFactor:1,isMobile:true,hasTouch:true});
   const runtimeErrors=[],apiCalls=[];
   page.on("pageerror",e=>runtimeErrors.push(String(e)));
   page.on("request",r=>{if(r.url().includes("/api/v4/"))apiCalls.push(r.url())});
   const goto=async p=>{
    await page.goto(ORIGIN+p,{waitUntil:"domcontentloaded",timeout:30000});
    await page.locator("body").waitFor();
    await sleep(800);
    assert((await page.locator("body").innerText()).trim().length>30,"blank route: "+p);
   };
   await goto("/onboarding");
   await page.getByRole("button",{name:"시작하기"}).first().click();
   await page.getByRole("button",{name:"다음",exact:true}).click();
   await page.getByRole("button",{name:"다음",exact:true}).click();
   await page.getByRole("button",{name:/처음이에요/}).click();
   await page.getByRole("button",{name:"다음",exact:true}).click();
   await page.getByRole("button",{name:"시작하기",exact:true}).click();
   await page.waitForURL(/\/$/,{timeout:15000});
   await sleep(900);
   assert(!(await page.url()).endsWith("onboarding"),"onboarding did not finish");
   count++;
   await page.screenshot({path:path.join(DIR,"home-"+width+".png"),fullPage:false});

   await goto("/world");
   assert((await page.getByRole("heading",{name:/그때 샀다면/}).count())>0,"world comparison missing");
   const pg=page.getByRole("group",{name:"비교 기간"});
   await pg.getByRole("button",{name:"7일"}).click();
   await sleep(150);
   assert((await page.getByText("7일 뒤 · 구매").count())>0,"7-day change missing");
   await pg.getByRole("button",{name:"3개월"}).click();
   assert((await page.getByText("3개월 뒤 · 구매").count())>0,"90-day change missing");
   count++;
   await page.screenshot({path:path.join(DIR,"world-"+width+".png"),fullPage:false});

   await goto("/agent");
   await page.getByRole("button",{name:"조건에 맞는 경로 비교하기"}).click();
   await sleep(350);
   assert((await page.getByText(/조건을 통과한 경로/).count())>0,"rule agent output missing");
   count++;
   await page.screenshot({path:path.join(DIR,"agent-"+width+".png"),fullPage:false});

   for(const uri of ["/lab","/learn","/learn/etf","/learn/etf/quiz","/invest",
                       "/savings","/ledger","/record","/bills","/growth","/more"]){
     await goto(uri);count++;
   }
   if(runtimeErrors.length)throw new Error("JS page errors at "+width+"px:\n"+runtimeErrors.join("\n"));
   console.log("PASS viewport "+width+"px, onboard+world+agent+11 screens, API calls="+apiCalls.length);
   if(apiCalls.length===0)console.log("WARN frontend has no FastAPI /api/v4 calls (integration incomplete).");
   await page.close();
  }
  console.log("BROWSER E2E PASS checks="+count);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
