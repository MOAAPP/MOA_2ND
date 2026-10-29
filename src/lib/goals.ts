import { addMonths, type ISODate } from '../../shared/dates';

export type Frequency = 'once' | 'weekly' | 'monthly';

/** 주 1회 반복은 한 달 평균 52주/12개월 ≈ 4.33회로 계산 */
export const WEEKS_PER_MONTH = 52 / 12;

export interface GoalInput {
  target: number;
  saved: number;
  monthlySaving: number;
  /** 연 이자율 % (월복리). 0이면 이자 없음 */
  annualRate: number;
  today: ISODate;
  /** 다른 선택으로 생기는 추가 적립(양수) 또는 추가 지출(음수) */
  extra?: { amount: number; frequency: Frequency; months: number };
}

export interface GoalProjection {
  /** 도달까지 개월 수(0이면 이미 도달). 계산 불가면 null */
  months: number | null;
  arrival: ISODate | null;
  remaining: number;
  path: { month: number; balance: number }[];
}

const MAX_MONTHS = 600;

export function projectGoal(input: GoalInput): GoalProjection {
  const { target, monthlySaving, annualRate, today, extra } = input;
  const r = Math.max(0, annualRate) / 100 / 12;
  let bal = input.saved;
  if (extra && extra.frequency === 'once') bal += extra.amount;
  const remaining = Math.max(0, target - input.saved);
  const path = [{ month: 0, balance: Math.round(bal) }];
  if (bal >= target) return { months: 0, arrival: today, remaining, path };

  const perMonthExtra = (i: number) => {
    if (!extra || extra.frequency === 'once' || i > extra.months) return 0;
    return extra.frequency === 'monthly' ? extra.amount : extra.amount * WEEKS_PER_MONTH;
  };

  for (let i = 1; i <= MAX_MONTHS; i++) {
    const add = monthlySaving + perMonthExtra(i);
    bal = bal * (1 + r) + add;
    path.push({ month: i, balance: Math.round(bal) });
    if (bal >= target) return { months: i, arrival: addMonths(today, i), remaining, path };
    // 적립이 없고 이자도 없으면 더 진행해도 의미 없음
    if (add <= 0 && r === 0 && i > (extra?.months ?? 0)) break;
  }
  return { months: null, arrival: null, remaining, path };
}

/** 목표 날짜까지 필요한 월 저축액(이자 미반영) */
export function neededMonthly(target: number, saved: number, months: number): number | null {
  if (months <= 0) return null;
  return Math.max(0, Math.ceil((target - saved) / months));
}
