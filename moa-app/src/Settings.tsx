import { ChevronRight, MessageCircle } from 'lucide-react'
import { won } from './lib'
import { useStore } from './store'
import { Page } from './ui'

export function Settings({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore()
  const { state } = s
  const p = state.profile
  const row = 'flex items-center justify-between py-4 text-[15px]'
  return (
    <Page open={open} onClose={onClose} title="내 정보">
      <div className="px-5 pb-10">
        <div className="flex items-center gap-4 rounded-[24px] bg-white p-5">
          <div className="grid size-14 place-items-center rounded-full bg-[linear-gradient(135deg,#93C5FD,#6366F1)] text-[22px] font-bold text-white">
            {(p.name || '나').slice(0, 1)}
          </div>
          <div>
            <div className="text-[18px] font-bold">{p.name || '이름 없음'}</div>
            <div className="text-[13px] text-sub">
              Lv.{s.level.lv} {s.level.name} · {state.xp} XP
            </div>
          </div>
        </div>

        <h3 className="mt-7 mb-2 px-1 text-[13px] font-semibold text-sub">돈 흐름 설정</h3>
        <div className="rounded-[24px] bg-white px-5">
          <div className={row + ' border-b border-line'}>
            <span>월급날</span>
            <div className="flex gap-1">
              {[10, 15, 21, 25].map((d) => (
                <button
                  key={d}
                  onClick={() => s.update({ profile: { ...p, payday: d } })}
                  className={'rounded-lg px-2.5 py-1 text-[13px] font-semibold ' + (p.payday === d ? 'bg-blue text-white' : 'bg-[#F2F3F6] text-sub')}
                >
                  {d}일
                </button>
              ))}
            </div>
          </div>
          <div className={row + ' border-b border-line'}>
            <span>지켜둘 돈</span>
            <div className="flex gap-1">
              {[100000, 200000, 300000, 500000].map((k) => (
                <button
                  key={k}
                  onClick={() => s.update({ profile: { ...p, keep: k } })}
                  className={'rounded-lg px-2.5 py-1 text-[13px] font-semibold ' + (p.keep === k ? 'bg-blue text-white' : 'bg-[#F2F3F6] text-sub')}
                >
                  {k / 10000}만
                </button>
              ))}
            </div>
          </div>
          <div className={row + ' border-b border-line'}>
            <span>통장 잔액</span>
            <span className="font-semibold">{won(state.balance)}원</span>
          </div>
          {state.schedule.map((b) => (
            <div key={b.id} className={row + ' border-b border-line last:border-0'}>
              <span>
                매월 {b.day}일 {b.title}
              </span>
              <span className="font-semibold">{won(b.amount)}원</span>
            </div>
          ))}
        </div>

        <h3 className="mt-7 mb-2 px-1 text-[13px] font-semibold text-sub">알림</h3>
        <div className="rounded-[24px] bg-white px-5">
          <div className={row}>
            <span className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-lg bg-[#5865F2] text-white">
                <MessageCircle size={16} />
              </span>
              디스코드 카드뉴스
            </span>
            <button
              onClick={() => s.toggleDiscord(!state.discord)}
              className={'relative h-7 w-12 rounded-full transition-colors ' + (state.discord ? 'bg-blue' : 'bg-[#D1D6DB]')}
              aria-label="디스코드 알림"
            >
              <span className={'absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ' + (state.discord ? 'left-[22px]' : 'left-0.5')} />
            </button>
          </div>
        </div>

        <h3 className="mt-7 mb-2 px-1 text-[13px] font-semibold text-sub">서비스</h3>
        <div className="rounded-[24px] bg-white px-5">
          <button
            onClick={() => {
              s.setMode('fresh', true)
              onClose()
            }}
            className={row + ' w-full border-b border-line text-left'}
          >
            <span>처음부터 다시 시작하기</span>
            <ChevronRight size={18} className="text-mute" />
          </button>
          <button
            onClick={() => {
              s.setMode('demo', true)
              s.notify('예시 기록으로 채웠어요')
              onClose()
            }}
            className={row + ' w-full text-left'}
          >
            <span>예시 기록으로 둘러보기</span>
            <ChevronRight size={18} className="text-mute" />
          </button>
        </div>
      </div>
    </Page>
  )
}
