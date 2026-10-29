import { useEffect, useMemo, useState } from 'react';
import { LESSON_BY_ID, XP, currentStreak, nextLesson, stepsFor, type Step } from '../../shared/curriculum';
import { todayKST } from '../../shared/dates';
import { LessonVisual } from '../components/LessonVisual';
import { IconCheck, IconClose } from '../components/Icons';
import { CtaBar, Empty, Notice, TopBar } from '../components/ui';
import { finishLesson, practiceDone, progressOf, startSession } from '../lib/learning';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';

export function Lesson({ id }: { id: string }) {
  const { state, update } = useStore();
  const nav = useNav();
  const lesson = LESSON_BY_ID[id];
  const level = state.level ?? 1;
  const steps = useMemo(() => (lesson ? stepsFor(lesson, level) : []), [lesson, level]);
  const session = state.learning.session?.lessonId === id ? state.learning.session : undefined;
  const [picked, setPicked] = useState<number | null>(null);
  const [checked, setChecked] = useState(false);
  const [done, setDone] = useState<{ xp: number; firstTime: boolean; perfect: boolean } | null>(null);

  useEffect(() => {
    if (lesson && !session && !done) update((s) => startSession(s, id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // 실습 스텝: 다른 화면에서 돌아왔을 때 완료 여부 확인
  const stepIdx = session ? session.queue[session.pos] : undefined;
  const step: Step | undefined = stepIdx !== undefined ? steps[stepIdx] : undefined;
  const practiceOk = step?.kind === 'practice' && session ? practiceDone(state, step.check, session.startedAt) : false;
  useEffect(() => {
    if (practiceOk && session && !session.practiceDone) update((s) => (s.learning.session ? { ...s, learning: { ...s.learning, session: { ...s.learning.session, practiceDone: true } } } : s));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [practiceOk]);

  if (!lesson) return <div className="page no-nav"><TopBar onBack={nav.pop} title="레슨" center /><Empty title="레슨을 찾지 못했어요" /></div>;


  /* 완료 화면: 퀴즈·실습 기록은 그대로 유지합니다. */
  if (done) {
    const next = nextLesson(progressOf(state));
    return (
      <div className="page no-nav has-cta">
        <TopBar title="" />
        <div className="lesson-hero" aria-hidden>
          <svg viewBox="0 0 120 120" width="132" height="132"><circle cx="60" cy="60" r="54" fill="#e8f6ef" /><path d="M36 62 L52 78 L86 42" fill="none" stroke="#0f8a5f" strokeWidth="9" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </div>
        <h1 className="step-title" style={{ textAlign: 'center' }}>{done.perfect ? '완벽해요!' : '레슨 완료!'}</h1>
        <p className="step-desc" style={{ textAlign: 'center' }}>{lesson.goal}</p>
        <div className="world-pair" style={{ marginTop: 24 }}>
          <div className="card" style={{ textAlign: 'center' }}><div className="small ink2">얻은 XP</div><div className="bold num" style={{ fontSize: 28, color: 'var(--blue)' }}>+{done.xp}</div></div>
          <div className="card" style={{ textAlign: 'center', marginTop: 0 }}><div className="small ink2">연속 학습</div><div className="bold num" style={{ fontSize: 28, color: '#e8590c' }}>{currentStreak(state.learning.streak, todayKST())}일</div></div>
        </div>
        {!done.firstTime && <p className="small muted" style={{ textAlign: 'center' }}>복습이라 XP는 조금만 더해졌어요.</p>}
        <CtaBar>
          <button className="btn ghost" onClick={() => nav.pop()}>금융 학습으로</button>
          {next && next.id !== id ? <button className="btn primary flex" onClick={() => { setDone(null); nav.replace({ name: 'lesson', id: next.id }); }}>다음 레슨 →</button> : <button className="btn primary flex" onClick={() => nav.pop()}>확인</button>}
        </CtaBar>
      </div>
    );
  }

  if (!session || !step) return <div className="page no-nav"><TopBar onBack={nav.pop} title={lesson.title} center /></div>;

  const total = session.queue.length;
  const advance = (opts: { wrong?: boolean; requeue?: boolean } = {}) => {
    setPicked(null);
    setChecked(false);
    const s0 = session;
    const queue = opts.requeue ? [...s0.queue, s0.queue[s0.pos]] : s0.queue;
    const pos = s0.pos + 1;
    const wrong = s0.wrong + (opts.wrong ? 1 : 0);
    if (pos >= queue.length) {
      const practice = s0.practiceDone || practiceOk;
      const r = finishLesson(state, id, wrong, practice);
      update((s) => finishLesson(s, id, wrong, practice).state);
      setDone({ xp: r.xp, firstTime: r.firstTime, perfect: wrong === 0 });
      return;
    }
    update((s) => (s.learning.session ? { ...s, learning: { ...s.learning, session: { ...s.learning.session, queue, pos, wrong } } } : s));
  };

  const isRetry = session.queue.indexOf(stepIdx!) !== session.pos;
  const goPractice = () => {
    if (step.kind !== 'practice') return;
    switch (step.check) {
      case 'openStock':
      case 'buyAny':
        return nav.push({ name: 'stock', code: '005930' });
      case 'buyEtf':
        return nav.push({ name: 'stock', code: '069500' });
      case 'sellAny': {
        const held = Object.keys(state.portfolio.positions)[0];
        return nav.push(held ? { name: 'stock', code: held } : { name: 'stock', code: '005930' });
      }
      case 'viewPortfolio':
        return nav.push({ name: 'portfolio' });
      case 'limitOrder':
        return nav.push({ name: 'stock', code: '005930' });
      case 'decide':
        return nav.push({ name: 'decide' });
    }
  };

  return (
    <div className="page no-nav has-cta">
      <header className="topbar plain">
        <button className="icon-btn" onClick={nav.pop} aria-label="레슨 닫기 (진행은 저장돼요)"><IconClose /></button>
        <div className="progress" style={{ flex: 1, height: 10, margin: '0 8px' }} aria-label={`${session.pos + 1}/${total}`}>
          <div style={{ width: `${(session.pos / total) * 100}%`, background: 'var(--ok)' }} />
        </div>
        <span className="small muted num" style={{ minWidth: 44, textAlign: 'right' }}>{session.pos + 1}/{total}</span>
      </header>
      <p className="xs muted" style={{ margin: '8px 4px 0' }}>핵심 개념 → 중간 퀴즈 → 실습 · {lesson.title}</p>

      {step.kind === 'concept' && (
        <section className="lesson-card">
          {step.visual && <LessonVisual k={step.visual} />}
          <h2 className="lesson-title">{step.title}</h2>
          {step.body.map((b, i) => <p key={i} className="lesson-body">{b}</p>)}
          {step.example && <div className="lesson-example"><span className="bold">예시</span> {step.example}</div>}
        </section>
      )}

      {step.kind === 'quiz' && (
        <section className="lesson-card">
          {isRetry && <span className="pill warn">다시 풀어보기</span>}
          <h2 className="lesson-title">{step.q}</h2>
          <div className="stack" role="radiogroup" aria-label={step.q} style={{ marginTop: 14 }}>
            {step.options.map((o, k) => {
              const state2 = checked ? (k === step.answer ? 'right' : k === picked ? 'wrong' : '') : '';
              return (
                <button key={k} role="radio" aria-checked={picked === k} aria-pressed={picked === k} disabled={checked} className={`choice-btn quiz-opt ${state2}`} style={{ width: '100%', minHeight: 54 }} onClick={() => setPicked(k)}>
                  {o}
                  {state2 === 'right' && <IconCheck width={20} height={20} />}
                </button>
              );
            })}
          </div>
        </section>
      )}

      {step.kind === 'practice' && (
        <section className="lesson-card">
          <span className="pill mock">모의투자 실습 · +{XP.practice} XP</span>
          <h2 className="lesson-title">{step.task}</h2>
          <p className="lesson-body">{step.hint}</p>
          {practiceOk || session.practiceDone ? <Notice kind="ok">실습 완료! 앱에서 한 행동을 확인했어요.</Notice> : <button className="btn secondary block" style={{ marginTop: 8 }} onClick={goPractice}>지금 해보러 가기</button>}
          <p className="xs muted">다녀와도 레슨 진행은 그대로 저장돼요.</p>
        </section>
      )}

      {step.kind === 'quiz' && checked && (
        <div className={`feedback ${picked === step.answer ? 'right' : 'wrong'}`} role="status">
          <div className="bold">{picked === step.answer ? '정답이에요!' : `아쉬워요. 정답: ${step.options[step.answer]}`}</div>
          <div className="small">{step.explain}</div>
          {picked !== step.answer && !isRetry && <div className="xs" style={{ marginTop: 4 }}>이 문제는 레슨 끝에 한 번 더 나와요.</div>}
        </div>
      )}

      <CtaBar>
        {step.kind === 'concept' && <button className="btn primary block" onClick={() => advance()}>계속</button>}
        {step.kind === 'quiz' && !checked && <button className="btn primary block" disabled={picked === null} onClick={() => setChecked(true)}>확인</button>}
        {step.kind === 'quiz' && checked && (
          <button className={`btn block ${picked === step.answer ? 'primary' : 'danger'}`} onClick={() => advance(picked === step.answer ? {} : { wrong: true, requeue: !isRetry })}>계속</button>
        )}
        {step.kind === 'practice' && (practiceOk || session.practiceDone ? (
          <button className="btn primary block" onClick={() => advance()}>계속</button>
        ) : (
          <button className="btn ghost block" onClick={() => advance()}>나중에 할게요</button>
        ))}
      </CtaBar>
    </div>
  );
}
