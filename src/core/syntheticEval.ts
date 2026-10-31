/**
 * 합성 사용자 부족 탐지 평가 (기획서: 부족 탐지 재현율·놓친 부족·불필요한 경고·평균 사전 탐지 일수).
 * 정답 라벨이 있는 합성 데이터에서만 잰다. 실제 청년의 부족 탐지 성능으로 말하지 않는다.
 *
 * 매일 09:00에 그때까지의 기록·잔액 문자만으로 assessRisk를 돌리고,
 * 진짜로 부족했던 결제일을 그 전에 '주의' 이상으로 짚었는지 본다.
 */
import { addDays, diffDays, type ISODate } from '../../shared/dates';
import { assessRisk, gradeRank, type Grade } from './risk';
import type { SyntheticUser } from './synthetic';
import { dateRange, kstStart } from './time';
import type { DayStatus } from './types';

export interface DetectionResult {
  user: string;
  shortEvents: number;
  detected: number;
  missed: { date: ISODate; label: string; low: number }[];
  /** '부족 가능성 높음' 이상인데 실제로는 부족하지 않았던 결제일 */
  falseHigh: ISODate[];
  /** '주의' 이상인데 실제로는 부족하지 않았던 결제일 */
  falseCaution: ISODate[];
  leadDays: number[];
}

/** 첫 3주는 기록이 쌓이는 기간이라 평가하지 않는다 */
export const EVAL_WARMUP_DAYS = 21;

export function evaluateDetection(u: SyntheticUser, minGrade: Grade = 'caution'): DetectionResult {
  const first = addDays(u.start, EVAL_WARMUP_DAYS);
  const firstFlag = new Map<ISODate, ISODate>();
  const flaggedHigh = new Set<ISODate>();
  const flaggedAny = new Set<ISODate>();
  for (const today of dateRange(first, u.end)) {
    const now = kstStart(today) + 9 * 3600_000;
    const status = new Map<ISODate, DayStatus>([...u.dayStatus].filter(([d]) => d < today));
    const r = assessRisk({ setup: u.setup, txns: u.recorded.filter((t) => t.occurredAt <= now), observations: u.observations.filter((o) => o.at <= now), dayStatus: status, now });
    for (const e of r.events) {
      if (e.date <= today) continue; // 결제일 당일 아침 판단은 사전 탐지로 치지 않는다
      if (gradeRank(e.grade) >= gradeRank(minGrade)) {
        flaggedAny.add(e.date);
        if (!firstFlag.has(e.date)) firstFlag.set(e.date, today);
      }
      if (gradeRank(e.grade) >= gradeRank('high')) flaggedHigh.add(e.date);
    }
  }
  const inRange = u.labels.filter((l) => l.date > addDays(first, 1));
  const shortDates = new Set(inRange.filter((l) => l.short).map((l) => l.date));
  const short = inRange.filter((l) => l.short);
  const detected = short.filter((l) => firstFlag.has(l.date));
  return {
    user: u.persona.id,
    shortEvents: short.length,
    detected: detected.length,
    missed: short.filter((l) => !firstFlag.has(l.date)).map(({ date, label, low }) => ({ date, label, low })),
    falseHigh: [...flaggedHigh].filter((d) => !shortDates.has(d) && d <= u.end).sort(),
    falseCaution: [...flaggedAny].filter((d) => !shortDates.has(d) && d <= u.end).sort(),
    leadDays: detected.map((l) => diffDays(firstFlag.get(l.date)!, l.date)),
  };
}

export function summarize(rs: DetectionResult[]) {
  const short = rs.reduce((s, r) => s + r.shortEvents, 0);
  const det = rs.reduce((s, r) => s + r.detected, 0);
  const leads = rs.flatMap((r) => r.leadDays);
  return {
    shortEvents: short,
    detected: det,
    recall: short ? det / short : null,
    missed: short - det,
    falseHigh: rs.reduce((s, r) => s + r.falseHigh.length, 0),
    falseCaution: rs.reduce((s, r) => s + r.falseCaution.length, 0),
    meanLeadDays: leads.length ? leads.reduce((s, v) => s + v, 0) / leads.length : null,
  };
}
