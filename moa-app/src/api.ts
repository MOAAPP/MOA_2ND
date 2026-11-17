/**
 * MOA 서버 연결.
 * - /api/v4/*  → Vercel 함수(moa-gateway)가 서버 전용 키를 붙여 EC2 FastAPI(MOA_2ND_BE)로 전달
 * - /api/*     → 같은 프로젝트의 Node 함수 (시세 · AI 문장 · Discord)
 * 서버가 응답하지 않으면 null을 돌려주고, 화면은 앱 안의 계산으로 계속 동작한다.
 */
import type { ScheduleItem } from './lib'

const BASE = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, '') ?? ''

export type ApiHealth = { finance: boolean; node: boolean; ai: boolean; quotes: string | null; discord: boolean }

const deviceId = (() => {
  try {
    let id = localStorage.getItem('moa.device')
    if (!id) {
      id = crypto.randomUUID()
      localStorage.setItem('moa.device', id)
    }
    return id
  } catch {
    return '00000000-0000-4000-8000-000000000000'
  }
})()

async function call<T>(path: string, init?: RequestInit & { timeout?: number }): Promise<T | null> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), init?.timeout ?? 9000)
  try {
    const res = await fetch(BASE + path, {
      ...init,
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json', 'X-Device-Id': deviceId, ...(init?.headers ?? {}) },
    })
    if (!res.ok) return null
    const type = res.headers.get('content-type') ?? ''
    if (!type.includes('json')) return null
    return (await res.json()) as T
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

const post = <T,>(path: string, body: unknown, timeout?: number) => call<T>(path, { method: 'POST', body: JSON.stringify(body), timeout })

/* ---------- health ---------- */

export async function health(): Promise<ApiHealth> {
  const [fin, node, ai] = await Promise.all([
    call<{ status: string }>('/api/v4/health', { timeout: 6000 }),
    call<{ ok: boolean; ai: boolean; discord: boolean; market?: { primary?: string } }>('/api/health', { timeout: 6000 }),
    call<{ llm_configured: boolean }>('/api/v4/ai/status', { timeout: 6000 }),
  ])
  return {
    finance: fin?.status === 'ok',
    node: !!node?.ok,
    ai: !!node?.ai || !!ai?.llm_configured,
    quotes: node?.market?.primary ?? null,
    discord: !!node?.discord,
  }
}

/* ---------- FastAPI: 직접 입력한 숫자로 구매 비교 (저장 안 함) ---------- */

export type PersonalPath = {
  scenario_id: 'purchase_now' | 'no_purchase' | 'purchase_delay' | 'virtual_savings' | 'virtual_investment' | 'mixed'
  status: 'calculated' | 'out_of_horizon'
  ending_balance: number
  minimum_balance: number
  minimum_balance_met: boolean
  essential_payments_covered: boolean
  first_shortfall_date: string | null
  daily_cashflow: { date: string; closing_balance: number; lowest_balance: number }[]
}

export type PersonalCompare = { paths: PersonalPath[]; horizon_days: number; forecast_source: string }

const BILL_KIND = (title: string) =>
  /카드/.test(title) ? 'card' : /통신|폰/.test(title) ? 'phone' : /구독/.test(title) ? 'subscription' : /월세|관리비/.test(title) ? 'rent' : 'etc'

export function personalCompare(input: {
  asOf: string
  balance: number
  keep: number
  salary: number
  payday: number
  daily: number
  schedule: ScheduleItem[]
  amount: number
  horizon: number
  delay: number
}) {
  return post<PersonalCompare>(
    '/api/v4/personal/compare',
    {
      snapshot: {
        as_of: input.asOf,
        balance: Math.max(0, Math.round(input.balance)),
        minimum_balance: input.keep,
        monthly_income: input.salary,
        payday: input.payday,
        monthly_variable_budget: input.daily * 30,
        bills: input.schedule.map((b) => ({ day: b.day, amount: b.amount, kind: BILL_KIND(b.title) })),
      },
      purchase_amount: Math.max(1000, Math.round(input.amount)),
      horizon_days: Math.min(90, Math.max(7, input.horizon)),
      payment_method: 'debit',
      purchase_delay_days: Math.min(90, Math.max(1, input.delay)),
    },
    12000,
  )
}

/* ---------- FastAPI: 개인별 1일 1문제 ---------- */

export type DailyQuiz = {
  id: string
  topic: string
  question: string
  options: string[]
  hint: string | null
  answer_record: { choice: number; correct: boolean } | null
  explanation: string | null
  correct_answer: number | null
}

export const dailyQuiz = (userId: string) => call<DailyQuiz>(`/api/v4/users/${userId}/daily-quiz`)

export const answerQuiz = (userId: string, quizId: string, choice: number) =>
  post<DailyQuiz>(`/api/v4/users/${userId}/daily-quiz/answer`, {
    quiz_id: quizId,
    choice,
  })

/* ---------- Node: AI 문장 (숫자는 앱이 계산, AI는 말만 다듬음) ---------- */

type AiResp<T> = { data: T; meta: { source: string; model: string } }

export type CoachOut = { tone: 'ok' | 'careful' | 'warn'; message: string; tip: string | null }
export const aiCoach = (input: {
  item: string
  category: string
  price: number
  frequency: 'once' | 'weekly' | 'daily'
  usableNow: number
  usableAfter: number
  afterBills: number
  yearGap: number
  categorySpentThisMonth: number
  categoryCount30: number
}) => post<AiResp<CoachOut>>('/api/ai/coach', { input }, 20000)

export type BriefOut = { headline: string; body: string; action: { label: string; to: 'choose' | 'ledger' | 'save' | 'forks' } | null }
export const aiBrief = (input: {
  usable: number
  daysLeftInMonth: number
  monthSpent: number
  lastMonthSameDay: number | null
  topCategory: { name: string; amount: number } | null
  savedThisMonth: number
  holdsThisMonth: number
  nextBill: { date: string; amount: number } | null
}) => post<AiResp<BriefOut>>('/api/ai/brief', { input }, 20000)

export type LedgerSummaryOut = { title: string; points: string[] }
export const aiLedgerSummary = (input: {
  month: string
  total: number
  prevTotal: number | null
  count: number
  elapsedDays: number
  byCategory: { name: string; amount: number }[]
  busiestWeekday: { day: string; average: number } | null
  biggest: { name: string; amount: number } | null
}) => post<AiResp<LedgerSummaryOut>>('/api/ai/ledgerSummary', { input }, 20000)

/** 같은 입력이면 하루 동안 다시 부르지 않는다 (AI 크레딧 절약) */
export async function cached<T>(key: string, fn: () => Promise<T | null>): Promise<T | null> {
  const k = 'moa.ai.v10.' + new Date().toISOString().slice(0, 10) + '.' + key
  try {
    const hit = localStorage.getItem(k)
    if (hit) return JSON.parse(hit) as T
  } catch {
    /* ignore */
  }
  const v = await fn()
  if (v) {
    try {
      localStorage.setItem(k, JSON.stringify(v))
    } catch {
      /* ignore */
    }
  }
  return v
}

export const hashKey = (o: unknown) => {
  const s = JSON.stringify(o)
  let h = 0
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0
  return (h >>> 0).toString(36)
}

/* ---------- Node: 시세 ---------- */

export type Quote = {
  code: string
  price: number
  prevClose: number | null
  changePct: number | null
  source: string
  delayed: boolean
  delayNote: string
  candles?: { date: string; close: number }[]
}

export async function quotes(codes: string[]) {
  const r = await call<{ results: { code: string; quote?: Quote }[]; market?: { refreshSec?: number } }>(
    `/api/quotes?codes=${codes.join(',')}`,
    { timeout: 8000 },
  )
  if (!r) return null
  const out: Record<string, Quote> = {}
  for (const x of r.results) if (x.quote && x.quote.price > 0) out[x.code] = x.quote
  return { quotes: out, refreshSec: r.market?.refreshSec ?? 15 }
}

/** 일봉 히스토리(최근 90개)를 위해 종목 하나씩 */
export const quoteDetail = (code: string) => call<{ quote: Quote }>(`/api/quotes/${code}`, { timeout: 8000 })

/* ---------- Node: Discord ---------- */

export const discordStatus = () => call<{ configured: boolean; lastSuccessAt: number | null }>('/api/discord/status')

export const setDailySubscription = (enabled: boolean, nickname?: string) =>
  enabled
    ? call('/api/daily/subscription', {
        method: 'PUT',
        body: JSON.stringify({ enabled: true, time: '08:00', nickname: nickname?.slice(0, 12) || undefined, includePhotos: false, level: 1, nextLessonId: null }),
      })
    : call('/api/daily/subscription', { method: 'DELETE' })

export const sendTradeCard = (t: {
  tradeId: string
  name: string
  side: 'buy' | 'sell'
  shares: number
  price: number
  cashLeft: number
  lesson: { title: string; points: string[]; risk?: string }
}) => post<{ ok: boolean }>('/api/discord/trade-card', t, 20000)
