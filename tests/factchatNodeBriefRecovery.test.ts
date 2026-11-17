import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { normalizeBriefOutput, resetAiStats, runAiTask } from '../server/lib/ai';

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
