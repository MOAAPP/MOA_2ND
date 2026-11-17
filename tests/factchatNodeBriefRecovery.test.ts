import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalizeBriefOutput, resetAiStats, runAiTask } from '../server/lib/ai';
import { briefEvidenceAligned, mentionedWonAmounts, numbersGrounded } from '../shared/aiPrompts';

const input = {
  usable: 90_000,
  daysLeftInMonth: 27,
  monthSpent: 50_000,
  lastMonthSameDay: 60_000,
  topCategory: { name: '식비', amount: 30_000 },
  savedThisMonth: 0,
  holdsThisMonth: 1,
  nextBill: { date: '2026-11-11', amount: 300_000 },
};
const valid = {
  headline: '오늘의 결제 계획',
  body: '필수 결제를 고려해 지출 기록을 먼저 확인해 보세요.',
  action: null,
};
const wrap = (payload: unknown) => new Response(JSON.stringify({
  choices: [{ finish_reason: 'stop', message: { content: typeof payload === 'string' ? payload : JSON.stringify(payload) } }],
}), { status: 200 });
function scripted(...responses: unknown[]) {
  let calls = 0;
  const fetcher = (async (_url: string, init: RequestInit) => {
    calls++;
    const data = JSON.parse(String(init.body));
    expect(data.model).toBeTruthy();
    expect(data.messages[0].role).toBe('system');
    expect(data.messages[1].role).toBe('user');
    return wrap(responses[Math.min(calls - 1, responses.length - 1)]);
  }) as never;
  return { fetcher, count: () => calls };
}

describe('FactChat Node home brief recovers from inconsistent Claude JSON', () => {
  beforeEach(() => {
    process.env.FACTCHAT_API_KEY = 'fake-test-key';
    process.env.FACTCHAT_BASE_URL = 'https://factchat-cloud.mindlogic.ai/v1/gateway';
    process.env.AI_ENABLED = 'on';
  });
  afterEach(() => {
    delete process.env.FACTCHAT_API_KEY;
    delete process.env.FACTCHAT_BASE_URL;
    delete process.env.AI_ENABLED;
    resetAiStats();
  });

  it('normalizes an omitted action and drops only unknown response fields', () => {
    expect(normalizeBriefOutput({ ...valid, action: undefined, bonus: 'not part of schema' }))
      .toEqual({ ...valid, action: null });
  });

  it('accepts nested Claude JSON and an explicitly verified action', async () => {
    const { fetcher, count } = scripted({ data: {
      headline: '오늘의 결제 계획', body: valid.body,
      action: { label: '가계부 보기', to: 'ledger', extra: 'unused' },
    } });
    const result = await runAiTask('brief', input, fetcher);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data).toMatchObject({ action: { label: '가계부 보기', to: 'ledger' } });
    expect(count()).toBe(1);
  });

  it('removes unsupported navigation instead of displaying an unknown route', () => {
    expect(normalizeBriefOutput({ ...valid, action: { label: '외부 사이트', to: 'external' } }))
      .toEqual(valid);
  });

  it('retries an invalid first response and returns a live validated brief', async () => {
    const { fetcher, count } = scripted({ headline: '제목만 반환' }, valid);
    const result = await runAiTask('brief', input, fetcher);
    expect(result).toMatchObject({ ok: true, data: valid });
    expect(count()).toBe(2);
  });

  it('retries unsupported financial figures but never accepts invented amounts', async () => {
    const fake = { ...valid, headline: '99,999원 지출' };
    const { fetcher, count } = scripted(fake, valid);
    const result = await runAiTask('brief', input, fetcher);
    expect(result).toMatchObject({ ok: true, data: valid });
    expect(count()).toBe(2);
  });

  it('rejects invented amounts even after the one allowed retry', async () => {
    const fake = { ...valid, headline: '99,999원 지출' };
    const { fetcher, count } = scripted(fake, fake);
    expect(await runAiTask('brief', input, fetcher))
      .toMatchObject({ ok: false, reason: 'ungrounded' });
    expect(count()).toBe(2);
  });

  it('retries informal text and still requires complete Korean honorifics', async () => {
    const { fetcher, count } = scripted({ ...valid, body: '그냥 사도 돼.' }, valid);
    expect(await runAiTask('brief', input, fetcher)).toMatchObject({ ok: true, data: valid });
    expect(count()).toBe(2);
  });

  it('returns a truthful invalid_output after two malformed attempts', async () => {
    const { fetcher, count } = scripted({ headline: '제목만 반환' }, { body: '본문만 반환' });
    expect(await runAiTask('brief', input, fetcher))
      .toMatchObject({ ok: false, reason: 'invalid_output' });
    expect(count()).toBe(2);
  });

  it('accepts a fenced JSON brief on the first attempt', async () => {
    const { fetcher, count } = scripted('```json\n' + JSON.stringify(valid) + '\n```');
    expect(await runAiTask('brief', input, fetcher)).toMatchObject({ ok: true, data: valid });
    expect(count()).toBe(1);
  });
});


describe('financial grounding of actual Node briefing text', () => {
  it('converts Korean currency units to exact won without tenfold errors', () => {
    expect(mentionedWonAmounts('300만 원 / 90만 원 / 30만원 / 9만 원 / 30만 5천원 / 1억 2천만 원 / -5,000원'))
      .toEqual([3000000, 900000, 300000, 90000, 305000, 120000000, 5000]);
    expect(mentionedWonAmounts('원금은 그대로 두세요. 50% 증가했다는 뜻은 아닙니다.')).toEqual([]);
  });

  it('catches actual mistaken 300000원→300만원 and 90000원→90만원 translations', () => {
    const wrong = {
      headline: '월말 준비',
      body: '300만 원 결제에 대비해야 해요. 사용 가능 금액 90만 원을 확인하세요.',
      action: null,
    };
    const correct = {
      headline: '월말 준비',
      body: '30만 원 결제에 대비해야 해요. 사용 가능 금액 9만 원을 확인하세요.',
      action: null,
    };
    expect(numbersGrounded('brief', input, wrong)).toBe(false);
    expect(numbersGrounded('brief', input, correct)).toBe(true);
  });

  it('does not infer a bill category, nonexistent bill, relative month, or unverified percent', () => {
    expect(briefEvidenceAligned(input, { ...valid, headline: '월세 준비' })).toBe(false);
    expect(briefEvidenceAligned(input, { ...valid, body: '다음 달 월세 납부를 준비하세요.' })).toBe(false);
    expect(briefEvidenceAligned(input, { ...valid, body: '지난달 대비 50% 감소했어요.' })).toBe(false);
    expect(briefEvidenceAligned(input, { ...valid, body: '11월 12일 결제를 확인해 보세요.' })).toBe(false);
    expect(briefEvidenceAligned(input, { ...valid, body: '11월 11일 예정된 결제를 확인해 보세요.' })).toBe(true);
    expect(briefEvidenceAligned({ ...input, nextBill: null }, {
      ...valid, body: '필수결제가 없으니 마음껏 사용하세요.',
    })).toBe(false);
  });
});

describe('live brief retry for factual failures', () => {
  beforeEach(() => {
    process.env.FACTCHAT_API_KEY = 'fake-test-key';
    process.env.FACTCHAT_BASE_URL = 'https://factchat-cloud.mindlogic.ai/v1/gateway';
    process.env.AI_ENABLED = 'on';
  });
  afterEach(() => {
    delete process.env.FACTCHAT_API_KEY;
    delete process.env.FACTCHAT_BASE_URL;
    delete process.env.AI_ENABLED;
    resetAiStats();
  });

  it('regenerates model hallucinated rent and wrong tenfold currency without showing it', async () => {
    const wrong = {
      headline: '다음 달 월세 300만 원 준비',
      body: '90만 원으로는 월세를 낼 수 없어요.',
      action: null,
    };
    const { fetcher, count } = scripted(wrong, valid);
    expect(await runAiTask('brief', input, fetcher)).toMatchObject({ ok: true, data: valid });
    expect(count()).toBe(2);
  });

  it('does not accept wrong facts even when the model repeats them twice', async () => {
    const wrong = {
      headline: '월세 300만 원',
      body: '900만 원이 필요합니다.',
      action: null,
    };
    const { fetcher, count } = scripted(wrong, wrong);
    expect(await runAiTask('brief', input, fetcher)).toMatchObject({ ok: false, reason: 'ungrounded' });
    expect(count()).toBe(2);
  });

  it('accepts a brief with exact grounded 30만원 and an unknown bill type', async () => {
    const correct = {
      headline: '다가오는 결제 확인',
      body: '예정된 30만 원 결제를 고려해 사용 가능 금액 9만 원을 먼저 확인해 보세요.',
      action: null,
    };
    const { fetcher, count } = scripted(correct);
    expect(await runAiTask('brief', input, fetcher)).toMatchObject({ ok: true, data: correct });
    expect(count()).toBe(1);
  });
});
