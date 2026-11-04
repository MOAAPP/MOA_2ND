/** One deterministic data build: 2026-09-11..2026-12-11 (92 days, 20 synthetic users).
 * Execute from project root: node scripts/data/build-moa-dataset.mjs
 * No database, network access, credentials, or actual financial information.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { enrichShowcaseS01 } from './enrich-s01-showcase.mjs';
import { normalizeDailyLedger } from './normalize-daily-ledger.mjs';
const buildHalf=function buildHalf(){
 const START="2026-09-11",END="2026-10-26",SEED=20261104;
 const specs=[
 ["S01","일반 대학생·카페/배달",900000,950000,350000,55000,17000,1.0,"regular"],
 ["S02","알바비 지연형",390000,780000,345000,49000,12500,1.1,"late_income"],
 ["S03","주말 소비 집중형",1230000,1250000,440000,65000,18500,1.35,"weekend"],
 ["S04","거래 누락형",690000,980000,370000,59000,14900,1.05,"missing"],
 ["S05","고정비 부담형",520000,940000,460000,65000,45000,1.05,"fixed_heavy"],
 ["S06","신용카드 주사용자",820000,1100000,410000,55000,12900,1.12,"credit"],
 ["S07","시험기간 소비 급증형",450000,720000,300000,42000,11900,1.1,"spike"],
 ["S08","절약·저축형",1480000,1500000,430000,65000,17000,.65,"thrifty"],
 ["S09","불규칙 소득형",490000,950000,360000,53000,17900,1.16,"irregular_income"],
 ["S10","월말 자금 부족형",350000,780000,400000,63000,23000,1.3,"shortfall"],
 ["S11","카페·외식 비중이 높은 대학생",550000,850000,360000,44000,14900,1.25,"regular"],
 ["S12","야간 알바 급여 지연형",450000,1050000,380000,59000,9900,1.08,"late_income"],
 ["S13","주말 여행·여가 소비 집중형",1380000,1350000,470000,69000,20900,1.5,"weekend"],
 ["S14","지출 수기 기록 누락형",740000,980000,420000,49000,15900,.95,"missing"],
 ["S15","자취 고정비 부담이 큰 대학생",680000,880000,500000,65000,32900,1.15,"fixed_heavy"],
 ["S16","후불 신용카드 결제 집중형",980000,1180000,460000,65000,24900,1.18,"credit"],
 ["S17","시험·취업 준비기 지출 증가형",360000,640000,320000,45000,11900,1.2,"spike"],
 ["S18","생활비 절약·저축 우선형",1630000,1450000,370000,42000,9900,.58,"thrifty"],
 ["S19","프리랜서형 불규칙 소득",570000,900000,395000,55000,12900,1.3,"irregular_income"],
 ["S20","월말·연말 잔액 부족 위험형",290000,760000,410000,60000,21900,1.47,"shortfall"]
 ];
 const menu=[["식비","학식",6500],["식비","편의점 도시락",4900],["식비","배달 식사",18500],["카페","아메리카노",4500],["카페","카페 라떼",5600],["교통","대중교통",1500],["생활","생활용품",8900],["쇼핑","온라인 쇼핑",29900],["문화·여가","영화",15000],["식비","외식",15500],["카페","디저트",7900],["생활","세탁",6000]];
 const iso=d=>d.toISOString().slice(0,10);const dates=[];for(let t=new Date(START+"T00:00:00Z");iso(t)<=END;t=new Date(t.getTime()+86400000))dates.push(iso(t));
 const stamp=(date,h=12,m=0)=>Date.parse(date+"T"+String(h).padStart(2,"0")+":"+String(m).padStart(2,"0")+":00+09:00");
 const profiles=[],transactions=[],daily=[],choices=[],investments=[];
 for(let pi=0;pi<specs.length;pi++){
  let [user_id,description,opening_balance,monthly_income,rent,phone,subscription,scale,scenario]=specs[pi];
  let x=(SEED+pi*993)>>>0;const rand=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return (x>>>0)/4294967296};
  const schedule=[
   {id:user_id+"-income",name:"알바비",direction:"in",amount:monthly_income,recurrence:"monthly",day:10,essential:false,status:scenario==="irregular_income"?"uncertain":"scheduled"},
   {id:user_id+"-rent",name:"월세",direction:"out",amount:rent,recurrence:"monthly",day:25,essential:true},
   {id:user_id+"-phone",name:"통신비",direction:"out",amount:phone,recurrence:"monthly",day:15,essential:true},
   {id:user_id+"-sub",name:"구독료",direction:"out",amount:subscription,recurrence:"monthly",day:5,essential:true}
  ];
  profiles.push({user_id,description,scenario,opening_balance,monthly_income,rent,phone,subscription,spend_scale:scale,schedule,source:"synthetic"});
  let balance=opening_balance, seq=0, pos=0;
  const add=(date,kind,amount,name,category,method,essential,logged,extra={})=>{
   const tx={id:user_id+"-T"+String(++seq).padStart(4,"0"),user_id,date,occurred_at:stamp(date,kind==="income"?9:kind==="spend"?12:20,seq%60),kind,amount,name,category,method,account:method==="cash"?"cash":method==="credit"?"other":"pay",essential,logged,source:"synthetic",...extra};
   transactions.push(tx);return tx;
  };
  for(let i=0;i<dates.length;i++){
   const date=dates[i],day=Number(date.slice(8)),weekday=new Date(date+"T00:00:00Z").getUTCDay(),weekend=weekday===0||weekday===6;
   const txStart=transactions.length;
   if(day===10+(scenario==="late_income"?4:scenario==="irregular_income"?5:0))add(date,"income",monthly_income,"알바비 입금","수입","transfer",false,true,{schedule_ref:user_id+"-income:"+date.slice(0,7)+"-10"});
   if(day===25)add(date,"spend",rent,"월세","주거","transfer",true,true,{schedule_ref:user_id+"-rent:"+date});
   if(day===15)add(date,"spend",phone,"통신비","통신","transfer",true,true,{schedule_ref:user_id+"-phone:"+date});
   if(day===5)add(date,"spend",subscription,"구독료","구독","transfer",true,true,{schedule_ref:user_id+"-sub:"+date});
   let count=1+Number(rand()<.62)+Number(rand()<(weekend?.55:.18));
   if(scenario==="thrifty")count=Math.max(0,count-1);
   if(scenario==="weekend"&&!weekend)count=Math.max(0,count-1);
   if(scenario==="spike"&&date>="2026-10-18")count+=2;
   if(scenario==="shortfall"&&day>=20)count+=2;
   if(i%13===0)count=0; // known generated zero, distinguish from missing
   const missing=(scenario==="missing"&&i%4===0)||(scenario!=="missing"&&i%23===0);
   for(let j=0;j<count;j++){
    const ids=scenario==="thrifty"?[0,1,5,6]:scenario==="credit"?[2,5,7,8,9]:scenario==="weekend"&&weekend?[2,7,8,9]:menu.map((_,k)=>k);
    const [category,name,base]=menu[ids[Math.floor(rand()*ids.length)]];
    let amount=Math.max(1000,Math.round(base*scale*(.72+rand()*.72)/100)*100);
    if(scenario==="spike"&&date>="2026-10-18")amount=Math.round(amount*1.9/100)*100;
    const method=scenario==="credit"?"credit":rand()<.12?"cash":"debit";
    add(date,"spend",amount,name,category,method,false,!missing&&!(scenario==="missing"&&rand()<.2));
   }
   if(scenario==="shortfall"&&date==="2026-10-24")add(date,"spend",169000,"노트북 수리","생활","debit",false,true,{event:"unexpected_expense"});
   const todayTx=transactions.slice(txStart);
   const income=todayTx.filter(t=>t.kind==="income").reduce((a,b)=>a+b.amount,0);
   const out=todayTx.filter(t=>t.kind==="spend"&&["debit","transfer","atm"].includes(t.method)).reduce((a,b)=>a+b.amount,0);
   const preRescue=balance+income-out;
   balance=preRescue;
   let rescued=0;
   if(balance<0){rescued=Math.ceil((-balance+50000)/10000)*10000;add(date,"transfer_self",rescued,"비상 이체","이체","transfer",false,true,{direction:"in",event:"liquidity_rescue"});balance+=rescued;}
   const expenses=todayTx.filter(t=>t.kind==="spend"&&!t.essential);
   const known=expenses.every(t=>t.logged);
   daily.push({user_id,date,split:date<="2026-10-10"?"train":date<="2026-10-18"?"validation":"test",source:"synthetic",
    day_of_week:weekday,known_zero_spend:expenses.length===0,observation_complete:known,
    true_variable_spend:expenses.reduce((s,t)=>s+t.amount,0),
    observed_variable_spend:expenses.filter(t=>t.logged).reduce((s,t)=>s+t.amount,0),
    model_label:known?expenses.reduce((s,t)=>s+t.amount,0):null,
    observed_count:expenses.filter(t=>t.logged).length,missing_count:expenses.filter(t=>!t.logged).length,
    income_in:income,account_out:out,pre_rescue_balance:preRescue,emergency_transfer_in:rescued,account_balance_eod:balance});
   if(i%9===3){
    const options=[["카페 라떼",5600],["무선 이어폰",159000],["배달 식사",19500],["운동화",89000]];
    const [item,price]=options[(i+pi)%4];const choice=["buy","wait","alternative"][(i+pi)%3];
    choices.push({id:user_id+"-D"+i,user_id,date,at:stamp(date,19),item,price,paid:choice==="wait"?0:choice==="alternative"?Math.round(price*.65):price,choice,source:"synthetic"});
   }
   if([13,25,35].includes(i)){
    const side=i===35?"sell":"buy";if(side==="buy")pos++;else pos--;
    investments.push({id:user_id+"-I"+i,user_id,date,at:stamp(date,14),side,code:"360750",name:"TIGER 미국S&P500",qty:1,price:25000+pi*120+i*48,status:"filled",position_after:pos,source:"synthetic",simulated_wallet_only:true});
   }
  }
 }
 return {metadata:{dataset_id:"MOA-2026-H1",version:"1.0.0",start_date:START,end_date:END,days:dates.length,profiles:profiles.length,seed:SEED,timezone:"Asia/Seoul",source:"synthetic",next_half_start:"2026-10-27",next_half_end:"2026-12-11",split:{train:"2026-09-11..2026-10-10",validation:"2026-10-11..2026-10-18",test:"2026-10-19..2026-10-26"},notes:"Entirely fictional, never claim real-user outcomes. model_label is null for incompletely logged synthetic dates. Investments are virtual and separate from payment-account cash until explicitly settled."},profiles,transactions,daily,choices,investments};
};

const buildSecond=function buildSecond(first){
  const START="2026-10-27",END="2026-12-11",SNAP="2026-11-04",SEED=20261105;
  const iso=d=>d.toISOString().slice(0,10),dates=[];
  for(let d=new Date(START+"T00:00:00Z");iso(d)<=END;d=new Date(d.getTime()+86400000))dates.push(iso(d));
  const at=(d,h=12,m=0)=>Date.parse(`${d}T${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}:00+09:00`);
  const categories=[["식비","학식",6500],["식비","편의점 도시락",4900],["식비","배달 식사",18500],["카페","아메리카노",4500],["카페","카페 라떼",5600],["교통","대중교통",1500],["생활","생활용품",8900],["쇼핑","온라인 쇼핑",29900],["문화·여가","영화",15000],["식비","외식",15500],["카페","디저트",7900],["생활","세탁",6000]];
  const profiles=first.profiles.map(x=>({...x})),transactions=[],daily=[],choices=[],investments=[];
  for(let pi=0;pi<profiles.length;pi++){
    const p=profiles[pi],id=p.user_id,history=first.transactions.filter(t=>t.user_id===id);
    const last=first.daily.find(d=>d.user_id===id&&d.date==="2026-10-26");
    if(!last)throw Error("Missing H1 closing balance: "+id);
    let x=(SEED+pi*991)>>>0;const rand=()=>{x^=x<<13;x^=x>>>17;x^=x<<5;return(x>>>0)/4294967296};
    let bal=last.account_balance_eod,seq=Math.max(...history.map(t=>Number(t.id.split("-T")[1])));
    let shares=first.investments.filter(i=>i.user_id===id).reduce((n,i)=>n+(i.side==="buy"?i.qty:-i.qty),0);
    const add=(date,kind,amount,name,category,method,essential,seen,extra={})=>{
      const future=date>SNAP;
      const t={id:`${id}-T${String(++seq).padStart(4,"0")}`,user_id:id,date,occurred_at:at(date,kind==="income"?9:kind==="spend"?12:20,seq%60),
      kind,amount,name,category,method,account:method==="cash"?"cash":method==="credit"?"other":"pay",essential,logged:!future&&seen,source:"synthetic",phase:future?"future_scenario":"historical_synthetic",future_scenario:future,...extra};
      transactions.push(t);return t;
    };
    for(let i=0;i<dates.length;i++){
      const date=dates[i],day=Number(date.slice(8)),month=date.slice(0,7),dow=new Date(date+"T00:00:00Z").getUTCDay(),weekend=dow===0||dow===6,future=date>SNAP;
      const start=transactions.length;
      const delay=p.scenario==="late_income"?(month==="2026-11"?4:3):p.scenario==="irregular_income"?(month==="2026-11"?6:1):0;
      if(day===10+delay){
        const amount=p.scenario==="irregular_income"&&month==="2026-11"?Math.round(p.monthly_income*.78):p.monthly_income;
        add(date,"income",amount,"알바비 입금","수입","transfer",false,true,{schedule_ref:`${id}-income:${month}-10`,income_delayed_days:delay});
      }
      if(day===25)add(date,"spend",p.rent,"월세","주거","transfer",true,true,{schedule_ref:`${id}-rent:${date}`});
      if(day===15)add(date,"spend",p.phone,"통신비","통신","transfer",true,true,{schedule_ref:`${id}-phone:${date}`});
      if(day===5)add(date,"spend",p.subscription,"구독료","구독","transfer",true,true,{schedule_ref:`${id}-sub:${date}`});
      if(date==="2026-11-14"){
        const allOct=[...history,...transactions].filter(t=>t.user_id===id&&t.date.startsWith("2026-10-")&&t.kind==="spend"&&t.method==="credit");
        const due=allOct.reduce((s,t)=>s+t.amount,0);
        if(due>0)add(date,"card_payment",due,"10월 신용카드 청구액","카드대금","transfer",true,true,{event:"october_credit_settlement"});
      }
      const exam=p.scenario==="spike"&&date>="2026-10-27"&&date<="2026-11-08";
      let n=1+Number(rand()<.64)+Number(rand()<(weekend?.56:.22));
      if(p.scenario==="thrifty"||p.scenario==="weekend"&&!weekend)n=Math.max(0,n-1);
      if(exam)n+=2;
      if(p.scenario==="shortfall"&&day>=20)n+=2;
      if(i%13===7)n=0;
      const missing=p.scenario==="missing"&&i%4===1||p.scenario!=="missing"&&i%23===6;
      for(let j=0;j<n;j++){
        const ids=p.scenario==="thrifty"?[0,1,5,6]:p.scenario==="credit"?[2,5,7,8,9]:p.scenario==="weekend"&&weekend?[2,7,8,9]:categories.map((_,k)=>k);
        const [category,name,base]=categories[ids[Math.floor(rand()*ids.length)]];
        let amount=Math.max(1000,Math.round(base*p.spend_scale*(.72+rand()*.7)/100)*100);
        if(exam)amount=Math.round(amount*2/100)*100;
        const method=p.scenario==="credit"?"credit":rand()<.11?"cash":"debit";
        add(date,"spend",amount,name,category,method,false,!missing&&!(p.scenario==="missing"&&rand()<.15));
      }
      if(p.scenario==="shortfall"&&date==="2026-11-02")add(date,"spend",125000,"전자기기 수리","생활","debit",false,true,{event:"unexpected_expense"});
      if(p.scenario==="irregular_income"&&date==="2026-11-04")add(date,"spend",89000,"교통 정기권","교통","debit",false,true,{event:"unexpected_expense"});
      const entries=transactions.slice(start);
      const income=entries.filter(t=>t.kind==="income").reduce((s,t)=>s+t.amount,0);
      const out=entries.filter(t=>(t.kind==="spend"||t.kind==="card_payment")&&["debit","transfer","atm"].includes(t.method)).reduce((s,t)=>s+t.amount,0);
      const before=bal+income-out;bal=before;
      let emergency=0;
      if(bal<0){emergency=Math.ceil((-bal+50000)/10000)*10000;add(date,"transfer_self",emergency,"비상 이체","이체","transfer",false,true,{direction:"in",event:"liquidity_rescue"});bal+=emergency;}
      const variable=entries.filter(t=>t.kind==="spend"&&!t.essential),observed=variable.filter(t=>t.logged);
      const complete=!future&&variable.every(t=>t.logged),truth=variable.reduce((s,t)=>s+t.amount,0);
      daily.push({user_id:id,date,split:future?"future_scenario":date<="2026-10-27"?"validation":"test",source:"synthetic",future_scenario:future,
        day_of_week:dow,known_zero_spend:variable.length===0,observation_complete:complete,true_variable_spend:truth,
        observed_variable_spend:observed.reduce((s,t)=>s+t.amount,0),model_label:complete?truth:null,
        observed_count:observed.length,missing_count:variable.length-observed.length,income_in:income,account_out:out,
        pre_rescue_balance:before,emergency_transfer_in:emergency,account_balance_eod:bal});
      const g=i+46;
      if(g%9===3){
        const opts=[["카페 라떼",5600],["무선 이어폰",159000],["배달 식사",19500],["운동화",89000]];
        const [item,price]=opts[(g+pi)%4],choice=["buy","wait","alternative"][(g+pi)%3];
        choices.push({id:`${id}-D${g}`,user_id:id,date,at:at(date,19),item,price,paid:choice==="wait"?0:choice==="alternative"?Math.round(price*.65):price,
          choice,source:"synthetic",phase:future?"future_scenario":"historical_synthetic",future_scenario:future});
      }
      if([50,62,70,81].includes(g)){
        const side=[62,81].includes(g)?"sell":"buy";shares+=side==="buy"?1:-1;
        if(shares<0)throw Error("Negative position: "+id);
        investments.push({id:`${id}-I${g}`,user_id:id,date,at:at(date,14),side,code:"360750",name:"TIGER 미국S&P500",qty:1,
          price:25000+pi*120+g*48,status:"filled",position_after:shares,source:"synthetic",simulated_wallet_only:true,
          phase:future?"future_scenario":"historical_synthetic",future_scenario:future});
      }
    }
  }
  if(dates.length!==46)throw Error("Second half not 46 days");
  return {metadata:{dataset_id:"MOA-2026-H2",version:"2.0.0",start_date:START,end_date:END,days:dates.length,profiles:profiles.length,
    seed:SEED,source:"synthetic",timezone:"Asia/Seoul",snapshot_date:SNAP,continuation_of:"MOA-2026-H1",
    future_scenario_start:"2026-11-05",future_scenario_end:END,
    warning:"All fictitious. 2026-11-05 onward is an unobserved future scenario; never use it as a model target or observed transaction."},
    profiles,transactions,daily,choices,investments};
};
const combine=function combine(first,second){
  const snapshot="2026-11-04",split=d=>d<="2026-10-20"?"train":d<="2026-10-27"?"validation":d<=snapshot?"test":"future_scenario";
  const transactions=[...first.transactions.map(t=>({...t,phase:"historical_synthetic",future_scenario:false})),...second.transactions];
  const daily=[...first.daily,...second.daily].map(d=>{const future=d.date>snapshot,complete=!future&&d.observation_complete;return {...d,split:split(d.date),future_scenario:future,observation_complete:complete,model_label:complete?d.true_variable_spend:null}});
  const choices=[...first.choices.map(d=>({...d,phase:"historical_synthetic",future_scenario:false})),...second.choices];
  const investments=[...first.investments.map(d=>({...d,phase:"historical_synthetic",future_scenario:false})),...second.investments];
  const expected=first.profiles.length*92;
  if(daily.length!==expected||new Set(daily.map(x=>x.user_id+":"+x.date)).size!==expected)throw Error("Daily grain error");
  for(const rows of [transactions,choices,investments])if(rows.length!==new Set(rows.map(x=>x.id)).size)throw Error("Duplicate IDs");
  return {metadata:{dataset_id:"MOA-2026-92D",version:"2.0.0",source:"synthetic",start_date:"2026-09-11",end_date:"2026-12-11",
    snapshot_date:snapshot,days:92,profiles:first.profiles.length,observed_synthetic_days:55,future_scenario_days:37,timezone:"Asia/Seoul",
    seed_half1:first.metadata.seed,seed_half2:second.metadata.seed,
    split:{train:"2026-09-11..2026-10-20",validation:"2026-10-21..2026-10-27",test:"2026-10-28..2026-11-04",future_scenario:"2026-11-05..2026-12-11"},
    warning:"Every value is synthetic, not a real user's bank data. Future days are hypothetical; model_label null for incomplete/future rows. true_variable_spend is oracle-only."},
    profiles:first.profiles,transactions,daily,choices,investments};
};

const csv=function csv(rows,cols){const f=v=>{const s=v===null||v===undefined?"":typeof v==="object"?JSON.stringify(v):String(v);return /[",\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s};return cols.join(",")+"\n"+rows.map(x=>cols.map(c=>f(x[c])).join(",")).join("\n")+"\n";};

const cols={"profiles":["user_id","description","scenario","opening_balance","monthly_income","rent","phone","subscription","spend_scale","source"],"transactions":["id","user_id","date","occurred_at","kind","amount","name","category","method","account","essential","logged","source","phase","future_scenario","schedule_ref","direction","event","income_delayed_days"],"daily":["user_id","date","split","source","future_scenario","day_of_week","known_zero_spend","observation_complete","true_variable_spend","observed_variable_spend","model_label","observed_count","missing_count","income_in","account_out","pre_rescue_balance","emergency_transfer_in","account_balance_eod"],"choices":["id","user_id","date","at","item","price","paid","choice","source","phase","future_scenario"],"investments":["id","user_id","date","at","side","code","name","qty","price","status","position_after","source","simulated_wallet_only","phase","future_scenario"]};

const first = buildHalf();
const second = buildSecond(first);
const full = normalizeDailyLedger(enrichShowcaseS01(combine(first,second)));
const snapshot = full.metadata.snapshot_date;
const s01 = {
 metadata: { dataset_id:'MOA-FRONTEND-S01', source:'synthetic', snapshot_date:snapshot, historical_only:true },
 profiles: full.profiles.filter(x=>x.user_id==='S01'),
 transactions: full.transactions.filter(x=>x.user_id==='S01' && !x.future_scenario),
 daily: full.daily.filter(x=>x.user_id==='S01' && !x.future_scenario),
 choices: full.choices.filter(x=>x.user_id==='S01' && !x.future_scenario),
 investments: full.investments.filter(x=>x.user_id==='S01' && !x.future_scenario),
};
const files = [
 ['public/data/moa-92days.json', JSON.stringify(full) + '\n'],
 ['src/data/moa-demo-s01.json', JSON.stringify(s01) + '\n'],
 ...Object.entries(cols).map(([name,fields])=>[`public/data/moa-92days-${name}.csv`, csv(full[name],fields)]),
];
for(const [path,body] of files){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,body)}
console.log(JSON.stringify({users:full.profiles.length,days:full.metadata.days,transactions:full.transactions.length,
 daily:full.daily.length,choices:full.choices.length,investments:full.investments.length,files:files.map(x=>x[0])},null,2));
