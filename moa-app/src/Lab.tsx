import { AnimatePresence, motion } from 'framer-motion'
import { ArrowRightLeft, Check, ChevronRight, Flame, Lock, MessageCircle, Minus, Plus, Sparkles, Star } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import * as api from './api'
import { StockChart } from './charts'
import { LESSONS, PRODUCTS, STOCKS, type Stock } from './data'
import { accrued, addDays, afterTax, clamp, daysBetween, mdDot, parseISO, pct, signed, today, won, wonShort, ymd } from './lib'
import { useStore } from './store'
import { AIBadge, Btn, CloseBtn, Num, Segmented, Sheet, Sparkline } from './ui'

export type LabTab = 'invest' | 'saving' | 'learn'

export function Lab({
  tab,
  setTab,
  openStock,
  openLesson,
}: {
  tab: LabTab
  setTab: (t: LabTab) => void
  openStock: (code: string) => void
  openLesson: (id: string) => void
}) {
  return (
    <div className="min-h-dvh bg-bg">
      <div className="sticky top-0 z-20 bg-bg/90 px-5 pt-3 pb-3 backdrop-blur">
        <header className="flex h-12 items-center justify-between">
          <h1 className="text-[20px] font-bold">실험실</h1>
          <span className="text-[12.5px] text-sub">가상 자산으로 연습해요</span>
        </header>
        <Segmented
          id="lab"
          value={tab}
          onChange={setTab}
          items={[
            { value: 'invest', label: '가상 투자' },
            { value: 'saving', label: '예금·적금' },
            { value: 'learn', label: '금융 공부' },
          ]}
        />
      </div>
      <div className="px-5 pb-safe">
        <AnimatePresence mode="wait">
          <motion.div key={tab} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }}>
            {tab === 'invest' && <Invest openStock={openStock} />}
            {tab === 'saving' && <Savings />}
            {tab === 'learn' && <Learn openLesson={openLesson} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ---------------- invest ---------------- */

function Invest({ openStock }: { openStock: (code: string) => void }) {
  const s = useStore()
  const { state, prices } = s
  const [moving, setMoving] = useState(false)
  const pl = s.holdingsValue - s.holdingsCost
  const rate = s.holdingsCost ? pl / s.holdingsCost : 0
  return (
    <div className="space-y-3 pt-1">
      <section className="rounded-[26px] bg-white p-5">
        <div className="text-[14px] text-sub">가상 투자 자산</div>
        <div className="mt-1 text-[30px] font-bold tracking-tight">
          <Num value={s.investTotal} suffix="원" />
        </div>
        {state.invest.holdings.length > 0 && (
          <div className={'mt-0.5 text-[14px] font-semibold tabular-nums ' + (pl >= 0 ? 'text-up' : 'text-down')}>
            {signed(pl)}원 ({pct(rate)})
          </div>
        )}
        <div className="mt-4 flex items-center justify-between rounded-2xl bg-[#F6F7F9] px-4 py-3">
          <div>
            <div className="text-[12.5px] text-sub">투자금 · 바로 살 수 있는 돈</div>
            <div className="text-[16px] font-bold tabular-nums">{won(state.invest.cash)}원</div>
          </div>
          <button onClick={() => setMoving(true)} className="flex items-center gap-1 rounded-xl bg-blue px-3 py-2 text-[13px] font-semibold text-white">
            <Plus size={14} strokeWidth={2.6} /> 투자금 충전
          </button>
        </div>
      </section>

      {state.invest.holdings.length === 0 && (
        <section className="rounded-[26px] bg-white p-5 text-center">
          <div className="text-[15px] font-semibold">아직 보유한 종목이 없어요</div>
          <p className="mt-1 text-[13px] text-sub">아래 둘러보기에서 종목을 눌러 1주부터 사보세요</p>
        </section>
      )}
      {state.invest.holdings.length > 0 && (
        <section className="rounded-[26px] bg-white p-5">
          <h2 className="mb-2 text-[17px] font-bold">보유 종목</h2>
          {state.invest.holdings.map((h) => {
            const st = STOCKS.find((x) => x.code === h.code)!
            const p = prices[h.code].price
            const r = (p - h.avg) / h.avg
            return (
              <button key={h.code} onClick={() => openStock(h.code)} className="flex w-full items-center gap-3 py-3 text-left">
                <StockLogo s={st} />
                <div className="flex-1">
                  <div className="text-[15px] font-semibold">{st.name}</div>
                  <div className="text-[12.5px] text-sub">
                    {h.qty}주 · 평균 {won(h.avg)}원
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[15px] font-semibold tabular-nums">{won(p * h.qty)}원</div>
                  <div className={'text-[12.5px] font-medium tabular-nums ' + (r >= 0 ? 'text-up' : 'text-down')}>
                    {signed(Math.round((p - h.avg) * h.qty))} ({pct(r, 1)})
                  </div>
                </div>
              </button>
            )
          })}
        </section>
      )}

      <section className="overflow-hidden rounded-[26px] bg-[#5865F2] p-5 text-white">
        <div className="flex items-center gap-2 text-[13px] font-semibold text-white/80">
          <MessageCircle size={15} /> 오늘의 카드뉴스 · 디스코드
        </div>
        <div className="mt-2 text-[17px] font-bold leading-snug">반도체가 끌어올린 코스피, 내 KODEX 200은?</div>
        <div className="mt-1.5 text-[13.5px] leading-relaxed text-white/75">
          외국인 매수가 반도체에 몰리며 지수가 올랐어요. KODEX 200은 반도체 비중이 커서 함께 움직였어요.
        </div>
        <div className="mt-4 flex items-center justify-between">
          <span className="text-[12.5px] text-white/70">{state.discord ? '매일 오전 8시에 보내고 있어요' : '아직 연결되지 않았어요'}</span>
          <button
            onClick={() => s.toggleDiscord(!state.discord)}
            className="rounded-xl bg-white/20 px-3 py-1.5 text-[13px] font-semibold"
          >
            {state.discord ? '연결됨' : '연결하기'}
          </button>
        </div>
      </section>

      <section className="rounded-[26px] bg-white p-5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-[17px] font-bold">둘러보기</h2>
          <span className="flex items-center gap-1.5 text-[12px] text-sub">
            <i className="twinkle size-1.5 rounded-full bg-up" /> {sourceLabel(s.liveSource)}
          </span>
        </div>
        {STOCKS.map((st) => {
          const p = prices[st.code]
          const ch = (p.price - p.prev) / p.prev
          return (
            <button key={st.code} onClick={() => openStock(st.code)} className="flex w-full items-center gap-3 py-3 text-left">
              <StockLogo s={st} />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[15px] font-semibold">{st.name}</div>
                <div className="text-[12px] text-sub">{st.type}</div>
              </div>
              <Sparkline data={p.hist} />
              <div className="w-[86px] text-right">
                <div className="text-[15px] font-semibold tabular-nums">{won(p.price)}</div>
                <div className={'text-[12.5px] font-medium tabular-nums ' + (ch >= 0 ? 'text-up' : 'text-down')}>{pct(ch)}</div>
              </div>
            </button>
          )
        })}
      </section>
      {(state.trades ?? []).length > 0 && (
        <section className="rounded-[26px] bg-white p-5">
          <h2 className="mb-1 text-[17px] font-bold">거래 내역</h2>
          {(state.trades ?? []).slice(0, 8).map((t) => {
            const st = STOCKS.find((x) => x.code === t.code)!
            return (
              <div key={t.id} className="flex items-center gap-3 border-b border-line py-3 last:border-0">
                <span className={'rounded-md px-1.5 py-0.5 text-[11.5px] font-bold ' + (t.side === 'buy' ? 'bg-up/10 text-up' : 'bg-down/10 text-down')}>
                  {t.side === 'buy' ? '구매' : '판매'}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[14.5px] font-semibold">{st.name}</div>
                  <div className="text-[12px] text-sub">
                    {mdDot(parseISO(t.date))} · {t.qty}주 · {won(t.price)}원
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[14.5px] font-semibold tabular-nums">{won(t.price * t.qty)}원</div>
                  {t.pl !== undefined && (
                    <div className={'text-[12px] font-medium tabular-nums ' + (t.pl >= 0 ? 'text-up' : 'text-down')}>수익 {signed(Math.round(t.pl))}</div>
                  )}
                </div>
              </div>
            )
          })}
        </section>
      )}
      <p className="px-1 text-[11.5px] leading-relaxed text-mute">
        {s.liveSource ? '시세는 실제 시장 가격을 받아오고, 주문은 평행세계 안에서만 체결되는 가상 거래예요.' : '지금은 연습용 모의 시세를 보여주고 있어요. 주문은 평행세계 안에서만 체결되는 가상 거래예요.'}
      </p>
      <MoveSheet open={moving} onClose={() => setMoving(false)} />
    </div>
  )
}

export const sourceLabel = (src: string | null) =>
  src === 'naver' ? '네이버 금융 시세' : src === 'kis' ? '실시간 시세' : src === 'yahoo' ? '지연 시세 (약 20분)' : '모의 시세'

export function StockLogo({ s, size = 40 }: { s: Stock; size?: number }) {
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full text-[11px] font-black text-white"
      style={{ width: size, height: size, background: s.color, color: s.color === '#F7C600' ? '#3C1E1E' : '#fff' }}
    >
      {s.short}
    </div>
  )
}

function MoveSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore()
  const max = Math.floor(s.state.saving.balance / 1000) * 1000
  const [raw, setV] = useState(50000)
  const v = Math.min(raw, max)
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="px-5 pb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[21px] font-bold">투자금 충전하기</h2>
            <p className="mt-1 text-[14px] leading-relaxed text-sub">
              평행 자유적금에 모인 돈을 투자금으로 옮겨요.
              <br />
              실제 통장 돈은 움직이지 않아요.
            </p>
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <div className="mt-6 grid grid-cols-2 gap-2 text-center">
          <div className="rounded-2xl bg-[#F6F7F9] p-3">
            <div className="text-[12px] text-sub">자유적금</div>
            <div className="mt-0.5 text-[15px] font-bold tabular-nums">{won(s.state.saving.balance - v)}원</div>
          </div>
          <div className="rounded-2xl bg-blue-soft p-3">
            <div className="text-[12px] text-blue">투자금</div>
            <div className="mt-0.5 text-[15px] font-bold text-blue tabular-nums">{won(s.state.invest.cash + v)}원</div>
          </div>
        </div>
        {max === 0 ? (
          <p className="mt-6 rounded-2xl bg-[#F6F7F9] p-4 text-center text-[14px] text-sub">
            자유적금이 비어 있어요. 소비를 한 번 참으면 여기로 쌓여요.
          </p>
        ) : (
          <>
        <div className="mt-6 text-center text-[34px] font-bold tabular-nums">{won(v)}원</div>
        <div className="mt-3 flex justify-center gap-2">
          {[10000, 50000, 100000].filter((x) => x <= max).map((x) => (
            <button key={x} onClick={() => setV(x)} className="rounded-full bg-[#F2F3F6] px-3 py-1.5 text-[13px] font-semibold text-sub">
              {wonShort(x)}
            </button>
          ))}
          <button onClick={() => setV(max)} className="rounded-full bg-[#F2F3F6] px-3 py-1.5 text-[13px] font-semibold text-sub">
            전부
          </button>
        </div>
        <input
          type="range"
          min={0}
          max={max}
          step={1000}
          value={v}
          onChange={(e) => setV(Number(e.target.value))}
          className="mt-6 w-full accent-blue"
        />
        <div className="mt-2 flex justify-between text-[12px] text-mute">
          <span>0원</span>
          <span>{won(max)}원</span>
        </div>
          </>
        )}
        <Btn
          className="mt-8"
          disabled={!v}
          onClick={() => {
            s.moveToInvest(v)
            s.notify(`투자금 ${won(v)}원을 충전했어요`)
            onClose()
          }}
        >
          충전하기
        </Btn>
      </div>
    </Sheet>
  )
}

export function StockSheet({ code, onClose }: { code: string | null; onClose: () => void }) {
  return (
    <Sheet open={!!code} onClose={onClose} full>
      {code && <StockBody code={code} onClose={onClose} />}
    </Sheet>
  )
}

function StockBody({ code, onClose }: { code: string; onClose: () => void }) {
  const s = useStore()
  const st = STOCKS.find((x) => x.code === code)!
  const p = s.prices[code]
  const [range, setRange] = useState<'7' | '30' | '90'>('30')
  const [trade, setTrade] = useState<null | 'buy' | 'sell'>(null)
  const [qty, setQty] = useState(1)
  const [done, setDone] = useState<string | null>(null)
  const hold = s.state.invest.holdings.find((h) => h.code === code)
  const data = p.hist.slice(-Number(range))
  const ch = (p.price - p.prev) / p.prev
  const rangeCh = (p.price - data[0]) / data[0]
  const maxBuy = Math.floor(s.state.invest.cash / p.price)
  const maxQty = trade === 'sell' ? hold?.qty ?? 0 : maxBuy

  if (done) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 pb-10 text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: 'spring', damping: 12 }} className="grid size-16 place-items-center rounded-full bg-blue text-white">
          <Check size={32} strokeWidth={3} />
        </motion.div>
        <h2 className="mt-5 text-[22px] font-bold">{done.split('|')[0]}</h2>
        {done.includes('|') ? (
          <p className={'mt-2 text-[16px] font-semibold ' + (Number(done.split('|')[1]) >= 0 ? 'text-up' : 'text-down')}>
            실현 수익 {signed(Number(done.split('|')[1]))}원
          </p>
        ) : null}
        <p className="mt-2 text-[14.5px] text-sub">투자금 {won(s.state.invest.cash)}원 · 평행세계 자산에 반영됐어요</p>
        <Btn className="mt-10" onClick={onClose}>
          확인
        </Btn>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 pt-1">
        <div className="flex items-center gap-2.5">
          <StockLogo s={st} size={32} />
          <span className="text-[15px] font-semibold">{st.name}</span>
        </div>
        <CloseBtn onClick={onClose} />
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto px-5">
        <div className="mt-4 text-[30px] font-bold tracking-tight">
          <Num value={p.price} suffix="원" />
        </div>
        <div className={'text-[14px] font-semibold tabular-nums ' + (ch >= 0 ? 'text-up' : 'text-down')}>
          어제보다 {signed(p.price - p.prev)}원 ({pct(ch)})
        </div>
        <div className="mt-1 text-[12px] text-mute">{sourceLabel(s.liveSource)}</div>
        <div className="mt-5">
          <StockChart data={data} avg={hold?.avg} />
        </div>
        <div className="mt-3 flex items-center justify-between">
          <div className="flex gap-1">
            {(['7', '30', '90'] as const).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={'rounded-lg px-3 py-1.5 text-[13px] font-semibold ' + (range === r ? 'bg-[#EEF0F4] text-ink' : 'text-mute')}
              >
                {r === '7' ? '1주' : r === '30' ? '1달' : '3달'}
              </button>
            ))}
          </div>
          <span className={'text-[12.5px] font-medium ' + (rangeCh >= 0 ? 'text-up' : 'text-down')}>기간 {pct(rangeCh, 1)}</span>
        </div>

        {hold && (
          <div className="mt-5 grid grid-cols-3 rounded-2xl bg-[#F6F7F9] p-4 text-center">
            <div>
              <div className="text-[12px] text-sub">보유</div>
              <div className="mt-0.5 text-[15px] font-bold">{hold.qty}주</div>
            </div>
            <div>
              <div className="text-[12px] text-sub">평균 단가</div>
              <div className="mt-0.5 text-[15px] font-bold tabular-nums">{won(hold.avg)}</div>
            </div>
            <div>
              <div className="text-[12px] text-sub">수익</div>
              <div className={'mt-0.5 text-[15px] font-bold tabular-nums ' + (p.price >= hold.avg ? 'text-up' : 'text-down')}>
                {pct((p.price - hold.avg) / hold.avg, 1)}
              </div>
            </div>
          </div>
        )}

        <div className="mt-4 rounded-2xl bg-[#F1F0FF] p-4">
          <AIBadge>왜 움직였을까</AIBadge>
          <p className="mt-2 text-[14px] leading-relaxed text-[#2E2A5A]">{st.why}</p>
        </div>
        <div className="mt-3 mb-6 rounded-2xl border border-line p-4">
          <div className="text-[13px] font-semibold text-sub">이런 종목이에요</div>
          <p className="mt-1 text-[14px] leading-relaxed">{st.about}</p>
        </div>
      </div>

      <div className="border-t border-line bg-white px-5 pt-3 pb-6">
        <AnimatePresence initial={false}>
          {trade && (
            <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
              <div className="flex items-center justify-between pb-2">
                <span className="text-[15px] font-semibold">{trade === 'buy' ? '몇 주 살까요?' : '몇 주 팔까요?'}</span>
                <span className="text-[12.5px] text-sub">
                  최대 {maxQty}주 {trade === 'buy' && `· 주문 가능 ${wonShort(s.state.invest.cash)}원`}
                </span>
              </div>
              <div className="flex items-center gap-3 rounded-2xl bg-[#F6F7F9] p-2">
                <button onClick={() => setQty((q) => clamp(q - 1, 1, Math.max(1, maxQty)))} className="grid size-11 place-items-center rounded-xl bg-white">
                  <Minus size={18} />
                </button>
                <div className="flex-1 text-center">
                  <div className="text-[20px] font-bold">{qty}주</div>
                  <div className="text-[12.5px] text-sub tabular-nums">{won(qty * p.price)}원</div>
                </div>
                <button onClick={() => setQty((q) => clamp(q + 1, 1, Math.max(1, maxQty)))} className="grid size-11 place-items-center rounded-xl bg-white">
                  <Plus size={18} />
                </button>
              </div>
              {trade === 'buy' && maxBuy === 0 && (
                <p className="mt-2 text-[12.5px] text-red">주문 가능 금액이 부족해요. 소비를 참거나 적금에서 채워보세요.</p>
              )}
              <div className="h-3" />
            </motion.div>
          )}
        </AnimatePresence>
        {trade ? (
          <div className="flex gap-2">
            <Btn variant="gray" className="!w-[32%]" onClick={() => setTrade(null)}>
              취소
            </Btn>
            <Btn
              variant={trade === 'buy' ? 'danger' : 'primary'}
              disabled={qty > maxQty || maxQty === 0}
              onClick={() => {
                if (trade === 'buy') {
                  if (s.buy(code, qty)) setDone(`${st.name} ${qty}주를 샀어요`)
                  else s.notify('가격이 올라 투자금이 부족해요. 수량을 줄여주세요')
                } else {
                  const pl = s.sell(code, qty)
                  if (pl !== null) setDone(`${st.name} ${qty}주를 팔았어요|${Math.round(pl)}`)
                }
              }}
            >
              {trade === 'buy' ? '구매하기' : '판매하기'}
            </Btn>
          </div>
        ) : (
          <div className="flex gap-2">
            {hold && (
              <Btn
                variant="gray"
                onClick={() => {
                  setQty(1)
                  setTrade('sell')
                }}
              >
                판매
              </Btn>
            )}
            <Btn
              variant="danger"
              onClick={() => {
                setQty(1)
                setTrade('buy')
              }}
            >
              구매
            </Btn>
          </div>
        )}
      </div>
    </div>
  )
}

/* ---------------- savings ---------------- */

function Savings() {
  const s = useStore()
  const { state } = s
  const [depOpen, setDepOpen] = useState(false)
  const t = today()
  const ch = state.challenge
  const nextAmt = ch ? ch.base * (ch.filled + 1) : 0
  const [base, setBase] = useState(1000)
  const tomorrow = afterTax((state.saving.balance * state.saving.rate) / 365)

  return (
    <div className="space-y-3 pt-1">
      <section className="relative overflow-hidden rounded-[26px] bg-[linear-gradient(140deg,#2563EB,#4F46E5)] p-5 text-white">
        <div className="absolute -top-10 -right-10 size-40 rounded-full bg-white/10 blur-xl" />
        <div className="flex items-center justify-between">
          <span className="text-[14px] font-semibold text-white/80">{PRODUCTS.saving.name}</span>
          <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[12px] font-semibold">연 {(state.saving.rate * 100).toFixed(1)}%</span>
        </div>
        <div className="mt-3 text-[30px] font-bold tracking-tight">
          <Num value={s.savingTotal} suffix="원" />
        </div>
        <div className="mt-1 text-[13px] text-white/75">
          지금까지 이자 +{won(s.savingInterest)}원 · 내일 +{won(tomorrow)}원
        </div>
        <div className="mt-4 rounded-2xl bg-white/12 px-4 py-3 text-[13px] leading-relaxed text-white/85">
          참은 돈이 여기에 바로 쌓여요. 어느 정도 모이면 예금으로 묶어 이자를 더 받아보세요.
        </div>
        <button
          onClick={() => setDepOpen(true)}
          className="mt-3 flex w-full items-center justify-center gap-1 rounded-2xl bg-white py-3 text-[15px] font-semibold text-blue"
        >
          정기예금으로 묶기 <ChevronRight size={16} />
        </button>
      </section>

      <section className="rounded-[26px] bg-white p-5">
        <h2 className="text-[17px] font-bold">정기예금</h2>
        {state.deposits.length === 0 && <p className="mt-2 text-[14px] text-sub">아직 가입한 예금이 없어요. 10만 원부터 묶어둘 수 있어요.</p>}
        {state.deposits.map((dp) => {
          const start = parseISO(dp.start)
          const end = new Date(start.getFullYear(), start.getMonth() + dp.months, start.getDate())
          const total = daysBetween(start, end)
          const passed = clamp(daysBetween(start, t), 0, total)
          const maturity = dp.principal + afterTax((dp.principal * dp.rate * dp.months) / 12)
          return (
            <div key={dp.id} className="mt-4">
              <div className="flex items-baseline justify-between">
                <span className="text-[15px] font-semibold">
                  {dp.months}개월 · 연 {(dp.rate * 100).toFixed(1)}%
                </span>
                <span className="text-[15px] font-bold tabular-nums">{won(dp.principal + accrued(dp.principal, dp.rate, passed))}원</span>
              </div>
              <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-[#EEF0F4]">
                <motion.div
                  className="h-full rounded-full bg-blue"
                  initial={{ width: 0 }}
                  animate={{ width: `${(passed / total) * 100}%` }}
                  transition={{ duration: 0.8 }}
                />
              </div>
              <div className="mt-2 flex justify-between text-[12.5px] text-sub">
                <span>
                  {ymd(end)} 만기 · D-{total - passed}
                </span>
                <span>
                  만기 때 <b className="text-ink">{won(maturity)}원</b>
                </span>
              </div>
            </div>
          )
        })}
      </section>

      <section className="rounded-[26px] bg-white p-5">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[17px] font-bold">26주 적금</h2>
          <span className="text-[12.5px] font-semibold text-[#D97706]">연 {(PRODUCTS.challenge.rate * 100).toFixed(0)}%</span>
        </div>
        {ch ? (
          <>
            <p className="mt-1 text-[13.5px] text-sub">
              {ch.filled}주째 · 지금까지 <b className="text-ink">{won(s.challengeTotal)}원</b>
            </p>
            <div className="mt-4 grid grid-cols-13 gap-1.5" style={{ gridTemplateColumns: 'repeat(13, minmax(0, 1fr))' }}>
              {Array.from({ length: 26 }).map((_, i) => (
                <motion.div
                  key={i}
                  initial={false}
                  animate={{ scale: i === ch.filled - 1 ? [1, 1.25, 1] : 1 }}
                  className={
                    'aspect-square rounded-[6px] ' +
                    (i < ch.filled ? 'bg-[linear-gradient(135deg,#FCD34D,#F59E0B)]' : i === ch.filled ? 'border-2 border-dashed border-[#F59E0B]' : 'bg-[#F1F2F5]')
                  }
                />
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between text-[13px] text-sub">
              <span>
                다 채우면 <b className="text-ink">{won(ch.base * 351 + afterTax(ch.base * 351 * PRODUCTS.challenge.rate * 0.25))}원</b>
              </span>
              <span>{ymd(addDays(parseISO(ch.start), 7 * 26))} 만기</span>
            </div>
            <Btn
              className="mt-4"
              variant="dark"
              disabled={ch.filled >= 26 || state.saving.balance < nextAmt}
              onClick={() => {
                s.fillChallenge()
                s.notify(`${ch.filled + 1}주차 ${won(nextAmt)}원을 채웠어요`)
              }}
            >
              {ch.filled >= 26 ? '완주했어요' : `${ch.filled + 1}주차 ${won(nextAmt)}원 채우기`}
            </Btn>
            {state.saving.balance < nextAmt && ch.filled < 26 && (
              <p className="mt-2 text-center text-[12.5px] text-sub">자유적금 잔액이 모자라요. 소비를 한 번 참아보세요.</p>
            )}
          </>
        ) : (
          <>
            <p className="mt-1 text-[13.5px] text-sub">첫 주 금액만큼 매주 늘려 넣어요. 1주 1,000원 → 26주 26,000원</p>
            <div className="mt-4 flex gap-2">
              {[1000, 2000, 3000, 5000].map((b) => (
                <button
                  key={b}
                  onClick={() => setBase(b)}
                  className={'flex-1 rounded-xl py-2.5 text-[14px] font-semibold ' + (base === b ? 'bg-ink text-white' : 'bg-[#F2F3F6] text-sub')}
                >
                  {wonShort(b)}
                </button>
              ))}
            </div>
            <div className="mt-4 rounded-2xl bg-[#FFF8E6] p-4 text-[14px]">
              26주 뒤 <b>{won(base * 351)}원</b> + 이자 약 {won(afterTax(base * 351 * PRODUCTS.challenge.rate * 0.25))}원
            </div>
            <Btn
              className="mt-4"
              variant="dark"
              onClick={() => {
                s.startChallenge(base)
                s.notify('26주 적금을 시작했어요')
              }}
            >
              시작하기
            </Btn>
          </>
        )}
      </section>
      <DepositSheet open={depOpen} onClose={() => setDepOpen(false)} />
    </div>
  )
}

function DepositSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore()
  const max = Math.floor(s.state.saving.balance / 10000) * 10000
  const [months, setMonths] = useState(12)
  const [raw, setV] = useState(100000)
  const v = clamp(raw, 100000, Math.max(100000, max))
  const rate = PRODUCTS.deposit.rates[months]
  const interest = afterTax((v * rate * months) / 12)
  const enough = max >= 100000
  return (
    <Sheet open={open} onClose={onClose}>
      <div className="px-5 pb-6">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-[21px] font-bold">정기예금 가입</h2>
            <p className="mt-1 text-[14px] text-sub">자유적금에서 옮겨 묶어둬요</p>
          </div>
          <CloseBtn onClick={onClose} />
        </div>
        <div className="mt-6 flex gap-2">
          {[6, 12].map((m) => (
            <button
              key={m}
              onClick={() => setMonths(m)}
              className={'flex-1 rounded-2xl border-2 p-3 text-left ' + (months === m ? 'border-blue bg-blue-soft' : 'border-line')}
            >
              <div className="text-[15px] font-bold">{m}개월</div>
              <div className="text-[13px] text-sub">연 {(PRODUCTS.deposit.rates[m] * 100).toFixed(1)}%</div>
            </button>
          ))}
        </div>
        {enough ? (
          <>
            <div className="mt-6 text-center text-[32px] font-bold tabular-nums">{won(v)}원</div>
            <input
              type="range"
              min={100000}
              max={max}
              step={10000}
              value={v}
              onChange={(e) => setV(Number(e.target.value))}
              className="mt-4 w-full accent-blue"
            />
            <div className="mt-1 flex justify-between text-[12px] text-mute">
              <span>10만 원</span>
              <span>{won(max)}원</span>
            </div>
            <div className="mt-5 rounded-2xl bg-[#F6F7F9] p-4">
              <div className="flex justify-between text-[14px]">
                <span className="text-sub">세후 이자</span>
                <span className="font-semibold text-blue">+{won(interest)}원</span>
              </div>
              <div className="mt-2 flex justify-between text-[14px]">
                <span className="text-sub">만기 때 받는 돈</span>
                <span className="font-bold">{won(v + interest)}원</span>
              </div>
            </div>
          </>
        ) : (
          <p className="mt-6 rounded-2xl bg-[#F6F7F9] p-4 text-[14px] text-sub">자유적금에 10만 원 이상 모이면 가입할 수 있어요.</p>
        )}
        <Btn
          className="mt-6"
          disabled={!enough}
          onClick={() => {
            s.openDeposit(v, months, rate)
            s.notify(`${months}개월 예금에 ${won(v)}원을 넣었어요`)
            onClose()
          }}
        >
          가입하기
        </Btn>
      </div>
    </Sheet>
  )
}

/* ---------------- learn ---------------- */

function Learn({ openLesson }: { openLesson: (id: string) => void }) {
  const { state } = useStore()
  const [testing, setTesting] = useState(false)
  const nextIdx = LESSONS.findIndex((l) => !state.lessonsDone.includes(l.id))
  const units = useMemo(() => {
    const u: Record<string, typeof LESSONS> = {}
    LESSONS.forEach((l) => (u[l.unit] ??= []).push(l))
    return Object.entries(u)
  }, [])
  const offsets = [0, 52, 72, 52, 0, -52, -72, -52]
  let k = 0
  return (
    <div className="pt-1">
      {!state.levelTested && (
        <motion.button
          whileTap={{ scale: 0.98 }}
          onClick={() => setTesting(true)}
          className="mb-3 flex w-full items-center gap-4 rounded-[24px] bg-[linear-gradient(120deg,#22C55E,#0EA5E9)] p-5 text-left text-white"
        >
          <div className="text-[34px]">🧭</div>
          <div className="flex-1">
            <div className="text-[16.5px] font-bold">레벨 테스트부터 할까요?</div>
            <div className="mt-0.5 text-[13px] text-white/85">4문제로 이미 아는 단계는 건너뛰어요</div>
          </div>
          <ChevronRight size={20} />
        </motion.button>
      )}
      <LevelTest open={testing} onClose={() => setTesting(false)} />
      <DailyQuizCard />
      <div className="grid grid-cols-3 gap-2">
        {[
          { icon: <Flame size={18} fill="#FF7A2F" className="text-[#FF7A2F]" />, v: `${state.streak}일`, k: '연속 학습' },
          { icon: <Star size={18} fill="#FBBF24" className="text-[#FBBF24]" />, v: `${state.xp}`, k: 'XP' },
          { icon: <Check size={18} className="text-emerald-500" strokeWidth={3} />, v: `${state.lessonsDone.length}/${LESSONS.length}`, k: '완료' },
        ].map((x) => (
          <div key={x.k} className="rounded-2xl bg-white p-3.5">
            {x.icon}
            <div className="mt-2 text-[18px] font-bold">{x.v}</div>
            <div className="text-[12px] text-sub">{x.k}</div>
          </div>
        ))}
      </div>
      {units.map(([unit, list]) => (
        <div key={unit} className="mt-6">
          <div className="rounded-2xl bg-[linear-gradient(120deg,#22C55E,#16A34A)] px-4 py-3 text-white">
            <div className="text-[12px] font-semibold text-white/75">단원</div>
            <div className="text-[16px] font-bold">{unit}</div>
          </div>
          <div className="flex flex-col items-center py-4">
            {list.map((l) => {
              const i = LESSONS.indexOf(l)
              const done = state.lessonsDone.includes(l.id)
              const cur = i === nextIdx
              const locked = !done && !cur
              const x = offsets[k++ % offsets.length]
              return (
                <div key={l.id} className={'relative flex flex-col items-center ' + (cur ? 'mt-10 mb-2.5' : 'my-2.5')} style={{ transform: `translateX(${x}px)` }}>
                  {cur && (
                    <motion.div
                      animate={{ y: [0, -4, 0] }}
                      transition={{ repeat: Infinity, duration: 1.6 }}
                      className="absolute -top-9 rounded-xl border-2 border-line bg-white px-3 py-1 text-[12.5px] font-bold whitespace-nowrap text-[#16A34A]"
                    >
                      시작하기
                    </motion.div>
                  )}
                  <motion.button
                    whileTap={locked ? undefined : { y: 4 }}
                    onClick={() => !locked && openLesson(l.id)}
                    className={
                      'grid size-[68px] place-items-center rounded-full text-[28px] ' +
                      (done
                        ? 'bg-[#FBBF24] shadow-[0_6px_0_#D97706]'
                        : cur
                          ? 'bg-[#22C55E] shadow-[0_6px_0_#15803D] ring-8 ring-[#22C55E]/20'
                          : 'bg-[#E5E7EB] shadow-[0_6px_0_#CBD0D6]')
                    }
                  >
                    {locked ? <Lock size={24} className="text-[#A3ACB8]" /> : done ? <Check size={30} strokeWidth={3.5} className="text-white" /> : l.cards[0].visual}
                  </motion.button>
                  <button onClick={() => !locked && openLesson(l.id)} className={'mt-3 text-[13px] font-semibold ' + (locked ? 'text-mute' : 'text-ink')}>
                    {l.title}
                  </button>
                </div>
              )
            })}
          </div>
        </div>
      ))}
    </div>
  )
}

function DailyQuizCard() {
  const s = useStore()
  const uid = s.mode === 'demo' ? 'S01' : 'S08'
  const [q, setQ] = useState<api.DailyQuiz | null>(null)
  const [res, setRes] = useState<{ choice: number; correct: boolean; answer: number; explanation: string } | null>(null)
  useEffect(() => {
    api.dailyQuiz(uid).then((r) => {
      setQ(r)
      if (r?.answer_record && r.correct_answer !== null)
        setRes({ choice: r.answer_record.choice, correct: r.answer_record.correct, answer: r.correct_answer, explanation: r.explanation ?? '' })
    })
  }, [uid])
  if (!q) return null
  const pick = async (i: number) => {
    if (res) return
    const r = await api.answerQuiz(uid, q.id, i)
    if (r?.answer_record && r.correct_answer !== null) {
      setRes({ choice: r.answer_record.choice, correct: r.answer_record.correct, answer: r.correct_answer, explanation: r.explanation ?? '' })
      if (r.answer_record.correct) s.update({ xp: s.state.xp + 20 })
    } else {
      const again = await api.dailyQuiz(uid)
      if (again?.answer_record && again.correct_answer !== null)
        setRes({ choice: again.answer_record.choice, correct: again.answer_record.correct, answer: again.correct_answer, explanation: again.explanation ?? '' })
      else s.notify('지금은 답을 저장하지 못했어요. 잠시 후 다시 눌러주세요')
    }
  }
  return (
    <section className="mb-3 rounded-[24px] bg-white p-5">
      <div className="flex items-center justify-between">
        <AIBadge>오늘의 1문제</AIBadge>
        <span className="text-[12px] text-sub">하루 한 번 · +20 XP</span>
      </div>
      <h3 className="mt-3 text-[16.5px] font-bold leading-snug tracking-tight">{q.question}</h3>
      <div className="mt-4 space-y-2">
        {q.options.map((o, i) => {
          const right = res && i === res.answer
          const wrong = res && i === res.choice && !res.correct
          return (
            <button
              key={o}
              onClick={() => pick(i)}
              className={
                'w-full rounded-2xl border-2 px-4 py-3 text-left text-[14.5px] font-semibold ' +
                (right ? 'border-[#22C55E] bg-[#ECFDF3] text-[#15803D]' : wrong ? 'border-red bg-red/5 text-red' : 'border-line')
              }
            >
              {o}
            </button>
          )
        })}
      </div>
      {!res && q.hint && <p className="mt-3 text-[12.5px] text-sub">힌트 · {q.hint}</p>}
      {res && (
        <p className="mt-3 rounded-2xl bg-[#F4F5F8] p-3.5 text-[13.5px] leading-relaxed text-[#4E5968]">
          <b className={res.correct ? 'text-[#15803D]' : 'text-red'}>{res.correct ? '정답이에요! ' : '아쉬워요. '}</b>
          {res.explanation}
        </p>
      )}
    </section>
  )
}

function LevelTest({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useStore()
  const qs = LESSONS.slice(0, 4).map((l) => l.quiz)
  const [i, setI] = useState(0)
  const [score, setScore] = useState(0)
  const [pick, setPick] = useState<number | null>(null)
  const end = i >= qs.length
  const close = () => {
    setI(0)
    setScore(0)
    setPick(null)
    onClose()
  }
  return (
    <Sheet open={open} onClose={close} full>
      <div className="flex h-full flex-col">
        <div className="flex items-center gap-3 px-5 pt-1">
          <CloseBtn onClick={close} />
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#EEF0F4]">
            <motion.div className="h-full rounded-full bg-[#22C55E]" animate={{ width: `${(Math.min(i, qs.length) / qs.length) * 100}%` }} />
          </div>
        </div>
        <div className="flex-1 px-6 pt-10">
          {!end ? (
            <>
              <p className="text-[13px] font-semibold text-[#16A34A]">
                레벨 테스트 {i + 1}/{qs.length}
              </p>
              <h2 className="mt-2 text-[23px] font-bold leading-snug tracking-tight">{qs[i].q}</h2>
              <div className="mt-8 space-y-2.5">
                {qs[i].options.map((o, idx) => (
                  <button
                    key={o}
                    onClick={() => setPick(idx)}
                    className={'w-full rounded-2xl border-2 px-5 py-4 text-left text-[16px] font-semibold ' + (pick === idx ? 'border-[#22C55E] bg-[#ECFDF3]' : 'border-line')}
                  >
                    {o}
                  </button>
                ))}
                <button onClick={() => setPick(-1)} className={'w-full rounded-2xl px-5 py-3 text-left text-[14px] ' + (pick === -1 ? 'font-bold text-ink' : 'text-sub')}>
                  잘 모르겠어요
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-col items-center pt-10 text-center">
              <div className="text-[64px]">{score >= 3 ? '🚀' : score >= 1 ? '🌱' : '🐣'}</div>
              <h2 className="mt-4 text-[24px] font-bold">{score}/{qs.length} 맞혔어요</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-sub">
                {score === 0 ? '처음부터 차근차근 시작해요' : `앞의 ${score}단계는 건너뛰고 「${LESSONS[Math.min(score, LESSONS.length - 1)].title}」부터 시작해요`}
              </p>
            </div>
          )}
        </div>
        <div className="px-5 pb-6">
          {!end ? (
            <Btn
              className="!bg-[#22C55E]"
              disabled={pick === null}
              onClick={() => {
                if (pick === qs[i].answer) setScore((x) => x + 1)
                setPick(null)
                setI(i + 1)
              }}
            >
              다음
            </Btn>
          ) : (
            <Btn
              onClick={() => {
                s.finishLevelTest(score)
                close()
              }}
            >
              학습 시작하기
            </Btn>
          )}
        </div>
      </div>
    </Sheet>
  )
}

export function LessonSheet({ id, onClose, onPractice }: { id: string | null; onClose: () => void; onPractice: (target: string) => void }) {
  return (
    <Sheet open={!!id} onClose={onClose} full>
      {id && <LessonBody key={id} id={id} onClose={onClose} onPractice={onPractice} />}
    </Sheet>
  )
}

function LessonBody({ id, onClose, onPractice }: { id: string; onClose: () => void; onPractice: (t: string) => void }) {
  const s = useStore()
  const lesson = LESSONS.find((l) => l.id === id)!
  const total = lesson.cards.length + 2
  const [i, setI] = useState(0)
  const [pick, setPick] = useState<number | null>(null)
  const isQuiz = i === lesson.cards.length
  const isEnd = i === lesson.cards.length + 1
  const correct = pick === lesson.quiz.answer
  const xp = correct ? 50 : 30

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-3 px-5 pt-1">
        <CloseBtn onClick={onClose} />
        <div className="h-3 flex-1 overflow-hidden rounded-full bg-[#EEF0F4]">
          <motion.div className="h-full rounded-full bg-[#22C55E]" animate={{ width: `${((i + (isEnd ? 1 : 0)) / (total - 1)) * 100}%` }} />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto px-6">
        <AnimatePresence mode="wait">
          <motion.div key={i} initial={{ opacity: 0, x: 30 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -30 }} transition={{ duration: 0.2 }}>
            {i < lesson.cards.length && (
              <div className="pt-10">
                <div className="grid size-24 place-items-center rounded-[28px] bg-[#F4F5F8] text-[48px]">{lesson.cards[i].visual}</div>
                <p className="mt-8 text-[13px] font-semibold text-[#16A34A]">
                  {lesson.title} · {i + 1}/{lesson.cards.length}
                </p>
                <h2 className="mt-2 text-[26px] font-bold leading-snug tracking-tight">{lesson.cards[i].title}</h2>
                <p className="mt-4 text-[17px] leading-relaxed text-[#4E5968]">{lesson.cards[i].body}</p>
              </div>
            )}
            {isQuiz && (
              <div className="pt-10">
                <p className="text-[13px] font-semibold text-[#16A34A]">확인 문제</p>
                <h2 className="mt-2 text-[23px] font-bold leading-snug tracking-tight">{lesson.quiz.q}</h2>
                <div className="mt-8 space-y-2.5">
                  {lesson.quiz.options.map((o, idx) => {
                    const chosen = pick === idx
                    const show = pick !== null
                    const right = idx === lesson.quiz.answer
                    return (
                      <motion.button
                        key={o}
                        whileTap={{ scale: 0.98 }}
                        animate={show && chosen && !right ? { x: [0, -8, 8, -4, 0] } : {}}
                        onClick={() => pick === null && setPick(idx)}
                        className={
                          'w-full rounded-2xl border-2 px-5 py-4 text-left text-[16px] font-semibold ' +
                          (show && right
                            ? 'border-[#22C55E] bg-[#ECFDF3] text-[#15803D]'
                            : show && chosen
                              ? 'border-red bg-red/5 text-red'
                              : 'border-line')
                        }
                      >
                        {o}
                      </motion.button>
                    )
                  })}
                </div>
                {pick !== null && (
                  <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="mt-5 rounded-2xl bg-[#F4F5F8] p-4 text-[14.5px] leading-relaxed text-[#4E5968]">
                    <b className={correct ? 'text-[#15803D]' : 'text-red'}>{correct ? '정답이에요! ' : '아쉬워요. '}</b>
                    {lesson.quiz.explain}
                  </motion.div>
                )}
              </div>
            )}
            {isEnd && (
              <div className="flex flex-col items-center pt-16 text-center">
                <motion.div initial={{ scale: 0, rotate: -20 }} animate={{ scale: 1, rotate: 0 }} transition={{ type: 'spring', damping: 10 }} className="text-[72px]">
                  🎉
                </motion.div>
                <h2 className="mt-4 text-[24px] font-bold">학습 완료!</h2>
                <div className="mt-6 flex gap-2">
                  <span className="rounded-full bg-[#FFF7E0] px-3 py-1.5 text-[14px] font-bold text-[#D97706]">+{xp} XP</span>
                  <span className="rounded-full bg-[#FFF1EA] px-3 py-1.5 text-[14px] font-bold text-[#FF7A2F]">🔥 {s.state.streak}일 연속</span>
                </div>
                {lesson.practice && (
                  <div className="mt-10 w-full rounded-[22px] bg-[#F1F0FF] p-5 text-left">
                    <div className="flex items-center gap-1.5 text-[13px] font-semibold text-[#6A5CF5]">
                      <Sparkles size={14} /> 배운 걸 평행세계에서
                    </div>
                    <div className="mt-1.5 text-[16px] font-bold text-[#2E2A5A]">
                      {lesson.practice === 'saving'
                        ? '내 자유적금 이자 확인해보기'
                        : lesson.practice === 'deposit'
                          ? '자유적금을 예금으로 묶어보기'
                          : `${STOCKS.find((x) => x.code === lesson.practice)?.name} 1주 사보기`}
                    </div>
                  </div>
                )}
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
      <div className="px-5 pt-3 pb-6">
        {isEnd ? (
          <div className="flex gap-2">
            <Btn variant="gray" className={lesson.practice ? '!w-[38%]' : ''} onClick={onClose}>
              닫기
            </Btn>
            {lesson.practice && (
              <Btn variant="glow" onClick={() => onPractice(lesson.practice!)}>
                바로 해보기
              </Btn>
            )}
          </div>
        ) : (
          <Btn
            className={isQuiz ? '' : '!bg-[#22C55E]'}
            disabled={isQuiz && pick === null}
            onClick={() => {
              if (isQuiz) s.completeLesson(lesson.id, xp)
              setI(i + 1)
            }}
          >
            {isQuiz ? '완료' : '다음'}
          </Btn>
        )}
      </div>
    </div>
  )
}
