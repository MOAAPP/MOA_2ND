import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { appDay, appNow } from '../lib/appClock';
import { todayKST } from '../../shared/dates';
import { addTxns, addTxnsChecked, assessRisk, decideAlerts, pushAlerts, type MoaState, type NewTxn, type RiskOptions } from '../lib/moa';
import { profileFromMoa, spendEntryOf } from '../lib/moa/bridge';
import { useStore } from './store';

/** 1분마다 바뀌는 현재 시각 (자정이 지나면 오늘 날짜도 바뀐다) */
function useNow(stepMs = 60_000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), stepMs);
    return () => window.clearInterval(t);
  }, [stepMs]);
  return now;
}

export function useMoa(opts: RiskOptions = {}) {
  const { state, update } = useStore();
  const wallNow = useNow();
  const now = appNow(state, wallNow);
  const today = appDay(state, new Date(wallNow));
  const optKey = JSON.stringify(opts);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const report = useMemo(() => assessRisk(state.moa, now, today, opts), [state.moa, now, today, optKey]);

  /** 모아 상태를 바꾸고, 기존 화면이 쓰는 Profile도 같은 기준으로 맞춘다 */
  const set = useCallback(
    (f: (m: MoaState) => MoaState) =>
      update((s) => {
        const moa = f(s.moa);
        return { ...s, moa, profile: s.profile ? profileFromMoa(moa, s.profile) : s.profile };
      }),
    [update],
  );

  /** 거래 저장: 모아 엔진 + 가계부 목록. 이미 저장된 자동 기록은 건너뛰고, 저장·건너뜀 건수를 돌려준다. */
  const saveTxns = useCallback(
    (list: NewTxn[]): { saved: number; skipped: number } => {
      const preview = addTxnsChecked(state.moa, list);
      update((s) => {
        const before = new Set(s.moa.txns.map((t) => t.id));
        let moa = addTxns(s.moa, list);
        const added = moa.txns.filter((t) => !before.has(t.id));
        // S01's opening anchor is an already reconciled end-of-day balance.
        // Newly entered spending for that same snapshot date is not in B0 yet.
        // Update it ONCE when the spend is recorded; future-day spending is
        // after the anchor and will be projected by the standard ledger.
        if (s.demo && moa.anchor) {
          const anchorDay = todayKST(new Date(moa.anchor.at));
          const newlyDebited = added
            .filter(t => t.date === anchorDay && t.occurredAt <= moa.anchor!.at &&
              t.account === 'pay' && t.kind === 'spend' &&
              ['debit', 'transfer', 'atm'].includes(t.method))
            .reduce((sum, t) => sum + t.amount, 0);
          if (newlyDebited > 0) {
            moa = { ...moa, anchor: { ...moa.anchor, balance: moa.anchor.balance - newlyDebited } };
          }
        }
        const entries = added.map(spendEntryOf).filter((e): e is NonNullable<typeof e> => !!e);
        return { ...s, moa, spendLog: [...s.spendLog, ...entries], profile: s.profile ? profileFromMoa(moa, s.profile) : s.profile };
      });
      return { saved: preview.added.length, skipped: preview.skipped.length };
    },
    [update, state.moa],
  );

  return { moa: state.moa, report, today, now, set, saveTxns };
}

/**
 * 알림 규칙을 앱이 열려 있는 동안 계속 돌린다.
 * 새 기록이 들어오면 그날 계산을 바로 다시 하고, 보낼 알림이 생기면 알림함에 넣고(허용했다면) 브라우저 알림도 띄운다.
 */
export function MoaAlertsDaemon() {
  const { moa, report, now, set } = useMoa();
  const last = useRef('');
  useEffect(() => {
    if (!report.hasAnchor) return;
    const fresh = decideAlerts(report, moa.alerts, now);
    if (!fresh.length) return;
    const key = fresh.map((a) => `${a.key}${a.trigger}`).join('|');
    if (key === last.current) return;
    last.current = key;
    set((m) => pushAlerts(m, fresh));
    try {
      if ('Notification' in window && Notification.permission === 'granted') {
        for (const a of fresh) new Notification('모아', { body: a.text, tag: a.key, icon: '/icon-192.png' });
      }
    } catch {
      /* 알림을 못 띄워도 알림함에는 남는다 */
    }
  }, [report, moa.alerts, now, set]);
  return null;
}
