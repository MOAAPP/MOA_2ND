import { fetchWithTimeout } from './http';
import type { DailyQuiz } from '../../shared/curriculum';
import { learningBackend } from './learningBackend';

/** Optional single-persona demo bridge. Do not use as multi-user identity. */
export async function demoLearningQuiz(date: string, requestedUser?: string): Promise<{ quiz: DailyQuiz; userId: string; quizId: string } | null> {
  const userId = requestedUser || process.env.MOA_DEMO_LEARNING_USER;
  if (!userId || !/^S(?:0[1-9]|1[0-9]|20)$/.test(userId)) return null;
  const base = (process.env.MOA_FINANCE_API_BASE || 'http://127.0.0.1:8000').replace(/\/$/, '');
  const res = process.env.VERCEL
    ? await learningBackend(`/users/${userId}/daily-quiz?day=${encodeURIComponent(date)}`)
    : await fetchWithTimeout(`${base}/api/v4/users/${userId}/daily-quiz?day=${encodeURIComponent(date)}`, {}, 20000);
  if (!res.ok) throw new Error('금융 학습 서버의 퀴즈를 불러오지 못했어요.');
  const q = await res.json() as { id?: unknown; date?: unknown; question?: unknown; options?: unknown };
  if (typeof q.id !== 'string' || !/^[a-f0-9]{32}$/.test(q.id) || q.date !== date ||
      typeof q.question !== 'string' || !Array.isArray(q.options) || q.options.length !== 4 ||
      !q.options.every((o) => typeof o === 'string')) throw new Error('금융 학습 서버의 퀴즈 형식이 맞지 않아요.');
  // Only the question is rendered; the correct answer remains on FastAPI.
  return { quiz: { date, lessonId: 'fastapi-demo', q: q.question, options: q.options, answer: -1, explain: '' },
    userId, quizId: q.id };
}
