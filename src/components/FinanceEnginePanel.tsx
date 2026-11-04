import { useEffect, useState } from 'react';
import { won } from '../../shared/format';
import { getFinancialCashflow, type FinancialResult } from '../lib/financeApi';
import { useStore } from '../state/store';

/** Demo-only bridge. Never attach a synthetic persona to a real user's manual financial profile. */
export function FinanceEnginePanel() {
  const { state } = useStore();
  const [result, setResult] = useState<FinancialResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!state.demo) { setResult(null); return; }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getFinancialCashflow('S01', controller.signal)
      .then((data) => { if (!controller.signal.aborted) setResult(data); })
      .catch((err: unknown) => { if (!controller.signal.aborted) { setResult(null); setError(err instanceof Error ? err.message : '데이터를 읽지 못했어요.'); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [state.demo, retry]);

  if (!state.demo) return null;
  const nearest = result?.essential_payment_results.slice(0, 2) ?? [];
  return <section className="t-card" aria-label="Python 금융 엔진 현금흐름">
    <div className="t-card-head"><h2>결제계좌 현금흐름</h2><small>Python 계산 · S01 합성 데이터</small></div>
    {loading && !result && <p role="status">금융 계산 결과를 불러오는 중이에요…</p>}
    {error && <div role="alert"><p>{error}</p><button className="mo-link" onClick={() => setRetry((n) => n + 1)}>다시 연결하기</button></div>}
    {result && <>
      <div className="mo-kv"><div><dt>11월 4일 확인된 결제계좌 잔액</dt><dd className="num">{won(result.available_cash)}</dd></div></div>
      <div className="mo-kv">
        {[3, 7, 14].map(days => <div key={days}><dt>{days}일 뒤 잔액 · 등록 일정 기준</dt><dd className="num">{won(result.future_balances[String(days)])}</dd></div>)}
      </div>
      <p className="mo-fine">앞으로 14일 중 가장 낮은 잔액 {won(result.minimum_balance)} · 미래 변동 지출 ML 예측은 아직 적용되지 않았어요.</p>
      {nearest.map(pay => <p className="mo-fine" key={pay.id}>{pay.date.slice(5)} {pay.name} {won(pay.amount)} · 출금 후 {won(pay.balance_after)}</p>)}
      <p className="mo-fine">가상투자 평가금과 구매 후보는 실제 결제계좌 잔액에 더하지 않아요.</p>
      {result.warnings.some(w => w.startsWith('installment_schedule_derived')) &&
        <p className="mo-warn">할부 회차별 공식 청구 명세가 없어 균등 분할로 추정한 금액이 포함되어 있어요.</p>}
    </>}
  </section>;
}