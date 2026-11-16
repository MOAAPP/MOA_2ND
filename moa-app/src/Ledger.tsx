import { motion } from 'framer-motion'
import { Plus } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import * as api from './api'
import { Sparkles } from 'lucide-react'
import { ForecastChart } from './charts'
import { CATS, guessCategory, type Category } from './data'
import { iso, mdDot, parseISO, today, won, wonShort } from './lib'
import { useStore } from './store'
import { Btn, CatIcon, CloseBtn, Keypad, Segmented, Sheet } from './ui'

const W = ['일', '월', '화', '수', '목', '금', '토']

export function Ledger() {
  const s = useStore()
  const { state } = s
  const [view, setView] = useState<'list' | 'cal'>('list')
  const [adding, setAdding] = useState(false)
  const t = today()
  const monthKey = iso(t).slice(0, 7)
  const monthTx = state.txs.filter((x) => x.date.startsWith(monthKey))
  const income = monthTx.filter((x) => x.kind === 'income').reduce((a, x) => a + x.amount, 0)

  const cats = useMemo(() => {
    const m: Partial<Record<Category, number>> = {}
    monthTx.filter((x) => x.kind === 'spend').forEach((x) => (m[x.category] = (m[x.category] ?? 0) + x.amount))
    return (Object.entries(m) as [Category, number][]).sort((a, b) => b[1] - a[1])
  }, [monthTx])

  const [summary, setSummary] = useState<api.LedgerSummaryOut | null>(null)
  useEffect(() => {
    const spends = monthTx.filter((x) => x.kind === 'spend')
    if (spends.length < 3) return
    const lastKey = iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)).slice(0, 7)
    const prev = state.txs.filter((x) => x.kind === 'spend' && x.date.startsWith(lastKey)).reduce((a, x) => a + x.amount, 0)
    const wd: Record<number, number[]> = {}
    spends.forEach((x) => (wd[parseISO(x.date).getDay()] ??= []).push(x.amount))
    const busiest = Object.entries(wd)
      .map(([d, arr]) => ({ day: W[Number(d)] + '요일', average: Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) }))
      .sort((a, b) => b.average - a.average)[0]
    const biggest = [...spends].sort((a, b) => b.amount - a.amount)[0]
    const input = {
      month: monthKey,
      total: s.monthSpend,
      prevTotal: prev || null,
      count: spends.length,
      elapsedDays: t.getDate(),
      byCategory: cats.slice(0, 8).map(([c, v]) => ({ name: CATS[c].label, amount: v })),
      busiestWeekday: busiest ?? null,
      biggest: biggest ? { name: biggest.title.slice(0, 40), amount: biggest.amount } : null,
    }
    let alive = true
    api.cached('ledger.' + api.hashKey(input), () => api.aiLedgerSummary(input).then((r) => r?.data ?? null)).then((r) => alive && setSummary(r))
    return () => {
      alive = false
    }
  }, [s.monthSpend]) // eslint-disable-line react-hooks/exhaustive-deps

  const byDate = useMemo(() => {
    const g: Record<string, typeof state.txs> = {}
    ;[...state.txs].sort((a, b) => b.date.localeCompare(a.date)).forEach((x) => ((g[x.date] ??= []).push(x)))
    return Object.entries(g).slice(0, 20)
  }, [state.txs])

  return (
    <div className="min-h-dvh bg-bg">
      <div className="px-5 pt-3 pb-safe">
        <header className="flex h-12 items-center justify-between">
          <h1 className="text-[20px] font-bold">가계부</h1>
          <button onClick={() => setAdding(true)} className="flex items-center gap-1 rounded-full bg-white px-3 py-1.5 text-[13.5px] font-semibold text-blue">
            <Plus size={16} strokeWidth={2.5} /> 직접 기록
          </button>
        </header>

        <section className="mt-3 rounded-[26px] bg-white p-5">
          <div className="text-[14px] text-sub">{t.getMonth() + 1}월에 쓴 돈</div>
          <div className="mt-1 text-[30px] font-bold tracking-tight tabular-nums">{won(s.monthSpend)}원</div>
          <div className="mt-1 flex gap-3 text-[13px]">
            <span className="text-sub">
              수입 <b className="text-blue">{won(income)}원</b>
            </span>
            <span className="text-sub">
              참은 돈 <b className="text-[#7C6CFF]">{won(s.monthSkip)}원</b>
            </span>
          </div>
          {cats.length > 0 && (
            <>
              <div className="mt-5 flex h-3 overflow-hidden rounded-full">
                {cats.map(([c, v], i) => (
                  <motion.div
                    key={c}
                    initial={{ width: 0 }}
                    animate={{ width: `${(v / s.monthSpend) * 100}%` }}
                    transition={{ delay: i * 0.05, duration: 0.6 }}
                    style={{ background: CATS[c].color }}
                    className="h-full border-r-2 border-white last:border-0"
                  />
                ))}
              </div>
              <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                {cats.slice(0, 5).map(([c, v]) => (
                  <span key={c} className="flex items-center gap-1.5 text-[12.5px] text-sub">
                    <i className="size-2 rounded-full" style={{ background: CATS[c].color }} />
                    {CATS[c].label} {Math.round((v / s.monthSpend) * 100)}%
                  </span>
                ))}
              </div>
            </>
          )}
        </section>

        {summary && (
          <section className="mt-3 rounded-[26px] bg-[#F1F0FF] p-5">
            <div className="flex items-center gap-1.5 text-[12.5px] font-bold text-[#6A5CF5]">
              <Sparkles size={14} /> AI 이번 달 요약
            </div>
            <div className="mt-1.5 text-[16px] font-bold text-[#2E2A5A]">{summary.title}</div>
            <ul className="mt-2 space-y-1.5">
              {summary.points.slice(0, 4).map((p) => (
                <li key={p} className="flex gap-2 text-[14px] leading-relaxed text-[#3D3A6B]">
                  <span className="mt-[9px] size-1 shrink-0 rounded-full bg-[#8B7CFF]" />
                  {p}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-3 rounded-[26px] bg-white p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[17px] font-bold">월급날까지 잔액 흐름</h2>
            <span className="text-[13px] text-sub">{s.fc.daysLeft}일 남음</span>
          </div>
          <p className="mt-1 text-[13px] text-sub">
            가장 낮은 날은 <b className="text-ink">{mdDot(s.fc.min.date)}</b> · 약 {wonShort(s.fc.min.balance)}원
          </p>
          <div className="mt-4">
            <ForecastChart pts={s.fc.pts} keep={state.profile.keep} h={150} />
          </div>
          <div className="mt-4 space-y-1">
            {s.fc.bills.map((b) => (
              <div key={b.title} className="flex items-center justify-between rounded-xl bg-[#F6F7F9] px-3.5 py-3 text-[14px]">
                <span className="text-sub">{mdDot(b.date)}</span>
                <span className="flex-1 pl-3 font-medium">{b.title}</span>
                <span className="font-semibold tabular-nums">-{won(b.amount)}원</span>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-xl bg-blue-soft px-3.5 py-3 text-[14px]">
              <span className="text-blue">{mdDot(s.fc.end)}</span>
              <span className="flex-1 pl-3 font-medium text-blue">월급</span>
              <span className="font-semibold text-blue tabular-nums">+{won(state.profile.salary)}원</span>
            </div>
          </div>
        </section>

        <div className="mt-6 mb-3">
          <Segmented
            id="ledger"
            value={view}
            onChange={setView}
            items={[
              { value: 'list', label: '리스트' },
              { value: 'cal', label: '달력' },
            ]}
          />
        </div>

        {view === 'cal' ? (
          <Calendar />
        ) : (
          <div className="space-y-3">
            {byDate.length === 0 && <div className="rounded-[24px] bg-white p-8 text-center text-[14px] text-sub">아직 기록이 없어요</div>}
            {byDate.map(([date, list]) => {
              const d = parseISO(date)
              const sum = list.filter((x) => x.kind === 'spend').reduce((a, x) => a + x.amount, 0)
              return (
                <div key={date} className="rounded-[24px] bg-white px-4 pt-3 pb-1">
                  <div className="flex justify-between pb-1 text-[12.5px] text-sub">
                    <span>
                      {d.getMonth() + 1}월 {d.getDate()}일 {W[d.getDay()]}
                    </span>
                    {sum > 0 && <span>-{won(sum)}원</span>}
                  </div>
                  {list.map((x) => (
                    <div key={x.id} className="flex items-center gap-3 py-2.5">
                      <CatIcon c={x.category} size={38} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[15px] font-semibold">{x.title}</span>
                          {x.kind === 'skip' && (
                            <span className="rounded-md bg-[#EFEBFF] px-1.5 py-0.5 text-[10.5px] font-bold text-[#6A5CF5]">참음</span>
                          )}
                        </div>
                        <div className="text-[12.5px] text-sub">
                          {x.kind === 'skip' ? `평행세계 ${x.dest === 'invest' ? '투자금' : '적금'}으로` : CATS[x.category].label}
                        </div>
                      </div>
                      <div
                        className={
                          'text-[15px] font-semibold tabular-nums ' +
                          (x.kind === 'skip' ? 'text-[#8B7CFF] line-through decoration-[#8B7CFF]/40' : x.kind === 'income' ? 'text-blue' : '')
                        }
                      >
                        {x.kind === 'income' ? '+' : '-'}
                        {won(x.amount)}원
                      </div>
                    </div>
                  ))}
                </div>
              )
            })}
          </div>
        )}
      </div>
      <AddSheet open={adding} onClose={() => setAdding(false)} />
    </div>
  )
}

function Calendar() {
  const { state } = useStore()
  const t = today()
  const [month, setMonth] = useState(0)
  const base = new Date(t.getFullYear(), t.getMonth() + month, 1)
  const [sel, setSel] = useState<number>(t.getDate())
  const days = new Date(base.getFullYear(), base.getMonth() + 1, 0).getDate()
  const cells: (number | null)[] = [...Array(base.getDay()).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const keyOf = (day: number) => iso(new Date(base.getFullYear(), base.getMonth(), day))
  const sumFor = (day: number, kind: 'spend' | 'skip' | 'income') =>
    state.txs.filter((x) => x.date === keyOf(day) && x.kind === kind).reduce((a, x) => a + x.amount, 0)
  const isCur = month === 0
  const selList = state.txs.filter((x) => x.date === keyOf(sel))
  const selDate = new Date(base.getFullYear(), base.getMonth(), sel)
  const selBill = isCur && sel > t.getDate() ? state.schedule.filter((b) => b.day === sel) : []
  const monthSpend = state.txs
    .filter((x) => x.kind === 'spend' && x.date.startsWith(keyOf(1).slice(0, 7)))
    .reduce((a, x) => a + x.amount, 0)
  return (
    <>
      <div className="rounded-[24px] bg-white p-4">
        <div className="mb-3 flex items-center justify-between px-1">
          <button
            onClick={() => {
              setMonth(month - 1)
              setSel(1)
            }}
            className="grid size-8 place-items-center rounded-full text-sub active:bg-black/5"
            aria-label="이전 달"
          >
            ‹
          </button>
          <div className="text-center">
            <div className="text-[15px] font-bold">
              {base.getFullYear()}년 {base.getMonth() + 1}월
            </div>
            <div className="text-[12px] text-sub">지출 {won(monthSpend)}원</div>
          </div>
          <button
            onClick={() => {
              if (month < 0) {
                setMonth(month + 1)
                setSel(month + 1 === 0 ? t.getDate() : 1)
              }
            }}
            className={'grid size-8 place-items-center rounded-full ' + (month < 0 ? 'text-sub active:bg-black/5' : 'text-line')}
            aria-label="다음 달"
          >
            ›
          </button>
        </div>
        <div className="grid grid-cols-7 text-center text-[12px] text-mute">
          {W.map((w) => (
            <div key={w} className="pb-2">
              {w}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {cells.map((day, i) => {
            if (!day) return <div key={i} />
            const sp = sumFor(day, 'spend')
            const sk = sumFor(day, 'skip')
            const isToday = isCur && day === t.getDate()
            const isPay = day === state.profile.payday
            const bill = isCur && day > t.getDate() ? state.schedule.find((b) => b.day === day) : undefined
            const on = sel === day
            return (
              <button key={i} onClick={() => setSel(day)} className={'flex h-[60px] flex-col items-center rounded-xl pt-0.5 ' + (on ? 'bg-blue-soft' : '')}>
                <span
                  className={
                    'grid size-7 place-items-center rounded-full text-[13px] font-semibold ' +
                    (isToday ? 'bg-ink text-white' : on ? 'text-blue' : isPay ? 'text-blue' : 'text-ink')
                  }
                >
                  {day}
                </span>
                {sp > 0 && <span className="text-[10px] text-sub tabular-nums">-{wonShort(sp)}</span>}
                {sk > 0 && <span className="text-[10px] font-semibold text-[#7C6CFF] tabular-nums">+{wonShort(sk)}</span>}
                {!sp && !sk && bill && <span className="text-[10px] text-red">{bill.title.split(' ')[0]}</span>}
                {isPay && !sp && !sk && !bill && <span className="text-[10px] text-blue">월급</span>}
              </button>
            )
          })}
        </div>
        <div className="mt-3 flex justify-center gap-4 text-[11.5px] text-sub">
          <span>
            <b className="text-ink">-</b> 쓴 돈
          </span>
          <span>
            <b className="text-[#7C6CFF]">+</b> 참은 돈
          </span>
          <span className="text-red">예정 결제</span>
        </div>
      </div>

      <div className="mt-3 rounded-[24px] bg-white px-4 pt-4 pb-2">
        <div className="pb-1 text-[14px] font-bold">
          {selDate.getMonth() + 1}월 {selDate.getDate()}일 {W[selDate.getDay()]}요일
        </div>
        {selList.length === 0 && selBill.length === 0 && <div className="py-6 text-center text-[14px] text-sub">이날은 기록이 없어요</div>}
        {selBill.map((b) => (
          <div key={b.id} className="flex items-center gap-3 py-2.5">
            <div className="grid size-[38px] place-items-center rounded-[14px] bg-red/10 text-[12px] font-bold text-red">예정</div>
            <div className="flex-1 text-[15px] font-semibold">{b.title}</div>
            <div className="text-[15px] font-semibold text-red tabular-nums">-{won(b.amount)}원</div>
          </div>
        ))}
        {selList.map((x) => (
          <div key={x.id} className="flex items-center gap-3 py-2.5">
            <CatIcon c={x.category} size={38} />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[15px] font-semibold">{x.title}</div>
              <div className="text-[12.5px] text-sub">{x.kind === 'skip' ? '참음 · 평행세계로' : CATS[x.category].label}</div>
            </div>
            <div className={'text-[15px] font-semibold tabular-nums ' + (x.kind === 'skip' ? 'text-[#8B7CFF]' : x.kind === 'income' ? 'text-blue' : '')}>
              {x.kind === 'spend' ? '-' : '+'}
              {won(x.amount)}원
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

function AddSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore()
  const [amount, setAmount] = useState('')
  const [title, setTitle] = useState('')
  const [cat, setCat] = useState<Category>('food')
  const [kind, setKind] = useState<'spend' | 'income'>('spend')
  const onKey = (k: string) => {
    if (k === '⌫') setAmount((a) => a.slice(0, -1))
    else setAmount((a) => (a + k).replace(/^0+/, '').slice(0, 9))
  }
  const save = () => {
    const v = Number(amount)
    if (!v) return
    if (kind === 'spend') s.spend(title || CATS[cat].label, v, cat)
    else s.income(title || '수입', v)
    s.notify(kind === 'spend' ? '현실 가계부에 기록했어요' : '수입을 기록했어요')
    setAmount('')
    setTitle('')
    onClose()
  }
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="px-5 pb-6">
        <div className="flex items-center justify-between">
          <div className="w-40">
            <Segmented
              id="kind"
              value={kind}
              onChange={setKind}
              items={[
                { value: 'spend', label: '지출' },
                { value: 'income', label: '수입' },
              ]}
            />
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <input
          value={title}
          onChange={(e) => {
            setTitle(e.target.value)
            const g = guessCategory(e.target.value)
            if (g !== 'etc') setCat(g)
          }}
          placeholder="어디에 썼나요? (예: 스타벅스)"
          className="mt-5 w-full text-[17px] font-medium placeholder:text-mute"
        />
        <div className={'mt-2 text-[34px] font-bold tracking-tight tabular-nums ' + (amount ? 'text-ink' : 'text-mute')}>
          {amount ? won(Number(amount)) : '0'}원
        </div>
        {kind === 'spend' && (
          <div className="no-scrollbar -mx-5 mt-3 flex gap-2 overflow-x-auto px-5">
            {(Object.keys(CATS) as Category[])
              .filter((c) => c !== 'income')
              .map((c) => (
                <button
                  key={c}
                  onClick={() => setCat(c)}
                  className={
                    'shrink-0 rounded-full px-3.5 py-2 text-[13.5px] font-semibold ' + (cat === c ? 'bg-ink text-white' : 'bg-[#F2F3F6] text-sub')
                  }
                >
                  {CATS[c].label}
                </button>
              ))}
          </div>
        )}
        <div className="mt-4">
          <Keypad onKey={onKey} />
        </div>
        <Btn className="mt-3" disabled={!Number(amount)} onClick={save}>
          기록하기
        </Btn>
      </div>
    </Sheet>
  )
}
