/**
 * ML 입력 변수 (기획서 'ML 모델 설계' 표). LightGBM(Tweedie, variance power 1.5) 학습은 파이썬에서 하고,
 * 이 파일은 같은 정의로 특징량을 만들어 CSV로 내보낸다. 학습된 모델은 DailyPredictor로 다시 끼운다.
 *
 * 쓰는 입력: 요일, 공휴일 여부, 다음 입금 예정일까지 남은 일수, 마지막 입금 후 지난 일수,
 *           최근 7일 평균, 전날 지출, 관측 일수, 사용자 평균 지출 수준(학습 구간에서만 계산)
 * 쓰지 않는 입력: 결제계좌 잔액(순환 방지), 예측 시점 이후의 모든 거래, 최근 14·28일 평균(MVP 제외)
 * 날짜 d의 특징량은 d−1일까지의 정보로만 만든다.
 */
import { addDays, diffDays, type ISODate } from '../../shared/dates';
import type { LabeledDay } from './forecast';
import { occurrences } from './schedule';
import { kstDate, weekday } from './time';
import type { IncomeSchedule, Txn } from './types';

/** 공휴일 (대체공휴일 포함). 학기 중 실데이터 기간에 맞춰 확인·추가할 것 */
export const KR_HOLIDAYS = new Set<ISODate>([
  '2026-08-15', '2026-08-17', '2026-09-24', '2026-09-25', '2026-09-26', '2026-09-28',
  '2026-10-03', '2026-10-05', '2026-10-09', '2026-12-25', '2027-01-01',
]);

export interface FeatureRow {
  user: string;
  date: ISODate;
  weekday: number;
  holiday: 0 | 1;
  days_to_next_income: number | null;
  days_since_last_income: number | null;
  mean7: number | null;
  prev_day: number | null;
  observed_days: number;
  user_mean: number | null;
  /** 정답 (학습·평가 라벨) */
  y: number;
  label_status: LabeledDay['status'];
}

export function buildFeatures(user: string, labels: LabeledDay[], txns: Txn[], incomes: IncomeSchedule[], trainUntil: ISODate, trainFrom?: ISODate): FeatureRow[] {
  const byDate = new Map(labels.map((l) => [l.date, l.amount]));
  const trainVals = labels.filter((l) => l.date <= trainUntil && (!trainFrom || l.date >= trainFrom)).map((l) => l.amount);
  const userMean = trainVals.length ? trainVals.reduce((s, v) => s + v, 0) / trainVals.length : null;
  const incomeDays = txns.filter((t) => t.type === 'income').map((t) => kstDate(t.occurredAt)).sort();
  const sched = incomes.filter((i) => i.certainty === 'scheduled');
  return labels.map((l) => {
    const origin = addDays(l.date, -1);
    const prior = labels.filter((x) => x.date <= origin);
    const last7 = prior.filter((x) => x.date >= addDays(l.date, -7)).map((x) => x.amount);
    const lastIncome = [...incomeDays].reverse().find((d) => d <= origin);
    const next = sched.flatMap((s) => occurrences(s, l.date, addDays(l.date, 45))).sort()[0];
    return {
      user,
      date: l.date,
      weekday: weekday(l.date),
      holiday: KR_HOLIDAYS.has(l.date) ? 1 : 0,
      days_to_next_income: next ? diffDays(l.date, next) : null,
      days_since_last_income: lastIncome ? diffDays(lastIncome, l.date) : null,
      mean7: last7.length ? last7.reduce((s, v) => s + v, 0) / last7.length : null,
      prev_day: byDate.has(origin) ? byDate.get(origin)! : null,
      observed_days: prior.length,
      user_mean: userMean,
      y: l.amount,
      label_status: l.status,
    };
  });
}

export function toCsv(rows: FeatureRow[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]) as (keyof FeatureRow)[];
  return [cols.join(','), ...rows.map((r) => cols.map((c) => (r[c] === null ? '' : String(r[c]))).join(','))].join('\n');
}
