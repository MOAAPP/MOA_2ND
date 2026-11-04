/** Deterministic MOA half-1 synthetic fixture. Run: node scripts/data/build-half1.mjs */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
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
 ["S10","월말 자금 부족형",350000,780000,400000,63000,23000,1.3,"shortfall"]
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
   if(day===10+(scenario==="late_income"?4:scenario==="irregular_income"?5:0))add(date,"income",monthly_income,"알바비 입금","수입","transfer",false,true,{schedule_ref:user_id+"-income:2026-10-10"});
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
const toCsv=function toCsv(rows,fields){const quote=v=>{const s=v==null?"":typeof v==="object"?JSON.stringify(v):String(v);return /[",\n]/.test(s)?'"'+s.replace(/"/g,'""')+'"':s};return fields.join(",")+"\n"+rows.map(r=>fields.map(k=>quote(r[k])).join(",")).join("\n")+"\n";};
const d=buildHalf();
const files=[
 ['src/data/moa-half1.json',JSON.stringify(d,null,2)+'\n'],
 ['public/data/moa-half1.json',JSON.stringify(d,null,2)+'\n'],
 ['public/data/moa-half1-profiles.csv',toCsv(d.profiles,['user_id','description','scenario','opening_balance','monthly_income','rent','phone','subscription','spend_scale','source'])],
 ['public/data/moa-half1-transactions.csv',toCsv(d.transactions,['id','user_id','date','occurred_at','kind','amount','name','category','method','account','essential','logged','source','schedule_ref','direction','event'])],
 ['public/data/moa-half1-daily.csv',toCsv(d.daily,['user_id','date','split','source','day_of_week','known_zero_spend','observation_complete','true_variable_spend','observed_variable_spend','model_label','observed_count','missing_count','income_in','account_out','pre_rescue_balance','emergency_transfer_in','account_balance_eod'])],
 ['public/data/moa-half1-choices.csv',toCsv(d.choices,['id','user_id','date','at','item','price','paid','choice','source'])],
 ['public/data/moa-half1-investments.csv',toCsv(d.investments,['id','user_id','date','at','side','code','name','qty','price','status','position_after','source','simulated_wallet_only'])],
];
for(const [file,value] of files){mkdirSync(dirname(file),{recursive:true});writeFileSync(file,value)}
console.log(JSON.stringify({days:d.metadata.days,profiles:d.profiles.length,transactions:d.transactions.length,daily:d.daily.length,files:files.map(x=>x[0])},null,2));
