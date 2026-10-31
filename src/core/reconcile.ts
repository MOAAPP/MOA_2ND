/**
 * 실잔액 대조 (기획서 '1순위: 현금흐름 계산 엔진 테스트', '기록 일부 누락' 한계 상황).
 *
 * 잔액이 찍힌 관측 두 개 사이의 확정 거래와 자동이체 일정을 계산 엔진에 넣어,
 * 계산 잔고와 관측 잔액의 차이를 잰다. 차이가 나면 기록이 비는 구간으로 표시하고 등급을 낮춘다.
 */
import { kstDate } from './time';
import type { Posting } from './ledger';
import { expandFixed } from './schedule';
import type { AccountRef, BalanceObservation, FixedItem, Ms, Txn } from './types';

export interface ReconcileItem {
  from: Ms;
  to: Ms;
  expected: number;
  observed: number;
  diff: number;
  mismatch: boolean;
  /** 사용자가 원인을 분류 (계산 규칙 오류는 평가에서 절대 빼지 않는다) */
  cause?: 'rule_error' | 'missing_txn' | 'other';
}

export function reconcileBalances(obs: BalanceObservation[], postings: Posting[], fixed: FixedItem[], txns: Txn[], paymentAccountId: AccountRef): ReconcileItem[] {
  const list = obs.filter((o) => o.accountId === paymentAccountId).sort((a, b) => a.at - b.at);
  const out: ReconcileItem[] = [];
  for (let i = 1; i < list.length; i++) {
    const a = list[i - 1];
    const b = list[i];
    const sched = expandFixed(fixed, a.at, kstDate(b.at), txns);
    const moves = [...postings.filter((p) => p.status === 'confirmed'), ...sched].filter((p) => p.accountId === paymentAccountId && p.debitAt > a.at && p.debitAt <= b.at);
    const expected = a.balance + moves.reduce((s, p) => s + p.amount, 0);
    const diff = b.balance - expected;
    out.push({ from: a.at, to: b.at, expected, observed: b.balance, diff, mismatch: diff !== 0 });
  }
  return out;
}

/** 최근 이 기간 안에 불일치가 있으면 '기록이 비는 구간'으로 보고 등급을 '주의'까지로 제한 */
export const GAP_LOOKBACK_MS = 14 * 86_400_000;

export function hasRecentGap(items: ReconcileItem[], now: Ms): boolean {
  return items.some((x) => x.mismatch && now - x.to <= GAP_LOOKBACK_MS);
}

/** 평가 대상 전체 구간 중 불일치 비율 (원인별) */
export function mismatchSummary(items: ReconcileItem[]) {
  const n = items.length;
  const bad = items.filter((x) => x.mismatch);
  const by = (c: ReconcileItem['cause']) => bad.filter((x) => x.cause === c).length;
  return { n, mismatches: bad.length, rate: n ? bad.length / n : null, ruleError: by('rule_error'), missingTxn: by('missing_txn'), other: by('other'), unclassified: bad.filter((x) => !x.cause).length };
}
