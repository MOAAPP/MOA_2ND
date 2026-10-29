import { describe, expect, it } from 'vitest';
import { demoWorldWallet } from '../src/lib/demoWorld';
import { worldReport } from '../src/lib/worldReport';

const NOW = Date.parse('2026-10-29T20:00:00+09:00');

describe('평행세계 리포트', () => {
  const w = demoWorldWallet(NOW);
  const r = worldReport(w.decisions, '2026-10-29');

  it('합계가 결정 기록과 맞는다', () => {
    expect(r.decisions).toBe(w.decisions.length);
    expect(r.fullTotal - r.spentTotal).toBe(r.savedTotal);
    expect(r.months.reduce((s, m) => s + m.saved, 0)).toBe(r.savedTotal);
    expect(r.months.reduce((s, m) => s + m.decisions, 0)).toBe(r.decisions);
  });

  it('달은 시간 순, 크게 지킨 선택은 금액 순', () => {
    expect(r.months.map((m) => m.month)).toEqual([...r.months.map((m) => m.month)].sort());
    const s = r.top.map((t) => t.saved);
    expect(s).toEqual([...s].sort((a, b) => b - a));
    expect(r.top[0].title).toBe('무선 이어폰');
  });

  it('1년 예금 값은 세후로 원금보다 크거나 같다', () => {
    expect(r.year.net).toBeGreaterThanOrEqual(r.savedTotal);
    for (const t of r.top) expect(t.yearNet).toBeGreaterThanOrEqual(t.saved);
  });

  it('기록이 없으면 빈 리포트', () => {
    const e = worldReport([], '2026-10-29');
    expect(e.holdRate).toBeNull();
    expect(e.months).toEqual([]);
    expect(e.bestMonth).toBeNull();
  });
});
