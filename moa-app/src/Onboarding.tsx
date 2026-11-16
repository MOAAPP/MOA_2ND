import { AnimatePresence, motion } from 'framer-motion'
import { Landmark, PiggyBank, TrendingUp } from 'lucide-react'
import { useState } from 'react'
import { won } from './lib'
import { useStore } from './store'
import { Btn, Planet, Stars } from './ui'

export function Onboarding() {
  const s = useStore()
  const [i, setI] = useState(0)
  const [name, setName] = useState('')
  const [payday, setPayday] = useState(25)
  const [balance, setBalance] = useState('800000')
  const [keep, setKeep] = useState(300000)

  const slides = [
    {
      title: (
        <>
          참은 소비는
          <br />
          어디로 갈까요?
        </>
      ),
      body: '모아는 사지 않기로 한 돈을 평행세계에 쌓아요. 실제 돈은 그대로, 평행세계의 나는 점점 부자가 돼요.',
      art: (
        <div className="grid h-[300px] place-items-center">
          <Planet size={150} hue={250} />
        </div>
      ),
    },
    {
      title: (
        <>
          사기 전에
          <br />두 세계를 비교해요
        </>
      ),
      body: '사면 월급날까지 얼마나 빠듯해지는지, 참으면 평행세계가 얼마나 커지는지 AI가 바로 보여줘요.',
      art: (
        <div className="grid h-[300px] place-items-center">
          <div className="relative flex w-[280px] gap-2.5">
            <motion.div initial={{ x: 20, rotate: 0 }} animate={{ x: 0, rotate: -6 }} transition={{ delay: 0.2 }} className="flex-1 rounded-3xl bg-white p-4 text-ink shadow-xl">
              <div className="text-[11px] font-bold text-sub">현실 · 사면</div>
              <div className="mt-6 text-[11px] text-sub">쓸 수 있는 돈</div>
              <div className="text-[18px] font-bold text-red">-37,000원</div>
            </motion.div>
            <motion.div initial={{ x: -20, rotate: 0 }} animate={{ x: 0, rotate: 6 }} transition={{ delay: 0.2 }} className="flex-1 rounded-3xl border border-white/15 bg-[#151B4A] p-4 shadow-xl">
              <div className="text-[11px] font-bold text-[#C4B5FD]">평행 · 참으면</div>
              <div className="mt-6 text-[11px] text-white/50">평행세계의 나</div>
              <div className="shimmer-text text-[18px] font-bold">+249,000원</div>
            </motion.div>
          </div>
        </div>
      ),
    },
    {
      title: (
        <>
          평행세계에서
          <br />
          진짜처럼 굴려봐요
        </>
      ),
      body: '쌓인 돈으로 예금·적금에 가입하고, ETF와 주식을 사보며 금융을 배워요. 모두 가상이라 부담이 없어요.',
      art: (
        <div className="grid h-[300px] place-items-center">
          <div className="space-y-2.5">
            {[
              { I: PiggyBank, t: '자유적금', v: '연 3.5%', c: '#5EEAD4' },
              { I: Landmark, t: '정기예금', v: '연 3.4%', c: '#93C5FD' },
              { I: TrendingUp, t: 'S&P500 ETF', v: '+4.2%', c: '#F9A8D4' },
            ].map(({ I, t, v, c }, k) => (
              <motion.div
                key={t}
                initial={{ opacity: 0, x: 30 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.15 + k * 0.12 }}
                className="flex w-[260px] items-center gap-3 rounded-2xl bg-white/8 p-3.5"
              >
                <div className="grid size-10 place-items-center rounded-xl" style={{ background: c + '25', color: c }}>
                  <I size={20} />
                </div>
                <span className="flex-1 text-[15px] font-semibold">{t}</span>
                <span className="text-[14px] font-semibold" style={{ color: c }}>
                  {v}
                </span>
              </motion.div>
            ))}
          </div>
        </div>
      ),
    },
  ]

  if (i < slides.length) {
    const sl = slides[i]
    return (
      <div className="relative flex min-h-dvh flex-col overflow-hidden bg-night text-white">
        <Stars n={60} seed={21} />
        <div className="blob absolute -top-20 -left-20 size-80 rounded-full bg-[#4F46E5]/30 blur-3xl" />
        <div className="relative flex justify-end px-5 pt-4">
          <button onClick={() => setI(slides.length)} className="text-[14px] text-white/50">
            건너뛰기
          </button>
        </div>
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, x: 40 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -40 }} className="relative flex-1 px-6">
            {sl.art}
            <h1 className="text-[28px] font-bold leading-snug tracking-tight">{sl.title}</h1>
            <p className="mt-4 text-[16px] leading-relaxed text-white/60">{sl.body}</p>
          </motion.div>
        </AnimatePresence>
        <div className="relative px-5 pb-8">
          <div className="mb-6 flex justify-center gap-1.5">
            {slides.map((_, k) => (
              <motion.span key={k} animate={{ width: k === i ? 22 : 6 }} className={'h-1.5 rounded-full ' + (k === i ? 'bg-white' : 'bg-white/25')} />
            ))}
          </div>
          <Btn variant="glow" onClick={() => setI(i + 1)}>
            {i === slides.length - 1 ? '시작하기' : '다음'}
          </Btn>
        </div>
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh flex-col bg-white">
      <div className="flex-1 px-6 pt-14">
        <h1 className="text-[26px] font-bold leading-snug tracking-tight">
          월급날까지 쓸 수 있는 돈을
          <br />
          계산하려면 이것만 알려주세요
        </h1>
        <label className="mt-10 block text-[13px] font-semibold text-sub">이름</label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="불러드릴 이름"
          className="mt-2 w-full border-b-2 border-line py-2 text-[20px] font-semibold focus:border-blue"
        />
        <label className="mt-8 block text-[13px] font-semibold text-sub">월급(용돈) 받는 날</label>
        <div className="mt-2 flex gap-2">
          {[1, 10, 15, 21, 25].map((d) => (
            <button
              key={d}
              onClick={() => setPayday(d)}
              className={'flex-1 rounded-xl py-3 text-[15px] font-semibold ' + (payday === d ? 'bg-blue text-white' : 'bg-[#F2F3F6] text-sub')}
            >
              {d}일
            </button>
          ))}
        </div>
        <label className="mt-8 block text-[13px] font-semibold text-sub">지금 통장 잔액</label>
        <div className="mt-2 flex items-center border-b-2 border-line py-2 focus-within:border-blue">
          <input
            inputMode="numeric"
            value={balance ? won(Number(balance)) : ''}
            onChange={(e) => setBalance(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
            className="flex-1 text-[20px] font-semibold"
          />
          <span className="text-[18px] font-semibold">원</span>
        </div>
        <label className="mt-8 block text-[13px] font-semibold text-sub">꼭 지켜둘 돈</label>
        <div className="mt-2 flex gap-2">
          {[100000, 200000, 300000, 500000].map((k) => (
            <button
              key={k}
              onClick={() => setKeep(k)}
              className={'flex-1 rounded-xl py-3 text-[15px] font-semibold ' + (keep === k ? 'bg-blue text-white' : 'bg-[#F2F3F6] text-sub')}
            >
              {k / 10000}만
            </button>
          ))}
        </div>
      </div>
      <div className="px-5 pb-8">
        <Btn
          disabled={!name.trim()}
          onClick={() => {
            s.update({
              onboarded: true,
              profile: { ...s.state.profile, name: name.trim(), payday, keep },
              balance: Number(balance) || 0,
              invest: { cash: 100000, holdings: [] },
            })
            s.notify('시작 선물로 투자 연습금 10만 원을 드렸어요')
          }}
        >
          모아 시작하기
        </Btn>
      </div>
    </div>
  )
}
