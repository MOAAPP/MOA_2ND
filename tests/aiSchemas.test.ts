import { afterEach, describe, expect, it } from 'vitest';
import { checkAiInput, checkAiOutput } from '../shared/aiSchemas';
import { exampleAsk, exampleBrief, exampleCategorize, exampleCoach, exampleLedgerSummary, exampleParseSchedule, exampleParseSpend } from '../src/lib/ai/example';
import { aiStats, resetAiStats, runAiTask } from '../server/lib/ai';

const TODAY = '2026-11-03';
const brief = { usable: 90_000, daysLeftInMonth: 27, monthSpent: 50_000, lastMonthSameDay: 60_000, topCategory: { name: '식비', amount: 30_000 }, savedThisMonth: 0, holdsThisMonth: 1, nextBill: { date: '2026-11-11', amount: 300_000 } };
const coach = { item: '니트', category: '패션', price: 24_000, frequency: 'once' as const, usableNow: 150_000, usableAfter: 126_000, afterBills: -150_000, yearGap: 0, categorySpentThisMonth: 0, categoryCount30: 0 };
const ledger = { month: '2026-11', total: 121_300, prevTotal: 50_000, count: 6, elapsedDays: 3, byCategory: [{ name: '패션', amount: 89_000 }], busiestWeekday: null, biggest: { name: '니트', amount: 89_000 } };
const ask = { question: '이번 주에 얼마까지 써도 돼?', context: { usable: 90_000, monthSpent: 50_000, topCategories: [{ name: '식비', amount: 30_000 }], savedTotal: 0, holdRate: null, goal: null } };
const sms = { text: '[Web발신] 신한체크승인 홍*동 12,000원 11/02 12:31 스타벅스', today: TODAY };

describe('AI 입력 스키마', () => {
  it('정상 입력은 통과', () => {
    expect(checkAiInput('brief', brief).ok).toBe(true);
    expect(checkAiInput('coach', coach).ok).toBe(true);
    expect(checkAiInput('ledgerSummary', ledger).ok).toBe(true);
    expect(checkAiInput('parseSpend', sms).ok).toBe(true);
    expect(checkAiInput('ask', ask).ok).toBe(true);
  });
  it('없는 날짜·소수 금액·음수 가격·빈 문장은 거부', () => {
    expect(checkAiInput('parseSpend', { ...sms, today: '2026-02-30' }).ok).toBe(false);
    expect(checkAiInput('coach', { ...coach, price: 1200.5 }).ok).toBe(false);
    expect(checkAiInput('coach', { ...coach, price: -1 }).ok).toBe(false);
    expect(checkAiInput('parseSchedule', { text: '   ', today: TODAY }).ok).toBe(false);
  });
  it('입력의 모르는 필드는 버린다 (거부하지 않음)', () => {
    const r = checkAiInput<{ extra?: unknown }>('parseSpend', { ...sms, extra: 1 });
    expect(r.ok && r.data.extra).toBe(undefined);
  });
});

describe('AI 출력 스키마', () => {
  it('예시 응답은 모두 출력 스키마를 통과 (예시와 실제 응답의 형식이 같다)', () => {
    expect(checkAiOutput('brief', exampleBrief(brief)).ok).toBe(true);
    expect(checkAiOutput('coach', exampleCoach(coach)).ok).toBe(true);
    expect(checkAiOutput('ledgerSummary', exampleLedgerSummary(ledger)).ok).toBe(true);
    expect(checkAiOutput('parseSpend', exampleParseSpend(sms)).ok).toBe(true);
    expect(checkAiOutput('parseSchedule', exampleParseSchedule({ text: '매달 5일 월세 35만원', today: TODAY })).ok).toBe(true);
    expect(checkAiOutput('categorize', exampleCategorize({ name: '라떼', categories: ['카페', '식비'] })).ok).toBe(true);
    expect(checkAiOutput('ask', exampleAsk(ask)).ok).toBe(true);
  });
  it('거래 추출: 범위 밖 신뢰도, 잘못된 결제 수단, 0원, 모르는 필드는 거부', () => {
    const item = { date: '2026-11-02', amount: 12_000, name: '스타벅스', category: '카페', method: 'debit', confidence: 0.9 };
    expect(checkAiOutput('parseSpend', { items: [item], skipped: 0 }).ok).toBe(true);
    expect(checkAiOutput('parseSpend', { items: [{ ...item, confidence: 1.4 }], skipped: 0 }).ok).toBe(false);
    expect(checkAiOutput('parseSpend', { items: [{ ...item, method: 'paypal' }], skipped: 0 }).ok).toBe(false);
    expect(checkAiOutput('parseSpend', { items: [{ ...item, amount: 0 }], skipped: 0 }).ok).toBe(false);
    expect(checkAiOutput('parseSpend', { items: [{ ...item, account_no: '110-123' }], skipped: 0 }).ok).toBe(false);
    expect(checkAiOutput('parseSpend', { items: [{ ...item, time: '25:10' }], skipped: 0 }).ok).toBe(false);
  });
});


describe('runAiTask: 외부 AI 사용 가능한 작업의 오류 구분', () => {
  const cat = { name: '라떼', categories: ['카페', '식비'] };
  const valid = { category: '카페', confidence: 0.9, reason: '커피 음료' };
  const reply = (text: string, status = 200) =>
    (async () => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status })) as never;

  afterEach(() => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.FACTCHAT_API_KEY;
    delete process.env.FACTCHAT_BASE_URL;
    delete process.env.FACTCHAT_MODEL;
    delete process.env.AI_ENABLED;
    resetAiStats();
  });

  it('문자·일정은 키 설정과 관계없이 AI 모델을 부르지 않는다', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    process.env.FACTCHAT_API_KEY = 'fc_test';
    let called = false;
    const fake = (async () => {
      called = true;
      throw new Error('financial SMS must never call the provider');
    }) as never;
    expect(await runAiTask('parseSpend', sms, fake)).toMatchObject({ ok: false, reason: 'rules_only' });
    expect(await runAiTask('parseSchedule', { text: '매달 25일 월세 350000원', today: TODAY }, fake))
      .toMatchObject({ ok: false, reason: 'rules_only' });
    expect(called).toBe(false);
  });

  it('다른 허용된 AI 작업은 키 없으면 not_configured', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.FACTCHAT_API_KEY;
    const result = await runAiTask('categorize', cat);
    expect(result).toMatchObject({ ok: false, reason: 'not_configured' });
  });

  it('다른 허용된 AI 작업은 검증된 응답을 처리한다', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    const result = await runAiTask('categorize', cat, reply(JSON.stringify(valid)));
    expect(result.ok).toBe(true);
    expect(aiStats().categorize.ok).toBe(1);
  });

  it('틀린 스키마, 잘못된 JSON, HTTP 오류를 구분한다', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    const bad = { ...valid, confidence: 'high' };
    expect(await runAiTask('categorize', cat, reply(JSON.stringify(bad))))
      .toMatchObject({ ok: false, reason: 'invalid_output' });
    expect(await runAiTask('categorize', cat, reply('JSON 없음')))
      .toMatchObject({ ok: false, reason: 'no_json' });
    expect(await runAiTask('categorize', cat, reply('{}', 500)))
      .toMatchObject({ ok: false, reason: 'http_error' });
    expect(aiStats().categorize.fail)
      .toEqual({ invalid_output: 1, no_json: 1, http_error: 1 });
  });

  it('숫자 근거 검사도 허용된 AI 작업에서 수행한다', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    const input = brief;
    const ungrounded = {
      headline: '99,999원 지출',
      body: '지출 기록을 확인해 주세요.',
      action: null,
    };
    expect(await runAiTask('brief', input, reply(JSON.stringify(ungrounded))))
      .toMatchObject({ ok: false, reason: 'ungrounded' });
  });

  it('FactChat 게이트웨이를 허용된 AI 작업에만 연결한다', async () => {
    process.env.FACTCHAT_API_KEY = 'fc_test';
    process.env.ANTHROPIC_API_KEY = 'should-not-be-used';
    const calls: { url: string; init: RequestInit }[] = [];
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify(valid) } }] }), { status: 200 });
    }) as never;
    const result = await runAiTask('categorize', cat, fetcher);
    expect(result.ok).toBe(true);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toContain('/v1/gateway/chat/completions');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer fc_test');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].content).toContain('라떼');
    expect(body.messages[1].content).not.toContain('신한체크승인');
  });

  it('FactChat 주소·모델 설정과 실패 시 HTTP 오류를 처리한다', async () => {
    process.env.FACTCHAT_API_KEY = 'fc_test';
    process.env.FACTCHAT_BASE_URL = 'https://swu.factchat.bot/v1/gateway/';
    process.env.FACTCHAT_MODEL = 'gpt-5';
    let calledUrl = '';
    const result = await runAiTask('categorize', cat,
      (async (url: string) => {
        calledUrl = url;
        return new Response('{}', { status: 403 });
      }) as never);
    expect(calledUrl).toBe('https://swu.factchat.bot/v1/gateway/chat/completions');
    expect(result).toMatchObject({ ok: false, reason: 'http_error' });
  });

  it('AI_ENABLED=off면 허용된 AI 작업도 키와 무관하게 비활성', async () => {
    process.env.FACTCHAT_API_KEY = 'fc_test';
    process.env.AI_ENABLED = 'off';
    let called = false;
    const result = await runAiTask('categorize', cat,
      (async () => { called = true; return new Response('{}'); }) as never);
    expect(result).toMatchObject({ ok: false, reason: 'not_configured' });
    expect(called).toBe(false);
  });
});
