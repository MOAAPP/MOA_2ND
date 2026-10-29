import { useId, useMemo, useRef, type PointerEvent } from 'react';
import { formatShort, type ISODate } from '../../shared/dates';
import { manShort } from '../../shared/format';
import type { DayPoint } from '../lib/cashflow';
import type { BandPoint } from '../lib/ml/montecarlo';

export interface ChartSeries {
  days: DayPoint[];
  label: string;
  /** 생활비 포함 10~90% 범위 */
  band?: BandPoint[];
}

interface Props {
  real: ChartSeries;
  para?: ChartSeries;
  from: ISODate;
  minBalance: number;
  cursor: ISODate;
  onCursor: (d: ISODate) => void;
  /** 두 세계가 갈라지는 날 */
  forkDate?: ISODate;
  animKey?: string;
  height?: number;
  legend?: boolean;
}

const W = 340;
const PAD = { l: 4, r: 52, t: 30, b: 38 };

type Pt = [number, number];

/**
 * 같은 점에서 갈라지는 두 세계.
 * 실선 = 지금대로, 점선 = 다른 선택. 두 선 사이의 면이 선택이 만든 차이.
 * 옅은 띠는 생활비까지 넣었을 때의 범위, 지켜둘 금액 아래 구간은 빨간 선.
 * 그래프를 누르거나 끌면 그날의 두 잔고를 본다.
 */
export function ParallelChart({ real, para, from, minBalance, cursor, onCursor, forkDate, animKey, height = 230, legend = true }: Props) {
  const H = height;
  const RAIL_Y = H - PAD.b + 10;
  const uid = useId().replace(/:/g, '');
  const svgRef = useRef<SVGSVGElement>(null);
  const r = useMemo(() => real.days.filter((p) => p.date >= from), [real.days, from]);
  const p = useMemo(() => (para?.days ?? []).filter((x) => x.date >= from), [para?.days, from]);
  const rb = useMemo(() => (real.band ?? []).filter((x) => x.date >= from), [real.band, from]);
  const pb = useMemo(() => (para?.band ?? []).filter((x) => x.date >= from), [para?.band, from]);
  const dates = useMemo(() => r.map((x) => x.date), [r]);
  const n = Math.max(1, r.length - 1);

  const geo = useMemo(() => {
    const vals = [...r.flatMap((d) => [d.close, d.low]), ...p.flatMap((d) => [d.close, d.low]), ...rb.flatMap((b) => [b.p10, b.p90]), ...pb.flatMap((b) => [b.p10, b.p90]), 0];
    if (minBalance > 0) vals.push(minBalance);
    let mn = Math.min(...vals);
    let mx = Math.max(...vals);
    if (mx - mn < 1) mx = mn + 1;
    const pad = (mx - mn) * 0.06;
    mn -= pad;
    mx += pad;
    const x = (i: number) => PAD.l + (i / n) * (W - PAD.l - PAD.r);
    const y = (v: number) => PAD.t + (1 - (v - mn) / (mx - mn)) * (H - PAD.t - PAD.b);
    const idx = new Map(dates.map((d, i) => [d, i]));
    // 계단식: 같은 날 지출이 먼저 빠지는 최저점까지 보여준다
    const pts = (days: DayPoint[]): Pt[] =>
      days.flatMap((d, i) => {
        const xx = x(i);
        const out: Pt[] = [[xx, y(d.open)]];
        if (d.low !== d.open) out.push([xx, y(d.low)]);
        if (d.close !== d.low) out.push([xx, y(d.close)]);
        return out;
      });
    const path = (ps: Pt[]) => ps.map(([a, b], i) => `${i ? 'L' : 'M'}${a.toFixed(1)},${b.toFixed(1)}`).join('');
    const back = (ps: Pt[]) => [...ps].reverse().map(([a, b]) => `L${a.toFixed(1)},${b.toFixed(1)}`).join('');
    const bandPath = (b: BandPoint[]) => {
      if (b.length < 2) return '';
      const top = b.map((q) => [x(idx.get(q.date) ?? 0), y(q.p90)] as Pt);
      const bot = b.map((q) => [x(idx.get(q.date) ?? 0), y(q.p10)] as Pt);
      return `${path(top)}${back(bot)}Z`;
    };
    const rp = pts(r);
    const pp = pts(p);
    return {
      x,
      y,
      mn,
      mx,
      real: path(rp),
      para: pp.length ? path(pp) : '',
      gap: pp.length ? `${path(rp)}${back(pp)}Z` : '',
      realBand: bandPath(rb),
      paraBand: bandPath(pb),
    };
  }, [r, p, rb, pb, minBalance, n, dates, H]);

  if (!r.length) return null;
  const { x, y, mn, mx } = geo;

  const ci = Math.max(0, dates.indexOf(cursor));
  const last = r.length - 1;
  const endR = r[last].close;
  const endP = p[last]?.close;
  const cR = r[ci].close;
  const cP = p[ci]?.close;

  // 끝 라벨 겹침 방지
  let yR = y(endR);
  let yP = endP !== undefined ? y(endP) : 0;
  if (endP !== undefined && Math.abs(yR - yP) < 18) {
    const mid = (yR + yP) / 2;
    const s = yP <= yR ? -1 : 1;
    yP = mid + s * 9;
    yR = mid - s * 9;
  }

  // 일정 표시: 들어올 돈은 초록 점, 꼭 나갈 돈은 회색 점. 이름은 겹치지 않을 때만
  const marks: { i: number; kind: 'in' | 'out'; label: string; show: boolean }[] = [];
  let lastX = -99;
  r.forEach((d, i) => {
    const inc = d.flows.find((f) => f.kind === 'income');
    const ess = d.flows.find((f) => f.essential);
    const f = inc ?? ess;
    if (!f) return;
    const xx = x(i);
    const show = xx - lastX >= 40;
    if (show) lastX = xx;
    marks.push({ i, kind: inc ? 'in' : 'out', label: f.label.slice(0, 4), show });
  });

  const forkIdx = forkDate ? dates.indexOf(forkDate) : -1;
  const minY = y(minBalance);
  const showMin = minBalance > 0 && minBalance > mn && minBalance < mx;
  const showZero = 0 > mn && 0 < mx && (!showMin || Math.abs(y(0) - minY) > 6);
  const anyBelow = showMin && r.some((d) => d.low < minBalance);

  const pick = (e: PointerEvent<SVGSVGElement>) => {
    const box = svgRef.current?.getBoundingClientRect();
    if (!box) return;
    const sx = ((e.clientX - box.left) / box.width) * W;
    const k = Math.min(last, Math.max(0, Math.round(((sx - PAD.l) / (W - PAD.l - PAD.r)) * n)));
    if (dates[k] !== cursor) onCursor(dates[k]);
  };

  const tipText = `${formatShort(dates[ci])}  ${manShort(cR)}${cP !== undefined ? ` / ${manShort(cP)}` : ''}`;
  const tipW = Math.max(84, tipText.length * 6.4 + 16);
  const tipX = Math.min(W - PAD.r - tipW / 2, Math.max(PAD.l + tipW / 2, x(ci)));

  return (
    <div className="pchart">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`날짜별 예상 잔고. ${formatShort(dates[last])}에 ${real.label} ${manShort(endR)}원${endP !== undefined ? `, ${para!.label} ${manShort(endP)}원` : ''}`}
        onPointerDown={(e) => {
          (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
          pick(e);
        }}
        onPointerMove={(e) => e.buttons && pick(e)}
      >
        <defs>
          <clipPath id={`below${uid}`}>
            <rect x={0} y={minY} width={W} height={Math.max(0, H - minY)} />
          </clipPath>
        </defs>

        {[0.25, 0.5, 0.75].map((t) => (
          <line key={t} className="grid" x1={PAD.l} x2={W - PAD.r} y1={PAD.t + t * (H - PAD.t - PAD.b)} y2={PAD.t + t * (H - PAD.t - PAD.b)} />
        ))}

        {geo.paraBand && <path className="band para fade-in" d={geo.paraBand} />}
        {geo.realBand && <path className="band real fade-in" d={geo.realBand} />}
        {geo.gap && <path key={`g${animKey}`} className="gap-area fade-in" d={geo.gap} />}

        {showZero && <line className="zero" x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} />}
        {showMin && (
          <>
            <line className="minline" x1={PAD.l} x2={W - PAD.r} y1={minY} y2={minY} />
            <text className="minlabel" x={PAD.l + 2} y={minY - 5}>지킬 돈</text>
          </>
        )}

        <path key={`r${animKey}`} className="real-line draw" d={geo.real} style={{ ['--len' as string]: 2400 }} />
        {anyBelow && <path className="danger-line" d={geo.real} clipPath={`url(#below${uid})`} />}
        {geo.para && <path key={`p${animKey}`} className="para-line draw" d={geo.para} />}

        {forkIdx >= 0 && (
          <g>
            <circle cx={x(forkIdx)} cy={y(r[forkIdx].open)} r={5} fill="#fff" stroke="var(--ink)" strokeWidth={1.8} />
            <text className="fork-label" x={x(forkIdx)} y={y(r[forkIdx].open) - 10} textAnchor={x(forkIdx) < 24 ? 'start' : 'middle'}>
              갈림길
            </text>
          </g>
        )}

        {endP !== undefined && endP !== endR && <line className="gap-bracket" x1={x(last) + 0.5} x2={x(last) + 0.5} y1={y(endR)} y2={y(endP)} />}
        <circle cx={x(last)} cy={y(endR)} r={3.5} fill="var(--real)" />
        <text className="end real" x={W - PAD.r + 6} y={yR + 4}>{manShort(endR)}</text>
        {endP !== undefined && (
          <>
            <circle cx={x(last)} cy={y(endP)} r={3.5} fill="var(--para)" />
            <text className="end para" x={W - PAD.r + 6} y={yP + 4}>{manShort(endP)}</text>
          </>
        )}

        <line className="cursor" x1={x(ci)} x2={x(ci)} y1={PAD.t - 2} y2={H - PAD.b} />
        {cP !== undefined && <circle cx={x(ci)} cy={y(cP)} r={5} fill="var(--para)" stroke="#fff" strokeWidth={2} />}
        <circle cx={x(ci)} cy={y(cR)} r={5} fill={anyBelow && cR < minBalance ? 'var(--danger)' : 'var(--real)'} stroke="#fff" strokeWidth={2} />
        <g className="tip">
          <rect x={tipX - tipW / 2} y={2} width={tipW} height={22} rx={6} />
          <text x={tipX} y={17} textAnchor="middle">{tipText}</text>
        </g>

        <line className="rail" x1={PAD.l} x2={W - PAD.r} y1={RAIL_Y - 8} y2={RAIL_Y - 8} />
        {marks.map((m) => (
          <g key={m.i} className={`mk ${m.kind}`}>
            <circle cx={x(m.i)} cy={RAIL_Y - 8} r={3} />
            {m.show && <text x={x(m.i)} y={RAIL_Y + 7} textAnchor="middle">{m.label}</text>}
          </g>
        ))}
        <text className="axis" x={PAD.l} y={H - 2}>{formatShort(dates[0])}</text>
        <text className="axis" x={W - PAD.r} y={H - 2} textAnchor="end">{formatShort(dates[last])}</text>
      </svg>

      <label className="sr-only" htmlFor={`range${uid}`}>날짜 고르기</label>
      <input id={`range${uid}`} className="sr-only" type="range" min={0} max={last} value={ci} onChange={(e) => onCursor(dates[Number(e.target.value)])} aria-valuetext={formatShort(dates[ci])} />

      {legend && (
        <div className="pchart-legend">
          <span><i />{real.label}</span>
          {para && <span><i className="para" />{para.label}</span>}
          {(rb.length > 0 || pb.length > 0) && <span><i className="band" />생활비 넣은 범위</span>}
          {showMin && <span><i className="min" />지킬 돈</span>}
        </div>
      )}
    </div>
  );
}
