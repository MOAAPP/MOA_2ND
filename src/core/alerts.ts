/**
 * 선제 알림 규칙 (기획서 '선제 알림', '알림 피로').
 *
 * - 결제일 D-7, D-3에 알린다. 그 사이 등급이 올라가면 바로 다시 알린다. 결제일당 최대 3회.
 * - 등록 일정 기준 부족은 즉시.
 * - 복합 상황 주의와 여유는 푸시하지 않는다 (화면 표시만).
 * - 발송 여부는 이 규칙이 정하고, 문장 속 숫자는 계산값을 템플릿 변수로 넣는다.
 */
import { diffDays, parseISO, type ISODate } from '../../shared/dates';
import { gradeRank, type Grade, type PaymentEvent, type RiskReport } from './risk';

export const MAX_ALERTS_PER_EVENT = 3;
const PUSHABLE: Grade[] = ['registered_short', 'high', 'caution'];

export type AlertReason = 'immediate' | 'd7' | 'd3' | 'upgrade';

export interface SentAlert {
  reason: AlertReason;
  grade: Grade;
  on: ISODate;
}

/** 결제일별 발송 기록 (키: 날짜|이름) */
export type AlertState = Record<string, SentAlert[]>;

export interface AlertDecision {
  key: string;
  event: PaymentEvent;
  reason: AlertReason;
  text: string;
}

export const eventKey = (e: Pick<PaymentEvent, 'date' | 'label'>) => `${e.date}|${e.label}`;

export function decideAlerts(report: RiskReport, state: AlertState): { send: AlertDecision[]; next: AlertState } {
  const next: AlertState = structuredClone(state);
  const send: AlertDecision[] = [];
  for (const e of report.events) {
    if (!PUSHABLE.includes(e.grade)) continue;
    const key = eventKey(e);
    const sent = next[key] ?? [];
    if (sent.length >= MAX_ALERTS_PER_EVENT) continue;
    const d = diffDays(report.today, e.date);
    const has = (r: AlertReason) => sent.some((s) => s.reason === r);
    const maxSent = sent.reduce((m, s) => Math.max(m, gradeRank(s.grade)), gradeRank('ok'));
    let reason: AlertReason | null = null;
    if (e.grade === 'registered_short' && maxSent < gradeRank('registered_short')) reason = 'immediate';
    else if (d <= 3 && !has('d3')) reason = 'd3';
    else if (d <= 7 && d > 3 && !has('d7')) reason = 'd7';
    else if (d <= 7 && gradeRank(e.grade) > maxSent) reason = 'upgrade';
    if (!reason) continue;
    next[key] = [...sent, { reason, grade: e.grade, on: report.today }];
    send.push({ key, event: e, reason, text: alertText(e) });
  }
  return { send, next };
}

export const won = (n: number) => (n >= 10000 && n % 10000 === 0 ? `${n / 10000}만원` : `${n.toLocaleString('ko-KR')}원`);
const dayText = (date: ISODate) => `${parseISO(date).d}일`;

/** 계산값만 넣는 기본 문장 (LLM이 다듬더라도 숫자는 이 값을 그대로 쓴다) */
export function alertText(e: PaymentEvent): string {
  const s = e.shortage;
  switch (e.grade) {
    case 'registered_short':
      return `지금 등록된 일정대로라면 ${dayText(e.date)} ${e.label} 출금에 ${won(s.registered ?? 0)}이 모자라요.`;
    case 'high': {
      const tail = s.delay && s.delay > (s.base ?? 0) ? ` 급여가 늦어지면 ${won(s.delay)}이 모자라요.` : '';
      return `${dayText(e.date)} ${e.label} 출금일에 결제계좌 돈이 ${won(s.base ?? 0)} 모자랄 가능성이 높아요.${tail}`;
    }
    case 'caution': {
      const both = (s.upper ?? 0) > 0 && (s.delay ?? 0) > 0;
      const why = both ? '지출이 평소보다 많거나 급여가 늦어지면' : (s.delay ?? 0) > 0 ? '급여가 늦어지면' : '지출이 평소보다 많으면';
      return `${why} ${dayText(e.date)} ${e.label}에 모자랄 수 있어요.`;
    }
    case 'combined_caution':
      return `지출이 많고 급여도 늦어지는 경우에는 ${dayText(e.date)} ${e.label}에 모자랄 수 있어요.`;
    default:
      return '';
  }
}
