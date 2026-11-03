import { useMemo, useState, type ReactNode } from 'react';
import { formatKDateTime, parseISO, type ISODate } from '../../../shared/dates';
import { IconChevron } from '../../components/Icons';
import { Sheet } from '../../components/ui';
import { GRADE_LABEL, RELIABILITY_LABEL, paymentSentence, type Reliability, triggerLabel, type AlertLog, type DayBalance, type Grade, type PaymentCheck, type RiskReport, type ScenarioKey } from '../../lib/moa';
import { useNav } from '../../state/nav';
import { useMoa } from '../../state/moa';

export const fmt = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
export const md = (iso: ISODate) => `${parseISO(iso).m}/${parseISO(iso).d}`;

export function GradeBadge({ grade }: { grade: Grade }) {
  return <span className={`mo-grade g-${grade}`}>{GRADE_LABEL[grade]}</span>;
}

/** 기록 신뢰도 배지: 위험 등급과 따로, '데이터가 얼마나 믿을 만한가'만 보여준다 */
export function ReliabilityBadge({ value }: { value: Reliability }) {
  return <span className={`mo-rel r-${value.level}`}>기록 신뢰도 · {RELIABILITY_LABEL[value.level]}</span>;
}

export function ReliabilityRow({ value, onFix }: { value: Reliability; onFix?: () => void }) {
  const hint = value.level === 'enough'
    ? '최근 잔액 확인과 기록이 맞아서 이 판단을 믿어도 좋아요.'
    : `${value.reasons.map((r) => r.text).join(', ')}.${value.reasons.some((r) => r.key !== 'missing') ? ' 그래서 등급을 \'주의\'까지만 보여드려요.' : ''}`;
  return (
    <div className={`mo-rel-row r-${value.level}`}>
      <ReliabilityBadge value={value} />
      <p>{hint}</p>
      {onFix && value.level !== 'enough' && <button className="mo-link" onClick={onFix}>지금 잔액 입력하기</button>}
    </div>
  );
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

  // 지금 할 일은 하나만: 기록 신뢰도 문제 → 빠진 설정 순으로
  const todo = useMemo(() => {
    if (report.reliability.level !== 'enough' && report.reliability.reasons.length) return { text: report.reliability.reasons[0].text, cta: '잔액 다시 넣기', go: () => nav.push({ name: 'shortfall' }) };
    if (!moa.schedule.some((x) => x.direction === 'out')) return { text: '월세·통신비 같은 필수결제를 등록하면 결제일을 봐드려요', cta: '등록하기', go: () => nav.push({ name: 'moaSetup' }) };
    if (!moa.cards.some((c) => c.kind === 'credit' && c.payDay)) return { text: '신용카드 결제일을 넣으면 카드값까지 계산해요', cta: '넣기', go: () => nav.push({ name: 'moaSetup' }) };
    if (!moa.schedule.some((x) => x.direction === 'in')) return { text: '월급·알바비 날짜를 넣으면 입금이 늦어질 때도 봐드려요', cta: '넣기', go: () => nav.push({ name: 'moaSetup' }) };
    return null;
  }, [report.reliability, moa, nav]);

  if (!report.hasAnchor) {
    return (
      <section className="t-card mo-home">
        <div className="h-tag-row"><span className="h-tag real">내 결제계좌</span></div>
        <p className="mo-home-title">다음 결제일에 통장에 돈이 충분할지 봐드릴게요</p>
        <small className="mo-home-sub">결제계좌 잔액과 가장 가까운 필수결제 1건만 넣으면 돼요.</small>
        <button className="t-btn primary" onClick={() => nav.push({ name: 'moaSetup' })}>1분 설정하기</button>
      </section>
    );
  }
  const s = w ? paymentSentence(w, report.delayDays) : null;
  return (
    <section className={`t-card mo-home ${w ? `g-${w.grade}` : 'g-ok'}`}>
      <div className="h-tag-row">
        <span className="h-tag real">내 결제계좌 · 앞으로 14일</span>
        <button className="mo-bell" onClick={() => setAlerts(true)} aria-label={`알림 ${unread}개`}>알림{unread > 0 && <b>{unread}</b>}</button>
      </div>
      {w ? <GradeBadge grade={w.grade} /> : <span className="mo-grade g-ok">결제 일정 없음</span>}
      <strong className="mo-home-title">{s ? s.title : '14일 안에 등록된 필수결제가 없어요'}</strong>
      {s && <small className="mo-home-sub">{s.body}</small>}
      <div className="mo-home-actions">
        <button className="t-btn primary" onClick={() => nav.push({ name: 'shortfall' })}>결제일 자세히 보기</button>
        <button className="t-btn" onClick={() => nav.push({ name: 'choose' })}>이거 사도 될까?</button>
      </div>
      {todo && (
        <div className="mo-todo">
          <span>{todo.text}</span>
          <button className="mo-link" onClick={todo.go}>{todo.cta}</button>
        </div>
      )}
      <p className="mo-scope">결제계좌 잔액 {fmt(report.anchorBalance ?? 0)} 기준{report.anchorAt ? ` · ${formatKDateTime(report.anchorAt)} 확인` : ''}</p>
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

/** 필요할 때만 펼쳐 보는 묶음. 화면에는 제목 한 줄만 보이고, 누르면 그 자리에서 열린다(다른 화면으로 넘어가지 않음). */
export function Fold({ title, hint, children, defaultOpen = false }: { title: string; hint?: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`t-card mo-fold${open ? ' open' : ''}`}>
      <button type="button" className="mo-fold-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <span><b>{title}</b>{hint && <small>{hint}</small>}</span>
        <IconChevron />
      </button>
      {open && <div className="mo-fold-body">{children}</div>}
    </section>
  );
}
