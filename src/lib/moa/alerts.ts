import { formatKDate, parseISO } from '../../../shared/dates';
import { won } from '../../../shared/format';
import type { PaymentCheck, RiskReport } from './risk';
import { GRADE_RANK, type AlertLog, type Grade } from './types';

/**
 * 선제 알림 규칙 (기획서 「선제 알림」, 「알림 피로」).
 * - 등록 일정 기준 부족: 바로 알림
 * - 부족 가능성 높음·주의: 결제일 D-7, D-3에 알림 + 그 사이 등급이 올라가면 바로 다시 알림
 * - 복합 상황 주의·여유: 푸시 없음 (화면에만)
 * - 같은 결제일에 최대 3회
 * 발송 여부는 규칙이 정하고, 숫자는 모두 계산값을 템플릿에 끼워 넣는다.
 */
export const MAX_ALERTS_PER_PAYMENT = 3;
const PUSH_GRADES: Grade[] = ['registered', 'high', 'caution'];

const day = (iso: string) => `${parseISO(iso).d}일`;

/** 알림·카드 문장. 숫자는 계산값만 쓴다. */
export function paymentSentence(p: PaymentCheck, delayDays: number): { title: string; body: string } {
  const what = `${day(p.date)} ${p.name}`;
  switch (p.grade) {
    case 'registered':
      return { title: `${what}에 ${won(p.shortBy)}이 모자라요`, body: '지금 등록된 일정대로라면 지출을 하나도 안 해도 모자라요.' };
    case 'high': {
      const delay = p.balances.delay < p.balances.base ? ` 입금이 ${delayDays}일 늦어지면 ${won(-p.balances.delay)}이 모자라요.` : '';
      return { title: `${what} 출금일에 결제계좌 돈이 ${won(p.shortBy)} 모자랄 가능성이 높아요`, body: `평소처럼 쓰면 모자라요.${delay}` };
    }
    case 'caution': {
      const parts: string[] = [];
      if (p.balances.high < 0) parts.push(`평소보다 많이 쓰면 ${won(-p.balances.high)}`);
      if (p.balances.delay < 0) parts.push(`입금이 ${delayDays}일 늦어지면 ${won(-p.balances.delay)}`);
      const capped = p.capped === 'stale' ? ' 잔액을 확인한 지 오래돼서 등급을 낮춰 보여드려요.' : p.capped === 'gap' ? ' 빠진 기록이 있는 것 같아 등급을 낮춰 보여드려요.' : '';
      return { title: `${what}, 상황에 따라 모자랄 수 있어요`, body: `${parts.join(', ')}이 모자라요.${capped}`.replace(/^이 모자라요\./, '') };
    }
    case 'combo':
      return { title: `${what}, 많이 쓰고 입금도 늦으면 빠듯해요`, body: `두 가지가 겹치면 ${won(p.shortBy)}이 모자라요. 지금은 알림을 보내지 않아요.` };
    default:
      return { title: `${what}까지 괜찮아요`, body: `기본 계산으로 출금 뒤 ${won(p.balances.base)}이 남아요.` };
  }
}

export function decideAlerts(report: RiskReport, prev: AlertLog[], nowMs: number): AlertLog[] {
  const out: AlertLog[] = [];
  for (const p of report.payments) {
    if (!PUSH_GRADES.includes(p.grade)) continue;
    const sent = prev.filter((a) => a.key === p.key);
    if (sent.length >= MAX_ALERTS_PER_PAYMENT) continue;
    const maxRank = Math.max(-1, ...sent.map((a) => GRADE_RANK[a.grade]));
    let trigger: AlertLog['trigger'] | null = null;
    if (p.grade === 'registered' && maxRank < GRADE_RANK.registered) trigger = 'registered';
    else if (sent.length && GRADE_RANK[p.grade] > maxRank) trigger = 'upgrade';
    else if (p.daysUntil <= 3 && !sent.some((a) => a.trigger === 'D3')) trigger = 'D3';
    else if (p.daysUntil <= 7 && !sent.some((a) => a.trigger === 'D7' || a.trigger === 'D3')) trigger = 'D7';
    if (!trigger) continue;
    const s = paymentSentence(p, report.delayDays);
    out.push({ key: p.key, grade: p.grade, trigger, at: nowMs, text: `${s.title}. ${s.body}` });
  }
  return out;
}

export const triggerLabel: Record<AlertLog['trigger'], string> = { registered: '바로', D7: 'D-7', D3: 'D-3', upgrade: '등급 상승' };

export const payDateLabel = (iso: string) => formatKDate(iso, { weekday: true });
