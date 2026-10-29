import { useMemo } from 'react';
import { addDays, endOfMonth, maxDate, todayKST } from '../../shared/dates';
import { won } from '../../shared/format';
import { Logo } from '../components/Glyph';
import { IconGear } from '../components/Icons';
import { TopBar } from '../components/ui';
import { balanceOn, buildWorlds } from '../lib/cashflow';
import { walletSummary, WORLD_FIXED_BILLS, WORLD_SAFETY_BUFFER } from '../lib/worldWallet';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';

/** 금융 현황을 우선 보여주고, 과거/미래 선택으로 곧장 진입한다. */
export function Home() {
  const {state,update}=useStore();
  const nav=useNav();
  const profile=state.profile!;
  const today=todayKST();
  const from=maxDate(today,profile.baseDate);
  const monthEnd=endOfMonth(from);
  const horizon=maxDate(monthEnd,addDays(from,31));
  const worlds=useMemo(()=>buildWorlds(profile,state.records,horizon),[profile,state.records,horizon]);
  const actualBalance=balanceOn(worlds.reality,from)??profile.baseBalance;
  const projected=balanceOn(worlds.reality,monthEnd)??actualBalance;
  const alternative=balanceOn(worlds.parallel,monthEnd)??projected;
  const realPast=state.records.filter(r=>r.choice&&r.params.date<=today).length;
  const w=walletSummary(state.worldWallet);
  const isDemo=state.demo;
  return <div className="page v7-dashboard">
    <TopBar title={<span className="brand"><Logo size={24}/>평행통장</span>} right={<button className="icon-btn" aria-label="설정" onClick={()=>nav.push({name:'settings'})}><IconGear/></button>}/>
    <header className="v7-dashboard-intro"><span className="v7-demo-label">{isDemo?'체험 중 · 가상 데이터':'MY MONEY · 직접 입력한 정보'}</span><h1>내 돈의 현재와<br/><em>선택하지 않은 미래</em></h1></header>
    {isDemo ? <section className="v7-home-asset" aria-label="연습용 돈 현황">
        <div className="v7-home-asset-top"><span>이번 달 사용 가능 금액</span><span className="v7-tag-blue">가상 생활비</span></div>
        <strong className="v7-home-asset-number">{won(w.monthlyUsable)}</strong>
        <p className="v7-home-asset-caption">80만 원 중 필수지출 {won(WORLD_FIXED_BILLS)} · 지켜둘 돈 {won(WORLD_SAFETY_BUFFER)} 제외</p>
        <div className="v7-home-asset-breakdown">
          <button onClick={()=>nav.setTab('invest')}><span>저축해 둔 돈</span><b>{won(w.savings)}</b><small>이동하기 ↗</small></button>
          <button onClick={()=>nav.setTab('invest')}><span>주식 평가금</span><b>{won(w.stockValue)}</b><small>살펴보기 ↗</small></button>
        </div>
        <div className="v7-home-asset-total"><span>전체 가상 자산</span><strong>{won(w.totalAssets)}</strong></div>
      </section>
    : <section className="v7-home-asset" aria-label="입력한 재무 정보 기반 현황"><div className="v7-home-asset-top"><span>내가 입력한 현재 잔고</span><span className="v7-tag-blue">직접 입력</span></div><strong className="v7-home-asset-number">{won(actualBalance)}</strong><p className="v7-home-asset-caption">은행 실시간 잔고가 아니며 입력값 기준이에요.</p><div className="v7-home-asset-total"><span>월말 예상 잔고</span><strong>{won(projected)}</strong></div><button className="v7-home-link" onClick={()=>nav.push({name:'finance'})}>내 재무 정보 수정하기 →</button></section>}
    <section className="v7-home-decision" aria-label="평행세계 선택"><div className="v7-block-heading"><div><span>CHOICE</span><h2>어떤 선택을 살펴볼까요?</h2></div></div>
      <div className="v7-home-doors">
        <button className="v7-home-door future" onClick={()=>nav.push({name:'lab'})}><span className="v7-door-symbol">↗</span><small>FUTURE · 미래</small><b>오늘 이걸 사면<br/>월말은 괜찮을까?</b><span className="v7-door-bottom">선택 전 비교 <strong>→</strong></span></button>
        <button className="v7-home-door past" onClick={()=>nav.push({name:'lab',mode:'past'})}><span className="v7-door-symbol">↶</span><small>PAST · 과거</small><b>그때 다른 선택을<br/>했더라면?</b><span className="v7-door-bottom">지난 선택 비교 <strong>→</strong></span></button>
      </div>
      <p className="v7-home-meta">처음이라면 예시 생활비로 연습하고, 내 소비에도 적용할 수 있어요.</p>
    </section>
    <section className="v7-home-actions"><div className="v7-block-heading"><div><span>MY NEXT STEP</span><h2>지금 할 수 있는 것</h2></div></div>
      <button className="v7-home-action" onClick={()=>nav.setTab('invest')}><span className="v7-action-glyph mint">₩</span><span><b>남긴 돈 저축·투자로 옮기기</b><small>옮기면 이번 달 사용 가능 금액에서 빠져요</small></span><strong>›</strong></button>
      <button className="v7-home-action" onClick={()=>nav.setTab('learn')}><span className="v7-action-glyph purple">✎</span><span><b>금융 개념을 퀴즈로 익히기</b><small>읽기 · 퀴즈 · 실습</small></span><strong>›</strong></button>
      <button className="v7-home-action" onClick={()=>nav.push({name:'decide'})}><span className="v7-action-glyph blue">◈</span><span><b>내 생활비로 소비 비교하기</b><small>월세·다음 수입일을 반영한 계산</small></span><strong>›</strong></button>
    </section>
    {isDemo ? <section className="v7-home-real-switch"><span><b>내 상황에 맞추고 싶다면</b><small>가상 예시와 실제 입력 정보는 섞이지 않아요.</small></span><button onClick={()=>update(s=>({...s,profile:null,records:[],spendLog:[],demo:false,setupDraft:null}))}>내 생활비 설정 →</button></section>
      : <section className="v7-home-real-switch"><span><b>다르게 선택했다면?</b><small>{realPast?`기록된 선택 ${realPast}건 · 다른 월말 ${won(alternative)}`:'직접 기록한 선택을 과거와 비교할 수 있어요.'}</small></span><button onClick={()=>nav.push({name:'past'})}>돌아보기 →</button></section>}
  </div>;
}
