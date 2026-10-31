/**
 * 합성 사용자 10명 (기획서 「합성 사용자 10명 만드는 법」).
 * 시뮬레이터가 실제 결제계좌 잔고 경로를 알기 때문에 '필수결제일에 돈이 부족했던 날'이 정답 라벨로 남는다.
 * 설정값은 시뮬레이터 파라미터이며 실제 인물 통계가 아니다. 분포 시작값은 팀원 실데이터가 모이면 그 값으로 바꾼다.
 *
 * 주의: 합성으로 만든 데이터는 '부족 탐지 로직이 의도대로 동작하는가'만 검증한다.
 *       실제 청년의 부족 탐지 성능이나 사용자 테스트 인원으로 쓰지 않는다.
 */
import { addDays, diffDays, monthlyDate, parseISO, weekdayOf, type ISODate } from '../../shared/dates';
import { billingDate } from '../../src/lib/moa/billing';
import { addTxns } from '../../src/lib/moa/actions';
import { matchSchedule } from '../../src/lib/moa/ledger';
import { emptyMoa, type MoaCard, type MoaSchedule, type MoaState, type PayMethod, type Txn } from '../../src/lib/moa/types';
import { mulberry32 } from '../../src/lib/ml/montecarlo';

export interface SynthSpec {
  id: string;
  type: string;
  scenario: string;
  start: number;
  /** 수입: 금액, 주기, 상태 */
  incomes: { name: string; amount: number; kind: 'weekly' | 'monthly' | 'irregular'; day: number; status: 'scheduled' | 'uncertain'; delayEvery?: number; delayDays?: number }[];
  fixed: { name: string; amount: number; day: number }[];
  /** 결제 수단 비중 (debit, credit, cash) */
  mix: [number, number, number];
  /** 하루 변동 지출 평균 (원) */
  daily: number;
  /** 로그정규 흩어짐 */
  sigma: number;
  /** 돌발 지출 (시작 후 N일째, 금액) */
  shocks?: [number, number][];
  /** 기록을 빠뜨릴 확률 */
  missRate?: number;
  /** 문자에 거래 후 잔액이 안 찍힘 (잔액 미확인) */
  noBalanceSms?: boolean;
  /** 입금 직후 몰아쓰기 배수 */
  binge?: number;
}

export const SPECS: SynthSpec[] = [
  { id: 'S01', type: '자취 대학생', scenario: '주급 직전 부족', start: 60_000, incomes: [{ name: '알바 주급', amount: 160_000, kind: 'weekly', day: 5, status: 'scheduled' }], fixed: [{ name: '월세', amount: 380_000, day: 25 }, { name: '통신비', amount: 45_000, day: 20 }], mix: [0.9, 0, 0.1], daily: 7_000, sigma: 0.7 },
  { id: 'S02', type: '자취 대학생', scenario: '월말 바닥, 잊은 구독', start: 40_000, incomes: [{ name: '용돈', amount: 500_000, kind: 'monthly', day: 1, status: 'scheduled' }, { name: '단기 알바', amount: 150_000, kind: 'irregular', day: 15, status: 'uncertain' }], fixed: [{ name: '월세', amount: 350_000, day: 5 }, { name: '구독 3개', amount: 32_000, day: 12 }], mix: [0.6, 0.35, 0.05], daily: 9_000, sigma: 0.8 },
  { id: 'S03', type: '통학 대학생', scenario: '오경보가 나지 않는지', start: 300_000, incomes: [{ name: '용돈', amount: 400_000, kind: 'monthly', day: 1, status: 'scheduled' }], fixed: [{ name: '통신비', amount: 35_000, day: 20 }], mix: [0.9, 0, 0.1], daily: 9_000, sigma: 0.6 },
  { id: 'S04', type: '취업준비생', scenario: '버틸 수 있는 기간, 잔액 미확인', start: 2_500_000, incomes: [], fixed: [{ name: '월세', amount: 400_000, day: 10 }, { name: '학원비', amount: 250_000, day: 3 }], mix: [1, 0, 0], daily: 11_000, sigma: 0.6, noBalanceSms: true },
  { id: 'S05', type: '취업준비생', scenario: '불확실 입금일 때의 등급', start: 120_000, incomes: [{ name: '가족 지원', amount: 300_000, kind: 'irregular', day: 18, status: 'uncertain' }], fixed: [{ name: '통신비', amount: 50_000, day: 22 }, { name: '노트북 할부', amount: 80_000, day: 14 }], mix: [0.95, 0, 0.05], daily: 8_000, sigma: 0.7 },
  { id: 'S06', type: '사회초년생', scenario: '청구액 변동, 다음 달 고정비 급증', start: 400_000, incomes: [{ name: '월급', amount: 2_300_000, kind: 'monthly', day: 25, status: 'scheduled' }], fixed: [{ name: '월세', amount: 600_000, day: 27 }, { name: '할부 2건', amount: 180_000, day: 14 }], mix: [0.2, 0.75, 0.05], daily: 50_000, sigma: 0.8, shocks: [[40, 450_000], [70, 300_000]] },
  { id: 'S07', type: '사회초년생', scenario: '적금일 직후 부족', start: 80_000, incomes: [{ name: '월급', amount: 2_100_000, kind: 'monthly', day: 10, status: 'scheduled' }], fixed: [{ name: '청년미래적금', amount: 500_000, day: 11 }, { name: '관리비', amount: 150_000, day: 15 }, { name: '월세', amount: 550_000, day: 12 }], mix: [0.5, 0.45, 0.05], daily: 31_000, sigma: 0.7 },
  { id: 'S08', type: '사회초년생', scenario: '급여 3일 지연', start: 60_000, incomes: [{ name: '월급', amount: 1_400_000, kind: 'monthly', day: 10, status: 'scheduled', delayEvery: 2, delayDays: 3 }], fixed: [{ name: '월세', amount: 650_000, day: 11 }, { name: '통신비', amount: 60_000, day: 12 }], mix: [0.3, 0.65, 0.05], daily: 40_000, sigma: 0.7 },
  { id: 'S09', type: '프리랜서형 청년', scenario: '입금 직후 몰아쓰기', start: 80_000, incomes: [{ name: '건별 입금', amount: 700_000, kind: 'irregular', day: 8, status: 'uncertain' }], fixed: [{ name: '통신비', amount: 55_000, day: 18 }, { name: '장비 할부', amount: 120_000, day: 14 }], mix: [0.6, 0.35, 0.05], daily: 14_000, sigma: 0.9, binge: 3 },
  { id: 'S10', type: '자취 대학생', scenario: '돌발 지출, 기록 누락 후 재예측', start: 180_000, incomes: [{ name: '알바 월급', amount: 700_000, kind: 'monthly', day: 15, status: 'scheduled' }], fixed: [{ name: '월세', amount: 420_000, day: 1 }], mix: [0.95, 0, 0.05], daily: 8_000, sigma: 0.7, shocks: [[55, 180_000], [78, 120_000]], missRate: 0.15 },
];

export const SYNTH_END: ISODate = '2026-10-31';
export const SYNTH_DAYS = 150;

const CARD: MoaCard = { id: 'syn_credit', name: '신용', kind: 'credit', linked: false, cutoffDay: 31, payDay: 14 };
const CHECK: MoaCard = { id: 'syn_check', name: '체크', kind: 'debit', linked: true };
const kst = (d: ISODate, h: number) => { const { y, m, d: dd } = parseISO(d); return Date.UTC(y, m - 1, dd, h - 9); };

export interface TruthPayment { key: string; date: ISODate; name: string; amount: number; balanceAfter: number; short: boolean }

export interface SynthUser {
  spec: SynthSpec;
  start: ISODate;
  end: ISODate;
  /** 사용자가 남긴 기록 (빠뜨린 것 제외) */
  recorded: Txn[];
  /** 실제로 일어난 모든 거래 */
  actual: Txn[];
  schedule: MoaSchedule[];
  /** 그날 끝 실제 결제계좌 잔고 */
  trueClose: Map<ISODate, number>;
  /** 그날 시작 실제 잔고 */
  trueOpen: Map<ISODate, number>;
  /** 날짜별 실제 변동 지출 합계 */
  trueDaily: Map<ISODate, number>;
  /** 정답으로 쓸 수 있다고 사용자가 누른 날 */
  dayStatus: Record<ISODate, 'self' | 'reconciled'>;
  payments: TruthPayment[];
}

function lognormal(rand: () => number, mean: number, sigma: number): number {
  const u = Math.max(1e-9, rand()), v = rand();
  const z = Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  return mean * Math.exp(sigma * z - (sigma * sigma) / 2);
}

export function makeUser(spec: SynthSpec, seed = 1): SynthUser {
  const rand = mulberry32(seed * 7919 + Number(spec.id.slice(1)) * 104729);
  const start = addDays(SYNTH_END, -(SYNTH_DAYS - 1));
  const actual: Txn[] = [];
  const recorded: Txn[] = [];
  const trueDaily = new Map<ISODate, number>();
  const dayStatus: SynthUser['dayStatus'] = {};
  let n = 0;
  const push = (t: Omit<Txn, 'id' | 'createdAt' | 'source'>, record = true) => {
    const full: Txn = { ...t, id: `${spec.id}_${n++}`, createdAt: t.occurredAt, source: 'demo' };
    actual.push(full);
    if (record) recorded.push(full);
  };

  // 등록 일정 (사용자가 아는 것)
  const schedule: MoaSchedule[] = [
    ...spec.fixed.map((f, i) => ({ id: `${spec.id}_f${i}`, name: f.name, amount: f.amount, direction: 'out' as const, recurrence: 'monthly' as const, day: f.day, essential: true, saving: /적금/.test(f.name) })),
    ...spec.incomes.filter((x) => x.kind === 'monthly').map((x, i) => ({ id: `${spec.id}_i${i}`, name: x.name, amount: x.amount, direction: 'in' as const, recurrence: 'monthly' as const, day: x.day, essential: false, status: x.status })),
  ];

  let lastIncome = -99;
  for (let i = 0; i < SYNTH_DAYS; i++) {
    const d = addDays(start, i);
    const { y, m } = parseISO(d);
    // 입금
    for (const inc of spec.incomes) {
      let hit = false;
      if (inc.kind === 'weekly') hit = weekdayOf(d) === inc.day;
      if (inc.kind === 'monthly') {
        // 달마다 예정일, delayEvery달에 한 번은 delayDays만큼 늦게 들어온다
        for (const back of [0, 1]) {
          const ref = parseISO(addDays(`${y}-${String(m).padStart(2, '0')}-01`, -back * 20));
          const sched = monthlyDate(ref.y, ref.m, inc.day);
          const monthNo = ref.y * 12 + ref.m;
          const late = inc.delayEvery && monthNo % inc.delayEvery === 0 ? inc.delayDays ?? 0 : 0;
          if (addDays(sched, late) === d) hit = true;
        }
      }
      if (inc.kind === 'irregular') hit = rand() < 1 / 24;
      if (hit) {
        push({ occurredAt: kst(d, 9), date: d, amount: inc.amount, kind: 'income', method: 'transfer', account: 'pay', name: inc.name, category: '수입', essential: false, scheduleRef: undefined });
        lastIncome = i;
      }
    }
    // 고정 출금
    spec.fixed.forEach((f, k) => {
      if (monthlyDate(y, m, f.day) === d) push({ occurredAt: kst(d, 8), date: d, amount: f.amount, kind: /적금/.test(f.name) ? 'saving' : 'spend', method: 'transfer', account: 'pay', name: f.name, category: '생활', essential: true, scheduleRef: `${spec.id}_f${k}:${d}` });
    });
    // 변동 지출
    const weekend = weekdayOf(d) === 0 || weekdayOf(d) === 6 ? 1.3 : 0.88;
    const binge = spec.binge && i - lastIncome >= 0 && i - lastIncome < 3 ? spec.binge : 1;
    let total = rand() < 0.12 ? 0 : lognormal(rand, spec.daily * weekend * binge, spec.sigma);
    for (const [k, amt] of spec.shocks ?? []) if (k === i) total += amt;
    total = Math.round(total / 100) * 100;
    const miss = (spec.missRate ?? 0) > 0 && rand() < spec.missRate!;
    let dayTotal = 0;
    if (total > 0) {
      const pieces = 1 + Math.floor(rand() * 3);
      for (let p = 0; p < pieces; p++) {
        const amt = Math.round(total / pieces / 100) * 100;
        if (!amt) continue;
        const r = rand();
        const method: PayMethod = r < spec.mix[0] ? 'debit' : r < spec.mix[0] + spec.mix[1] ? 'credit' : 'cash';
        push({ occurredAt: kst(d, 11 + p * 4), date: d, amount: amt, kind: 'spend', method, account: method === 'cash' ? 'cash' : method === 'credit' ? 'other' : 'pay', cardId: method === 'credit' ? CARD.id : method === 'debit' ? CHECK.id : undefined, name: '변동 지출', category: '식비', essential: false }, !miss);
        dayTotal += amt;
      }
    }
    trueDaily.set(d, dayTotal);
    // 기록 완료 표시: 다 적은 날은 대부분 누른다. 빠뜨린 날은 누르지 않는다(10%는 잘못 누름)
    if (!miss ? rand() < 0.92 : rand() < 0.1) dayStatus[d] = i % 9 === 0 ? 'reconciled' : 'self';
  }
  // 카드 대금: 실제 청구일에 결제계좌 출금 (카드대금 문자도 기록됨)
  const bills = new Map<ISODate, number>();
  for (const t of actual) if (t.method === 'credit') { const bd = billingDate(CARD, t.date); bills.set(bd, (bills.get(bd) ?? 0) + t.amount); }
  for (const [bd, amt] of bills) if (bd <= SYNTH_END) push({ occurredAt: kst(bd, 7), date: bd, amount: amt, kind: 'card_payment', method: 'transfer', account: 'pay', cardId: CARD.id, name: '신용카드 대금', category: '카드대금', essential: true });

  // 등록 일정과 같은 입금은 회차와 묶는다 (앱에서 저장할 때와 같은 규칙)
  for (const t of actual) if (t.kind === 'income' && !t.scheduleRef) t.scheduleRef = matchSchedule(t, schedule);

  // 실제 잔고 경로
  actual.sort((a, b) => a.occurredAt - b.occurredAt);
  const trueOpen = new Map<ISODate, number>();
  const trueClose = new Map<ISODate, number>();
  let bal = spec.start;
  const signed = (t: Txn) => (t.kind === 'income' ? t.amount : -t.amount);
  const hits = (t: Txn) => t.account === 'pay' && t.method !== 'cash' && (t.method !== 'credit' || t.kind === 'card_payment');
  const byDay = new Map<ISODate, Txn[]>();
  for (const t of actual) byDay.set(t.date, [...(byDay.get(t.date) ?? []), t]);
  const payments: TruthPayment[] = [];
  for (let i = 0; i < SYNTH_DAYS; i++) {
    const d = addDays(start, i);
    trueOpen.set(d, bal);
    const ts = (byDay.get(d) ?? []).filter(hits);
    const out = ts.filter((t) => signed(t) < 0).reduce((s, t) => s + signed(t), 0);
    const inc = ts.filter((t) => signed(t) > 0).reduce((s, t) => s + signed(t), 0);
    const low = bal + out;
    for (const t of ts) if (t.essential) payments.push({ key: `${t.name}:${d}`, date: d, name: t.name, amount: t.amount, balanceAfter: low, short: low < 0 });
    // 잔액이 찍히는 체크카드·입출금 문자: 그 시점 잔고
    let running = bal;
    for (const t of ts) { running += signed(t); if (!spec.noBalanceSms && (t.method === 'debit' || t.kind === 'income')) t.balanceAfter = running; }
    bal = low + inc;
    // 현실에서는 잔고가 음수로 남지 않는다: 그날 다른 계좌·가족에게서 돈을 옮겨 막는다(기록됨)
    if (bal < 0) {
      const amt = Math.ceil((-bal + 50_000) / 10_000) * 10_000;
      const t: Txn = { id: `${spec.id}_${n++}`, occurredAt: kst(d, 22), date: d, amount: amt, kind: 'transfer_self', direction: 'in', method: 'transfer', account: 'pay', name: '다른 계좌에서 옮김', category: '이체', essential: false, source: 'demo', createdAt: kst(d, 22), balanceAfter: spec.noBalanceSms ? undefined : bal + amt };
      actual.push(t); recorded.push(t);
      bal += amt;
    }
    trueClose.set(d, bal);
  }
  return { spec, start, end: SYNTH_END, recorded: recorded.filter((t) => actual.includes(t)), actual, schedule, trueClose, trueOpen, trueDaily, dayStatus, payments };
}

/**
 * 그날 아침 시점에 사용자가 가진 정보로 만든 MoaState.
 * - 기록은 그 전날까지 (빠뜨린 것 제외)
 * - 잔액은 마지막으로 잔액이 찍힌 문자 (S04는 처음 입력한 잔액뿐)
 */
const replayCache = new WeakMap<SynthUser, MoaState['mismatches']>();
/** 기록을 순서대로 저장했을 때 생기는 잔액 불일치(기록 누락 신호) */
function mismatchesOf(u: SynthUser): MoaState['mismatches'] {
  let m = replayCache.get(u);
  if (!m) {
    const base: MoaState = { ...emptyMoa(), anchor: { balance: u.spec.start, at: kst(u.start, 7), source: 'manual', reflected: [] }, cards: [CARD, CHECK], schedule: u.schedule };
    const strip = u.recorded.map(({ id, createdAt, ...rest }) => ({ ...rest, id }));
    m = addTxns(base, strip, 0).mismatches;
    replayCache.set(u, m);
  }
  return m;
}

export function stateAt(u: SynthUser, day: ISODate): { state: MoaState; nowMs: number } {
  const nowMs = kst(day, 8);
  const mismatches = mismatchesOf(u).filter((x) => x.at < nowMs);
  const txns = u.recorded.filter((t) => t.occurredAt < nowMs);
  const withBal = txns.filter((t) => t.balanceAfter !== undefined && t.account === 'pay');
  const last = withBal[withBal.length - 1];
  const anchor = last ? { balance: last.balanceAfter!, at: last.occurredAt, source: 'sms' as const, reflected: [] } : { balance: u.spec.start, at: kst(u.start, 7), source: 'manual' as const, reflected: [] };
  const dayStatus = Object.fromEntries(Object.entries(u.dayStatus).filter(([d]) => d < day));
  return {
    nowMs,
    state: { ...emptyMoa(), anchor, cards: [CARD, CHECK], schedule: u.schedule, txns, dayStatus, mainMethod: 'debit', mismatches },
  };
}

export const daysBetween = (a: ISODate, b: ISODate) => diffDays(a, b);
