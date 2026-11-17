import { motion } from 'framer-motion'
import { ArrowLeft, BookOpenCheck, CalendarClock, CheckCircle2, ChevronDown, Clock3, RefreshCw, SearchCheck, ShieldAlert, Target } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import * as api from './api'
import { addDays, daysBetween, iso, mdDot, parseISO, today, won } from './lib'
import { candidateDates, chooseTimingCandidate, COMPARISON_HORIZON_DAYS, MAX_RECOMMEND_DAYS, pathIsSafe, savingsPlans, type TimingCandidate } from './purchaseTiming'
import { useStore } from './store'
import { Btn, CloseBtn } from './ui'

const MAX_DELAY_DAYS = MAX_RECOMMEND_DAYS // 공통 90일 분석에서 구매 후 14일 이상 검증

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
  initialSavingsMonthly,
  initialSavingsDay,
}: {
  wish: Wish
  onClose: () => void
  onBack: () => void
  onSaved: (date: string) => void
  initialDate?: string | null
  initialPlanId?: string | null
  initialSavingsMonthly?: number
  initialSavingsDay?: number
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
  const [savingsInput, setSavingsInput] = useState(String(initialSavingsMonthly ?? 0))
  const [savingsDay, setSavingsDay] = useState(initialSavingsDay ?? Math.min(28, state.profile.payday + 1))
  const [finding, setFinding] = useState(false)
  const [searchResult, setSearchResult] = useState<{
    checked: number
    candidates: TimingCandidate[]
    recommended: TimingCandidate | null
    failed: number
  } | null>(null)
  const searchToken = useRef(0)
  const monthlySaving = Number(savingsInput || 0)
  const goalValid = Number.isSafeInteger(monthlySaving)
    && (monthlySaving === 0 || (monthlySaving >= 1000 && monthlySaving <= 100000000))
    && Number.isInteger(savingsDay) && savingsDay >= 1 && savingsDay <= 31
  const asOf = iso(start)
  const horizon = COMPARISON_HORIZON_DAYS
  const plannedTransactions = goalValid ? savingsPlans(asOf, monthlySaving, savingsDay) : []

  const changeDate = (value: string) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return
    const parsed = parseISO(value)
    if (iso(parsed) !== value) return
    const days = daysBetween(start, parsed)
    if (days >= 1 && days <= MAX_DELAY_DAYS && value !== purchaseDate) {
      searchToken.current += 1
      setFinding(false)
      setSearchResult(null)
      setPurchaseDate(value)
    }
  }
  const delayDays = daysBetween(start, parseISO(purchaseDate))

  useEffect(() => {
    let alive = true
    setLoading(true)
    setEngine(null)
    if (!goalValid) { setLoading(false); return () => { alive = false } }
    api.personalCompare({
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
      plannedTransactions,
    }).then((value) => {
      if (!alive) return
      setEngine(value)
      setLoading(false)
    })
    return () => { alive = false }
  }, [
    wish.amount, horizon, delayDays, retry, goalValid, monthlySaving, savingsDay,
    state.balance, state.profile.keep, state.profile.salary, state.profile.payday,
    state.profile.daily, state.schedule,
  ])

  const now = engine?.paths.find((p) => p.scenario_id === 'purchase_now')
  const none = engine?.paths.find((p) => p.scenario_id === 'no_purchase')
  const delayed = engine?.paths.find((p) => p.scenario_id === 'purchase_delay')
  const ready = !!now && !!none && !!delayed && delayed.status === 'calculated'
  const afterPurchase = delayed?.daily_cashflow.find((d) => d.date === purchaseDate)
  const safe = pathIsSafe(delayed)
  const difference = delayed && now ? delayed.minimum_balance - now.minimum_balance : 0
  const nowSafe = pathIsSafe(now)
  const baselineUnsafe = !!none && !pathIsSafe(none)
  // 최저 잔액은 '구매 당일'이 아니라 전체 비교 기간의 가장 낮은 잔액입니다.
  // 연기가 유리하더라도 모든 조건을 만족하지 못하면 안전하다고 표현하지 않습니다.
  const verdict = baselineUnsafe
    ? {
        title: '구매하지 않아도 생활비 부족 위험이 있어요',
        body: '구매 시점보다 먼저 월급·예정 결제·생활비 정보를 확인해 주세요. 구매를 미뤄도 기존 지출 부담은 없어지지 않아요.',
      }
    : safe && !nowSafe
      ? {
          title: '지금보다 구매를 미루는 편이 나아요',
          body: '지금 구매할 때는 안전선에 닿지만, 선택한 날짜에 구매하면 등록된 금융 일정 안에서 생활비 안전선을 지켜요.',
        }
      : safe && nowSafe
        ? {
            title: '두 날짜 모두 생활비 안전선을 지켜요',
            body: '꼭 미뤄야 하는 상황은 아니에요. 다른 목표에 쓸 여유가 필요한지까지 생각해 보고 선택해 보세요.',
          }
        : !safe && nowSafe
          ? {
              title: '이 날짜로 미루는 게 더 나은 선택은 아니에요',
              body: '지금 구매하는 경우에는 안전선을 지키지만, 선택한 날짜에는 지출·입금 일정 때문에 부족 위험이 나타나요.',
            }
          : {
              title: '아직은 구매 시점보다 생활비 보호가 먼저예요',
              body: '지금 사도, 선택한 날짜에 사도 부족 위험이 있어요. 다른 날짜를 살펴보거나 구매 자체를 보류할 수 있어요.',
            }

  // 검색이 진행 중 금융 입력이 바뀌면 오래된 후보 결과를 화면에 적용하지 않습니다.
  useEffect(() => {
    searchToken.current += 1
    setFinding(false)
    setSearchResult(null)
    return () => { searchToken.current += 1 }
  }, [
    wish.amount, monthlySaving, savingsDay, state.balance, state.profile.keep,
    state.profile.salary, state.profile.payday, state.profile.daily, state.schedule,
  ])

  const findDates = async () => {
    if (!goalValid || finding) return
    const token = ++searchToken.current
    const dates = candidateDates(start, paydayNextDay, purchaseDate)
    setFinding(true)
    setSearchResult(null)
    // 백엔드 개인 현금흐름 API를 각 날짜에 재사용합니다.
    // 모든 후보는 동일한 90일 기간과 동일한 저축/결제 가정에서만 비교합니다.
    const outcomes = await Promise.all(dates.map(async (date): Promise<TimingCandidate | null> => {
      const result = await api.personalCompare({
        asOf,
        balance: state.balance,
        keep: state.profile.keep,
        salary: state.profile.salary,
        payday: state.profile.payday,
        daily: state.profile.daily,
        schedule: state.schedule,
        amount: wish.amount,
        horizon,
        delay: daysBetween(start, parseISO(date)),
        plannedTransactions,
      })
      const later = result?.paths.find((path) => path.scenario_id === 'purchase_delay')
      const nowPath = result?.paths.find((path) => path.scenario_id === 'purchase_now')
      if (!later || later.status !== 'calculated' || !nowPath) return null
      return {
        date,
        safe: pathIsSafe(later),
        minimumBalance: later.minimum_balance,
        firstShortfall: later.first_shortfall_date,
        nowSafe: pathIsSafe(nowPath),
      }
    }))
    if (token !== searchToken.current) return
    const candidates = outcomes.filter((result): result is TimingCandidate => result !== null)
    setSearchResult({
      checked: dates.length,
      candidates,
      recommended: chooseTimingCandidate(candidates),
      failed: dates.length - candidates.length,
    })
    setFinding(false)
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
          <CalendarClock size={17} /> 세 번째 선택 · 구매 연기
        </div>
        <h2 className="mt-2 text-[24px] font-bold leading-snug tracking-tight">
          지금 말고,<br />언제 사는 게 나을까요?
        </h2>
        <p className="mt-2 text-[14px] leading-relaxed text-sub">
          {wish.title} · {won(wish.amount)}원
          <br />미루는 게 실제로 도움이 되는지 비교해 볼게요.
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
            최대 76일 뒤까지 선택할 수 있어요. 구매 후 최소 14일의 생활비 흐름도 함께 확인해요.
          </p>
        </div>


        <div className="mt-4 rounded-[24px] border border-[#E3E5EE] bg-white p-4">
          <div className="flex items-center gap-2 text-[14px] font-bold">
            <Target size={18} className="text-[#7463E8]" /> 구매하면서 지키고 싶은 목표
          </div>
          <p className="mt-2 text-[12.5px] leading-relaxed text-sub">
            매월 저축할 돈까지 미리 떼어놓는다고 가정하고, 구매 시점을 찾아볼 수 있어요.
          </p>
          <div className="mt-3 grid grid-cols-[1fr_105px] gap-2">
            <label className="min-w-0 text-[12px] font-semibold text-sub">
              매월 지킬 저축액
              <div className="mt-1 flex items-center gap-1 rounded-xl border border-line px-3">
                <input
                  type="number" min={0} max={100000000} step={1000}
                  value={savingsInput}
                  onChange={(event) => setSavingsInput(event.target.value)}
                  className="h-12 w-full min-w-0 bg-transparent text-[16px] font-semibold text-ink"
                  aria-label="매월 지킬 저축액 (원)"
                />
                <span className="shrink-0 text-[13px] text-sub">원</span>
              </div>
            </label>
            <label className="text-[12px] font-semibold text-sub">
              매월 납입일
              <div className="mt-1 flex items-center gap-1 rounded-xl border border-line px-2">
                <input
                  type="number" min={1} max={31} step={1}
                  value={savingsDay}
                  onChange={(event) => setSavingsDay(Number(event.target.value))}
                  className="h-12 w-full min-w-0 bg-transparent text-center text-[16px] font-semibold text-ink"
                  aria-label="매월 저축할 날짜"
                />
                <span className="shrink-0 text-[13px] text-sub">일</span>
              </div>
            </label>
          </div>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {[
              { amount: 0, label: '목표 없음' },
              { amount: 50000, label: '5만 원' },
              { amount: 100000, label: '10만 원' },
              { amount: 200000, label: '20만 원' },
            ].map((item) => (
              <button
                key={item.amount}
                onClick={() => setSavingsInput(String(item.amount))}
                className={'rounded-lg border px-2.5 py-1.5 text-[11.5px] font-semibold ' +
                  (goalValid && monthlySaving === item.amount
                    ? 'border-[#BDB3FF] bg-[#F2EFFF] text-[#6454C9]'
                    : 'border-[#E6E8F0] text-sub')}
              >
                {item.label}
              </button>
            ))}
          </div>
          {!goalValid && (
            <p className="mt-2 text-[12px] font-semibold text-[#C54858]">
              저축액은 0원 또는 1,000원~1억 원, 납입일은 1~31일로 입력해 주세요.
            </p>
          )}
          <p className="mt-3 text-[11.5px] leading-relaxed text-sub">
            {monthlySaving > 0 && goalValid
              ? '향후 ' + horizon + '일 동안 가상의 정기 이체 ' + plannedTransactions.length + '건을 반영해요.'
              : '저축 목표가 없으면 등록된 생활비와 필수 결제만 보호해요.'}
            {' '}저축이 실제로 실행되거나 투자 수익이 발생하지는 않아요.
          </p>

          <button
            onClick={findDates}
            disabled={!goalValid || finding}
            className={'mt-4 flex w-full items-center justify-center gap-2 rounded-2xl py-3.5 text-[14px] font-bold ' +
              (!goalValid || finding ? 'bg-[#E5E5F0] text-sub' : 'bg-[#27224F] text-white')}
          >
            {finding ? <Clock3 size={17} className="animate-pulse" /> : <SearchCheck size={18} />}
            {finding ? '구매 날짜 후보를 확인하고 있어요' : '목표를 지키는 구매 시점 찾기'}
          </button>
          <p className="mt-2 text-center text-[11px] text-sub">
            AI 예측이 아닌 기존 금융 엔진의 조건 검증 결과예요.
          </p>

          {searchResult && (
            <div className="mt-3 rounded-[18px] bg-[#F5F4FE] p-3.5">
              <div className="text-[11.5px] font-semibold text-[#7669A0]">
                {searchResult.candidates.length}개 날짜 검증 완료
                {searchResult.failed > 0 && (' · ' + searchResult.failed + '개 서버 검증 실패')}
              </div>
              {searchResult.recommended ? (
                <>
                  <div className="mt-1.5 text-[17px] font-bold text-[#42347F]">
                    {mdDot(parseISO(searchResult.recommended.date))}에 구매하면 조건을 지킬 수 있어요
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#6B628C]">
                    {searchResult.recommended.nowSafe
                      ? '지금 구매해도 등록된 조건은 충족해요. 구매를 미루는 건 필수가 아닌 선택이에요.'
                      : '지금 구매보다, 검증한 후보 날짜 중 이 시점부터 안전선을 지킬 수 있어요.'}
                    {' '}이 날짜는 확인한 후보 중 가장 이른 날짜이며, 모든 날짜를 탐색한 결과는 아니에요.
                  </p>
                  <div className="mt-2 text-[12px] font-semibold text-[#54458A]">
                    90일 중 최저 예상 잔액 {won(searchResult.recommended.minimumBalance)}원
                  </div>
                  <button
                    onClick={() => changeDate(searchResult.recommended!.date)}
                    className="mt-3 w-full rounded-xl bg-white px-3 py-3 text-[13px] font-bold text-[#6552D9]"
                  >
                    이 날짜로 상세 비교하기
                  </button>
                </>
              ) : (
                <>
                  <div className="mt-1.5 text-[15px] font-bold text-[#42347F]">
                    {searchResult.candidates.length === 0 ? '서버에서 후보 날짜를 확인하지 못했어요' : '검증한 후보 중 조건을 지키는 날짜가 없어요'}
                  </div>
                  <p className="mt-1.5 text-[12.5px] leading-relaxed text-[#6B628C]">
                    {searchResult.candidates.length === 0
                      ? '연결 상태를 확인하고 다시 시도해 주세요. 임의의 날짜를 추천하지 않아요.'
                      : '저축액이나 구매 금액을 조정하거나 다른 날짜를 직접 선택해 볼 수 있어요.'}
                  </p>
                </>
              )}
              {searchResult.candidates.length > 0 && (
                <p className="mt-2 text-[11.5px] text-[#7A7196]">
                  후보 {searchResult.checked}개를 같은 90일 동안 비교했으며, 등록된 급여·정기결제·생활비와 선택한 저축 계획을 기준으로 판정했어요.
                </p>
              )}
            </div>
          )}
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
            <div className={'mt-4 rounded-[22px] border p-4 ' + (safe && !baselineUnsafe ? 'border-[#D6EDE3] bg-[#F0FAF5]' : 'border-[#F6D8DD] bg-[#FFF5F5]')}>
              <div className="flex items-start gap-2.5">
                {safe && !baselineUnsafe
                  ? <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-[#15936B]" />
                  : <ShieldAlert size={20} className="mt-0.5 shrink-0 text-[#D34A5D]" />}
                <div className="min-w-0 flex-1">
                  <div className={'text-[15px] font-bold leading-snug ' + (safe && !baselineUnsafe ? 'text-[#12694F]' : 'text-[#B83F52]')}>
                    {verdict.title}
                  </div>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-sub">{verdict.body}</p>
                </div>
              </div>
              <div className="mt-3 border-t border-black/5 pt-3 text-[12px] text-sub">
                {difference > 0
                  ? <>지금 사는 경우보다 <b className="text-ink">최저 잔액 +{won(difference)}원</b></>
                  : difference < 0
                    ? <>지금 사는 경우보다 <b className="text-ink">최저 잔액 -{won(-difference)}원</b></>
                    : <>두 선택의 <b className="text-ink">최저 잔액은 같아요.</b> 구매일까지의 흐름이 다를 수 있어요.</>}
              </div>
              {!safe && delayed?.first_shortfall_date && (
                <p className="mt-2 text-[12px] font-semibold text-[#B83F52]">
                  안전선 아래로 내려갈 수 있는 날: {mdDot(parseISO(delayed.first_shortfall_date))}
                </p>
              )}
            </div>

            <div className="mt-4">
              <div className="mb-2 text-[14px] font-bold">세 가지 선택을 같은 기준으로 비교해요</div>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { title: '지금 구매', path: now!, emphasis: 'text-[#D34A5D]' },
                  { title: '구매 안 함', path: none!, emphasis: 'text-[#3182F6]' },
                  { title: '구매 연기', path: delayed!, emphasis: 'text-[#7560D8]' },
                ].map((choice) => {
                  const okay = choice.path.minimum_balance_met && choice.path.essential_payments_covered
                  return (
                    <div key={choice.title} className={'rounded-[17px] border p-3 ' + (choice.title === '구매 연기' ? 'border-[#DAD5FF] bg-[#F8F7FF]' : 'border-line bg-white')}>
                      <div className={'text-[12px] font-bold ' + choice.emphasis}>{choice.title}</div>
                      <div className="mt-1 text-[10.5px] text-sub">기간 중 최저 잔액</div>
                      <div className="mt-2 break-all text-[15px] font-bold tabular-nums tracking-tight">{won(choice.path.minimum_balance)}원</div>
                      <div className={'mt-1.5 text-[11px] font-semibold ' + (okay ? 'text-[#16856A]' : 'text-[#D34A5D]')}>
                        {okay ? '안전선 유지' : '부족 위험'}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2.5">
              <div className="rounded-[20px] border border-line p-4">
                <div className="text-[12px] text-sub">구매일 예상 마감 잔액</div>
                <div className="mt-2 text-[20px] font-bold tabular-nums tracking-tight">
                  {won(afterPurchase?.closing_balance ?? 0)}원
                </div>
              </div>
              <div className="rounded-[20px] border border-line p-4">
                <div className="text-[12px] text-sub">분석 기간 최저 잔액</div>
                <div className={'mt-2 text-[20px] font-bold tabular-nums tracking-tight ' + (safe ? 'text-ink' : 'text-red')}>
                  {won(delayed!.minimum_balance)}원
                </div>
              </div>
            </div>

            <div className="mt-3 rounded-[22px] bg-[#F7F8FA] p-4">
              <div className="text-[14px] font-bold">잔액 흐름은 어떻게 달라질까요?</div>
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
            <div className="mt-3 overflow-hidden rounded-[20px] border border-[#E9E7F5] bg-white">
              <button onClick={() => setShowReason((value) => !value)} aria-expanded={showReason} className="flex w-full items-center gap-2.5 px-4 py-3.5 text-left">
                <BookOpenCheck size={18} className="shrink-0 text-[#7560D8]" />
                <span className="flex-1 text-[13.5px] font-semibold">왜 구매 날짜에 따라 결과가 달라질까요?</span>
                <ChevronDown size={17} className={'text-sub transition-transform ' + (showReason ? 'rotate-180' : '')} />
              </button>
              {showReason && (
                <div className="border-t border-[#F0EEF7] px-4 py-3.5 text-[12.5px] leading-relaxed text-sub">
                  구매를 미루면 그전까지는 돈이 통장에 남아 있어요. 하지만 월급을 받아도 카드값·고정 지출·생활비가 뒤따르기 때문에
                  <b className="text-ink"> 월급날 다음 날이 무조건 안전한 건 아니에요.</b>
                  <p className="mt-2">그래프는 실제 계좌 거래가 아닌 입력한 조건으로 계산한 세 가지 미래예요. 투자 수익이나 물가 변동은 반영하지 않아요.</p>
                </div>
              )}
            </div>
            <p className="mt-3 px-1 text-[12px] leading-relaxed text-sub">
              입력된 월급·정기결제·하루 생활비를 기준으로 한 가상 계산이에요. 실제 은행 잔액이나 확정된 미래 지출은 아니며, 등록되지 않은 지출에 따라 결과가 달라질 수 있어요.
            </p>
          </>
        )}
      </div>

      <div className="border-t border-line bg-white px-5 pt-3 pb-6">
        <Btn variant="glow" disabled={!ready || loading || !goalValid} onClick={() => {
          s.later(wish.title, wish.amount, purchaseDate, initialPlanId, { monthlySaving, savingsDay })
          onSaved(purchaseDate)
        }}>
          {mdDot(parseISO(purchaseDate))} 구매 계획 {initialPlanId ? '수정하기' : '저장하기'}
        </Btn>
        <p className="mt-2 text-center text-[11.5px] text-sub">계획만 저장돼요. 실제 잔액 차감이나 자동 결제·알림은 없어요.</p>
      </div>
    </div>
  )
}
