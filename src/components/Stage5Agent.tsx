import { useEffect, useRef, useState } from 'react';
import {
  analyzeGoal, saveAgentRoute, searchAgentPaths,
  type AgentAnalysis, type AgentRoute, type AgentSearch, type AgentSearchRequest,
  type Conditions, type Stress,
} from '../lib/agentApi';
import './Stage5Agent.css';

const won = (value: number) => `${Math.round(value).toLocaleString('ko-KR')}원`;

function RouteLine({ route }: { route: AgentRoute }) {
  const days = route.scenario.daily_cashflow;
  if (days.length < 2) return null;
  const values = days.map(x => x.closing_balance);
  const low = Math.min(...values);
  const range = Math.max(1, Math.max(...values) - low);
  const points = values.map((v, i) =>
    `${(i / (values.length - 1) * 100).toFixed(2)},${(35 - ((v - low) / range) * 31).toFixed(2)}`).join(' ');
  return <svg className="st5-line" viewBox="0 0 100 38" preserveAspectRatio="none"
    aria-label={`검증된 ${days.length}일 예상 잔액 변화. 최저 ${won(route.minimum_balance)}`}>
    <polyline points={points} fill="none" stroke="currentColor" strokeWidth="1.15"
      strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
  </svg>;
}

export function Stage5Agent({ user, day, productName }: {
  user: string; day: string; productName?: string;
}) {
  const [goal, setGoal] = useState('');
  const [stress, setStress] = useState<Stress>('baseline');
  const [lossRate, setLossRate] = useState<number | null>(null);
  const [conditions, setConditions] = useState<Conditions | null>(null);
  const [search, setSearch] = useState<AgentSearch | null>(null);
  const [analysis, setAnalysis] = useState<AgentAnalysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);

  const searchRequest = (rules: Conditions): AgentSearchRequest => ({
    conditions: rules, horizon_days: 30, max_evaluations: 72, max_results: 4, stress,
    investment_return_percent: stress === 'investment_loss' ? lossRate ?? 0 : 0,
  });

  const start = async (mode: 'understand' | 'recalculate') => {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    if (stress === 'investment_loss' && (lossRate == null || lossRate >= 0)) {
      setError('투자 손실률을 직접 설정해 주세요. 없는 위험률을 가정하지 않아요.');
      return;
    }
    setBusy(true); setError(''); setSaved('');
    setSearch(null);
    try {
      if (mode === 'understand') {
        if (goal.trim().length < 3) {
          setError('어떤 선택을 고민하고 있는지 한 문장으로 적어 주세요.');
          return;
        }
        const result = await analyzeGoal(user, day, goal.trim(), stress, stress === 'investment_loss' ? lossRate ?? 0 : 0, current.signal);
        if (current.signal.aborted) return;
        setAnalysis(result); setConditions(result.conditions); setSearch(result.search);
      } else if (conditions) {
        const result = await searchAgentPaths(searchRequest(conditions), current.signal);
        if (current.signal.aborted) return;
        setSearch(result);
      }
    } catch (e) {
      if (!current.signal.aborted) {
        setError(e instanceof Error ? e.message : 'AI 경로를 찾지 못했어요.');
      }
    } finally {
      if (!current.signal.aborted) setBusy(false);
    }
  };

  const edit = (
    key: keyof Conditions,
    value: string | number | boolean | null | Conditions['allowed_payment_methods'],
  ) => {
    if (!conditions) return;
    const resolved = conditions.confirmations_required.filter(message => !(
      (key === 'required_savings_amount' && value != null && /저축|savings/i.test(message)) ||
      (key === 'purchase_amount' && value != null && /구매|purchase_amount/i.test(message)) ||
      (key === 'credit_debit_date' && value != null && /카드|출금|credit/i.test(message)) ||
      (key === 'minimum_balance' && value != null && /잔액|minimum_balance/i.test(message))
    ));
    setConditions({ ...conditions, [key]: value, confirmations_required: resolved });
    setSearch(null); setSaved('');
  };

  const save = async (route: AgentRoute) => {
    if (!conditions) return;
    setSaved('');
    try {
      const result = await saveAgentRoute(searchRequest(conditions), route.id);
      setSaved(`경로를 저장했어요 · ID ${result.id.slice(0, 8)}`);
    } catch (e) {
      setSaved(e instanceof Error ? e.message : '경로를 저장하지 못했어요.');
    }
  };

  return <section className="st5-agent" aria-label="나의 목표에 맞는 금융 경로 탐색">
    <div className="st5-intro">
      <div><p className="st5-eyebrow">맞춤 경로 탐색</p>
        <h2>내 조건으로 다른 길을 찾아볼까요?</h2>
        <p>필수 결제일과 잔액을 지키는 선택만 계산해요. 기존 여섯 평행세계는 그대로 이용할 수 있어요.</p>
      </div>
      <span className="st5-synthetic">체험용 합성 데이터</span>
    </div>
    <label className="st5-goal-label" htmlFor="st5-goal">어떤 선택을 고민하고 있나요?</label>
    <textarea id="st5-goal" value={goal} onChange={e => setGoal(e.target.value)}
      maxLength={1200} rows={2}
      placeholder={productName
        ? `예: ${productName}은 이번 달에 사고 싶은데 월세는 밀리면 안 되고, 여행 저축도 유지하고 싶어요`
        : '예: 운동화는 사고 싶지만 월세는 꼭 내고, 여행 저축도 유지하고 싶어요'} />
    <div className="st5-actions">
      <label htmlFor="st5-stress">비교 조건
        <select id="st5-stress" value={stress} onChange={e => { setStress(e.target.value as Stress); setSearch(null); }}>
          <option value="baseline">기본 전망</option>
          <option value="higher_spending">지출 증가 가정</option>
          <option value="delayed_income">수입 지연 가정</option>
          <option value="combined">지출 증가 + 수입 지연</option>
          <option value="investment_loss">투자 손실 가정</option>
        </select>
      </label>
      {stress === 'investment_loss' && <label htmlFor="st5-loss">가상 투자 손실률 (%)
        <input id="st5-loss" type="number" min="-100" max="-1" step="1"
          placeholder="손실률 입력" value={lossRate ?? ''}
          onChange={e => { setLossRate(e.target.value === '' ? null : Math.max(-100, Math.min(0, Math.round(Number(e.target.value))))); setSearch(null); }} />
      </label>}
      <button className="st5-primary" disabled={busy} type="button" onClick={() => void start('understand')}>
        {busy ? '금융 경로 분석 중…' : '내 목표 분석하기'}
      </button>
    </div>
    {analysis && conditions && <details className="st5-conditions">
      <summary>분석한 조건 확인·수정</summary>
      <p>필수결제는 항상 보호하며, 입력하지 않은 저축·구매 금액은 임의로 채우지 않아요.</p>
      <div className="st5-edit-grid">
        <label>구매가 반드시 필요한가요?
          <select value={conditions.purchase_required ? 'yes' : 'no'}
            onChange={e => edit('purchase_required', e.target.value === 'yes')}>
            <option value="no">가능하면 구매</option><option value="yes">반드시 구매</option>
          </select>
        </label>
        <label>구매 금액 (원)
          <input type="number" min="0" value={conditions.purchase_amount ?? ''}
            onChange={e => edit('purchase_amount', e.target.value === '' ? null : Math.max(0, Number(e.target.value)))} />
        </label>
        <label>원하는 구매일
          <input type="date" min={day} value={conditions.preferred_purchase_date ?? ''}
            onChange={e => edit('preferred_purchase_date', e.target.value || null)} />
        </label>
        <label>결제 수단
          <select value={conditions.allowed_payment_methods[0] ?? 'debit'}
            onChange={e => edit('allowed_payment_methods', [e.target.value as Conditions['allowed_payment_methods'][number]])}>
            <option value="debit">체크카드</option><option value="transfer">계좌이체</option>
            <option value="credit">신용카드 (출금일 지정)</option>
          </select>
        </label>
        {conditions.allowed_payment_methods.includes('credit') && <label>신용카드 출금일
          <input type="date" min={day} value={conditions.credit_debit_date ?? ''}
            onChange={e => edit('credit_debit_date', e.target.value || null)} />
        </label>}
        <label>최소 유지 잔액 (원)
          <input type="number" min="0" value={conditions.minimum_balance ?? ''}
            onChange={e => edit('minimum_balance', e.target.value === '' ? null : Math.max(0, Number(e.target.value)))} />
        </label>
        <label>반드시 유지할 저축 납입액 (원)
          <input type="number" min="0" value={conditions.required_savings_amount ?? ''}
            onChange={e => edit('required_savings_amount', e.target.value === '' ? null : Math.max(0, Number(e.target.value)))} />
        </label>
        <label>구매 기한
          <input type="date" min={day} value={conditions.latest_purchase_date ?? ''}
            onChange={e => edit('latest_purchase_date', e.target.value || null)} />
        </label>
        <label>가상투자 허용
          <select value={conditions.investment_allowed ? 'yes' : 'no'}
            onChange={e => edit('investment_allowed', e.target.value === 'yes')}>
            <option value="no">허용하지 않음</option><option value="yes">허용</option>
          </select>
        </label>
        {conditions.investment_allowed && <label>최대 가상투자액 (원)
          <input type="number" min="0" value={conditions.maximum_investment_amount}
            onChange={e => edit('maximum_investment_amount', Math.max(0, Number(e.target.value) || 0))} />
        </label>}
      </div>
      {conditions.hard_constraints.length > 0 && <p><b>명시한 필수 조건:</b> {conditions.hard_constraints.join(' · ')}</p>}
      {conditions.soft_preferences.length > 0 && <p><b>우선 고려:</b> {conditions.soft_preferences.join(' · ')}</p>}
      <button type="button" className="st5-outline" disabled={busy} onClick={() => void start('recalculate')}>
        수정한 조건으로 다시 탐색하기
      </button>
    </details>}
    {error && <p className="st5-error" role="alert">{error}</p>}
    {search && <div className="st5-results" aria-live="polite">
      <div className="st5-summary"><h3>검증된 금융 경로 {search.routes.length}개</h3>
        <span>실제 탐색 {search.evaluated_count}개 후보 · {Math.round(search.elapsed_ms)}ms</span></div>
      {search.confirmations_required.length > 0 && <p className="st5-confirm" role="status">
        확인할 조건: {search.confirmations_required.join(' / ')}
      </p>}
      {search.routes.length === 0 && <p className="st5-confirm">
        지금 조건을 모두 만족하는 경로를 찾지 못했어요.
        {search.conflict_explanations.length > 0 && <span> {search.conflict_explanations.join(' ')}</span>}
      </p>}
      {search.routes.length > 0 && <div className="st5-routes">
        {search.routes.map(route => <article key={route.id} className="st5-route">
          <div className="st5-route-head"><div><h4>{route.label}</h4>
              <p>{route.purchase_date ? `${route.purchase_date} 구매` : '상품 구매 없음'} · {route.payment_method === 'credit' ? '신용카드' : '체크/계좌'}</p>
            </div><b>{won(route.ending_balance)}<small>기간 말 예상 잔액</small></b></div>
          <RouteLine route={route} />
          <dl className="st5-metrics">
            <div><dt>최저 잔액</dt><dd>{won(route.minimum_balance)}</dd></div>
            <div><dt>저축 납입</dt><dd>{won(route.savings_goal_impact)}</dd></div>
            {route.investment_amount > 0 && <div><dt>투자 손익 (가정)</dt><dd>{won(route.investment_profit_loss)}</dd></div>}
          </dl>
          <div className="st5-route-foot"><span>필수 조건 충족 · Python 계산 검증</span>
            <button type="button" onClick={() => void save(route)}>경로 저장</button></div>
          <details><summary>조건 충족 내역과 예상 날짜별 잔액</summary>
            <p>실제 계좌 거래가 아닌 합성 데이터 기반 예측이며, 투자 위험의 확률은 계산하지 않았어요.</p>
            <ul>{Object.entries(route.checks).map(([name, ok]) =>
              <li key={name}>{name}: {ok ? '충족' : '미충족'}</li>)}</ul>
            <ol className="st5-day-list">{route.scenario.daily_cashflow.slice(0, 14).map(d =>
              <li key={d.date}><time>{d.date}</time><span>{won(d.closing_balance)}</span></li>)}</ol>
          </details>
        </article>)}
      </div>}
      {saved && <p role="status" className="st5-saved">{saved}</p>}
      <p className="st5-provenance">계산: Python 금융 엔진 · 미래 변동 지출: ML/검증 기준선 · LLM: 목표·제약 이해. 투자 자산은 실계좌 현금과 구분합니다.</p>
    </div>}
  </section>;
}
