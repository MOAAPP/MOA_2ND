import { useMemo, useState } from 'react';
import { formatKDate, todayKST } from '../../shared/dates';
import { won } from '../../shared/format';
import { CategoryIcon } from '../components/CategoryIcon';
import { TopBar } from '../components/ui';
import { recordLabel } from '../lib/cashflow';
import { CHOICE_LABEL } from '../lib/categories';
import type { DecisionRecord } from '../lib/types';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';
import { PastContent } from './Past';

export function choicePill(r: DecisionRecord) {
  if (!r.choice) return <span className="tag blue">고민 중</span>;
  const cls = r.choice === 'buy' ? '' : r.choice === 'skip' ? 'ok' : 'warn';
  return <span className={`tag ${cls}`}>{CHOICE_LABEL[r.choice]}</span>;
}

/** 기록 당시 구매/포기 차이. 실제 은행 잔고 차이는 아님 */
export function snapshotGap(r: DecisionRecord): number | null {
  const s = r.snapshot?.byChoice;
  if (!s?.buy || !s.skip) return null;
  return s.skip.monthEnd - s.buy.monthEnd;
}

export function Forks() {
  const { state } = useStore();
  const nav = useNav();
  const today = todayKST();
  const [view, setView] = useState<'future'|'past'>('future');
  const records = useMemo(() => state.records.filter(r => r.params.date >= today || !r.choice).sort((a,b)=>b.createdAt-a.createdAt),[state.records,today]);
  return <div className="page pb-world-page">
    <TopBar title="평행세계"/>
    <div className="pb-world-tabs" role="tablist" aria-label="과거와 미래 선택">
      <button role="tab" aria-selected={view==='past'} className={view==='past'?'active':''} onClick={()=>setView('past')}>지난 선택 · 과거</button>
      <button role="tab" aria-selected={view==='future'} className={view==='future'?'active':''} onClick={()=>setView('future')}>앞으로 · 미래</button>
    </div>
    {view==='past' ? <PastContent /> : <>
      <header className="pb-world-heading"><span className="pb-eyebrow">FUTURE · 선택의 실험</span><h1>오늘 선택하면,<br/>미래의 돈은 얼마나 달라질까?</h1><p>가격을 입력하면 두 선택의 예상 잔고를 바로 비교할 수 있어요.</p></header>
      <button className="pb-world-main-action" onClick={()=>nav.push({name:'decide'})}>
        <span className="pb-world-main-icon" aria-hidden="true">↗</span>
        <span><strong>새로운 소비 비교</strong><small>사기 전, 10초 비교하기</small></span>
        <span className="pb-world-main-arrow" aria-hidden="true">›</span>
      </button>
      <section className="pb-world-records"><div className="pb-compact-title"><h2>미리 비교한 선택</h2><span>{records.length}건</span></div>
      {records.length ? <div className="pb-past-list">{records.slice(0,8).map(r=><button key={r.id} className="pb-history-item" onClick={()=>nav.push({name:'record',id:r.id})}><CategoryIcon category={r.category} size={39}/><span className="pb-history-text"><b>{recordLabel(r)}</b><small>{formatKDate(r.params.date)} · {r.choice?CHOICE_LABEL[r.choice]:'아직 고민 중'}</small></span><span className="pb-history-money">{won(r.params.amount)} <span aria-hidden="true">›</span></span></button>)}</div> : <div className="pb-world-none">아직 비교한 선택이 없어요.<br/>첫 비교를 시작해 보세요.</div>}
      </section>
    </>}
  </div>;
}
