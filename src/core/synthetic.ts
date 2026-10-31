/**
 * 합성 사용자 10명 (기획서 '합성 사용자 10명 만드는 법', 명세 S01~S10).
 *
 * 시뮬레이터 설정값이며 실제 인물 통계가 아니다. 사용자 테스트 인원에 넣지 않는다.
 * 거래는 코드로 만든다(시드 고정). 시뮬레이터가 실제 잔고 경로를 알기 때문에
 * '필수결제일에 결제계좌 돈이 부족했던 날'이 정답 라벨로 정확히 남는다.
 * 기록(사용자가 붙여넣은 것)과 진짜 거래는 다를 수 있다 — S10은 일부 기록이 빠진다.
 */
import { addDays, type ISODate } from '../../shared/dates';
import { latestAnchor, projectBalance } from './balance';
import { buildLedger } from './ledger';
import { occurrences } from './schedule';
import { dateRange, kstDate, kstStart, weekday } from './time';
import type { BalanceObservation, Card, DayStatus, FixedItem, IncomeSchedule, Txn, UserSetup } from './types';

export const SYN_START: ISODate = '2026-08-01';
export const SYN_DAYS = 90;

export function rng(seed: number) {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const normal = () => Math.sqrt(-2 * Math.log(1 - next())) * Math.cos(2 * Math.PI * next());
  return { next, normal, pick: <T>(xs: T[]) => xs[Math.floor(next() * xs.length)] };
}

const PAY = 'pay';
const SAVE = 'save';

interface ActualIncome {
  name: string;
  date: ISODate;
  amount: number;
  /** 사용자가 등록한 일정 (없으면 미등록 입금) */
  schedule?: IncomeSchedule;
  /** 예정일보다 늦게 들어온 일수 */
  delay?: number;
}

export interface Persona {
  id: string;
  type: string;
  tests: string;
  seed: number;
  opening: number;
  /** 하루 평균 변동 지출 (원) */
  dailyMean: number;
  shares: { account: number; credit: number; cash: number };
  fixed: FixedItem[];
  /** 등록은 하지 않았지만 실제로 빠지는 고정 출금 (잊은 구독 등) */
  hiddenFixed?: FixedItem[];
  incomes: (r: ReturnType<typeof rng>) => ActualIncome[];
  /** 돌발 지출 */
  shocks?: { date: ISODate; amount: number; method: 'debit' | 'credit' }[];
  /** 기록이 빠진 날 */
  missingDays?: ISODate[];
  /** 잔액이 찍힌 문자 비율 */
  balanceSmsRate: number;
  /** 입금 직후 몰아쓰기 배수 */
  burstAfterIncome?: number;
  cardPayDay?: number;
}

const monthly = (id: string, name: string, amount: number, day: number, essential = true, kind: FixedItem['kind'] = 'other'): FixedItem => ({ id, name, amount, accountId: PAY, recurrence: 'monthly', day, essential, kind });
const sched = (id: string, name: string, amount: number, day: number, certainty: IncomeSchedule['certainty'] = 'scheduled', kind: IncomeSchedule['kind'] = 'salary'): IncomeSchedule => ({ id, name, amount, accountId: PAY, recurrence: 'monthly', day, certainty, kind });
const monthlyActual = (s: IncomeSchedule, delayOn?: Record<string, number>): ActualIncome[] =>
  occurrences(s, SYN_START, addDays(SYN_START, SYN_DAYS - 1)).map((d) => {
    const delay = delayOn?.[d.slice(0, 7)] ?? 0;
    return { name: s.name, date: addDays(d, delay), amount: s.amount, schedule: s, delay };
  });
const fridays = () => dateRange(SYN_START, addDays(SYN_START, SYN_DAYS - 1)).filter((d) => weekday(d) === 5);

export const PERSONAS: Persona[] = [
  {
    id: 'S01', type: '자취 대학생', tests: '주급 직전 부족', seed: 101, opening: 180000, dailyMean: 15000, shares: { account: 0.85, credit: 0, cash: 0.15 }, balanceSmsRate: 0.7,
    fixed: [monthly('S01-rent', '월세', 350000, 25, true, 'rent'), monthly('S01-tel', '통신비', 45000, 15, true, 'utility')],
    incomes: () => fridays().map((d) => ({ name: '알바 주급', date: d, amount: 130000, schedule: { id: `S01-wage-${d}`, name: '알바 주급', amount: 130000, accountId: PAY, recurrence: 'once', date: d, certainty: 'scheduled', kind: 'parttime' } })),
  },
  {
    id: 'S02', type: '자취 대학생', tests: '월말 바닥, 잊은 구독', seed: 102, opening: 150000, dailyMean: 13000, shares: { account: 0.6, credit: 0.3, cash: 0.1 }, balanceSmsRate: 0.6,
    fixed: [monthly('S02-rent', '월세', 300000, 5, true, 'rent'), monthly('S02-sub1', '음악 구독', 10900, 12), monthly('S02-sub2', 'OTT 구독', 13500, 20)],
    hiddenFixed: [monthly('S02-sub3', '잊은 구독', 14900, 3)],
    incomes: (r) => [
      ...monthlyActual(sched('S02-allow', '용돈', 450000, 1, 'scheduled', 'allowance')),
      ...[18, 47, 76].filter(() => r.next() < 0.7).map((o) => ({ name: '단기 알바', date: addDays(SYN_START, o), amount: 80000, schedule: { id: `S02-gig-${o}`, name: '단기 알바', amount: 80000, accountId: PAY, recurrence: 'once' as const, date: addDays(SYN_START, o), certainty: 'uncertain' as const, kind: 'parttime' as const } })),
    ],
  },
  {
    id: 'S03', type: '통학 대학생', tests: '오경보가 나지 않는지', seed: 103, opening: 250000, dailyMean: 7000, shares: { account: 0.9, credit: 0, cash: 0.1 }, balanceSmsRate: 0.8,
    fixed: [monthly('S03-tel', '통신비', 39000, 20, true, 'utility')],
    incomes: () => monthlyActual(sched('S03-allow', '용돈', 300000, 1, 'scheduled', 'allowance')),
  },
  {
    id: 'S04', type: '취업준비생', tests: '버틸 수 있는 기간, 잔액 미확인', seed: 104, opening: 1150000, dailyMean: 12000, shares: { account: 0.9, credit: 0, cash: 0.1 }, balanceSmsRate: 0.05,
    fixed: [monthly('S04-rent', '월세', 400000, 1, true, 'rent'), monthly('S04-acad', '학원비', 200000, 10)],
    incomes: () => [],
  },
  {
    id: 'S05', type: '취업준비생', tests: '불확실 입금일 때의 등급', seed: 105, opening: 120000, dailyMean: 9000, shares: { account: 0.9, credit: 0, cash: 0.1 }, balanceSmsRate: 0.6,
    fixed: [monthly('S05-tel', '통신비', 50000, 25, true, 'utility'), monthly('S05-inst', '노트북 할부', 80000, 14, true, 'installment')],
    incomes: (r) => {
      const s = sched('S05-family', '가족 지원', 300000, 15, 'uncertain', 'family');
      return monthlyActual(s).filter(() => r.next() < 0.75).map((x) => ({ ...x, date: addDays(x.date, Math.floor(r.next() * 6)) }));
    },
  },
  {
    id: 'S06', type: '사회초년생', tests: '청구액 변동, 다음 달 고정비 급증', seed: 106, opening: 300000, dailyMean: 45000, shares: { account: 0.15, credit: 0.8, cash: 0.05 }, balanceSmsRate: 0.7, cardPayDay: 14,
    fixed: [monthly('S06-rent', '월세', 550000, 27, true, 'rent')],
    shocks: [{ date: '2026-09-20', amount: 900000, method: 'credit' }],
    incomes: () => monthlyActual(sched('S06-pay', '월급', 2300000, 25)),
  },
  {
    id: 'S07', type: '사회초년생', tests: '적금일 직후 부족', seed: 107, opening: 200000, dailyMean: 25000, shares: { account: 0.5, credit: 0.45, cash: 0.05 }, balanceSmsRate: 0.7, cardPayDay: 14,
    fixed: [monthly('S07-mgmt', '관리비', 150000, 12, true, 'utility'), monthly('S07-save', '청년미래적금', 500000, 11, false, 'saving'), monthly('S07-rent', '월세', 600000, 13, true, 'rent')],
    incomes: () => monthlyActual(sched('S07-pay', '월급', 2000000, 10)),
  },
  {
    id: 'S08', type: '사회초년생', tests: '급여 3일 지연', seed: 108, opening: 250000, dailyMean: 42000, shares: { account: 0.25, credit: 0.7, cash: 0.05 }, balanceSmsRate: 0.7, cardPayDay: 27,
    fixed: [monthly('S08-rent', '월세', 600000, 26, true, 'rent'), monthly('S08-tel', '통신비', 60000, 27, true, 'utility')],
    incomes: () => monthlyActual(sched('S08-pay', '월급', 2000000, 25), { '2026-09': 3 }),
  },
  {
    id: 'S09', type: '프리랜서형 청년', tests: '입금 직후 몰아쓰기', seed: 109, opening: 200000, dailyMean: 16000, shares: { account: 0.55, credit: 0.4, cash: 0.05 }, balanceSmsRate: 0.6, burstAfterIncome: 3, cardPayDay: 14,
    fixed: [monthly('S09-tel', '통신비', 55000, 5, true, 'utility'), monthly('S09-inst', '장비 할부', 120000, 20, true, 'installment')],
    incomes: (r) =>
      [9, 31, 44, 63, 80].map((o) => {
        const date = addDays(SYN_START, o + Math.floor(r.next() * 4));
        const amount = 150000 + Math.round(r.next() * 25) * 10000;
        return { name: '외주 입금', date, amount, schedule: { id: `S09-job-${o}`, name: '외주 입금', amount, accountId: PAY, recurrence: 'once' as const, date: addDays(SYN_START, o), certainty: 'uncertain' as const, kind: 'freelance' as const } };
      }),
  },
  {
    id: 'S10', type: '자취 대학생', tests: '돌발 지출, 기록 누락 후 재예측', seed: 110, opening: 220000, dailyMean: 13000, shares: { account: 0.9, credit: 0, cash: 0.1 }, balanceSmsRate: 0.7,
    fixed: [monthly('S10-rent', '월세', 380000, 8, true, 'rent')],
    shocks: [{ date: '2026-10-03', amount: 250000, method: 'debit' }],
    missingDays: ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'],
    incomes: () => monthlyActual(sched('S10-wage', '알바 월급', 750000, 10, 'scheduled', 'parttime')),
  },
];

export interface SyntheticUser {
  persona: Persona;
  setup: UserSetup;
  /** 진짜 거래 전체 */
  truth: Txn[];
  /** 사용자가 기록한 거래 (누락 반영) */
  recorded: Txn[];
  observations: BalanceObservation[];
  dayStatus: Map<ISODate, DayStatus>;
  /** 필수결제일별 진짜 하루 최저 잔고와 부족 여부 (정답 라벨) */
  labels: { date: ISODate; label: string; low: number; short: boolean }[];
  start: ISODate;
  end: ISODate;
}

export function generate(p: Persona): SyntheticUser {
  const r = rng(p.seed);
  const start = SYN_START;
  const end = addDays(start, SYN_DAYS - 1);
  const cards: Card[] = [
    { id: `${p.id}-chk`, kind: 'debit', name: '체크', accountId: PAY },
    ...(p.shares.credit > 0 ? [{ id: `${p.id}-cc`, kind: 'credit' as const, name: '신용', accountId: PAY, cycleEndDay: 31, payDay: p.cardPayDay ?? 14 }] : []),
  ];
  const cc = cards.find((c) => c.kind === 'credit');
  const incomes = p.incomes(r);
  const truth: Txn[] = [];
  let n = 0;
  const tid = () => `${p.id}-${++n}`;

  for (const inc of incomes) {
    if (inc.date > end) continue;
    truth.push({ id: tid(), type: 'income', occurredAt: kstStart(inc.date) + 10 * 3600_000, amount: inc.amount, accountId: PAY, name: inc.name, scheduleRef: inc.schedule?.id });
  }
  for (const f of [...p.fixed, ...(p.hiddenFixed ?? [])]) {
    for (const d of occurrences(f, start, end)) {
      const t = kstStart(d) + 7 * 3600_000;
      truth.push(f.kind === 'saving' ? { id: tid(), type: 'saving', occurredAt: t, amount: f.amount, accountId: PAY, name: f.name, scheduleRef: f.id } : { id: tid(), type: 'spend', occurredAt: t, amount: f.amount, method: 'transfer', accountId: PAY, essential: true, category: f.name, scheduleRef: f.id });
    }
  }
  const incomeDates = new Set(incomes.map((i) => i.date));
  let burst = 0;
  for (const d of dateRange(start, end)) {
    if (incomeDates.has(d)) burst = 3;
    const w = weekday(d);
    const k = (w === 5 || w === 6 ? 1.35 : w === 0 ? 1.1 : 0.9) * (burst > 0 && p.burstAfterIncome ? p.burstAfterIncome : 1);
    burst = Math.max(0, burst - 1);
    if (r.next() < 0.12) continue; // 안 쓴 날
    const total = Math.max(0, Math.round((p.dailyMean * k * Math.exp(0.45 * r.normal() - 0.1)) / 100) * 100);
    const parts = 1 + Math.floor(r.next() * 3);
    for (let i = 0; i < parts; i++) {
      const amount = Math.round(total / parts / 100) * 100;
      if (amount <= 0) continue;
      const u = r.next();
      const method = u < p.shares.account ? 'debit' : u < p.shares.account + p.shares.credit && cc ? 'credit' : 'cash';
      truth.push({ id: tid(), type: 'spend', occurredAt: kstStart(d) + (9 + Math.floor(r.next() * 13)) * 3600_000 + i * 60_000, amount, method, cardId: method === 'debit' ? `${p.id}-chk` : method === 'credit' ? cc!.id : undefined, category: r.pick(['식비', '카페', '교통', '여가', '쇼핑']) });
    }
  }
  for (const s of p.shocks ?? []) truth.push({ id: tid(), type: 'spend', occurredAt: kstStart(s.date) + 15 * 3600_000, amount: s.amount, method: s.method, cardId: s.method === 'debit' ? `${p.id}-chk` : cc?.id, category: '돌발' });

  // 카드 대금: 결제일에 그 주기 청구액 그대로 출금
  if (cc && cc.kind === 'credit') {
    const pre = buildLedger(truth, cards).postings.filter((x) => x.role === 'card_charge');
    const byPay = new Map<ISODate, number>();
    for (const x of pre) byPay.set(x.payDate!, (byPay.get(x.payDate!) ?? 0) - x.amount);
    for (const [d, amt] of byPay) if (d <= end) truth.push({ id: tid(), type: 'card_bill', occurredAt: kstStart(d) + 6 * 3600_000, amount: amt, cardId: cc.id, accountId: PAY });
  }
  // S04: 저축통장에서 가끔 생활비를 옮김 (등록 안 함)
  if (p.id === 'S04') for (const o of [40, 70]) truth.push({ id: tid(), type: 'own_transfer', occurredAt: kstStart(addDays(start, o)) + 11 * 3600_000, amount: 500000, from: SAVE, to: PAY });
  truth.sort((a, b) => a.occurredAt - b.occurredAt);

  // 진짜 잔고 경로와 잔액 문자
  const ledger = buildLedger(truth, cards);
  const pays = ledger.postings.filter((x) => x.accountId === PAY && x.debitAt >= kstStart(start)).sort((a, b) => a.debitAt - b.debitAt);
  const observations: BalanceObservation[] = [{ at: kstStart(start) - 60_000, balance: p.opening, source: 'user', accountId: PAY }];
  let bal = p.opening;
  for (const x of pays) {
    bal += x.amount;
    const smsy = x.role === 'variable' || x.role === 'income' || x.role === 'card_bill';
    if (smsy && r.next() < p.balanceSmsRate) observations.push({ at: x.debitAt, balance: bal, source: 'sms', accountId: PAY });
  }

  const missing = new Set(p.missingDays ?? []);
  const recorded = truth.filter((t) => !(missing.has(kstDate(t.occurredAt)) && t.type === 'spend' && !t.essential));
  const recordedObs = observations.filter((o) => !missing.has(kstDate(o.at)));
  const dayStatus = new Map<ISODate, DayStatus>();
  for (const d of dateRange(start, end)) dayStatus.set(d, missing.has(d) ? 'missing' : r.next() < 0.85 ? 'self_reported' : 'partial');

  // 정답 라벨: 필수 고정 출금일 + 카드 결제일의 진짜 하루 최저 잔고
  const truthPath = projectBalance(latestAnchor([observations[0]], PAY)!, ledger.postings, PAY, end);
  const lowOf = (d: ISODate) => truthPath.find((x) => x.date === d)?.low ?? 0;
  const labelDates = new Map<string, { date: ISODate; label: string }>();
  for (const f of p.fixed.filter((x) => x.essential)) for (const d of occurrences(f, start, end)) labelDates.set(`${d}|${f.name}`, { date: d, label: f.name });
  for (const b of truth) if (b.type === 'card_bill') labelDates.set(`${kstDate(b.occurredAt)}|카드값`, { date: kstDate(b.occurredAt), label: '카드값' });
  const labels = [...labelDates.values()].map((x) => ({ ...x, low: lowOf(x.date), short: lowOf(x.date) < 0 })).sort((a, b) => (a.date < b.date ? -1 : 1));

  const setup: UserSetup = {
    accounts: [
      { id: PAY, name: '결제계좌', isPayment: true },
      { id: SAVE, name: '저축통장', isPayment: false },
    ],
    cards,
    fixed: p.fixed,
    incomes: incomes.flatMap((i) => (i.schedule ? [i.schedule] : [])).filter((s, i, a) => a.findIndex((x) => x.id === s.id) === i),
    mainMethod: p.shares.credit > p.shares.account ? 'credit' : 'debit',
  };
  return { persona: p, setup, truth, recorded, observations: recordedObs, dayStatus, labels, start, end };
}
