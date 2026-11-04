import { useEffect, useState } from 'react';
import { won } from '../../shared/format';
import { getFinancialCashflow, type FinancialResult } from '../lib/financeApi';
import { useStore } from '../state/store';

/** An unobtrusive API-proof footer, not a duplicate payment-risk card.
 * S01 is the immutable synthetic source; local manual edits are not sent to FastAPI.
 */
export function FinanceEnginePanel() {
  const { state } = useStore();
  const [result, setResult] = useState<FinancialResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!state.demo) { setResult(null); setError(''); return; }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    getFinancialCashflow('S01', controller.signal)
      .then(data => { if (!controller.signal.aborted) setResult(data); })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) {
          setResult(null);
          setError(err instanceof Error ? err.message : '계산 결과를 불러오지 못했어요.');
        }
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [state.demo, retry]);

  if (!state.demo) return null;
  return (
    <div className="ux-python-audit" aria-label="Python 금융 계산 결과">
      <div className="ux-python-audit-head">
        <strong>예상 잔액 <span>· Python 계산</span></strong>
        <small>원본 S01 · 11월 4일 기준</small>
      </div>
      {loading && !result && <p role="status" className="ux-python-audit-status">금융 엔진에 연결하고 있어요…</p>}
      {error && <div className="ux-python-audit-error" role="alert">
        <span>{error}</span>
        <button type="button" onClick={() => setRetry(n => n + 1)}>재연결</button>
      </div>}
      {result && <div className="ux-python-audit-values">
        {[3, 7, 14].map(days => (
          <div key={days}>
            <span>{days}일 뒤</span>
            <strong className="num">{won(result.future_balances[String(days)])}</strong>
          </div>
        ))}
      </div>}
      {result && <p className="ux-python-audit-note">등록 일정 기준 · 체험 중 직접 추가한 거래는 아직 Python 계산에 포함되지 않아요</p>}
    </div>
  );
}
