import { startOfMonth, type ISODate } from '../../shared/dates';
import type { DecisionRecord } from './types';

/** 참아서 아낀 돈: 안 샀다 = 금액 전부, 대안 = 차액. 미룬 건 나중에 나가므로 제외 */
export function savedAmount(r: DecisionRecord): number {
  if (r.choice === 'skip') return r.params.amount;
  if (r.choice === 'alt' && r.params.altAmount) return Math.max(0, r.params.amount - r.params.altAmount);
  return 0;
}

export function savingsSummary(records: DecisionRecord[], today: ISODate) {
  const monthStart = startOfMonth(today);
  let month = 0;
  let total = 0;
  let monthCount = 0;
  let totalCount = 0;
  for (const r of records) {
    const s = savedAmount(r);
    if (s <= 0) continue;
    total += s;
    totalCount += 1;
    if (r.params.date >= monthStart && r.params.date <= today) {
      month += s;
      monthCount += 1;
    }
  }
  return { month, total, monthCount, totalCount };
}
