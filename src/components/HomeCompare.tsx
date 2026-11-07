import { useEffect, useRef, useState } from 'react';
import { addDays, parseISO } from '../../shared/dates';
import { compareScenarios, type CompareRequest, type CompareResult, type ScenarioPath } from '../lib/stage3Api';
import { useNav } from '../state/nav';

const AMOUNTS = [10_000, 30_000, 50_000] as const;
const plain = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('ko-KR')}원`;
const md = (iso: string) => { const d = parseISO(iso); return `${d.m}월 ${d.d}일`; };

function splitBudget(amount: number) {
  const purchase = Math.floor(amount * 0.4);
  const savings = Math.floor(amount * 0.3);
  const investment = Math.floor(amount * 0.2);
  return { purchase, savings, investment, cash: amount - purchase - savings - investment };
}

export function buildCompareRequest(user: string, asOf: string, amount: number, cash: number): CompareRequest {
  return {
    user_id: user, as_of: asOf, horizon_days: 14, purchase_amount: amount,
    purchase_date: addDays(asOf, 1), purchase_delay_days: 7, payment_method: 'debit',
    savings_amount: amount, savings_monthly_amount: 0, savings_goal_current: 0,
    investment_amount: amount, investment_return_percent: 0, minimum_required_balance: 0,
    stress: 'baseline', allocation: splitBudget(Math.min(amount, Math.max(0, cash))),
  };
}

const OTHER_COPY: Record<string, string> = {
  purchase_delay: '7일 뒤에 사요',
  virtual_savings: '사지 않고 같은 돈을 가상 저축에 넣어요',
  virtual_investment: '사지 않고 같은 돈으로 가상 ETF를 사요',
  mixed: '잔액 안에서 구매·저축·투자로 나눠요',
};

function PathFacts({ p }: { p: ScenarioPath }) {
  return <dl className="v23-path-facts">
    <div><dt>14일 뒤</dt><dd className={`num ${(p.future_balances['14'] ?? 0) < 0 ? 'neg' : ''}`}>{plain(p.future_balances['14'] ?? p.available_cash)}</dd></div>
    <div><dt>가장 낮을 때</dt><dd className={`num ${p.minimum_balance < 0 ? 'neg' : ''}`}>{plain(p.minimum_balance)}</dd></div>
    <div><dt>처음 0원 아래</dt><dd>{p.first_shortfall_date ? md(p.first_shortfall_date) : '없음'}</dd></div>
  </dl>;
}

/**
 * Home block 03 — "사기 전에 비교". Deterministic Python scenario engine only;
 * works with AI switched off. Comparing never writes to the ledger or the account.
 */
export function HomeCompare({ user, asOf, cash }: { user: string; asOf: string; cash: number | null }) {
  const nav = useNav();
  const [choice, setChoice] = useState<number | 'custom'>(30_000);
  const [custom, setCustom] = useState('');
  const [result, setResult] = useState<CompareResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');
  const ctrl = useRef<AbortController | null>(null);
  const amount = choice === 'custom' ? Number(custom.replace(/\D/g, '')) : choice;
  const valid = Number.isSafeInteger(amount) && amount > 0 && amount <= 10_000_000 && cash !== null;

  useEffect(() => () => ctrl.current?.abort(), []);
  const reset = () => { ctrl.current?.abort(); setResult(null); setError(''); setPending(false); };

  const run = async () => {
    if (!valid || pending || cash === null) return;
    ctrl.current?.abort();
    const c = new AbortController();
    ctrl.current = c;
    setPending(true); setError(''); setResult(null);
    try {
      const r = await compareScenarios(buildCompareRequest(user, asOf, amount, cash), c.signal);
      if (!c.signal.aborted) setResult(r);
    } catch (e) {
      if (!c.signal.aborted) setError(e instanceof Error ? e.message : '비교를 계산하지 못했어요.');
    } finally {
      if (!c.signal.aborted) setPending(false);
    }
  };

  const buy = result?.paths.find(p => p.scenario_id === 'purchase_now');
  const skip = result?.paths.find(p => p.scenario_id === 'no_purchase');
  const others = result?.paths.filter(p => p.scenario_id in OTHER_COPY) ?? [];
  const diff14 = buy && skip ? (buy.future_balances['14'] ?? 0) - (skip.future_balances['14'] ?? 0) : 0;

  return (
    <section className="v23-block v23-compare" aria-labelledby="v23-compare-title">
      <span className="v23-eyebrow">사기 전에</span>
      <h2 id="v23-compare-title">이거 사면, 다음 결제일은 괜찮을까?</h2>
      <div className="v23-chips" role="group" aria-label="비교할 금액">
        {AMOUNTS.map(v => <button key={v} type="button" aria-pressed={choice === v} onClick={() => { setChoice(v); reset(); }}>{(v / 10000).toLocaleString('ko-KR')}만원</button>)}
        <button type="button" aria-pressed={choice === 'custom'} onClick={() => { setChoice('custom'); reset(); }}>직접 입력</button>
      </div>
      {choice === 'custom' && (
        <label className="v23-amount">
          <span className="sr-only">비교할 금액</span>
          <input inputMode="numeric" autoFocus placeholder="금액" value={custom ? Number(custom).toLocaleString('ko-KR') : ''}
            onChange={e => { setCustom(e.target.value.replace(/\D/g, '').slice(0, 8)); setResult(null); }} />
          <span>원</span>
        </label>
      )}
      <button type="button" className="v23-btn primary" disabled={!valid || pending} onClick={run}>
        {pending ? '계산하고 있어요…' : valid ? `${plain(amount)} 사면 · 안 사면 비교` : cash === null ? '잔액을 불러오는 중이에요' : '금액을 입력해 주세요'}
      </button>
      {error && <p className="v23-inline-error" role="alert">{error} <button type="button" onClick={run}>다시 시도</button></p>}

      {buy && skip && (
        <div className="v23-compare-result" aria-live="polite">
          <div className="v23-versus">
            <div className="buy"><span className="v23-world-label"><i className="solid" />사면</span><PathFacts p={buy} /></div>
            <div className="skip"><span className="v23-world-label"><i className="dash" />안 사면</span><PathFacts p={skip} /></div>
          </div>
          <p className="v23-compare-sum">
            {diff14 < 0 ? <>사면 14일 뒤 잔액이 <b className="num">{plain(-diff14)}</b> 적어요.</> : <>14일 뒤 잔액 차이는 없어요.</>}
            {' '}{buy.first_shortfall_date && skip.first_shortfall_date
              ? '두 경우 모두 0원 아래로 내려가는 날이 있어요. 위 그래프에서 입금일과 결제일 순서를 함께 확인해 보세요.'
              : buy.first_shortfall_date ? `사면 ${md(buy.first_shortfall_date)}에 0원 아래로 내려갈 수 있어요.` : '두 경우 모두 0원 아래로 내려가지 않아요.'}
          </p>
          {others.length > 0 && (
            <details className="v23-more">
              <summary>다른 선택도 보기 · 연기 · 가상 저축 · 가상 투자 · 혼합</summary>
              <ul>
                {others.map(p => <li key={p.scenario_id}>
                  <div><b>{p.label}</b><small>{OTHER_COPY[p.scenario_id]}</small></div>
                  <PathFacts p={p} />
                  {(p.virtual_savings > 0 || p.virtual_investment_value > 0 || p.investment_quantity === 0 && p.scenario_id === 'virtual_investment') && (
                    <p className="v23-virtual-note">
                      {p.virtual_savings > 0 && <>가상 저축 <span className="num">{plain(p.virtual_savings)}</span> </>}
                      {p.virtual_investment_value > 0 && <>가상 투자 평가 <span className="num">{plain(p.virtual_investment_value)}</span> </>}
                      {p.scenario_id === 'virtual_investment' && p.investment_quantity === 0 && '금액이 1주 가격보다 작아 매수하지 않았어요. '}
                      · 결제계좌 잔액에는 포함하지 않아요
                    </p>
                  )}
                </li>)}
              </ul>
            </details>
          )}
          <p className="v23-source">비교만 했어요 · 가계부와 잔액은 바뀌지 않았어요 · 모아 금융 엔진 계산, AI 미사용</p>
          <button type="button" className="v23-textlink" onClick={() => nav.push({ name: 'choose' })}>이 선택 기록하고 평행세계에 남기기 ›</button>
        </div>
      )}
      {!result && !pending && <button type="button" className="v23-textlink" onClick={() => nav.push({ name: 'newChoice' })}>상품 캡처로 가격 불러오기 ›</button>}
    </section>
  );
}
