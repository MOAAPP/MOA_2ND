import { useCallback, useEffect, useState } from 'react';
import { getDemoHome, type HomeDay, type HomeState } from './stage3Api';
import { getMorningBriefing, type MorningBriefing } from './stage6Api';

/**
 * Home money facts for the synthetic account, from FastAPI only.
 *
 * - `home.daily_cashflow`   : scheduled payments + predicted variable spending (예상)
 * - `schedule.daily_cashflow`: scheduled payments/income only (확정 일정)
 * - `briefing`              : spending capacity + optional qualitative AI text
 *
 * React never re-computes a balance: every number shown comes from one of
 * these responses. The core `home` request decides loading/error; the other
 * two are optional and fail independently (a dead briefing never hides cash).
 */
const configured = (import.meta.env.VITE_FINANCE_API_BASE ?? '').replace(/\/$/, '');
const api = configured ? configured + (configured.endsWith('/api/v4') ? '' : '/api/v4') : '/api/v4';

export interface ScheduleCashflow {
  user_id: string;
  available_cash: number;
  daily_cashflow: HomeDay[];
}

export async function getScheduleCashflow(user: string, day: string, signal?: AbortSignal): Promise<ScheduleCashflow> {
  const res = await fetch(`${api}/users/${encodeURIComponent(user)}/cashflow?as_of=${encodeURIComponent(day)}&horizon_days=14`,
    { signal, headers: { Accept: 'application/json' } });
  const data: unknown = await res.json().catch(() => null);
  const ok = !!data && typeof data === 'object' && (data as ScheduleCashflow).user_id === user &&
    Array.isArray((data as ScheduleCashflow).daily_cashflow);
  if (!res.ok || !ok) throw new Error(`schedule cashflow unavailable (${res.status})`);
  return data as ScheduleCashflow;
}

export type HomeFinanceStatus = 'loading' | 'ready' | 'error';

export interface HomeFinance {
  key: string;
  status: HomeFinanceStatus;
  home: HomeState | null;
  schedule: ScheduleCashflow | null;
  briefing: MorningBriefing | null;
  error: string;
  retry: () => void;
}

export function useHomeFinance(user: string, day: string, enabled = true): HomeFinance {
  const key = `${user}@${day}`;
  const [attempt, setAttempt] = useState(0);
  const [data, setData] = useState<Omit<HomeFinance, 'retry'>>({
    key, status: 'loading', home: null, schedule: null, briefing: null, error: '',
  });

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    // Clear immediately so a previous user/date is never shown under a new key.
    setData({ key, status: 'loading', home: null, schedule: null, briefing: null, error: '' });
    const optional = <T,>(p: Promise<T>) => p.catch(() => null);
    void Promise.all([
      getDemoHome(user, day, ctrl.signal),
      optional(getScheduleCashflow(user, day, ctrl.signal)),
      optional(getMorningBriefing(user, day, ctrl.signal)),
    ]).then(([home, schedule, briefing]) => {
      if (ctrl.signal.aborted) return;
      setData({ key, status: 'ready', home, schedule, briefing, error: '' });
    }).catch((e: unknown) => {
      if (ctrl.signal.aborted) return;
      setData({ key, status: 'error', home: null, schedule: null, briefing: null,
        error: e instanceof Error ? e.message : '금융 계산 서버에 연결하지 못했어요.' });
    });
    return () => ctrl.abort();
  }, [key, user, day, enabled, attempt]);

  const retry = useCallback(() => setAttempt(v => v + 1), []);
  // Guard against a stale render between key change and effect.
  if (data.key !== key) return { key, status: 'loading', home: null, schedule: null, briefing: null, error: '', retry };
  return { ...data, retry };
}

/** First day whose balance goes below zero (uses the API's own lowest/closing values). */
export function firstDip(days: HomeDay[]) {
  return days.find(d => Math.min(d.lowest_balance, d.closing_balance) < 0) ?? null;
}
