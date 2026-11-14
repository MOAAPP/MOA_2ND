import { afterEach, describe, expect, it } from 'vitest';
import { extractJson, runAiTask } from '../server/lib/ai';
import { FACTCHAT_DEFAULT_MODEL, FACTCHAT_MIN_TOKENS } from '../server/lib/llm';

// 홈 브리핑이 FactChat 게이트웨이에서 ai_no_json으로 실패하던 문제 회귀 테스트
const brief = { usable: 90_000, daysLeftInMonth: 27, monthSpent: 50_000, lastMonthSameDay: 60_000, topCategory: { name: '식비', amount: 30_000 }, savedThisMonth: 0, holdsThisMonth: 1, nextBill: { date: '2026-11-11', amount: 300_000 } };
const good = { headline: '이번 달 여유가 있어요', body: '식비가 가장 많아요. 11일 결제 전까지 지출을 살펴봐요.', action: { label: '가계부 보기', to: 'ledger' } };
const envKeys = ['FACTCHAT_API_KEY', 'FACTCHAT_MODEL', 'FACTCHAT_BASE_URL', 'ANTHROPIC_API_KEY', 'AI_ENABLED'];
const saved = Object.fromEntries(envKeys.map((k) => [k, process.env[k]]));
afterEach(() => { for (const k of envKeys) { if (saved[k] === undefined) delete process.env[k]; else process.env[k] = saved[k]; } });

function factchat(replies: unknown[]) {
  const bodies: Record<string, unknown>[] = [];
  const fetcher = (async (_url: string, init: RequestInit) => {
    bodies.push(JSON.parse(String(init.body)));
    const content = replies[Math.min(bodies.length - 1, replies.length - 1)];
    return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content } }] }), { status: 200 });
  }) as never;
  return { fetcher, bodies };
}

describe('extractJson', () => {
  it('코드블록·앞뒤 설명·문자열 속 중괄호를 견딘다', () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
    expect(extractJson('네, 브리핑이에요.\n{"a":"{괄호}"}\n참고하세요 {끝}')).toEqual({ a: '{괄호}' });
    expect(extractJson('{"a":1')).toBeUndefined();
    expect(extractJson('')).toBeUndefined();
  });
});

describe('FactChat 브리핑', () => {
  it('기본 모델은 백엔드와 같은 모델, 출력 토큰은 최소값 이상', async () => {
    process.env.FACTCHAT_API_KEY = 'fc_test';
    delete process.env.FACTCHAT_MODEL; delete process.env.AI_ENABLED;
    const { fetcher, bodies } = factchat(['```json\n' + JSON.stringify(good) + '\n```']);
    const r = await runAiTask('brief', brief, fetcher);
    expect(r).toMatchObject({ ok: true, model: FACTCHAT_DEFAULT_MODEL });
    expect(bodies[0].model).toBe(FACTCHAT_DEFAULT_MODEL);
    expect(bodies[0].max_tokens).toBeGreaterThanOrEqual(FACTCHAT_MIN_TOKENS);
  });

  it('빈 응답이면 한 번 더 요청해서 살린다', async () => {
    process.env.FACTCHAT_API_KEY = 'fc_test';
    delete process.env.AI_ENABLED;
    const { fetcher, bodies } = factchat(['', JSON.stringify(good)]);
    const r = await runAiTask('brief', brief, fetcher);
    expect(r.ok).toBe(true);
    expect(bodies).toHaveLength(2);
  });

  it('배열 형식 응답에서 생각 블록은 빼고 텍스트만 쓴다', async () => {
    process.env.FACTCHAT_API_KEY = 'fc_test';
    delete process.env.AI_ENABLED;
    const { fetcher } = factchat([[{ type: 'thinking', text: '{"x":1}' }, { type: 'text', text: JSON.stringify(good) }]]);
    const r = await runAiTask('brief', brief, fetcher);
    expect(r).toMatchObject({ ok: true, data: good });
  });

  it('두 번 다 JSON이 없으면 no_json (규칙 문장으로 대체)', async () => {
    process.env.FACTCHAT_API_KEY = 'fc_test';
    delete process.env.AI_ENABLED;
    const { fetcher, bodies } = factchat(['죄송해요', '죄송해요']);
    expect(await runAiTask('brief', brief, fetcher)).toMatchObject({ ok: false, reason: 'no_json' });
    expect(bodies).toHaveLength(2);
  });
});
