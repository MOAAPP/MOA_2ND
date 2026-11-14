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

   // All four primary tabs must share exactly the same global MOA header.
   let canonicalHeaderClass=null, canonicalHeaderHeight=null;
   for(const tab of ["/","/ledger","/world","/lab"]){
     await goto(tab);
     const header=page.locator('header:has(button[aria-label="홈으로"])');
     assert.equal(await header.count(),1,"Missing shared MOA header on "+tab);
     assert.equal(await header.locator('img[alt="MOA"]').count(),1,"Logo differs on "+tab);
     assert.equal(await header.getByRole("button",{name:"알림"}).count(),1,"Notification action missing "+tab);
     assert.equal(await header.getByRole("button",{name:"내 프로필"}).count(),1,"Profile action missing "+tab);
     const cls=await header.getAttribute("class");
     const height=await header.evaluate(el=>el.getBoundingClientRect().height);
     if(canonicalHeaderClass===null){canonicalHeaderClass=cls;canonicalHeaderHeight=height;}
     else {
       assert.equal(cls,canonicalHeaderClass,"Header component differs on "+tab);
       assert(Math.abs(height-canonicalHeaderHeight)<1.1,"Header height mismatch on "+tab);
     }
     if(tab==="/lab"){
       assert.equal(await page.getByText("금융 실험실",{exact:true}).count(),1,"Lab title missing from main content");
       await page.screenshot({path:path.join(DIR,"lab-shared-header-"+width+".png"),fullPage:false});
     }
     count++;
   }

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
   // The last financial-lab action must scroll fully above the fixed tab bar.
   // Check a compact iPhone viewport and a standard iPhone viewport.
   await page.setViewportSize({width,height:width===375?667:844});
   await goto("/lab");
   await page.locator(".moa-scroller").evaluate(el => {el.scrollTop=el.scrollHeight;});
   await sleep(250);
   const overlap=await page.evaluate(()=>{
     const action=[...document.querySelectorAll("button")].find(x=>x.textContent?.includes("평행세계에서 비교하기"));
     const nav=document.querySelector("nav");
     if(!action||!nav)return null;
     const bottom=action.getBoundingClientRect().bottom;
     const navTop=nav.getBoundingClientRect().top;
     const scroll=document.querySelector(".moa-scroller");
     return {gap:navTop-bottom,bottom,navTop,scrollTop:scroll?.scrollTop||0};
   });
   assert(overlap, "Lab final comparison button or tab bar missing");
   assert(overlap.scrollTop>0,"Lab cannot scroll to the last section");
   assert(overlap.gap>=12,"Lab last action hidden beneath tab bar: "+JSON.stringify(overlap));
   await page.screenshot({path:path.join(DIR,"lab-scroll-bottom-"+width+".png"),fullPage:false});
   count++;
   if(runtimeErrors.length)throw new Error("JS page errors at "+width+"px:\n"+runtimeErrors.join("\n"));
   console.log("PASS viewport "+width+"px, onboard+world+agent+11 screens, API calls="+apiCalls.length);
   if(apiCalls.length===0)console.log("WARN frontend has no FastAPI /api/v4 calls (integration incomplete).");
   await page.close();
  }
  console.log("BROWSER E2E PASS checks="+count);
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});
