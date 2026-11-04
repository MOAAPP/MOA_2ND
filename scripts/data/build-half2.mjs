/** Deterministic H2 (2026-10-27 to 12-11) and complete 92-day synthetic fixture. Run from project root. */
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {dirname} from 'node:path';
const first=JSON.parse(readFileSync('src/data/moa-half1.json','utf8'));
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
  return {metadata:{dataset_id:"MOA-2026-H2",version:"2.0.0",start_date:START,end_date:END,days:dates.length,profiles:10,
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
  if(daily.length!==920||new Set(daily.map(x=>x.user_id+":"+x.date)).size!==920)throw Error("Daily grain error");
  for(const rows of [transactions,choices,investments])if(rows.length!==new Set(rows.map(x=>x.id)).size)throw Error("Duplicate IDs");
  return {metadata:{dataset_id:"MOA-2026-92D",version:"2.0.0",source:"synthetic",start_date:"2026-09-11",end_date:"2026-12-11",
    snapshot_date:snapshot,days:92,profiles:10,observed_synthetic_days:55,future_scenario_days:37,timezone:"Asia/Seoul",
    seed_half1:first.metadata.seed,seed_half2:second.metadata.seed,
    split:{train:"2026-09-11..2026-10-20",validation:"2026-10-21..2026-10-27",test:"2026-10-28..2026-11-04",future_scenario:"2026-11-05..2026-12-11"},
    warning:"Every value is synthetic, not a real user's bank data. Future days are hypothetical; model_label null for incomplete/future rows. true_variable_spend is oracle-only."},
    profiles:first.profiles,transactions,daily,choices,investments};
};
const csv=function csv(rows,cols){const f=v=>{const s=v===null||v===undefined?"":typeof v==="object"?JSON.stringify(v):String(v);return /[",\n]/.test(s)?'"'+s.replaceAll('"','""')+'"':s};return cols.join(",")+"\n"+rows.map(x=>cols.map(c=>f(x[c])).join(",")).join("\n")+"\n";};
const cols={"profiles":["user_id","description","scenario","opening_balance","monthly_income","rent","phone","subscription","spend_scale","source"],"transactions":["id","user_id","date","occurred_at","kind","amount","name","category","method","account","essential","logged","source","phase","future_scenario","schedule_ref","direction","event","income_delayed_days"],"daily":["user_id","date","split","source","future_scenario","day_of_week","known_zero_spend","observation_complete","true_variable_spend","observed_variable_spend","model_label","observed_count","missing_count","income_in","account_out","pre_rescue_balance","emergency_transfer_in","account_balance_eod"],"choices":["id","user_id","date","at","item","price","paid","choice","source","phase","future_scenario"],"investments":["id","user_id","date","at","side","code","name","qty","price","status","position_after","source","simulated_wallet_only","phase","future_scenario"]};
const second=buildSecond(first),full=combine(first,second);
const s01={metadata:{dataset_id:"MOA-FRONTEND-S01",source:"synthetic",snapshot_date:"2026-11-04",historical_only:true},profiles:full.profiles.filter(p=>p.user_id==="S01"),transactions:full.transactions.filter(t=>t.user_id==="S01"&&!t.future_scenario),daily:full.daily.filter(t=>t.user_id==="S01"&&!t.future_scenario),choices:full.choices.filter(t=>t.user_id==="S01"&&!t.future_scenario),investments:full.investments.filter(t=>t.user_id==="S01"&&!t.future_scenario)};
const LF=String.fromCharCode(10);
const files=[["src/data/moa-half2.json",JSON.stringify(second,null,2)+LF],["public/data/moa-half2.json",JSON.stringify(second,null,2)+LF],["src/data/moa-92days.json",JSON.stringify(full)+LF],["public/data/moa-92days.json",JSON.stringify(full)+LF],["src/data/moa-demo-s01.json",JSON.stringify(s01)+LF],...Object.entries(cols).map(([k,v])=>["public/data/moa-half2-"+k+".csv",csv(second[k],v)]),...Object.entries(cols).map(([k,v])=>["public/data/moa-92days-"+k+".csv",csv(full[k],v)])];
for(const [path,body] of files){mkdirSync(dirname(path),{recursive:true});writeFileSync(path,body)}
console.log(JSON.stringify({half2:{days:46,transactions:second.transactions.length,daily:second.daily.length},full:{days:92,transactions:full.transactions.length,daily:full.daily.length},files:files.map(x=>x[0])},null,2));
