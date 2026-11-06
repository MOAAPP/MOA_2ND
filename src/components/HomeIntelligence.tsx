import { useEffect, useMemo, useState } from 'react';
import { parseISO } from '../../shared/dates';
import { won } from '../../shared/format';
import { AiLines, AiMark } from './Ai';
import { DEMO_SNAPSHOT_DAY, appDay } from '../lib/appClock';
import { briefInput } from '../lib/ai/context';
import { getMorningBriefing, type MorningBriefing } from '../lib/stage6Api';
import { useStore } from '../state/store';
import { useSpending } from '../screens/Ledger';

/**
 * The public home starts with a meaningful, visible finance insight rather
 * than a developer-only calculation dump or a hidden AI accordion.
 *
 * Synthetic S01: the same canonical FastAPI facts and real FactChat LLM
 * provenance power the entire card; numeric facts are never invented.
 * Manual accounts: retain the existing local brief, explicitly marking
 * example fallback as an example (never as live AI).
 */
export function HomeIntelligence() {
  const { state } = useStore();
  const { all, today } = useSpending();
  const localInput = useMemo(
    () => briefInput(state.worldWallet, all, today),
    [state.worldWallet, all, today],
  );
  const [remote, setRemote] = useState<MorningBriefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [failure, setFailure] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!state.demo) {
      setRemote(null);
      setFailure(false);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    setRemote(null);
    setFailure(false);
    // Only observations through Nov 4 are available in S01. The clock's
    // future days are projections, not new transactions or fresh AI input.
    void getMorningBriefing('S01', DEMO_SNAPSHOT_DAY, ctrl.signal)
      .then(result => { if (!ctrl.signal.aborted) setRemote(result); })
      .catch(() => { if (!ctrl.signal.aborted) setFailure(true); })
      .finally(() => { if (!ctrl.signal.aborted) setLoading(false); });
    return () => ctrl.abort();
  }, [state.demo, attempt]);

  const next = remote?.nearest_essential_payment;
  const risk = !!remote && !remote.spending_capacity.baseline_constraints_met;
  const selectedDay = appDay(state);

  return (
    <section className="ux-home-ai-hero" aria-label="오늘의 금융 분석">
      <div className="ux-home-ai-meta">
        <span className="ux-home-ai-brand">{state.demo ? <><AiMark label="" /> 모아 AI</> : '모아 · 내 금융 현황'}</span>
        <span className="ux-home-ai-date">
          {state.demo ? '11월 4일 금융 기록 기준' : '내 금융 기록 기준'}
        </span>
      </div>
      <h2>다음 결제일까지, 괜찮을까?</h2>
      

      {state.demo ? (
        loading || (!remote && !failure) ? (
          <div role="status" className="ux-home-ai-pending">
            <AiLines n={3} />
            <span>금융 기록을 살펴보고 있어요…</span>
          </div>
        ) : failure || !remote ? (
          <div className="ux-home-ai-unavailable" role="alert">
            <strong>지금은 금융 분석을 불러오지 못했어요.</strong>
            <p>결과를 추측해 보여주지 않을게요. 연결을 확인하고 다시 시도해 주세요.</p>
            <button type="button" onClick={() => setAttempt(v => v + 1)}>다시 불러오기</button>
          </div>
        ) : (
          <>
            <div className="ux-home-ai-cash">
              <span>오늘의 예상 추가 소비 여유</span>
              <strong className="num">{won(remote.spending_capacity.estimated_additional_spend)}</strong>
              <small>다가오는 결제와 예상 지출을 반영한 참고 금액이에요.</small>
            </div>
            <div className="ux-home-ai-snapshot">
              <div>
                <span>현재 결제계좌 잔액</span>
                <strong className="num">{won(remote.spending_capacity.current_cash)}</strong>
              </div>
              <div>
                <span>가장 가까운 필수결제</span>
                {next ? (
                  <>
                    <strong>{parseISO(next.date).m}월 {parseISO(next.date).d}일 · {next.name}</strong>
                    <small>{won(next.amount)} · {next.covered ? '해당 결제는 충당 가능' : '결제 금액 확인 필요'}</small>
                  </>
                ) : <strong>확인된 일정 없음</strong>}
              </div>
            </div>
            {risk && <p className="ux-home-ai-risk" role="note">
              <span aria-hidden="true">!</span>
              현재 예측으로는 향후 결제일에 잔액이 부족해질 수 있어요.
            </p>}
            <div className="ux-home-ai-interpretation">
              <span className="ux-home-ai-source">
                <AiMark label="" />
                {remote.llm_used ? 'AI가 짚어준 금융 상황' : '금융 기록 안내'}
              </span>
              <p>{remote.summary}</p>
              <small>{remote.llm_used
                ? 'AI 설명 · 금액은 금융 기록 기준'
                : '기록으로 계산한 안내 · AI 생성 아님'}</small>
            </div>
            {selectedDay > DEMO_SNAPSHOT_DAY && (
              <small className="ux-home-ai-projection">선택한 미래 날짜는 가정이에요. 이 분석은 11월 4일 기록을 기준으로 해요.</small>
            )}
          </>
        )
      ) : (
        <div className="ux-home-ai-local">
          <strong>이번 달 기록한 소비 {won(localInput.monthSpent)}</strong>
          <p>{localInput.lastMonthSameDay === null
            ? '기록을 더하면 지난달과 지출 변화를 비교할 수 있어요.'
            : localInput.monthSpent <= localInput.lastMonthSameDay
              ? `지난달 같은 기간보다 ${won(localInput.lastMonthSameDay - localInput.monthSpent)} 덜 기록됐어요.`
              : `지난달 같은 기간보다 ${won(localInput.monthSpent - localInput.lastMonthSameDay)} 더 기록됐어요.`}</p>
          <small>직접 입력한 가계부를 계산한 내용이에요 · AI 생성 답변이 아니에요</small>
        </div>
      )}
    </section>
  );
}
