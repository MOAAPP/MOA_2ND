import { useMemo, useState } from 'react';
import { DEMO_SNAPSHOT_DAY } from '../lib/appClock';
import { askFinanceAgent, type AgentResponse } from '../lib/v4AiApi';
import { won } from '../../shared/format';

/**
 * A real, opt-in AI action directly inside the purchase flow.
 * No API calls on home load; synthetic S01 is sent only when the
 * user requests analysis. All amounts/routes are validated server results.
 */
export function HomeGoalExplorer() {
  const [goal, setGoal] = useState('');
  const [result, setResult] = useState<AgentResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const routes = useMemo(
    () => (result?.search.routes ?? []).filter(x => x.hard_constraints_met).slice(0, 3),
    [result],
  );
  const needsMoreInfo = result?.status === 'needs_confirmation';
  const confirmations = result?.search.confirmations_required ?? [];

  const analyze = async () => {
    const q = goal.trim();
    if (!q || pending) return;
    setResult(null);
    setError('');
    setPending(true);
    try {
      const answer = await askFinanceAgent('S01', DEMO_SNAPSHOT_DAY, q);
      setResult(answer);
    } catch {
      setError('지금은 AI 경로 탐색에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="ux-home-goal" aria-label="AI 구매 경로 탐색">
      <label htmlFor="ux-goal-prompt">AI에게 원하는 소비 조건을 말해 주세요</label>
      <textarea
        id="ux-goal-prompt"
        rows={2}
        maxLength={240}
        value={goal}
        onChange={event => {
          setGoal(event.target.value);
          setResult(null);
          setError('');
        }}
        placeholder="예: 운동화는 사고 싶지만, 월세와 생활비는 지키고 싶어"
      />
      <button className="ux-home-primary" type="button" disabled={pending || !goal.trim()} onClick={() => void analyze()}>
        {pending ? '가능한 선택을 살펴보는 중…' : 'AI로 가능한 경로 찾아보기'}
        {!pending && <span aria-hidden="true">→</span>}
      </button>
      <small className="ux-home-goal-note">체험 금융 기록과 작성한 조건을 함께 분석해요. 실제 결제나 투자로 실행되지는 않아요.</small>
      {error && <p className="ux-home-goal-error" role="alert">{error}</p>}
      {result && (
        <div className="ux-home-goal-result" role="region" aria-label="AI 경로 탐색 결과" aria-live="polite">
          <strong>{needsMoreInfo
            ? '정확한 비교를 위해 확인할 조건이 있어요'
            : routes.length
              ? '조건에 맞는 선택을 찾아봤어요'
              : '조건을 모두 지키는 선택을 찾지 못했어요'}</strong>
          <p>{needsMoreInfo
            ? 'AI가 구매 조건을 검토했어요. 아래 정보를 질문에 추가하면 다시 탐색할 수 있어요.'
            : routes.length
              ? '각 선택의 예상 최저 잔액까지 함께 비교해 보세요.'
              : '현재 조건에서는 무리한 구매를 추천하지 않아요. 구매 시점이나 지켜둘 조건을 바꿔 다시 탐색해 보세요.'}</p>
          {routes.length > 0 && <ul>{routes.map(route => (
            <li key={route.id}>
              <b>{route.label}</b>
              <span>예상 최저 잔액 {route.minimum_balance < 0 ? '−' : ''}{won(Math.abs(route.minimum_balance))}</span>
            </li>
          ))}</ul>}
          {!routes.length && result.search.conflict_explanations.length > 0 && (
            <p className="ux-home-goal-conflict">{result.search.conflict_explanations.slice(0, 2).join(' · ')}</p>
          )}
          {confirmations.length > 0 && (
            <div className="ux-home-goal-confirmations">
              <b>추가로 확인할 내용</b>
              <ul>{confirmations.slice(0, 3).map((item, index) => <li key={index}>{item}</li>)}</ul>
            </div>
          )}
          <small>가상 금융 경로이며 실제 거래가 아니에요. 최저 잔액은 분석 당시 조건으로 계산했어요.</small>
        </div>
      )}
    </div>
  );
}
