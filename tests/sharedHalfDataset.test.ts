import { describe, expect, it } from 'vitest';
import half from '../src/data/moa-half1.json';
import { demoData } from '../src/lib/demo';
import { demoMoa } from '../src/lib/moa/bridge';
import { demoWorldWalletFromShared } from '../src/lib/demoWorld';
import { walletSummary, WORLD_START_CASH } from '../src/lib/worldWallet';

const now = Date.parse('2026-11-04T10:00:00+09:00');
describe('shared MOA synthetic fixture · 2026-09-11~10-26', () => {
  it('includes 46 complete calendar dates for every one of the 10 fictional personas', () => {
    expect(half.metadata.start_date).toBe('2026-09-11');
    expect(half.metadata.end_date).toBe('2026-10-26');
    expect(half.profiles).toHaveLength(10);
    expect(half.daily).toHaveLength(460);
    const unique = new Set(half.daily.map((d) => d.user_id + ':' + d.date));
    expect(unique.size).toBe(460);
    expect(half.transactions).toHaveLength(872);
  });
  it('never treats incomplete logs as confirmed 0 KRW labels', () => {
    expect(half.daily.some((x) => !x.observation_complete)).toBe(true);
    for (const d of half.daily) {
      if (!d.observation_complete) expect(d.model_label).toBeNull();
      else expect(d.model_label).toBe(d.true_variable_spend);
    }
  });
  it('has date-ordered split boundaries without accidentally leaking the second 46 days', () => {
    for (const d of half.daily) {
      expect(d.date >= '2026-09-11' && d.date <= '2026-10-26').toBe(true);
      expect(d.split).toBe(d.date <= '2026-10-10' ? 'train' : d.date <= '2026-10-18' ? 'validation' : 'test');
    }
  });
  it('uses exactly the same S01 transactions in the ledger and payment-account demo', () => {
    const ledger = demoData(now), payment = demoMoa(now);
    const spend = payment.txns.filter((x) => x.kind === 'spend' && !x.essential);
    expect(ledger.spendLog).toHaveLength(spend.length);
    expect(new Set(ledger.spendLog.map((x) => x.txnId))).toEqual(new Set(spend.map((x) => x.id)));
    expect(ledger.profile.baseBalance).toBe(payment.anchor?.balance);
    expect(payment.dayStatus).toEqual({});
    expect(ledger.spendLog.every((x) => x.date <= '2026-10-26')).toBe(true);
  });
  it('keeps virtual shares separate from spendable cash and balances movements to start cash', () => {
    const wallet = demoWorldWalletFromShared(now);
    expect(wallet.etfs['360750'].qty).toBe(1);
    const inflows = wallet.movements.filter((m) => ['income','sellStock'].includes(m.kind)).reduce((s,m)=>s+m.amount,0);
    const outflows = wallet.movements.filter((m) => ['bills','buyStock'].includes(m.kind)).reduce((s,m)=>s+m.amount,0);
    expect(wallet.cash).toBe(WORLD_START_CASH+inflows-outflows-wallet.decisions.reduce((s,d)=>s+d.paid,0));
    expect(walletSummary(wallet).totalAssets).toBe(wallet.cash+walletSummary(wallet).stockValue);
    expect(wallet.movements.every((x) => x.at <= now)).toBe(true);
  });
});
