/**
 * 연구용 이벤트 로깅 (N14 · docs/RESEARCH.md)
 * - 동의한 사람만 기록한다. 동의 전 행동은 남기지 않는다.
 * - 이름·품목명·메모 같은 자유 입력은 저장하지 않는다(카테고리와 금액만).
 * - 모든 함수는 순수 함수. 화면은 appendEvent 결과를 상태에 넣기만 한다.
 */

export type Arm = 'preview' | 'control';
export const ARM_LABEL: Record<Arm, string> = { preview: 'A · 미래 비용 미리보기', control: 'B · 미리보기 없음' };

export type DecisionChoice = 'hold' | 'alt' | 'buy';
export type Freq = 'once' | 'weekly' | 'daily';

export type ResearchEventBody =
  | { type: 'joined' }
  | { type: 'left' }
  | { type: 'session_start' }
  | { type: 'decision_preview'; price: number; freq: Freq; usableBefore: number; yearGap: number }
  | { type: 'decision_made'; choice: DecisionChoice; price: number; paid: number; saved: number; freq: Freq; category: string; dwellMs: number; moved: boolean }
  | { type: 'bank_join'; kind: 'deposit' | 'installment'; productId: string; amount: number; months: number; fromSaved: boolean }
  | { type: 'bank_close_early'; kind: 'deposit' | 'installment'; productId: string; heldDays: number; termMonths: number }
  | { type: 'bank_mature'; kind: 'deposit' | 'installment'; productId: string }
  | { type: 'autopay'; paid: number; missed: number }
  | { type: 'lesson_done'; lessonId: string };

export type ResearchEvent = ResearchEventBody & {
  /** 기기마다 한 번 만드는 무작위 참여자 번호 */
  pid: string;
  arm: Arm;
  /** 몇 번째 접속인지(1부터) */
  session: number;
  /** epoch ms */
  at: number;
  /** 체험(예시 데이터) 중이었는지 — 분석에서 따로 본다 */
  demo: boolean;
  seq: number;
};

export interface ResearchState {
  joined: boolean;
  joinedAt?: number;
  pid: string;
  arm: Arm;
  session: number;
  events: ResearchEvent[];
}

export const MAX_EVENTS = 5000;

/** 사람이 읽기 쉬운 짧은 번호 (예: P-7K3Q9X) */
export function newPid(rand: () => number = Math.random): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 6; i++) s += chars[Math.floor(rand() * chars.length)];
  return `P-${s}`;
}

/** 참여자 번호로 정하는 무작위 배정(50:50). 같은 번호는 늘 같은 조건. */
export function assignArm(pid: string): Arm {
  let h = 2166136261;
  for (let i = 0; i < pid.length; i++) { h ^= pid.charCodeAt(i); h = Math.imul(h, 16777619); }
  return (h >>> 0) % 2 === 0 ? 'preview' : 'control';
}

export function emptyResearch(rand: () => number = Math.random): ResearchState {
  const pid = newPid(rand);
  return { joined: false, pid, arm: assignArm(pid), session: 0, events: [] };
}

export function migrateResearch(raw: Partial<ResearchState> | undefined): ResearchState {
  const base = emptyResearch();
  if (!raw || typeof raw.pid !== 'string') return base;
  const arm: Arm = raw.arm === 'control' || raw.arm === 'preview' ? raw.arm : assignArm(raw.pid);
  return { ...base, ...raw, arm, events: Array.isArray(raw.events) ? raw.events : [], session: raw.session ?? 0 };
}

/** 기록 추가. 동의 안 했으면 그대로 돌려준다(같은 객체). */
export function appendEvent(r: ResearchState, body: ResearchEventBody, ctx: { now: number; demo: boolean }): ResearchState {
  if (!r.joined) return r;
  const last = r.events[r.events.length - 1];
  const ev = { ...body, pid: r.pid, arm: r.arm, session: r.session, at: ctx.now, demo: ctx.demo, seq: (last?.seq ?? 0) + 1 } as ResearchEvent;
  const events = [...r.events, ev];
  return { ...r, events: events.length > MAX_EVENTS ? events.slice(events.length - MAX_EVENTS) : events };
}

export function join(r: ResearchState, ctx: { now: number; demo: boolean }, arm?: Arm): ResearchState {
  if (r.joined) return r;
  const next: ResearchState = { ...r, joined: true, joinedAt: ctx.now, arm: arm ?? r.arm, session: Math.max(1, r.session) };
  return appendEvent(next, { type: 'joined' }, ctx);
}

export function leave(r: ResearchState, ctx: { now: number; demo: boolean }, wipe: boolean): ResearchState {
  if (!r.joined) return wipe ? { ...r, events: [] } : r;
  const logged = appendEvent(r, { type: 'left' }, ctx);
  return { ...logged, joined: false, events: wipe ? [] : logged.events };
}

export function startSession(r: ResearchState, ctx: { now: number; demo: boolean }): ResearchState {
  if (!r.joined) return r;
  return appendEvent({ ...r, session: r.session + 1 }, { type: 'session_start' }, ctx);
}

/* ───────── 지표 (docs/RESEARCH.md §4) ───────── */

export interface ResearchMetrics {
  decisions: number;
  /** 참기 + 더 싸게 / 전체 결정 */
  holdRate: number | null;
  /** 참기만 / 전체 */
  pureHoldRate: number | null;
  savedTotal: number;
  savedMedian: number | null;
  sessions: number;
  /** 연속 접속 사이 날짜 간격의 중앙값 */
  returnGapDaysMedian: number | null;
  activeDays: number;
  joins: number;
  earlyCloses: number;
  /** 중도해지 / 가입 */
  earlyCloseRate: number | null;
  autopayPaid: number;
  autopayMissed: number;
  /** 납입 성실도 = 성공 / (성공 + 미납) */
  autopayRate: number | null;
  previewDwellMedianMs: number | null;
}

const median = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const kstDay = (ms: number) => new Date(ms + 9 * 3600_000).toISOString().slice(0, 10);

export function metrics(events: ResearchEvent[], opts: { includeDemo?: boolean } = {}): ResearchMetrics {
  const ev = opts.includeDemo === false ? events.filter((e) => !e.demo) : events;
  const ds = ev.filter((e): e is Extract<ResearchEvent, { type: 'decision_made' }> => e.type === 'decision_made');
  const held = ds.filter((d) => d.choice !== 'buy');
  const sessions = ev.filter((e) => e.type === 'session_start' || e.type === 'joined');
  const days = [...new Set(sessions.map((e) => kstDay(e.at)))].sort();
  const gaps = days.slice(1).map((d, i) => (Date.parse(d) - Date.parse(days[i])) / 86_400_000);
  const joins = ev.filter((e) => e.type === 'bank_join').length;
  const closes = ev.filter((e) => e.type === 'bank_close_early').length;
  const ap = ev.filter((e): e is Extract<ResearchEvent, { type: 'autopay' }> => e.type === 'autopay');
  const paid = ap.reduce((s, e) => s + e.paid, 0), missed = ap.reduce((s, e) => s + e.missed, 0);
  return {
    decisions: ds.length,
    holdRate: ds.length ? held.length / ds.length : null,
    pureHoldRate: ds.length ? ds.filter((d) => d.choice === 'hold').length / ds.length : null,
    savedTotal: ds.reduce((s, d) => s + d.saved, 0),
    savedMedian: median(held.map((d) => d.saved)),
    sessions: sessions.length,
    returnGapDaysMedian: median(gaps),
    activeDays: new Set(ev.map((e) => kstDay(e.at))).size,
    joins,
    earlyCloses: closes,
    earlyCloseRate: joins ? closes / joins : null,
    autopayPaid: paid,
    autopayMissed: missed,
    autopayRate: paid + missed ? paid / (paid + missed) : null,
    previewDwellMedianMs: median(ds.map((d) => d.dwellMs)),
  };
}

/* ───────── 내보내기 ───────── */

export const CSV_COLUMNS = ['pid', 'arm', 'seq', 'session', 'at_iso', 'demo', 'type', 'choice', 'price', 'paid', 'saved', 'freq', 'category', 'dwell_ms', 'moved', 'usable_before', 'year_gap', 'kind', 'product_id', 'amount', 'months', 'from_saved', 'held_days', 'term_months', 'autopay_paid', 'autopay_missed', 'lesson_id'] as const;

const cell = (v: unknown) => {
  if (v === undefined || v === null) return '';
  const s = String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export function toCSV(events: ResearchEvent[]): string {
  const rows = events.map((e) => {
    const x = e as Record<string, unknown>;
    const row: Record<(typeof CSV_COLUMNS)[number], unknown> = {
      pid: e.pid, arm: e.arm, seq: e.seq, session: e.session, at_iso: new Date(e.at).toISOString(), demo: e.demo ? 1 : 0, type: e.type,
      choice: x.choice, price: x.price, paid: e.type === 'autopay' ? undefined : x.paid, saved: x.saved, freq: x.freq, category: x.category,
      dwell_ms: x.dwellMs, moved: x.moved === undefined ? undefined : x.moved ? 1 : 0, usable_before: x.usableBefore, year_gap: x.yearGap,
      kind: x.kind, product_id: x.productId, amount: x.amount, months: x.months, from_saved: x.fromSaved === undefined ? undefined : x.fromSaved ? 1 : 0,
      held_days: x.heldDays, term_months: x.termMonths, autopay_paid: e.type === 'autopay' ? e.paid : undefined, autopay_missed: x.missed, lesson_id: x.lessonId,
    };
    return CSV_COLUMNS.map((c) => cell(row[c])).join(',');
  });
  return [CSV_COLUMNS.join(','), ...rows].join('\n');
}

export function toJSON(r: ResearchState, now: number): string {
  return JSON.stringify({ schema: 'moa-research/1', exportedAt: new Date(now).toISOString(), pid: r.pid, arm: r.arm, joinedAt: r.joinedAt ? new Date(r.joinedAt).toISOString() : null, metrics: metrics(r.events), events: r.events }, null, 2);
}
