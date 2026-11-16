import { motion } from 'framer-motion'
import { CalendarCheck, ChevronRight, Landmark, PiggyBank, Sparkles, TrendingUp } from 'lucide-react'
import { useMemo, useState } from 'react'
import { GrowthChart } from './charts'
import { LEVELS } from './data'
import { afterTax, mdDot, parseISO, signed, won, wonShort } from './lib'
import { useStore } from './store'
import { CatIcon, Num, Planet, Stars } from './ui'

export function Parallel({ openDecide, goLab }: { openDecide: () => void; goLab: (sub: string) => void }) {
  const s = useStore()
  const { state, level } = s
  const skips = s.skipped
  const latest = useMemo(() => [...skips].sort((a, b) => b.date.localeCompare(a.date))[0], [skips])
  const [sel, setSel] = useState<string | null>(null)
  const picked = skips.find((x) => x.id === (sel ?? latest?.id))
  const pl = s.holdingsValue - s.holdingsCost
  const tomorrow = afterTax((state.saving.balance * state.saving.rate) / 365)

  const grouped = useMemo(() => {
    const g: Record<string, typeof skips> = {}
    ;[...skips]
      .sort((a, b) => b.date.localeCompare(a.date))
      .forEach((x) => {
        const k = x.date.slice(0, 7)
        ;(g[k] ??= []).push(x)
      })
    return Object.entries(g)
  }, [skips])

  const assets = [
    {
      key: 'saving',
      icon: PiggyBank,
      name: '평행 자유적금',
      sub: `연 ${(state.saving.rate * 100).toFixed(1)}% · 내일 이자 +${won(tomorrow)}원`,
      value: s.savingTotal,
      delta: `+${won(s.savingInterest)}`,
      color: '#5EEAD4',
    },
    {
      key: 'deposit',
      icon: Landmark,
      name: '정기예금',
      sub: state.deposits.length ? `${state.deposits.length}개 · 만기 때 이자 받아요` : '자유적금에서 옮겨 묶어두기',
      value: s.depositTotal + s.depositInterest,
      delta: state.deposits.length ? `+${won(s.depositInterest)}` : '',
      color: '#93C5FD',
    },
    {
      key: 'challenge',
      icon: CalendarCheck,
      name: '26주 적금',
      sub: state.challenge ? `${state.challenge.filled}/26주 채움` : '매주 조금씩 늘려 넣는 적금',
      value: s.challengeTotal,
      delta: '',
      color: '#FDE68A',
    },
    {
      key: 'invest',
      icon: TrendingUp,
      name: '가상 투자',
      sub: `${state.invest.holdings.length}종목 · 투자 대기금 ${wonShort(state.invest.cash)}원`,
      value: s.investTotal,
      delta: state.invest.holdings.length ? signed(pl) : '',
      color: '#C4B5FD',
      neg: pl < 0,
    },
  ]

  return (
    <div className="relative min-h-dvh overflow-hidden bg-night text-white">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-[560px]">
        <Stars n={70} seed={11} />
        <div className="blob absolute top-10 left-1/2 size-[420px] -translate-x-1/2 rounded-full bg-[#4338CA]/30 blur-3xl" />
      </div>

      <div className="relative px-5 pt-3 pb-safe">
        <header className="flex h-12 items-center justify-between">
          <h1 className="text-[20px] font-bold">평행세계</h1>
          <span className="rounded-full bg-white/10 px-3 py-1 text-[12.5px] font-semibold text-[#C4B5FD]">
            Lv.{level.lv} {level.name}
          </span>
        </header>

        <div className="flex flex-col items-center pt-8 pb-4">
          <Planet size={168} hue={level.hue} moons={Math.min(3, 1 + state.invest.holdings.length / 2 + state.deposits.length)} />
          <div className="mt-12 text-[14px] text-white/55">평행세계의 {state.profile.name || '나'}가 가진 돈</div>
          <div className="mt-1 text-[36px] font-bold tracking-tight">
            <Num value={s.parallelTotal} suffix="원" />
          </div>
          <div className="mt-2 flex items-center gap-2 text-[13.5px]">
            <span className="text-white/55">참은 돈 {wonShort(s.skippedSum)}</span>
            <span className="text-white/25">|</span>
            <span className={s.growth >= 0 ? 'text-[#5EEAD4]' : 'text-[#93C5FD]'}>불어난 돈 {signed(s.growth)}</span>
          </div>
          <div className="mt-6 w-full rounded-[20px] bg-white/[.06] p-4">
            <div className="flex justify-between text-[12.5px]">
              <span className="text-white/60">
                {level.next ? `다음 행성 「${level.next.name}」까지` : '최고 단계에 도달했어요'}
              </span>
              {level.next && <span className="font-semibold">{won(level.remain)}원</span>}
            </div>
            <div className="mt-2.5 flex gap-1">
              {LEVELS.map((l, i) => (
                <div key={l.name} className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full bg-[linear-gradient(90deg,#6D7CFF,#C084FC)]"
                    initial={{ width: 0 }}
                    animate={{ width: i + 1 < level.lv ? '100%' : i + 1 === level.lv ? `${level.progress * 100}%` : '0%' }}
                    transition={{ delay: 0.2 + i * 0.08, duration: 0.6 }}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* divergence */}
        <section className="mt-6 rounded-[26px] bg-white/[.05] p-5">
          <h2 className="text-[18px] font-bold tracking-tight">기록이 세계를 이렇게 바꿨어요</h2>
          <p className="mt-1 text-[13px] text-white/50">점을 누르면 그날 무엇을 참았는지 보여요</p>
          <div className="mt-5">
            <GrowthChart skips={skips} total={s.parallelTotal} selected={picked?.id} onSelect={setSel} />
          </div>
          {picked && (
            <motion.div
              key={picked.id}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-4 flex items-center gap-3 rounded-2xl bg-white/[.07] p-3.5"
            >
              <CatIcon c={picked.category} size={40} dark />
              <div className="flex-1">
                <div className="text-[14.5px] font-semibold">
                  {mdDot(parseISO(picked.date))} {picked.title} 참음
                </div>
                <div className="text-[12.5px] text-white/50">{picked.dest === 'invest' ? '가상 투자금으로 이동' : '평행 자유적금에 저축'}</div>
              </div>
              <div className="text-[15px] font-bold text-[#C4B5FD]">+{won(picked.amount)}</div>
            </motion.div>
          )}
        </section>

        {/* assets */}
        <h2 className="mt-9 mb-3 px-1 text-[18px] font-bold tracking-tight">평행세계 자산</h2>
        <div className="space-y-2">
          {assets.map((a) => {
            const I = a.icon
            return (
              <motion.button
                key={a.key}
                whileTap={{ scale: 0.985 }}
                onClick={() => goLab(a.key === 'invest' ? 'invest' : 'saving')}
                className="flex w-full items-center gap-3.5 rounded-[22px] bg-white/[.05] p-4 text-left"
              >
                <div className="grid size-11 place-items-center rounded-2xl" style={{ background: a.color + '22', color: a.color }}>
                  <I size={21} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold">{a.name}</div>
                  <div className="truncate text-[12.5px] text-white/45">{a.sub}</div>
                </div>
                <div className="text-right">
                  <div className="text-[15.5px] font-bold tabular-nums">{won(a.value)}원</div>
                  {a.delta && <div className={'text-[12px] tabular-nums ' + (a.neg ? 'text-[#93C5FD]' : 'text-[#5EEAD4]')}>{a.delta}</div>}
                </div>
                <ChevronRight size={18} className="text-white/30" />
              </motion.button>
            )
          })}
        </div>

        {/* timeline */}
        <h2 className="mt-9 mb-3 px-1 text-[18px] font-bold tracking-tight">참은 기록</h2>
        {grouped.length === 0 && (
          <div className="rounded-[22px] bg-white/[.05] p-6 text-center text-[14px] text-white/50">아직 참은 기록이 없어요</div>
        )}
        {grouped.map(([month, list]) => (
          <div key={month} className="mb-4">
            <div className="mb-2 flex justify-between px-1 text-[12.5px] text-white/45">
              <span>{Number(month.slice(5))}월</span>
              <span>+{won(list.reduce((a, x) => a + x.amount, 0))}원</span>
            </div>
            <div className="rounded-[22px] bg-white/[.05] px-4 py-1">
              {list.map((x) => (
                <div key={x.id} className="flex items-center gap-3 border-b border-white/5 py-3 last:border-0">
                  <div className="w-9 text-[12.5px] text-white/40 tabular-nums">{mdDot(parseISO(x.date))}</div>
                  <div className="flex-1 text-[14.5px] font-medium">{x.title}</div>
                  <span className="rounded-md bg-white/8 px-1.5 py-0.5 text-[11px] text-white/55">{x.dest === 'invest' ? '투자' : '적금'}</span>
                  <div className="w-20 text-right text-[14.5px] font-semibold text-[#C4B5FD] tabular-nums">+{won(x.amount)}</div>
                </div>
              ))}
            </div>
          </div>
        ))}

        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={openDecide}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,#6D7CFF,#9B6BFF_55%,#5CC8FF)] py-4 text-[16px] font-semibold shadow-[0_8px_30px_-6px_rgba(124,108,255,.6)]"
        >
          <Sparkles size={18} /> 고민 중인 소비 비교하기
        </motion.button>
      </div>
    </div>
  )
}
