import { describe, expect, it } from 'vitest';
import { isSandboxDemo } from '../src/lib/demoSandbox';
import { initialState } from '../src/state/store';
import { seedDemoState } from '../src/lib/demoSeed';

describe('isolated S01 demo entry', () => {
  it('shows the canonical finance demo on the landing URL but not the opted-in personal session', () => {
    expect(isSandboxDemo('?demo=1')).toBe(true);
    expect(isSandboxDemo('?intro=1&demo=1')).toBe(true);
    expect(isSandboxDemo('')).toBe(true);
    expect(isSandboxDemo('?utm_source=chatgpt.com')).toBe(true);
    expect(isSandboxDemo('?personal=1')).toBe(false);
    expect(isSandboxDemo('?intro=1')).toBe(false);
  });
  it('starts from S01 observations without changing the original app state', () => {
    const personal = initialState();
    const demo = seedDemoState(personal);
    expect(personal.demo).toBe(false);
    expect(personal.profile).toBeNull();
    expect(demo.demo).toBe(true);
    expect(demo.demoDay).toBe('2026-11-04');
    expect(demo.profile?.baseBalance).toBe(27800);
    expect(demo.spendLog.filter(e => e.date === '2026-11-04')).toHaveLength(5);
    expect(demo.spendLog.filter(e => e.date === '2026-11-04').reduce((sum,e) => sum+e.amount,0)).toBe(31000);
  });
});
