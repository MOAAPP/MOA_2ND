/**
 * 모아 AI 작업 정의 — 입력·출력 모양과 프롬프트를 한 곳에 둔다. (docs/AI.md)
 * 클라이언트(예시 응답)와 서버(실제 모델 호출)가 같은 타입을 쓴다.
 *
 * 원칙
 * - 숫자 계산은 코드가 한다. AI는 계산된 숫자를 받아 '말'로 풀어 주거나, 사람이 쓴 글을 구조로 바꾼다.
 * - 응답은 항상 JSON. 모르는 숫자를 지어내지 않는다(서버에서 숫자 검증).
 * - 사기·투자 권유, 단정적인 판단 대신 선택지를 보여준다.
 */

export type AiTask = 'brief' | 'coach' | 'ledgerSummary' | 'parseSpend' | 'ask' | 'categorize';

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

/** 카드 문자·영수증 글 → 지출 기록 */
export interface ParseSpendIn {
  text: string;
  today: string;
}
export interface ParsedSpend {
  date: string;
  amount: number;
  name: string;
  category: string;
  /** 0~1 */
  confidence: number;
}
export interface ParseSpendOut {
  items: ParsedSpend[];
  /** 읽지 못한 줄 */
  skipped: number;
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
    system: `${COMMON}\n사용자가 붙여넣은 카드 승인 문자, 영수증, 메모에서 지출을 찾아 JSON으로 바꿔요. 승인 취소·입금은 빼요. 날짜가 없으면 today, 연도가 없으면 today의 연도. category는 식비·카페·쇼핑·패션·교통·문화·여가·구독·생활·경조사·기타 중 하나. confidence는 0~1.`,
    schema: '{"items":[{"date":"YYYY-MM-DD","amount":number,"name":string,"category":string,"confidence":number}],"skipped":number}',
    maxTokens: 600,
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

/** 응답에 나온 금액(원)이 입력에 있던 숫자인지 확인 — 지어낸 숫자를 막는다. parseSpend는 글에서 읽으므로 제외. */
export function numbersGrounded(task: AiTask, input: unknown, output: unknown): boolean {
  if (task === 'parseSpend' || task === 'categorize') return true;
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
