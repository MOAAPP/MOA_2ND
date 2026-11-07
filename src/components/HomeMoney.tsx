import { parseISO } from '../../shared/dates';
import { firstDip, type HomeFinance } from '../lib/homeFinance';
import { BalanceChart } from './BalanceChart';

const md = (iso: string) => { const d = parseISO(iso); return `${d.m}월 ${d.d}일`; };
const plain = (n: number) => `${n < 0 ? '−' : ''}${Math.abs(Math.round(n)).toLocaleString('ko-KR')}원`;
const MODEL_LABEL: Record<string, string> = {
  weekday: '최근 요일별 평균', recent7: '최근 7일 평균', lightgbm: 'LightGBM 예측 모델', unavailable: '예측 없음',
};

/**
 * Home block 01 — "지금 결제계좌 상태 + 다가오는 결제의 영향".
 * Observed balance (실제 기록), projected path (예상), schedule-only path (확정 일정) are
 * visually and verbally separate. Every number comes from FastAPI.
 */
export function HomeMoney({ fin }: { fin: HomeFinance }) {
  if (fin.status === 'loading') {
    return <section className="v23-money is-loading" aria-label="결제계좌 상태" aria-busy="true">
      <span className="v23-eyebrow">결제계좌</span>
      <div className="v23-skel v23-skel-num" /><div className="v23-skel v23-skel-line" /><div className="v23-skel v23-skel-chart" />
      <span className="sr-only" role="status">결제계좌 잔액을 불러오고 있어요</span>
    </section>;
  }
  if (fin.status === 'error' || !fin.home) {
    return <section className="v23-money" aria-label="결제계좌 상태">
      <span className="v23-eyebrow">결제계좌</span>
      <div className="v23-error" role="alert">
        <strong>잔액 정보를 불러오지 못했어요</strong>
        <p>추측한 숫자는 보여주지 않을게요. 금융 계산 서버 연결을 확인한 뒤 다시 시도해 주세요.</p>
        <button type="button" onClick={fin.retry}>다시 불러오기</button>
      </div>
    </section>;
  }

  const { home, schedule, briefing } = fin;
  const dip = firstDip(home.daily_cashflow);
  const sdip = schedule ? firstDip(schedule.daily_cashflow) : null;
  const sdipEvent = sdip?.events.find(e => e.amount < 0);
  const income = home.upcoming_income[0];
  const capacity = briefing?.spending_capacity;
  const model = home.variable_forecast?.model_type ?? 'unavailable';
  const showText = briefing && (briefing.llm_used || briefing.change_detection.status === 'changed');

  return (
    <section className="v23-money" aria-labelledby="v23-money-title">
      <div className="v23-money-meta">
        <span className="v23-eyebrow" id="v23-money-title">결제계좌 잔액</span>
        <span className="v23-tag fact">{md(home.as_of_date)} 마감 기록</span>
      </div>
      <strong className="v23-money-num num">{plain(home.available_cash)}</strong>

      {dip ? (
        <div className="v23-alert" role="note">
          <b>{md(dip.date)}부터 잔액이 0원 아래로 내려갈 수 있어요</b>
          <p>
            예정 결제와 예상 생활비를 함께 보면 14일 중 가장 낮을 때 <span className="num">{plain(home.minimum_balance)}</span>이에요.
            {sdip
              ? <> 예정 결제만 따지면 {md(sdip.date)}{sdipEvent ? ` ${sdipEvent.label}` : ''} 뒤 <span className="num">{plain(sdip.closing_balance)}</span>이 돼요.</>
              : schedule ? ' 예정 결제만 따지면 0원 아래로 내려가지 않아요.' : ''}
          </p>
          {income && <p className="v23-alert-sub">다음 입금 · {md(income.debit_at.slice(0, 10))} {income.label} <span className="num">+{income.amount.toLocaleString('ko-KR')}원</span></p>}
        </div>
      ) : (
        <p className="v23-ok">앞으로 14일 동안 예정 결제와 예상 생활비를 빼도 0원 아래로 내려가지 않아요.</p>
      )}

      <BalanceChart asOf={home.as_of_date} start={home.available_cash} forecast={home.daily_cashflow} schedule={schedule?.daily_cashflow ?? null} />

      {capacity && (
        <div className="v23-capacity">
          <div><span>오늘 더 써도 괜찮은 금액</span><small>{capacity.baseline_constraints_met ? '앞으로의 결제를 지키는 범위의 참고값' : '이미 부족할 수 있는 날이 있어 0원으로 계산했어요'}</small></div>
          <b className="num">{plain(capacity.estimated_additional_spend)}</b>
        </div>
      )}

      {showText && briefing && (
        <p className="v23-explain">
          <span className="v23-tag ai">{briefing.llm_used ? 'AI 설명' : '기록 기반 안내'}</span>
          {briefing.summary}
        </p>
      )}

      <p className="v23-source">
        계산 · 모아 금융 엔진 · 생활비 예측 {MODEL_LABEL[model] ?? model}
        {briefing && !briefing.llm_used ? ' · AI 미사용' : ''} · 합성 데이터, 실제 은행 아님
      </p>
    </section>
  );
}
