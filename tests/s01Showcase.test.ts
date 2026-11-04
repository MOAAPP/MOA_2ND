import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import sample from '../src/data/moa-demo-s01.json';
import { demoMoa } from '../src/lib/moa/bridge';
import { pendingBills } from '../src/lib/moa/ledger';
import { assessRisk } from '../src/lib/moa/risk';

const all=JSON.parse(readFileSync('public/data/moa-92days.json','utf8'));
const s01=all.profiles.find((p:{user_id:string})=>p.user_id==='S01');
const transactions=all.transactions.filter((t:{user_id:string})=>t.user_id==='S01');
const daily=all.daily.filter((d:{user_id:string})=>d.user_id==='S01').sort((a:{date:string},b:{date:string})=>a.date.localeCompare(b.date));
const investments=all.investments.filter((i:{user_id:string})=>i.user_id==='S01').sort((a:{date:string,at:number},b:{date:string,at:number})=>a.date.localeCompare(b.date)||a.at-b.at);
const choices=all.choices.filter((c:{user_id:string})=>c.user_id==='S01');
const snapshot='2026-11-04';
const now=Date.parse('2026-11-04T14:00:00+09:00');

describe('S01 showcase persona, isolated from 19 unchanged synthetic users',()=>{
  it('preserves 20 profiles and 92 daily rows each, with the baseline date window',()=>{
    expect(all.profiles).toHaveLength(20);
    expect(all.daily).toHaveLength(1840);
    expect(daily).toHaveLength(92);
    expect(all.metadata.showcase_user_id).toBe('S01');
    expect(daily[0].date).toBe('2026-09-11');
    expect(daily.at(-1).date).toBe('2026-12-11');
    expect(s01.scenario).toBe('showcase');
    expect(s01.schedule.filter((x:{direction:string})=>x.direction==='out').length).toBeGreaterThanOrEqual(5);
    expect(s01.schedule.some((x:{status:string})=>x.status==='uncertain')).toBe(true);
  });

  it('links the same synthetic account ledger across 92 days, including real settlement timing',()=>{
    let balance=s01.opening_balance;
    for(const d of daily){
      const rows=transactions.filter((t:{date:string})=>t.date===d.date);
      const income=rows.filter((t:{kind:string})=>t.kind==='income').reduce((s:number,t:{amount:number})=>s+t.amount,0);
      const out=rows.filter((t:{kind:string,method:string})=>
        (t.kind==='spend'||t.kind==='card_payment')&&['debit','transfer','atm'].includes(t.method)).reduce((s:number,t:{amount:number})=>s+t.amount,0);
      const rescues=rows.filter((t:{kind:string})=>t.kind==='transfer_self').reduce((s:number,t:{amount:number})=>s+t.amount,0);
      expect(d.income_in).toBe(income);
      expect(d.account_out).toBe(out);
      expect(d.pre_rescue_balance).toBe(balance+income-out);
      expect(d.emergency_transfer_in).toBe(rescues);
      balance+=income-out+rescues;
      expect(d.account_balance_eod).toBe(balance);
    }
    expect(daily.some((d:{pre_rescue_balance:number})=>d.pre_rescue_balance<0)).toBe(true);
    expect(daily.find((d:{date:string})=>d.date==='2026-10-26').account_balance_eod+
      daily.find((d:{date:string})=>d.date==='2026-10-27').income_in-
      daily.find((d:{date:string})=>d.date==='2026-10-27').account_out+
      daily.find((d:{date:string})=>d.date==='2026-10-27').emergency_transfer_in)
      .toBe(daily.find((d:{date:string})=>d.date==='2026-10-27').account_balance_eod);
    expect(transactions.every((t:{date:string})=>t.date>='2026-09-11'&&t.date<='2026-12-11')).toBe(true);
  });

  it('charges credit purchases only on the following statement due date',()=>{
    for(const [month,due] of [['2026-09','2026-10-14'],['2026-10','2026-11-14']]){
      const spent=transactions.filter((t:{date:string,kind:string,method:string})=>t.date.startsWith(month)&&t.kind==='spend'&&t.method==='credit')
        .reduce((s:number,t:{amount:number})=>s+t.amount,0);
      const payments=transactions.filter((t:{date:string,kind:string})=>t.date===due&&t.kind==='card_payment');
      expect(spent).toBeGreaterThan(0);
      expect(payments).toHaveLength(1);
      expect(payments[0].amount).toBe(spent);
    }
    const salary=transactions.filter((t:{kind:string,name:string,date:string})=>t.kind==='income'&&t.name==='알바비 입금'&&t.date.startsWith('2026-11'));
    expect(salary).toHaveLength(1);
    expect(salary[0].date).toBe('2026-11-13');
    expect(transactions.some((t:{kind:string,date:string})=>t.kind==='income'&&t.date==='2026-11-10')).toBe(false);
  });

  it('never leaks hypothetical future trades or missing observations into historical ML labels',()=>{
    for(const d of daily){
      const variable=transactions.filter((t:{date:string,kind:string,essential:boolean})=>t.date===d.date&&t.kind==='spend'&&!t.essential);
      const observed=variable.filter((t:{logged:boolean})=>t.logged);
      expect(d.true_variable_spend).toBe(variable.reduce((s:number,t:{amount:number})=>s+t.amount,0));
      expect(d.observed_variable_spend).toBe(observed.reduce((s:number,t:{amount:number})=>s+t.amount,0));
      if(d.date>snapshot||observed.length!==variable.length){
        expect(d.model_label).toBeNull();
        expect(d.observation_complete).toBe(false);
      }
    }
    expect(transactions.filter((t:{date:string})=>t.date>snapshot).every((t:{logged:boolean})=>!t.logged)).toBe(true);
    expect(sample.daily).toHaveLength(55);
    expect(sample.transactions.every((t:{date:string})=>t.date<=snapshot)).toBe(true);
    expect(sample.investments.every((t:{date:string})=>t.date<=snapshot)).toBe(true);
    expect(sample.choices.every((t:{date:string})=>t.date<=snapshot)).toBe(true);
  });

  it('can demonstrate buy/wait/alternative decisions and valid two-ETF positions',()=>{
    expect(new Set(choices.map((c:{choice:string})=>c.choice))).toEqual(new Set(['buy','wait','alternative']));
    expect(investments.some((i:{code:string})=>i.code==='069500')).toBe(true);
    expect(investments.some((i:{code:string})=>i.code==='360750')).toBe(true);
    const positions=new Map<string,number>();
    for (const i of investments){
      const next=(positions.get(i.code)??0)+(i.side==='buy'?i.qty:-i.qty);
      expect(next).toBeGreaterThanOrEqual(0);
      expect(i.position_after).toBe(next);
      positions.set(i.code,next);
    }
    expect(new Set(all.transactions.map((t:{id:string})=>t.id)).size).toBe(all.transactions.length);
    expect(new Set(all.choices.map((t:{id:string})=>t.id)).size).toBe(all.choices.length);
    expect(new Set(all.investments.map((t:{id:string})=>t.id)).size).toBe(all.investments.length);
  });

  it('makes upcoming credit settlements visible to the actual demo risk engine',()=>{
    const state=demoMoa(now);
    expect(state.cards.find(x=>x.kind==='credit')).toBeDefined();
    const bills=pendingBills(state);
    const expected=transactions.find((t:{kind:string,date:string})=>t.kind==='card_payment'&&t.date==='2026-11-14');
    expect(bills.find(b=>b.date==='2026-11-14')?.amount).toBe(expected.amount);
    expect(state.schedule.find(x=>x.id==='S01-side-income')?.status).toBe('uncertain');
    expect(state.schedule.find(x=>x.id==='S01-income')?.status).toBe('scheduled');
    const risk=assessRisk(state,now,snapshot);
    expect(risk.payments.some(p=>p.date==='2026-11-14'&&p.name.includes('카드'))).toBe(true);
    expect(risk.payments.some(p=>p.date==='2026-11-05')).toBe(true);
  });
});
