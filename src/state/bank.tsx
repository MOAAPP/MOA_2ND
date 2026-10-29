import { useEffect, useMemo, useRef } from 'react';
import { won } from '../../shared/format';
import { bankTotals, closeEarly, openContract, payInto, type BankResult } from '../lib/bank/engine';
import type { Product } from '../lib/bank/products';
import { appToday, applyToWallet, bankContext, catchUp, usableNow } from '../lib/bank/sync';
import { useToast } from '../components/ui';
import { useStore, withEvent } from './store';
import { diffDays } from '../../shared/dates';

/** 모으기(예금·적금) 화면들이 쓰는 상태와 동작 */
export function useBank() {
  const { state, update } = useStore();
  const bank = state.bank;
  const today = appToday(bank);
  const ctx = useMemo(() => bankContext(state), [state.records, state.worldWallet, state.spendLog, state.learning]);
  const usable = usableNow(state.worldWallet);
  const totals = useMemo(() => bankTotals(bank, today), [bank, today]);

  const commit = (r: BankResult | { error: string }): string | null => {
    if ('error' in r) return r.error;
    update((s) => ({ ...s, bank: r.bank, worldWallet: applyToWallet(s.worldWallet, r, today) }));
    return null;
  };

  return {
    bank,
    today,
    ctx,
    usable,
    totals,
    freeSavings: state.worldWallet.savings || 0,
    join(p: Product, input: { amount: number; months: number; autoDay?: number; nickname?: string }): { id?: string; error?: string } {
      const r = openContract(bank, p, { ...input, openedOn: today }, ctx, usable);
      if ('error' in r) return { error: r.error };
      commit(r);
      update((s) => withEvent(s, { type: 'bank_join', kind: p.kind, productId: p.id, amount: input.amount, months: input.months, fromSaved: (s.worldWallet.savings || 0) > 0 }));
      return { id: r.bank.contracts[r.bank.contracts.length - 1].id };
    },
    pay: (id: string, amount: number) => commit(payInto(bank, id, amount, today, usable)),
    close: (id: string) => {
      const c = bank.contracts.find((x) => x.id === id);
      const err = commit(closeEarly(bank, id, today));
      if (!err && c) update((s) => withEvent(s, { type: 'bank_close_early', kind: c.kind, productId: c.productId, heldDays: diffDays(c.openedOn, today), termMonths: c.termMonths }));
      return err;
    },
    travel(days: number) {
      update((s) => ({ ...s, bank: { ...s.bank, clockOffsetDays: (s.bank.clockOffsetDays || 0) + days } }));
    },
  };
}

/** 앱 날짜가 바뀌면 자동이체·만기를 처리하고 알려준다. Shell에 한 번만 둔다. */
export function BankClock() {
  const { state, update } = useStore();
  const toast = useToast();
  const last = useRef('');
  const key = `${state.bank.clockOffsetDays}|${state.bank.lastProcessed}|${state.bank.contracts.length}`;
  useEffect(() => {
    if (last.current === key) return;
    last.current = key;
    const r = catchUp(state.bank, state.worldWallet, bankContext(state));
    if (!r) return;
    update((s) => {
      let n = { ...s, bank: r.bank, worldWallet: r.wallet };
      const ap = r.events.filter((e) => e.type === 'autoPay').length, miss = r.events.filter((e) => e.type === 'missed').length;
      if (ap || miss) n = withEvent(n, { type: 'autopay', paid: ap, missed: miss });
      for (const e of r.events.filter((x) => x.type === 'mature')) {
        const c = r.bank.contracts.find((x) => x.id === e.contractId);
        if (c) n = withEvent(n, { type: 'bank_mature', kind: c.kind, productId: c.productId });
      }
      return n;
    });
    if (r.events.length) {
      const matured = r.events.filter((e) => e.type === 'mature');
      const missed = r.events.filter((e) => e.type === 'missed').length;
      const paid = r.events.filter((e) => e.type === 'autoPay').length;
      if (matured.length) toast(`만기 ${matured.length}건 · ${won(matured.reduce((s, e) => s + e.cash, 0))}을 받았어요`);
      else if (missed) toast(`잔액이 부족해 자동이체 ${missed}건이 미납됐어요`);
      else if (paid) toast(`적금 자동이체 ${paid}건이 처리됐어요`);
    } else if (r.paydays) toast(`월급이 들어왔어요 · 고정지출을 내고 ${won(r.paydays * 270_000)}이 늘었어요`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return null;
}
