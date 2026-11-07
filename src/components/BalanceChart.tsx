import { useId, useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { parseISO } from '../../shared/dates';
import type { HomeDay } from '../lib/stage3Api';

const W = 340;
const H = 148;
const PAD = { l: 6, r: 6, t: 14, b: 22 };
const WEEK = ['일', '월', '화', '수', '목', '금', '토'];

const signed = (n: number) => `${n < 0 ? '−' : n > 0 ? '+' : ''}${Math.abs(Math.round(n)).toLocaleString('ko-KR')}원`;
const plain = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('ko-KR')}원`;
const md = (iso: string) => { const d = parseISO(iso); return `${d.m}월 ${d.d}일`; };
const weekday = (iso: string) => WEEK[new Date(`${iso}T00:00:00+09:00`).getDay()];

function eventTag(kind: string, status: string, amount: number) {
  if (status === 'predicted') return '예상 생활비';
  if (amount > 0) return '입금 예정';
  if (kind === 'credit_card_bill') return '카드대금';
  return '필수 결제';
}

/**
 * 14-day payment-account path. Two series from two API responses:
 *  - solid  = 예정 결제 + 예상 생활비 (/users/{id}/home daily_cashflow)
 *  - dashed = 예정 결제·입금만 (/users/{id}/cashflow)
 * The chart only plots API values; it never derives a balance.
 */
export function BalanceChart({ asOf, start, forecast, schedule }: {
  asOf: string; start: number; forecast: HomeDay[]; schedule: HomeDay[] | null;
}) {
  const id = useId();
  const n = forecast.length;
  const firstEvent = Math.max(0, forecast.findIndex(d => d.events.some(e => e.transaction_status === 'scheduled')));
  const [sel, setSel] = useState(firstEvent);

  const geo = useMemo(() => {
    const a = [start, ...forecast.map(d => d.closing_balance)];
    const b = schedule ? [start, ...schedule.slice(0, n).map(d => d.closing_balance)] : [];
    const all = [...a, ...b, 0, ...forecast.map(d => d.lowest_balance)];
    let lo = Math.min(...all); let hi = Math.max(...all);
    if (hi - lo < 1) { hi += 1; lo -= 1; }
    const span = hi - lo;
    lo -= span * 0.06; hi += span * 0.06;
    const x = (i: number) => PAD.l + (i * (W - PAD.l - PAD.r)) / Math.max(1, a.length - 1);
    const y = (v: number) => PAD.t + ((hi - v) * (H - PAD.t - PAD.b)) / (hi - lo);
    const line = (vals: number[]) => vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(v).toFixed(1)}`).join(' ');
    return { a, b, x, y, zero: y(0), main: line(a), alt: b.length ? line(b) : '' };
  }, [start, forecast, schedule, n]);

  const day = forecast[sel];
  const sday = schedule?.[sel];
  const pick = (i: number) => setSel(Math.max(0, Math.min(n - 1, i)));
  const onPointer = (e: PointerEvent<SVGSVGElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * n) - 1;
    pick(i);
  };
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'ArrowRight') { e.preventDefault(); pick(sel + 1); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); pick(sel - 1); }
    if (e.key === 'Home') { e.preventDefault(); pick(0); }
    if (e.key === 'End') { e.preventDefault(); pick(n - 1); }
  };
  if (!n || !day) return null;
  const cx = geo.x(sel + 1);
  const events = day.events.filter(e => e.transaction_status === 'scheduled');
  const predicted = day.events.filter(e => e.transaction_status === 'predicted').reduce((s, e) => s + e.amount, 0);

  return (
    <div className="v23-chart">
      <div className="v23-chart-legend" aria-hidden="true">
        <span><i className="solid" />예정 결제 + 예상 생활비</span>
        {schedule && <span><i className="dash" />예정 결제만</span>}
      </div>
      <div
        className="v23-chart-frame"
        tabIndex={0}
        role="slider"
        aria-label="앞으로 14일 결제계좌 잔액 전망. 좌우 화살표로 날짜를 옮겨요"
        aria-valuemin={1}
        aria-valuemax={n}
        aria-valuenow={sel + 1}
        aria-valuetext={`${md(day.date)} 예상 잔액 ${plain(day.closing_balance)}`}
        onKeyDown={onKey}
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" onPointerDown={onPointer} onPointerMove={e => e.buttons && onPointer(e)} aria-hidden="true">
          <defs>
            <clipPath id={`${id}-neg`}><rect x="0" y={geo.zero} width={W} height={Math.max(0, H - geo.zero)} /></clipPath>
          </defs>
          <rect className="v23-chart-negzone" x="0" y={geo.zero} width={W} height={Math.max(0, H - PAD.b - geo.zero)} />
          <line className="v23-chart-zero" x1="0" x2={W} y1={geo.zero} y2={geo.zero} />
          <text className="v23-chart-zero-label" x={W - 4} y={geo.zero - 4} textAnchor="end">0원</text>
          {geo.alt && <path className="v23-chart-alt" d={geo.alt} />}
          <path className="v23-chart-main" d={geo.main} pathLength={1} />
          <path className="v23-chart-main is-neg" d={geo.main} clipPath={`url(#${id}-neg)`} />
          {forecast.map((d, i) => d.events.some(e => e.transaction_status === 'scheduled') &&
            <circle key={d.date} className={`v23-chart-ev ${d.events.some(e => e.amount > 0 && e.transaction_status === 'scheduled') ? 'in' : ''}`}
              cx={geo.x(i + 1)} cy={geo.y(d.closing_balance)} r={3.2} />)}
          <line className="v23-chart-cursor" x1={cx} x2={cx} y1={PAD.t - 6} y2={H - PAD.b} />
          <circle className="v23-chart-dot" cx={cx} cy={geo.y(day.closing_balance)} r={5} />
          <text className="v23-chart-axis" x={PAD.l} y={H - 6}>{md(asOf)}</text>
          <text className="v23-chart-axis" x={W - PAD.r} y={H - 6} textAnchor="end">{md(forecast[n - 1].date)}</text>
        </svg>
      </div>
      <div className="v23-chart-detail" aria-live="polite">
        <div className="v23-chart-detail-head">
          <b>{md(day.date)} ({weekday(day.date)})</b>
          <span className={`num ${day.closing_balance < 0 ? 'neg' : ''}`}>{plain(day.closing_balance)}</span>
        </div>
        <ul>
          {events.map(e => <li key={e.id}><span>{e.label}<small>{eventTag(e.kind, e.transaction_status, e.amount)}</small></span><b className={`num ${e.amount > 0 ? 'pos' : ''}`}>{signed(e.amount)}</b></li>)}
          {predicted !== 0 && <li className="muted"><span>예상 생활비<small>최근 요일별 평균 기준 추정</small></span><b className="num">{signed(predicted)}</b></li>}
          {day.lowest_balance < day.closing_balance && <li className="muted"><span>하루 중 가장 낮을 때<small>입금보다 지출이 먼저 나간다고 가정</small></span><b className="num">{plain(day.lowest_balance)}</b></li>}
          {sday && <li className="muted"><span>예정 결제만 반영하면</span><b className="num">{plain(sday.closing_balance)}</b></li>}
        </ul>
      </div>
    </div>
  );
}
