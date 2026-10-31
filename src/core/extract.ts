/**
 * LLM 추출 결과 검증 (기획서 '잔고 갱신과 LLM 일정 추출').
 *
 * "다음 달 5일 월세 35만원, 10일에 알바비 48만원 들어오고, 8일에 카드값 12만원 나가" 같은 문장에서
 * LLM이 뽑은 일정을 저장 전에 검사한다. 문장에 없는 금액·날짜는 비워둔다 — 빈칸을 임의로 채우는 것이
 * 금융 서비스에서 가장 위험한 환각이다. 입금은 기본값 '예정'으로 두고 사용자가 상태를 고른다.
 */
import type { IncomeCertainty } from './types';

export interface ExtractedScheduleItem {
  name: string;
  amount: number | null;
  /** 1~31 일(day). 문장에 없으면 null */
  day: number | null;
  direction: 'in' | 'out';
}

export interface CheckedScheduleItem extends ExtractedScheduleItem {
  certainty?: IncomeCertainty;
  /** 비워둔 칸 — 저장 전에 사용자에게 받는다 */
  missing: ('amount' | 'day')[];
}

/** 문장 속 금액 후보: 35만원, 3만 5천원, 12,000원, 6800, 1.5만 */
export function amountsIn(text: string): Set<number> {
  const out = new Set<number>();
  const t = text.replace(/\s+/g, ' ');
  for (const m of t.matchAll(/(\d+(?:\.\d+)?)\s*만(?:\s*(\d+)\s*천)?/g)) out.add(Math.round(parseFloat(m[1]) * 10000 + (m[2] ? Number(m[2]) * 1000 : 0)));
  for (const m of t.matchAll(/(\d+)\s*천/g)) out.add(Number(m[1]) * 1000);
  for (const m of t.matchAll(/\d{1,3}(?:,\d{3})+|\d+/g)) out.add(Number(m[0].replace(/,/g, '')));
  return out;
}

/** 문장 속 날짜(일) 후보: 5일, 10/29, 10월 29일 */
export function daysIn(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.matchAll(/(\d{1,2})\s*일/g)) out.add(Number(m[1]));
  for (const m of text.matchAll(/\d{1,2}\s*[/.]\s*(\d{1,2})(?!\d)/g)) out.add(Number(m[1]));
  if (/말일/.test(text)) out.add(31);
  return out;
}

export function groundSchedule(text: string, items: ExtractedScheduleItem[]): CheckedScheduleItem[] {
  const amounts = amountsIn(text);
  const days = daysIn(text);
  return items.map((it) => {
    const amount = it.amount !== null && amounts.has(it.amount) ? it.amount : null;
    const day = it.day !== null && it.day >= 1 && it.day <= 31 && days.has(it.day) ? it.day : null;
    const missing: CheckedScheduleItem['missing'] = [];
    if (amount === null) missing.push('amount');
    if (day === null) missing.push('day');
    return { ...it, amount, day, missing, ...(it.direction === 'in' ? { certainty: 'scheduled' as const } : {}) };
  });
}
