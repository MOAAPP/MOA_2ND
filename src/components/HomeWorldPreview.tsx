import { useMemo } from 'react';
import { ParallelSwipe } from './ParallelSwipe';
import type { CompareResult } from '../lib/stage3Api';
import type { WorldHistoryPoint } from '../lib/worldHistory';

const fmt = (amount: number) => Math.abs(amount).toLocaleString('ko-KR') + '원';
const choices = [10000, 20000, 50000] as const;

/**
 * The *original* parallel swipe / kinetic morph component, now backed only by
 * server-calculated canonical S01–S20 scenario balances (never made-up client
 * finance). Pointer/touch scrub updates TWO values from the same date.
 */
export function HomeWorldPreview({ comparison, amount, onAmount, onExpand }: {
  comparison: CompareResult | null;
  amount: number;
  onAmount: (amount: number) => void;
  onExpand: () => void;
}) {
  const points = useMemo<WorldHistoryPoint[]>(() => {
    if (!comparison) return [];
    const noPurchase = comparison.paths.find(p => p.scenario_id === 'no_purchase' && p.status === 'calculated');
    const purchase = comparison.paths.find(p => p.scenario_id === 'purchase_now' && p.status === 'calculated');
    if (!noPurchase || !purchase) return [];
    const days = noPurchase.daily_cashflow.slice(0, 14);
    const rows: WorldHistoryPoint[] = [
      { date: comparison.as_of, actual: comparison.available_cash, alternative: comparison.available_cash, gap: 0, events: [] },
    ];
    for (const row of days) {
      const twin = purchase.daily_cashflow.find(d => d.date === row.date);
      if (!twin) continue;
      rows.push({
        date: row.date,
        actual: row.closing_balance,
        alternative: twin.closing_balance,
        gap: row.closing_balance - twin.closing_balance,
        events: [],
      });
    }
    return rows.length > 1 ? rows : [];
  }, [comparison]);

  const ready = points.length > 1;
  return <section className="ux-world-kinetic" aria-label="두 세계를 움직여 비교하기">
    <div className="ux-world-kinetic-head">
      <div>
        <span className="ux-motion-overline">PARALLEL WORLDS <i aria-hidden="true" /></span>
        <h2>같은 오늘, 다른 미래</h2>
        <p>하나의 소비가 잔액의 흐름을 어떻게 바꾸는지 직접 움직여 보세요.</p>
      </div>
      <button className="ux-world-expand" onClick={onExpand} type="button" aria-label="평행세계 전체 비교 보기">전체 비교 ↗</button>
    </div>
    <div className="ux-world-amount" role="group" aria-label="가상 구매 금액 선택">
      <span>비교할 가상 소비</span>
      <div>
        {choices.map(price => <button type="button" key={price}
          aria-pressed={amount === price}
          onClick={() => onAmount(price)}>
          {price.toLocaleString('ko-KR')}원
        </button>)}
        {!choices.includes(amount as typeof choices[number]) && <span className="ux-world-other">{fmt(amount)}</span>}
      </div>
    </div>
    <div className="ux-world-kinetic-stage" aria-busy={!ready}>
      {ready ? <ParallelSwipe
        points={points}
        hoverScrub
        labels={{
          primary: '사지 않은 나',
          alternative: '지금 구매한 나',
          gap: '14일 동안 선택이 만든 잔액 차이',
          end: '14일 뒤',
          reset: '마지막 날로',
        }}
      /> : <div className="ux-world-loading" role="status">
        <svg viewBox="0 0 340 124" aria-hidden="true">
          <path d="M8 70 C90 70 135 35 330 28" />
          <path d="M8 70 C90 70 145 91 330 104" />
        </svg>
        <span>선택의 미래를 계산하고 있어요</span>
      </div>}
    </div>
    <p className="ux-world-gesture" aria-label="그래프 조작 안내">
      <span className="ux-world-gesture-glyph" aria-hidden="true">↔</span>
      마우스를 움직이거나 손가락으로 밀어 날짜를 비교해 보세요
    </p>
    <p className="ux-world-disclaimer">가상의 구매 선택을 비교한 결과예요. 실제 계좌 잔액이나 구매 기록은 바뀌지 않아요.</p>
  </section>;
}
