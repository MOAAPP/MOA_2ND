/**
 * N7 · 결제 전 결정 플로우의 '미래 비용' 계산 (PRODUCT_SPEC §4 F2).
 * 사기 전에 보여주는 숫자는 딱 3개:
 *   1) 이번 달 쓸 수 있는 돈이 얼마로 줄어드는지
 *   2) 다음 결제일(매달 1일 고정지출이 빠지는 날)에 얼마가 남는지
 *   3) 참은 돈을 1년 동안 가상 예금·적금에 넣었다면 얼마가 되는지(세후)
 * 모두 원 단위 정수, 순수 함수. 화면은 이 결과만 그린다.
 */
import { addDays, addMonths, diffDays, endOfMonth, startOfMonth, type ISODate } from '../../shared/dates';
import { emptyContext, quoteJoin, type BankContext, type Contract } from './bank/engine';
import { PRODUCTS, baseRateFor, type Product } from './bank/products';
import { floorWon } from './bank/money';

export type Frequency = 'once' | 'weekly' | 'daily';

export const FREQ_LABEL: Record<Frequency, string> = { once: '이번 한 번', weekly: '매주', daily: '매일' };
/** 1년 동안 몇 번 사는지 */
export const PER_YEAR: Record<Frequency, number> = { once: 1, weekly: 52, daily: 365 };

export interface WalletView {
  /** 가상 계좌 현금 */
  cash: number;
  /** 다음 달 1일에 빠지는 고정지출 */
  fixedBills: number;
  /** 지켜둘 생활비 */
  safetyBuffer: number;
}

export interface FutureCostInput {
  /** 한 번 살 때 가격 */
  price: number;
  /** 대안 가격(더 싸게 살 때). 없으면 0 → 참기 */
  altPrice?: number;
  frequency: Frequency;
  wallet: WalletView;
  /** 앱 기준 오늘 */
  today: ISODate;
  ctx?: BankContext;
  history?: Contract[];
}

export interface WorldNumbers {
  /** 이번 달 이 선택으로 나가는 돈 */
  spendThisMonth: number;
  /** 이번 달 쓸 수 있는 돈(음수면 지켜둘 돈을 깎아 쓴 것) */
  usable: number;
  /** 다음 결제일에 고정지출을 내고 남는 돈(음수면 모자람) */
  afterBills: number;
}

export interface YearPlan {
  /** 1년 동안 아끼는 원금 */
  principal: number;
  interest: number;
  tax: number;
  /** 원금 + 세후 이자 */
  net: number;
  appliedRate: number;
  productId: string;
  productName: string;
  /** 'deposit': 한 번 아낀 돈을 예금에 묶음 / 'installment': 매달 아낀 만큼 적금에 넣음 */
  how: 'deposit' | 'installment' | 'none';
  /** 적금일 때 한 달에 넣는 돈 */
  monthly?: number;
}

export interface FutureCost {
  /** 이번 달(오늘 포함 말일까지) 몇 번 사게 되는지 */
  timesThisMonth: number;
  nextBillDate: ISODate;
  daysToBill: number;
  now: WorldNumbers;
  buy: WorldNumbers;
  /** 참기(또는 대안) 세계 */
  hold: WorldNumbers;
  /** 참기·대안으로 한 번에 아끼는 돈 */
  savedOnce: number;
  /** 1년 동안 그대로 사면 쓰는 돈 */
  yearSpend: number;
  year: YearPlan;
}

/** 이번 달 남은 기간(오늘~말일)에 몇 번 사는지. 매주는 오늘이 첫 번째. */
export function timesLeftInMonth(today: ISODate, f: Frequency): number {
  if (f === 'once') return 1;
  const days = diffDays(today, endOfMonth(today)) + 1;
  return f === 'daily' ? days : Math.ceil(days / 7);
}

function numbers(w: WalletView, spend: number): WorldNumbers {
  const cash = w.cash - spend;
  return { spendThisMonth: spend, usable: cash - w.fixedBills - w.safetyBuffer, afterBills: cash - w.fixedBills };
}

/**
 * 1년 동안 아낀 돈을 굴리는 가장 좋은 가상 상품을 고른다.
 * - 한 번 참기: 12개월 정기예금 중 세후 수령액이 가장 큰 것(최소 가입금액 충족)
 * - 반복 참기: 매달 아끼는 금액을 넣는 12개월 적금 중 가장 큰 것(한도 충족)
 * 우대금리는 '지금 달성한 조건'만 넣는다(quoteJoin 규칙과 같음).
 */
export function bestYearPlan(savedOnce: number, f: Frequency, today: ISODate, ctx: BankContext = emptyContext(), history: Contract[] = []): YearPlan {
  const none: YearPlan = { principal: 0, interest: 0, tax: 0, net: 0, appliedRate: 0, productId: '', productName: '', how: 'none' };
  if (savedOnce <= 0) return none;
  const principal = savedOnce * PER_YEAR[f];
  const monthly = f === 'once' ? 0 : floorWon(principal / 12);
  const kind: Product['kind'] = f === 'once' ? 'deposit' : 'installment';
  const amount = f === 'once' ? savedOnce : monthly;

  let best: YearPlan | null = null;
  for (const p of PRODUCTS) {
    if (p.kind !== kind || baseRateFor(p, 12) === undefined) continue;
    const q = quoteJoin(p, { amount, months: 12, openedOn: today }, ctx, history);
    if (!q.ok) continue;
    // 적금 미리보기는 12회 납입 기준이라 원금이 monthly×12. 반올림 차이는 아래에서 원금을 맞춘다.
    const plan: YearPlan = {
      principal: q.principal,
      interest: q.interest,
      tax: q.tax,
      net: q.net,
      appliedRate: q.appliedRate,
      productId: p.id,
      productName: p.name,
      how: kind,
      monthly: kind === 'installment' ? monthly : undefined,
    };
    if (!best || plan.net - plan.principal > best.net - best.principal) best = plan;
  }
  if (!best) {
    // 어떤 상품에도 못 넣는 금액(너무 작거나 큼)이면 이자 없이 모은 돈만 보여준다.
    return { ...none, principal, net: principal, how: 'none' };
  }
  // 반복 구매는 1년 원금(price×횟수)과 적금 원금(monthly×12)이 몇 원 다를 수 있다 → 남는 돈은 이자 없이 더한다.
  const rest = principal - best.principal;
  if (rest > 0) best = { ...best, principal, net: best.net + rest };
  return best;
}

export function futureCost(input: FutureCostInput): FutureCost {
  const price = Math.max(0, Math.floor(input.price));
  const alt = Math.min(price, Math.max(0, Math.floor(input.altPrice ?? 0)));
  const n = timesLeftInMonth(input.today, input.frequency);
  const nextBillDate = addMonths(startOfMonth(input.today), 1);
  const savedOnce = price - alt;
  return {
    timesThisMonth: n,
    nextBillDate,
    daysToBill: diffDays(input.today, nextBillDate),
    now: numbers(input.wallet, 0),
    buy: numbers(input.wallet, price * n),
    hold: numbers(input.wallet, alt * n),
    savedOnce,
    yearSpend: price * PER_YEAR[input.frequency],
    year: bestYearPlan(savedOnce, input.frequency, input.today, input.ctx, input.history),
  };
}

/** 참기 결과 화면: 최근 30일 참은 횟수(가입 전 30일 우대조건과 같은 기준) */
export function skipsInLast30(skipDates: ISODate[], today: ISODate): number {
  const from = addDays(today, -30);
  return skipDates.filter((d) => d >= from && d <= today).length;
}
