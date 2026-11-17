import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { LESSONS, STOCKS, demoState, freshState, history, levelOf, type Category, type Dest, type State, type Trade, type Tx } from './data'
import { accrued, addDays, daysBetween, forecast, iso, parseISO, today } from './lib'
import * as api from './api'

const KEY_PREFIX = 'moa.v5.'

const load = (mode: 'demo' | 'fresh'): State => {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + mode)
    if (raw) return JSON.parse(raw)
  } catch {
    /* storage unavailable */
  }
  return mode === 'demo' ? demoState() : freshState()
}

const PATH_ROUTING = import.meta.env.VITE_ROUTING === 'path'

/** 배포: /demo = 예시 기록 · / = 처음 사용자 / 미리보기 파일: 기본 예시, #new = 처음 사용자 */
const initialMode = (): 'demo' | 'fresh' => {
  try {
    if (PATH_ROUTING) return /^\/demo/.test(location.pathname) || /demo/.test(location.hash) ? 'demo' : 'fresh'
    const h = location.hash + location.search
    if (/new|fresh|start/.test(h)) return 'fresh'
  } catch {
    /* ignore */
  }
  return 'demo'
}

const syncUrl = (m: 'demo' | 'fresh') => {
  try {
    if (PATH_ROUTING) window.history.replaceState(null, '', m === 'demo' ? '/demo' : '/')
  } catch {
    /* ignore */
  }
}

export type Prices = Record<string, { price: number; prev: number; hist: number[] }>

const initPrices = (): Prices => {
  const p: Prices = {}
  for (const s of STOCKS) {
    const hist = history(s)
    p[s.code] = { price: s.price, prev: hist[hist.length - 2], hist }
  }
  return p
}

type Ctx = ReturnType<typeof useProvideStore>
const StoreCtx = createContext<Ctx | null>(null)

function useProvideStore() {
  const [mode, setModeRaw] = useState(initialMode)
  const [state, setState] = useState<State>(() => load(mode))
  const [prices, setPrices] = useState<Prices>(initPrices)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<number | undefined>(undefined)

  useEffect(() => {
    try {
      localStorage.setItem(KEY_PREFIX + mode, JSON.stringify(state))
    } catch {
      /* ignore */
    }
  }, [state, mode])

  const [server, setServer] = useState<api.ApiHealth | null>(null)
  const [liveSource, setLiveSource] = useState<string | null>(null)
  const live = useRef<Set<string>>(new Set())

  useEffect(() => {
    api.health().then(setServer)
  }, [])

  // real market quotes from the Node API; the local ticker only covers codes without a live quote
  useEffect(() => {
    let stop = false
    let timer: number | undefined
    const codes = STOCKS.map((x) => x.code)
    ;(async () => {
      const details = await Promise.all(codes.map((c) => api.quoteDetail(c)))
      if (stop) return
      const ratio: Record<string, number> = {}
      details.forEach((d, i) => {
        if (d?.quote?.price) ratio[codes[i]] = d.quote.price / STOCKS[i].price
      })
      // the demo account was written against sample prices: keep its gains realistic on live prices
      setState((st) => {
        if (st.mode !== 'demo' || st.rebased || !Object.keys(ratio).length) return st
        // keep the invested amount about the same: fewer shares when the live price is higher
        const k = (code: string) => ratio[code] ?? 1
        const qty = (code: string, q: number) => Math.max(1, Math.round(q / k(code)))
        return {
          ...st,
          rebased: true,
          invest: {
            ...st.invest,
            holdings: st.invest.holdings.map((h) => ({ ...h, qty: qty(h.code, h.qty), avg: Math.round(h.avg * k(h.code)) })),
          },
          trades: (st.trades ?? []).map((t) => ({ ...t, qty: qty(t.code, t.qty), price: Math.round(t.price * k(t.code)) })),
        }
      })
      setPrices((old) => {
        const next = { ...old }
        details.forEach((d, i) => {
          const q = d?.quote
          if (!q || !q.price) return
          const closes = (q.candles ?? []).map((c) => c.close).filter((v) => v > 0).slice(-89)
          const hist = closes.length > 10 ? [...closes, q.price] : old[codes[i]].hist.map((v) => (v * q.price) / old[codes[i]].price)
          next[codes[i]] = { price: q.price, prev: q.prevClose ?? hist[hist.length - 2], hist }
          live.current.add(codes[i])
          setLiveSource(q.source)
        })
        return next
      })
      const poll = async () => {
        const r = await api.quotes(codes)
        if (stop) return
        if (r && Object.keys(r.quotes).length) {
          setPrices((old) => {
            const next = { ...old }
            for (const [code, q] of Object.entries(r.quotes)) {
              const o = old[code]
              if (!o) continue
              next[code] = { price: q.price, prev: q.prevClose ?? o.prev, hist: [...o.hist.slice(0, -1), q.price] }
              live.current.add(code)
            }
            return next
          })
        }
        timer = window.setTimeout(poll, Math.max(10, r?.refreshSec ?? 20) * 1000)
      }
      timer = window.setTimeout(poll, 10000)
    })()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [])

  // gentle ticks so the virtual market still feels alive when no live quote is available
  useEffect(() => {
    const id = window.setInterval(() => {
      setPrices((old) => {
        const next: Prices = {}
        for (const s of STOCKS) {
          const o = old[s.code]
          if (live.current.has(s.code)) {
            next[s.code] = o
            continue
          }
          const vol = s.type === 'ETF' ? 0.0012 : 0.0025
          const drift = (Math.random() - 0.495) * vol
          const unit = o.price > 100000 ? 100 : o.price > 50000 ? 50 : o.price > 10000 ? 10 : 5
          const price = Math.max(unit, Math.round((o.price * (1 + drift)) / unit) * unit)
          const hist = [...o.hist.slice(0, -1), price]
          next[s.code] = { ...o, price, hist }
        }
        return next
      })
    }, 2600)
    return () => clearInterval(id)
  }, [])

  const notify = useCallback((msg: string) => {
    setToast(msg)
    window.clearTimeout(toastTimer.current)
    toastTimer.current = window.setTimeout(() => setToast(null), 2200)
  }, [])

  const setMode = useCallback((m: 'demo' | 'fresh', clean = false) => {
    setModeRaw(m)
    syncUrl(m)
    setState(clean ? (m === 'demo' ? demoState() : freshState()) : load(m))
  }, [])

  const reset = useCallback(() => {
    const s = mode === 'demo' ? demoState() : freshState()
    setState(s)
  }, [mode])

  // ---------- derived ----------
  const derived = useMemo(() => {
    const t = today()
    const { profile, balance, schedule } = state
    const fc = forecast({ balance, schedule, payday: profile.payday, salary: profile.salary, daily: profile.daily })
    const available = Math.max(0, balance - fc.upcoming - profile.keep)
    const perDay = Math.floor(available / fc.daysLeft / 100) * 100

    const savingInterest = accrued(state.saving.balance, state.saving.rate, Math.max(0, daysBetween(parseISO(state.saving.since), t)))
    const depositTotal = state.deposits.reduce((a, dp) => a + dp.principal, 0)
    const depositInterest = state.deposits.reduce(
      (a, dp) => a + accrued(dp.principal, dp.rate, Math.max(0, daysBetween(parseISO(dp.start), t))),
      0,
    )
    const ch = state.challenge
    const challengeTotal = ch ? (ch.base * ch.filled * (ch.filled + 1)) / 2 : 0
    const holdingsValue = state.invest.holdings.reduce((a, h) => a + h.qty * (prices[h.code]?.price ?? 0), 0)
    const holdingsCost = state.invest.holdings.reduce((a, h) => a + h.qty * h.avg, 0)
    const investTotal = state.invest.cash + holdingsValue
    const savingTotal = state.saving.balance + savingInterest
    const parallelTotal = savingTotal + depositTotal + depositInterest + challengeTotal + investTotal
    const skipped = state.txs.filter((x) => x.kind === 'skip')
    const skippedSum = skipped.reduce((a, x) => a + x.amount, 0)
    const growth = parallelTotal - skippedSum - (state.mode === 'fresh' && state.onboarded ? 100000 : 0) - challengeTotal
    const monthKey = iso(t).slice(0, 7)
    const monthSpend = state.txs.filter((x) => x.kind === 'spend' && x.date.startsWith(monthKey)).reduce((a, x) => a + x.amount, 0)
    const monthSkip = skipped.filter((x) => x.date.startsWith(monthKey)).reduce((a, x) => a + x.amount, 0)
    const level = levelOf(parallelTotal)
    return {
      fc,
      available,
      perDay,
      savingInterest,
      savingTotal,
      depositTotal,
      depositInterest,
      challengeTotal,
      holdingsValue,
      holdingsCost,
      investTotal,
      parallelTotal,
      skippedSum,
      skipped,
      growth,
      monthSpend,
      monthSkip,
      level,
    }
  }, [state, prices])

  // ---------- actions ----------
  const addTx = useCallback((tx: Omit<Tx, 'id' | 'date'> & { date?: string }) => {
    setState((s) => {
      const full: Tx = { ...tx, id: Math.random().toString(36).slice(2), date: tx.date ?? iso(today()) }
      const next: State = { ...s, txs: [full, ...s.txs] }
      if (tx.kind === 'spend') next.balance = s.balance - tx.amount
      if (tx.kind === 'income') next.balance = s.balance + tx.amount
      if (tx.kind === 'skip') {
        if (tx.dest === 'invest') next.invest = { ...s.invest, cash: s.invest.cash + tx.amount }
        else if (tx.dest === 'challenge' && s.challenge) next.challenge = { ...s.challenge, filled: Math.min(26, s.challenge.filled + 1) }
        else next.saving = { ...s.saving, balance: s.saving.balance + tx.amount }
        next.xp = s.xp + 30
      }
      return next
    })
  }, [])

  const spend = (title: string, amount: number, category: Category) => addTx({ title, amount, category, kind: 'spend' })
  const income = (title: string, amount: number) => addTx({ title, amount, category: 'income', kind: 'income' })
  const skip = (title: string, amount: number, category: Category, dest: Dest) =>
    addTx({ title, amount, category, kind: 'skip', dest })

  // 구매 계획은 별도 저장하고, 기존 계획을 다시 열면 중복 생성 없이 날짜만 수정합니다.
  // 실제 가계부 잔액과 지출 기록은 구매 여부를 확정하기 전까지 변경하지 않습니다.
  const later = (
    title: string, amount: number, until?: string, existingId?: string | null,
    goal?: { monthlySaving: number; savingsDay: number },
  ) =>
    setState((s) => {
      const date = until ?? iso(addDays(derived.fc.end, 1))
      const goalFields = goal ? { monthlySaving: goal.monthlySaving, savingsDay: goal.savingsDay } : {}
      if (existingId && s.later.some((item) => item.id === existingId)) {
        return {
          ...s,
          later: s.later.map((item) =>
            item.id === existingId ? { ...item, title, amount, until: date, ...goalFields } : item,
          ),
        }
      }
      return {
        ...s,
        later: [{ id: Math.random().toString(36).slice(2), title, amount, until: date, ...goalFields }, ...s.later],
      }
    })

  const removeLater = (id: string) => setState((s) => ({ ...s, later: s.later.filter((l) => l.id !== id) }))

  const tradeCard = (t: Trade, cashLeft: number) => {
    if (!state.discord || !server?.discord) return
    const st = STOCKS.find((x) => x.code === t.code)!
    api.sendTradeCard({
      tradeId: t.id.padEnd(6, '0'),
      name: st.name,
      side: t.side,
      shares: t.qty,
      price: t.price,
      cashLeft: Math.max(0, Math.round(cashLeft)),
      lesson: {
        title: st.type === 'ETF' ? 'ETF로 나눠 담기' : '한 기업에 투자한다는 것',
        points: [st.about, st.why],
        risk: '가상 거래 연습이에요. 실제 투자 권유가 아니에요.',
      },
    }).then((r) => r && notify('디스코드로 거래 카드뉴스를 보냈어요'))
  }

  const toggleDiscord = async (on: boolean) => {
    setState((s) => ({ ...s, discord: on }))
    const r = await api.setDailySubscription(on, state.profile.name)
    if (on) notify(r ? '매일 오전 8시에 디스코드로 카드뉴스를 보내드릴게요' : '디스코드 연결을 켰어요. 서버 연결 후 전송돼요')
    else notify('디스코드 카드뉴스를 껐어요')
  }

  const logTrade = (t: Omit<Trade, 'id' | 'date'>) => ({ ...t, id: Math.random().toString(36).slice(2), date: iso(today()) })

  const buy = (code: string, qty: number) => {
    const price = prices[code].price
    const cost = price * qty
    if (qty <= 0 || cost > state.invest.cash) return false
    const trade = logTrade({ code, side: 'buy', qty, price })
    setState((s) => {
      const hs = [...s.invest.holdings]
      const i = hs.findIndex((h) => h.code === code)
      if (i >= 0) {
        const h = hs[i]
        hs[i] = { code, qty: h.qty + qty, avg: Math.round((h.avg * h.qty + cost) / (h.qty + qty)) }
      } else hs.push({ code, qty, avg: price })
      return { ...s, invest: { cash: s.invest.cash - cost, holdings: hs }, trades: [trade, ...(s.trades ?? [])], xp: s.xp + 20 }
    })
    tradeCard(trade, state.invest.cash - cost)
    return true
  }

  /** returns realized profit, or null when the order is invalid */
  const sell = (code: string, qty: number) => {
    const price = prices[code].price
    const held = state.invest.holdings.find((h) => h.code === code)
    if (!held || qty <= 0 || qty > held.qty) return null
    const pl = (price - held.avg) * qty
    const trade = logTrade({ code, side: 'sell', qty, price, pl })
    setState((s) => {
      const hs = s.invest.holdings
        .map((h) => (h.code === code ? { ...h, qty: h.qty - qty } : h))
        .filter((h) => h.qty > 0)
      return { ...s, invest: { cash: s.invest.cash + price * qty, holdings: hs }, trades: [trade, ...(s.trades ?? [])] }
    })
    tradeCard(trade, state.invest.cash + price * qty)
    return pl
  }

  const moveToInvest = (amount: number) =>
    amount > 0 &&
    amount <= state.saving.balance &&
    setState((s) => ({
      ...s,
      saving: { ...s.saving, balance: s.saving.balance - amount },
      invest: { ...s.invest, cash: s.invest.cash + amount },
    }))

  const openDeposit = (principal: number, months: number, rate: number) =>
    setState((s) => ({
      ...s,
      saving: { ...s.saving, balance: s.saving.balance - principal },
      deposits: [
        ...s.deposits,
        { id: Math.random().toString(36).slice(2), name: `평행 정기예금 ${months}개월`, principal, rate, months, start: iso(today()) },
      ],
      xp: s.xp + 40,
    }))

  const startChallenge = (base: number) =>
    setState((s) => ({ ...s, challenge: { start: iso(today()), base, filled: 0 }, xp: s.xp + 20 }))

  const fillChallenge = () =>
    setState((s) => {
      if (!s.challenge) return s
      const amt = s.challenge.base * (s.challenge.filled + 1)
      return {
        ...s,
        saving: { ...s.saving, balance: Math.max(0, s.saving.balance - amt) },
        challenge: { ...s.challenge, filled: Math.min(26, s.challenge.filled + 1) },
        xp: s.xp + 15,
      }
    })

  const completeLesson = (id: string, xp: number) =>
    setState((s) => ({
      ...s,
      lessonsDone: s.lessonsDone.includes(id) ? s.lessonsDone : [...s.lessonsDone, id],
      xp: s.xp + xp,
      streak: s.lessonsDone.includes(id) ? s.streak : s.streak + 1,
    }))

  const finishLevelTest = (score: number) =>
    setState((s) => ({
      ...s,
      levelTested: true,
      lessonsDone: Array.from(new Set([...s.lessonsDone, ...LESSONS.slice(0, score).map((l) => l.id)])),
      xp: s.xp + score * 20,
    }))

  const update = (patch: Partial<State>) => setState((s) => ({ ...s, ...patch }))

  return {
    mode,
    setMode,
    reset,
    state,
    prices,
    toast,
    notify,
    ...derived,
    spend,
    income,
    skip,
    later,
    removeLater,
    buy,
    sell,
    moveToInvest,
    openDeposit,
    startChallenge,
    fillChallenge,
    completeLesson,
    finishLevelTest,
    toggleDiscord,
    server,
    liveSource,
    update,
  }
}

export function StoreProvider({ children }: { children: ReactNode }) {
  const v = useProvideStore()
  return <StoreCtx.Provider value={v}>{children}</StoreCtx.Provider>
}

export const useStore = () => {
  const c = useContext(StoreCtx)
  if (!c) throw new Error('store')
  return c
}
