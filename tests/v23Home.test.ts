import { describe, expect, it } from 'vitest';
import { firstDip } from '../src/lib/homeFinance';
import { buildCompareRequest } from '../src/components/HomeCompare';

const day = (date: string, closing: number, lowest = closing) =>
  ({ date, opening_balance: 0, inflow: 0, outflow: 0, closing_balance: closing, lowest_balance: lowest, events: [] });

describe('V23 home helpers', () => {
  it('firstDip uses API lowest/closing values and does not recompute balances', () => {
    expect(firstDip([day('2026-11-05', 10800), day('2026-11-08', -8200)])?.date).toBe('2026-11-08');
    // intra-day dip before income still counts
    expect(firstDip([day('2026-11-10', 723039, -226961)])?.date).toBe('2026-11-10');
    expect(firstDip([day('2026-11-05', 1)])).toBeNull();
  });

  it('compare request purchases after the observed cutoff and caps allocation at payment cash', () => {
    const r = buildCompareRequest('S01', '2026-11-04', 30000, 27800);
    expect(r.purchase_date).toBe('2026-11-05');
    expect(r.purchase_amount).toBe(30000);
    const a = r.allocation;
    expect(a.purchase + a.savings + a.investment + a.cash).toBe(27800);
    expect(r.horizon_days).toBe(14);
    // negative cash never produces a negative allocation
    const neg = buildCompareRequest('S02', '2026-11-04', 10000, -5000).allocation;
    expect(Object.values(neg).every(v => v === 0)).toBe(true);
  });
});
