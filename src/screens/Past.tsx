import { useMemo, useState } from 'react';
import { todayKST, formatKDate } from '../../shared/dates';
import { won } from '../../shared/format';
import { CategoryIcon } from '../components/CategoryIcon';
import { choiceFlows, recordLabel } from '../lib/cashflow';
import { CHOICE_LABEL } from '../lib/categories';
import type { Choice, DecisionRecord } from '../lib/types';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';
import { TopBar } from '../components/ui';

/** 
 * 회고는 입력된 의사결정의 현금 유출 차이만 비교한다.
 * 실제 과거 은행 잔고, 투자 수익, ML 인과 추론으로 해석하지 않는다.
 */
function flowsUntil(r: DecisionRecord, choice: Choice, today: string) {
  return -choiceFlows(r.params, choice, recordLabel(r))
    .filter((f) => f.date <= today)
    .reduce((sum, f) => sum + f.amount, 0);
}

const alternative = (r: DecisionRecord): Choice => {
  if (r.parallelAs !== r.choice && (r.parallelAs === 'buy' || r.parallelAs === 'skip' || r.parallelAs === 'alt' && !!r.params.altAmount || r.parallelAs === 'delay' && !!r.params.delayDate)) return r.parallelAs;
  return r.choice === 'buy' ? 'skip' : 'buy';
};

export function PastContent() {
  const { state } = useStore();
  const nav = useNav();
  const today = todayKST();
  const records = useMemo(() => state.records.filter(r => !!r.choice && r.params.date <= today)
    .sort((a, b) => b.params.date.localeCompare(a.params.date) || b.createdAt - a.createdAt), [state.records, today]);
  const [selectedId, setSelectedId] = useState('');
  const selected = records.find(r => r.id === selectedId) ?? records[0];
  const comparison = selected && selected.choice ? {
    actual: flowsUntil(selected, selected.choice, today),
    other: flowsUntil(selected, alternative(selected), today),
    choice: alternative(selected),
  } : null;
  const delta = comparison ? comparison.actual - comparison.other : 0;

  return <div className="pb-past">
    <header className="pb-past-title"><div><span className="pb-eyebrow">PAST · 선택의 기록</span><h2>그때 다르게 선택했다면?</h2></div><p>기록한 소비를 바탕으로, 오늘까지의 지출 차이를 돌아봐요.</p></header>
    {!records.length ? <div className="pb-empty-past"><span aria-hidden="true">↩</span><h3>아직 돌아볼 선택이 없어요</h3><p>소비를 비교하고 선택을 저장하면, 여기에서 과거의 다른 가능성을 확인할 수 있어요.</p><button className="btn primary block" onClick={() => nav.push({ name: 'decide' })}>첫 선택 비교하기</button></div> : <>
      <section className="pb-retro-summary" aria-label="지난 선택 요약"><span>기록한 지난 선택</span><strong>{records.length}<small>건</small></strong><p>하나를 선택해 실제로 한 선택과 다른 선택을 비교해 보세요.</p></section>
      <div className="pb-section-title">내가 선택한 순간</div>
      <div className="pb-past-list" role="group" aria-label="회고할 소비 기록">
        {records.map(r => <button type="button" key={r.id} className={`pb-history-item ${selected?.id === r.id ? 'is-active' : ''}`} aria-pressed={selected?.id===r.id} onClick={()=>setSelectedId(r.id)}>
          <CategoryIcon category={r.category} size={39}/><span className="pb-history-text"><b>{recordLabel(r)}</b><small>{formatKDate(r.params.date)} · {r.choice ? CHOICE_LABEL[r.choice] : '선택 전'}</small></span><span className="pb-history-money">{won(r.params.amount)}<span className="pb-history-chevron">›</span></span>
        </button>)}
      </div>
      {selected && comparison && <section className="pb-retro-detail" key={selected.id}>
        <div className="pb-retro-detail-head"><span>오늘까지의 지출 차이</span><button onClick={()=>nav.push({name:'record',id:selected.id})}>선택 기록 보기 <span aria-hidden="true">↗</span></button></div>
        <h3>{recordLabel(selected)}</h3>
        <div className="pb-retro-scenarios">
          <div className="pb-retro-scene"><span><i className="pb-dot real"/> 내가 한 선택</span><b>{CHOICE_LABEL[selected.choice!]}</b><strong>{won(comparison.actual)}</strong><small>오늘까지 지출로 기록된 금액</small></div>
          <div className="pb-retro-scene alternate"><span><i className="pb-dot parallel"/> 다르게 했다면</span><b>{CHOICE_LABEL[comparison.choice]}</b><strong>{won(comparison.other)}</strong><small>오늘까지의 가상 지출 금액</small></div>
        </div>
        <div className="pb-retro-result"><span>다른 선택의 오늘까지 남는 돈 차이</span><strong className={delta>0?'positive':delta<0?'negative':''}>{delta>0?'+':delta<0?'−':''}{won(Math.abs(delta))}</strong></div>
        <p className="pb-retro-note">입력한 소비·할부 일정만 비교한 가상 차이예요. 실제 계좌의 과거 잔고나 선택의 만족도를 뜻하지 않아요.</p>
      </section>}
    </>}
  </div>;
}

export function Past() {
  const nav = useNav();
  return <div className="page no-nav pb-past-page"><TopBar title="지난 선택 돌아보기" onBack={nav.pop} center/><PastContent/></div>;
}
