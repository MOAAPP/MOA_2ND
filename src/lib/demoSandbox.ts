/** Canonical 20-user synthetic preview is the public landing experience.
 * ?demo=1 forces an isolated demo session. Legacy personal data is accessible
 * only with ?personal=1 (or an explicit ?intro=1 onboarding session).
 * None of these demo routes read or overwrite the saved personal ledger.
 */
export function isSandboxDemo(search: string): boolean {
  const params = new URLSearchParams(search);
  if (params.get('demo') === '1') return true;
  return params.get('personal') !== '1' && !params.has('intro');
}
