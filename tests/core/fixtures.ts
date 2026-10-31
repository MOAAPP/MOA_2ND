import { addDays, type ISODate } from '../../shared/dates';
import { kst } from '../../src/core/time';
import type { BalanceObservation, DayStatus, Txn, UserSetup } from '../../src/core/types';

export const A = 'acc-pay';
export const B = 'acc-b';

export function baseSetup(over: Partial<UserSetup> = {}): UserSetup {
  return {
    accounts: [
      { id: A, name: '결제계좌', isPayment: true },
      { id: B, name: '저축통장', isPayment: false },
    ],
    cards: [
      { id: 'chk', kind: 'debit', name: '체크', accountId: A },
      { id: 'chkB', kind: 'debit', name: 'B체크', accountId: B },
      // 이용 기간: 매달 말일까지 → 다음 달 14일 결제
      { id: 'cc', kind: 'credit', name: '신용', accountId: A, cycleEndDay: 31, payDay: 14 },
    ],
    fixed: [],
    incomes: [],
    ...over,
  };
}

let seq = 0;
export const id = (p = 't') => `${p}${++seq}`;

export function spend(at: string, amount: number, method: 'debit' | 'credit' | 'cash' | 'transfer', extra: Partial<Extract<Txn, { type: 'spend' }>> = {}): Txn {
  const cardId = method === 'debit' ? 'chk' : method === 'credit' ? 'cc' : undefined;
  const accountId = method === 'transfer' ? A : undefined;
  return { id: id('s'), type: 'spend', occurredAt: kst(at), amount, method, cardId, accountId, ...extra } as Txn;
}

export function obs(at: string, balance: number, accountId = A): BalanceObservation {
  return { at: kst(at), balance, source: 'user', accountId };
}

/** from~to 매일 같은 금액을 체크카드로 쓰고 '오늘 기록 완료'를 누른 기록 */
export function steadyHistory(from: ISODate, to: ISODate, perDay: number, method: 'debit' | 'credit' | 'cash' = 'debit'): { txns: Txn[]; status: Map<ISODate, DayStatus> } {
  const txns: Txn[] = [];
  const status = new Map<ISODate, DayStatus>();
  for (let d = from; d <= to; d = addDays(d, 1)) {
    if (perDay > 0) txns.push(spend(`${d} 12:00`, perDay, method));
    status.set(d, 'self_reported');
  }
  return { txns, status };
}
