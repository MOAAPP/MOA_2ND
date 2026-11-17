import { AnimatePresence, motion } from 'framer-motion'
import {
  Bus,
  ChevronLeft,
  Coffee,
  Film,
  HelpCircle,
  Repeat,
  ShoppingBag,
  Sparkles,
  Sprout,
  UtensilsCrossed,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { CATS, type Category } from './data'
import { won } from './lib'

export const CAT_ICON: Record<Category, LucideIcon> = {
  food: UtensilsCrossed,
  cafe: Coffee,
  transport: Bus,
  shopping: ShoppingBag,
  life: Sprout,
  culture: Film,
  subscription: Repeat,
  income: Wallet,
  etc: HelpCircle,
}

export function CatIcon({ c, size = 40, dark }: { c: Category; size?: number; dark?: boolean }) {
  const I = CAT_ICON[c]
  const color = CATS[c].color
  return (
    <div
      className="grid shrink-0 place-items-center rounded-[14px]"
      style={{ width: size, height: size, background: dark ? 'rgba(255,255,255,.08)' : color + '1A', color: dark ? '#C7D2FE' : color }}
    >
      <I size={size * 0.48} strokeWidth={2} />
    </div>
  )
}

/** count-up number that eases to new values */
export function Num({ value, className, suffix = '' }: { value: number; className?: string; suffix?: string }) {
  const [shown, setShown] = useState(value)
  const from = useRef(value)
  useEffect(() => {
    const start = performance.now()
    const a = from.current
    const b = value
    if (a === b) return
    let raf = 0
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / 700)
      const e = 1 - Math.pow(1 - p, 3)
      const v = a + (b - a) * e
      setShown(v)
      if (p < 1) raf = requestAnimationFrame(tick)
      else from.current = b
    }
    raf = requestAnimationFrame(tick)
    return () => {
      cancelAnimationFrame(raf)
      from.current = b
    }
  }, [value])
  return (
    <span className={'tabular-nums ' + (className ?? '')}>
      {won(shown)}
      {suffix}
    </span>
  )
}

export function Sheet({
  open,
  onClose,
  children,
  dark,
  full,
}: {
  open: boolean
  onClose: () => void
  children: ReactNode
  dark?: boolean
  full?: boolean
}) {
  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 mx-auto flex max-w-[430px] flex-col justify-end">
          <motion.div
            className="absolute inset-0 bg-[#0B1020]/45"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.div
            className={
              'relative flex max-h-[94dvh] flex-col overflow-hidden rounded-t-[28px] ' +
              (full ? 'h-[94dvh] ' : '') +
              (dark ? 'bg-[#0A0F2C] text-white' : 'bg-white text-ink')
            }
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 32, stiffness: 340 }}
            drag="y"
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, i) => {
              if (i.offset.y > 120 || i.velocity.y > 600) onClose()
            }}
          >
            <div className="flex justify-center pt-2.5 pb-1">
              <div className={'h-1 w-10 rounded-full ' + (dark ? 'bg-white/20' : 'bg-black/10')} />
            </div>
            <div className="no-scrollbar flex-1 overflow-y-auto overscroll-contain" onPointerDownCapture={(e) => e.stopPropagation()}>
              {children}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}

/** full-screen push page */
export function Page({
  open,
  onClose,
  title,
  children,
  dark,
  right,
}: {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  dark?: boolean
  right?: ReactNode
}) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className={'fixed inset-0 z-40 mx-auto flex max-w-[430px] flex-col ' + (dark ? 'bg-[#070B22] text-white' : 'bg-bg text-ink')}
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 34, stiffness: 320 }}
        >
          <div className="flex h-14 shrink-0 items-center gap-1 px-2">
            <button onClick={onClose} className="grid size-10 place-items-center rounded-full active:bg-black/5" aria-label="뒤로">
              <ChevronLeft size={24} />
            </button>
            <div className="flex-1 text-[17px] font-semibold">{title}</div>
            {right}
          </div>
          <div className="no-scrollbar flex-1 overflow-y-auto">{children}</div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export function CloseBtn({ onClick, dark }: { onClick: () => void; dark?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label="닫기"
      className={'grid size-9 place-items-center rounded-full ' + (dark ? 'bg-white/10 text-white/80' : 'bg-black/5 text-sub')}
    >
      <X size={18} />
    </button>
  )
}

export function Btn({
  children,
  onClick,
  variant = 'primary',
  disabled,
  className = '',
}: {
  children: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'gray' | 'dark' | 'glow' | 'danger' | 'ghost'
  disabled?: boolean
  className?: string
}) {
  const styles: Record<string, string> = {
    primary: 'bg-blue text-white',
    gray: 'bg-[#EEF0F4] text-ink',
    dark: 'bg-ink text-white',
    glow: 'text-white bg-[linear-gradient(135deg,#6D7CFF,#9B6BFF_55%,#5CC8FF)] shadow-[0_8px_30px_-6px_rgba(124,108,255,.65)]',
    danger: 'bg-red text-white',
    ghost: 'bg-white/10 text-white',
  }
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={disabled ? undefined : onClick}
      className={
        'h-14 w-full rounded-2xl text-[16px] font-semibold transition-opacity ' +
        styles[variant] +
        (disabled ? ' opacity-35' : '') +
        ' ' +
        className
      }
    >
      {children}
    </motion.button>
  )
}

export function Segmented<T extends string>({
  value,
  onChange,
  items,
  dark,
  id,
}: {
  value: T
  onChange: (v: T) => void
  items: { value: T; label: ReactNode }[]
  dark?: boolean
  id: string
}) {
  return (
    <div className={'relative flex rounded-[14px] p-1 ' + (dark ? 'bg-white/8' : 'bg-[#EAECF1]')}>
      {items.map((it) => {
        const on = it.value === value
        return (
          <button
            key={it.value}
            onClick={() => onChange(it.value)}
            className={
              'relative z-10 h-9 flex-1 text-[14px] font-semibold transition-colors ' +
              (on ? (dark ? 'text-white' : 'text-ink') : dark ? 'text-white/45' : 'text-sub')
            }
          >
            {on && (
              <motion.span
                layoutId={'seg-' + id}
                className={'absolute inset-0 -z-10 rounded-[10px] ' + (dark ? 'bg-white/14' : 'bg-white shadow-sm')}
                transition={{ type: 'spring', damping: 30, stiffness: 400 }}
              />
            )}
            {it.label}
          </button>
        )
      })}
    </div>
  )
}

export function Sparkline({ data, w = 64, h = 28, color }: { data: number[]; w?: number; h?: number; color?: string }) {
  const d = useMemo(() => {
    const pts = data.slice(-30)
    const min = Math.min(...pts)
    const max = Math.max(...pts)
    return pts.map((v, i) => `${(i / (pts.length - 1)) * w},${h - ((v - min) / (max - min || 1)) * (h - 4) - 2}`).join(' ')
  }, [data, w, h])
  const up = data[data.length - 1] >= data[Math.max(0, data.length - 30)]
  return (
    <svg width={w} height={h} className="overflow-visible">
      <polyline points={d} fill="none" stroke={color ?? (up ? '#F04452' : '#3182F6')} strokeWidth={1.8} strokeLinejoin="round" />
    </svg>
  )
}

export function Stars({ n = 40, seed = 3 }: { n?: number; seed?: number }) {
  const stars = useMemo(() => {
    let s = seed
    const r = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
    return Array.from({ length: n }, () => ({ x: r() * 100, y: r() * 100, s: r() * 1.6 + 0.6, d: r() * 4 }))
  }, [n, seed])
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden">
      {stars.map((st, i) => (
        <span
          key={i}
          className="twinkle absolute rounded-full bg-white"
          style={{ left: st.x + '%', top: st.y + '%', width: st.s, height: st.s, animationDelay: st.d + 's' }}
        />
      ))}
    </div>
  )
}

/** layered-gradient planet with a tilted ring and orbiting moons */
export function Planet({ size = 180, hue = 250, ring = true, moons = 3, pulse }: { size?: number; hue?: number; ring?: boolean; moons?: number; pulse?: number }) {
  const h2 = (hue + 40) % 360
  const h3 = (hue + 330) % 360
  return (
    <motion.div
      className="relative"
      style={{ width: size, height: size }}
      animate={{ y: [0, -6, 0] }}
      transition={{ duration: 6, repeat: Infinity, ease: 'easeInOut' }}
    >
      <div
        className="absolute -inset-[35%] rounded-full blur-2xl"
        style={{ background: `radial-gradient(circle, hsla(${hue},95%,65%,.45), hsla(${h2},90%,60%,.12) 45%, transparent 70%)` }}
      />
      {ring && (
        <div
          className="absolute left-1/2 top-1/2 rounded-[50%]"
          style={{
            width: size * 1.7,
            height: size * 1.7,
            marginLeft: -size * 0.85,
            marginTop: -size * 0.85,
            transform: 'rotateX(76deg) rotateY(-14deg)',
            border: `${Math.max(2, size / 40)}px solid hsla(${h2},90%,80%,.35)`,
            boxShadow: `0 0 20px hsla(${h2},90%,70%,.35), inset 0 0 20px hsla(${h2},90%,70%,.25)`,
            clipPath: 'polygon(0 0,100% 0,100% 50%,0 50%)',
          }}
        />
      )}
      <motion.div
        key={pulse}
        initial={pulse ? { scale: 0.92 } : false}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', damping: 8, stiffness: 180 }}
        className="absolute inset-0 overflow-hidden rounded-full"
        style={{
          background: `radial-gradient(circle at 32% 28%, hsl(${h2},100%,88%) 0%, hsl(${hue},90%,66%) 26%, hsl(${hue},75%,42%) 55%, hsl(${h3},70%,16%) 88%)`,
          boxShadow: `inset -${size / 9}px -${size / 12}px ${size / 5}px rgba(5,5,30,.65), inset ${size / 22}px ${size / 22}px ${size / 10}px hsla(${h2},100%,90%,.35), 0 0 ${size / 4}px hsla(${hue},90%,60%,.35)`,
        }}
      >
        <div
          className="planet-bands absolute inset-0 opacity-50 mix-blend-soft-light"
          style={{
            backgroundImage: `repeating-linear-gradient(172deg, transparent 0 ${size / 14}px, hsla(${h2},100%,85%,.55) ${size / 14}px ${size / 9}px, transparent ${size / 9}px ${size / 6}px)`,
            backgroundSize: `${size * 2}px ${size}px`,
          }}
        />
        <div
          className="absolute inset-0 rounded-full"
          style={{ background: 'radial-gradient(circle at 75% 80%, rgba(0,0,20,.55), transparent 55%)' }}
        />
      </motion.div>
      {ring && (
        <div
          className="pointer-events-none absolute left-1/2 top-1/2 rounded-[50%]"
          style={{
            width: size * 1.7,
            height: size * 1.7,
            marginLeft: -size * 0.85,
            marginTop: -size * 0.85,
            transform: 'rotateX(76deg) rotateY(-14deg)',
            border: `${Math.max(2, size / 40)}px solid hsla(${h2},90%,85%,.6)`,
            boxShadow: `0 0 18px hsla(${h2},90%,70%,.45)`,
            clipPath: 'polygon(0 50%,100% 50%,100% 100%,0 100%)',
          }}
        />
      )}
      {Array.from({ length: moons }).map((_, i) => (
        <div
          key={i}
          className="orbit absolute left-1/2 top-1/2"
          style={{
            width: size * (1.25 + i * 0.22),
            height: size * (1.25 + i * 0.22),
            marginLeft: -size * (0.625 + i * 0.11),
            marginTop: -size * (0.625 + i * 0.11),
            animationDuration: 9 + i * 5 + 's',
            animationDelay: -i * 3 + 's',
          }}
        >
          <span
            className="absolute left-1/2 top-0 rounded-full"
            style={{
              width: size / (12 + i * 3),
              height: size / (12 + i * 3),
              background: ['#A5F3FC', '#FDE68A', '#F9A8D4'][i % 3],
              boxShadow: `0 0 12px ${['#67E8F9', '#FCD34D', '#F472B6'][i % 3]}`,
            }}
          />
        </div>
      ))}
    </motion.div>
  )
}

export function AIBadge({ dark, children = 'AI 분석' }: { dark?: boolean; children?: ReactNode }) {
  return (
    <span
      className={
        'inline-flex items-center gap-1 rounded-full px-2 py-[3px] text-[11px] font-semibold ' +
        (dark ? 'bg-white/10 text-[#C4B5FD]' : 'bg-[#EEF0FF] text-[#5B5BF0]')
      }
    >
      <Sparkles size={11} strokeWidth={2.4} />
      {children}
    </span>
  )
}

export function Toast({ msg }: { msg: string | null }) {
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-28 z-[80] mx-auto flex max-w-[430px] justify-center px-6">
      <AnimatePresence>
        {msg && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8 }}
            className="rounded-2xl bg-[#1B2033]/92 px-4 py-3 text-[14px] font-medium text-white shadow-lg backdrop-blur"
          >
            {msg}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export function Card({ children, className = '', onClick }: { children: ReactNode; className?: string; onClick?: () => void }) {
  const Comp = onClick ? motion.button : motion.div
  return (
    <Comp
      onClick={onClick}
      whileTap={onClick ? { scale: 0.985 } : undefined}
      className={'block w-full rounded-[24px] bg-white p-5 text-left ' + className}
    >
      {children}
    </Comp>
  )
}

export function SectionTitle({ children, right, dark }: { children: ReactNode; right?: ReactNode; dark?: boolean }) {
  return (
    <div className="mb-3 flex items-end justify-between px-1">
      <h2 className={'text-[19px] font-bold tracking-tight ' + (dark ? 'text-white' : 'text-ink')}>{children}</h2>
      {right}
    </div>
  )
}

export function Keypad({ onKey }: { onKey: (k: string) => void }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', '⌫']
  return (
    <div className="grid grid-cols-3 gap-1 px-2">
      {keys.map((k) => (
        <motion.button
          key={k}
          whileTap={{ scale: 0.9, backgroundColor: 'rgba(0,0,0,.05)' }}
          onClick={() => onKey(k)}
          className="h-14 rounded-2xl text-[22px] font-semibold text-ink"
        >
          {k}
        </motion.button>
      ))}
    </div>
  )
}
