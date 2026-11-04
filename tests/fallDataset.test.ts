import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { makeFallDemo, loadFallObserved, fallDemoProfiles, FALL_DATASET_AS_OF } from '../src/lib/fallDemo';

const bytes = readFileSync(new URL('../public/data/moa-fall-observed.json.gz', import.meta.url));
const fixture = JSON.parse(gunzipSync(bytes).toString('utf8')) as {
  as_of: string; synthetic: boolean;
  profiles: Array<{user_id: string; balance_as_of: number}>;
  transactions: Array<{id: string; user_id: string; date: string; observed: number}>;
};

describe('92일 공통 합성 데이터의 프론트 관측 스냅샷', () => {
  it('10명의 관측 거래는 11/03 이전이고 정답 미래 거래가 유입되지 않는다', () => {
    expect(fixture.synthetic).toBe(true);
    expect(fixture.as_of).toBe(FALL_DATASET_AS_OF);
    expect(fixture.profiles).toHaveLength(10);
    expect(fallDemoProfiles()).toHaveLength(10);
    expect(fixture.transactions).toHaveLength(726);
    expect(new Set(fixture.transactions.map((x) => x.id)).size).toBe(fixture.transactions.length);
    expect(fixture.transactions.every((x) => x.date >= '2026-09-11' && x.date <= '2026-11-03' && x.observed === 1)).toBe(true);
  });

  it('선택한 프로필의 관측 금액이 결제계좌·가상 지갑·가계부에 함께 반영된다', async () => {
    const original = globalThis.fetch;
    vi.stubGlobal('fetch', async () => new Response(new Uint8Array(bytes), { status: 200 }));
    try {
      const raw = await loadFallObserved();
      expect(raw.profiles).toHaveLength(10);
      const chosen = await makeFallDemo('U03');
      const src = fixture.profiles.find((x) => x.user_id === 'U03')!;
      expect(chosen.demoProfileId).toBe('U03');
      expect(chosen.profile.baseBalance).toBe(src.balance_as_of);
      expect(chosen.moa.anchor?.balance).toBe(src.balance_as_of);
      expect(chosen.worldWallet.cash).toBe(src.balance_as_of);
      expect(chosen.spendLog.length).toBeGreaterThan(10);
      expect(chosen.spendLog.every((x) => x.date <= '2026-11-03' && x.from === 'demo')).toBe(true);
      expect(chosen.moa.txns.every((x) => x.date <= '2026-11-03' && x.source === 'demo')).toBe(true);
    } finally {
      vi.stubGlobal('fetch', original);
      vi.unstubAllGlobals();
    }
  });
});
