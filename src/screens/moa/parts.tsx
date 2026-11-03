import { useMemo, useState, type ReactNode } from 'react';
import { formatKDateTime, parseISO, type ISODate } from '../../../shared/dates';
import { IconChevron } from '../../components/Icons';
import { Sheet } from '../../components/ui';
import { GRADE_LABEL, paymentSentence, triggerLabel, type AlertLog, type DayBalance, type Grade, type PaymentCheck, type RiskReport, type ScenarioKey } from '../../lib/moa';
import { useNav } from '../../state/nav';
import { useMoa } from '../../state/moa';

export const fmt = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
export const md = (iso: ISODate) => `${parseISO(iso).m}/${parseISO(iso).d}`;

export function GradeBadge({ grade }: { grade: Grade }) {
  return <span className={`mo-grade g-${grade}`}>{GRADE_LABEL[grade]}</span>;
}

/** AI가 만든 문장·분류 표시 (AI 기본법 사용 사실 고지) */
export function AiLabel({ children = 'AI가 분석한 내용' }: { children?: ReactNode }) {
  return <span className="mo-ai-label">{children}</span>;
}

/* ───────── 잔고 그래프 ───────── */

const LINE_STYLE: Record<ScenarioKey, { dash?: string; cls: string; label: string }> = {
  registered: { cls: 'reg', dash: '2 4', label: '등록 일정만' },
  base: { cls: 'base', label: '기본' },
  high: { cls: 'high', dash: '6 4', label: '많이 쓰면' },
  delay: { cls: 'delay', dash: '1 5', label: '입금 지연' },
  combo: { cls: 'combo', dash: '8 3 2 3', label: '둘 다' },
};

export function BalanceChart({ series, keys, payments, from, until, height = 180, alt }: {
  series: Record<ScenarioKey, DayBalance[]>;
  keys: ScenarioKey[];
  payments: PaymentCheck[];
  from: ISODate;
  until: ISODate;
  height?: number;
  /** 살까 말까: 비교할 다른 갈래 */
  alt?: { days: DayBalance[]; label: string };
}) {
  const W = 340, H = height, P = { l: 6, r: 6, t: 14, b: 22 };
  const pick = (d: DayBalance[]) => d.filter((x) => x.date >= from && x.date <= until);
  const lines = keys.map((k) => ({ k, days: pick(series[k]) })).filter((l) => l.days.length);
  const altDays = alt ? pick(alt.days) : [];
  const all = [...lines.flatMap((l) => l.days), ...altDays];
  if (!all.length) return null;
  const n = Math.max(...lines.map((l) => l.days.length), altDays.length);
  const lo = Math.min(0, ...all.map((d) => d.low));
  const hi = Math.max(1, ...all.map((d) => Math.max(d.low, d.close)));
  const x = (i: number) => P.l + (i / Math.max(1, n - 1)) * (W - P.l - P.r);
  const y = (v: number) => P.t + (1 - (v - lo) / (hi - lo || 1)) * (H - P.t - P.b);
  const path = (days: DayBalance[]) => days.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.low).toFixed(1)}`).join(' ');
  const dates = (lines[0]?.days ?? altDays).map((d) => d.date);
  const idx = (iso: ISODate) => dates.indexOf(iso);
  return (
    <figure className="mo-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`결제계좌 일별 잔고 ${md(from)}~${md(until)}`}>
        <line x1={P.l} x2={W - P.r} y1={y(0)} y2={y(0)} className="zero" />
        <text x={W - P.r} y={y(0) - 4} className="zero-t" textAnchor="end">0원</text>
        {payments.filter((p) => idx(p.date) >= 0).map((p) => (
          <g key={p.key}>
            <line x1={x(idx(p.date))} x2={x(idx(p.date))} y1={P.t} y2={H - P.b} className={`pay g-${p.grade}`} />
            <text x={x(idx(p.date))} y={H - 6} textAnchor={x(idx(p.date)) > W - 24 ? 'end' : x(idx(p.date)) < 24 ? 'start' : 'middle'} className="pay-t">{md(p.date)}</text>
          </g>
        ))}
        {altDays.length > 0 && <path d={path(altDays)} className="ln alt" />}
        {lines.map((l) => <path key={l.k} d={path(l.days)} className={`ln ${LINE_STYLE[l.k].cls}`} strokeDasharray={LINE_STYLE[l.k].dash} />)}
      </svg>
      <figcaption>
        {lines.map((l) => <span key={l.k}><i className={LINE_STYLE[l.k].cls} />{LINE_STYLE[l.k].label}</span>)}
        {alt && altDays.length > 0 && <span><i className="alt" />{alt.label}</span>}
      </figcaption>
    </figure>
  );
}

/* ───────── 홈 카드 ───────── */

export function ShortfallCard() {
  const nav = useNav();
  const { moa, report } = useMoa();
  const [alerts, setAlerts] = useState(false);
  const unread = moa.alerts.filter((a) => !a.read).length;
  const w = report.worst;
  const steps = useMemo(() => [
    { done: !!moa.anchor, label: '잔액' },
    { done: moa.schedule.some((s) => s.direction === 'out'), label: '필수결제' },
    { done: moa.cards.some((c) => c.kind === 'credit' && c.payDay), label: '카드 결제일' },
    { done: moa.schedule.some((s) => s.direction === 'in'), label: '입금 일정' },
    { done: moa.txns.length > 0, label: '결제 문자' },
  ], [moa]);
  const scope = moa.cards.some((c) => c.kind === 'credit' && c.payDay) ? '카드값까지 계산해요' : '등록한 일정으로 계산해요';

  if (!report.hasAnchor) {
    return (
      <section className="t-card mo-home">
        <span className="t-label">다가오는 필수결제</span>
        <p className="mo-home-title">결제계좌 잔액부터 알려주세요</p>
        <button className="t-btn primary" onClick={() => nav.push({ name: 'moaSetup' })}>1분 설정하기</button>
      </section>
    );
  }
  const s = w ? paymentSentence(w, report.delayDays) : null;
  return (
    <section className={`t-card mo-home ${w ? `g-${w.grade}` : 'g-ok'}`}>
      <div className="mo-home-top">
        <span className="t-label">앞으로 14일 필수결제</span>
        <button className="mo-bell" onClick={() => setAlerts(true)} aria-label={`알림 ${unread}개`}>알림{unread > 0 && <b>{unread}</b>}</button>
      </div>
      <button className="mo-home-main" onClick={() => nav.push({ name: 'shortfall' })}>
        {w ? <GradeBadge grade={w.grade} /> : <span className="mo-grade g-ok">결제 일정 없음</span>}
        <strong>{s ? s.title : '14일 안에 등록된 필수결제가 없어요'}</strong>
        <small>{s ? s.body : '월세·카드값처럼 꼭 나가는 돈을 등록하면 결제일 잔고를 미리 봐드려요.'}</small>
        <em>근거 보기 <IconChevron /></em>
      </button>
      {report.stale && <p className="mo-warn">잔액을 확인한 지 {report.staleDays}일 지났어요. 지금 잔액을 한 번 알려주세요.</p>}
      {report.gap && <p className="mo-warn">계산한 잔액과 문자 속 잔액이 달라요. 빠진 기록이 있는지 확인해 주세요.</p>}
      <div className="mo-steps" aria-label="예측 범위">
        {steps.map((st) => <span key={st.label} className={st.done ? 'on' : ''}>{st.label}</span>)}
      </div>
      <p className="mo-scope">{scope} · {report.forecast.ready.message}</p>
      {alerts && <AlertsSheet list={moa.alerts} onClose={() => setAlerts(false)} />}
    </section>
  );
}

export function AlertsSheet({ list, onClose }: { list: AlertLog[]; onClose: () => void }) {
  const { set } = useMoa();
  const close = () => { set((m) => ({ ...m, alerts: m.alerts.map((a) => ({ ...a, read: true })) })); onClose(); };
  const canAsk = typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'default';
  return (
    <Sheet title="알림" onClose={close}>
      {canAsk && <button className="mo-link" onClick={() => void Notification.requestPermission()}>브라우저 알림 받기</button>}
      {!list.length && <p className="t-empty">아직 보낸 알림이 없어요. 결제일 7일·3일 전, 위험이 커지면 알려드려요.</p>}
      <ul className="mo-alerts">
        {[...list].reverse().map((a, i) => (
          <li key={i} className={a.read ? '' : 'new'}>
            <small>{formatKDateTime(a.at)} · {triggerLabel[a.trigger]}</small>
            <p>{a.text}</p>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

/* ───────── 상담 기관 안내 ───────── */

/** 위험이 반복되면 대출 대신 채무조정·상담 기관을 안내한다 (운영 원칙: 대출을 팔지 않는다) */
export function HelpCard({ report }: { report: RiskReport }) {
  const bad = report.payments.filter((p) => p.grade === 'registered' || p.grade === 'high').length;
  const recentAlerts = useMoa().moa.alerts.filter((a) => (a.grade === 'registered' || a.grade === 'high') && report.nowMs - a.at < 30 * 86400000).length;
  if (bad < 2 && recentAlerts < 3) return null;
  return (
    <section className="t-card mo-help">
      <h2>혼자 고민하지 않아도 돼요</h2>
      <p>결제일에 돈이 모자라는 일이 반복되고 있어요. 대출보다 먼저, 무료로 상담받을 수 있는 곳이 있어요.</p>
      <ul>
        <li><b>서민금융진흥원 서민금융콜센터</b><span>국번 없이 1397 · 청년 맞춤 상담</span></li>
        <li><b>신용회복위원회</b><span>1600-5500 · 연체 전이거나 30일 이하도 신속채무조정 신청 가능</span></li>
      </ul>
      <p className="mo-fine">모아는 대출 상품을 권하지 않아요.</p>
    </section>
  );
}

export function SavingsLinkCard({ saved }: { saved: number }) {
  if (saved <= 0) return null;
  return (
    <section className="t-card mo-save">
      <h2>참은 돈 {fmt(saved)}</h2>
      <p>실제로 옮기고 싶다면 직접 저축하세요. 만 19~34세라면 정부 기여금이 붙는 청년미래적금도 있어요. 모아는 돈을 옮기지 않아요.</p>
    </section>
  );
}
