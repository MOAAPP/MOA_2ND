/**
 * Read-only FastAPI -> existing demo store bridge.
 * Only MODE=demo may use these synthetic 20-persona endpoints.
 * Never upload or modify personal-mode localStorage financial details.
 */
import { MODE, setState } from './store';
import { DEMO_AS_OF, mapDemoSnapshot, type DemoHome, type DemoLedger,
  type DemoSchedules, type DemoUserId } from './demoFinanceMap';

let latestRequest = 0;

async function getJson<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await fetch('/api/v4' + path, {
    method: 'GET', headers: { Accept: 'application/json' }, signal,
  });
  if (!response.ok) throw new Error('demo_backend_http_' + response.status);
  if (!(response.headers.get('content-type') || '').includes('application/json')) {
    throw new Error('demo_backend_invalid_content_type');
  }
  return await response.json() as T;
}

/**
 * All three endpoints must agree on user ID and 2026-11-04.
 * The old canned 420,000 KRW demo balance is never treated as the API result.
 * Commit once, atomically, after all responses validate. A slower previous
 * user selection cannot overwrite the most recently selected user.
 */
export async function syncDemoFinance(user: DemoUserId = 'S01'): Promise<boolean> {
  if (MODE !== 'demo') return false;
  const id = ++latestRequest;
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 15000);
  try {
    const userPath = '/users/' + encodeURIComponent(user);
    const date = '?as_of=' + encodeURIComponent(DEMO_AS_OF);
    const [home, ledger, schedules] = await Promise.all([
      getJson<DemoHome>(userPath + '/home' + date, controller.signal),
      getJson<DemoLedger>(userPath + '/transactions' + date + '&limit=1000', controller.signal),
      getJson<DemoSchedules>(userPath + '/schedules' + date, controller.signal),
    ]);
    const mapped = mapDemoSnapshot(user, home, ledger, schedules);
    if (id !== latestRequest) return true; // superseded by newer persona request
    setState(s => ({
      demoUserId: user,
      demoFinanceReady: true,
      profile: {
        ...s.profile,
        name: user,
        payday: mapped.payday,
        monthlyBudget: 0, // backend has no confirmed category budget for this user
      },
      finance: {
        balance: mapped.balance,
        salary: mapped.salary,
        minBalance: 0, // no user-selected cash buffer in canonical dataset
      },
      bills: mapped.bills,
      txs: mapped.txs,
      // Virtual savings are local practice records, not backend cash assets.
      // Do not carry S01's practice deposits into S08 when personas change.
      savings: s.demoUserId === user ? s.savings : [],
      budgets: Object.fromEntries(Object.keys(s.budgets).map(key => [key, 0])), // preserve category keys, no canned budget
    }));
    return true;
  } catch {
    // Keep current (same-persona) data on a switch failure.
    // On first startup the demo has zero/empty finance, never fictitious numbers.
    return id !== latestRequest;
  } finally {
    window.clearTimeout(timer);
  }
}
