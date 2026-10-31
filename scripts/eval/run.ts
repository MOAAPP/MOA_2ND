/**
 * 백테스트 (기획서 「검증 계획과 KPI」).
 *   npx tsx scripts/eval/run.ts                 합성 사용자 10명
 *   npx tsx scripts/eval/run.ts --real data/eval/*.json   팀원·기부 기록 (앱 '평가용 기록 내보내기' 파일)
 *   npx tsx scripts/eval/run.ts --ml ml/out/predictions.csv   LightGBM 예측을 같은 표에 넣기
 *
 * 평가 구간은 비율이 아니라 날짜로 고정: 사용자별 마지막 28일 = 최종 평가, 그 앞 14일 = 모델 선택, 나머지 = 학습.
 * 학습 구간 앞 7일은 특징량 계산용이라 정답으로 쓰지 않는다. 정답은 기록 완료·대조 완료일만.
 * 실데이터에서는 부족 사건 정답을 정하지 않는다(부족 탐지는 합성에서만).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { addDays, diffDays, type ISODate } from '../../shared/dates';
import { BASELINES, dailyVariable, labeledDays, upperWidth, type BaselineName, type LabeledDay } from '../../src/lib/moa/forecast';
import { assessRisk } from '../../src/lib/moa/risk';
import type { MoaState } from '../../src/lib/moa/types';
import { makeUser, SPECS, stateAt, type SynthUser } from './synthetic';

export const EVAL_DAYS = 28;
export const SELECT_DAYS = 14;
export const WARMUP = 7;

export interface Series { id: string; source: 'synthetic' | 'real'; days: LabeledDay[]; first: ISODate; last: ISODate }

export function windows(s: Series) {
  const evalStart = addDays(s.last, -(EVAL_DAYS - 1));
  const selectStart = addDays(evalStart, -SELECT_DAYS);
  const trainStart = addDays(s.first, WARMUP);
  return { evalStart, selectStart, trainStart };
}

type Pred = (s: Series, target: ISODate, asOf: ISODate) => number | null;

export const BASE_PRED: Record<BaselineName, Pred> = {
  rolling7: (s, t, a) => BASELINES.rolling7(s.days.filter((d) => d.date >= s.first), t, a),
  weekday: (s, t, a) => BASELINES.weekday(s.days, t, a),
};

/** h일 누적 MAE. 창 안 모든 날이 정답일이어야 쓴다. */
export function cumMae(s: Series, pred: Pred, h: number, from: ISODate, to: ISODate) {
  const truth = new Map(s.days.map((d) => [d.date, d.amount]));
  const errs: number[] = [];
  for (let a = from; addDays(a, h - 1) <= to; a = addDays(a, 1)) {
    let act = 0, p = 0, ok = true;
    for (let i = 0; i < h; i++) {
      const d = addDays(a, i);
      const v = truth.get(d);
      const q = pred(s, d, a);
      if (v === undefined || q === null) { ok = false; break; }
      act += v; p += q;
    }
    if (ok) errs.push(Math.abs(act - p));
  }
  const span = diffDays(from, to) + 1;
  return { mae: errs.length ? errs.reduce((x, y) => x + y, 0) / errs.length : null, cases: errs.length, independent: Math.floor(span / h) };
}

/** 상단 지출 시나리오 포함률: 실제 h일 누적 ≤ 기본 누적 + 상단 폭 */
export function coverage(s: Series, h: number, from: ISODate, to: ISODate) {
  const truth = new Map(s.days.map((d) => [d.date, d.amount]));
  let hit = 0, n = 0;
  for (let a = from; addDays(a, h - 1) <= to; a = addDays(a, 1)) {
    let act = 0, base = 0, ok = true;
    for (let i = 0; i < h; i++) {
      const d = addDays(a, i);
      const v = truth.get(d), q = BASELINES.weekday(s.days, d, a);
      if (v === undefined || q === null) { ok = false; break; }
      act += v; base += q;
    }
    if (!ok) continue;
    const w = upperWidth(s.days.filter((d) => d.date < a), h, base).width;
    n += 1;
    if (act <= base + w) hit += 1;
  }
  return { rate: n ? hit / n : null, n };
}

/* ───────── 부족 탐지 (합성만) ───────── */

export interface Detection {
  events: number;
  detected: number;
  missed: string[];
  falseAlarms: number;
  leadDays: number[];
  byGrade: Record<string, number>;
}

/** 부족 탐지는 예측 평가 구간과 별개로, 기록이 3주 쌓인 뒤부터 끝까지 매일 아침 계산해 본다 */
export function detect(u: SynthUser): Detection {
  const evalStart = addDays(u.start, 21);
  const warned = new Map<string, ISODate>();
  const byGrade: Record<string, number> = {};
  for (let d = addDays(evalStart, -14); d <= u.end; d = addDays(d, 1)) {
    const { state, nowMs } = stateAt(u, d);
    const r = assessRisk(state, nowMs, d);
    for (const p of r.payments) {
      if (p.grade !== 'registered' && p.grade !== 'high' && p.grade !== 'caution') continue;
      if (p.date < evalStart) continue;
      const key = `${p.name}:${p.date}`;
      if (!warned.has(key)) { warned.set(key, d); byGrade[p.grade] = (byGrade[p.grade] ?? 0) + 1; }
    }
  }
  // 카드값 이름은 엔진('신용 카드값')과 정답('신용카드 대금')이 달라 날짜로 맞춘다
  const norm = (k: string) => k.replace(/^.*카드(값| 대금)/, 'CARD');
  const warnedNorm = new Map([...warned].map(([k, v]) => [norm(k), v]));
  const truth = u.payments.filter((p) => p.date >= evalStart);
  const events = truth.filter((p) => p.short);
  const lead: number[] = [];
  const missed: string[] = [];
  for (const e of events) {
    const w = warnedNorm.get(norm(e.key));
    if (w && w <= e.date) lead.push(diffDays(w, e.date)); else missed.push(e.key);
  }
  const shortKeys = new Set(events.map((e) => norm(e.key)));
  const falseAlarms = [...warnedNorm.keys()].filter((k) => !shortKeys.has(k)).length;
  return { events: events.length, detected: lead.length, missed, falseAlarms, leadDays: lead, byGrade };
}

export function seriesOfSynth(u: SynthUser): Series {
  const s: Pick<MoaState, 'txns' | 'dayStatus'> = { txns: u.recorded, dayStatus: u.dayStatus };
  return { id: u.spec.id, source: 'synthetic', days: labeledDays(s, addDays(u.end, 1)), first: u.start, last: u.end };
}

export function seriesOfState(id: string, m: Pick<MoaState, 'txns' | 'dayStatus'>): Series {
  const days = labeledDays(m, '9999-12-31');
  const dates = [...dailyVariable(m.txns).keys(), ...Object.keys(m.dayStatus)].sort();
  return { id, source: 'real', days, first: dates[0], last: dates[dates.length - 1] };
}

/* ───────── 실행 ───────── */

function loadMl(path?: string): Map<string, number> {
  const m = new Map<string, number>();
  if (!path) return m;
  const [head, ...rows] = readFileSync(path, 'utf8').trim().split('\n');
  const cols = head.split(',');
  const iu = cols.indexOf('user'), ia = cols.indexOf('as_of'), it = cols.indexOf('target'), ip = cols.indexOf('pred');
  for (const r of rows) { const c = r.split(','); m.set(`${c[iu]}|${c[ia]}|${c[it]}`, Number(c[ip])); }
  return m;
}

function fmtN(v: number | null) { return v === null ? '—' : Math.round(v).toLocaleString('ko-KR'); }

export function main(argv = process.argv.slice(2)) {
  const realIdx = argv.indexOf('--real');
  const mlIdx = argv.indexOf('--ml');
  const realFiles = realIdx >= 0 ? argv.slice(realIdx + 1).filter((a) => !a.startsWith('--') && a.endsWith('.json')) : [];
  const ml = loadMl(mlIdx >= 0 ? argv[mlIdx + 1] : undefined);
  const mlPred: Pred = (s, t, a) => ml.get(`${s.id}|${a}|${t}`) ?? null;

  const synth = SPECS.map((sp) => makeUser(sp));
  const series: Series[] = [...synth.map(seriesOfSynth), ...realFiles.map((f) => { const j = JSON.parse(readFileSync(f, 'utf8')); return seriesOfState(j.id ?? f, j); })];

  const lines: string[] = [];
  lines.push('# 검증 결과 (자동 생성)', '', `생성: \`npx tsx scripts/eval/run.ts${argv.length ? ' ' + argv.join(' ') : ''}\``, '');
  lines.push('> 합성 사용자는 시뮬레이터 설정값으로 만든 데이터예요. 부족 탐지 로직이 의도대로 동작하는지만 보여주고, 실제 청년의 성능이나 사용자 테스트 인원이 아니에요.', '');

  for (const src of ['real', 'synthetic'] as const) {
    const ss = series.filter((s) => s.source === src);
    if (!ss.length) continue;
    lines.push(`## 변동 지출 예측 — ${src === 'real' ? '실데이터' : '합성'} (최종 평가 ${EVAL_DAYS}일)`, '');
    lines.push('| 사용자 | 7일 MAE · 7일 평균 | 요일별 평균 | ML | 7일 사례(독립) | 14일 MAE · 7일 평균 | 요일별 평균 | 14일 사례(독립) |', '|---|---|---|---|---|---|---|---|');
    const agg = { r7: [] as number[], wd: [] as number[], ml: [] as number[], r14: [] as number[], wd14: [] as number[] };
    for (const s of ss) {
      const { evalStart } = windows(s);
      const a = cumMae(s, BASE_PRED.rolling7, 7, evalStart, s.last);
      const b = cumMae(s, BASE_PRED.weekday, 7, evalStart, s.last);
      const c = ml.size ? cumMae(s, mlPred, 7, evalStart, s.last) : { mae: null };
      const a14 = cumMae(s, BASE_PRED.rolling7, 14, evalStart, s.last);
      const b14 = cumMae(s, BASE_PRED.weekday, 14, evalStart, s.last);
      if (a.mae !== null) agg.r7.push(a.mae);
      if (b.mae !== null) agg.wd.push(b.mae);
      if (c.mae !== null) agg.ml.push(c.mae);
      if (a14.mae !== null) agg.r14.push(a14.mae);
      if (b14.mae !== null) agg.wd14.push(b14.mae);
      lines.push(`| ${s.id} | ${fmtN(a.mae)} | ${fmtN(b.mae)} | ${fmtN(c.mae)} | ${a.cases} (${a.independent}) | ${fmtN(a14.mae)} | ${fmtN(b14.mae)} | ${a14.cases} (${a14.independent}) |`);
    }
    const avg = (xs: number[]) => (xs.length ? xs.reduce((x, y) => x + y, 0) / xs.length : null);
    lines.push(`| **평균** | **${fmtN(avg(agg.r7))}** | **${fmtN(avg(agg.wd))}** | **${fmtN(avg(agg.ml))}** | | ${fmtN(avg(agg.r14))} | ${fmtN(avg(agg.wd14))} | |`, '');
    lines.push('14일 결과는 사례가 적은 탐색적 결과예요. ML 열이 비어 있으면 아직 LightGBM 예측을 넣지 않은 상태예요(ml/README.md).', '');

    lines.push(`### 상단 지출 시나리오 포함률 — ${src === 'real' ? '실데이터' : '합성'} (목표 80% 근처)`, '', '| 남은 기간 | 포함률 | 창 수 |', '|---|---|---|');
    for (const h of [3, 7, 14]) {
      let hit = 0, n = 0;
      for (const s of ss) { const { evalStart } = windows(s); const c = coverage(s, h, evalStart, s.last); if (c.rate !== null) { hit += c.rate * c.n; n += c.n; } }
      lines.push(`| ${h}일 | ${n ? `${Math.round((hit / n) * 100)}%` : '—'} | ${n} |`);
    }
    lines.push('');
  }

  // 부족 탐지 (합성)
  lines.push('## 부족 탐지 — 합성 사용자 10명 (정답 라벨 있음, 시작 22일째부터 끝까지)', '', '| 사용자 | 상황 | 부족 사건 | 미리 탐지 | 놓침 | 불필요한 경고 | 평균 사전 탐지 일수 |', '|---|---|---|---|---|---|---|');
  let ev = 0, det = 0, fa = 0; const leads: number[] = [];
  const detail: Record<string, unknown> = {};
  for (const u of synth) {
    const r = detect(u);
    ev += r.events; det += r.detected; fa += r.falseAlarms; leads.push(...r.leadDays);
    detail[u.spec.id] = r;
    const lead = r.leadDays.length ? (r.leadDays.reduce((x, y) => x + y, 0) / r.leadDays.length).toFixed(1) : '—';
    lines.push(`| ${u.spec.id} | ${u.spec.scenario} | ${r.events} | ${r.detected} | ${r.missed.length} | ${r.falseAlarms} | ${lead} |`);
  }
  const recall = ev ? Math.round((det / ev) * 100) : null;
  lines.push(`| **합계** | | **${ev}** | **${det}** | **${ev - det}** | **${fa}** | **${leads.length ? (leads.reduce((x, y) => x + y, 0) / leads.length).toFixed(1) : '—'}** |`, '');
  lines.push(`재현율 ${recall === null ? '—' : `${recall}%`} (합성 데이터 기준, 실제 청년의 부족 탐지 성능이 아님). 경고는 등록 일정 기준 부족·부족 가능성 높음·주의 등급.`, '');

  mkdirSync('docs/eval', { recursive: true });
  writeFileSync('docs/eval/RESULTS.md', lines.join('\n') + '\n');
  writeFileSync('docs/eval/results.json', JSON.stringify({ detection: detail }, null, 2));
  console.log(lines.join('\n'));
}

if (process.argv[1] && /run\.ts$/.test(process.argv[1])) main();
