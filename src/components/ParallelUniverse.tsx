import { useMemo, useRef } from 'react';
import { won } from '../../shared/format';
import type { WorldHistoryPoint } from '../lib/worldHistory';

/**
 * 평행세계 그래프 v15.1
 * 효과보다 '왜 갈라졌는지'가 보이게.
 * - 내 세계: 파란 실선 / 정가로 다 산 세계: 회색 실선
 * - 두 선 사이: 지킨 돈만큼 옅은 파랑 면
 * - 차이를 만든 소비(공연 예매 +5.9만 등)를 그래프 위에 바로 적는다
 * - 선 끝에 이름표를 달아 범례 없이 읽히게
 * - 데이터가 날짜 단위 계단형이라 계단선으로 정직하게 그린다
 */

const money = (n: number) => `${n < 0 ? '−' : ''}${won(Math.abs(Math.round(n)))}`;
const man = (n: number) => {
  const v = Math.abs(n) / 10000;
  const s = v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10);
  return `${s}만`;
};
const fmtDate = (iso: string) => `${Number(iso.slice(5, 7))}.${Number(iso.slice(8, 10))}`;

/** 계단선: 날짜가 바뀌는 지점에서 꺾이고, 모서리는 살짝 둥글게 */
function stepPath(pts: { x: number; y: number }[], r = 4) {
  if (!pts.length) return '';
  let d = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    if (Math.abs(b.y - a.y) < 0.5) { d += ` H${b.x.toFixed(1)}`; continue; }
    const mx = (a.x + b.x) / 2;
    const dy = Math.sign(b.y - a.y);
    const rr = Math.min(r, Math.abs(b.y - a.y) / 2, (b.x - a.x) / 2);
    d += ` H${(mx - rr).toFixed(1)} Q${mx.toFixed(1)} ${a.y.toFixed(1)} ${mx.toFixed(1)} ${(a.y + dy * rr).toFixed(1)}`;
    d += ` V${(b.y - dy * rr).toFixed(1)} Q${mx.toFixed(1)} ${b.y.toFixed(1)} ${(mx + rr).toFixed(1)} ${b.y.toFixed(1)} H${b.x.toFixed(1)}`;
  }
  return d;
}

export function ParallelUniverse({ points, selected, onPick, height = 250 }: {
  points: WorldHistoryPoint[];
  selected: number;
  onPick: (i: number) => void;
  height?: number;
}) {
  const ref = useRef<SVGSVGElement>(null);
  const W = 343, H = height, L = 4, R = 4, T = 44, B = 28;
  const n = points.length;

  const g = useMemo(() => {
    const ys = points.flatMap((p) => [p.actual, p.alternative]);
    let lo = Math.min(...ys), hi = Math.max(...ys);
    if (hi - lo < 20000) { const c = (hi + lo) / 2; lo = c - 10000; hi = c + 10000; }
    const pad = (hi - lo) * 0.1; lo -= pad; hi += pad;
    const x = (i: number) => L + (i / Math.max(1, n - 1)) * (W - L - R);
    const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
    const act = points.map((p, i) => ({ x: x(i), y: y(p.actual) }));
    const alt = points.map((p, i) => ({ x: x(i), y: y(p.alternative) }));
    const actD = stepPath(act), altD = stepPath(alt);
    // 면: 내 선 → 반대로 정가 선
    const back = stepPath([...alt].reverse()).replace(/^M/, 'L');
    const area = `${actD} ${back} Z`;

    // 차이를 만든 소비를 큰 것부터 최대 3개, 서로 겹치지 않게
    const marks: { i: number; title: string; diff: number }[] = [];
    points.forEach((p, i) => p.events.forEach((e) => { if (e.kind === 'consumption' && e.difference > 0) marks.push({ i, title: e.title, diff: e.difference }); }));
    marks.sort((a, b) => b.diff - a.diff);
    const notes: typeof marks = [];
    for (const m of marks) {
      if (notes.length >= 3) break;
      if (notes.some((o) => Math.abs(x(o.i) - x(m.i)) < 58)) continue;
      notes.push(m);
    }
    notes.sort((a, b) => a.i - b.i);
    const zero = lo < 0 && hi > 0 ? y(0) : null;
    return { x, y, act, alt, actD, altD, area, notes, zero };
  }, [points, n, H]);

  const sel = Math.min(Math.max(0, selected), n - 1);
  const p = points[sel];
  const sx = g.x(sel);
  const last = n - 1;
  const endA = g.act[last], endB = g.alt[last];
  // 끝 이름표: 위아래로 충분히 떨어뜨리기
  const aTop = endA.y <= endB.y;
  const la = aTop ? endA.y - 10 : endA.y + 18;
  const lb = aTop ? endB.y + 18 : endB.y - 10;

  const pick = (clientX: number) => {
    const el = ref.current; if (!el) return;
    const r = el.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    onPick(Math.min(n - 1, Math.max(0, Math.round(((px - L) / (W - L - R)) * (n - 1)))));
  };
  const showTip = sel !== last;

  return (
    <div className="pc">
      <svg
        ref={ref}
        className="pc-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${fmtDate(p.date)} 기준 내가 선택한 세계 ${money(p.actual)}, 모두 정가로 산 세계 ${money(p.alternative)}, 차이 ${money(p.gap)}`}
        onPointerDown={(e) => { (e.currentTarget as Element).setPointerCapture?.(e.pointerId); pick(e.clientX); }}
        onPointerMove={(e) => { if (e.buttons) pick(e.clientX); }}
      >
        {/* 0원 기준선 */}
        {g.zero !== null && <g>
          <line x1={L} x2={W - R} y1={g.zero} y2={g.zero} className="pc-zero" />
          <text x={L} y={g.zero - 5} className="pc-axis">0원</text>
        </g>}

        {/* 지킨 돈 */}
        <path d={g.area} className="pc-area" />

        {/* 두 세계 */}
        <path d={g.altD} className="pc-alt" />
        <path d={g.actD} className="pc-act" />

        {/* 차이를 만든 소비 */}
        {g.notes.map((m, k) => {
          const px = g.x(m.i), py = g.act[m.i].y;
          const ty = Math.max(14, Math.min(py, g.alt[m.i].y) - 22 - (k % 2) * 16);
          const anchor = px < 50 ? 'start' : px > W - 50 ? 'end' : 'middle';
          return <g key={m.i} className="pc-note">
            <line x1={px} x2={px} y1={ty + 5} y2={py - 5} />
            <circle cx={px} cy={py} r="3.5" />
            <text x={px} y={ty} textAnchor={anchor}><tspan className="pc-note-t">{m.title}</tspan><tspan dx="4" className="pc-note-v">+{man(m.diff)}</tspan></text>
          </g>;
        })}

        {/* 선 끝 이름표 */}
        {!showTip && <>
          <circle cx={endB.x} cy={endB.y} r="4" className="pc-dot-alt" />
          <circle cx={endA.x} cy={endA.y} r="5" className="pc-dot-act" />
          <text x={endA.x} y={la} textAnchor="end" className="pc-end act">내 선택</text>
          <text x={endB.x} y={lb} textAnchor="end" className="pc-end alt">정가로 다 샀다면</text>
        </>}

        {/* 선택한 날 */}
        {showTip && <g>
          <line x1={sx} x2={sx} y1={T - 8} y2={H - B} className="pc-cursor" />
          <circle cx={sx} cy={g.alt[sel].y} r="4" className="pc-dot-alt" />
          <circle cx={sx} cy={g.act[sel].y} r="5" className="pc-dot-act" />
        </g>}

        {/* 날짜 */}
        <text x={L} y={H - 8} className="pc-axis">{fmtDate(points[0].date)}</text>
        <text x={W - R} y={H - 8} textAnchor="end" className="pc-axis">{sel === last ? '오늘' : fmtDate(points[last].date)}</text>
      </svg>
    </div>
  );
}

/** 홈 미리보기용 작은 두 갈래 그림 */
export function ParallelMini({ width = 92, height = 48 }: { width?: number; height?: number }) {
  return (
    <svg width={width} height={height} viewBox="0 0 92 48" aria-hidden="true" className="pc-mini">
      <path d="M2 30 H30 Q34 30 34 26 V18 Q34 14 38 14 H60 Q64 14 64 10 V8 Q64 4 68 4 H90 V44 H68 Q64 44 64 40 V40 Q64 36 60 36 H38 Q34 36 34 34 V34 Q34 30 30 30 Z" fill="#E8F3FF" />
      <path d="M2 30 H30 Q34 30 34 33 V34 Q34 36 38 36 H60 Q64 36 64 40 Q64 44 68 44 H90" fill="none" stroke="#C9D0D8" strokeWidth="2" strokeLinejoin="round" />
      <path d="M2 30 H30 Q34 30 34 26 V18 Q34 14 38 14 H60 Q64 14 64 10 V8 Q64 4 68 4 H90" fill="none" stroke="#3182F6" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
      <circle cx="90" cy="4" r="0" />
    </svg>
  );
}
