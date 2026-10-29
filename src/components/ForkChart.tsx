import { useMemo } from 'react';
import { formatShort, type ISODate } from '../../shared/dates';
import { wonShort } from '../../shared/format';
import type { DayPoint } from '../lib/cashflow';

interface Props {
  real: DayPoint[];
  para?: DayPoint[];
  from: ISODate;
  minBalance: number;
  cursor: ISODate;
  onCursor: (d: ISODate) => void;
  realLabel: string;
  paraLabel: string;
  /** 두 세계가 갈라지는 날 */
  forkDate?: ISODate;
  animKey?: string;
}

const W = 340;
const H = 190;
const PAD = { l: 8, r: 8, t: 16, b: 26 };

/**
 * 같은 출발점에서 갈라지는 두 세계의 날짜별 잔고.
 * 실선 = 현실(●), 점선 = 평행(◇). 슬라이더로 날짜를 바꾸면 두 세계가 같은 날짜로 함께 이동한다.
 */
export function ForkChart({ real, para, from, minBalance, cursor, onCursor, realLabel, paraLabel, forkDate, animKey }: Props) {
  const r = useMemo(() => real.filter((p) => p.date >= from), [real, from]);
  const p = useMemo(() => (para ?? []).filter((x) => x.date >= from), [para, from]);
  const dates = r.map((x) => x.date);

  const { path, pathP, x, y, min, max } = useMemo(() => {
    const vals = [...r.map((d) => d.close), ...p.map((d) => d.close), ...r.map((d) => d.low), ...p.map((d) => d.low), 0, minBalance];
    let mn = Math.min(...vals);
    let mx = Math.max(...vals);
    if (mx - mn < 1) mx = mn + 1;
    const pad = (mx - mn) * 0.08;
    mn -= pad;
    mx += pad;
    const n = Math.max(1, r.length - 1);
    const xf = (i: number) => PAD.l + (i / n) * (W - PAD.l - PAD.r);
    const yf = (v: number) => PAD.t + (1 - (v - mn) / (mx - mn)) * (H - PAD.t - PAD.b);
    // 계단식 경로: 같은 날 지출이 먼저 빠지는 최저점을 보여준다
    const build = (pts: DayPoint[]) =>
      pts
        .map((d, i) => {
          const xx = xf(i);
          const seg = `${i === 0 ? 'M' : 'L'}${xx.toFixed(1)},${yf(d.open).toFixed(1)}`;
          return d.low !== d.open || d.close !== d.open ? `${seg} L${xx.toFixed(1)},${yf(d.low).toFixed(1)} L${xx.toFixed(1)},${yf(d.close).toFixed(1)}` : seg;
        })
        .join(' ');
    return { path: build(r), pathP: p.length ? build(p) : '', x: xf, y: yf, min: mn, max: mx };
  }, [r, p, minBalance]);

  const ci = Math.max(0, dates.indexOf(cursor));
  const essentialIdx = r.map((d, i) => (d.flows.some((f) => f.essential) ? i : -1)).filter((i) => i >= 0);
  const forkIdx = forkDate ? dates.indexOf(forkDate) : -1;
  if (!r.length) return null;

  return (
    <div>
      <svg className="fork-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${realLabel}과 ${paraLabel}의 날짜별 예상 잔고 그래프`}>
        {0 > min && 0 < max && <line className="zero" x1={PAD.l} x2={W - PAD.r} y1={y(0)} y2={y(0)} />}
        {minBalance > 0 && minBalance > min && minBalance < max && <line className="minline" x1={PAD.l} x2={W - PAD.r} y1={y(minBalance)} y2={y(minBalance)} />}
        {essentialIdx.map((i) => (
          <rect key={i} x={x(i) - 1} y={H - PAD.b + 4} width={2} height={6} fill="#b8c0ca" />
        ))}
        {forkIdx >= 0 && <circle cx={x(forkIdx)} cy={y(r[forkIdx].open)} r={4.5} fill="#fff" stroke="var(--ink)" strokeWidth={1.6} />}
        <path key={`r${animKey}`} className="real-line draw" d={path} style={{ ['--len' as string]: 2400 }} />
        {pathP && <path key={`p${animKey}`} className="para-line fade-in" d={pathP} />}
        <line className="cursor" x1={x(ci)} x2={x(ci)} y1={PAD.t - 6} y2={H - PAD.b} />
        <circle cx={x(ci)} cy={y(r[ci].close)} r={5} fill="var(--real)" stroke="#fff" strokeWidth={2} />
        {p[ci] && <rect x={x(ci) - 5} y={y(p[ci].close) - 5} width={10} height={10} transform={`rotate(45 ${x(ci)} ${y(p[ci].close)})`} fill="var(--para)" stroke="#fff" strokeWidth={2} />}
        <text x={PAD.l} y={H - 6}>{formatShort(dates[0])}</text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end">{formatShort(dates[dates.length - 1])}</text>
        <text x={W - PAD.r} y={PAD.t - 4} textAnchor="end">{wonShort(max)}</text>
      </svg>
      <label className="sr-only" htmlFor="fork-range">날짜 선택</label>
      <input
        id="fork-range"
        className="range"
        type="range"
        min={0}
        max={dates.length - 1}
        value={ci}
        onChange={(e) => onCursor(dates[Number(e.target.value)])}
        aria-valuetext={formatShort(dates[ci])}
      />
      <div className="legend">
        <span><i />● {realLabel}</span>
        {pathP && <span><i className="para" />◇ {paraLabel}</span>}
        {minBalance > 0 && <span><i className="min" />지켜둘 금액</span>}
        <span><i className="zero" />0원</span>
      </div>
    </div>
  );
}
