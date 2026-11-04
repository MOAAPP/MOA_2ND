import { useMemo } from 'react';
import type { RiskReport } from '../../lib/moa/risk';
import { cashflowInputOf, cashflowMethodLabel } from '../../lib/ai/cashflow';
import { useAi } from '../../lib/ai';
import { AiCard } from '../../components/Ai';
import { useNav } from '../../state/nav';

/**
 * Home's always-visible 3-layer AI explanation.
 * LLM = language only; ML (when adopted) = spend estimate; code = all payment amounts.
 */
export function CashflowCoach({ report }: { report: RiskReport }) {
  const nav = useNav();
  const input = useMemo(() => cashflowInputOf(report), [report]);
  const ai = useAi('cashflow', input, JSON.stringify(input));
  return (
    <section className="ux-cashflow-coach" aria-label="모아 현금흐름 분석">
      <AiCard title="모아의 현금흐름 분석" loading={ai.loading} source={ai.source}>
        {ai.data && (
          <div className="ux-cashflow-coach-copy">
            <strong>{ai.data.insight}</strong>
            <p>{ai.data.nextStep}</p>
          </div>
        )}
      </AiCard>
      <div className="ux-cashflow-model" aria-label="분석 사용 기술">
        <span><b>예측 방법</b> {cashflowMethodLabel(input)}</span>
        <span><b>위험 판정</b> 결제일별 잔액 계산 엔진</span>
      </div>
      <button type="button" className="ux-cashflow-paste" onClick={() => nav.push({ name: 'ledgerPaste' })}>
        <span aria-hidden="true">✦</span>
        결제 문자를 AI로 자동 기록하기
        <span aria-hidden="true">→</span>
      </button>
    </section>
  );
}
