import { describe, expect, it } from 'vitest';
import { AI_PROMPTS, buildUserMessage, numbersGrounded } from '../shared/aiPrompts';
import { runAi, setExampleDelay } from '../src/lib/ai';
import { askContext, briefInput, coachInput, ledgerSummaryInput } from '../src/lib/ai/context';
import { exampleAsk, exampleBrief, exampleCoach, exampleLedgerSummary, exampleParseSpend, josa } from '../src/lib/ai/example';
import { demoWorldWallet } from '../src/lib/demoWorld';
import type { SpendEntry } from '../src/lib/ml/types';

setExampleDelay(() => 0);
const TODAY = '2026-10-29';
const NOW = Date.parse('2026-10-29T20:00:00+09:00');
const e = (date: string, amount: number, category: string, name = category): SpendEntry => ({ date, amount, category, name, from: 'record' });
const LOG: SpendEntry[] = [
  e('2026-09-03', 30_000, '식비'), e('2026-09-10', 20_000, '카페'),
  e('2026-10-02', 4_500, '카페', '라떼'), e('2026-10-09', 5_000, '카페', '라떼'), e('2026-10-16', 4_800, '카페', '라떼'), e('2026-10-23', 6_000, '카페', '디저트'),
  e('2026-10-20', 89_000, '패션', '니트'), e('2026-10-27', 12_000, '식비', '점심'),
];

describe('AI 입력(숫자는 앱이 계산)', () => {
  it('가계부 요약 입력: 합계·지난달·카테고리', () => {
    const i = ledgerSummaryInput(LOG, '2026-10-01', TODAY);
    expect(i.total).toBe(121_300);
    expect(i.prevTotal).toBe(50_000);
    expect(i.byCategory[0]).toEqual({ name: '패션', amount: 89_000 });
    expect(i.count).toBe(6);
  });
  it('코치 입력: 같은 카테고리 30일 횟수', () => {
    const c = coachInput({ item: '라떼', category: '카페', price: 5_000, frequency: 'daily', usableNow: 100_000, usableAfter: 85_000, afterBills: 300_000, yearGap: 1_800_000 }, LOG, TODAY);
    expect(c.categoryCount30).toBe(4);
    expect(c.categorySpentThisMonth).toBe(20_300);
  });
  it('브리핑·물어보기 입력은 지갑과 가계부를 합친다', () => {
    const w = demoWorldWallet(NOW);
    const b = briefInput(w, LOG, TODAY);
    expect(b.daysLeftInMonth).toBe(3);
    expect(b.monthSpent).toBe(121_300);
    const a = askContext(w, LOG, TODAY, null);
    expect(a.savedTotal).toBe(621_000);
  });
});

describe('예시 AI 응답', () => {
  it('브리핑: 쓸 돈을 넘으면 경고, 아니면 하루 금액', () => {
    const base = { usable: 90_000, daysLeftInMonth: 3, monthSpent: 50_000, lastMonthSameDay: 60_000, topCategory: null, savedThisMonth: 0, holdsThisMonth: 0, nextBill: { date: '2026-11-01', amount: 530_000 } };
    expect(exampleBrief({ ...base, usable: -5_000 }).action?.to).toBe('choose');
    expect(exampleBrief(base).headline).toContain('30,000원');
    expect(exampleBrief({ ...base, holdsThisMonth: 2, savedThisMonth: 40_000 }).action?.to).toBe('save');
  });
  it('코치: 모자라면 warn, 자주 사면 careful', () => {
    const c = { item: 'x', category: '카페', price: 5_000, frequency: 'once' as const, usableNow: 100_000, usableAfter: 95_000, afterBills: 1, yearGap: 0, categorySpentThisMonth: 0, categoryCount30: 0 };
    expect(exampleCoach({ ...c, usableAfter: -1 }).tone).toBe('warn');
    expect(exampleCoach({ ...c, categoryCount30: 4, categorySpentThisMonth: 20_000 }).tone).toBe('careful');
    expect(exampleCoach(c).tone).toBe('ok');
  });
  it('요약 제목 조사: 패션이 / 카페가', () => {
    expect(josa('패션', '이', '가')).toBe('이');
    expect(josa('카페', '이', '가')).toBe('가');
    expect(exampleLedgerSummary(ledgerSummaryInput(LOG, '2026-10-01', TODAY)).title).toBe('10월은 패션이 제일 커요');
  });
  it('카드 문자: 승인취소는 빼고, 누적 금액은 무시하고, 가게 이름을 찾는다', () => {
    const text = '[Web발신]\n신한카드(1234)승인\n김*현님\n6,800원 일시불\n10/29 08:42\n메가커피 서울여대점\n누적 412,300원\n\n[Web발신]\n삼성카드 승인취소\n32,000원\n10/28\n무신사\n\n[Web발신]\n토스뱅크 체크카드\n1,450원\n10/27 07:55\n서울교통공사 지하철';
    const r = exampleParseSpend({ text, today: TODAY });
    expect(r.items.map((x) => [x.date, x.amount, x.name, x.category])).toEqual([
      ['2026-10-29', 6_800, '메가커피 서울여대점', '카페'],
      ['2026-10-27', 1_450, '서울교통공사 지하철', '교통'],
    ]);
    expect(r.skipped).toBe(1);
  });
  it('메모 여러 줄, 미래 날짜는 작년으로', () => {
    const r = exampleParseSpend({ text: '스타벅스 5,600원\n12/30 올리브영 23,000원', today: TODAY });
    expect(r.items.map((x) => [x.date, x.amount, x.name])).toEqual([[TODAY, 5_600, '스타벅스'], ['2025-12-30', 23_000, '올리브영']]);
  });
  it('물어보기: 질문 종류에 맞게, 내 숫자로', () => {
    const ctx = { usable: 170_000, monthSpent: 121_300, topCategories: [{ name: '패션', amount: 89_000 }], savedTotal: 621_000, holdRate: 0.6, goal: null };
    expect(exampleAsk({ question: '이번 달 얼마나 더 쓸 수 있어?', context: ctx }).answer).toContain('170,000원');
    expect(exampleAsk({ question: '어디서 돈이 제일 새?', context: ctx }).answer).toContain('패션은');
    expect(exampleAsk({ question: '아무말', context: ctx }).followUps).toHaveLength(2);
  });
});

describe('AI 공통', () => {
  it('runAi는 연결 전에는 예시 응답', async () => {
    const r = await runAi('categorize', { name: '메가커피', categories: ['카페', '기타'] });
    expect(r.source).toBe('example');
    expect(r.data.category).toBe('카페');
  });
  it('모든 작업에 프롬프트·출력 형식이 있다', () => {
    for (const t of Object.keys(AI_PROMPTS) as (keyof typeof AI_PROMPTS)[]) {
      expect(AI_PROMPTS[t].system.length).toBeGreaterThan(50);
      expect(buildUserMessage(t, {} as never)).toContain(AI_PROMPTS[t].schema);
    }
  });
  it('지어낸 금액을 잡는다(차이·합은 허용)', () => {
    const input = { total: 121_300, prevTotal: 50_000 };
    expect(numbersGrounded('ledgerSummary', input, { points: ['121,300원 썼어요', '71,300원 더'] })).toBe(true);
    expect(numbersGrounded('ledgerSummary', input, { points: ['99,999원 썼어요'] })).toBe(false);
  });
});
