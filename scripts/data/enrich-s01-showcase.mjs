/**
 * S01 is the presentation persona, intentionally richer than the other 19 profiles.
 * This is an overlay after generation so S02..S20 remain byte-identical in all
 * fields. Rebuild the S01 account ledger from the opening balance rather than
 * editing end-of-day balances, which would silently break the 10/26 -> 10/27 handoff.
 */
export function enrichShowcaseS01(data) {
  const id = 'S01', cutoff = data.metadata.snapshot_date;
  const profile = data.profiles.find(p => p.user_id === id);
  if (!profile) throw new Error('Missing showcase profile S01');
  profile.description = '시연용 · 혼합소득·고정결제·카드 청구·돌발지출·ETF·선택 비교';
  profile.scenario = 'showcase';
  // Main payday stays scheduled, so the risk engine can model a 3-day delay.
  profile.schedule.push(
    { id: 'S01-maint', name: '관리비', direction: 'out', amount: 45000, recurrence: 'monthly', day: 27, essential: true },
    { id: 'S01-insurance', name: '보험료', direction: 'out', amount: 19000, recurrence: 'monthly', day: 8, essential: true },
    { id: 'S01-side-income', name: '과외비', direction: 'in', amount: 120000, recurrence: 'monthly', day: 19, essential: false, status: 'uncertain' },
  );
  const stamp = (date, hour, minute = 0) => Date.parse(date + 'T' + String(hour).padStart(2,'0') + ':' + String(minute).padStart(2,'0') + ':00+09:00');
  let counter = Math.max(...data.transactions.filter(t => t.user_id === id).map(t => Number(t.id.split('-T')[1])));
  const mainTransactions = data.transactions.filter(t => t.user_id === id && t.kind !== 'transfer_self');
  const add = (date, kind, amount, name, category, method, essential, options = {}) => {
    const future = date > cutoff;
    const t = {
      id: id + '-T' + String(++counter).padStart(4,'0'),
      user_id:id, date, occurred_at:stamp(date, kind === 'income' ? 9 : 12, counter % 60),
      kind, amount, name, category, method,
      account:method === 'cash' ? 'cash' : method === 'credit' ? 'other' : 'pay',
      essential, logged:!future, source:'synthetic',
      phase:future ? 'future_scenario' : 'historical_synthetic', future_scenario:future,
      ...options,
    };
    if (future) t.logged = false;
    mainTransactions.push(t);
    return t;
  };

  // The expected salary date is the 10th; November's payment actually lands
  // on the 13th. It must not appear as 11/10 cash in the historical ledger.
  const delayedSalary = mainTransactions.find(t => t.kind === 'income' && t.date === '2026-11-10' && t.name === '알바비 입금');
  if (!delayedSalary) throw new Error('Expected S01 November salary event');
  delayedSalary.date = '2026-11-13';
  delayedSalary.occurred_at = stamp('2026-11-13',9);
  delayedSalary.logged = false; // future as of 2026-11-04
  delayedSalary.phase = 'future_scenario';
  delayedSalary.future_scenario = true;
  delayedSalary.income_delayed_days = 3;
  delayedSalary.event = 'salary_arrived_3_days_late';

  // Repeating bills and a small second income stream create an actionable
  // upcoming-payment calendar, rather than unrelated random spending.
  for (const month of ['2026-09','2026-10','2026-11','2026-12']) {
    if (month + '-08' >= data.metadata.start_date && month + '-08' <= data.metadata.end_date)
      add(month + '-08', 'spend', 19000, '보험료', '보험', 'transfer', true, { schedule_ref:'S01-insurance:' + month + '-08', event:'recurring_insurance' });
    if (month + '-27' >= data.metadata.start_date && month + '-27' <= data.metadata.end_date)
      add(month + '-27', 'spend', 45000, '관리비', '주거', 'transfer', true, { schedule_ref:'S01-maint:' + month + '-27', event:'recurring_maintenance' });
    if (month !== '2026-12') add(month + '-19', 'income', 120000, '과외비 입금', '수입', 'transfer', false, { schedule_ref:'S01-side-income:' + month + '-19', event:'side_income' });
  }
  const events = [
    ['2026-09-17','spend',72000,'실습 재료 구입','학업','debit',false,'course_materials'],
    ['2026-09-28','spend',84000,'콘서트 티켓','문화·여가','credit',false,'card_purchase'],
    ['2026-10-02','spend',149000,'무선 이어폰','쇼핑','credit',false,'card_purchase'],
    ['2026-10-06','spend',38000,'동아리 행사 준비','생활','debit',false,'club_event'],
    ['2026-10-12','spend',79000,'온라인 강의','학업','credit',false,'card_purchase'],
    ['2026-10-16','income',45000,'중고거래 판매','수입','transfer',false,'secondhand_sale'],
    ['2026-10-24','spend',225000,'노트북 긴급 수리','생활','debit',false,'unexpected_expense'],
    ['2026-10-29','spend',119000,'겨울 점퍼','쇼핑','credit',false,'card_purchase'],
    ['2026-11-02','spend',38500,'시험 문제집','학업','debit',false,'exam_materials'],
    ['2026-11-03','spend',118000,'치과 진료','건강','debit',false,'unexpected_expense'],
    ['2026-11-06','spend',57000,'교통 정기권','교통','debit',false,'monthly_pass'],
    ['2026-11-09','spend',82000,'갑작스러운 행사 참가','문화·여가','debit',false,'unexpected_expense'],
    ['2026-11-12','spend',24000,'늦은 귀가 택시','교통','debit',false,'late_taxi'],
    ['2026-11-20','spend',59000,'친구 생일 선물','쇼핑','debit',false,'gift'],
    ['2026-11-29','spend',178000,'겨울 여행 예약','문화·여가','credit',false,'card_purchase'],
    ['2026-12-01','spend',70000,'학기 마무리 준비','학업','debit',false,'exam_materials'],
    ['2026-12-05','spend',62000,'연말 모임','문화·여가','credit',false,'card_purchase'],
    ['2026-12-09','spend',87000,'겨울 난방비','주거','transfer',true,'winter_heating'],
  ];
  for (const [date,kind,amount,name,category,method,essential,event] of events)
    add(date,kind,amount,name,category,method,essential,{event});

  // Credit purchases affect the consumption breakdown on purchase date, but
  // the settlement debits only the following month's payment account.
  // The November generator may already have an automatic settlement; replace
  // its amount instead of inserting a duplicate bill.
  for (const [month,due] of [['2026-09','2026-10-14'],['2026-10','2026-11-14']]) {
    const charged = mainTransactions.filter(t => t.kind === 'spend' && t.method === 'credit' && t.date.startsWith(month)).reduce((s,t)=>s+t.amount,0);
    const existing = mainTransactions.find(t => t.kind === 'card_payment' && t.date === due);
    if (existing) { existing.amount = charged; existing.event = 'credit_settlement'; }
    else if (charged > 0) add(due,'card_payment',charged,month.slice(5)+'월 신용카드 청구액','카드대금','transfer',true,{event:'credit_settlement'});
  }

  // Explicitly show incomplete observation. These purchases exist in the
  // synthetic oracle but MUST NOT appear in the app's past spending log.
  for (const date of ['2026-10-23','2026-11-02']) {
    const candidate = mainTransactions.find(t => t.date === date && t.kind === 'spend' && !t.essential);
    if (candidate) candidate.logged = false;
  }

  // Recalculate every one of S01's 92 daily rows with an end-of-day account
  // carry, including shortfalls and explicit synthetic emergency transfers.
  mainTransactions.sort((a,b)=>a.date.localeCompare(b.date)||a.occurred_at-b.occurred_at||a.id.localeCompare(b.id));
  let balance = profile.opening_balance;
  const days = data.daily.filter(d => d.user_id === id).sort((a,b)=>a.date.localeCompare(b.date));
  for (const d of days) {
    const tx = mainTransactions.filter(t => t.date === d.date);
    const income = tx.filter(t=>t.kind === 'income').reduce((s,t)=>s+t.amount,0);
    const out = tx.filter(t => (t.kind === 'spend' || t.kind === 'card_payment') && ['debit','transfer','atm'].includes(t.method)).reduce((s,t)=>s+t.amount,0);
    const preRescue = balance + income - out;
    const rescue = preRescue < 0 ? Math.ceil((-preRescue+50000)/10000)*10000 : 0;
    if (rescue) {
      const r = add(d.date,'transfer_self',rescue,'가상 비상자금 이체','이체','transfer',false,{direction:'in',event:'liquidity_rescue'});
      // This is an external rescue transfer, not salary, a loan, or earned income.
      r.occurred_at = stamp(d.date,21);
    }
    balance = preRescue + rescue;
    const variable = tx.filter(t=>t.kind === 'spend'&&!t.essential);
    const observed = variable.filter(t=>t.logged);
    const complete = d.date <= cutoff && variable.every(t=>t.logged);
    d.known_zero_spend = variable.length === 0;
    d.observation_complete = complete;
    d.true_variable_spend = variable.reduce((s,t)=>s+t.amount,0);
    d.observed_variable_spend = observed.reduce((s,t)=>s+t.amount,0);
    d.model_label = complete ? d.true_variable_spend : null;
    d.observed_count = observed.length;
    d.missing_count = variable.length - observed.length;
    d.income_in = income;
    d.account_out = out;
    d.pre_rescue_balance = preRescue;
    d.emergency_transfer_in = rescue;
    d.account_balance_eod = balance;
  }
  data.transactions = [...data.transactions.filter(t=>t.user_id!==id), ...mainTransactions.sort((a,b)=>a.date.localeCompare(b.date)||a.occurred_at-b.occurred_at||a.id.localeCompare(b.id))];

  // The virtual fork is intentionally a separate hypothetical wallet:
  // a decision is not a second real bank debit. Buy/wait/alternative events
  // are all present, with the 11/04 snapshot preventing future leakage.
  const mainChoices = data.choices.filter(c=>c.user_id===id);
  const choiceEvents = [
    ['2026-09-13','배달 야식',23000,0,'wait'],
    ['2026-09-22','작업용 키보드',85000,85000,'buy'],
    ['2026-10-04','택시 대신 버스',14800,1500,'alternative'],
    ['2026-10-24','고가 헤드폰',249000,0,'wait'],
    ['2026-10-29','편의점 커피 대신 집 커피',4900,700,'alternative'],
    ['2026-11-01','배달 떡볶이',18000,0,'wait'],
    ['2026-11-03','취업 준비 온라인 특강',49000,49000,'buy'],
    ['2026-11-06','새 스마트워치',289000,0,'wait'],
    ['2026-11-21','주말 카페 vs 텀블러',8500,1200,'alternative'],
    ['2026-12-02','겨울 아우터',149000,95000,'alternative'],
  ];
  for (let i=0;i<choiceEvents.length;i++) {
    const [date,item,price,paid,choice] = choiceEvents[i], future = date > cutoff;
    mainChoices.push({id:'S01-SHOW-D'+String(i+1).padStart(2,'0'),user_id:id,date,at:stamp(date,19),
      item,price,paid,choice,source:'synthetic',phase:future?'future_scenario':'historical_synthetic',future_scenario:future});
  }
  data.choices = [...data.choices.filter(c=>c.user_id!==id),...mainChoices.sort((a,b)=>a.date.localeCompare(b.date)||a.at-b.at)];

  // Multi-ETF buys/sells with position_after verified independently by code.
  const mainInvestments = data.investments.filter(t=>t.user_id===id);
  const investEvents = [
    ['2026-09-16','buy','069500','KODEX 200',2,37000],
    ['2026-09-30','sell','069500','KODEX 200',1,37700],
    ['2026-10-05','buy','360750','TIGER 미국S&P500',2,25900],
    ['2026-10-26','sell','069500','KODEX 200',1,38900],
    ['2026-11-03','buy','069500','KODEX 200',1,39000],
    ['2026-11-19','buy','360750','TIGER 미국S&P500',1,27800],
    ['2026-11-27','sell','069500','KODEX 200',1,40100],
  ];
  for (let i=0;i<investEvents.length;i++) {
    const [date,side,code,name,qty,price]=investEvents[i],future=date>cutoff;
    mainInvestments.push({id:'S01-SHOW-I'+String(i+1).padStart(2,'0'),user_id:id,date,at:stamp(date,14),
      side,code,name,qty,price,status:'filled',position_after:0,
      source:'synthetic',simulated_wallet_only:true,phase:future?'future_scenario':'historical_synthetic',future_scenario:future});
  }
  mainInvestments.sort((a,b)=>a.date.localeCompare(b.date)||a.at-b.at||a.id.localeCompare(b.id));
  const position = new Map();
  for (const t of mainInvestments) {
    const next=(position.get(t.code)||0)+(t.side==='buy'?t.qty:-t.qty);
    if(next<0)throw new Error('Negative ETF position: '+t.id);
    position.set(t.code,next);
    t.position_after=next;
  }
  data.investments=[...data.investments.filter(t=>t.user_id!==id),...mainInvestments];
  data.metadata.showcase_user_id=id;
  data.metadata.showcase_note='S01 includes linked synthetic income delay, card settlement, bills, shortfalls, choices and ETF journal; S02-S20 unchanged.';
  return data;
}

