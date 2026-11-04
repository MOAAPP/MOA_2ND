/** Explicit, non-persistent synthetic demo session. Never mutates normal localStorage. */
export function isSandboxDemo(search: string): boolean {
  return new URLSearchParams(search).get('demo') === '1';
}
