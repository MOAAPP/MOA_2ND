import { useState } from 'react';
import { PLACEMENT, UNITS, placeFromAnswers, type PlacementResult } from '../../shared/curriculum';
import { LEVEL_DESC, LEVEL_LABEL } from '../../shared/knowledge';
import { CtaBar, TopBar } from '../components/ui';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';

/** 레벨테스트: 8문항(단원별 2문항). 결과로 시작 단원과 설명 깊이를 정한다. */
export function Placement() {
  const { state, update } = useStore();
  const nav = useNav();
  const [phase, setPhase] = useState<'intro' | 'quiz' | 'result'>('intro');
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [result, setResult] = useState<PlacementResult | null>(null);
  const retake = state.learning.startUnit !== null;

  const apply = (startUnit: number, level: 1 | 2 | 3, correct?: number) => {
    update((s) => ({ ...s, level, learning: { ...s.learning, startUnit, placedAt: Date.now(), placementCorrect: correct } }));
    nav.pop();
  };

  if (phase === 'intro') {
    return (
      <div className="page no-nav has-cta">
        <TopBar onBack={nav.pop} title="" />
        <div className="lesson-hero" aria-hidden>
          <svg viewBox="0 0 120 120" width="120" height="120">
            <circle cx="60" cy="60" r="54" fill="#eaf1fe" />
            <path d="M34 78 L52 60 L64 70 L86 44" fill="none" stroke="#2563eb" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="86" cy="44" r="7" fill="#2563eb" />
          </svg>
        </div>
        <h1 className="step-title" style={{ textAlign: 'center', whiteSpace: 'pre-line' }}>{retake ? '레벨테스트 다시 보기' : '1분 레벨테스트로\n나에게 맞는 곳부터'}</h1>
        <p className="step-desc" style={{ textAlign: 'center' }}>8문제를 풀면 6개 단원 중 어디서 시작할지 정해드려요. 점수를 매기려는 게 아니라, 이미 아는 내용은 건너뛰고 설명 깊이를 맞추려는 거예요.</p>
        <ul className="small ink2" style={{ margin: '24px 4px 0', paddingLeft: 18 }}>
          <li>모르면 '모르겠어요'를 골라도 괜찮아요</li>
          <li>건너뛴 단원도 언제든 열어서 복습할 수 있어요</li>
          <li>결과는 이 기기에만 저장돼요</li>
        </ul>
        <CtaBar>
          <button className="btn ghost" onClick={() => apply(1, 1)}>처음부터 할게요</button>
          <button className="btn primary flex" onClick={() => setPhase('quiz')}>테스트 시작</button>
        </CtaBar>
      </div>
    );
  }

  if (phase === 'result' && result) {
    const start = UNITS.find((u) => u.id === result.startUnit)!;
    return (
      <div className="page no-nav has-cta">
        <TopBar onBack={nav.pop} title="레벨테스트 결과" center />
        <h1 className="step-title">{result.startUnit}단원 '{start.title}'부터<br />시작해볼게요</h1>
        <p className="step-desc">설명 수준: <b>{LEVEL_LABEL[result.level]}</b> — {LEVEL_DESC[result.level]}</p>
        <div className="card" style={{ marginTop: 20 }}>
          {UNITS.map((u) => {
            const qs = PLACEMENT.filter((q) => q.unit === u.id);
            const ok = result.correctByUnit[u.id] ?? 0;
            const state = u.id < result.startUnit ? '테스트로 통과' : u.id === result.startUnit ? '여기서 시작' : '이후 학습';
            return (
              <div key={u.id} className="list-item">
                <div className="avatar" style={{ background: u.id < result.startUnit ? 'var(--ok-weak)' : u.id === result.startUnit ? 'var(--blue-weak)' : undefined, color: u.id < result.startUnit ? 'var(--ok)' : u.id === result.startUnit ? 'var(--blue)' : undefined }}>{u.id}</div>
                <div className="grow">
                  <div className="t" style={{ fontSize: 15 }}>{u.title}</div>
                  <div className="s">{qs.length ? `${ok}/${qs.length} 정답 · ` : ''}{state}</div>
                </div>
              </div>
            );
          })}
        </div>
        <section className="section">
          <div className="section-head"><h2>문제 해설</h2></div>
          <div className="card">
            {PLACEMENT.map((q) => {
              const a = answers[q.id];
              const right = a === q.answer;
              return (
                <div key={q.id} style={{ marginBottom: 12 }}>
                  <div className="small bold">{right ? '✓' : '✗'} {q.q}</div>
                  <div className="xs ink2">정답: {q.options[q.answer]} · {q.explain}</div>
                </div>
              );
            })}
          </div>
        </section>
        <CtaBar>
          <button className="btn ghost" onClick={() => apply(1, result.level, result.correct)}>1단원부터</button>
          <button className="btn primary flex" onClick={() => apply(result.startUnit, result.level, result.correct)}>{result.startUnit}단원부터 시작</button>
        </CtaBar>
      </div>
    );
  }

  const q = PLACEMENT[i];
  const picked = answers[q.id];
  return (
    <div className="page no-nav has-cta">
      <TopBar onBack={i > 0 ? () => setI(i - 1) : () => setPhase('intro')} title="레벨테스트" center />
      <div className="progress"><div style={{ width: `${((i + 1) / PLACEMENT.length) * 100}%` }} /></div>
      <p className="small muted" style={{ marginTop: 20 }}>{i + 1} / {PLACEMENT.length}</p>
      <h1 className="step-title" style={{ marginTop: 4 }}>{q.q}</h1>
      <div className="stack" style={{ marginTop: 20 }} role="radiogroup" aria-label={q.q}>
        {q.options.map((o, k) => (
          <button key={k} role="radio" aria-checked={picked === k} className="choice-btn" style={{ width: '100%', minHeight: 56 }} aria-pressed={picked === k} onClick={() => setAnswers({ ...answers, [q.id]: k })}>
            {o}
          </button>
        ))}
      </div>
      <CtaBar>
        <button className="btn primary block" disabled={picked === undefined} onClick={() => {
          if (i === PLACEMENT.length - 1) {
            setResult(placeFromAnswers(answers));
            setPhase('result');
          } else setI(i + 1);
        }}>
          {i === PLACEMENT.length - 1 ? '결과 보기' : '다음'}
        </button>
      </CtaBar>
    </div>
  );
}
