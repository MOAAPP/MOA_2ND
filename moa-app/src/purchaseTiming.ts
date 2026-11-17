/**
 * 구매 연기 목표 보호: '매월 저축하기로 약속한 금액'을 예정 계좌이체로 반영합니다.
 * 실제 송금/예금 생성은 하지 않으며, 모든 판정은 FastAPI의 개인 현금흐름 엔진에 맡깁니다.
 */
import type { PersonalPath, PersonalPlannedTransaction } from './api'
import { addDays, daysBetween, iso, parseISO } from './lib'

export const MAX_RECOMMEND_DAYS = 76
export const COMPARISON_HORIZON_DAYS = 90

export function savingsPlans(asOf: string, amount: number, dayOfMonth: number): PersonalPlannedTransaction[] {
  if (!Number.isSafeInteger(amount) || amount < 1000 || amount > 100000000) return []
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) return []
  const base = parseISO(asOf)
  const end = addDays(base, COMPARISON_HORIZON_DAYS)
  const plans: PersonalPlannedTransaction[] = []
  for (let i = 0; i < 5; i++) {
    const y = base.getFullYear()
    const m = base.getMonth() + i
    const last = new Date(y, m + 1, 0).getDate()
    const transferAt = new Date(y, m, Math.min(dayOfMonth, last))
    if (transferAt > base && transferAt <= end) {
      plans.push({ date: iso(transferAt), amount, kind: 'transfer', payment_method: 'transfer' })
    }
  }
  return plans
}

export function candidateDates(from: Date, paydayNextDay: string, selectedDate: string) {
  const offsets = [7, 14, 21, 30, 45, 60, MAX_RECOMMEND_DAYS]
  const dates = [...offsets.map((days) => iso(addDays(from, days))), paydayNextDay, selectedDate]
  return Array.from(new Set(dates))
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && iso(parseISO(d)) === d)
    .filter((d) => {
      const n = daysBetween(from, parseISO(d))
      return n >= 1 && n <= MAX_RECOMMEND_DAYS
    })
    .sort()
}

export const pathIsSafe = (p: PersonalPath | undefined | null) =>
  !!p && p.status === 'calculated' && p.minimum_balance_met && p.essential_payments_covered

export type TimingCandidate = {
  date: string
  safe: boolean
  minimumBalance: number
  firstShortfall: string | null
  nowSafe: boolean
}

export function chooseTimingCandidate(candidates: TimingCandidate[]) {
  // '이 날짜가 절대 가장 안전하다'는 뜻이 아니라, 확인한 후보 중
  // 현금흐름 제약을 지키는 가장 이른 날짜를 고릅니다.
  return [...candidates].sort((a, b) => a.date.localeCompare(b.date)).find((c) => c.safe) ?? null
}
