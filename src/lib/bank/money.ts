/**
 * 원 단위 금액 계산 규칙 (docs/PRODUCT_SPEC.md §6)
 * - 이자는 원 미만 절사
 * - 이자소득세 15.4% = 소득세 14% + 지방소득세 1.4%, 각각 10원 미만 절사
 */

export const INCOME_TAX = 0.14;
export const LOCAL_TAX = 0.014;
export const TOTAL_TAX = INCOME_TAX + LOCAL_TAX;

/** 원 미만 절사. 부동소수 오차(예: 1234.9999999)를 먼저 보정한다. */
export function floorWon(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n + 1e-7);
}

/** 10원 미만 절사 */
export function floor10(n: number): number {
  return Math.floor(floorWon(n) / 10) * 10;
}

export interface TaxBreakdown {
  incomeTax: number;
  localTax: number;
  total: number;
}

export function interestTax(interest: number): TaxBreakdown {
  const i = Math.max(0, floorWon(interest));
  const incomeTax = floor10(i * INCOME_TAX);
  const localTax = floor10(i * LOCAL_TAX);
  return { incomeTax, localTax, total: incomeTax + localTax };
}

export interface Payout {
  principal: number;
  interest: number;
  tax: number;
  net: number;
}

export function payout(principal: number, interest: number): Payout {
  const i = Math.max(0, floorWon(interest));
  const tax = interestTax(i).total;
  return { principal, interest: i, tax, net: principal + i - tax };
}

/** 연 % → 소수 (3.2 → 0.032). 소수 둘째 자리까지만 의미가 있다. */
export function rate(pct: number): number {
  return Math.round(pct * 100) / 10000;
}

/** 금리 표기: 3.2 → '3.20%' */
export function ratePct(pct: number): string {
  return `${pct.toFixed(2)}%`;
}
