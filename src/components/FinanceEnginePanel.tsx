import { useEffect, useMemo, useState } from 'react';
import { won } from '../../shared/format';
import { appDay } from '../lib/appClock';
import {
  getConfirmedCashflow, getDatasetSnapshot,
  type DatasetSnapshot, type FinancialResult,
} from '../lib/financeApi';
import { useStore } from '../state/store';

/**
 * Main S01 demo account view, backed by the one canonical Python dataset.
 * Never synthesize missing records on the frontend and never silently replace a failed API call.
 */
export function FinanceEnginePanel() {
  const { state } = useStore();
  const day = appDay(state);
  const [snapshot, setSnapshot] = useState<DatasetSnapshot | null>(null);
  const [flow, setFlow] = useState<FinancialResult | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    if (!state.demo) {
      setSnapshot(null); setFlow(null); setError('');
      return;
    }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    Promise.all([
      getDatasetSnapshot('S01', controller.signal),
      getConfirmedCashflow('S01', day, controller.signal),
    ])
      .then(([source, cashflow]) => {
        if (controller.signal.aborted) return;
        if (source.user_id !== cashflow.user_id || source.dataset_id !== cashflow.dataset_id) {
          throw new Error('메인 데이터셋과 현금흐름 계산의 출처가 일치하지 않습니다.');
        }
        setSnapshot(source);
        setFlow(cashflow);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setSnapshot(null); setFlow(null);
        setError(err instanceof Error ? err.message : '공통 금융 데이터를 불러올 수 없습니다.');
      })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [state.demo, day, retry]);

  useEffect(() => {
    const refresh = () => setRetry(n => n + 1);
    window.addEventListener('moa:financial-updated', refresh);
    return () => window.removeEventListener('moa:financial-updated', refresh);
  }, []);

  const recent = useMemo(() => {
    if (!snapshot) return [];
    return snapshot.transactions
      .filter(t => typeof t.occurred_at === 'number' && Number.isFinite(t.occurred_at)
        && t.occurred_at <= Date.parse(`${day}T23:59:59+09:00`))
      .sort((a, b) => (b.occurred_at ?? 0) - (a.occurred_at ?? 0))
      .slice(0, 5);
  }, [snapshot, day]);

  if (!state.demo) return null;
  return (
    <section className="t-card mo-home ux-python-main" aria-label="공통 메인 금융 데이터셋의 S01 결제계좌">
      <div className="h-tag-row">
        <span className="h-tag real">가상 결제계좌 · S01</span>
        <small>20명 공통 금융 데이터셋</small>
      </div>
      <h2 className="ux-python-main-title">결제일에 돈이 충분할까요?</h2>
      <p className="ux-python-main-sub">Python FastAPI가 실제 합성 금융 원본 데이터로 계산해요. 임의의 샘플 잔액은 표시하지 않아요.</p>
      {loading && <p role="status" className="ux-python-audit-status">메인 금융 데이터 불러오는 중…</p>}
      {error && <div className="ux-python-audit-error" role="alert">
        <strong>메인 데이터 연결 실패</strong>
        <p>{error}</p>
        <small>FastAPI 서버의 /api/v4/health 및 프론트엔드의 /api/v4 프록시를 확인해 주세요.</small>
        <button type="button" onClick={() => setRetry(n => n + 1)}>다시 연결</button>
      </div>}
      {snapshot && flow && <>
        <div className="ux-python-main-balance">
          <span>{day} 기준 계산된 결제계좌 잔액</span>
          <strong className="num">{won(flow.available_cash)}</strong>
          <small>관측 기준 {snapshot.snapshot_date} · 출처 {snapshot.dataset_id} · 사용자 승인 거래 반영</small>
        </div>
        <div className="ux-python-audit-values" aria-label="결제계좌 3·7·14일 예상 잔액">
          {[3, 7, 14].map(days => (
            <div key={days}>
              <span>{days}일 뒤</span>
              <strong className="num">{won(flow.future_balances[String(days)] ?? 0)}</strong>
            </div>
          ))}
        </div>
        <div className="ux-python-main-section">
          <h3>다가오는 필수 결제</h3>
          {(flow.essential_payment_results ?? []).length > 0 ? (
            <ul className="ux-python-main-rows">
              {flow.essential_payment_results.slice(0, 5).map((p, i) => (
                <li key={p.id + i}>
                  <span><b>{p.name}</b><small>{p.date}</small></span>
                  <strong className="num">−{won(p.amount)}</strong>
                  <span className="ux-python-main-status">{p.covered ? '충당 가능' : '잔액 부족 예상'}</span>
                </li>
              ))}
            </ul>
          ) : <p className="ux-python-main-empty">앞으로 14일에 확인된 필수 결제가 없어요.</p>}
        </div>
        <div className="ux-python-main-section">
          <h3>공통 원본 거래 기록</h3>
          <p className="ux-python-main-sub">
            {snapshot.transactions.length}건의 과거 관측 거래 · {snapshot.daily.length}일의 일별 기록 · {snapshot.schedules.length}개 고정 일정
          </p>
          {recent.length ? <ul className="ux-python-main-rows">
            {recent.map((t, i) => (
              <li key={t.id ?? `row-${i}`}>
                <span>
                  <b>{t.name || t.kind || '거래'}</b>
                  <small>{new Date(t.occurred_at!).toLocaleDateString('ko-KR', { timeZone: 'Asia/Seoul' })}
                    {t.category ? ` · ${t.category}` : ''}</small>
                </span>
                <strong className="num">{won(t.amount ?? 0)}</strong>
              </li>
            ))}
          </ul> : <p className="ux-python-main-empty">이 기준일까지 관측된 거래가 없어요.</p>}
        </div>
        <p className="ux-python-main-foot">합성 데이터 검증용 화면이에요. 미래 소비는 예측·가정으로 구분하며, 스크린샷 구매 후보는 실제 잔액에 반영하지 않아요.</p>
      </>}
    </section>
  );
}
