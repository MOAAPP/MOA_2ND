import { AnimatePresence, motion } from 'framer-motion'
import { Bell, CalendarClock, ChevronRight, Flame, Globe2, Orbit, Sparkles } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import * as api from './api'
import { ForecastChart } from './charts'
import { CATS, LESSONS, type Category } from './data'
import { iso, md, mdDot, mdw, today, won, wonShort } from './lib'
import { useStore } from './store'
import { AIBadge, CatIcon, Num, Planet, Stars } from './ui'

export type World = 'real' | 'parallel'

export function Logo({ dark }: { dark?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="relative size-6">
        <span className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_35%_30%,#A5B4FC,#4F46E5_60%,#1E1B4B)]" />
        <span className="absolute -inset-x-1 top-1/2 h-[5px] -translate-y-1/2 -rotate-12 rounded-[50%] border-[1.5px] border-[#A5B4FC]/80" />
      </div>
      <span className={'text-[21px] font-extrabold tracking-[-0.04em] ' + (dark ? 'text-white' : 'text-ink')}>moa</span>
    </div>
  )
}

export function Home({
  world,
  setWorld,
  openDecide,
  goTab,
  openLesson,
  openSettings,
  openLedgerForecast,
}: {
  world: World
  setWorld: (w: World) => void
  openDecide: () => void
  goTab: (t: 'ledger' | 'parallel' | 'lab', sub?: string) => void
  openLesson: (id: string) => void
  openSettings: () => void
  openLedgerForecast: () => void
}) {
  const s = useStore()
  const { state } = s
  const dark = world === 'parallel'
  const nextLesson = LESSONS.find((l) => !state.lessonsDone.includes(l.id)) ?? LESSONS[0]
  const nextPurchasePlan = [...state.later].filter((item) => item.until >= iso(today()))
    .sort((a, b) => a.until.localeCompare(b.until))[0]

  const [brief, setBrief] = useState<api.BriefOut | null>(null)
  useEffect(() => {
    const monthKey = iso(today()).slice(0, 7)
    const byCat: Record<string, number> = {}
    state.txs
      .filter((x) => x.kind === 'spend' && x.date.startsWith(monthKey))
      .forEach((x) => (byCat[CATS[x.category].label] = (byCat[CATS[x.category].label] ?? 0) + x.amount))
    const top = Object.entries(byCat).sort((a, b) => b[1] - a[1])[0]
    const t = today()
    const lastMonthKey = iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)).slice(0, 7)
    const lastSame = state.txs
      .filter((x) => x.kind === 'spend' && x.date.startsWith(lastMonthKey) && Number(x.date.slice(8)) <= t.getDate())
      .reduce((a, x) => a + x.amount, 0)
    const bill = s.fc.bills[0]
    const input = {
      usable: s.available,
      daysLeftInMonth: s.fc.daysLeft,
      monthSpent: s.monthSpend,
      lastMonthSameDay: lastSame || null,
      topCategory: top ? { name: top[0], amount: top[1] } : null,
      savedThisMonth: s.monthSkip,
      holdsThisMonth: s.skipped.filter((x) => x.date.startsWith(monthKey)).length,
      nextBill: bill ? { date: iso(bill.date), amount: bill.amount } : null,
    }
    let alive = true
    api.cached('brief.' + api.hashKey(input), () => api.aiBrief(input).then((r) => r?.data ?? null)).then((r) => alive && setBrief(r))
    return () => {
      alive = false
    }
  }, [s.available, s.monthSpend, s.monthSkip]) // eslint-disable-line react-hooks/exhaustive-deps

  const insights = useMemo(() => {
    const out: { tag: string; title: string; body: string; action?: () => void }[] = []
    if (brief) {
      const to = brief.action?.to
      out.push({
        tag: 'AI 브리핑',
        title: brief.headline,
        body: brief.body,
        action: to === 'choose' ? openDecide : to === 'ledger' ? () => goTab('ledger') : to === 'save' ? () => goTab('lab', 'saving') : to === 'forks' ? () => goTab('parallel') : undefined,
      })
    }
    const bill = s.fc.bills[0]
    if (bill) {
      const after = s.fc.pts.find((p) => p.date.getTime() === bill.date.getTime())
      out.push({
        tag: '결제일 예측',
        title: `${mdDot(bill.date)} ${bill.title} ${wonShort(bill.amount)}원`,
        body: `빠져나간 뒤 잔액은 약 ${wonShort(after?.balance ?? 0)}원이에요. 월급날까지 가장 낮은 날은 ${mdDot(s.fc.min.date)}이에요.`,
        action: openLedgerForecast,
      })
    }
    const monthKey = iso(today()).slice(0, 7)
    const byCat: Partial<Record<Category, number>> = {}
    state.txs
      .filter((x) => x.kind === 'spend' && x.date.startsWith(monthKey))
      .forEach((x) => (byCat[x.category] = (byCat[x.category] ?? 0) + x.amount))
    const top = (Object.entries(byCat) as [Category, number][]).sort((a, b) => b[1] - a[1])[0]
    if (top) {
      out.push({
        tag: '소비 패턴',
        title: `이번 달 ${CATS[top[0]].label}에 가장 많이 썼어요`,
        body: `${won(top[1])}원 · 전체 지출의 ${Math.round((top[1] / Math.max(1, s.monthSpend)) * 100)}%예요. 여기서 한 번만 참아도 평행세계가 커져요.`,
        action: () => goTab('ledger'),
      })
    }
    if (s.skipped.length) {
      out.push({
        tag: '평행세계',
        title: `이번 달 ${wonShort(s.monthSkip)}원을 참았어요`,
        body: `참은 돈이 이자와 투자로 ${s.growth >= 0 ? '+' : ''}${won(s.growth)}원 불어났어요.`,
        action: () => goTab('parallel'),
      })
    }
    out.push({
      tag: '오늘의 시장',
      title: state.discord ? '디스코드로 오늘 카드뉴스를 보냈어요' : '매일 아침 카드뉴스 받기',
      body: state.discord
        ? '시장 소식을 발송했어요. 실제 시세와 출처를 확인한 뒤 투자에 참고해 주세요.'
        : '보유 종목과 시장 소식을 디스코드로 매일 받아볼 수 있어요.',
      action: () => goTab('lab', 'invest'),
    })
    return out
  }, [s, state, goTab, openLedgerForecast, brief, openDecide])

  const recent = state.txs.slice().sort((a, b) => b.date.localeCompare(a.date)).slice(0, 4)

  return (
    <div className={'relative min-h-dvh transition-colors duration-500 ' + (dark ? 'bg-night' : 'bg-bg')}>
      <AnimatePresence>
        {dark && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="pointer-events-none absolute inset-x-0 top-0 h-[620px]">
            <Stars n={50} seed={2} />
            <div className="blob absolute -top-20 -left-24 size-80 rounded-full bg-[#4F46E5]/35 blur-3xl" />
            <div className="blob absolute top-40 -right-24 size-72 rounded-full bg-[#9333EA]/25 blur-3xl" style={{ animationDelay: '-5s' }} />
          </motion.div>
        )}
      </AnimatePresence>

      <div className="relative px-5 pt-3 pb-safe">
        <header className="flex h-12 items-center justify-between">
          <Logo dark={dark} />
          <div className="flex items-center gap-1">
            <button
              className={'grid size-10 place-items-center rounded-full ' + (dark ? 'text-white/80' : 'text-sub')}
              aria-label="알림"
              onClick={() => s.notify(state.discord ? '오늘 카드뉴스를 디스코드로 보냈어요' : '새 알림이 없어요')}
            >
              <Bell size={22} />
            </button>
            <button
              onClick={openSettings}
              className="grid size-8 place-items-center rounded-full bg-[linear-gradient(135deg,#93C5FD,#6366F1)] text-[13px] font-bold text-white"
              aria-label="내 정보"
            >
              {(state.profile.name || '나').slice(0, 1)}
            </button>
          </div>
        </header>

        <p className={'mt-3 text-[14px] ' + (dark ? 'text-white/55' : 'text-sub')}>{mdw(today())}</p>
        <h1 className={'mt-1 text-[24px] font-bold leading-[1.35] tracking-tight ' + (dark ? 'text-white' : 'text-ink')}>
          {dark ? (
            <>
              참은 돈이 키운
              <br />
              평행세계의 {state.profile.name || '나'}
            </>
          ) : (
            <>
              {state.profile.name ? `${state.profile.name}님, ` : ''}오늘도
              <br />두 세계가 기다려요
            </>
          )}
        </h1>

        <WorldSwitch world={world} setWorld={setWorld} />

        <AnimatePresence mode="wait">
          {world === 'real' ? (
            <motion.div key="real" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              <button onClick={openLedgerForecast} className="block w-full rounded-[26px] bg-white p-5 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-[14px] font-medium text-sub">{md(s.fc.end)} 월급날까지 쓸 수 있는 돈</span>
                  <ChevronRight size={18} className="text-mute" />
                </div>
                <div className="mt-1.5 text-[32px] font-bold tracking-tight">
                  <Num value={s.available} suffix="원" />
                </div>
                <div className="mt-1 text-[13.5px] text-sub">
                  하루 <b className="text-blue">{won(s.perDay)}원</b> · {s.fc.daysLeft}일 남음
                </div>
                <div className="mt-4 -mx-1">
                  <ForecastChart pts={s.fc.pts} keep={state.profile.keep} h={118} />
                </div>
                <div className="mt-3 flex items-center justify-between rounded-2xl bg-[#F6F7F9] px-4 py-3 text-[13px]">
                  <span className="text-sub">잔액 {wonShort(state.balance)}</span>
                  <span className="text-mute">−</span>
                  <span className="text-sub">예정 결제 {wonShort(s.fc.upcoming)}</span>
                  <span className="text-mute">−</span>
                  <span className="text-sub">지켜둘 돈 {wonShort(state.profile.keep)}</span>
                </div>
              </button>
            </motion.div>
          ) : (
            <motion.div key="par" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.25 }}>
              <button
                onClick={() => goTab('parallel')}
                className="relative block w-full overflow-hidden rounded-[26px] border border-white/10 bg-white/[.04] p-5 text-left backdrop-blur"
              >
                <div className="absolute top-3 -right-5">
                  <Planet size={112} hue={s.level.hue} moons={2} />
                </div>
                <div className="relative">
                  <span className="rounded-full bg-white/10 px-2.5 py-1 text-[12px] font-semibold text-[#C4B5FD]">
                    Lv.{s.level.lv} {s.level.name}
                  </span>
                  <div className="mt-4 text-[14px] text-white/60">평행세계의 내가 가진 돈</div>
                  <div className="mt-1 text-[32px] font-bold tracking-tight text-white">
                    <Num value={s.parallelTotal} suffix="원" />
                  </div>
                  <div className="mt-1 text-[13.5px] text-white/55">
                    참은 돈 {wonShort(s.skippedSum)} ·{' '}
                    <span className={s.growth >= 0 ? 'text-[#5EEAD4]' : 'text-[#93C5FD]'}>
                      불어난 돈 {s.growth >= 0 ? '+' : ''}
                      {won(s.growth)}
                    </span>
                  </div>
                </div>
                <div className="relative mt-5 grid grid-cols-3 gap-2">
                  {[
                    { k: '적금', v: s.savingTotal + s.challengeTotal },
                    { k: '예금', v: s.depositTotal + s.depositInterest },
                    { k: '투자', v: s.investTotal },
                  ].map((t) => (
                    <div key={t.k} className="rounded-2xl bg-white/6 px-3 py-2.5">
                      <div className="text-[12px] text-white/50">{t.k}</div>
                      <div className="mt-0.5 text-[14.5px] font-bold text-white tabular-nums">{wonShort(t.v)}</div>
                    </div>
                  ))}
                </div>
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* AI prompt — the one action of the app */}
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={openDecide}
          className={
            'relative mt-3 flex w-full items-center gap-3 overflow-hidden rounded-[22px] p-[1.5px] text-left ' +
            'bg-[linear-gradient(120deg,#6D7CFF,#B07CFF,#5EEAD4,#6D7CFF)] bg-[length:200%_100%] [animation:shimmer_8s_linear_infinite]'
          }
        >
          <div className={'flex w-full items-center gap-3 rounded-[21px] px-4 py-4 ' + (dark ? 'bg-[#0D1234]' : 'bg-white')}>
            <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-[linear-gradient(135deg,#6D7CFF,#A06BFF)] text-white">
              <Sparkles size={19} />
            </div>
            <div className="flex-1">
              <div className={'text-[15.5px] font-semibold ' + (dark ? 'text-white' : 'text-ink')}>사고 싶은 게 생겼나요?</div>
              <div className={'text-[13px] ' + (dark ? 'text-white/50' : 'text-sub')}>사기 전에 두 세계를 비교해 드려요</div>
            </div>
            <ChevronRight size={20} className={dark ? 'text-white/40' : 'text-mute'} />
          </div>
        </motion.button>

        {/* saved purchase plans: a gentle re-entry into the comparison flow */}
        {nextPurchasePlan && (
          <button
            onClick={openDecide}
            className={'mt-2.5 flex w-full items-center gap-3 rounded-[19px] px-4 py-3 text-left ' + (dark ? 'bg-white/[.06] text-white' : 'bg-[#F1F0FF] text-[#403582]')}
          >
            <CalendarClock size={19} className={dark ? 'text-[#B7ABFF]' : 'text-[#7664D9]'} />
            <div className="min-w-0 flex-1">
              <div className="text-[12px] font-semibold opacity-60">미뤄둔 구매 · {state.later.length}건</div>
              <div className="truncate text-[13px] font-semibold">
                {mdDot(new Date(nextPurchasePlan.until + 'T12:00:00'))} · {nextPurchasePlan.title}
              </div>
            </div>
            <span className="text-[12px] font-semibold opacity-70">다시 비교</span>
            <ChevronRight size={15} className="opacity-50" />
          </button>
        )}

        {/* AI briefing */}
        <div className="mt-8 mb-3 flex items-center justify-between px-1">
          <h2 className={'text-[19px] font-bold tracking-tight ' + (dark ? 'text-white' : 'text-ink')}>AI가 본 오늘</h2>
          <AIBadge dark={dark}>실시간 분석</AIBadge>
        </div>
        <div className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-5 pb-1">
          {insights.map((it, i) => (
            <motion.button
              key={i}
              whileTap={{ scale: 0.98 }}
              onClick={it.action}
              className={
                'flex w-[78%] shrink-0 snap-start flex-col rounded-[22px] p-4 text-left ' +
                (dark ? 'bg-white/[.06] text-white' : 'bg-white text-ink')
              }
            >
              <span className={'text-[12px] font-bold ' + (dark ? 'text-[#A5B4FC]' : 'text-blue')}>{it.tag}</span>
              <span className="mt-1.5 text-[16px] font-bold leading-snug tracking-tight">{it.title}</span>
              <span className={'mt-1.5 text-[13.5px] leading-relaxed ' + (dark ? 'text-white/60' : 'text-sub')}>{it.body}</span>
            </motion.button>
          ))}
        </div>

        {/* lesson */}
        <motion.button
          whileTap={{ scale: 0.985 }}
          onClick={() => openLesson(nextLesson.id)}
          className={'mt-8 flex w-full items-center gap-4 rounded-[24px] p-5 text-left ' + (dark ? 'bg-white/[.06]' : 'bg-white')}
        >
          <div className="relative grid size-14 shrink-0 place-items-center rounded-[18px] bg-[linear-gradient(140deg,#FFD66B,#FF9E4A)] text-[26px]">
            {nextLesson.cards[0].visual}
          </div>
          <div className="flex-1">
            <div className={'flex items-center gap-1.5 text-[12.5px] font-semibold ' + (dark ? 'text-white/55' : 'text-sub')}>
              오늘의 금융 공부 · {nextLesson.minutes}분
              <span className="flex items-center gap-0.5 text-[#FF7A2F]">
                <Flame size={13} fill="#FF7A2F" />
                {state.streak}일째
              </span>
            </div>
            <div className={'mt-1 text-[16.5px] font-bold tracking-tight ' + (dark ? 'text-white' : 'text-ink')}>{nextLesson.title}</div>
            <div className={'mt-0.5 text-[13px] ' + (dark ? 'text-white/50' : 'text-sub')}>배우고 나면 평행세계에서 바로 해봐요</div>
          </div>
          <ChevronRight size={20} className={dark ? 'text-white/40' : 'text-mute'} />
        </motion.button>

        {/* recent */}
        <div className="mt-8 mb-2 flex items-center justify-between px-1">
          <h2 className={'text-[19px] font-bold tracking-tight ' + (dark ? 'text-white' : 'text-ink')}>최근 기록</h2>
          <button onClick={() => goTab('ledger')} className={'text-[13.5px] font-medium ' + (dark ? 'text-white/50' : 'text-sub')}>
            전체 보기
          </button>
        </div>
        <div className={'rounded-[24px] px-4 py-2 ' + (dark ? 'bg-white/[.06]' : 'bg-white')}>
          {recent.length === 0 && (
            <div className={'py-8 text-center text-[14px] ' + (dark ? 'text-white/50' : 'text-sub')}>
              아직 기록이 없어요.
              <br />
              위에서 고민 중인 소비를 입력해 보세요.
            </div>
          )}
          {recent.map((t) => (
            <div key={t.id} className="flex items-center gap-3 py-3">
              <CatIcon c={t.category} size={40} dark={dark} />
              <div className="min-w-0 flex-1">
                <div className={'truncate text-[15px] font-semibold ' + (dark ? 'text-white' : 'text-ink')}>{t.title}</div>
                <div className={'text-[12.5px] ' + (dark ? 'text-white/45' : 'text-sub')}>
                  {t.kind === 'skip' ? '참음 · 평행세계로' : t.kind === 'income' ? '수입' : CATS[t.category].label}
                </div>
              </div>
              <div
                className={
                  'text-[15px] font-semibold tabular-nums ' +
                  (t.kind === 'skip' ? 'text-[#8B7CFF]' : t.kind === 'income' ? 'text-blue' : dark ? 'text-white' : 'text-ink')
                }
              >
                {t.kind === 'spend' ? '-' : '+'}
                {won(t.amount)}원
              </div>
            </div>
          ))}
        </div>

        <p className={'mt-6 px-1 text-[11.5px] leading-relaxed ' + (dark ? 'text-white/30' : 'text-mute')}>
          평행세계의 금액은 참은 소비를 기준으로 한 가상 자산이며 실제 계좌에 입금되지 않아요. 예정 금액은 등록된 일정 기준이에요.
        </p>
      </div>
    </div>
  )
}

function WorldSwitch({ world, setWorld }: { world: World; setWorld: (w: World) => void }) {
  const dark = world === 'parallel'
  const items = [
    { v: 'real' as const, label: '현실의 나', Icon: Globe2 },
    { v: 'parallel' as const, label: '평행세계의 나', Icon: Orbit },
  ]
  return (
    <div className={'relative my-5 flex rounded-[18px] p-1.5 ' + (dark ? 'bg-white/[.07]' : 'bg-[#E6E9EF]')}>
      {items.map(({ v, label, Icon }) => {
        const on = world === v
        return (
          <button key={v} onClick={() => setWorld(v)} className="relative z-10 flex h-11 flex-1 items-center justify-center gap-1.5 text-[15px] font-bold">
            {on && (
              <motion.span
                layoutId="world-thumb"
                className={
                  'absolute inset-0 -z-10 rounded-[13px] ' +
                  (v === 'parallel'
                    ? 'bg-[linear-gradient(120deg,#5B5BF0,#9B6BFF)] shadow-[0_6px_24px_-6px_rgba(139,92,246,.8)]'
                    : 'bg-white shadow-[0_2px_8px_rgba(0,0,0,.06)]')
                }
                transition={{ type: 'spring', damping: 28, stiffness: 380 }}
              />
            )}
            <Icon size={17} className={on ? (v === 'parallel' ? 'text-white' : 'text-blue') : dark ? 'text-white/40' : 'text-mute'} />
            <span className={on ? (v === 'parallel' ? 'text-white' : 'text-ink') : dark ? 'text-white/45' : 'text-sub'}>{label}</span>
          </button>
        )
      })}
    </div>
  )
}
