#!/usr/bin/env python3
"""MOA 2026-09-11..2026-12-11 reproducible synthetic cashflow dataset."""
import csv,json,random,sys
from datetime import date,datetime,timedelta,timezone
from collections import defaultdict
from pathlib import Path
S=date(2026,9,11); E=date(2026,12,11); CUT=date(2026,11,3); TRAIN=date(2026,10,20)
SEED=20261104; KST=timezone(timedelta(hours=9))
D=[S+timedelta(days=i) for i in range((E-S).days+1)]
SPEC=[
('U01','자취 대학생','월세 직전 부족',210000,850000,10,0,13500,.08,.06,.18,[('월세','주거',25,380000),('통신비','통신',15,49000),('구독료','구독',5,12900)]),
('U02','통학 대학생','교통·카페 반복',340000,570000,1,0,10500,.10,.08,.12,[('통신비','통신',20,39000),('정기교통권','교통',1,62000)]),
('U03','자취 대학생','급여 3일 지연',170000,1000000,10,3,17500,.09,.12,.35,[('월세','주거',11,440000),('관리비','주거',14,70000),('통신비','통신',23,55000)]),
('U04','취업 준비생','수입 없는 기간',2300000,0,1,0,15800,.13,.15,.06,[('월세','주거',4,410000),('강의료','교육',21,85000),('통신비','통신',26,47000)]),
('U05','아르바이트 대학생','돌발 지출',120000,690000,15,0,9600,.10,.15,.22,[('월세','주거',1,340000),('통신비','통신',22,48000)]),
('U06','사회 초년생','신용카드 청구 변동',480000,2200000,25,0,35500,.06,.04,.63,[('월세','주거',27,650000),('보험료','보험',7,95000),('통신비','통신',12,69000)]),
('U07','사회 초년생','급여 후 적금',99000,2100000,10,0,27000,.07,.09,.43,[('월세','주거',12,560000),('적금','저축',11,500000),('관리비','주거',15,130000)]),
('U08','프리랜서','불규칙 수입',260000,0,1,0,16500,.09,.20,.25,[('통신비','통신',18,51000),('장비 할부','기타',14,125000)]),
('U09','자취 대학생','식비 집중',190000,790000,5,0,19800,.04,.11,.24,[('월세','주거',6,420000),('통신비','통신',20,46000)]),
('U10','통학 대학생','낮은 부족 위험',870000,820000,1,0,8800,.15,.03,.08,[('통신비','통신',16,36000),('구독료','구독',8,9900)])]
GOODS=[('식비','점심',7500),('식비','저녁',11000),('카페','카페',5000),('교통','대중교통',1650),('쇼핑','생활잡화',13000),('식비','편의점',4200),('문화·여가','영화',12500),('생활','생필품',8800)]
SHOCKS={'U05':[('2026-10-22',185000,'수리비')],'U03':[('2026-11-16',160000,'병원비')],'U06':[('2026-11-27',230000,'가전 수리비')],'U09':[('2026-10-31',98000,'기념일 식사')]}
split=lambda d:'train' if d<=TRAIN else ('validation' if d<=CUT else 'future_scenario')
stamp=lambda d,h,m:int(datetime(d.year,d.month,d.day,h,m,tzinfo=KST).timestamp()*1000)
observed=[];future=[];daily=[];profiles=[];front_profiles=[];front_txns=[]
for ix,(uid,segment,scenario,startbal,income,payday,delay,variable,pzero,pmiss,pcredit,bills) in enumerate(SPEC):
 r=random.Random(SEED+ix*1009); events=[];charges=defaultdict(int);n=0
 def add(d,kind,name,cat,amt,method='transfer',essential=False,record=True,scheduled=False,h=12):
  global n
  n+=1; effect=int(kind in ('income','fixed','card_payment') or (kind=='spend' and method=='debit'))
  x={'id':uid+'-T'+str(n).zfill(4),'user_id':uid,'date':d.isoformat(),'occurred_at':stamp(d,h,n%60),'kind':kind,'name':name,'category':cat,'amount_krw':int(amt),'method':method,'essential':bool(essential),'account_effect':effect,'observed':int(record and d<=CUT),'scheduled':int(scheduled),'split':split(d),'synthetic':True}
  events.append(x)
 for d in D:
  if income and d.day==payday+delay: add(d,'income','알바비' if '대학생' in segment else '월급','수입',income,h=9)
  if uid=='U08' and d.day in (3,17) and r.random()<.83: add(d,'income','프로젝트 정산','수입',r.choice([250000,410000,620000]),record=r.random()>.08,h=11)
  for name,cat,day,amt in bills:
   if d.day==day:add(d,'fixed',name,cat,amt,essential=True,scheduled=True,h=8)
  if r.random()>=pzero:
   for j in range(r.choice([1,1,2,2,3] if d.weekday()>=5 else [1,1,1,2,2])):
    cat,name,base=r.choice(GOODS);amt=max(100,round(base*(variable/14000)*r.uniform(.72,1.45)/100)*100)
    method='credit' if r.random()<pcredit else ('cash' if r.random()<.07 else 'debit')
    add(d,'spend',name,cat,amt,method,record=r.random()>=pmiss,h=11+j*4)
    if method=='credit':
     year=d.year+(d.month==12);month=1 if d.month==12 else d.month+1
     charges[date(year,month,14)]+=amt
  for sd,amt,name in SHOCKS.get(uid,[]):
   if d.isoformat()==sd:add(d,'spend',name,'기타',amt,'debit',record=r.random()>.14,h=19)
 for billdate,amt in charges.items():
  if S<=billdate<=E:add(billdate,'card_payment','카드 대금','카드대금',amt,essential=True,h=7)
 events.sort(key=lambda x:(x['occurred_at'],x['id']))
 bydate=defaultdict(list)
 for e in events:bydate[e['date']].append(e)
 bal=startbal;cutbal=None;observed_days=0
 for d in D:
  prev=bal;ev=bydate[d.isoformat()];short=False
  for e in ev:
   if e['account_effect']:
    bal+=e['amount_krw'] if e['kind']=='income' else -e['amount_krw']
    if e['essential'] and e['kind']!='income' and bal<0:short=True
  if d==CUT:cutbal=bal
  seen=[e for e in ev if e['observed']];nonfixed=[e for e in seen if e['kind']=='spend' and not e['essential']]
  has=bool(nonfixed);observed_days+=has
  daily.append({'user_id':uid,'date':d.isoformat(),'split':split(d),'actual_spending_krw':sum(e['amount_krw'] for e in ev if e['kind']=='spend' and not e['essential']),'observed_spending_krw':sum(e['amount_krw'] for e in nonfixed) if has else '', 'has_observation':int(has),'true_open_balance_krw':prev,'true_close_balance_krw':bal,'shortfall_on_essential':int(short),'synthetic':True})
 sched=([{'id':uid+'-income','name':'월급·용돈','direction':'in','amount':income,'recurrence':'monthly','day':payday,'essential':False,'status':'scheduled'}] if income else [])+[
 {'id':uid+'-fixed'+str(i),'name':name,'direction':'out','amount':amt,'recurrence':'monthly','day':day,'essential':True,'saving':cat=='저축'} for i,(name,cat,day,amt) in enumerate(bills)]
 past=[e for e in events if e['date']<=CUT.isoformat() and e['observed']]
 profiles.append({'user_id':uid,'segment':segment,'scenario':scenario,'initial_balance_2026_09_11':startbal,'balance_as_of':cutbal,'as_of':CUT.isoformat(),'income_amount_krw':income,'income_day':payday,'simulated_income_delay_days':delay,'observed_day_count':observed_days,'schedule':sched,'synthetic':True})
 front_profiles.append({'user_id':uid,'segment':segment,'scenario':scenario,'balance_as_of':cutbal,'daily_spend_prior':variable,'schedule':sched,'observed_count':len(past)})
 front_txns+=past;observed+=past;future +=[e for e in events if e['date']>CUT.isoformat()]
root=Path(sys.argv[1]) if len(sys.argv)>1 else Path('.')
dat=root/'datasets'/'moa-fall-2026';frontend=root/'src'/'data'
dat.mkdir(parents=True,exist_ok=True);frontend.mkdir(parents=True,exist_ok=True)
meta={'id':'moa-synthetic-fall-2026-v1','synthetic':True,'real_user_data':False,'timezone':'Asia/Seoul','currency':'KRW','seed':SEED,'start':S.isoformat(),'end':E.isoformat(),'as_of':CUT.isoformat(),'days_inclusive':len(D),'user_count':len(SPEC),'splits':{'train':['2026-09-11','2026-10-20'],'validation':['2026-10-21','2026-11-03'],'future_scenario':['2026-11-04','2026-12-11']},'policy':'Missing observed spending days are unknown, never zero. Future data only for hypothetical scenario QA, not historical training.'}
def jfile(p,v):p.write_text(json.dumps(v,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
def cfile(p,rows):
 with p.open('w',encoding='utf-8-sig',newline='') as f:
  w=csv.DictWriter(f,fieldnames=list(rows[0]));w.writeheader();w.writerows(rows)
jfile(dat/'metadata.json',meta);jfile(dat/'profiles.json',profiles)
cfile(dat/'observed_transactions.csv',observed)
cfile(dat/'future_scenario_transactions.csv',future)
cfile(dat/'daily_truth.csv',daily)
jfile(frontend/'moa-fall-observed.json',{'dataset_id':meta['id'],'as_of':meta['as_of'],'synthetic':True,'profiles':front_profiles,'transactions':front_txns})
stats={'users':len(profiles),'days_per_user':len(D),'daily_rows':len(daily),'observed_transactions':len(observed),'future_scenario_transactions':len(future),'observed_spending_days':sum(int(x['has_observation']) for x in daily)}
jfile(dat/'validation.json',stats)
print(json.dumps(stats,ensure_ascii=False))
