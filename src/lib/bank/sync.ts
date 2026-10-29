/**
 * 은행 엔진 ↔ 앱 상태(worldWallet) 연결.
 * worldWallet.deposit / installment 는 '활성 계약 원금 합계'의 캐시로 유지한다(PRODUCT_SPEC §5.1).
 */
import { addDays, addMonths, isoFromEpochKST, startOfMonth, todayKST, type ISODate } from '../../../shared/dates';
import type { DecisionRecord } from '../types';
import type { WorldMovement, WorldWallet } from '../worldWallet';
import { payday, walletSummary } from '../worldWallet';
import { advance, bankTotals, type BankContext, type BankEvent, type BankResult, type BankState } from './engine';

/** 앱 안의 '오늘'(데모용 시간 이동 반영) */
export function appToday(bank: BankState, now: Date = new Date()): ISODate {
  return addDays(todayKST(now), bank.clockOffsetDays || 0);
}

interface ContextSource {
  records: DecisionRecord[];
  worldWallet: WorldWallet;
  spendLog: { date: ISODate }[];
  learning: { completed: Record<string, unknown> };
}

export function bankContext(s: ContextSource): BankContext {
  const skipDates: ISODate[] = [];
  for (const r of s.records) if (r.choice === 'skip' || r.choice === 'alt') skipDates.push(r.params.date);
  for (const d of s.worldWallet.decisions) if (d.choice !== 'buy') skipDates.push(isoFromEpochKST(d.at));
  const ledgerDates = [...s.spendLog.map((e) => e.date), ...s.records.filter((r) => r.source === 'spent').map((r) => r.params.date)];
  return { skipDates, ledgerDates, lessons: Object.keys(s.learning.completed || {}).length };
}

const kindFor = (ev: BankEvent, depositIds: Set<string>): WorldMovement['kind'] | null => {
  const dep = depositIds.has(ev.contractId);
  if (ev.type === 'missed') return null;
  if (ev.cash < 0) return dep ? 'deposit' : 'installment';
  return dep ? 'redeemDeposit' : 'cancelInstallment';
};

/** 은행 결과를 지갑에 반영: 현금 증감, 예금·적금 캐시, 거래내역 */
export function applyToWallet(w: WorldWallet, r: BankResult, on: ISODate): WorldWallet {
  const totals = bankTotals(r.bank, on);
  const depositIds = new Set(r.bank.contracts.filter((c) => c.kind === 'deposit').map((c) => c.id));
  const now = Date.now();
  const moves: WorldMovement[] = r.events
    .map((ev, i) => {
      const kind = kindFor(ev, depositIds);
      return kind ? { id: `bank-${ev.id}`, kind, amount: Math.abs(ev.cash), at: now + i, memo: ev.memo } : null;
    })
    .filter((x): x is WorldMovement => x !== null);
  return { ...w, cash: w.cash + r.cash, deposit: totals.deposit, installment: totals.installment, movements: [...(w.movements || []), ...moves] };
}

/** 지금 '이번 달 쓸 수 있는 돈' (은행 가입 한도) */
export function usableNow(w: WorldWallet): number {
  return Math.max(0, walletSummary(w).monthlyUsable);
}

/**
 * 앱 오늘까지 처리한다. 바뀐 게 없으면 null.
 * 순서: (매달 1일) 고정지출·월급 → 그날 자동이체·만기. 시간 이동으로 여러 달이 지나도 날짜 순서대로.
 */
export function catchUp(bank: BankState, w: WorldWallet, ctx: BankContext, now: Date = new Date()): { bank: BankState; wallet: WorldWallet; events: BankEvent[]; paydays: number } | null {
  const today = appToday(bank, now);
  if (bank.lastProcessed && bank.lastProcessed >= today) return null;
  if (!bank.lastProcessed) {
    const r = advance(bank, today, ctx, usableNow(w));
    return { bank: r.bank, wallet: applyToWallet(w, r, today), events: r.events, paydays: 0 };
  }
  let b = bank;
  let wallet = w;
  const events: BankEvent[] = [];
  let paydays = 0;
  let cursor = bank.lastProcessed;
  while (cursor < today) {
    const nextFirst = addMonths(startOfMonth(cursor), 1);
    const segEnd = nextFirst <= today ? addDays(nextFirst, -1) : today;
    if (segEnd > cursor) {
      const r = advance(b, segEnd, ctx, usableNow(wallet));
      b = r.bank;
      wallet = applyToWallet(wallet, r, segEnd);
      events.push(...r.events);
      cursor = segEnd;
    }
    if (nextFirst <= today) {
      wallet = payday(wallet, nextFirst);
      paydays += 1;
      const r = advance(b, nextFirst, ctx, usableNow(wallet));
      b = r.bank;
      wallet = applyToWallet(wallet, r, nextFirst);
      events.push(...r.events);
      cursor = nextFirst;
    }
  }
  return { bank: b, wallet, events, paydays };
}
