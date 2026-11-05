import assert from 'node:assert/strict';
import { chromium } from 'playwright';
const base=process.env.STAGE3_E2E_BASE||'http://127.0.0.1:5173';
const api=process.env.STAGE3_E2E_API||'http://127.0.0.1:8000';
const get=async p=>(await fetch(api+p)).json();
const users=await get('/api/v4/users');assert.equal(users.users.length,20);
const s01=await get('/api/v4/users/S01/home?as_of=2026-11-04');
const fmt=n=>Math.round(n).toLocaleString('ko-KR')+'원';
const browser=await chromium.launch({headless:true});
try{
 const p=await browser.newPage({viewport:{width:1280,height:900}});
 await p.goto(base+'/?demo=1');
 await p.waitForFunction(value=>document.querySelector('.st3-hero > strong')?.textContent?.trim()===value,fmt(s01.available_cash),{timeout:30000});
 const pick=p.locator('select[aria-label="가상 사용자 선택"]');
 assert.equal(await pick.locator('option').count(),20);
 await pick.selectOption('S02');
 const s02=await get('/api/v4/users/S02/home?as_of=2026-11-04');
 await p.waitForFunction(value=>document.querySelector('.st3-hero > strong')?.textContent?.trim()===value,fmt(s02.available_cash),{timeout:30000});
 await p.screenshot({path:'/tmp/modern-20-user-lab.png',fullPage:true});
 console.log('PRESERVED_20_PERSONA_LAB_PASS');
}finally{await browser.close()}
