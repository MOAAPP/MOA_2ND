import { useEffect, useState } from 'react';
import { askFinanceAgent, getAiStatus, getDailyQuiz, answerDailyQuiz as saveAnswer,
  type AgentResponse, type AiStatus, type DailyQuiz } from '../lib/v4AiApi';

const money = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'AI 요청을 처리하지 못했어요.';
}

export function Stage3AiAgent({ user, day, onApplyAmount }: {
  user: string; day: string; onApplyAmount: (amount: number) => void;
}) {
  const [status, setStatus] = useState<AiStatus | null>(null);
  const [goal, setGoal] = useState('');
  const [data, setData] = useState<AgentResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setStatus(null); setData(null); setError(''); setGoal('');
    void getAiStatus(controller.signal).then(v => {
      if (!controller.signal.aborted) setStatus(v);
    }).catch(() => {
      if (!controller.signal.aborted) setError('모아 AI에 연결할 수 없어요. 잠시 후 다시 시도해 주세요.');
    });
    return () => controller.abort();
  }, [user, day]);

  async function analyze() {
    const text = goal.trim();
    if (text.length < 3 || busy || !status?.agent_configured) return;
    setBusy(true); setError(''); setData(null);
    try {
      setData(await askFinanceAgent(user, day, text));
    } catch (exc) { setError(errorMessage(exc)); }
    finally { setBusy(false); }
  }
  const suggestions = [
    '지금 3만 원을 써도 다음 결제일에 괜찮을까?',
    '월세를 먼저 내고 안전하게 저축하고 싶어',
  ];
  const validRoutes = data?.search.routes.filter(route => route.hard_constraints_met).slice(0, 3) ?? [];

  return <section className="st3-card st3-ai-agent" aria-labelledby="st3-agent-title">
    <div className="st3-card-head">
      <div>
        <h2 id="st3-agent-title">모아에게 물어보세요</h2>
        <p className="st3-card-desc">내가 원하는 것과 꼭 지켜야 할 돈을 함께 알려주세요.</p>
      </div>
    </div>
    <div className="st3-ai-prompts" role="group" aria-label="질문 예시">
      {suggestions.map(suggestion =>
        <button type="button" key={suggestion} onClick={() => setGoal(suggestion)}>{suggestion}</button>)}
    </div>
    <label className="st3-ai-label" htmlFor="st3-ai-goal">궁금한 점</label>
    <textarea id="st3-ai-goal" className="st3-ai-input" value={goal} maxLength={1200}
      onChange={e => setGoal(e.target.value)}
      placeholder="예: 7만 원짜리 운동화를 사고 싶은데 다음 월세는 꼭 내야 해" />
    <div className="st3-ai-actions">
      <button type="button" className="st3-btn primary" disabled={busy || goal.trim().length < 3 ||
        status?.agent_configured !== true} onClick={() => void analyze()}>
        {busy ? '내 돈의 흐름을 살펴보는 중…' : '모아 AI에게 물어보기'}
      </button>
    </div>
    {status?.agent_configured === false && <p className="st3-ai-error" role="status">지금은 AI 상담을 사용할 수 없어요. 연결 설정을 확인해 주세요.</p>}
    {error && <p className="st3-ai-error" role="alert">{error}</p>}
    {data && <div className="st3-ai-results" aria-live="polite">
      <h3>이 조건이라면 이렇게 선택할 수 있어요</h3>
      {validRoutes.length ? <ol className="st3-ai-routes">
        {validRoutes.map(route => <li key={route.id}>
          <div><b>{route.label}</b>
            <small>예상 최저 잔액 {money(route.minimum_balance)}</small></div>
          <div><span>구매 금액 {money(route.purchase_amount)}</span>
            <span>기간 후 예상 잔액 {money(route.ending_balance)}</span></div>
          <button type="button" className="st3-link" onClick={() => onApplyAmount(route.purchase_amount)}>
            이 선택을 평행세계에서 보기 ↗
          </button>
        </li>)}
      </ol> : <p>지킬 조건에 맞는 경로를 찾지 못했어요. 금액이나 날짜를 바꿔 다시 물어보세요.</p>}
      {data.search.confirmations_required.length > 0 &&
        <p className="st3-ai-warning">한 번 더 확인해 주세요: {data.search.confirmations_required.join(' · ')}</p>}
      {data.search.conflict_explanations.length > 0 &&
        <p className="st3-ai-warning">{data.search.conflict_explanations.slice(0, 2).join(' · ')}</p>}
      <small>이 결과는 예측을 이용한 가상 비교이며 실제 금융 거래나 투자 조언이 아니에요.</small>
    </div>}
  </section>;
}

function kstDay() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

const topicNames: Record<string, string> = {
  cashflow: '결제일·현금흐름', credit: '카드 청구', saving: '저축',
  investing: '모의 투자', forecast: '미래 지출 예측',
};

export function Stage3DailyQuiz({ user }: { user: string }) {
  const day = kstDay();
  const [quiz, setQuiz] = useState<DailyQuiz | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    setQuiz(null); setSelected(null); setError('');
    void getDailyQuiz(user, day)
      .then(q => { if (active) { setQuiz(q); setSelected(q.answer_record?.choice ?? null); } })
      .catch(e => { if (active) setError(errorMessage(e)); });
    return () => { active = false; };
  }, [user, day]);
  async function submit() {
    if (!quiz || selected == null || busy || quiz.answer_record) return;
    setBusy(true); setError('');
    try { setQuiz(await saveAnswer(user, day, quiz.id, selected)); }
    catch (exc) { setError(errorMessage(exc)); }
    finally { setBusy(false); }
  }

  return <section className="t-card t-quiz st6-learning" aria-labelledby="st6-daily-quiz">
    <div className="t-card-head"><div>
      <h2 id="st6-daily-quiz">오늘의 맞춤 금융 퀴즈</h2>
      <p className="t-card-desc">{quiz ? topicNames[quiz.topic] ?? quiz.topic : '내 금융 기록과 오답을 확인해요'}</p>
    </div><span className="t-badge">1문제</span></div>
    {error && <p role="alert" className="st3-ai-error">{error}</p>}
    {!quiz && !error && <p role="status">학습 문제를 불러오는 중이에요…</p>}
    {quiz && <>
      <small className="st6-learning-source">{quiz.source === 'llm'
        ? `실제 AI 개인화 문제 · ${quiz.model}`
        : '학습 기록 기반 맞춤 문제 선택 · 규칙 기반' }
        {quiz.selection_reason === 'recent_wrong_answer' ? ' · 최근 오답 복습' : ''}</small>
      <p className="st6-learning-question">{quiz.question}</p>
      <div className="st6-learning-options" role="radiogroup" aria-label="금융 퀴즈 답변">
        {quiz.options.map((opt, index) => <button type="button" role="radio" key={index}
          aria-checked={selected === index} className={selected === index ? 'on' : ''}
          disabled={!!quiz.answer_record || busy} onClick={() => setSelected(index)}>
          <span>{String.fromCharCode(65 + index)}</span>{opt}
        </button>)}
      </div>
      {quiz.answer_record ? <div className="st6-learning-feedback" role="status">
        <b>{quiz.answer_record.correct ? '정답이에요!' : '오답을 다음 복습에 반영했어요'}</b>
        <p>정답 {String.fromCharCode(65 + (quiz.correct_answer ?? 0))} · {quiz.explanation}</p>
      </div> : <button type="button" className="st6-learning-submit" disabled={selected == null || busy}
        onClick={() => void submit()}>{busy ? '저장 중…' : '정답 확인'}</button>}
    </>}
  </section>;
}
