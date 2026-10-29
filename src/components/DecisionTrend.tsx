import { useMemo } from 'react';
import { formatShort } from '../../shared/dates';
import { won } from '../../shared/format';
import type { Simulation } from '../lib/cashflow';

/** 첫 화면에는 상세 그래프보다 결론을 먼저 보여줍니다. */
export function DecisionTrend({ buy, alternative, from, to, alternativeLabel }: {
  buy: Simulation; alternative: Simulation; from: string; to: string; alternativeLabel: string;
}) {
  const values = useMemo(() => {
    const a = buy.days.find((d) => d.date === to)?.close ?? buy.days[buy.days.length - 1]?.close ?? 0;
    const b = alternative.days.find((d) => d.date === to)?.close ?? alternative.days[alternative.days.length - 1]?.close ?? 0;
    const max = Math.max(Math.abs(a), Math.abs(b), 1);
    return { a, b, max };
  }, [buy, alternative, to]);
  const diff = values.b - values.a;
  return (
    <section className="quick-compare" aria-label="선택별 월말 잔고 비교">
      <div className="quick-compare-top"><div><span className="decision-eyebrow">한눈에 비교</span><h3>{formatShort(to)}에 예상되는 잔고</h3></div><span className="quick-compare-period">{formatShort(from)}부터</span></div>
      <div className="quick-compare-bar-item"><div className="quick-compare-row"><span><i className="quick-dot buy"/>지금 구매</span><b className="num">{won(values.a)}</b></div><div className="quick-bar-track"><span className="quick-bar-fill buy" style={{ width: `${Math.max(4,Math.abs(values.a)/values.max*100)}%` }}/></div></div>
      <div className="quick-compare-bar-item"><div className="quick-compare-row"><span><i className="quick-dot alt"/>{alternativeLabel}</span><b className="num">{won(values.b)}</b></div><div className="quick-bar-track"><span className="quick-bar-fill alt" style={{ width: `${Math.max(4,Math.abs(values.b)/values.max*100)}%` }}/></div></div>
      <div className="quick-compare-note">{diff === 0 ? '월말 예상 잔고는 같아요.' : `다른 선택을 하면 월말에 ${won(Math.abs(diff))} ${diff>0 ? '더 남아요.' : '덜 남아요.'}`}</div>
      {(values.a < 0 || values.b < 0) && <p className="quick-compare-warning">마이너스 잔고는 막대 길이로 절댓값을 표시했어요. 부족한 금액인지 숫자를 확인하세요.</p>}
    </section>
  );
}
