import { motion } from 'framer-motion'
import { BookOpen, FlaskConical, Home as HomeIcon, Orbit, Plus } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { Decide } from './Decide'
import { Home, type World } from './Home'
import { Lab, LessonSheet, StockSheet, type LabTab } from './Lab'
import { Ledger } from './Ledger'
import { Onboarding } from './Onboarding'
import { Parallel } from './Parallel'
import { Settings } from './Settings'
import { StoreProvider, useStore } from './store'
import { Toast } from './ui'

type Tab = 'home' | 'ledger' | 'lab' | 'parallel'

function Shell() {
  const s = useStore()
  const [tab, setTab] = useState<Tab>('home')
  const [world, setWorld] = useState<World>('real')
  const [labTab, setLabTab] = useState<LabTab>('invest')
  const [decide, setDecide] = useState(false)
  const [stock, setStock] = useState<string | null>(null)
  const [lesson, setLesson] = useState<string | null>(null)
  const [settings, setSettings] = useState(false)

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [tab])

  const goTab = useCallback((t: 'ledger' | 'parallel' | 'lab', sub?: string) => {
    if (t === 'lab' && sub) setLabTab(sub as LabTab)
    setTab(t)
  }, [])

  if (!s.state.onboarded) {
    return (
      <>
        <Onboarding />
        <Toast msg={s.toast} />
      </>
    )
  }

  const darkNav = tab === 'parallel' || (tab === 'home' && world === 'parallel')

  return (
    <>
      {tab === 'home' && (
        <Home
          world={world}
          setWorld={setWorld}
          openDecide={() => setDecide(true)}
          goTab={goTab}
          openLesson={setLesson}
          openSettings={() => setSettings(true)}
          openLedgerForecast={() => setTab('ledger')}
        />
      )}
      {tab === 'ledger' && <Ledger />}
      {tab === 'lab' && <Lab tab={labTab} setTab={setLabTab} openStock={setStock} openLesson={setLesson} />}
      {tab === 'parallel' && <Parallel openDecide={() => setDecide(true)} goLab={(sub) => goTab('lab', sub)} />}

      <nav
        className={
          'fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[430px] border-t pb-[max(env(safe-area-inset-bottom),10px)] backdrop-blur-xl transition-colors duration-500 ' +
          (darkNav ? 'border-white/5 bg-[#0A0E28]/85' : 'border-black/5 bg-white/90')
        }
      >
        <div className="flex h-16 items-center">
          <NavBtn on={tab === 'home'} dark={darkNav} label="홈" onClick={() => setTab('home')} icon={HomeIcon} />
          <NavBtn on={tab === 'ledger'} dark={darkNav} label="가계부" onClick={() => setTab('ledger')} icon={BookOpen} />
          <div className="flex flex-1 justify-center">
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={() => setDecide(true)}
              aria-label="고민 중인 소비 비교"
              className="grid size-[52px] -translate-y-2 place-items-center rounded-full bg-[linear-gradient(135deg,#3B6CFF,#7C5CFF)] text-white shadow-[0_8px_24px_-4px_rgba(80,90,255,.6)]"
            >
              <Plus size={26} strokeWidth={2.6} />
            </motion.button>
          </div>
          <NavBtn on={tab === 'lab'} dark={darkNav} label="실험실" onClick={() => setTab('lab')} icon={FlaskConical} />
          <NavBtn on={tab === 'parallel'} dark={darkNav} label="평행세계" onClick={() => setTab('parallel')} icon={Orbit} />
        </div>
      </nav>

      <Decide open={decide} onClose={() => setDecide(false)} goParallel={() => setTab('parallel')} />
      <StockSheet code={stock} onClose={() => setStock(null)} />
      <LessonSheet
        id={lesson}
        onClose={() => setLesson(null)}
        onPractice={(target) => {
          setLesson(null)
          if (target === 'saving' || target === 'deposit') goTab('lab', 'saving')
          else {
            goTab('lab', 'invest')
            setTimeout(() => setStock(target), 350)
          }
        }}
      />
      <Settings open={settings} onClose={() => setSettings(false)} />
      <Toast msg={s.toast} />
    </>
  )
}

function NavBtn({ on, dark, label, onClick, icon: I }: { on: boolean; dark: boolean; label: string; onClick: () => void; icon: typeof HomeIcon }) {
  const color = on ? (dark ? 'text-white' : 'text-ink') : dark ? 'text-white/35' : 'text-[#B0B8C1]'
  return (
    <button onClick={onClick} className={'flex flex-1 flex-col items-center gap-1 ' + color}>
      <I size={22} strokeWidth={on ? 2.4 : 2} />
      <span className="text-[11px] font-semibold">{label}</span>
    </button>
  )
}

/** desktop-only demo controls, kept outside the phone column */
function DemoRail() {
  const s = useStore()
  return (
    <aside className="fixed top-1/2 left-[calc(50%-215px-260px)] z-[90] hidden w-[220px] -translate-y-1/2 rounded-3xl bg-white p-5 shadow-[0_10px_40px_-10px_rgba(0,0,0,.15)] min-[1000px]:block">
      <div className="text-[13px] font-bold text-ink">시연 모드</div>
      <p className="mt-1 text-[12px] leading-relaxed text-sub">휴대폰 화면 밖 패널이라 사용자에게는 보이지 않아요.</p>
      <div className="mt-4 space-y-2">
        <button
          onClick={() => s.setMode('demo')}
          className={'w-full rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold ' + (s.mode === 'demo' ? 'bg-blue text-white' : 'bg-[#F2F3F6] text-ink')}
        >
          예시 기록이 있는 계정
        </button>
        <button
          onClick={() => s.setMode('fresh')}
          className={'w-full rounded-xl px-3 py-2.5 text-left text-[13px] font-semibold ' + (s.mode === 'fresh' ? 'bg-blue text-white' : 'bg-[#F2F3F6] text-ink')}
        >
          처음 가입한 사용자
        </button>
        <button onClick={() => s.setMode(s.mode, true)} className="w-full rounded-xl px-3 py-2.5 text-left text-[13px] font-medium text-sub">
          현재 계정 초기화
        </button>
      </div>
      <div className="mt-4 border-t border-line pt-4">
        <div className="text-[12px] font-bold text-ink">서버 연결</div>
        {[
          ['금융 엔진 (FastAPI)', s.server?.finance],
          ['AI 문장', s.server?.ai],
          ['실제 시세', !!s.liveSource],
          ['디스코드', s.server?.discord],
        ].map(([k, v]) => (
          <div key={String(k)} className="mt-2 flex items-center justify-between text-[12px]">
            <span className="text-sub">{k}</span>
            <span className={'flex items-center gap-1 font-semibold ' + (v ? 'text-emerald-600' : s.server ? 'text-mute' : 'text-mute')}>
              <i className={'size-1.5 rounded-full ' + (v ? 'bg-emerald-500' : 'bg-[#D1D6DB]')} />
              {s.server ? (v ? '연결됨' : '꺼짐') : '확인 중'}
            </span>
          </div>
        ))}
      </div>
    </aside>
  )
}

export default function App() {
  return (
    <StoreProvider>
      <div className="relative mx-auto min-h-dvh max-w-[430px] overflow-x-hidden bg-bg shadow-[0_0_60px_-20px_rgba(0,0,0,.15)]">
        <Shell />
      </div>
      <DemoRail />
    </StoreProvider>
  )
}
