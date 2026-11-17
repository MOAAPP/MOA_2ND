import { describe, expect, it } from 'vitest';
import { initialState, resetCurrentAccount, userProtection } from '../src/state/store';
import { seedDemoState } from '../src/lib/demoSeed';
import { emptyMoa } from '../src/lib/moa/types';
import { upsertSchedule } from '../src/lib/moa';
import { isEmptyWorld } from '../src/lib/demoWorld';
import { walletSummary } from '../src/lib/worldWallet';
import { exampleCoach } from '../src/lib/ai/example';

describe('예시 계정과 직접 가입 계정의 분리', () => {
  it('신규 상태에는 예시 계정의 평행세계·가계부 기록이 없다', () => {
    const s = initialState();
    expect(s.demo).toBe(false);
    expect(isEmptyWorld(s.worldWallet)).toBe(true);
    expect(s.spendLog).toHaveLength(0);
    expect(s.moa.schedule).toHaveLength(0);
  });

  it('필수지출·지켜둘 돈은 사용자가 등록한 값만 쓴다', () => {
    let moa = emptyMoa();
    moa = upsertSchedule(moa, { name: '통신비', amount: 55_000, day: 22, recurrence: 'monthly', direction: 'out', essential: true });
    moa = upsertSchedule(moa, { name: '월급', amount: 1_000_000, day: 25, recurrence: 'monthly', direction: 'in', essential: false, status: 'scheduled' });
    const p = userProtection({ moa, profile: { minBalance: 100_000 } as never }, '2026-11-17');
    expect(p).toEqual({ fixedBills: 55_000, safetyBuffer: 100_000 });
    const w = { ...initialState().worldWallet, cash: 500_000, ...p };
    expect(walletSummary(w).monthlyUsable).toBe(500_000 - 55_000 - 100_000);
    // 등록한 일정이 없으면 예시 기본값(53만·15만)이 아니라 0원으로 계산한다
    const none = userProtection({ moa: emptyMoa(), profile: null }, '2026-11-17');
    expect(none).toEqual({ fixedBills: 0, safetyBuffer: 0 });
  });
});

describe('현재 계정 초기화', () => {
  it('예시 계정: 추가한 참음·지출 기록이 지워지고 처음 예시 상태로 돌아간다', () => {
    const base = seedDemoState(initialState());
    const dirty = {
      ...base,
      worldWallet: { ...base.worldWallet, decisions: [...base.worldWallet.decisions,
        { id: 'x-buds', title: '무선 이어폰', price: 159_000, paid: 0, choice: 'wait' as const, at: Date.now(), note: '' }] },
      spendLog: [...base.spendLog, { date: '2026-11-04', amount: 1, name: 'test', category: '기타', from: 'record' as const }],
    };
    const r = resetCurrentAccount(dirty);
    expect(r.demo).toBe(true);
    expect(r.worldWallet.decisions.some((d) => d.id === 'x-buds')).toBe(false);
    expect(r.worldWallet.decisions.length).toBe(base.worldWallet.decisions.length);
    expect(r.spendLog.length).toBe(base.spendLog.length);
  });

  it('직접 가입 계정: 기록은 비우고 설정은 유지, 예시 데이터는 섞이지 않는다', () => {
    const s = { ...initialState(), introSeen: true, settings: { reduceMotion: true, autoSendDiscord: false, discordConsent: true } };
    const r = resetCurrentAccount({ ...s, profile: { baseBalance: 1 } as never, records: [{ id: 'a' } as never] });
    expect(r.demo).toBe(false);
    expect(r.profile).toBeNull();
    expect(r.records).toHaveLength(0);
    expect(r.introSeen).toBe(true);
    expect(r.settings.reduceMotion).toBe(true);
  });
});

describe('AI 코치 문장은 화면과 같은 숫자를 쓴다', () => {
  const base = { item: '이어폰', category: '쇼핑', price: 159_000, frequency: 'once' as const, usableNow: 22_000, yearGap: 0, categoryCount30: 0, categorySpentThisMonth: 0 };
  it('통장은 남고 지켜둘 돈만 깨지면 통장 마이너스라고 하지 않는다', () => {
    const out = exampleCoach({ ...base, usableAfter: -137_000, afterBills: 13_000 });
    expect(out.message).toContain('137,000원');
    expect(out.message).toContain('지켜둘 돈');
    expect(out.message).not.toContain('모자라요');
  });
  it('통장이 실제로 모자랄 때만 통장 마이너스라고 한다', () => {
    const out = exampleCoach({ ...base, usableAfter: -287_000, afterBills: -137_000 });
    expect(out.message).toContain('137,000원');
    expect(out.message).toContain('마이너스');
  });
});
