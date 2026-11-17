export const won = (v: number) => new Intl.NumberFormat('ko-KR').format(Math.round(v))

export const wonShort = (v: number) => {
  const a = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (a >= 100000000) return `${sign}${(a / 100000000).toFixed(1).replace(/\.0$/, '')}억`
  if (a >= 10000) return `${sign}${(a / 10000).toFixed(a >= 100000 ? 0 : 1).replace(/\.0$/, '')}만`
  return `${sign}${won(a)}`
}

export const signed = (v: number) => `${v > 0 ? '+' : v < 0 ? '-' : ''}${won(Math.abs(v))}`

export const pct = (v: number, digits = 2) => `${v > 0 ? '+' : ''}${(v * 100).toFixed(digits)}%`

export const iso = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const today = () => {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d
}

export const addDays = (d: Date, n: number) => {
  const r = new Date(d)
  r.setDate(r.getDate() + n)
  return r
}

export const parseISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const W = ['일', '월', '화', '수', '목', '금', '토']
export const md = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일`
export const mdw = (d: Date) => `${d.getMonth() + 1}월 ${d.getDate()}일 ${W[d.getDay()]}요일`
export const ymd = (d: Date) => (d.getFullYear() === new Date().getFullYear() ? md(d) : `${d.getFullYear()}년 ${md(d)}`)
export const mdDot = (d: Date) => `${d.getMonth() + 1}.${d.getDate()}`

export const daysBetween = (a: Date, b: Date) => Math.round((b.getTime() - a.getTime()) / 86400000)

/** next payday strictly after today (if today is payday, returns today) */
export const nextPayday = (payday: number, from = today()) => {
  const d = new Date(from)
  if (d.getDate() <= payday) {
    d.setDate(payday)
    return d
  }
  return new Date(d.getFullYear(), d.getMonth() + 1, payday)
}

export type ScheduleItem = { id: string; day: number; title: string; amount: number }

export type ForecastPoint = { date: Date; balance: number; event?: string; amount?: number }

/**
 * Walk day by day from today to payday, subtracting scheduled bills and an assumed daily spend.
 */
export function forecast(opts: {
  balance: number
  schedule: ScheduleItem[]
  payday: number
  salary: number
  daily: number
  extra?: number
}) {
  const start = today()
  const end = nextPayday(opts.payday, start)
  const pts: ForecastPoint[] = [{ date: start, balance: opts.balance - (opts.extra ?? 0) }]
  let bal = opts.balance - (opts.extra ?? 0)
  let upcoming = 0
  const bills: { date: Date; title: string; amount: number }[] = []
  for (let d = addDays(start, 1); d <= end; d = addDays(d, 1)) {
    let event: string | undefined
    let amount: number | undefined
    if (daysBetween(d, end) !== 0) bal -= opts.daily
    for (const s of opts.schedule) {
      if (s.day === d.getDate()) {
        bal -= s.amount
        upcoming += s.amount
        event = s.title
        amount = s.amount
        bills.push({ date: new Date(d), title: s.title, amount: s.amount })
      }
    }
    pts.push({ date: new Date(d), balance: bal, event, amount })
  }
  // lowest point is just before payday arrives
  let min = pts[0]
  for (const p of pts) if (p.balance < min.balance) min = p
  const daysLeft = Math.max(1, daysBetween(start, end))
  return { pts, min, end, upcoming, bills, daysLeft }
}

/** after-tax simple interest for a savings product */
export const afterTax = (interest: number) => interest * (1 - 0.154)

export const accrued = (principal: number, rate: number, days: number) => afterTax((principal * rate * days) / 365)

/** parse "에어팟 25만원" / "커피 5500" / "치킨 2만3천" */
export function parseWish(text: string): { title: string; amount: number } | null {
  const t = text.replace(/,/g, '').trim()
  if (!t) return null
  const re = /(\d+(?:\.\d+)?)\s*(만|천)?\s*(\d+)?\s*(천)?\s*원?/
  const m = t.match(re)
  if (!m) return { title: t, amount: 0 }
  let amount = parseFloat(m[1])
  if (m[2] === '만') {
    amount *= 10000
    if (m[3]) amount += parseFloat(m[3]) * (m[4] === '천' ? 1000 : 1)
  } else if (m[2] === '천') amount *= 1000
  const title = t.replace(m[0], '').trim() || '고민 중인 소비'
  return { title, amount: Math.round(amount) }
}

export function seeded(seed: number) {
  let s = seed % 2147483647
  if (s <= 0) s += 2147483646
  return () => (s = (s * 16807) % 2147483647) / 2147483647
}

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v))
