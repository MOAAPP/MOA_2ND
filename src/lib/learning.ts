import { todayKST } from '../../shared/dates';
import { INSTRUMENT_BY_CODE } from '../../shared/instruments';
import { LESSON_BY_ID, XP, bumpStreak, stepsFor, type PracticeCheck, type Progress } from '../../shared/curriculum';
import type { Level } from '../../shared/knowledge';
import type { AppState, LessonSession } from '../state/store';

export function progressOf(s: AppState): Progress {
  return { startUnit: s.learning.startUnit ?? 1, completed: s.learning.completed };
}

export function startSession(s: AppState, lessonId: string): AppState {
  const lesson = LESSON_BY_ID[lessonId];
  const steps = stepsFor(lesson, s.level ?? 1);
  const session: LessonSession = { lessonId, queue: steps.map((_, i) => i), pos: 0, startedAt: Date.now(), wrong: 0, practiceDone: false };
  return { ...s, learning: { ...s.learning, session } };
}

/** 실습 스텝 완료 여부: 레슨 시작 이후 앱에서 실제로 한 행동으로 판단 */
export function practiceDone(s: AppState, check: PracticeCheck, since: number): boolean {
  const fills = s.portfolio.fills.filter((f) => f.time >= since);
  switch (check) {
    case 'openStock':
      return (s.learning.seen.stockAt ?? 0) >= since;
    case 'viewPortfolio':
      return (s.learning.seen.portfolioAt ?? 0) >= since;
    case 'buyAny':
      return fills.some((f) => f.side === 'buy');
    case 'sellAny':
      return fills.some((f) => f.side === 'sell');
    case 'buyEtf':
      return fills.some((f) => f.side === 'buy' && INSTRUMENT_BY_CODE[f.code]?.type === 'etf');
    case 'limitOrder':
      return s.portfolio.orders.some((o) => o.type === 'limit' && o.createdAt >= since);
    case 'decide':
      return s.records.some((r) => r.source === 'decide' && r.createdAt >= since);
  }
}

export function finishLesson(s: AppState, lessonId: string, wrong: number, practice: boolean): { state: AppState; xp: number; firstTime: boolean } {
  const today = todayKST();
  const prev = s.learning.completed[lessonId];
  const perfect = wrong === 0;
  // 처음 완료: 기본 + 만점 + 실습 / 복습: 만점일 때만 소량
  const xp = prev ? (perfect ? 3 : 1) : XP.lesson + (perfect ? XP.perfect : 0) + (practice ? XP.practice : 0);
  const record = { at: Date.now(), xp: (prev?.xp ?? 0) + xp, perfect: perfect || !!prev?.perfect, practiceDone: practice || !!prev?.practiceDone };
  return {
    state: {
      ...s,
      learning: { ...s.learning, completed: { ...s.learning.completed, [lessonId]: record }, xp: s.learning.xp + xp, streak: bumpStreak(s.learning.streak, today), session: undefined },
    },
    xp,
    firstTime: !prev,
  };
}

export function answerDailyQuiz(s: AppState, date: string, picked: number, correct: boolean): AppState {
  if (s.learning.dailyQuiz?.date === date) return s;
  return {
    ...s,
    learning: { ...s.learning, dailyQuiz: { date, picked, correct }, xp: s.learning.xp + (correct ? XP.dailyCorrect : XP.dailyTry), streak: bumpStreak(s.learning.streak, date) },
  };
}

export function levelOf(s: AppState): Level {
  return s.level ?? 1;
}
