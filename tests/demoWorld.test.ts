import { describe, expect, it } from 'vitest';
import { demoWorldWallet, isEmptyWorld } from '../src/lib/demoWorld';
import { historyEvents, worldHistory } from '../src/lib/worldHistory';
import { WORLD_START_CASH, emptyWorldWallet, payday, walletSummary } from '../src/lib/worldWallet';

const NOW = Date.parse('2026-10-29T20:00:00+09:00');

describe('체험용 평행세계 기록', () => {
  const w = demoWorldWallet(NOW);

  it('현금이 기록 합계와 정확히 맞는다(그래프 보정 0)', () => {
    const sum = historyEvents(w).reduce((s, e) => s + e.cashDelta, 0);
    expect(w.cash).toBe(WORLD_START_CASH + sum);
  });

  it('들어가자마자 두 세계가 갈라져 있다', () => {
    for (const days of [7, 30, 90]) {
      const p = worldHistory(w, days, NOW);
      expect(p).toHaveLength(days);
      expect(p.at(-1)!.gap).toBeGreaterThan(0);
    }
    const p90 = worldHistory(w, 90, NOW);
    expect(p90.at(-1)!.gap).toBeGreaterThan(p90[0].gap);
    expect(p90.filter((x) => x.events.length).length).toBeGreaterThan(10);
  });

  it('잔액은 음수가 되지 않아야 하지만 보호 생활비를 못 지키는 날은 그대로 위험을 표시한다', () => {
    const protectedCash = 530_000 + 150_000;
    const points = worldHistory(w, 90, NOW);
    expect(points.every((x) => x.actual >= -protectedCash)).toBe(true);
    // An intentionally risky synthetic history must not be silently clamped to zero.
    expect(points.at(-1)!.actual).toBe(walletSummary(w).monthlyUsable);
    expect(w.cash).toBeGreaterThanOrEqual(0);
  });

  it('미래 시각 기록이 없고, 이번 달 월급은 중복 입금되지 않는다', () => {
    expect(historyEvents(w).every((e) => e.at <= NOW)).toBe(true);
    expect(payday(w, '2026-10-01')).toBe(w);
  });

  it('빈 지갑만 예시 대상으로 본다', () => {
    expect(isEmptyWorld(emptyWorldWallet())).toBe(true);
    expect(isEmptyWorld(payday(emptyWorldWallet(), '2026-10-01'))).toBe(true);
    expect(isEmptyWorld(w)).toBe(false);
  });
});
