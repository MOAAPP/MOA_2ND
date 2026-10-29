import { useId } from 'react';
import type { DayPoint } from '../lib/cashflow';

/** 카드 속 작은 추세선 (점 몇 개만) */
export function MiniSpark({ days, from, tone }: { days: DayPoint[]; from: string; tone: 'real' | 'para' }) {
  const id = useId().replace(/:/g, '');
  const pts = days.filter((d) => d.date >= from);
  if (pts.length < 2) return null;
  const step = Math.max(1, Math.floor(pts.length / 6));
  const sample = pts.filter((_, i) => i % step === 0 || i === pts.length - 1);
  const vals = sample.map((d) => d.close);
  const mn = Math.min(...vals);
  const mx = Math.max(...vals);
  const W = 120;
  const H = 34;
  const x = (i: number) => 4 + (i / (sample.length - 1)) * (W - 8);
  const y = (v: number) => (mx === mn ? H / 2 : 5 + (1 - (v - mn) / (mx - mn)) * (H - 10));
  const line = sample.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.close).toFixed(1)}`).join('');
  const color = tone === 'real' ? 'var(--real)' : 'var(--para)';
  return (
    <svg className="vs-spark" viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <defs>
        <linearGradient id={`s${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.22" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${line}L${x(sample.length - 1)},${H}L${x(0)},${H}Z`} fill={`url(#s${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {sample.map((d, i) => (
        <circle key={i} cx={x(i)} cy={y(d.close)} r={i === sample.length - 1 ? 2.6 : 1.8} fill={color} />
      ))}
    </svg>
  );
}
