/**
 * Map the canonical FastAPI 20-persona read-only demo dataset into the
 * existing mobile frontend's store shape. No UI/CSS and no private data.
 *
 * Account snapshot is authoritative. Historical transaction rows are for
 * display only (sample/balanceApplied=false), never debited a second time.
 */
export type DemoUserId = 'S01' | 'S08';
export const DEMO_AS_OF = '2026-11-04';

export interface DemoHome {
  user_id: string;
  as_of_date: string;
  is_synthetic: boolean;
  available_cash: number;
}

export interface DemoTransaction {
  id: string;
  user_id: string;
  date: string;
  kind: string;
  amount: number;
  name: string;
  category?: string;
  method?: string;
  status?: string;
  logged?: boolean;
  direction?: 'in' | 'out';
  occurred_at?: number | string;
  future_scenario?: boolean;
}

export interface DemoLedger {
  user_id: string;
  as_of_date: string;
  total: number;
  transactions: DemoTransaction[];
}

export interface DemoSchedule {
  id: string;
  user_id: string;
  name: string;
  direction: 'in' | 'out';
  amount: number;
  recurrence: string;
  day: number;
  kind?: string;
  essential?: boolean;
  status?: string;
}

export interface DemoPendingCard {
  id: string;
  user_id: string;
  due_date: string;
  amount: number;
  status: string;
  future_scenario?: boolean;
}

export interface DemoSchedules {
  user_id: string;
  as_of_date: string;
  schedules: DemoSchedule[];
  pending_card_liabilities: DemoPendingCard[];
}

export type DemoTx = {
  id: string;
  type: 'expense' | 'income' | 'transfer';
  amount: number;
  title: string;
  category: string;
  payment: string;
  date: string;
  time?: string;
  sample: true;
  balanceApplied: false;
};

export type DemoBill = {
  id: string;
  name: string;
  amount: number;
  day: number;
  kind: 'card' | 'rent' | 'phone' | 'subscription' | 'loan' | 'etc';
};

const categories: Record<string, string> = {
  '카페': '카페/간식', '생활': '생활/마트', '의료': '의료/건강',
  '학업': '기타', '식비': '식비', '교통': '교통',
  '쇼핑': '쇼핑', '카페/간식': '카페/간식',
  '생활/마트': '생활/마트', '의료/건강': '의료/건강',
  '디지털/가전': '디지털/가전', '기타': '기타',
};

function timeOf(value?: number | string) {
  if (value === undefined || value === null) return undefined;
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) return undefined;
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(d);
}

function paymentOf(method: string | undefined) {
  if (method === 'credit') return '신용카드 (청구일 출금)';
  if (method === 'cash') return '현금';
  if (method === 'transfer') return '계좌이체 (직접 이체)';
  return '체크카드 (즉시 출금)';
}

function billKind(kind: string | undefined): DemoBill['kind'] {
  if (kind === 'rent') return 'rent';
  if (kind === 'phone') return 'phone';
  if (kind === 'subscription') return 'subscription';
  if (kind === 'loan') return 'loan';
  if (kind === 'card' || kind === 'card_payment') return 'card';
  return 'etc';
}

/** Reject stale, partial or non-synthetic responses. Never silently mix people. */
export function mapDemoSnapshot(
  user: DemoUserId, home: DemoHome, ledger: DemoLedger, schedules: DemoSchedules,
): { balance: number; salary: number; payday: number; txs: DemoTx[]; bills: DemoBill[] } {
  if (home.user_id !== user || ledger.user_id !== user || schedules.user_id !== user ||
      home.as_of_date !== DEMO_AS_OF || ledger.as_of_date !== DEMO_AS_OF ||
      schedules.as_of_date !== DEMO_AS_OF || home.is_synthetic !== true ||
      !Number.isFinite(home.available_cash)) {
    throw new Error('demo_backend_identity_or_snapshot_mismatch');
  }
  if (!Array.isArray(ledger.transactions) || !Number.isInteger(ledger.total) ||
      ledger.total !== ledger.transactions.length ||
      !Array.isArray(schedules.schedules) || !Array.isArray(schedules.pending_card_liabilities)) {
    throw new Error('demo_backend_partial_or_invalid_dataset');
  }
  if (ledger.transactions.some(t => t.user_id !== user) ||
      schedules.schedules.some(s => s.user_id !== user) ||
      schedules.pending_card_liabilities.some(c => c.user_id !== user)) {
    throw new Error('demo_backend_cross_user_data');
  }

  const txs: DemoTx[] = ledger.transactions
    .filter(t => t.date <= DEMO_AS_OF && t.future_scenario !== true &&
      t.status === 'confirmed_synthetic' && t.logged !== false &&
      (t.kind === 'spend' || t.kind === 'income') &&
      Number.isFinite(t.amount) && t.amount >= 0)
    // Card bills were already backed by credit purchases; showing them as
    // another expense would double-count the monthly spending total.
    // Internal emergency transfers are also excluded from spending.
    .map(t => ({
      id: t.id,
      type: t.kind === 'income' ? 'income' as const : 'expense' as const,
      amount: t.amount,
      title: t.name,
      category: t.kind === 'income' ? '급여' : (categories[t.category || ''] || '기타'),
      payment: paymentOf(t.method),
      date: t.date,
      time: timeOf(t.occurred_at),
      sample: true as const,
      balanceApplied: false as const,
    }))
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id));

  const scheduledSalary = schedules.schedules.find(s => s.direction === 'in' &&
    s.recurrence === 'monthly' && s.status !== 'uncertain' &&
    (s.kind === 'salary' || /월급|급여|알바비/.test(s.name)) &&
    Number.isInteger(s.day) && s.day >= 1 && s.day <= 31 &&
    Number.isFinite(s.amount) && s.amount >= 0);

  const bills: DemoBill[] = schedules.schedules
    .filter(s => s.direction === 'out' && s.essential === true &&
      s.recurrence === 'monthly' && s.status !== 'uncertain' &&
      Number.isInteger(s.day) && s.day >= 1 && s.day <= 31 &&
      Number.isFinite(s.amount) && s.amount > 0)
    .map(s => ({ id: s.id, name: s.name, amount: s.amount, day: s.day,
      kind: billKind(s.kind) }));

  // Include only already-confirmed pending bills; never import the dataset's
  // scenario-only future card liabilities as actual due payments.
  for (const card of schedules.pending_card_liabilities) {
    if (card.future_scenario === true || card.status !== 'scheduled_unpaid' ||
        !Number.isFinite(card.amount) || card.amount <= 0 ||
        typeof card.due_date !== 'string' ||
        card.due_date <= DEMO_AS_OF) continue;
    const day = Number(card.due_date.slice(8, 10));
    if (!Number.isInteger(day) || day < 1 || day > 31) continue;
    if (!bills.some(b => b.id === card.id)) {
      bills.push({ id: card.id, name: '카드값', amount: card.amount, day, kind: 'card' });
    }
  }
  return {
    balance: home.available_cash,
    salary: scheduledSalary?.amount ?? 0,
    payday: scheduledSalary?.day ?? 25,
    txs, bills,
  };
}
