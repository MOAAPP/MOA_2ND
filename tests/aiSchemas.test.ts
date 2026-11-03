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

describe('runAiTask: 실패 사유를 구분해 돌려준다', () => {
  const reply = (text: string, status = 200) => (async () => new Response(JSON.stringify({ content: [{ type: 'text', text }] }), { status })) as never;
  afterEach(() => { delete process.env.ANTHROPIC_API_KEY; resetAiStats(); });

  it('키가 없으면 not_configured', async () => {
    const r = await runAiTask('parseSpend', sms);
    expect(r).toMatchObject({ ok: false, reason: 'not_configured' });
  });
  it('스키마를 통과한 응답만 성공', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    const good = JSON.stringify({ items: [{ date: '2026-11-02', amount: 12_000, name: '스타벅스', category: '카페', method: 'debit', confidence: 0.9 }], skipped: 0 });
    const r = await runAiTask('parseSpend', sms, reply(`결과: ${good}`));
    expect(r.ok).toBe(true);
    expect(aiStats().parseSpend.ok).toBe(1);
  });
  it('형식이 틀리면 invalid_output, 글에 없는 금액이면 ungrounded, JSON이 없으면 no_json', async () => {
    process.env.ANTHROPIC_API_KEY = 'test';
    const bad = JSON.stringify({ items: [{ date: '2026-11-02', amount: 12_000, name: 'x', category: '카페', confidence: 'high' }], skipped: 0 });
    expect(await runAiTask('parseSpend', sms, reply(bad))).toMatchObject({ ok: false, reason: 'invalid_output' });
    const made = JSON.stringify({ items: [{ date: '2026-11-02', amount: 99_000, name: '스타벅스', category: '카페', confidence: 0.9 }], skipped: 0 });
    expect(await runAiTask('parseSpend', sms, reply(made))).toMatchObject({ ok: false, reason: 'ungrounded' });
    expect(await runAiTask('parseSpend', sms, reply('죄송해요'))).toMatchObject({ ok: false, reason: 'no_json' });
    expect(await runAiTask('parseSpend', sms, reply('{}', 500))).toMatchObject({ ok: false, reason: 'http_error' });
    expect(aiStats().parseSpend.fail).toEqual({ invalid_output: 1, ungrounded: 1, no_json: 1, http_error: 1 });
  });
});

describe('FactChat 게이트웨이 (OpenAI 호환)', () => {
  afterEach(() => { delete process.env.FACTCHAT_API_KEY; delete process.env.FACTCHAT_BASE_URL; delete process.env.FACTCHAT_MODEL; resetAiStats(); });

  it('FACTCHAT_API_KEY가 있으면 게이트웨이 chat/completions로 Bearer 호출하고 choices에서 답을 읽는다', async () => {
    process.env.FACTCHAT_API_KEY = 'fc_test';
    process.env.ANTHROPIC_API_KEY = 'should-not-be-used';
    const calls: { url: string; init: RequestInit }[] = [];
    const good = JSON.stringify({ items: [{ date: '2026-11-02', amount: 12_000, name: '스타벅스', category: '카페', method: 'debit', confidence: 0.9 }], skipped: 0 });
    const fetcher = (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify({ choices: [{ message: { content: good } }] }), { status: 200 });
    }) as never;
    const r = await runAiTask('parseSpend', sms, fetcher);
    delete process.env.ANTHROPIC_API_KEY;
    expect(r).toMatchObject({ ok: true, model: 'claude-sonnet-5' });
    expect(calls[0].url).toBe('https://factchat-cloud.mindlogic.ai/v1/gateway/chat/completions');
    expect((calls[0].init.headers as Record<string, string>).authorization).toBe('Bearer fc_test');
    const body = JSON.parse(String(calls[0].init.body));
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[1].content).toContain('[이름]'); // 원문 이름은 서버에서도 가린 뒤 보낸다
  });

  it('주소·모델은 환경변수로 바꿀 수 있고, 게이트웨이 오류는 http_error', async () => {
    process.env.FACTCHAT_API_KEY = 'fc_test';
    process.env.FACTCHAT_BASE_URL = 'https://swu.factchat.bot/v1/gateway/';
    process.env.FACTCHAT_MODEL = 'gpt-5';
    let url = '';
    const r = await runAiTask('parseSpend', sms, (async (u: string) => { url = u; return new Response('{}', { status: 403 }); }) as never);
    expect(url).toBe('https://swu.factchat.bot/v1/gateway/chat/completions');
    expect(r).toMatchObject({ ok: false, reason: 'http_error' });
  });
});
