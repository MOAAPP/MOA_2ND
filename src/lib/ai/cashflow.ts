import type { CashflowIn } from '../../../shared/aiPrompts';
import type { RiskReport } from '../moa/risk';

/** Only deterministic risk-engine fields enter the language model. */
export function cashflowInputOf(r: RiskReport): CashflowIn {
  const p = r.worst;
  return {
    payment: p ? {
      name: p.name,
      date: p.date,
      amount: p.amount,
      grade: p.grade,
      shortBy: p.shortBy,
      baseBalance: p.balances.base,
      delayBalance: p.balances.delay,
    } : null,
    accountBalance: r.anchorBalance,
    forecastMethod: !r.forecast.ready.ready ? 'none'
      : r.forecast.meta.source === 'ml' ? 'ml' : 'weekday',
    forecastReadiness: r.forecast.ready.message,
    reliability: r.reliability.level,
    scheduledIncome: r.evidence.scheduledIn.map(v => ({ name: v.label, date: v.date, amount: v.amount })),
    uncertainIncome: r.evidence.uncertainIn.map(v => ({ name: v.label, date: v.date, amount: v.amount })),
  };
}

export function cashflowMethodLabel(input: CashflowIn): string {
  switch (input.forecastMethod) {
    case 'ml': return '채택된 ML 변동지출 예측';
    case 'weekday': return '요일별 평균 기준선';
    case 'none': return '등록된 입출금 일정 기준';
  }
}
