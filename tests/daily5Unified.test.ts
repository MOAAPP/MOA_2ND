import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import sample from '../src/data/moa-demo-s01.json';
import { demoData } from '../src/lib/demo';
import { demoMoa } from '../src/lib/moa/bridge';
import { demoWorldWalletFromShared } from '../src/lib/demoWorld';
import { historyEvents } from '../src/lib/worldHistory';
import { walletSummary } from '../src/lib/worldWallet';

const all=JSON.parse(readFileSync('public/data/moa-92days.json','utf8'));
const snapshot='2026-11-04';
const asOf=Date.parse('2026-11-04T14:30:00+09:00');
type Tx={user_id:string;date:string;kind:string;essential:boolean;logged:boolean;amount:number;method:string;account:string;direction?:string;name:string};
type Day={user_id:string;date:string;income_in:number;account_out:number;emergency_transfer_in:number;account_balance_eod:number;pre_rescue_balance:number;observed_count:number;observed_variable_spend:number;model_label:number|null;observation_complete:boolean};
const tx=all.transactions as Tx[],daily=all.daily as Day[];

describe('five daily spends, unified S01 profile and payment account',()=>{
 it('records five visible purchases per past day and five unobserved scenarios per future day',()=>{
  expect(all.profiles).toHaveLength(20);
  expect(daily).toHaveLength(1840);
  expect(all.metadata.minimum_daily_variable_transactions).toBe(5);
  for(const day of daily){
   const buys=tx.filter(x=>x.user_id===day.user_id&&x.date===day.date&&x.kind==='spend'&&!x.essential);
   const observed=buys.filter(x=>x.logged);
   expect(buys.length).toBeGreaterThanOrEqual(5);
   if(day.date<=snapshot){
    expect(observed.length).toBeGreaterThanOrEqual(5);
    expect(day.observed_count).toBe(observed.length);
    expect(day.observed_variable_spend).toBe(observed.reduce((s,x)=>s+x.amount,0));
   }else{
    expect(observed).toHaveLength(0);
    expect(day.model_label).toBeNull();
    expect(day.observation_complete).toBe(false);
   }
  }
 });
 it('reconciles every profile opening balance and monthly rent, plus credit statement settlement',()=>{
  for(const p of all.profiles){
   let balance=p.opening_balance;
   for(const day of daily.filter(x=>x.user_id===p.user_id).sort((a,b)=>a.date.localeCompare(b.date))){
    const entries=tx.filter(t=>t.user_id===p.user_id&&t.date===day.date);
    const income=entries.filter(t=>t.kind==='income').reduce((s,t)=>s+t.amount,0);
    const spent=entries.filter(t=>['spend','card_payment'].includes(t.kind)&&['debit','transfer','atm'].includes(t.method)&&t.account==='pay').reduce((s,t)=>s+t.amount,0);
    const rescue=entries.filter(t=>t.kind==='transfer_self'&&t.direction==='in').reduce((s,t)=>s+t.amount,0);
    expect(day.income_in).toBe(income);
    expect(day.account_out).toBe(spent);
    expect(day.pre_rescue_balance).toBe(balance+income-spent);
    expect(day.emergency_transfer_in).toBe(rescue);
    balance+=income-spent+rescue;
    expect(day.account_balance_eod).toBe(balance);
   }
   const rent=p.schedule.find((s:{id:string})=>s.id===p.user_id+'-rent');
   expect(rent?.amount).toBe(p.rent);
   for(const date of ['2026-09-25','2026-10-25','2026-11-25']){
    const payments=tx.filter(t=>t.user_id===p.user_id&&t.date===date&&t.kind==='spend'&&t.name==='월세');
    expect(payments).toHaveLength(1);
    expect(payments[0].amount).toBe(p.rent);
   }
   for(const month of ['2026-09','2026-10','2026-11']){
    const buys=tx.filter(t=>t.user_id===p.user_id&&t.date.startsWith(month)&&t.kind==='spend'&&t.method==='credit');
    const amount=buys.reduce((s,t)=>s+t.amount,0);
    const year=Number(month.slice(0,4)),m=Number(month.slice(5));
    const due=String(m===12?year+1:year)+'-'+String(m===12?1:m+1).padStart(2,'0')+'-14';
    if(due>all.metadata.end_date)continue;
    const billed=tx.filter(t=>t.user_id===p.user_id&&t.date===due&&t.kind==='card_payment');
    expect(billed).toHaveLength(amount>0?1:0);
    if(amount>0)expect(billed[0].amount).toBe(amount);
   }
  }
 });
 it('uses the same Nov 4 balance, five spends and rent across frontend screens',()=>{
  const p=all.profiles.find((x:{user_id:string})=>x.user_id==='S01');
  const today=tx.filter(t=>t.user_id==='S01'&&t.date===snapshot&&t.kind==='spend'&&!t.essential&&t.logged);
  const day=daily.find(x=>x.user_id==='S01'&&x.date===snapshot)!;
  const ledger=demoData(asOf),account=demoMoa(asOf),world=demoWorldWalletFromShared(asOf);
  expect(today.length).toBeGreaterThanOrEqual(5);
  expect(ledger.spendLog.filter(x=>x.date===snapshot)).toHaveLength(today.length);
  expect(ledger.spendLog.filter(x=>x.date===snapshot).reduce((s,x)=>s+x.amount,0)).toBe(day.observed_variable_spend);
  expect(ledger.profile.baseBalance).toBe(day.account_balance_eod);
  expect(account.anchor?.balance).toBe(day.account_balance_eod);
  expect(world.cash).toBe(day.account_balance_eod);
  expect(world.openingCash).toBe(p.opening_balance);
  const fixed=p.schedule.filter((x:{direction:string,essential:boolean})=>x.direction==='out'&&x.essential).reduce((s:number,x:{amount:number})=>s+x.amount,0);
  expect(world.fixedBills).toBe(fixed);
  expect(walletSummary(world).protectedBills).toBe(fixed);
  expect(ledger.profile.items.find(x=>x.name==='월세')?.amount).toBe(p.rent);
  expect(account.schedule.find(x=>x.name==='월세')?.amount).toBe(p.rent);
  expect(world.movements.some(m=>m.memo==='월세')).toBe(true);
  expect(world.decisions.every(x=>x.simulatedOnly)).toBe(true);
  expect(world.movements.filter(x=>x.kind==='buyStock'||x.kind==='sellStock').every(x=>x.simulatedOnly)).toBe(true);
  expect(historyEvents(world).filter(x=>x.kind==='consumption').every(x=>x.cashDelta===0)).toBe(true);
  expect(sample.transactions.filter(x=>x.date===snapshot&&x.kind==='spend'&&!x.essential&&x.logged).length).toBeGreaterThanOrEqual(5);
 });
});
