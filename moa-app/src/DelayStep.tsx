import { motion } from 'framer-motion'
import { ArrowLeft, BookOpenCheck, CalendarClock, CheckCircle2, ChevronDown, Clock3, RefreshCw, ShieldAlert } from 'lucide-react'
import { useEffect, useState } from 'react'
import * as api from './api'
import { addDays, daysBetween, iso, mdDot, parseISO, today, won } from './lib'
import { useStore } from './store'
import { Btn, CloseBtn } from './ui'

const MAX_DELAY_DAYS = 76 // 구매 후 14일을 포함하되 API의 90일 최대 기간을 넘지 않음

type Wish = { title: string; amount: number }

function DelayComparisonChart({
  now,
  none,
  delayed,
  purchaseDate,
  keep,
}: {
  now: api.PersonalPath
  none: api.PersonalPath
  delayed: api.PersonalPath
  purchaseDate: string
  keep: number
}) {
  const n = Math.min(now.daily_cashflow.length, none.daily_cashflow.length, delayed.daily_cashflow.length)
  if (n < 2) return null
  const points = [none, now, delayed].flatMap((p) => p.daily_cashflow.slice(0, n))
  const values = points.flatMap((p) => [p.closing_balance, p.lowest_balance])
  const min = Math.min(0, keep, ...values)
  const max = Math.max(keep, ...values)
  const pad = (max - min) * 0.12 || 1000
  const width = 340
  const height = 168
  const x = (i: number) => 8 + (i / (n - 1)) * (width - 16)
  const y = (value: number) => 9 + ((max + pad - value) / (max - min + pad * 2)) * 137
  const path = (p: api.PersonalPath) =>
    p.daily_cashflow.slice(0, n).map((d, i) =>
      (i === 0 ? 'M' : 'L') + x(i).toFixed(1) + ',' + y(d.closing_balance).toFixed(1),
    ).join(' ')
  const marked = delayed.daily_cashflow.findIndex((d) => d.date === purchaseDate)
  const markerX = marked >= 0 && marked < n ? x(marked) : null

  return (
    <svg viewBox={'0 0 ' + width + ' ' + height} className="w-full" role="img" aria-label="같은 기간의 지금 구매, 구매 안 함, 구매 연기 예상 잔액 그래프">
      <line x1={8} x2={332} y1={y(keep)} y2={y(keep)} stroke="#F04452" strokeOpacity=".5" strokeDasharray="4 5" />
      <text x={329} y={y(keep) - 6} textAnchor="end" fontSize="10" fill="#C54858">지켜둘 돈</text>
      {markerX !== null && (
        <line x1={markerX} x2={markerX} y1={8} y2={145} stroke="#8B69E8" strokeOpacity=".55" strokeDasharray="3 5" />
      )}
      <path d={path(none)} fill="none" stroke="#3182F6" strokeWidth={2.1} strokeLinecap="round" strokeLinejoin="round" />
      <path d={path(now)} fill="none" stroke="#F04452" strokeWidth={1.8} strokeOpacity=".75" strokeLinecap="round" strokeLinejoin="round" />
      <motion.path
        key={purchaseDate}
        d={path(delayed)}
        fill="none"
        stroke="#8B69E8"
        strokeWidth={2.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.6 }}
      />
      {markerX !== null && (
        <circle cx={markerX} cy={y(delayed.daily_cashflow[marked].closing_balance)} r={4.5} fill="#8B69E8" stroke="white" strokeWidth={2} />
      )}
      <text x={8} y={164} fontSize="10.5" fill="#8B95A1">{mdDot(parseISO(none.daily_cashflow[0].date))}</text>
      <text x={332} y={164} textAnchor="end" fontSize="10.5" fill="#8B95A1">
        {mdDot(parseISO(none.daily_cashflow[n - 1].date))}
      </text>
    </svg>
  )
}

export function DelayStep({
  wish,
  onClose,
  onBack,
  onSaved,
  initialDate,
  initialPlanId,
}: {
  wish: Wish
  onClose: () => void
  onBack: () => void
  onSaved: (date: string) => void
  initialDate?: string | null
  initialPlanId?: string | null
}) {
  const s = useStore()
  const { state, fc } = s
  const start = today()
  const earliest = iso(addDays(start, 1))
  const latest = iso(addDays(start, MAX_DELAY_DAYS))
  const paydayNextDay = iso(addDays(fc.end, 1))
  const [purchaseDate, setPurchaseDate] = useState(() =>
    initialDate && initialDate >= earliest && initialDate <= latest ? initialDate : paydayNextDay,
  )
  const [engine, setEngine] = useState<api.PersonalCompare | null>(null)
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [showReason, setShowReason] = useState(false)

  const changeDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return
    const parsed = parseISO(value)
    if (iso(parsed) !== value) return
    const days = daysBetween(start, parsed)
    if (days >= 1 && days <= MAX_DELAY_DAYS) setPurchaseDate(value)
  }
  const delayDays = daysBetween(start, parseISO(purchaseDate))
  // 비교하는 세 선택과 구매 날짜를 바꾼 결과까지 모두 같은 90일 범위로 비교합니다.
  const horizon = 90

  useEffect(() => {
    let alive = true
    setLoading(true)
    setEngine(null)
    const timer = window.setTimeout(() => api.personalCompare({
      asOf: iso(today()),
      balance: state.balance,
      keep: state.profile.keep,
      salary: state.profile.salary,
      payday: state.profile.payday,
      daily: state.profile.daily,
      schedule: state.schedule,
      amount: wish.amount,
      horizon,
      delay: delayDays,
    }).then((value) => {
      if (!alive) return
      setEngine(value)
      setLoading(false)
    }), 240)
    return () => { alive = false; clearTimeout(timer) }
  }, [
    wish.amount, horizon, delayDays, retry,
    state.balance, state.profile.keep, state.profile.salary, state.profile.payday,
    state.profile.daily, state.schedule,
  ])

  const now = engine?.paths.find((p) => p.scenario_id === 'purchase_now')
  const none = engine?.paths.find((p) => p.scenario_id === 'no_purchase')
  const delayed = engine?.paths.find((p) => p.scenario_id === 'purchase_delay')
  const ready = !!now && !!none && !!delayed && [now, none, delayed].every((path) => path.status === 'calculated')
  const afterPurchase = delayed?.daily_cashflow.find((d) => d.date === purchaseDate)
  const safe = !!delayed?.minimum_balance_met && !!delayed.essential_payments_covered
  const difference = delayed && now ? delayed.minimum_balance - now.minimum_balance : 0
  const nowSafe = !!now?.minimum_balance_met && !!now?.essential_payments_covered
  const noneSafe = !!none?.minimum_balance_met && !!none?.essential_payments_covered
  const prePurchaseDate = iso(addDays(parseISO(purchaseDate), -1))
  const preNowBalance = now?.daily_cashflow.find((p) => p.date === prePurchaseDate)?.closing_balance
  const preDelayBalance = delayed?.daily_cashflow.find((p) => p.date === prePurchaseDate)?.closing_balance
  const breathingRoom = preNowBalance !== undefined && preDelayBalance !== undefined ? preDelayBalance - preNowBalance : null

  // 예정된 결제 중 구매 전까지 실제 달력에 걸리는 첫 번째 항목을 보여줍니다.
  const nextBill = (() => {
    for (let offset = 1; offset <= delayDays; offset++) {
      const date = addDays(start, offset)
      const bill = state.schedule.find((item) => item.day === date.getDate())
      if (bill) return { ...bill, date }
    }
    return null
  })()
  const verdict = !noneSafe
    ? {
        title: '구매하지 않아도 잔액 부족 위험이 있어요',
        body: '이미 등록된 결제와 생활비 때문에 생기는 위험일 수 있어요. 구매 날짜보다 예정 지출을 먼저 살펴보세요.',
      }
    : safe && !nowSafe
      ? {
          title: '이 날짜로 미루면 부담을 줄일 수 있어요',
          body: '지금 사는 경우에는 생활비 안전선이 흔들리지만, 선택한 날짜에 구매하면 등록된 일정에서는 안전선을 지켜요.',
        }
      : safe && nowSafe
        ? {
            title: '지금 사도, 미뤄도 등록된 기준에서는 괜찮아요',
            body: '두 경우 모두 생활비 안전선을 지켜요. 다만 미루는 동안 다른 지출에 쓸 현금 여유가 생겨요.',
          }
        : nowSafe
          ? {
              title: '오히려 이 날짜에는 부담이 생길 수 있어요',
              body: '지금 구매하는 경우에는 안전선을 지키지만, 선택한 날짜에는 예정된 수입·지출 시점이 겹칠 수 있어요.',
            }
          : {
              title: '이 날짜까지 미뤄도 부족 위험이 있어요',
              body: '당장 구매하는 것과 선택한 날짜 모두 안전선을 지키기 어려워요. 다른 날짜를 검토하거나 구매를 보류해 보세요.',
            }
  const quickDates = [
    { label: '7일 뒤', date: iso(addDays(start, 7)) },
    { label: '월급 다음날', date: paydayNextDay },
    { label: '30일 뒤', date: iso(addDays(start, 30)) },
  ].filter((v) => v.date >= earliest && v.date <= latest)

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pt-1">
        <button onClick={onBack} className="flex items-center gap-1.5 py-2 text-[14px] font-semibold text-sub">
          <ArrowLeft size={19} /> 비교로 돌아가기
        </button>
        <CloseBtn onClick={onClose} />
      </div>

      <div className="no-scrollbar flex-1 overflow-y-auto px-5 pb-4">
        <div className="mt-3 flex items-center gap-2 text-[13px] font-bold text-[#6D5BEF]">
          <CalendarClock size={17} /> 다른 선택 · 구매 연기
        </div>
        <h2 className="mt-2 text-[24px] font-bold leading-snug tracking-tight">
          지금이 아니라면,<br />언제 사는 게 나을까요?
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-sub">
          {wish.title} · {won(wish.amount)}원
          <br />가격은 같아도 구매 시점에 따라 생활비 부담은 달라질 수 있어요.
        </p>

        <div className="mt-6 rounded-[24px] border border-[#DAD5FF] bg-[#F8F7FF] p-4">
          <div className="flex items-center gap-2 text-[14px] font-bold">
            <CalendarClock size={18} className="text-[#7463E8]" /> 언제 구매할까요?
          </div>
          <div className="mt-3 grid grid-cols-3 gap-2">
            {quickDates.map((item) => (
              <button
                key={item.label}
                onClick={() => changeDate(item.date)}
                className={'rounded-xl border px-1 py-2.5 text-[12.5px] font-semibold transition-colors ' +
                  (purchaseDate === item.date ? 'border-[#8070E9] bg-[#8070E9] text-white' : 'border-[#E0DDF5] bg-white text-[#655C94]')}
              >
                {item.label}
              </button>
            ))}
          </div>
          <label className="mt-4 block text-[12px] font-semibold text-[#655C94]" htmlFor="delay-date">
            직접 날짜 선택
          </label>
          <input
            id="delay-date"
            type="date"
            min={earliest}
            max={latest}
            value={purchaseDate}
            onChange={(event) => changeDate(event.target.value)}
            className="mt-2 min-h-12 w-full rounded-xl border border-[#E0DDF5] bg-white px-3 text-[16px] font-semibold text-ink"
          />
          <p className="mt-2 text-[11.5px] leading-relaxed text-[#736A9A]">
            날짜별로 90일간의 잔액을 같은 조건으로 비교해요. 구매 이후 최소 14일도 포함돼요.
          </p>
        </div>

        {loading ? (
          <div className="mt-4 rounded-[22px] bg-[#F5F6F8] px-4 py-8 text-center" role="status">
            <Clock3 size={24} className="mx-auto animate-pulse text-[#8B69E8]" />
            <p className="mt-3 text-[14px] font-semibold">예정 결제와 생활비를 계산하고 있어요</p>
            <p className="mt-1 text-[12px] text-sub">서버에서 세 가지 선택을 같은 기간으로 비교해요</p>
          </div>
        ) : !ready ? (
          <div className="mt-4 rounded-[22px] border border-[#E7E8ED] bg-[#F7F8FA] p-5">
            <div className="flex items-center gap-2 text-[14px] font-bold"><ShieldAlert size={19} /> 금융 분석 결과를 불러오지 못했어요</div>
            <p className="mt-2 text-[13px] leading-relaxed text-sub">
              정확한 잔액 비교를 위해 서버 연결을 확인해 주세요. 계산되지 않은 금액을 임의로 표시하지 않아요.
            </p>
            <button onClick={() => setRetry((v) => v + 1)} className="mt-3 flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-[13px] font-semibold text-[#6552D9]">
              <RefreshCw size={15} /> 다시 계산하기
            </button>
          </div>
        ) : (
          <>
            <div className={'mt-4 rounded-[22px] border p-4 ' + (safe && noneSafe ? 'border-[#D6EDE3] bg-[#F0FAF5]' : 'border-[#F6D8DD] bg-[#FFF5F5]')}>
              <div className="flex items-start gap-2.5">
                {safe && noneSafe
                  ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[#15936B]" />
                  : <ShieldAlert size={20} className="mt-0.5 shrink-0 text-[#D34A5D]" />}
                <div className="min-w-0 flex-1">
                  <p className={'text-[15px] font-bold leading-snug ' + (safe && noneSafe ? 'text-[#12694F]' : 'text-[#B83F52]')}>
                    {verdict.title}
                  </p>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-sub">{verdict.body}</p>
                </div>
              </div>
              {breathingRoom !== null && breathingRoom > 0 && (
                <div className="mt-3 rounded-xl bg-white/70 px-3 py-3">
                  <div className="text-[12px] text-sub">구매 전날까지 현금 여유</div>
                  <div className="mt-1 text-[20px] font-bold text-[#5546BC]">+{won(breathingRoom)}원</div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-sub">
                    지금 구매할 때보다 통장에 남는 금액이에요. 구매하는 날에는 이 금액도 지출돼요.
                  </p>
                </div>
              )}
              {breathingRoom === null && (
                <p className="mt-2 text-[12px] text-sub">구매 전 현금 차이는 서버에서 확인할 수 없었어요.</p>
              )}
              {!safe && delayed?.first_shortfall_date && (
                <p className="mt-3 text-[12px] font-semibold text-[#B83F52]">
                  부족 위험이 나타나는 첫날: {mdDot(parseISO(delayed.first_shortfall_date))}
                </p>
              )}
            </div>

            <div className="mt-4">
              <div className="mb-2 text-[14px] font-bold">같은 기간, 세 가지 선택</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { label: '지금 구매', path: now!, active: false, tone: 'text-[#D34A5D]' },
                  { label: '구매 안 함', path: none!, active: false, tone: 'text-[#3182F6]' },
                  { label: '구매 연기', path: delayed!, active: true, tone: 'text-[#7663D9]' },
                ].map((choice) => {
                  const okay = choice.path.minimum_balance_met && choice.path.essential_payments_covered
                  return (
                    <div key={choice.label} className={'rounded-[17px] border p-3 ' + (choice.active ? 'border-[#D7D1FF] bg-[#F8F7FF]' : 'border-line bg-white')}>
                      <div className={'text-[11.5px] font-bold ' + choice.tone}>{choice.label}</div>
                      <div className="mt-1.5 text-[10.5px] text-sub">최저 잔액</div>
                      <div className="mt-0.5 break-all text-[15px] font-bold tabular-nums tracking-tight">{won(choice.path.minimum_balance)}원</div>
                      <div className={'mt-1.5 text-[10.5px] font-semibold ' + (okay ? 'text-[#16856A]' : 'text-[#D34A5D]')}>
                        {okay ? '안전선 유지' : '부족 위험'}
                      </div>
                    </div>
                  )
                })}
              </div>
              {difference !== 0 && (
                <p className="mt-2 text-[12px] leading-relaxed text-sub">
                  지금 구매 대비 연기했을 때 90일 최저 잔액이
                  <b className="text-ink"> {difference > 0 ? '+' : '-'}{won(Math.abs(difference))}원</b> 달라져요.
                </p>
              )}
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <div className="rounded-[20px] border border-line p-4">
                <div className="text-[12px] text-sub">구매일 예상 마감 잔액</div>
                <div className="mt-2 text-[20px] font-bold tabular-nums tracking-tight">
                  {afterPurchase ? won(afterPurchase.closing_balance) + '원' : '계산 값 없음'}
                </div>
              </div>
              <div className="rounded-[20px] border border-line p-4">
                <div className="text-[12px] text-sub">90일 동안 최저 잔액</div>
                <div className={'mt-2 text-[20px] font-bold tabular-nums tracking-tight ' + (safe ? 'text-ink' : 'text-red')}>
                  {won(delayed!.minimum_balance)}원
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-[22px] bg-[#F7F8FA] p-4">
              <div className="text-[14px] font-bold">잔액이 달라지는 시점</div>
              <p className="mt-1 text-[11.5px] text-sub">같은 {horizon}일 · 예정 수입과 지출을 동일하게 반영</p>
              <div className="mt-3">
                <DelayComparisonChart now={now!} none={none!} delayed={delayed!} purchaseDate={purchaseDate} keep={state.profile.keep} />
              </div>
              <div className="mt-2 flex flex-wrap justify-center gap-x-4 gap-y-2 text-[11.5px] font-semibold text-sub">
                <span><i className="mr-1 inline-block h-0.5 w-3 align-middle bg-[#F04452]" /> 지금 구매</span>
                <span><i className="mr-1 inline-block h-0.5 w-3 align-middle bg-[#3182F6]" /> 구매 안 함</span>
                <span><i className="mr-1 inline-block h-0.5 w-3 align-middle bg-[#8B69E8]" /> 구매 연기</span>
              </div>
            </div>
            <div className="mt-3 overflow-hidden rounded-[19px] border border-line bg-white">
              <button onClick={() => setShowReason((value) => !value)} aria-expanded={showReason}
                className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left">
                <BookOpenCheck size={18} className="shrink-0 text-[#7560D8]" />
                <span className="flex-1 text-[13px] font-semibold">왜 이런 차이가 날까요?</span>
                <ChevronDown size={16} className={'text-sub transition-transform ' + (showReason ? 'rotate-180' : '')} />
              </button>
              {showReason && (
                <div className="border-t border-line px-4 py-3.5 text-[12.5px] leading-relaxed text-sub">
                  구매를 미루면 구매일까지 돈을 보유할 수 있어요. 하지만 나중에 결국 같은 금액을 소비하므로
                  <b className="text-ink"> 총지출을 줄이는 효과는 아니에요.</b>
                  {nextBill ? (
                    <p className="mt-2">
                      구매 전 예정 결제: <b className="text-ink">{mdDot(nextBill.date)} {nextBill.title} {won(nextBill.amount)}원</b>.
                      이런 지출을 먼저 감당할 수 있는지가 중요해요.
                    </p>
                  ) : (
                    <p className="mt-2">구매 전까지 등록된 정기 결제는 없어요. 아직 입력하지 않은 지출은 계산에 포함되지 않을 수 있어요.</p>
                  )}
                </div>
              )}
            </div>
            <p className="mt-3 px-1 text-[12px] leading-relaxed text-sub">
              입력한 잔액·급여·예정 지출·하루 생활비를 기준으로 한 가상 예측이에요. 실제 미래 잔액을 보장하지 않아요.
            </p>
          </>
        )}
      </div>

      <div className="border-t border-line bg-white px-5 pt-3 pb-6">
        <Btn variant="glow" disabled={!ready || loading} onClick={() => {
          s.later(wish.title, wish.amount, purchaseDate, initialPlanId)
          onSaved(purchaseDate)
        }}>
          {mdDot(parseISO(purchaseDate))} 구매 계획 {initialPlanId ? '수정하기' : '저장하기'}
        </Btn>
        <p className="mt-2 text-center text-[11.5px] text-sub">계획만 저장돼요. 실제 잔액 차감이나 자동 결제·알림은 없어요.</p>
      </div>
    </div>
  )
}
