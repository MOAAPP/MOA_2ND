/**
 * 모아 AI 작업별 입력·출력 스키마 (Zod).
 * JSON 파싱에 성공했다고 올바른 금융 거래라는 뜻은 아니므로, 서버는 모델에 보내기 전 입력을,
 * 모델이 돌려준 뒤 출력을 한 번 더 검사한다. 출력은 strict: 예상하지 못한 필드가 있으면 거부한다.
 * 타입 정의는 shared/aiPrompts.ts 와 같아야 한다 (tests/aiSchemas.test.ts 에서 예시 응답으로 확인).
 */
import { z } from 'zod';
import type { AiTask } from './aiPrompts';

/** 실제 달력에 있는 YYYY-MM-DD 만 */
export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD 형식이어야 해요').refine((s) => {
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}, '없는 날짜예요');

/** 한 건 금액 상한 1억 원. 원 단위 정수. */
export const MAX_AMOUNT = 100_000_000;
const won = z.number().int().min(0).max(MAX_AMOUNT);
const wonSigned = z.number().int().min(-MAX_AMOUNT * 10).max(MAX_AMOUNT * 10);
const positiveWon = won.min(1);
const shortText = (max: number) => z.string().trim().min(1).max(max);
const confidence = z.number().min(0).max(1);
const named = z.object({ name: shortText(40), amount: wonSigned }).strict();

/* ───────── 입력 ───────── */

const briefIn = z.object({
  usable: wonSigned,
  daysLeftInMonth: z.number().int().min(0).max(31),
  monthSpent: won.max(MAX_AMOUNT * 10),
  lastMonthSameDay: won.max(MAX_AMOUNT * 10).nullable(),
  topCategory: named.nullable(),
  savedThisMonth: won.max(MAX_AMOUNT * 10),
  holdsThisMonth: z.number().int().min(0).max(10_000),
  nextBill: z.object({ date: isoDate, amount: won }).strict().nullable(),
});

const coachIn = z.object({
  item: shortText(60),
  category: shortText(30),
  price: positiveWon,
  frequency: z.enum(['once', 'weekly', 'daily']),
  usableNow: wonSigned,
  usableAfter: wonSigned,
  afterBills: wonSigned,
  yearGap: wonSigned,
  categorySpentThisMonth: won.max(MAX_AMOUNT * 10),
  categoryCount30: z.number().int().min(0).max(10_000),
});

const ledgerSummaryIn = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/),
  total: won.max(MAX_AMOUNT * 10),
  prevTotal: won.max(MAX_AMOUNT * 10).nullable(),
  count: z.number().int().min(0).max(100_000),
  elapsedDays: z.number().int().min(0).max(31),
  byCategory: z.array(named).max(30),
  busiestWeekday: z.object({ day: shortText(10), average: won }).strict().nullable(),
  biggest: named.nullable(),
});

const textIn = z.object({ text: z.string().trim().min(1).max(4000), today: isoDate });

const categorizeIn = z.object({ name: shortText(60), categories: z.array(shortText(30)).min(1).max(40) });

const askIn = z.object({
  question: shortText(500),
  context: z.object({
    usable: wonSigned,
    monthSpent: won.max(MAX_AMOUNT * 10),
    topCategories: z.array(named).max(10),
    savedTotal: won.max(MAX_AMOUNT * 10),
    holdRate: z.number().min(0).max(1).nullable(),
    goal: z.object({ name: shortText(40), target: won, saved: won }).strict().nullable(),
  }),
});

/* ───────── 출력 ───────── */

const briefOut = z.object({
  headline: shortText(80),
  body: shortText(300),
  action: z.object({ label: shortText(20), to: z.enum(['choose', 'ledger', 'save', 'forks']) }).strict().nullable(),
}).strict();

const coachOut = z.object({ tone: z.enum(['ok', 'careful', 'warn']), message: shortText(300), tip: shortText(200).nullable() }).strict();

const ledgerSummaryOut = z.object({ title: shortText(80), points: z.array(shortText(200)).min(1).max(6) }).strict();

export const parsedSpend = z.object({
  date: isoDate.nullable(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  amount: positiveWon,
  name: shortText(60),
  category: shortText(30),
  method: z.enum(['debit', 'credit', 'transfer', 'cash', 'atm']).nullable().optional(),
  kind: z.enum(['spend', 'income', 'card_payment', 'transfer_self', 'saving', 'refund']).optional(),
  issuer: z.string().trim().max(30).nullable().optional(),
  installments: z.number().int().min(1).max(60).nullable().optional(),
  balanceAfter: wonSigned.nullable().optional(),
  essential: z.boolean().optional(),
  confidence,
}).strict();

const parseSpendOut = z.object({ items: z.array(parsedSpend).max(50), skipped: z.number().int().min(0).max(1000) }).strict();

const parsedSchedule = z.object({
  name: shortText(40),
  amount: positiveWon.nullable(),
  direction: z.enum(['in', 'out']).nullable(),
  date: isoDate.nullable(),
  day: z.number().int().min(1).max(31).nullable(),
  recurrence: z.enum(['monthly', 'once']).nullable(),
}).strict();

const parseScheduleOut = z.object({ items: z.array(parsedSchedule).max(30) }).strict();

const categorizeOut = z.object({ category: shortText(30), confidence, reason: shortText(200) }).strict();

const askOut = z.object({ answer: shortText(800), followUps: z.array(shortText(80)).max(4) }).strict();

export const AI_SCHEMAS: { [T in AiTask]: { input: z.ZodTypeAny; output: z.ZodTypeAny } } = {
  brief: { input: briefIn, output: briefOut },
  coach: { input: coachIn, output: coachOut },
  ledgerSummary: { input: ledgerSummaryIn, output: ledgerSummaryOut },
  parseSpend: { input: textIn, output: parseSpendOut },
  parseSchedule: { input: textIn, output: parseScheduleOut },
  categorize: { input: categorizeIn, output: categorizeOut },
  ask: { input: askIn, output: askOut },
};

export type Checked<T> = { ok: true; data: T } | { ok: false; issues: string[] };

function check<T>(schema: z.ZodTypeAny, value: unknown): Checked<T> {
  const r = schema.safeParse(value);
  if (r.success) return { ok: true, data: r.data as T };
  return { ok: false, issues: r.error.issues.slice(0, 5).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
}

/** 입력: 모르는 필드는 버리고(클라이언트 버전 차이 허용), 형식이 틀리면 거부 */
export const checkAiInput = <T = unknown>(task: AiTask, input: unknown) => check<T>(AI_SCHEMAS[task].input, input);
/** 출력: 모르는 필드까지 거부 */
export const checkAiOutput = <T = unknown>(task: AiTask, output: unknown) => check<T>(AI_SCHEMAS[task].output, output);

/** 거래 추출 결과 중 신뢰도가 낮은 항목 (사용자 확인을 먼저 받는다) */
export const LOW_CONFIDENCE = 0.6;
