/**
 * Shared account-ledger post-processor.
 *
 * Requirements:
 * - Every one of the 20 users has >=5 variable purchases on EVERY calendar day.
 * - On or before snapshot date those >=5 purchases are visibly logged.
 * - After snapshot they are explicit hypothetical future transactions (logged=false).
 * - Monthly card bills debit the payment account only on their next pay date.
 * - End-of-day account balances carry continuously from profile.opening_balance.
 *
 * No fake observed future data, no random dates, no database.
 */
export function normalizeDailyLedger(data) {
  const snapshot = data.metadata.snapshot_date;
  const startDate = data.metadata.start_date;
  const endDate = data.metadata.end_date;
  const templates = [
    ['식비', '아침 샌드위치', 4800, 'debit'],
    ['교통', '시내버스', 1500, 'debit'],
    ['식비', '학식 점심', 6500, 'debit'],
    ['카페', '아이스 아메리카노', 3500, 'debit'],
    ['생활', '문구점 필기구', 3100, 'debit'],
    ['식비', '저녁 도시락', 5900, 'debit'],
    ['교통', '지하철', 1500, 'debit'],
    ['식비', '편의점 간식', 2900, 'debit'],
    ['식비', '점심 국밥', 9000, 'debit'],
    ['카페', '카페 라떼', 5200, 'debit'],
    ['생활', '세제 리필', 3500, 'debit'],
    ['식비', '김밥 한 줄', 4500, 'debit'],
    ['식비', '간단 장보기', 8900, 'debit'],
    ['문화·여가', '웹툰 대여', 3300, 'debit'],
    ['교통', '버스 환승', 1500, 'debit'],
    ['식비', '분식 저녁', 6200, 'debit'],
    ['카페', '아이스티', 3800, 'debit'],
    ['생활', '노트·볼펜', 2600, 'debit'],
    ['식비', '포장 식사', 9500, 'debit'],
    ['식비', '편의점 음료', 2000, 'debit'],
    ['문화·여가', '전자책 대여', 3200, 'debit'],
    ['생활', '세탁세제', 4800, 'debit'],
    ['식비', '아침 빵', 3600, 'debit'],
    ['교통', '마을버스', 1200, 'debit'],
  ];
  const at = (date, h, m = 0) =>
    Date.parse(date + 'T' + String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0') + ':00+09:00');
  const isPayOut = t => (t.kind === 'spend' || t.kind === 'card_payment') &&
    (t.method === 'debit' || t.method === 'transfer' || t.method === 'atm') && t.account === 'pay';
  const sum = xs => xs.reduce((s, x) => s + x.amount, 0);

  for (let pi = 0; pi < data.profiles.length; pi++) {
    const p = data.profiles[pi];
    const id = p.user_id;
    const days = data.daily.filter(d => d.user_id === id).sort((a, b) => a.date.localeCompare(b.date));
    if (days.length !== 92) throw new Error('Expected exactly 92 daily observations: ' + id);
    let txs = data.transactions.filter(t => t.user_id === id && t.kind !== 'transfer_self' && t.kind !== 'card_payment');
    let seq = Math.max(...data.transactions.filter(t => t.user_id === id).map(t => Number(t.id.split('-T')[1])));
    const add = (date, kind, amount, name, category, method, essential, extra = {}, logged = date <= snapshot, h = 12) => {
      const future = date > snapshot;
      const t = {
        id: id + '-T' + String(++seq).padStart(4, '0'),
        user_id: id,
        date, occurred_at: at(date, h, seq % 60),
        kind, amount, name, category, method,
        account: method === 'cash' ? 'cash' : method === 'credit' ? 'other' : 'pay',
        essential, logged: !future && logged, source: 'synthetic',
        phase: future ? 'future_scenario' : 'historical_synthetic',
        future_scenario: future, ...extra,
      };
      txs.push(t);
      return t;
    };

    // Preserve the existing person's spending pattern and supplement only the
    // short days. Five *visible* historical variable purchases, not just 5
    // oracle rows or an artificial "no-spend" click.
    for (let dayIndex = 0; dayIndex < days.length; dayIndex++) {
      const d = days[dayIndex];
      const observed = txs.filter(t => t.date === d.date && t.kind === 'spend' &&
        !t.essential && (d.date > snapshot || t.logged)).length;
      const missing = Math.max(0, 5 - observed);
      const usedNames = new Set(txs.filter(t => t.date === d.date).map(t => t.name));
      let n = 0;
      for (let j = 0; j < missing; j++) {
        let item;
        for (let seek = 0; seek < templates.length; seek++) {
          const pick = templates[(dayIndex + pi * 3 + j + seek) % templates.length];
          if (!usedNames.has(pick[1])) { item = pick; break; }
        }
        item ??= templates[(dayIndex + pi + j) % templates.length];
        const [category, name, rawAmount, method] = item;
        usedNames.add(name);
        // Deterministic, believable small expenditures. 2026-11-04 includes
        // five purchases occurring during the day for the launch demo.
        const amount = rawAmount + ((dayIndex + pi + j) % 3) * 100;
        const hour = [8, 9, 10, 11, 12][j % 5];
        add(d.date, 'spend', amount, name, category, method, false,
          { event: 'daily_realistic_spend' }, true, hour);
        n++;
      }
      if (n !== missing) throw new Error('Daily top-up failed: ' + id + ':' + d.date);
    }

    // Keep the main presentation day's five purchases distinct and useful.
    // The original random sample happened to repeat the generic "생활용품"
    // label twice, hiding category diversity in the first screen.
    if (id === 'S01') {
      const onSnapshot = txs.filter(t => t.date === snapshot && t.kind === 'spend' &&
        t.name === '생활용품').sort((a, b) => a.id.localeCompare(b.id));
      if (onSnapshot.length > 1) {
        onSnapshot[0].name = '수업용 필기구';
        onSnapshot[0].category = '학업';
      }
    }

    // Statement cutoff is the last day of the purchase month, payment the 14th
    // of the following month. Previously-created bills are discarded and
    // reconstructed once from the *actual* credit purchases for all personas.
    for (const month of ['2026-09', '2026-10', '2026-11']) {
      const [year, m] = month.split('-').map(Number);
      const billMonth = m === 12 ? 1 : m + 1;
      const billYear = m === 12 ? year + 1 : year;
      const payDate = billYear + '-' + String(billMonth).padStart(2, '0') + '-14';
      if (payDate < startDate || payDate > endDate) continue;
      const amount = sum(txs.filter(t => t.kind === 'spend' && t.method === 'credit' && t.date.startsWith(month)));
      if (amount > 0) add(payDate, 'card_payment', amount, month.slice(5) + '월 신용카드 청구액',
        '카드대금', 'transfer', true, { event: 'credit_settlement', card_id: 'demo_credit' }, true, 19);
    }

    let balance = p.opening_balance;
    for (const d of days) {
      const current = txs.filter(t => t.date === d.date);
      const incomes = sum(current.filter(t => t.kind === 'income'));
      const outgoing = sum(current.filter(isPayOut));
      const beforeRescue = balance + incomes - outgoing;
      // A transfer from an unspecified other simulated account is NOT salary
      // or an extra purchase; preserve it as a distinct source of liquidity.
      const rescue = beforeRescue < 0 ? Math.ceil((-beforeRescue + 50000) / 10000) * 10000 : 0;
      if (rescue) add(d.date, 'transfer_self', rescue, '가상 비상자금 이체', '이체',
        'transfer', false, { direction: 'in', event: 'liquidity_rescue' }, true, 20);
      balance = beforeRescue + rescue;
      const variable = current.filter(t => t.kind === 'spend' && !t.essential);
      const visible = variable.filter(t => t.logged);
      const complete = d.date <= snapshot && variable.length === visible.length;
      const truth = sum(variable);
      d.known_zero_spend = false;
      d.observation_complete = complete;
      d.true_variable_spend = truth;
      d.observed_variable_spend = sum(visible);
      d.model_label = complete ? truth : null;
      d.observed_count = visible.length;
      d.missing_count = variable.length - visible.length;
      d.income_in = incomes;
      d.account_out = outgoing;
      d.pre_rescue_balance = beforeRescue;
      d.emergency_transfer_in = rescue;
      d.account_balance_eod = balance;
      if (variable.length < 5 || (d.date <= snapshot && visible.length < 5)) {
        throw new Error('Fewer than five daily spends: ' + id + ':' + d.date);
      }
    }

    // Update only one person's rows. Deleting and rebuilding rescue and credit
    // lines ensures there are no hidden stale corrections or duplicate bills.
    txs = txs.sort((a, b) => a.date.localeCompare(b.date) ||
      a.occurred_at - b.occurred_at || a.id.localeCompare(b.id));
    data.transactions = [...data.transactions.filter(t => t.user_id !== id), ...txs];
  }
  data.metadata.minimum_daily_variable_transactions = 5;
  data.metadata.daily_transaction_visibility = 'five_observed_through_snapshot;future_scenarios_unobserved';
  data.metadata.ledger_version = '3';
  data.metadata.card_settlement_policy = 'purchase_month_end_to_next_month_14';
  if (new Set(data.transactions.map(t => t.id)).size !== data.transactions.length)
    throw new Error('Duplicate transaction ids after reconciliation');
  return data;
}
