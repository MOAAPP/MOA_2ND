/**
 * LightGBM 학습용 특징량 CSV 만들기 (기획서 「ML 모델 설계」).
 *   npx tsx scripts/eval/features.ts                                  합성만 (기능 확인용)
 *   npx tsx scripts/eval/features.ts --real data/eval/*.json          실데이터만 (기본: 합성 제외)
 *   npx tsx scripts/eval/features.ts --real ... --with-synthetic      실데이터 + 합성 (source 열로 구분)
 *   →  ml/data/features.csv
 *
 * 한 행 = (사용자, 예측 시점 as_of, 예측 대상 날짜 target). as_of 이전 정보만 쓴다(누수 방지).
 * 입력 변수: 요일, 공휴일 여부, 다음 입금 예정일까지 남은 일수, 마지막 입금 후 지난 일수, 최근 7일 평균, 전날 지출,
 *           관측 일수, 사용자 평균 지출 수준. 결제계좌 잔액은 쓰지 않는다.
 * 사용자 평균(user_mean)은 as_of 이전 정답일의 누적 평균이다. 전체 학습 구간 평균을 쓰면
 * 학습 초반 행에 그 시점에는 몰랐던 미래 지출이 섞여 들어가므로 시점별로 다시 계산한다.
 * 최근 14·28일 평균은 학습 구간이 짧아 MVP에서 쓰지 않는다.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { addDays, diffDays, weekdayOf, type ISODate } from '../../shared/dates';
import { scheduleOccurrences } from '../../src/lib/moa/ledger';
import type { MoaSchedule, Txn } from '../../src/lib/moa/types';
import { seriesOfState, seriesOfSynth, windows, type Series } from './run';
import { makeUser, SPECS } from './synthetic';

/** 2026년 공휴일 (대체공휴일 포함, 평가 기간 근처만) */
const HOLIDAYS = new Set(['2026-05-05', '2026-05-25', '2026-06-03', '2026-06-06', '2026-08-15', '2026-08-17', '2026-09-24', '2026-09-25', '2026-09-26', '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25']);

interface Ctx { s: Series; incomes: ISODate[]; schedule: MoaSchedule[] }

function split(s: Series, asOf: ISODate, target: ISODate): 'train' | 'select' | 'eval' | 'warmup' {
  const w = windows(s);
  if (asOf >= w.evalStart) return 'eval';
  if (asOf >= w.selectStart) return target < w.evalStart ? 'select' : 'warmup';
  if (target < w.trainStart || target >= w.selectStart) return 'warmup';
  return 'train';
}

function rows(c: Ctx): string[] {
  const { s } = c;
  const truth = new Map(s.days.map((d) => [d.date, d.amount]));
  const out: string[] = [];
  for (let asOf = addDays(s.first, 7); asOf <= s.last; asOf = addDays(asOf, 1)) {
    const prior = s.days.filter((d) => d.date < asOf);
    const userMean = pointInTimeMean(prior);
    const last7 = prior.slice(-7);
    const r7 = last7.length >= 3 ? last7.reduce((a, b) => a + b.amount, 0) / last7.length : '';
    const prev = truth.get(addDays(asOf, -1));
    const lastIncome = [...c.incomes].filter((d) => d < asOf).pop();
    const nextPlanned = c.schedule.filter((x) => x.direction === 'in' && x.status !== 'uncertain').flatMap((x) => scheduleOccurrences(x, asOf, addDays(asOf, 62))).sort()[0];
    for (let h = 0; h < 14; h++) {
      const target = addDays(asOf, h);
      if (target > s.last) break;
      const sp = split(s, asOf, target);
      if (sp === 'warmup') continue;
      const label = truth.get(target);
      out.push([
        s.id, s.source, asOf, target, h, sp,
        weekdayOf(target), HOLIDAYS.has(target) ? 1 : 0,
        nextPlanned ? diffDays(target, nextPlanned) : '',
        lastIncome ? diffDays(lastIncome, target) : '',
        r7 === '' ? '' : Math.round(r7), prev ?? '', prior.length, userMean === '' ? '' : Math.round(userMean),
        label ?? '',
      ].join(','));
    }
  }
  return out;
}

/** as_of 이전 정답일만으로 계산한 사용자 평균 지출 (7일 미만이면 비움) */
export function pointInTimeMean(prior: { amount: number }[]): number | '' {
  if (prior.length < 7) return '';
  return prior.reduce((a, b) => a + b.amount, 0) / prior.length;
}

const incomeDates = (txns: Txn[]) => txns.filter((t) => t.kind === 'income').map((t) => t.date).sort();

export function main(argv = process.argv.slice(2)) {
  const realIdx = argv.indexOf('--real');
  const realFiles = realIdx >= 0 ? argv.slice(realIdx + 1).filter((a) => a.endsWith('.json')) : [];
  // 실데이터가 있으면 합성은 기본으로 뺀다. 섞어야 할 때만 --with-synthetic (source 열로 구분).
  const withSynth = realFiles.length === 0 || argv.includes('--with-synthetic');
  const ctxs: Ctx[] = [
    ...(withSynth ? SPECS : []).map((sp) => { const u = makeUser(sp); return { s: seriesOfSynth(u), incomes: incomeDates(u.recorded), schedule: u.schedule }; }),
    ...realFiles.map((f) => { const j = JSON.parse(readFileSync(f, 'utf8')); return { s: seriesOfState(j.id ?? f, j), incomes: incomeDates(j.txns), schedule: j.schedule ?? [] }; }),
  ];
  const head = 'user,source,as_of,target,h,split,weekday,holiday,days_to_next_income,days_since_income,mean7,prev_day,observed_days,user_mean,label';
  const body = ctxs.flatMap(rows);
  mkdirSync('ml/data', { recursive: true });
  writeFileSync('ml/data/features.csv', [head, ...body].join('\n') + '\n');
  console.log(`ml/data/features.csv · ${body.length}행 · 사용자 ${ctxs.length}명 (합성 ${withSynth ? SPECS.length : 0}, 실데이터 ${realFiles.length})`);
}

if (process.argv[1] && /features\.ts$/.test(process.argv[1])) main();
