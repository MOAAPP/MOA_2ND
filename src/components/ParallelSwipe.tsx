import { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { won } from '../../shared/format';
import { koreanDayLabel, type WorldHistoryPoint } from '../lib/worldHistory';

/**
 * 평행세계 스와이프 차트
 * 손가락으로 누른 채 좌우로 밀면 그날의 두 세계가 바로 따라온다.
 * - 점은 손가락을 부드럽게 따라옴(관성 보간), 숫자는 굴러가듯 바뀜
 * - 손가락 오른쪽(미래)은 흐리게, 왼쪽(지나온 길)은 선명하게
 * - 선택이 있던 날을 지나가면 짧은 진동 + 그날 고른 것 이름이 떠오름
 * - 손을 떼도 그날에 머묾('오늘로' 버튼이나 그래프 두 번 탭으로 돌아감)
 * - 기간을 바꾸면 선이 끊기지 않고 모양만 바뀜(모핑)
 */

const N = 72; // 모핑용 샘플 수
const W = 343, H = 196, PT = 22, PB = 22;

const money = (n: number) => `${n < 0 ? '−' : ''}${won(Math.abs(Math.round(n)))}`;
const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const reduced = () => document.documentElement.classList.contains('reduce-motion') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** 날짜 데이터를 N개 샘플로 펴기(선형 보간) */
function resample(points: WorldHistoryPoint[]) {
  const a: number[] = [], b: number[] = [];
  const n = points.length;
  for (let k = 0; k < N; k++) {
    const f = (k / (N - 1)) * (n - 1), i = Math.floor(f), t = f - i;
    const p = points[i], q = points[Math.min(n - 1, i + 1)];
    a.push(p.actual + (q.actual - p.actual) * t);
    b.push(p.alternative + (q.alternative - p.alternative) * t);
  }
  return { a, b };
}

/** 부드러운 곡선(Monotone) */
function curve(xs: number[], ys: number[], move = true) {
  const n = xs.length;
  const m: number[] = [], t: number[] = new Array(n).fill(0);
  for (let i = 0; i < n - 1; i++) m[i] = (ys[i + 1] - ys[i]) / (xs[i + 1] - xs[i] || 1);
  t[0] = m[0]; t[n - 1] = m[n - 2];
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2;
  let d = `${move ? 'M' : 'L'}${xs[0].toFixed(1)} ${ys[0].toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (xs[i + 1] - xs[i]) / 3;
    d += `C${(xs[i] + h).toFixed(1)} ${(ys[i] + t[i] * h).toFixed(1)} ${(xs[i + 1] - h).toFixed(1)} ${(ys[i + 1] - t[i + 1] * h).toFixed(1)} ${xs[i + 1].toFixed(1)} ${ys[i + 1].toFixed(1)}`;
  }
  return d;
}

/** 숫자가 굴러가듯 바뀌는 값 */
function useRolling(target: number, ms = 320) {
  const [v, setV] = useState(target);
  const from = useRef(target), start = useRef(0), raf = useRef(0), cur = useRef(target);
  useEffect(() => {
    if (reduced()) { cur.current = target; setV(target); return; }
    from.current = cur.current; start.current = performance.now();
    cancelAnimationFrame(raf.current);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start.current) / ms);
      cur.current = from.current + (target - from.current) * ease(t);
      setV(cur.current);
      if (t < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);
  return v;
}

export type SwipeHandle = { focusDay: (iso: string) => void };

export const ParallelSwipe = forwardRef<SwipeHandle, { points: WorldHistoryPoint[] }>(function ParallelSwipe({ points }, ref) {
  const n = points.length;
  const svgRef = useRef<SVGSVGElement>(null);

  // ── 모핑: 기간이 바뀌면 이전 모양에서 새 모양으로 ──
  const target = useMemo(() => resample(points), [points]);
  const [shape, setShape] = useState(target);
  const shapeRef = useRef(target);
  useEffect(() => {
    const from = shapeRef.current;
    if (reduced()) { shapeRef.current = target; setShape(target); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (now: number) => {
      const t = ease(Math.min(1, (now - t0) / 520));
      const s = { a: target.a.map((v, i) => from.a[i] + (v - from.a[i]) * t), b: target.b.map((v, i) => from.b[i] + (v - from.b[i]) * t) };
      shapeRef.current = s; setShape(s);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target]);

  // 축 범위도 부드럽게
  const lo = Math.min(...shape.a, ...shape.b), hi = Math.max(...shape.a, ...shape.b);
  const span = Math.max(20000, hi - lo), pad = span * 0.12;
  const y = (v: number) => PT + ((hi + pad - v) / (span + pad * 2)) * (H - PT - PB);
  const xs = useMemo(() => Array.from({ length: N }, (_, k) => (k / (N - 1)) * W), []);
  const ya = shape.a.map(y), yb = shape.b.map(y);
  const actD = curve(xs, ya), altD = curve(xs, yb);
  const gapD = `${actD}${curve([...xs].reverse(), [...yb].reverse(), false)}Z`;

  // ── 손가락 위치(0~1). 표시용 pos는 target을 관성으로 따라감 ──
  const [active, setActive] = useState(false);
  const goal = useRef(1);
  const [pos, setPos] = useState(1);
  const posRef = useRef(1);
  const raf = useRef(0);
  const run = useCallback(() => {
    cancelAnimationFrame(raf.current);
    const step = () => {
      const d = goal.current - posRef.current;
      posRef.current = Math.abs(d) < 0.0008 || reduced() ? goal.current : posRef.current + d * 0.28;
      setPos(posRef.current);
      if (posRef.current !== goal.current) raf.current = requestAnimationFrame(step);
    };
    raf.current = requestAnimationFrame(step);
  }, []);
  useEffect(() => () => cancelAnimationFrame(raf.current), []);
  useEffect(() => { goal.current = 1; run(); }, [n, run]);

  const idx = Math.round(pos * (n - 1));
  const p = points[Math.min(n - 1, Math.max(0, idx))];
  const lastIdx = useRef(idx);
  const [flash, setFlash] = useState<string | null>(null);
  useEffect(() => {
    if (idx === lastIdx.current) return;
    lastIdx.current = idx;
    const ev = p.events.find((e) => e.kind === 'consumption') ?? p.events[0];
    if (ev) { if (active) navigator.vibrate?.(8); setFlash(ev.title); }
    else setFlash(null);
  }, [idx, active, p]);

  const toPos = (clientX: number) => {
    const r = svgRef.current!.getBoundingClientRect();
    return Math.min(1, Math.max(0, (clientX - r.left) / r.width));
  };
  const startX = useRef(0), startY = useRef(0), dragging = useRef(false);
  const onDown = (e: React.PointerEvent) => {
    startX.current = e.clientX; startY.current = e.clientY; dragging.current = e.pointerType === 'mouse';
    if (dragging.current) { setActive(true); goal.current = toPos(e.clientX); run(); }
    (e.currentTarget as Element).setPointerCapture?.(e.pointerId);
  };
  const onMove = (e: React.PointerEvent) => {
    if (!e.buttons && e.pointerType === 'mouse') return;
    if (!dragging.current) {
      // 터치는 가로로 먼저 움직였을 때만 스크럽(세로 스크롤은 그대로)
      const dx = Math.abs(e.clientX - startX.current), dy = Math.abs(e.clientY - startY.current);
      if (dx > 6 && dx > dy) { dragging.current = true; setActive(true); }
      else return;
    }
    goal.current = toPos(e.clientX); run();
  };
  const onUp = (e: React.PointerEvent) => {
    if (!dragging.current && e.pointerType !== 'mouse') {
      // 가볍게 탭: 그 날짜로 이동했다가 잠시 머무름
      goal.current = toPos(e.clientX); run();
      return;
    }
    dragging.current = false;
    setActive(false);
  };
  const backToToday = () => { setFlash(null); goal.current = 1; run(); };

  useImperativeHandle(ref, () => ({
    focusDay: (iso: string) => {
      const i = points.findIndex((q) => q.date === iso);
      if (i < 0) return;
      goal.current = i / Math.max(1, n - 1); run();
      const ev = points[i].events.find((e) => e.kind === 'consumption') ?? points[i].events[0];
      setFlash(ev ? ev.title : null);
    },
  }), [points, n, run]);

  // 점 좌표(샘플 사이 보간으로 끊김 없이)
  const f = pos * (N - 1), k = Math.min(N - 2, Math.floor(f)), tt = f - k;
  const dotX = pos * W;
  const dotA = ya[k] + (ya[k + 1] - ya[k]) * tt;
  const dotB = yb[k] + (yb[k + 1] - yb[k]) * tt;

  const gap = useRolling(p.gap);
  const vA = useRolling(p.actual);
  const vB = useRolling(p.alternative);
  const isToday = idx === n - 1;
  const away = goal.current < 1 && !isToday;

  return (
    <div className={`ps ${active ? 'is-active' : ''}`}>
      <div className="ps-head">
        <span className="ps-date">{isToday && !active ? '지금' : koreanDayLabel(p.date)}{flash && <em className="ps-flash" key={flash}>{flash}</em>}
          {away && !active && <button type="button" className="ps-today" onClick={backToToday}>오늘로 ↺</button>}</span>
        <strong className={`ps-num num ${gap < 0 ? 'neg' : ''}`}>{Math.round(gap) > 0 ? '+' : ''}{money(gap)}</strong>
        <span className="ps-cap">다르게 선택해서 지킨 돈</span>
      </div>

      <svg
        ref={svgRef}
        className="ps-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={`${koreanDayLabel(p.date)} 내 세계 ${money(p.actual)}, 정가로 다 산 세계 ${money(p.alternative)}. 좌우로 밀어 날짜를 바꿀 수 있어요.`}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onUp}
        onPointerCancel={() => { dragging.current = false; setActive(false); }}
        onDoubleClick={backToToday}
      >
        <defs>
          <linearGradient id="psGap" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#3182F6" stopOpacity=".22" />
            <stop offset="1" stopColor="#3182F6" stopOpacity=".04" />
          </linearGradient>
          <clipPath id="psPast"><rect x="0" y="0" width={Math.max(0, dotX)} height={H} /></clipPath>
        </defs>

        {/* 흐린 전체(미래 쪽) */}
        <g className="ps-dim">
          <path d={gapD} fill="url(#psGap)" />
          <path d={altD} className="ps-alt" />
          <path d={actD} className="ps-act" />
        </g>
        {/* 선명한 지나온 길 */}
        <g clipPath="url(#psPast)">
          <path d={gapD} fill="url(#psGap)" />
          <path d={altD} className="ps-alt" />
          <path d={actD} className="ps-act ps-draw" pathLength={1} />
        </g>

        <line x1={dotX} x2={dotX} y1={0} y2={H - PB + 6} className="ps-guide" />
        <line x1={dotX} x2={dotX} y1={Math.min(dotA, dotB) + 7} y2={Math.max(dotA, dotB) - 7} className="ps-span" />
        <circle cx={dotX} cy={dotB} r="5" className="ps-dot-alt" />
        <circle cx={dotX} cy={dotA} r={active ? 8 : 6.5} className="ps-dot-act" />
        {!active && isToday && <circle cx={dotX} cy={dotA} r="6.5" className="ps-ping" />}

        <text x="0" y={H - 4} className="ps-axis">{koreanDayLabel(points[0].date)}</text>
        <text x={W} y={H - 4} textAnchor="end" className="ps-axis">오늘</text>
      </svg>

      <div className="ps-legend">
        <div><i className="l-act" /><span>내 세계</span><b className="num">{money(vA)}</b></div>
        <div><i className="l-alt" /><span>정가로 다 샀다면</span><b className="num">{money(vB)}</b></div>
      </div>
    </div>
  );
});
