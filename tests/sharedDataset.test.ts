import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import sample from '../src/data/moa-demo-s01.json';
import { demoData } from '../src/lib/demo';
import { demoMoa } from '../src/lib/moa/bridge';
import { demoWorldWalletFromShared } from '../src/lib/demoWorld';
import { walletSummary, WORLD_START_CASH } from '../src/lib/worldWallet';

const all=JSON.parse(readFileSync('public/data/moa-92days.json','utf8'));
const now=Date.parse('2026-11-04T10:00:00+09:00');

describe('single MOA dataset · Sep 11 through Dec 11 (synthetic)',()=>{
 it('contains exactly 92 dates for each of ten synthetic users with no duplicate IDs',()=>{
  expect(all.metadata.start_date).toBe('2026-09-11');
  expect(all.metadata.end_date).toBe('2026-12-11');
  expect(all.profiles).toHaveLength(10);
  expect(all.daily).toHaveLength(920);
  expect(new Set(all.daily.map((x:{user_id:string,date:string})=>x.user_id+':'+x.date)).size).toBe(920);
  expect(all.transactions.length).toBe(1778);
  expect(new Set(all.transactions.map((x:{id:string})=>x.id)).size).toBe(1778);
 });
 it('never exposes a future scenario as an observed label',()=>{
  const future=all.daily.filter((x:{date:string})=>x.date>'2026-11-04');
  expect(future).toHaveLength(370);
  expect(future.every((x:{split:string,future_scenario:boolean,model_label:unknown})=>
    x.split==='future_scenario'&&x.future_scenario&&x.model_label===null)).toBe(true);
  expect(all.transactions.filter((x:{future_scenario:boolean})=>x.future_scenario)
   .every((x:{logged:boolean})=>!x.logged)).toBe(true);
 });
 it('marks incomplete observed days unknown instead of assigning 0 KRW labels',()=>{
  for(const d of all.daily){
    if(!d.observation_complete)expect(d.model_label).toBeNull();
    else expect(d.model_label).toBe(d.true_variable_spend);
  }
 });
 it('continues each wallet from Oct 26 without a balance reset',()=>{
  for(const u of all.profiles){
    const prev=all.daily.find((d:{user_id:string,date:string})=>d.user_id===u.user_id&&d.date==='2026-10-26');
    const next=all.daily.find((d:{user_id:string,date:string})=>d.user_id===u.user_id&&d.date==='2026-10-27');
    expect(prev).toBeTruthy();expect(next).toBeTruthy();
    expect(next.account_balance_eod).toBe(
      prev.account_balance_eod+next.income_in-next.account_out+next.emergency_transfer_in);
  }
 });
 it('frontend example imports only S01 observed synthetic history',()=>{
  expect(sample.profiles).toHaveLength(1);
  expect(sample.daily.every(x=>x.date<='2026-11-04')).toBe(true);
  expect(sample.transactions.every(x=>!x.future_scenario)).toBe(true);
  const ledger=demoData(now),account=demoMoa(now);
  const spend=account.txns.filter(x=>x.kind==='spend'&&!x.essential);
  expect(ledger.spendLog).toHaveLength(spend.length);
  expect(new Set(ledger.spendLog.map(x=>x.txnId))).toEqual(new Set(spend.map(x=>x.id)));
  expect(ledger.profile.baseBalance).toBe(account.anchor?.balance);
 });
 it('investment shares remain assets but are not spendable until a sale',()=>{
  const wallet=demoWorldWalletFromShared(now);
  expect(wallet.etfs['360750'].qty).toBeGreaterThanOrEqual(0);
  const income=wallet.movements.filter(m=>m.kind==='income'||m.kind==='sellStock').reduce((a,m)=>a+m.amount,0);
  const debit=wallet.movements.filter(m=>m.kind==='bills'||m.kind==='buyStock').reduce((a,m)=>a+m.amount,0);
  expect(wallet.cash).toBe(WORLD_START_CASH+income-debit-wallet.decisions.reduce((a,d)=>a+d.paid,0));
  expect(walletSummary(wallet).totalAssets).toBe(wallet.cash+walletSummary(wallet).stockValue);
 });
});
