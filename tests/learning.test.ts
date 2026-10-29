import { describe, expect, it } from 'vitest';
import {
  ALL_LESSONS,
  PLACEMENT,
  UNITS,
  bumpStreak,
  currentStreak,
  dailyQuizFor,
  isLessonUnlocked,
  nextLesson,
  placeFromAnswers,
  stepsFor,
  type Progress,
} from '../shared/curriculum';

const allRight = Object.fromEntries(PLACEMENT.map((q) => [q.id, q.answer]));

describe('커리큘럼 구성', () => {
  it('6단원 × 4레슨, 모든 레슨에 퀴즈가 있고 정답 인덱스가 유효', () => {
    expect(UNITS).toHaveLength(6);
    expect(ALL_LESSONS).toHaveLength(24);
    for (const l of ALL_LESSONS) {
      const quizzes = l.steps.filter((s) => s.kind === 'quiz');
      expect(quizzes.length).toBeGreaterThan(0);
      for (const q of quizzes) if (q.kind === 'quiz') expect(q.answer).toBeLessThan(q.options.length);
    }
    for (const q of PLACEMENT) expect(q.answer).toBeLessThan(q.options.length);
  });
  it('수준에 따라 보이는 스텝이 다르다', () => {
    const l = ALL_LESSONS[0];
    expect(stepsFor(l, 3).length).toBeGreaterThan(stepsFor(l, 1).length);
  });
});

describe('레벨테스트', () => {
  it('아무것도 모르면 1단원·기초부터', () => {
    expect(placeFromAnswers({})).toMatchObject({ startUnit: 1, level: 1 });
  });
  it('모두 맞히면 5단원·지표와 위험까지', () => {
    expect(placeFromAnswers(allRight)).toMatchObject({ startUnit: 5, level: 3, correct: 8 });
  });
  it('1·2단원은 맞히고 3단원에서 틀리면 3단원부터', () => {
    const a = { ...allRight, p5: 3 };
    expect(placeFromAnswers(a)).toMatchObject({ startUnit: 3, level: 2 });
  });
  it('뒤 단원을 맞혀도 앞 단원을 틀리면 앞 단원부터', () => {
    expect(placeFromAnswers({ ...allRight, p1: 0 }).startUnit).toBe(1);
  });
});

describe('진행·잠금', () => {
  const p: Progress = { startUnit: 3, completed: {} };
  it('시작 단원 이전은 테스트로 통과해 열려 있고, 시작 단원은 첫 레슨만 열림', () => {
    expect(isLessonUnlocked(p, 'u1l3')).toBe(true);
    expect(isLessonUnlocked(p, 'u3l1')).toBe(true);
    expect(isLessonUnlocked(p, 'u3l2')).toBe(false);
    expect(nextLesson(p)?.id).toBe('u3l1');
  });
  it('레슨을 끝내면 다음 레슨이 열린다', () => {
    const p2: Progress = { startUnit: 3, completed: { u3l1: { at: 1, xp: 10, perfect: true, practiceDone: false } } };
    expect(isLessonUnlocked(p2, 'u3l2')).toBe(true);
    expect(nextLesson(p2)?.id).toBe('u3l2');
  });
});

describe('스트릭', () => {
  it('연속일이면 +1, 하루 비면 1로 다시 시작, 같은 날은 그대로', () => {
    let s = { count: 0, lastDate: null as string | null, best: 0 };
    s = bumpStreak(s, '2026-10-17');
    s = bumpStreak(s, '2026-10-18');
    s = bumpStreak(s, '2026-10-18');
    expect(s).toMatchObject({ count: 2, best: 2 });
    expect(currentStreak(s, '2026-10-19')).toBe(2);
    expect(currentStreak(s, '2026-10-20')).toBe(0);
    s = bumpStreak(s, '2026-10-21');
    expect(s).toMatchObject({ count: 1, best: 2 });
  });
  it('월말을 넘어가도 연속으로 센다', () => {
    const s = bumpStreak({ count: 3, lastDate: '2026-10-31', best: 3 }, '2026-11-01');
    expect(s.count).toBe(4);
  });
});

describe('오늘의 퀴즈', () => {
  it('같은 날짜·같은 진행이면 서버와 앱이 같은 문제', () => {
    expect(dailyQuizFor('2026-10-19', 'u2l1')).toEqual(dailyQuizFor('2026-10-19', 'u2l1'));
  });
  it('아직 배우지 않은 단원의 문제는 내지 않는다', () => {
    for (const d of ['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05']) {
      const q = dailyQuizFor(d, 'u1l2');
      expect(['u1l1', 'u1l2']).toContain(q.lessonId);
    }
  });
});
