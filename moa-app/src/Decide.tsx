import { AnimatePresence, motion } from 'framer-motion'
import { ArrowUp, CalendarClock, Check, ChevronRight, Clock, PiggyBank, Sparkles, TrendingUp } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import * as api from './api'
import { ForecastChart } from './charts'
import { DelayStep } from './DelayStep'
import { CATS, QUICK, guessCategory, levelOf, type Category, type Dest } from './data'
import { addDays, afterTax, forecast, iso, mdDot, parseISO, parseWish, today, won, wonShort, type ForecastPoint } from './lib'
import { useStore } from './store'
import { AIBadge, Btn, CatIcon, CloseBtn, Num, Planet, Sheet, Stars } from './ui'

type Step = 'input' | 'compare' | 'delay' | 'delayDone' | 'dest' | 'skipDone' | 'spendDone'
type Wish = { title: string; amount: number; category: Category }

export function Decide({ open, onClose, preset, goParallel }: { open: boolean; onClose: () => void; preset?: Wish | null; goParallel: () => void }) {
  const [step, setStep] = useState<Step>('input')
  const [wish, setWish] = useState<Wish | null>(null)
  const [delayDate, setDelayDate] = useState('')
  const [reopenDate, setReopenDate] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setDelayDate('')
      setReopenDate(null)
      if (preset) {
        setWish(preset)
        setStep('compare')
      } else {
        setWish(null)
        setStep('input')
      }
    }
  }, [open, preset])

  const dark = step === 'skipDone'
  return (
    <Sheet open={open} onClose={onClose} dark={dark} full={step !== 'input'}>
      <AnimatePresence mode="wait">
        <motion.div
          key={step}
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -24 }}
          transition={{ duration: 0.22 }}
          className="h-full"
        >
          {step === 'input' && (
            <InputStep
              onClose={onClose}
              onPick={(w, savedDate) => {
                setWish(w)
                setReopenDate(savedDate ?? null)
                setStep(savedDate ? 'delay' : 'compare')
              }}
            />
          )}
          {step === 'compare' && wish && (
            <CompareStep wish={wish} onClose={onClose} onSkip={() => setStep('dest')} onSpend={() => setStep('spendDone')} onDelay={() => setStep('delay')} />
          )}
          {step === 'delay' && wish && (
            <DelayStep
              wish={wish}
              onClose={onClose}
              onBack={() => setStep('compare')}
              initialDate={reopenDate}
              onSaved={(date) => { setDelayDate(date); setStep('delayDone') }}
            />
          )}
          {step === 'delayDone' && wish && <DelayDone wish={wish} date={delayDate} onClose={onClose} />}
          {step === 'dest' && wish && <DestStep wish={wish} onClose={onClose} onDone={() => setStep('skipDone')} />}
          {step === 'skipDone' && wish && (
            <SkipDone
              wish={wish}
              onClose={onClose}
              onParallel={() => {
                onClose()
                goParallel()
              }}
            />
          )}
          {step === 'spendDone' && wish && <SpendDone wish={wish} onClose={onClose} />}
        </motion.div>
      </AnimatePresence>
    </Sheet>
  )
}

function InputStep({ onPick, onClose }: { onPick: (w: Wish, savedDate?: string) => void; onClose: () => void }) {
  const { notify, state } = useStore()
  const [text, setText] = useState('')
  const submit = () => {
    const p = parseWish(text)
    if (!p) return
    if (!p.amount) {
      notify('금액도 같이 적어주세요. 예) 커피 4800')
      return
    }
    onPick({ ...p, category: guessCategory(p.title) })
  }
  return (
    <div className="px-5 pb-8">
      <div className="flex items-start justify-between pt-2">
        <div>
          <AIBadge>두 세계 미리보기</AIBadge>
          <h2 className="mt-3 text-[24px] font-bold leading-snug tracking-tight">
            사기 전에,
            <br />두 세계를 먼저 볼까요?
          </h2>
          <p className="mt-2 text-[14.5px] text-sub">사면 현실이, 참으면 평행세계가 어떻게 바뀌는지 보여드려요</p>
        </div>
        <CloseBtn onClick={onClose} />
      </div>

      <div className="mt-6 flex items-center gap-2 rounded-2xl border-2 border-blue/80 bg-white py-2 pr-2 pl-4 shadow-[0_0_0_4px_rgba(37,99,235,.08)]">
        <input
          autoFocus
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && submit()}
          placeholder="예) 에어팟 25만원"
          className="h-10 flex-1 bg-transparent text-[17px] font-medium placeholder:text-mute"
        />
        <motion.button
          whileTap={{ scale: 0.9 }}
          onClick={submit}
          className={'grid size-10 place-items-center rounded-xl text-white ' + (text ? 'bg-blue' : 'bg-[#D1D6DB]')}
          aria-label="비교하기"
        >
          <ArrowUp size={20} strokeWidth={2.5} />
        </motion.button>
      </div>

      <p className="mt-7 mb-3 text-[13px] font-semibold text-sub">자주 고민하는 것</p>
      <div className="grid grid-cols-2 gap-2">
        {QUICK.map((q) => (
          <motion.button
            key={q.title}
            whileTap={{ scale: 0.96 }}
            onClick={() => onPick(q)}
            className="flex items-center gap-3 rounded-2xl bg-[#F4F5F8] p-3 text-left"
          >
            <CatIcon c={q.category} size={36} />
            <div className="min-w-0">
              <div className="truncate text-[14px] font-semibold">{q.title}</div>
              <div className="text-[12.5px] text-sub">{won(q.amount)}원</div>
            </div>
          </motion.button>
        ))}
      </div>

      {state.later.length > 0 && (
        <>
          <p className="mt-7 mb-3 text-[13px] font-semibold text-sub">구매를 미뤄둔 것</p>
          {state.later.map((l) => (
            <button
              key={l.id}
              onClick={() => onPick({ title: l.title, amount: l.amount, category: guessCategory(l.title) }, l.until)}
              className="mb-2 flex w-full items-center gap-3 rounded-2xl border border-line p-3 text-left"
            >
              <Clock size={18} className="text-blue" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-semibold">{l.title}</div>
                <div className="text-[12px] text-sub">{mdDot(parseISO(l.until))} 구매 예정</div>
              </div>
              <div className="text-[13px] text-sub">{won(l.amount)}원</div>
            </button>
          ))}
        </>
      )}
    </div>
  )
}

function CompareStep({ wish, onClose, onSkip, onSpend, onDelay }: { wish: Wish; onClose: () => void; onSkip: () => void; onSpend: () => void; onDelay: () => void }) {
  const s = useStore()
  const { state, available, perDay, fc, parallelTotal, level } = s
  const after = useMemo(
    () =>
      forecast({
        balance: state.balance,
        schedule: state.schedule,
        payday: state.profile.payday,
        salary: state.profile.salary,
        daily: state.profile.daily,
        extra: wish.amount,
      }),
    [state, wish.amount],
  )
  const availAfter = available - wish.amount
  const perDayAfter = Math.max(0, Math.floor(availAfter / fc.daysLeft / 100) * 100)

  // ── 서버 금융 엔진(MOA_2ND_BE /personal/compare) ──
  const [engine, setEngine] = useState<api.PersonalCompare | null>(null)
  const [engineDone, setEngineDone] = useState(false)
  useEffect(() => {
    let alive = true
    api
      .personalCompare({
        asOf: iso(today()),
        balance: state.balance,
        keep: state.profile.keep,
        salary: state.profile.salary,
        payday: state.profile.payday,
        daily: state.profile.daily,
        schedule: state.schedule,
        amount: wish.amount,
        horizon: Math.max(7, fc.daysLeft - 1),
        delay: fc.daysLeft + 1,
      })
      .then((r) => {
        if (!alive) return
        setEngine(r)
        setEngineDone(true)
      })
    return () => {
      alive = false
    }
  }, [wish.amount]) // eslint-disable-line react-hooks/exhaustive-deps

  const serverNow = engine?.paths.find((p) => p.scenario_id === 'purchase_now')
  const serverBase = engine?.paths.find((p) => p.scenario_id === 'no_purchase')
  // chart: server daily balances until the day before payday
  const chart = useMemo(() => {
    if (!serverNow || !serverBase) return null
    const end = iso(fc.end)
    const base = serverBase.daily_cashflow.filter((d) => d.date < end)
    const now = serverNow.daily_cashflow.filter((d) => d.date < end)
    if (base.length < 2 || base.length !== now.length) return null
    const pts: ForecastPoint[] = [{ date: today(), balance: state.balance }]
    base.forEach((d) => {
      const dt = parseISO(d.date)
      const bill = state.schedule.find((b) => b.day === dt.getDate())
      pts.push({ date: dt, balance: d.closing_balance, event: bill?.title, amount: bill?.amount })
    })
    pts.push({ date: fc.end, balance: base[base.length - 1].closing_balance })
    const ghost = [state.balance - wish.amount, ...now.map((d) => d.closing_balance), now[now.length - 1].closing_balance]
    return { pts, ghost }
  }, [serverNow, serverBase, fc.end, state.balance, state.schedule, wish.amount])

  const minAfter = serverNow ? serverNow.minimum_balance : after.min.balance
  const short = state.profile.keep - minAfter
  const shortDate = serverNow?.first_shortfall_date ? parseISO(serverNow.first_shortfall_date) : after.min.date
  const status: 'ok' | 'tight' | 'short' =
    (serverNow ? !serverNow.minimum_balance_met : short > 0) ? 'short' : availAfter < available * 0.4 ? 'tight' : 'ok'
  const yearInterest = Math.round(afterTax(wish.amount * 0.035))
  const nextTotal = parallelTotal + wish.amount
  const nextLv = levelOf(nextTotal)
  const lvUp = nextLv.lv > level.lv
  const times = Math.max(1, Math.round(100000 / wish.amount))

  const fallbackAi =
    status === 'short'
      ? `지금 구매하면 ${mdDot(shortDate)}에 생활비 안전선보다 ${won(Math.max(0, short))}원 부족해질 수 있어요. 필수 결제 일정과 구매를 보류했을 때의 잔액을 먼저 비교해 보세요.`
      : status === 'tight'
        ? `구매 후 월급날까지 계산된 하루 사용 여유는 약 ${won(perDayAfter)}원입니다. 예정된 필수지출을 다시 확인해 주세요.`
        : `현재 계산상 생활비 안전선 이내의 소비입니다. 구매를 보류한다면 평행세계 시뮬레이션에 ${won(wish.amount)}원을 더 배분할 수 있어요.`

  // ── AI 코치(Node /api/ai/coach): 엔진 결과를 받아 문장만 다듬음 ──
  const [coach, setCoach] = useState<api.CoachOut | null>(null)
  useEffect(() => {
    if (!engineDone) return
    let alive = true
    const since = iso(addDays(today(), -30))
    const monthKey = iso(today()).slice(0, 7)
    const same = state.txs.filter((x) => x.kind === 'spend' && x.category === wish.category)
    const input = {
      item: wish.title.slice(0, 60),
      category: CATS[wish.category].label,
      price: wish.amount,
      frequency: 'once' as const,
      usableNow: available,
      usableAfter: availAfter,
      afterBills: minAfter,
      yearGap: wish.amount,
      categorySpentThisMonth: same.filter((x) => x.date.startsWith(monthKey)).reduce((a, x) => a + x.amount, 0),
      categoryCount30: same.filter((x) => x.date >= since).length,
    }
    api.cached('coach.' + api.hashKey(input), () => api.aiCoach(input).then((r) => r?.data ?? null)).then((r) => alive && setCoach(r))
    return () => {
      alive = false
    }
  }, [engineDone]) // eslint-disable-line react-hooks/exhaustive-deps

  const ai = coach?.message ?? fallbackAi

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pt-1">
        <div className="flex items-center gap-3">
          <CatIcon c={wish.category} size={40} />
          <div>
            <div className="text-[15px] font-semibold">{wish.title}</div>
            <div className="text-[13px] text-sub">{won(wish.amount)}원</div>
          </div>
        </div>
        <CloseBtn onClick={onClose} />
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-4">
        <h2 className="mt-5 text-[22px] font-bold leading-snug tracking-tight">
          이 선택으로
          <br />
          세계가 이렇게 갈라져요
        </h2>

        <div className="mt-5 grid grid-cols-2 gap-2.5">
          {/* real world */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-[22px] border border-line bg-white p-4"
          >
            <div className="flex items-center justify-between">
              <span className="text-[12px] font-bold text-sub">현실 · 사면</span>
              <span
                className={
                  'rounded-full px-2 py-0.5 text-[11px] font-bold ' +
                  (status === 'short' ? 'bg-red/10 text-red' : status === 'tight' ? 'bg-amber-100 text-amber-700' : 'bg-emerald-50 text-emerald-600')
                }
              >
                {status === 'short' ? '부족' : status === 'tight' ? '빠듯' : '여유'}
              </span>
            </div>
            <div className="mt-4 text-[12px] text-sub">월급날까지 쓸 수 있는 돈</div>
            <div className="mt-1 text-[13px] text-mute line-through tabular-nums">{won(available)}원</div>
            <div className={'text-[20px] font-bold tabular-nums tracking-tight ' + (availAfter < 0 ? 'text-red' : 'text-ink')}>
              {won(availAfter)}원
            </div>
            <div className="mt-3 border-t border-line pt-3 text-[12px] leading-relaxed text-sub">
              하루 {won(perDay)} → <b className="text-ink">{won(perDayAfter)}원</b>
            </div>
          </motion.div>

          {/* parallel world */}
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.08 }}
            className="relative overflow-hidden rounded-[22px] bg-[#0B1030] p-4 text-white"
          >
            <Stars n={18} seed={9} />
            <div className="absolute -top-6 -right-6 opacity-90">
              <Planet size={56} hue={level.hue} ring={false} moons={0} />
            </div>
            <div className="relative">
              <span className="text-[12px] font-bold text-[#C4B5FD]">평행세계 · 참으면</span>
              <div className="mt-4 text-[12px] text-white/55">평행세계의 나</div>
              <div className="mt-1 text-[13px] text-white/40 line-through tabular-nums">{wonShort(parallelTotal)}원</div>
              <div className="shimmer-text text-[20px] font-bold tabular-nums tracking-tight">{won(nextTotal)}원</div>
              <div className="mt-3 border-t border-white/10 pt-3 text-[12px] leading-relaxed text-white/60">
                {lvUp ? (
                  <>
                    행성 <b className="text-white">Lv.{nextLv.lv} 레벨 업</b>
                  </>
                ) : (
                  <>
                    1년 뒤 이자 <b className="text-white">+{won(yearInterest)}원</b>
                  </>
                )}
              </div>
            </div>
          </motion.div>
        </div>

        <motion.button
          whileTap={{ scale: 0.985 }}
          onClick={onDelay}
          className="mt-3 flex w-full items-center gap-3 rounded-[22px] border border-[#E0DAFF] bg-[#F8F7FF] p-4 text-left"
        >
          <div className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[#EDE9FF] text-[#6D5BEF]">
            <CalendarClock size={22} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[14px] font-bold text-[#403582]">세 번째 선택 · 구매 연기</div>
            <div className="mt-1 text-[12.5px] leading-relaxed text-[#786EAB]">나중에 사면 어떨까요? 날짜를 바꿔 잔액을 비교해요</div>
          </div>
          <ChevronRight size={19} className="shrink-0 text-[#8879C8]" />
        </motion.button>

        <div className="mt-3 rounded-[22px] bg-[#F7F8FA] p-4">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[13px] font-semibold">사면 이렇게 줄어요</span>
            <span className="flex items-center gap-3 text-[11px] text-sub">
              <span className="flex items-center gap-1">
                <i className="h-0.5 w-3 bg-blue" />
                지금
              </span>
              <span className="flex items-center gap-1">
                <i className={'h-0.5 w-3 ' + (status === 'short' ? 'bg-red' : 'bg-mute')} />
                산 뒤
              </span>
            </span>
          </div>
          {chart ? (
            <ForecastChart pts={chart.pts} keep={state.profile.keep} ghostLine={chart.ghost} h={140} />
          ) : (
            <ForecastChart pts={fc.pts} keep={state.profile.keep} extra={wish.amount} h={140} />
          )}
        </div>

        <div className="mt-3 flex gap-3 rounded-[22px] bg-[#F1F0FF] p-4">
          <Sparkles size={18} className="mt-0.5 shrink-0 text-[#6A5CF5]" />
          <div className="flex-1">
            <div className="mb-1 text-[12px] font-bold text-[#6A5CF5]">{coach ? 'AI 코치' : '모아 분석'}</div>
            <motion.p key={ai} initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-[14px] leading-relaxed text-[#2E2A5A]">
              {ai}
            </motion.p>
            {coach?.tip && <p className="mt-2 text-[13px] leading-relaxed text-[#514A87]">확인하면 좋은 점: {coach.tip}</p>}
            {serverNow && (
              <p className="mt-2 text-[11.5px] text-[#6B6A8E]">
                예정 결제·지켜둘 돈·하루 지출 {won(state.profile.daily)}원을 넣어 {engine?.horizon_days}일 동안 날마다 계산했어요
              </p>
            )}
          </div>
        </div>
        {wish.amount < 30000 && (
          <p className="mt-3 px-1 text-[12.5px] text-sub">
            이런 소비를 {times}번 참으면 평행세계에 약 10만 원이 쌓여요.
          </p>
        )}
      </div>

      <div className="border-t border-line bg-white px-5 pt-3 pb-6">
        <div className="flex gap-2">
          <Btn variant="gray" className="!w-[38%]" onClick={() => {
            s.spend(wish.title, wish.amount, wish.category)
            onSpend()
          }}>
            살래요
          </Btn>
          <Btn variant="glow" onClick={onSkip}>
            참고 평행세계로
          </Btn>
        </div>
        <button
          onClick={onDelay}
          className="mt-3 flex w-full items-center justify-center gap-1.5 py-1 text-[13.5px] font-semibold text-[#7062C4]"
        >
          <CalendarClock size={15} /> 구매 날짜를 바꿔 비교하기 <ChevronRight size={15} />
        </button>
      </div>
    </div>
  )
}

function DestStep({ wish, onClose, onDone }: { wish: Wish; onClose: () => void; onDone: () => void }) {
  const s = useStore()
  const rec: Dest = s.state.invest.cash < 20000 && s.state.lessonsDone.length >= 2 ? 'invest' : 'saving'
  const [dest, setDest] = useState<Dest>(rec)
  const yearInterest = Math.round(afterTax(wish.amount * 0.035))
  const etfQty = wish.amount / (s.prices['360750']?.price ?? 22000)
  const opts: { v: Dest; icon: typeof PiggyBank; title: string; desc: string; meta: string }[] = [
    {
      v: 'saving',
      icon: PiggyBank,
      title: '평행 자유적금',
      desc: '연 3.5% · 언제든 꺼낼 수 있어요',
      meta: `1년 뒤 이자 +${won(yearInterest)}원`,
    },
    {
      v: 'invest',
      icon: TrendingUp,
      title: '가상 투자금',
      desc: '실험실에서 ETF·주식을 사볼 수 있어요',
      meta: etfQty >= 1 ? `S&P500 ETF 약 ${Math.floor(etfQty)}주` : `S&P500 ETF ${(etfQty * 100).toFixed(0)}% 만큼`,
    },
  ]
  return (
    <div className="flex h-full flex-col">
      <div className="flex justify-end px-5 pt-1">
        <CloseBtn onClick={onClose} />
      </div>
      <div className="flex-1 px-5">
        <p className="text-[14px] font-semibold text-[#6A5CF5]">참은 {won(wish.amount)}원</p>
        <h2 className="mt-1 text-[24px] font-bold leading-snug tracking-tight">
          평행세계에서
          <br />
          어떻게 키울까요?
        </h2>
        <div className="mt-6 space-y-2.5">
          {opts.map((o) => {
            const on = dest === o.v
            const I = o.icon
            return (
              <motion.button
                key={o.v}
                whileTap={{ scale: 0.98 }}
                onClick={() => setDest(o.v)}
                className={
                  'relative flex w-full items-center gap-4 rounded-[22px] border-2 p-4 text-left transition-colors ' +
                  (on ? 'border-[#7C6CFF] bg-[#F5F3FF]' : 'border-line bg-white')
                }
              >
                <div className={'grid size-12 place-items-center rounded-2xl ' + (on ? 'bg-[#7C6CFF] text-white' : 'bg-[#F2F3F6] text-sub')}>
                  <I size={22} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[16px] font-bold">{o.title}</span>
                    {o.v === rec && <AIBadge>추천</AIBadge>}
                  </div>
                  <div className="mt-0.5 text-[13px] text-sub">{o.desc}</div>
                  <div className="mt-1.5 text-[13px] font-semibold text-[#5B4FE0]">{o.meta}</div>
                </div>
                <div className={'grid size-6 place-items-center rounded-full ' + (on ? 'bg-[#7C6CFF] text-white' : 'border-2 border-[#D1D6DB]')}>
                  {on && <Check size={14} strokeWidth={3} />}
                </div>
              </motion.button>
            )
          })}
        </div>
        <p className="mt-4 px-1 text-[12.5px] leading-relaxed text-mute">
          실제 돈은 그대로 통장에 있어요. 평행세계에서는 참은 금액만큼 가상으로 쌓여요.
        </p>
      </div>
      <div className="px-5 pt-3 pb-6">
        <Btn
          variant="glow"
          onClick={() => {
            s.skip(wish.title, wish.amount, wish.category, dest)
            onDone()
          }}
        >
          평행세계로 보내기
        </Btn>
      </div>
    </div>
  )
}

function SkipDone({ wish, onClose, onParallel }: { wish: Wish; onClose: () => void; onParallel: () => void }) {
  const { parallelTotal, level } = useStore()
  const [before] = useState(parallelTotal - wish.amount)
  const [shown, setShown] = useState(before)
  const prevLv = levelOf(before)
  const up = level.lv > prevLv.lv
  useEffect(() => {
    const t = setTimeout(() => setShown(parallelTotal), 900)
    return () => clearTimeout(t)
  }, [parallelTotal])
  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <Stars n={60} seed={4} />
      <div className="relative flex flex-1 flex-col items-center justify-center px-6 text-center">
        <div className="relative grid h-[260px] w-full place-items-center">
          <Planet size={150} hue={level.hue} pulse={shown === parallelTotal ? 1 : 0} />
          <motion.div
            className="absolute grid size-12 place-items-center rounded-full bg-[linear-gradient(135deg,#FDE68A,#F59E0B)] text-[18px] font-black text-amber-900 shadow-[0_0_30px_#FCD34D]"
            initial={{ y: 220, scale: 1, opacity: 1 }}
            animate={{ y: 0, scale: 0.2, opacity: 0 }}
            transition={{ duration: 0.9, ease: [0.5, 0, 0.6, 1] }}
          >
            ₩
          </motion.div>
        </div>
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.9 }}>
          <div className="text-[15px] font-semibold text-[#C4B5FD]">
            {wish.title} 대신 +{won(wish.amount)}원
          </div>
          <div className="mt-2 text-[34px] font-bold tracking-tight">
            <Num value={shown} suffix="원" />
          </div>
          <div className="mt-1 text-[14px] text-white/55">평행세계의 내가 가진 돈</div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.3 }}
          className="mt-8 w-full rounded-[22px] bg-white/6 p-4 text-left"
        >
          <div className="flex items-center justify-between text-[13px]">
            <span className="font-semibold">
              {up ? `레벨 업! ${level.name}` : `Lv.${level.lv} ${level.name}`}
            </span>
            <span className="text-white/50">+30 XP</span>
          </div>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-[linear-gradient(90deg,#6D7CFF,#C084FC,#5EEAD4)]"
              initial={{ width: `${(up ? 0 : prevLv.progress) * 100}%` }}
              animate={{ width: `${level.progress * 100}%` }}
              transition={{ delay: 1.5, duration: 0.8 }}
            />
          </div>
          {level.next && <div className="mt-2 text-[12px] text-white/45">다음 행성까지 {won(level.remain)}원</div>}
        </motion.div>
      </div>
      <div className="relative flex gap-2 px-5 pt-3 pb-6">
        <Btn variant="ghost" className="!w-[38%]" onClick={onClose}>
          확인
        </Btn>
        <Btn variant="glow" onClick={onParallel}>
          평행세계 보러가기
        </Btn>
      </div>
    </div>
  )
}

function SpendDone({ wish, onClose }: { wish: Wish; onClose: () => void }) {
  const { available, perDay } = useStore()
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', damping: 12 }}
          className="grid size-16 place-items-center rounded-full bg-blue text-white"
        >
          <Check size={32} strokeWidth={3} />
        </motion.div>
        <h2 className="mt-5 text-[22px] font-bold">{wish.title} 기록했어요</h2>
        <p className="mt-2 text-[15px] text-sub">현실 가계부에 {won(wish.amount)}원이 들어갔어요</p>
        <div className="mt-8 w-full rounded-[22px] bg-[#F4F5F8] p-5 text-left">
          <div className="text-[13px] text-sub">이제 월급날까지 쓸 수 있는 돈</div>
          <div className="mt-1 text-[26px] font-bold tracking-tight">
            <Num value={available} suffix="원" />
          </div>
          <div className="mt-1 text-[13px] text-sub">하루 {won(perDay)}원씩 쓰면 돼요</div>
        </div>
      </div>
      <div className="px-5 pb-6">
        <Btn onClick={onClose}>확인</Btn>
      </div>
    </div>
  )
}

function DelayDone({ wish, date, onClose }: { wish: Wish; date: string; onClose: () => void }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <motion.div
          initial={{ scale: 0.4, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', damping: 16 }}
          className="grid size-16 place-items-center rounded-full bg-[#ECE8FF] text-[#725EEA]"
        >
          <CalendarClock size={30} />
        </motion.div>
        <h2 className="mt-5 text-[23px] font-bold">구매 계획을 저장했어요</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-sub">
          지금 구매하지 않고, 선택한 날짜에 다시 고민해 볼 수 있어요.
        </p>
        <div className="mt-7 w-full rounded-[22px] bg-[#F7F6FF] p-5 text-left">
          <div className="text-[12px] font-semibold text-[#7466B6]">구매 예정</div>
          <div className="mt-2 text-[16px] font-bold">{wish.title}</div>
          <div className="mt-1 text-[14px] text-sub">{won(wish.amount)}원 · {mdDot(parseISO(date))}</div>
        </div>
        <p className="mt-4 text-[12.5px] leading-relaxed text-sub">
          구매 계획만 저장했어요. 실제 돈이 빠져나가지 않고, 자동 결제나 알림도 발송되지 않아요.
          다음에 소비 비교를 열면 미뤄둔 목록에서 다시 확인할 수 있어요.
        </p>
      </div>
      <div className="px-5 pb-6"><Btn onClick={onClose}>확인</Btn></div>
    </div>
  )
}
