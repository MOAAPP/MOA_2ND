import { formatKDateTime, formatShort } from '../../shared/dates';
import { signedPct, signedWon, won } from '../../shared/format';
import type { Quote } from '../../shared/market';

export function changeClass(n: number | null) {
  return n === null || n === 0 ? '' : n > 0 ? 'up' : 'down';
}

export function ChangeText({ q }: { q: Quote }) {
  if (q.change === null || q.changePct === null) return <span className="muted small">전 거래일 비교 불가</span>;
  return (
    <span className={`num small ${changeClass(q.change)}`} style={{ fontWeight: 600 }}>
      {q.change > 0 ? '▲' : q.change < 0 ? '▼' : ''} {signedWon(q.change)} ({signedPct(q.changePct)})
    </span>
  );
}

export function SourceBadge({ q }: { q: Quote }) {
  return <LiveBadge source={q.source} live={q.live} />;
}

/** 시세 출처 배지: 실시간 체결(KIS 웹소켓)·준실시간(몇 초마다 갱신)·지연·예시를 구분 */
export function LiveBadge({ source, live, streaming }: { source: Quote['source']; live?: boolean; streaming?: boolean }) {
  const cls = source === 'demo' ? 'demo' : source === 'yahoo' ? 'delayed' : '';
  const label = source === 'yahoo' ? '20분 지연' : source === 'demo' ? '예시 시세' : live || streaming ? '실시간' : '시세';
  return (
    <span className={`live-badge ${cls}`}>
      <span className="dot" aria-hidden />
      {label}
    </span>
  );
}

export function QuoteMeta({ q }: { q: Quote }) {
  return (
    <span className="xs muted">
      {formatKDateTime(q.time)} 기준
      {q.prevCloseDate ? ` · ${formatShort(q.prevCloseDate)} 종가와 비교` : ''}
    </span>
  );
}

export function PriceText({ v }: { v: number }) {
  return <span className="num">{won(v)}</span>;
}

export function Spark({ q }: { q: Quote }) {
  const c = q.candles.slice(-30);
  if (c.length < 2) return <div className="small muted" style={{ padding: 20, textAlign: 'center' }}>그래프를 그릴 데이터가 부족해요.</div>;
  const W = 340, H = 120, P = 6;
  const vals = c.map((x) => x.close);
  const mn = Math.min(...vals), mx = Math.max(...vals);
  const x = (i: number) => P + (i / (c.length - 1)) * (W - 2 * P);
  const y = (v: number) => P + (1 - (v - mn) / (mx - mn || 1)) * (H - 2 * P - 14);
  const d = vals.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const up = vals[vals.length - 1] >= vals[0];
  return (
    <svg className="spark" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`최근 ${c.length}거래일 종가 흐름`}>
      <path d={d} fill="none" stroke={up ? 'var(--up)' : 'var(--down)'} strokeWidth={2.2} strokeLinejoin="round" />
      <text x={P} y={H - 2} fontSize="11" fill="var(--ink-3)">{formatShort(c[0].date)}</text>
      <text x={W - P} y={H - 2} fontSize="11" fill="var(--ink-3)" textAnchor="end">{formatShort(c[c.length - 1].date)} · 일봉 종가</text>
    </svg>
  );
}
