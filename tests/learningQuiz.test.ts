import { afterEach, describe, expect, it, vi } from 'vitest';
import { demoLearningQuiz } from '../server/lib/learningQuiz';

describe('single-persona card quiz bridge', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  it('is disabled until the demo user is explicitly configured', async () => {
    vi.stubEnv('MOA_DEMO_LEARNING_USER', '');
    expect(await demoLearningQuiz('2026-11-05')).toBeNull();
  });
  it('uses the FastAPI question without exposing the answer', async () => {
    vi.stubEnv('MOA_DEMO_LEARNING_USER', 'S01');
    vi.stubEnv('MOA_FINANCE_API_BASE', 'http://127.0.0.1:8000');
    const mock = vi.fn(async () => new Response(JSON.stringify({ id: 'a'.repeat(32), date: '2026-11-05',
      question: '금융 퀴즈 문제', options: ['첫째', '둘째', '셋째', '넷째'], correct_answer: 2 }), { status: 200 }));
    vi.stubGlobal('fetch', mock);
    const result = await demoLearningQuiz('2026-11-05');
    expect(result?.userId).toBe('S01');
    expect(result?.quiz.q).toBe('금융 퀴즈 문제');
    expect(result?.quiz.answer).toBe(-1);
    expect(mock.mock.calls).toHaveLength(1);
  });
  it('reports a failure if the quiz server cannot be used', async () => {
    vi.stubEnv('MOA_DEMO_LEARNING_USER', 'S01');
    vi.stubGlobal('fetch', vi.fn(async () => new Response('', { status: 503 })));
    await expect(demoLearningQuiz('2026-11-05')).rejects.toThrow();
  });
});
