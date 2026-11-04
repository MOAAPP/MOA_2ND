/**
 * One shared set of synthetic observation records for demo / frontend.
 * Future truth lives in datasets/moa-fall-2026 and is NEVER imported here.
 */

import { emptyMoa, type MoaCard, type MoaSchedule, type MoaState, type PayMethod, type Txn } from './moa/types';
import { profileFromMoa } from './moa/bridge';
import type { SpendEntry } from './ml/types';
import type { WorldDecision, WorldMovement, WorldWallet } from './worldWallet';

type TransactionRow = {
  id: string; user_id: string; date: string; occurred_at: number; kind: string;
  name: string; category: string; amount_krw: number; method: string;
  essential: boolean; observed: number;
};
type ProfileRow = {
  user_id: string; segment: string; scenario: string;
  balance_as_of: number; daily_spend_prior: number; observed_count: number;
  schedule: Array<{id: string; name: string; direction: string; amount: number; day: number; essential: boolean}>;
};
type Snapshot = {dataset_id: string; as_of: string; synthetic: true; profiles: ProfileRow[]; transactions: TransactionRow[]};

/** These labels are deliberately tiny; all financial observations live in the compressed static fixture. */
const SCENARIOS = [
  ['U01','자취 대학생','월세 직전 부족'],['U02','통학 대학생','교통·카페 반복'],
  ['U03','자취 대학생','급여 3일 지연'],['U04','취업 준비생','수입 없는 기간'],
  ['U05','아르바이트 대학생','돌발 지출'],['U06','사회 초년생','신용카드 청구 변동'],
  ['U07','사회 초년생','급여 후 적금'],['U08','프리랜서','불규칙 수입'],
  ['U09','자취 대학생','식비 집중'],['U10','통학 대학생','낮은 부족 위험'],
] as const;
export const FALL_DATASET_ID = 'moa-synthetic-fall-2026-v1';
export const FALL_DATASET_AS_OF = '2026-11-03';
export const fallDemoProfiles = () => SCENARIOS.map(([id,title,scenario]) => ({id,title,scenario}));

let cache: Promise<Snapshot> | null = null;
/** Only observed history is delivered to the browser: never fetch future truth in production. */
export function loadFallObserved(): Promise<Snapshot> {
  if (!cache) {
    cache = (async () => {
      const url = import.meta.env.BASE_URL + 'data/moa-fall-observed.json.gz';
      const response = await fetch(url);
      if (!response.ok) throw new Error('가상 거래 데이터 파일을 불러오지 못했어요.');
      if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 압축 데이터 읽기를 지원하지 않아요.');
      const stream = response.body;
      if (!stream) throw new Error('가상 거래 데이터를 읽지 못했어요.');
      const decoded = stream.pipeThrough(new DecompressionStream('gzip'));
      const parsed = JSON.parse(await new Response(decoded).text()) as Snapshot;
      if (parsed.dataset_id !== FALL_DATASET_ID || parsed.as_of !== FALL_DATASET_AS_OF || !parsed.synthetic) {
        throw new Error('가상 거래 데이터 버전이 맞지 않아요.');
      }
      if (parsed.transactions.some((r) => r.date > parsed.as_of || !r.observed)) {
        throw new Error('미래 거래가 체험 데이터에 섞여 있어요.');
      }
      return parsed;
    })().catch((error: unknown) => { cache = null; throw error; });
  }
  return cache;
}

const at = (date: string, hour = 12) => Date.parse(date + 'T' + String(hour).padStart(2, '0') + ':00:00+09:00');
const cutoffAt = () => Date.parse(FALL_DATASET_AS_OF + 'T23:59:59+09:00');

function transaction(row: TransactionRow, data: Snapshot): Txn {
  const method: PayMethod = row.method === 'credit' || row.method === 'cash' || row.method === 'debit' ? row.method : 'transfer';
  const kind: Txn['kind'] = row.kind === 'income' ? 'income' : row.kind === 'card_payment' ? 'card_payment' : row.kind === 'fixed' && row.category === '저축' ? 'saving' : 'spend';
  return {
    id: row.id, occurredAt: row.occurred_at, date: row.date, amount: row.amount_krw,
    kind, method, account: method === 'credit' ? 'other' : method === 'cash' ? 'cash' : 'pay',
    cardId: method === 'credit' || row.kind === 'card_payment' ? 'fall-credit' : method === 'debit' ? 'fall-debit' : undefined,
    name: row.name, category: row.category, essential: row.essential,
    source: 'demo', createdAt: row.occurred_at,
    scheduleRef: row.kind === 'fixed'
      ? (data.profiles.find((p) => p.user_id === row.user_id)?.schedule.find((x) => x.direction === 'out' && x.name === row.name)?.id ?? '') + ':' + row.date
      : undefined,
  };
}

function makeWorldWallet(person: ProfileRow, rows: TransactionRow[]): WorldWallet {
  // Ledger events and virtual counterfactual decisions are distinct concepts.
  // The comparison is an explicitly fictional playthrough, not proof of real savings.
  const decisions: WorldDecision[] = rows.filter((r) => r.kind === 'spend' && !r.essential && r.method === 'debit')
    .filter((_, i) => i % 9 === 0).slice(-16)
    .map((r, i) => ({
      id: 'fall-choice-' + r.id, title: r.name, price: r.amount_krw,
      paid: i % 3 === 0 ? 0 : i % 3 === 1 ? Math.round(r.amount_krw * 0.65) : r.amount_krw,
      choice: i % 3 === 0 ? 'wait' : i % 3 === 1 ? 'alternative' : 'buy',
      at: r.occurred_at, note: '가상 소비 선택 비교용 시나리오',
    }));
  const movements: WorldMovement[] = rows.filter((r) =>
    r.kind === 'income' || r.kind === 'fixed' || r.kind === 'card_payment')
    .map((r) => ({
      id: 'fall-move-' + r.id, kind: r.kind === 'income' ? 'income' : 'bills',
      amount: r.amount_krw, at: r.occurred_at, memo: r.name,
    }));
  return { cash: person.balance_as_of, savings: 0, deposit: 0, installment: 0, etfs: {}, decisions, movements };
}

export async function makeFallDemo(profileId = 'U03') {
  const data = await loadFallObserved();
  const person = data.profiles.find((p) => p.user_id === profileId) ?? data.profiles.find((p) => p.user_id === 'U03')!;
  const rows = data.transactions.filter((r) => r.user_id === person.user_id && r.date <= data.as_of && r.observed === 1)
    .sort((a, b) => a.occurred_at - b.occurred_at);
  const cards: MoaCard[] = [
    { id: 'fall-credit', name: '체험용 신용카드', kind: 'credit', linked: false, cutoffDay: 31, payDay: 14 },
    { id: 'fall-debit', name: '체험용 체크카드', kind: 'debit', linked: true },
  ];
  const schedule: MoaSchedule[] = person.schedule.map((x) => ({
    id: x.id, name: x.name, direction: x.direction as 'in' | 'out',
    amount: x.amount, recurrence: 'monthly', day: x.day,
    essential: x.essential,
    status: x.direction === 'in' ? 'scheduled' : undefined,
    saving: x.direction === 'out' && x.name.includes('적금'),
  }));
  const moa: MoaState = {
    ...emptyMoa(),
    anchor: { balance: person.balance_as_of, at: cutoffAt(), source: 'manual', reflected: [] },
    payAccountName: '가상 결제계좌',
    cards, schedule, txns: rows.map((r) => transaction(r, data)), dayStatus: {},
    mainMethod: 'debit',
  };
  const profile = { ...profileFromMoa(moa, null), dailySpend: person.daily_spend_prior, minBalance: 100_000 };
  const spendLog: SpendEntry[] = rows.filter((r) => r.kind === 'spend' && !r.essential)
    .map((r) => ({ date: r.date, name: r.name, amount: r.amount_krw, category: r.category, from: 'demo', txnId: r.id }));
  return { profile, spendLog, records: [], moa, worldWallet: makeWorldWallet(person, rows), demoProfileId: person.user_id };
}
