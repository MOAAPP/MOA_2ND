import { useMemo, useState } from 'react';
import { DEMO_SNAPSHOT_DAY } from '../lib/appClock';
import { askFinanceAgent, type AgentResponse } from '../lib/v4AiApi';
import { won } from '../../shared/format';

const AMOUNTS = [10_000, 30_000, 50_000] as const;
type Preset = typeof AMOUNTS[number] | 'custom';

function friendlyCondition(value: string) {
  return value
    .replace(/required_savings_amount/g, '지켜야 할 저축 금액')
    .replace(/purchase_amount/g, '구매 금액')
    .replace(/minimum_balance/g, '최소 잔액')
    .replace(/credit_debit_date/g, '신용카드 출금일')
    .replace(/maximum_spending_reduction/g, '줄일 수 있는 지출 금액');
}

/**
 * User taps an amount rather than composing an LLM prompt.
 * The structured natural-language goal is assembled by this UI; only one
 * actual, opt-in FactChat call is made when the analyze button is tapped.
 */
export function HomeGoalExplorer() {
  const [choice, setChoice] = useState<Preset>(30_000);
  const [custom, setCustom] = useState('');
  const [result, setResult] = useState<AgentResponse | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const amount = choice === 'custom' ? Number(custom.replace(/\D/g, '')) : choice;
  const valid = Number.isSafeInteger(amount) && amount > 0 && amount <= 10_000_000;
  const routes = useMemo(
    () => (result?.search.routes ?? []).filter(route => route.hard_constraints_met).slice(0, 3),
    [result],
  );
  const needsMoreInfo = result?.status === 'needs_confirmation';
  const confirmations = result?.search.confirmations_required ?? [];
  const clear = () => { setResult(null); setError(''); };

  const analyze = async () => {
    if (!valid || pending) return;
    setResult(null);
    setError('');
    setPending(true);
    try {
      // Do not invent a savings goal, due date, or credit settlement period.
      // This is a soft purchase wish; the real essential payment is protected.
      const goal = `나는 ${amount}원짜리 물건을 살지 고민 중이야. 꼭 구매해야 하는 건 아니야. 기존 필수결제는 지키고 싶어. 체크카드로 지금 사는 경우와 구매를 미루거나 안 사는 경우 중 안전한 선택을 탐색해 줘.`;
      const answer = await askFinanceAgent('S01', DEMO_SNAPSHOT_DAY, goal);
      setResult(answer);
    } catch {
      setError('지금은 AI 비교에 연결하지 못했어요. 다시 시도해 주세요.');
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="ux-home-goal" aria-label="구매 전 AI 비교">
      <div className="ux-home-goal-amounts" role="group" aria-label="비교할 소비 금액">
        {AMOUNTS.map(value =>
          <button key={value} type="button" aria-pressed={choice === value}
            onClick={() => { setChoice(value); clear(); }}>{won(value)}</button>)}
        <button type="button" aria-pressed={choice === 'custom'}
          onClick={() => { setChoice('custom'); clear(); }}>직접 입력</button>
      </div>
      {choice === 'custom' && (
        <div className="ux-home-goal-manual">
          <label htmlFor="ux-goal-amount">비교할 금액</label>
          <div>
            <input id="ux-goal-amount" type="text" inputMode="numeric" maxLength={12}
              placeholder="예: 89,000" aria-label="비교할 금액"
              value={custom ? Number(custom).toLocaleString('ko-KR') : ''}
              onChange={event => { setCustom(event.target.value.replace(/\D/g, '').slice(0, 8)); clear(); }} />
            <span>원</span>
          </div>
        </div>
      )}
      <p className="ux-home-goal-guard">기존 필수결제는 지키는 조건으로 비교해요</p>
      <button className="ux-home-primary" type="button" disabled={pending || !valid}
        onClick={() => void analyze()}>
        {pending ? '가능한 선택을 확인하는 중…' : `${won(valid ? amount : 0)} 지금 써도 될까?`}
        {!pending && <span aria-hidden="true">→</span>}
      </button>
      {error && <p className="ux-home-goal-error" role="alert">{error}</p>}
      {result && (
        <div className="ux-home-goal-result" role="region" aria-label="AI 소비 비교 결과" aria-live="polite">
          <strong>{needsMoreInfo
            ? '비교에 필요한 정보가 더 있어요'
            : routes.length ? '조건을 지킨 선택을 찾았어요' : '조건을 지킨 선택을 찾지 못했어요'}</strong>
          <p>{needsMoreInfo
            ? '필수결제를 지키기 위해 아래 내용을 확인해 주세요.'
            : routes.length
              ? '예상 최저 잔액을 기준으로 비교해 봤어요.'
              : '지금 구매하기 어려우면 금액을 줄이거나 날짜를 미뤄 다시 비교해 보세요.'}</p>
          {routes.length > 0 && <ul>{routes.map(route =>
            <li key={route.id}>
              <b>{route.label}</b>
              <span>예상 최저 잔액 {route.minimum_balance < 0 ? '−' : ''}{won(Math.abs(route.minimum_balance))}</span>
            </li>
          )}</ul>}
          {!routes.length && result.search.conflict_explanations.length > 0 &&
            <p className="ux-home-goal-conflict">{result.search.conflict_explanations.slice(0, 2).map(friendlyCondition).join(' · ')}</p>}
          {confirmations.length > 0 && (
            <div className="ux-home-goal-confirmations">
              <b>확인할 내용</b>
              <ul>{confirmations.slice(0, 3).map((item, i) => <li key={i}>{friendlyCondition(item)}</li>)}</ul>
            </div>
          )}
          <small>AI가 조건을 해석하고, 금액은 금융 시뮬레이션으로 계산했어요 · 가상 비교예요.</small>
        </div>
      )}
    </div>
  );
}
