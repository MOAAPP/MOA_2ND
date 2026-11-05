import { describe, expect, it } from 'vitest';
import { isSandboxDemo } from '../src/lib/demoSandbox';

describe('canonical financial preview routing', () => {
  it('shows the shared 20-user dataset on / and unrelated tracking query strings', () => {
    expect(isSandboxDemo('')).toBe(true);
    expect(isSandboxDemo('?utm_source=chatgpt.com')).toBe(true);
    expect(isSandboxDemo('?ref=portfolio&utm_medium=browser')).toBe(true);
  });

  it('keeps the explicit isolated demo URL available', () => {
    expect(isSandboxDemo('?demo=1')).toBe(true);
    expect(isSandboxDemo('?demo=1&utm_source=chatgpt.com')).toBe(true);
    expect(isSandboxDemo('?personal=1&demo=1')).toBe(true);
  });

  it('preserves an opt-in private state and legacy onboarding route', () => {
    expect(isSandboxDemo('?personal=1')).toBe(false);
    expect(isSandboxDemo('?personal=1&intro=1')).toBe(false);
    expect(isSandboxDemo('?intro=1')).toBe(false);
  });
});
