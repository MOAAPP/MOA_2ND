/**
 * 모아 AI 작업 정의 — 입력·출력 모양과 프롬프트를 한 곳에 둔다. (docs/AI.md)
 * 클라이언트(예시 응답)와 서버(실제 모델 호출)가 같은 타입을 쓴다.
 *
 * 원칙
 * - 숫자 계산은 코드가 한다. AI는 계산된 숫자를 받아 '말'로 풀어 주거나, 사람이 쓴 글을 구조로 바꾼다.
 * - 응답은 항상 JSON. 모르는 숫자를 지어내지 않는다(서버에서 숫자 검증).
 * - 사기·투자 권유, 단정적인 판단 대신 선택지를 보여준다.
 */

export type AiTask = 'brief' | 'coach' | 'ledgerSummary' | 'parseSpend' | 'parseSchedule' | 'ask' | 'categorize';

/* ───────── 입력·출력 ───────── */

/** 홈 한 줄 브리핑 */
export interface BriefIn {
  usable: number;
  daysLeftInMonth: number;
  monthSpent: number;
  /** 지난달 같은 날짜까지 쓴 돈 (없으면 null) */
  lastMonthSameDay: number | null;
  topCategory: { name: string; amount: number } | null;
  savedThisMonth: number;
  holdsThisMonth: number;
  nextBill: { date: string; amount: number } | null;
}
export interface BriefOut {
  headline: string;
  body: string;
  action: { label: string; to: 'choose' | 'ledger' | 'save' | 'forks' } | null;
}

/** 사기 전 결정 코치 */
export interface CoachIn {
  item: string;
  category: string;
  price: number;
  frequency: 'once' | 'weekly' | 'daily';
  usableNow: number;
  usableAfter: number;
  afterBills: number;
  yearGap: number;
  /** 같은 카테고리에 이번 달 쓴 돈 */
  categorySpentThisMonth: number;
  /** 최근 30일 같은 카테고리 결제 횟수 */
  categoryCount30: number;
}
export interface CoachOut {
  tone: 'ok' | 'careful' | 'warn';
  message: string;
  tip: string | null;
}

/** 가계부 이번 달 요약 */
export interface LedgerSummaryIn {
  month: string;
  total: number;
  prevTotal: number | null;
  count: number;
  elapsedDays: number;
  byCategory: { name: string; amount: number }[];
  busiestWeekday: { day: string; average: number } | null;
  biggest: { name: string; amount: number } | null;
}
export interface LedgerSummaryOut {
  title: string;
  points: string[];
}

/** 카드 문자·영수증 글 → 거래 기록. text는 반드시 마스킹을 거친 문자열이다. */
export interface ParseSpendIn {
  text: string;
  today: string;
}
export type ParsedMethod = 'debit' | 'credit' | 'transfer' | 'cash' | 'atm';
export type ParsedKind = 'spend' | 'income' | 'card_payment' | 'transfer_self' | 'saving' | 'refund';
export interface ParsedSpend {
  /** 글에 날짜가 없으면 null (지어내지 않는다) */
  date: string | null;
  /** HH:MM, 없으면 null */
  time?: string | null;
  amount: number;
  name: string;
  category: string;
  /** 결제 수단. 글로 알 수 없으면 null */
  method?: ParsedMethod | null;
  kind?: ParsedKind;
  /** 카드·은행 이름 (번호 없이) */
  issuer?: string | null;
  /** 할부 개월 수 */
  installments?: number | null;
  /** 문자에 찍힌 거래 후 잔액 */
  balanceAfter?: number | null;
  /** 월세·통신비·공과금처럼 꼭 내야 하는 돈 */
  essential?: boolean;
  /** 0~1 */
  confidence: number;
}
export interface ParseSpendOut {
  items: ParsedSpend[];
  /** 읽지 못한 줄 */
  skipped: number;
}

/** 일정 문장 → 일정표 ("다음 달 5일 월세 35만원, 10일 알바비 48만원 들어오고") */
export interface ParseScheduleIn {
  text: string;
  today: string;
}
export interface ParsedSchedule {
  name: string;
  /** 글에 금액이 없으면 null */
  amount: number | null;
  /** 들어오는 돈 in / 나가는 돈 out, 알 수 없으면 null */
  direction: 'in' | 'out' | null;
  /** 날짜가 정해진 한 번 (YYYY-MM-DD), 없으면 null */
  date: string | null;
  /** '매달 N일'이면 N, 아니면 null */
  day: number | null;
  recurrence: 'monthly' | 'once' | null;
}
export interface ParseScheduleOut {
  items: ParsedSchedule[];
}

/** 품목 이름 → 카테고리 */
export interface CategorizeIn {
  name: string;
  categories: string[];
}
export interface CategorizeOut {
  category: string;
  confidence: number;
  reason: string;
}

/** 모아에게 물어보기 */
export interface AskIn {
  question: string;
  context: {
    usable: number;
    monthSpent: number;
    topCategories: { name: string; amount: number }[];
    savedTotal: number;
    holdRate: number | null;
    goal: { name: string; target: number; saved: number } | null;
  };
}
export interface AskOut {
  answer: string;
  followUps: string[];
}

export interface AiIO {
  brief: [BriefIn, BriefOut];
  coach: [CoachIn, CoachOut];
  ledgerSummary: [LedgerSummaryIn, LedgerSummaryOut];
  parseSpend: [ParseSpendIn, ParseSpendOut];
  parseSchedule: [ParseScheduleIn, ParseScheduleOut];
  categorize: [CategorizeIn, CategorizeOut];
  ask: [AskIn, AskOut];
}
export type AiInput<T extends AiTask> = AiIO[T][0];
export type AiOutput<T extends AiTask> = AiIO[T][1];

/* ───────── 프롬프트 ───────── */

const COMMON = [
  '당신은 20대를 위한 소비 의사결정 앱 "모아"의 AI 코치예요.',
  '한국어 해요체로 짧고 따뜻하게, 토스 앱처럼 쉬운 말로 써요. 이모지·마크다운은 쓰지 않아요.',
  '입력 JSON에 있는 숫자만 쓰고, 새로운 숫자나 사실을 지어내지 않아요. 금액은 "12,000원"처럼 써요.',
  '사라/사지 마라고 단정하지 않고, 사용자가 스스로 고를 수 있게 선택지를 보여줘요.',
  '투자 종목 추천, 수익 예측, 대출 권유는 하지 않아요.',
  '반드시 지정한 JSON 형식 하나만 출력해요.',
].join('\n');

export const AI_PROMPTS: { [T in AiTask]: { system: string; schema: string; maxTokens: number } } = {
  brief: {
    system: `${COMMON}\n홈 화면 맨 위에 보일 오늘의 한 줄 브리핑을 써요. headline 25자 이내, body 70자 이내. 가장 도움이 되는 행동 하나를 action으로 고르거나 없으면 null.`,
    schema: '{"headline":string,"body":string,"action":{"label":string,"to":"choose"|"ledger"|"save"|"forks"}|null}',
    maxTokens: 200,
  },
  coach: {
    system: `${COMMON}\n사용자가 물건을 사기 전에 보는 화면이에요. 계산된 미래 비용을 보고 한두 문장으로 상황을 짚어 줘요. tone은 usableAfter가 0 미만이면 warn, 같은 카테고리를 자주 샀으면 careful, 아니면 ok. tip은 더 싸게 사거나 미루는 현실적인 방법 하나(없으면 null).`,
    schema: '{"tone":"ok"|"careful"|"warn","message":string,"tip":string|null}',
    maxTokens: 220,
  },
  ledgerSummary: {
    system: `${COMMON}\n가계부 한 달 기록을 요약해요. title 20자 이내, points는 2~3개 문장(각 50자 이내). 지난달과 비교, 가장 큰 카테고리, 습관 하나를 짚어요.`,
    schema: '{"title":string,"points":string[]}',
    maxTokens: 260,
  },
  parseSpend: {
    system: `${COMMON}
사용자가 붙여넣은 카드·은행 문자, 영수증, 메모에서 거래를 찾아 JSON으로 바꿔요. 개인정보는 이미 [이름] [계좌번호] 같은 표시로 가려져 있어요. 가려진 부분을 추측하지 않아요.
- 글에 없는 값은 반드시 null로 둬요. 날짜가 없으면 date는 null, 시각이 없으면 time은 null. 빈칸을 그럴듯하게 채우지 않아요.
- 연도가 없는 날짜는 today의 연도로 쓰되, today보다 미래가 되면 작년으로 봐요.
- method: 체크카드 debit, 신용카드(일시불·할부) credit, 계좌이체·자동이체·출금 transfer, 현금 cash, ATM 인출 atm. 글로 알 수 없으면 null.
- kind: 소비 spend, 입금 income, 카드 대금 출금 card_payment, 내 계좌끼리 이체 transfer_self, 적금 납입 saving, 승인취소·환불 refund.
- balanceAfter: '잔액'으로 찍힌 거래 후 잔액. '누적'·'한도'는 잔액이 아니에요.
- issuer: 카드사·은행 이름만(번호 없이). installments: 할부 개월 수, 일시불이면 null.
- essential: 월세·관리비·통신비·공과금·보험료·학원비처럼 꼭 내야 하는 돈이면 true.
- category는 식비·카페·쇼핑·패션·교통·문화·여가·구독·생활·경조사·기타 중 하나. confidence는 0~1.`,
    schema: '{"items":[{"date":"YYYY-MM-DD"|null,"time":"HH:MM"|null,"amount":number,"name":string,"category":string,"method":"debit"|"credit"|"transfer"|"cash"|"atm"|null,"kind":"spend"|"income"|"card_payment"|"transfer_self"|"saving"|"refund","issuer":string|null,"installments":number|null,"balanceAfter":number|null,"essential":boolean,"confidence":number}],"skipped":number}',
    maxTokens: 900,
  },
  parseSchedule: {
    system: `${COMMON}
사용자가 쓴 돈 일정 문장을 일정표로 바꿔요. 항목마다 이름, 금액, 들어오는지(in)·나가는지(out), 날짜를 뽑아요.
- 금액이나 날짜가 문장에 없으면 null로 둬요. 절대 지어내지 않아요.
- '매달'·'매월'이면 recurrence는 monthly이고 day에 일자를, 날짜가 한 번뿐이면 once이고 date에 YYYY-MM-DD를 써요. '다음 달 5일'은 today 기준 다음 달 5일이에요.
- '들어오고·받고·입금'은 in, '나가·내고·빠져'는 out. 알 수 없으면 null.
- '35만원'은 350000, '1.2만'은 12000처럼 원 단위 정수로 바꿔요.`,
    schema: '{"items":[{"name":string,"amount":number|null,"direction":"in"|"out"|null,"date":"YYYY-MM-DD"|null,"day":number|null,"recurrence":"monthly"|"once"|null}]}',
    maxTokens: 500,
  },
  categorize: {
    system: `${COMMON}\n품목 이름을 보고 categories 중 하나를 골라요. reason은 15자 이내.`,
    schema: '{"category":string,"confidence":number,"reason":string}',
    maxTokens: 80,
  },
  ask: {
    system: `${COMMON}\n사용자의 돈 질문에 context 숫자를 근거로 3~4문장으로 답해요. 모르는 건 모른다고 해요. followUps는 이어서 물어볼 만한 짧은 질문 2개.`,
    schema: '{"answer":string,"followUps":string[]}',
    maxTokens: 400,
  },
};

/** 모델에 보낼 user 메시지 */
export function buildUserMessage<T extends AiTask>(task: T, input: AiInput<T>): string {
  return `작업: ${task}\n출력 형식: ${AI_PROMPTS[task].schema}\n입력:\n${JSON.stringify(input)}`;
}

/** 글 속 금액 후보: 6,800 / 6800 / 35만 / 1.2만 / 3천 */
export function amountsInText(text: string): Set<number> {
  const out = new Set<number>();
  for (const m of text.matchAll(/\d{1,3}(?:,\d{3})+|\d+(?:\.\d+)?/g)) {
    const raw = m[0];
    const n = Number(raw.replace(/,/g, ''));
    if (!Number.isFinite(n)) continue;
    out.add(Math.round(n));
    const after = text.slice((m.index ?? 0) + raw.length, (m.index ?? 0) + raw.length + 2);
    if (/^\s?만/.test(after)) out.add(Math.round(n * 10000));
    if (/^\s?천/.test(after)) out.add(Math.round(n * 1000));
  }
  // 35만 5천 → 355000
  for (const m of text.matchAll(/(\d+)\s?만\s?(\d+)\s?천/g)) out.add(Number(m[1]) * 10000 + Number(m[2]) * 1000);
  return out;
}

/** 추출 결과의 금액이 원문에 있던 숫자인지 (없는 금액을 지어내면 버린다) */
export function extractionGrounded(task: AiTask, input: unknown, output: unknown): boolean {
  if (task !== 'parseSpend' && task !== 'parseSchedule') return true;
  const text = (input as { text?: string })?.text ?? '';
  const known = amountsInText(text);
  const items = (output as { items?: { amount?: number | null; balanceAfter?: number | null }[] })?.items;
  if (!Array.isArray(items)) return false;
  return items.every((it) => (it.amount == null || known.has(Math.round(it.amount))) && (it.balanceAfter == null || known.has(Math.round(it.balanceAfter))));
}

/** 응답에 나온 금액(원)이 입력에 있던 숫자인지 확인 — 지어낸 숫자를 막는다. parseSpend는 글에서 읽으므로 제외. */
export function numbersGrounded(task: AiTask, input: unknown, output: unknown): boolean {
  if (task === 'parseSpend' || task === 'parseSchedule' || task === 'categorize') return true;
  const known = new Set<number>();
  const walk = (v: unknown) => {
    if (typeof v === 'number') { known.add(Math.abs(Math.round(v))); return; }
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  walk(input);
  const text = JSON.stringify(output);
  const found = text.match(/\d{1,3}(,\d{3})+(?=원)|\d{4,}(?=원)/g) ?? [];
  return found.every((s) => {
    const n = Number(s.replace(/,/g, ''));
    // 입력 숫자 그대로이거나, 입력 숫자끼리의 차이·합(지난달 대비 등)까지는 허용
    if (known.has(n)) return true;
    const ks = [...known];
    return ks.some((a) => ks.some((b) => Math.abs(a - b) === n || a + b === n));
  });
}
