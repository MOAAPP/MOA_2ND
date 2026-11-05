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
    setData(null); setError(''); setGoal('');
    void getAiStatus(controller.signal).then(v => {
      if (!controller.signal.aborted) setStatus(v);
    }).catch(() => { if (!controller.signal.aborted) setStatus(null); });
    return () => controller.abort();
  }, [user, day]);

  async function analyze() {
    const text = goal.trim();
    if (text.length < 3 || busy) return;
    setBusy(true); setError(''); setData(null);
    try {
      const result = await askFinanceAgent(user, day, text);
      setData(result);
    } catch (exc) { setError(errorMessage(exc)); }
    finally { setBusy(false); }
  }

  return <section className="st3-card st3-ai-agent" aria-labelledby="st3-agent-title">
    <header className="st3-card-head"><div>
      <h2 id="st3-agent-title">내 조건으로 AI 경로 찾기</h2>
      <p className="st3-card-desc">목표를 설명하면 LLM이 조건을 정리하고 Python이 가능한 금융 경로를 검증해요.</p>
    </div></header>
    <label className="st3-ai-label" htmlFor="st3-ai-goal">목표와 지킬 조건</label>
    <textarea id="st3-ai-goal" className="st3-ai-input" value={goal} maxLength={1200}
      onChange={e => setGoal(e.target.value)}
      placeholder="예: 7만 원짜리 상품을 사고 싶지만 월세 결제 전에는 잔액 3만 원을 지키고 싶어" />
    <div className="st3-ai-actions">
      <span>{status?.agent_configured ? '실제 LLM 호출 가능 · 호출 시 API 요금 발생' :
        'AI 키가 설정되지 않았어요 · 백엔드 .env에서 설정해 주세요'}</span>
      <button type="button" className="st3-btn primary" disabled={busy || goal.trim().length < 3 ||
        status?.agent_configured === false} onClick={() => void analyze()}>
        {busy ? 'Python 경로 검증 중…' : 'AI 경로 분석'}
      </button>
    </div>
    {error && <p className="st3-ai-error" role="alert">{error}</p>}
    {data && <div className="st3-ai-results" aria-live="polite">
      <p className="st3-ai-source">실제 AI 모델 {data.llm_model} · 검토한 경로 {data.search.evaluated_count}개
        · 입력/출력 토큰 {data.tokens.input_tokens}/{data.tokens.output_tokens}
        {data.estimated_cost_usd != null ? ` · 추정 비용 $${data.estimated_cost_usd}` : ' · 비용 미설정'}
      </p>
      {data.search.routes.length > 0 ? <ol className="st3-ai-routes">
        {data.search.routes.map(route => <li key={route.id}>
          <div><b>{route.label}</b><small>{route.kind} · 예상 최저 잔액 {money(route.minimum_balance)}</small></div>
          <div><span>구매액 {money(route.purchase_amount)}</span>
            <span>기간 종료 예상 {money(route.ending_balance)}</span></div>
          <button type="button" className="st3-link"
            onClick={() => onApplyAmount(route.purchase_amount)}>
            결제 금액만 비교 조건에 적용
          </button>
        </li>)}
      </ol> : <p>조건을 충족하는 검증된 경로가 없어요. 희망 금액·날짜·보호 잔액을 조정해 보세요.</p>}
      {data.search.confirmations_required.length > 0 &&
        <p className="st3-ai-warning">확인 필요: {data.search.confirmations_required.join(' · ')}</p>}
      {data.search.conflict_explanations.length > 0 &&
        <p className="st3-ai-warning">{data.search.conflict_explanations.slice(0, 2).join(' · ')}</p>}
      <small>추천 숫자는 LLM이 만든 값이 아니라 Python 금융 계산·제약 검증 결과예요. 시뮬레이션이지 금융 조언이 아니에요.</small>
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
