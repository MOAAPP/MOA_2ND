import { motion } from 'framer-motion'
import { useMemo, useRef, useState } from 'react'
import { type Tx } from './data'
import { daysBetween, mdDot, parseISO, today, won, wonShort, type ForecastPoint } from './lib'

export function ForecastChart({
  pts,
  keep,
  extra = 0,
  ghostLine,
  h = 150,
}: {
  pts: ForecastPoint[]
  keep: number
  extra?: number
  /** explicit balances after the purchase (server path); overrides extra */
  ghostLine?: number[]
  h?: number
}) {
  const W = 340
  const padT = 22
  const padB = 22
  const vals = pts.map((p) => p.balance)
  const ghost = ghostLine && ghostLine.length === vals.length ? ghostLine : vals.map((v) => v - extra)
  const hasGhost = extra > 0 || !!ghostLine
  const max = Math.max(...vals) * 1.04
  const min = Math.min(0, ...ghost, keep * 0.6)
  const x = (i: number) => (i / (pts.length - 1)) * W
  const y = (v: number) => padT + (1 - (v - min) / (max - min)) * (h - padT - padB)
  const line = (arr: number[]) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const area = line(vals) + `L${W},${h - padB}L0,${h - padB}Z`
  const minIdx = ghost.indexOf(Math.min(...ghost))
  const under = hasGhost && ghost[minIdx] < keep
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="w-full overflow-visible">
      <defs>
        <linearGradient id="fcFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#2563EB" stopOpacity=".18" />
          <stop offset="1" stopColor="#2563EB" stopOpacity="0" />
        </linearGradient>
      </defs>
      <line x1={0} x2={W} y1={y(keep)} y2={y(keep)} stroke="#F04452" strokeOpacity=".45" strokeDasharray="4 4" />
      <text x={W} y={y(keep) - 6} textAnchor="end" fontSize="10.5" fill="#F04452" fontWeight={600}>
        지켜둘 돈 {wonShort(keep)}
      </text>
      <motion.path d={area} fill="url(#fcFill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.path
        d={line(vals)}
        fill="none"
        stroke="#2563EB"
        strokeWidth={2.4}
        strokeLinejoin="round"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 0.9, ease: 'easeOut' }}
      />
      {hasGhost && (
        <motion.path
          key={String(extra) + (ghostLine ? 'g' : '')}
          d={line(ghost)}
          fill="none"
          stroke={under ? '#F04452' : '#94A3B8'}
          strokeWidth={2}
          strokeDasharray="5 4"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.8 }}
        />
      )}
      {pts.map((p, i) =>
        p.event ? (
          <g key={i}>
            <circle cx={x(i)} cy={y(vals[i])} r={4} fill="#fff" stroke="#2563EB" strokeWidth={2} />
            <text x={x(i)} y={y(vals[i - 1] ?? vals[i]) - 8} textAnchor="middle" fontSize="10.5" fill="#6B7684" fontWeight={600}>
              {mdDot(p.date)} {p.event?.split(' ')[0]}
            </text>
          </g>
        ) : null,
      )}
      {under && (
        <g>
          <circle cx={x(minIdx)} cy={y(ghost[minIdx])} r={5} fill="#F04452" />
          <circle cx={x(minIdx)} cy={y(ghost[minIdx])} r={10} fill="#F04452" opacity=".18" />
        </g>
      )}
      <text x={0} y={h - 4} fontSize="10.5" fill="#A3ACB8">
        오늘
      </text>
      <text x={W} y={h - 4} textAnchor="end" fontSize="10.5" fill="#A3ACB8">
        {mdDot(pts[pts.length - 1].date)} 월급날
      </text>
    </svg>
  )
}

export function StockChart({ data, h = 200, avg }: { data: number[]; h?: number; avg?: number }) {
  const W = 360
  const ref = useRef<SVGSVGElement>(null)
  const [idx, setIdx] = useState<number | null>(null)
  const min = Math.min(...data, avg ?? Infinity)
  const max = Math.max(...data, avg ?? -Infinity)
  const pad = (max - min) * 0.12 || 1
  const x = (i: number) => (i / (data.length - 1)) * W
  const y = (v: number) => 12 + (1 - (v - (min - pad)) / (max - min + pad * 2)) * (h - 24)
  const d = data.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('')
  const up = data[data.length - 1] >= data[0]
  const color = up ? '#F04452' : '#3182F6'
  const onMove = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    const i = Math.round(((e.clientX - r.left) / r.width) * (data.length - 1))
    setIdx(Math.max(0, Math.min(data.length - 1, i)))
  }
  return (
    <div className="relative">
      <svg
        ref={ref}
        viewBox={`0 0 ${W} ${h}`}
        className="w-full touch-none overflow-visible"
        onPointerMove={onMove}
        onPointerDown={onMove}
        onPointerLeave={() => setIdx(null)}
        onPointerUp={() => setIdx(null)}
      >
        <defs>
          <linearGradient id="skFill" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor={color} stopOpacity=".16" />
            <stop offset="1" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {avg && (
          <>
            <line x1={0} x2={W} y1={y(avg)} y2={y(avg)} stroke="#A3ACB8" strokeDasharray="3 4" />
            <text x={4} y={y(avg) - 5} fontSize="10.5" fill="#8B95A1">
              내 평균 {won(avg)}
            </text>
          </>
        )}
        <path d={d + `L${W},${h}L0,${h}Z`} fill="url(#skFill)" />
        <path d={d} fill="none" stroke={color} strokeWidth={2.2} strokeLinejoin="round" />
        {idx !== null && (
          <>
            <line x1={x(idx)} x2={x(idx)} y1={0} y2={h} stroke="#191F28" strokeOpacity=".15" />
            <circle cx={x(idx)} cy={y(data[idx])} r={5} fill={color} stroke="#fff" strokeWidth={2} />
          </>
        )}
        {idx === null && <circle cx={W} cy={y(data[data.length - 1])} r={4} fill={color} />}
      </svg>
      {idx !== null && (
        <div
          className="pointer-events-none absolute -top-2 rounded-lg bg-ink px-2 py-1 text-[12px] font-semibold text-white"
          style={{ left: `clamp(0px, calc(${(idx / (data.length - 1)) * 100}% - 40px), calc(100% - 90px))` }}
        >
          {won(data[idx])}원
        </div>
      )}
    </div>
  )
}

/** two worlds diverging: the real line stays flat, the parallel line steps up with every skipped purchase */
export function GrowthChart({
  skips,
  total,
  selected,
  onSelect,
  h = 190,
}: {
  skips: Tx[]
  total: number
  selected?: string | null
  onSelect?: (id: string) => void
  h?: number
}) {
  const W = 340
  const data = useMemo(() => {
    const sorted = [...skips].sort((a, b) => a.date.localeCompare(b.date))
    if (!sorted.length) return null
    const start = parseISO(sorted[0].date)
    const span = Math.max(1, daysBetween(start, today()))
    let acc = 0
    const raw = sorted.map((s) => {
      acc += s.amount
      return { s, t: daysBetween(start, parseISO(s.date)) / span, v: acc }
    })
    const scale = acc > 0 ? total / acc : 1
    // spread growth gradually so the line also curves upward over time
    const pts = raw.map((r) => ({ ...r, v: r.v * (1 + (scale - 1) * r.t) }))
    return { pts, end: total }
  }, [skips, total])

  if (!data) {
    return (
      <div className="grid h-[150px] place-items-center rounded-2xl border border-dashed border-white/15 text-center text-[14px] text-white/50">
        첫 소비를 참으면
        <br />
        여기서 두 세계가 갈라지기 시작해요
      </div>
    )
  }
  const max = data.end * 1.12
  const padB = 26
  const x = (t: number) => 8 + t * (W - 24)
  const y = (v: number) => 14 + (1 - v / max) * (h - 14 - padB)
  let d = `M${x(0)},${y(0)}`
  data.pts.forEach((p) => {
    d += `H${x(p.t)}V${y(p.v)}`
  })
  d += `H${x(1)}V${y(data.end)}`
  const area = d + `V${y(0)}H${x(0)}Z`
  return (
    <svg viewBox={`0 0 ${W} ${h}`} className="w-full overflow-visible">
      <defs>
        <linearGradient id="gStroke" x1="0" x2="1">
          <stop offset="0" stopColor="#6D7CFF" />
          <stop offset=".6" stopColor="#B07CFF" />
          <stop offset="1" stopColor="#5EEAD4" />
        </linearGradient>
        <linearGradient id="gFill" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0" stopColor="#8B7CFF" stopOpacity=".35" />
          <stop offset="1" stopColor="#8B7CFF" stopOpacity="0" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <line x1={x(0)} x2={x(1)} y1={y(0)} y2={y(0)} stroke="rgba(255,255,255,.35)" strokeWidth={2} />
      <text x={x(1)} y={y(0) + 16} textAnchor="end" fontSize="10.5" fill="rgba(255,255,255,.45)">
        현실의 나 (소비함)
      </text>
      <motion.path d={area} fill="url(#gFill)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.6 }} />
      <motion.path
        d={d}
        fill="none"
        stroke="url(#gStroke)"
        strokeWidth={2.6}
        filter="url(#glow)"
        initial={{ pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1.6, ease: 'easeInOut' }}
      />
      {data.pts.map((p, i) => {
        const on = selected === p.s.id
        return (
          <motion.g
            key={p.s.id}
            initial={{ opacity: 0, scale: 0 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 + i * 0.08 }}
            style={{ transformOrigin: `${x(p.t)}px ${y(p.v)}px` }}
            onClick={() => onSelect?.(p.s.id)}
            className="cursor-pointer"
          >
            <circle cx={x(p.t)} cy={y(p.v)} r={14} fill="transparent" />
            <circle cx={x(p.t)} cy={y(p.v)} r={on ? 6 : 3.5} fill={on ? '#fff' : '#C4B5FD'} stroke={on ? '#8B7CFF' : 'none'} strokeWidth={3} />
          </motion.g>
        )
      })}
      <motion.g initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 1.5 }}>
        <circle cx={x(1)} cy={y(data.end)} r={6} fill="#5EEAD4" />
        <circle cx={x(1)} cy={y(data.end)} r={12} fill="#5EEAD4" opacity=".25" className="twinkle" />
        <text x={x(1) - 4} y={y(data.end) - 14} textAnchor="end" fontSize="11" fill="#fff" fontWeight={700}>
          평행세계의 나 {wonShort(data.end)}
        </text>
      </motion.g>
    </svg>
  )
}
