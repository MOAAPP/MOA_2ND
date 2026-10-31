/**
 * 예시 AI 응답 (모델 연결 전).
 * 실제 모델과 같은 입력·출력 모양(shared/aiPrompts.ts)을 쓰고, 받은 숫자로 문장을 만든다.
 * 그래서 화면은 지금도 '내 데이터에 맞는' 답을 보여주고, 나중에 모델로 바꿔도 화면 코드는 그대로다.
 */
import type {
  AskIn, AskOut, BriefIn, BriefOut, CategorizeIn, CategorizeOut, CoachIn, CoachOut,
  LedgerSummaryIn, LedgerSummaryOut, ParseScheduleIn, ParseScheduleOut, ParseSpendIn, ParseSpendOut,
} from '../../../shared/aiPrompts';
import { CATEGORIES } from '../categories';
import { ruleClassify } from '../ml/classify';
import { ruleParseSchedule, ruleParseSpend } from './parseRules';

const won = (n: number) => `${Math.round(Math.abs(n)).toLocaleString('ko-KR')}원`;
const man = (n: number) => {
  const a = Math.abs(n);
  if (a >= 10_000) { const v = Math.round(a / 1000) / 10; return `${Number.isInteger(v) ? v : v.toFixed(1)}만 원`; }
  return won(a);
};

/* ───────── 홈 브리핑 ───────── */
export function exampleBrief(i: BriefIn): BriefOut {
  const perDay = i.daysLeftInMonth > 0 ? Math.max(0, Math.floor(i.usable / i.daysLeftInMonth / 100) * 100) : 0;
  if (i.usable < 0) {
    return {
      headline: '이번 달 쓸 돈을 넘었어요',
      body: `지켜둘 생활비에서 ${won(i.usable)}을 꺼내 쓴 상태예요. 다음 지출은 사기 전에 한 번만 비교해 봐요.`,
      action: { label: '사기 전에 비교하기', to: 'choose' },
    };
  }
  if (i.lastMonthSameDay !== null && i.monthSpent > i.lastMonthSameDay * 1.15 && i.topCategory) {
    return {
      headline: `지난달보다 ${man(i.monthSpent - i.lastMonthSameDay)} 더 쓰는 중`,
      body: `${i.topCategory.name}에 ${won(i.topCategory.amount)}을 썼어요. 남은 ${i.daysLeftInMonth}일은 하루 ${won(perDay)} 안에서 쓰면 돼요.`,
      action: { label: '가계부 보기', to: 'ledger' },
    };
  }
  if (i.holdsThisMonth > 0) {
    return {
      headline: `이번 달 ${i.holdsThisMonth}번 참아서 ${man(i.savedThisMonth)} 지켰어요`,
      body: `남은 ${i.daysLeftInMonth}일은 하루 ${won(perDay)}씩 쓸 수 있어요. 지킨 돈은 예금에 넣으면 이자가 붙어요.`,
      action: i.savedThisMonth >= 10_000 ? { label: '예금으로 굴리기', to: 'save' } : { label: '평행세계 보기', to: 'forks' },
    };
  }
  return {
    headline: `남은 ${i.daysLeftInMonth}일, 하루 ${won(perDay)}까지 괜찮아요`,
    body: i.nextBill ? `${Number(i.nextBill.date.slice(5, 7))}월 ${Number(i.nextBill.date.slice(8, 10))}일에 고정지출 ${won(i.nextBill.amount)}이 나가요. 그 돈은 이미 빼고 계산했어요.` : '사고 싶은 게 생기면 사기 전에 두 세계를 먼저 비교해 봐요.',
    action: { label: '사기 전에 비교하기', to: 'choose' },
  };
}

/* ───────── 결정 코치 ───────── */
const TIPS: Record<string, string> = {
  카페: '텀블러 할인이나 앱 쿠폰이 있는 곳으로 바꾸면 한 잔에 300~500원 아낄 수 있어요.',
  식비: '배달 대신 포장하면 배달비만큼 바로 아껴요.',
  쇼핑: '장바구니에 넣고 24시간 뒤에도 갖고 싶은지 확인해 봐요.',
  패션: '같은 제품을 리셀·중고 앱에서 먼저 찾아보면 30% 넘게 싼 경우가 많아요.',
  교통: '막차 전이라면 대중교통, 같은 방향 친구와 합승도 방법이에요.',
  '문화·여가': '학생 할인이나 평일 할인 회차가 있는지 먼저 봐요.',
  구독: '연간 결제보다 한 달만 결제하고 정말 쓰는지 확인해 봐요.',
};

export function exampleCoach(i: CoachIn): CoachOut {
  const tip = TIPS[i.category] ?? null;
  if (i.usableAfter < 0) {
    return { tone: 'warn', message: `사면 이번 달 쓸 수 있는 돈이 ${won(i.usableAfter)} 모자라요. 지켜둘 생활비를 꺼내 쓰게 돼요.`, tip: tip ?? '다음 달 1일 월급 뒤로 미루면 안전선을 지킬 수 있어요.' };
  }
  if (i.categoryCount30 >= 3 && i.categorySpentThisMonth > 0) {
    return { tone: 'careful', message: `최근 30일 동안 ${i.category}에 ${i.categoryCount30}번 결제했어요. 이번 달만 ${won(i.categorySpentThisMonth)}이에요.`, tip };
  }
  if (i.frequency !== 'once' && i.yearGap > 0) {
    return { tone: 'careful', message: `${i.frequency === 'daily' ? '매일' : '매주'} 사면 작아 보여도 1년이면 ${won(i.yearGap)} 차이가 나요.`, tip };
  }
  const share = i.usableNow > 0 ? Math.round((i.price / i.usableNow) * 100) : 100;
  return {
    tone: share >= 50 ? 'careful' : 'ok',
    message: share >= 50 ? `이번 달 쓸 수 있는 돈의 ${share}%를 한 번에 써요. 꼭 지금이어야 하는지 생각해 봐요.` : `사도 이번 달 ${won(i.usableAfter)}이 남아요. 필요한 거라면 괜찮은 선택이에요.`,
    tip,
  };
}

/* ───────── 가계부 요약 ───────── */
export function exampleLedgerSummary(i: LedgerSummaryIn): LedgerSummaryOut {
  const m = Number(i.month.slice(5, 7));
  if (!i.count) return { title: `${m}월은 아직 조용해요`, points: ['기록이 쌓이면 어디에 많이 쓰는지 정리해 드릴게요.'] };
  const points: string[] = [];
  const top = i.byCategory[0];
  if (top) points.push(`${top.name}에 ${won(top.amount)}, 전체의 ${Math.round((top.amount / Math.max(1, i.total)) * 100)}%를 썼어요.`);
  if (i.prevTotal !== null) {
    const d = i.total - i.prevTotal;
    points.push(d > 0 ? `지난달 같은 기간보다 ${won(d)} 더 썼어요.` : d < 0 ? `지난달 같은 기간보다 ${won(d)} 덜 썼어요. 잘하고 있어요.` : '지난달 같은 기간과 똑같이 썼어요.');
  }
  if (i.busiestWeekday) points.push(`${i.busiestWeekday.day}에 하루 평균 ${won(i.busiestWeekday.average)}으로 가장 많이 써요.`);
  else if (i.biggest) points.push(`가장 큰 지출은 ${i.biggest.name} ${won(i.biggest.amount)}이에요.`);
  const per = Math.round(i.total / Math.max(1, i.elapsedDays) / 100) * 100;
  const title = i.prevTotal !== null && i.total < i.prevTotal ? `${m}월, 지난달보다 아끼는 중` : top ? `${m}월은 ${top.name}${josa(top.name, '이', '가')} 제일 커요` : `${m}월 하루 ${won(per)}꼴`;
  return { title, points: points.slice(0, 3) };
}

/* ───────── 문자·영수증 읽기 ───────── */
/** 받침 있으면 a, 없으면 b (이/가, 은/는, 을/를) */
export function josa(word: string, a: string, b: string) {
  const ch = word.trim().slice(-1);
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return /[013678lmnr]$/i.test(ch) ? a : b;
  return code % 28 ? a : b;
}

/** 문자 읽기 예시 응답 = 정규식 파서 (LLM 비교군과 같은 코드) */
export function exampleParseSpend(i: ParseSpendIn): ParseSpendOut {
  return ruleParseSpend(i);
}

export function exampleParseSchedule(i: ParseScheduleIn): ParseScheduleOut {
  return ruleParseSchedule(i);
}

/* ───────── 카테고리 ───────── */
export function exampleCategorize(i: CategorizeIn): CategorizeOut {
  const c = ruleClassify(i.name);
  const ok = c && i.categories.includes(c.category);
  return ok
    ? { category: c!.category, confidence: Math.round(c!.confidence * 100) / 100, reason: `'${i.name.slice(0, 8)}'와 비슷한 기록` }
    : { category: i.categories.includes('기타') ? '기타' : (CATEGORIES[CATEGORIES.length - 1] as string), confidence: 0.3, reason: '비슷한 기록이 없어요' };
}

/* ───────── 물어보기 ───────── */
export const ASK_SUGGESTIONS = ['이번 달 얼마나 더 쓸 수 있어?', '어디서 돈이 제일 새?', '예금이랑 적금 중 뭐가 나아?', '비상금은 얼마나 모아야 해?'];

type Rule = { test: RegExp; answer: (c: AskIn['context']) => string; followUps: string[] };
const RULES: Rule[] = [
  {
    test: /(얼마|더 쓸|남았|쓸 수)/,
    answer: (c) => c.usable >= 0
      ? `지금 이번 달에 자유롭게 쓸 수 있는 돈은 ${won(c.usable)}이에요. 월세·통신비 같은 고정지출과 지켜둘 생활비는 이미 빼고 계산했어요. 큰 지출이 생기면 사기 전에 비교 화면에서 결제일 잔고를 먼저 확인해 봐요.`
      : `이번 달은 쓸 수 있는 돈보다 ${won(c.usable)} 더 썼어요. 지켜둘 생활비를 꺼내 쓰는 중이라, 다음 월급 전까지는 꼭 필요한 것만 사는 게 좋아요.`,
    followUps: ['어디서 돈이 제일 새?', '하루에 얼마씩 쓰면 돼?'],
  },
  {
    test: /(새|많이|어디|카테고리|줄이)/,
    answer: (c) => c.topCategories.length
      ? `이번 달은 ${c.topCategories.map((t) => `${t.name} ${won(t.amount)}`).slice(0, 2).join(', ')} 순으로 많이 썼어요. ${c.topCategories[0].name}${josa(c.topCategories[0].name, '은', '는')} 한 번에 크지 않아도 자주 나가는 항목이라, 일주일에 한 번만 줄여도 차이가 커요.`
      : '아직 이번 달 지출 기록이 거의 없어요. 가계부에 며칠만 적어도 어디서 많이 쓰는지 알려 드릴게요.',
    followUps: ['카페값 줄이는 방법 알려줘', '이번 달 얼마나 더 쓸 수 있어?'],
  },
  {
    test: /(예금|적금|저축|이자)/,
    answer: () => '목돈이 이미 있으면 예금, 매달 조금씩 모으려면 적금이 맞아요. 같은 금리라도 적금은 넣은 기간만큼만 이자가 붙어서 실제 받는 이자는 예금의 절반 정도예요. 참아서 아낀 돈이 생길 때마다 넣고 싶다면 자유적립 적금이 편해요.',
    followUps: ['비상금은 얼마나 모아야 해?', '이자에도 세금이 붙어?'],
  },
  {
    test: /(비상금|안전|모아야)/,
    answer: (c) => `보통 한 달 생활비의 3배 정도를 권해요. 이번 달 쓴 돈(${won(c.monthSpent)}) 기준으로 시작해 보고, 처음엔 한 달 치만 모아도 충분해요. 지금까지 다르게 선택해서 지킨 돈은 ${won(c.savedTotal)}이에요.`,
    followUps: ['예금이랑 적금 중 뭐가 나아?', '목표까지 얼마나 걸려?'],
  },
  {
    test: /(세금|이자소득)/,
    answer: () => '네, 예금·적금 이자에는 15.4%가 세금으로 빠져요. 이자 1만 원이면 1,540원을 빼고 8,460원을 받아요. 모아의 가입 화면에 나오는 금액은 모두 세금을 뺀 값이에요.',
    followUps: ['예금이랑 적금 중 뭐가 나아?', '이번 달 얼마나 더 쓸 수 있어?'],
  },
  {
    test: /(목표|여행|언제)/,
    answer: (c) => c.goal ? `${c.goal.name} 목표 ${won(c.goal.target)} 중 ${won(c.goal.saved)}을 모았어요. 남은 건 ${won(c.goal.target - c.goal.saved)}이에요. 참아서 아낀 돈을 바로 옮기면 더 빨라져요.` : '아직 목표가 없어요. 여행이나 노트북처럼 구체적인 목표를 정하면 참은 돈이 어디로 가는지 보여서 훨씬 덜 아까워요.',
    followUps: ['비상금은 얼마나 모아야 해?', '어디서 돈이 제일 새?'],
  },
  {
    test: /(카페|커피)/,
    answer: () => '하루 한 잔 4,500원이면 한 달에 13만 원이 넘어요. 매일 끊기보다 주 2번만 집에서 마시거나 텀블러 할인을 쓰는 게 오래가요. 사기 전 비교에서 "매일"을 고르면 1년 차이를 바로 볼 수 있어요.',
    followUps: ['어디서 돈이 제일 새?', '이번 달 얼마나 더 쓸 수 있어?'],
  },
  {
    test: /(하루)/,
    answer: (c) => `이번 달 남은 돈 ${won(Math.max(0, c.usable))}을 남은 날로 나누면 홈 화면 브리핑에 나온 하루 금액이 돼요. 주말에 더 쓰는 편이면 평일엔 조금 아껴 두는 게 좋아요.`,
    followUps: ['어디서 돈이 제일 새?', '비상금은 얼마나 모아야 해?'],
  },
];

export function exampleAsk(i: AskIn): AskOut {
  const q = i.question.trim();
  const rule = RULES.find((r) => r.test.test(q));
  if (rule) return { answer: rule.answer(i.context), followUps: rule.followUps };
  return {
    answer: `좋은 질문이에요. 지금은 예시 응답이라 정해진 질문에 가장 잘 답해요. 참고로 이번 달 쓴 돈은 ${won(i.context.monthSpent)}, 다르게 선택해서 지킨 돈은 ${won(i.context.savedTotal)}이에요.`,
    followUps: ASK_SUGGESTIONS.slice(0, 2),
  };
}
