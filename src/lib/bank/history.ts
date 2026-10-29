import type { BankEvent, Settlement } from './engine';

/** 계좌 상세 거래내역 필터 */
export type HistoryFilter = 'all' | 'in' | 'out' | 'interest';

export const HISTORY_FILTERS: { id: HistoryFilter; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'in', label: '넣은 돈' },
  { id: 'out', label: '받은 돈' },
  { id: 'interest', label: '이자' },
];

/** 계좌로 돈이 들어간 기록(가입 첫 납입·추가 납입·자동이체)과 미납 */
const IN_TYPES: BankEvent['type'][] = ['open', 'pay', 'autoPay', 'missed'];
/** 계좌에서 돈을 받은 기록(만기·중도해지) */
const OUT_TYPES: BankEvent['type'][] = ['mature', 'close'];

export interface HistoryRow {
  event: BankEvent;
  /** 이자 필터에서만: 세전 이자, 세금, 세후 이자(원 단위 정수) */
  interest?: { gross: number; tax: number; net: number };
}

export interface HistoryView {
  rows: HistoryRow[];
  /** 필터 결과 합계. in=넣은 원금 합(양수), out=받은 돈 합, interest=세후 이자 합, all=순현금(받은 돈−넣은 돈) */
  total: number;
  count: number;
}

/** 최신순으로 정렬해 필터링하고 합계를 계산한다. 이자는 정산(settlement)이 있는 만기/해지 기록에서만 나온다. */
export function historyView(events: BankEvent[], filter: HistoryFilter, settlement?: Settlement): HistoryView {
  const sorted = events.slice().sort((a, b) => (a.on === b.on ? 0 : a.on < b.on ? 1 : -1));
  let rows: HistoryRow[];
  if (filter === 'in') rows = sorted.filter((e) => IN_TYPES.includes(e.type)).map((event) => ({ event }));
  else if (filter === 'out') rows = sorted.filter((e) => OUT_TYPES.includes(e.type)).map((event) => ({ event }));
  else if (filter === 'interest') {
    rows = settlement
      ? sorted.filter((e) => OUT_TYPES.includes(e.type)).map((event) => ({
          event,
          interest: { gross: settlement.interest, tax: settlement.tax, net: settlement.interest - settlement.tax },
        }))
      : [];
  } else rows = sorted.map((event) => ({ event }));

  let total = 0;
  for (const r of rows) {
    if (filter === 'in') total += -r.event.cash;
    else if (filter === 'interest') total += r.interest?.net ?? 0;
    else total += r.event.cash;
  }
  return { rows, total: Math.trunc(total), count: rows.length };
}
