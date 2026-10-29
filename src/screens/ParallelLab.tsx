import { useState } from 'react';
import { won } from '../../shared/format';
import { TopBar } from '../components/ui';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';
import {
  WORLD_FIXED_BILLS, WORLD_SAFETY_BUFFER,
  etfValue, transactWorldWallet,
  type WorldDecision, type WorldWalletAction,
} from '../lib/worldWallet';
import { INSTRUMENTS, INSTRUMENT_BY_CODE } from '../../shared/instruments';
import type { Quote } from '../../shared/market';
import { useWallet } from '../state/wallet';
import { useLiveQuotes } from '../state/market';
import { BetterPrice } from '../components/BetterPrice';

const MOMENTS = [
  { name:'운동화', amount:129000, alternative:59000, subtitle:'다음 주 달리기 모임', dilemma:'새 운동화가 갖고 싶지만, 월세가 먼저예요.', alternativeText:'5만 9천 원 운동화', value:'새로운 취미를 시작하는 기쁨', delay:'다음 달에 다시 결정' },
  { name:'친구 생일 저녁', amount:78000, alternative:32000, subtitle:'오랜 친구의 생일', dilemma:'축하는 하고 싶은데 다음 주 통신비도 남았어요.', alternativeText:'3만 2천 원 식사', value:'친구에게 남는 추억', delay:'다음 주에 만나기' },
  { name:'공연 티켓', amount:99000, alternative:35000, subtitle:'좋아하는 아티스트 공연', dilemma:'오늘 예매 마감. 하지만 이번 달 여유는 넉넉하지 않아요.', alternativeText:'3만 5천 원 온라인 공연', value:'오늘 아니면 놓칠 수 있는 경험', delay:'이번 공연은 보류하기' },
] as const;

type Mode='future'|'past';
type Choice='buy'|'wait'|'alternative';
const options: { id:Choice; name:string; short:string }[]=[
  {id:'buy',name:'지금 구매',short:'오늘의 즐거움'},
  {id:'alternative',name:'다른 방법',short:'기쁨과 여유 사이'},
  {id:'wait',name:'일단 미루기',short:'다음 달에 결정'},
];

function useWorldActions() {
  const {state,update}=useStore();
  const [message,setMessage]=useState('');
  const act=(action:WorldWalletAction, okMessage:string) => {
    const next=transactWorldWallet(state.worldWallet,action);
    if(!next){setMessage('이번 달 사용 가능한 금액이나 보유 수량을 확인해 주세요.');return;}
    update(s=>{
      const latest=transactWorldWallet(s.worldWallet,action);
      return latest?{...s,worldWallet:latest}:s;
    });
    setMessage(okMessage);
  };
  return {wallet:state.worldWallet,act,message,setMessage};
}

function BalancePanel({compact=false}:{compact?:boolean}) {
  const w=useWallet().summary;
  return <section className={`v7-money-panel ${compact?'compact':''}`} aria-label="가상 생활비 현황">
    <div className="v7-money-overline"><span>MY WORLD · 가상 생활비</span><span>예시 상황</span></div>
    <div className="v7-money-label">이번 달 <strong>쓸 수 있는 돈</strong></div>
    <div className={`v7-money-big ${w.monthlyUsable<0?'short':''}`}>{won(w.monthlyUsable)}</div>
    {w.monthlyUsable<0 && <p className="v7-money-alert">지켜두기로 한 돈에서 {won(-w.monthlyUsable)}이 부족해요.</p>}
    <div className="v7-segments" aria-hidden="true"><span style={{flex:WORLD_FIXED_BILLS,background:'#bdc7d9'}}/><span style={{flex:WORLD_SAFETY_BUFFER,background:'#7895e9'}}/><span style={{flex:Math.max(0,w.monthlyUsable),background:'#3d68f4'}}/><span style={{flex:w.savings,background:'#57b3a3'}}/><span style={{flex:w.stockValue||0.01,background:'#a18ae9'}}/></div>
    <div className="v7-money-legend"><span><i className="gray"/>필수지출 {won(WORLD_FIXED_BILLS)}</span><span><i className="light"/>지켜둘 돈 {won(WORLD_SAFETY_BUFFER)}</span></div>
    <div className="v7-money-columns">
      <div><span>저축해 둔 돈</span><b>{won(w.savings)}</b></div>
      <div><span>ETF 평가금</span><b>{won(w.stockValue)}</b></div>
      <div><span>전체 가상 자산</span><b>{won(w.totalAssets)}</b></div>
    </div>
    <p className="v7-money-foot">저축·주식으로 옮긴 돈은 사라진 게 아니에요. <b>이번 달 사용 가능 금액에서만 제외돼요.</b></p>
  </section>;
}

function WorldCompare({amount,choice,alternative,baseline,title}:{amount:number;choice:Choice;alternative:number;baseline:number;title:string}) {
  const selectedCost=choice==='buy'?0:choice==='wait'?0:alternative;
  const now=baseline-amount;
  const alternate=baseline-selectedCost;
  const diff=Math.abs(amount-selectedCost);
  const sign=(n:number)=>`${n<0?'−':''}${won(Math.abs(n))}`;
  const bLabel=choice==='buy'?'안 산 나':choice==='wait'?'미룬 나':'대안을 고른 나';
  // 두 갈래 위치: 더 많이 남는 세계가 위로
  const hi=Math.max(now,alternate,baseline), lo=Math.min(now,alternate,baseline,0);
  const yOf=(v:number)=>30+((hi-v)/Math.max(1,hi-lo))*72;
  const y0=yOf(baseline), ya=yOf(now), yb=yOf(alternate);
  return <section className="t-split" aria-live="polite">
    <p className="t-split-eyebrow">선택이 만든 두 개의 월말</p>
    <h3 className="t-split-title">두 세계는 <em>{won(diff)}</em> 차이 나요</h3>
    <svg className="t-split-svg" viewBox="0 0 320 120" aria-hidden="true">
      <path d={`M16 ${y0} H96 C150 ${y0} 170 ${ya} 224 ${ya} H304`} fill="none" stroke="#C9D0D8" strokeWidth="2.5" strokeLinecap="round"/>
      <path d={`M16 ${y0} H96 C150 ${y0} 170 ${yb} 224 ${yb} H304`} fill="none" stroke="#3182F6" strokeWidth="3" strokeLinecap="round" className="t-split-draw" pathLength={1}/>
      <circle cx="96" cy={y0} r="5" fill="#fff" stroke="#191F28" strokeWidth="2"/>
      <text x="96" y={y0-12} textAnchor="middle" className="t-split-now">지금</text>
      <circle cx="304" cy={ya} r="4.5" fill="#fff" stroke="#B0B8C1" strokeWidth="2"/>
      <circle cx="304" cy={yb} r="5" fill="#3182F6" stroke="#fff" strokeWidth="2"/>
      <text x="296" y={ya+(ya>yb?18:-10)} textAnchor="end" className="t-split-lbl a">A</text>
      <text x="296" y={yb+(yb>ya?18:-10)} textAnchor="end" className="t-split-lbl b">B</text>
    </svg>
    <div className="t-split-ends">
      <div className="t-split-end a"><span><i>A</i>지금 사는 나</span><b className={`num ${now<0?'neg':''}`}>{sign(now)}</b><small>{now<0?'지켜둘 생활비를 써야 해요':'이번 달 남는 여유'}</small></div>
      <div className="t-split-end b"><span><i>B</i>{bLabel}</span><b className={`num ${alternate<0?'neg':''}`}>{sign(alternate)}</b><small>{alternate<0?'지켜둘 생활비를 써야 해요':'이번 달 남는 여유'}</small></div>
    </div>
    <p className="t-split-note">{choice==='buy'?`지금 ${title}을(를) 누릴 수 있어요. 다르게 골랐다면 그만큼 현금이 더 남아요.`:choice==='alternative'?`더 저렴한 선택으로 ${won(amount-alternative)}을 남기면서 경험도 일부 가져가요.`:'이번 달엔 돈을 남기지만, 원하는 경험은 다음으로 넘겨요.'}</p>
  </section>;
}

function PageTabs({mode,setMode}:{mode:Mode;setMode:(m:Mode)=>void}) {
  return <div className="v7-page-tabs t-seg" role="tablist" aria-label="세계 비교"><button role="tab" aria-selected={mode==='future'} className={mode==='future'?'active':''} onClick={()=>setMode('future')}>앞으로의 선택</button><button role="tab" aria-selected={mode==='past'} className={mode==='past'?'active':''} onClick={()=>setMode('past')}>지난 선택</button></div>;
}

export function ParallelLab({initialMode='future',embedded=false}:{initialMode?:Mode;embedded?:boolean}) {
  const nav=useNav();
  const {wallet,act,message}=useWorldActions();
  const [mode,setMode]=useState<Mode>(initialMode);
  const [caseIndex,setCaseIndex]=useState(0);
  const [choice,setChoice]=useState<Choice>('alternative');
  const [custom,setCustom]=useState(false);
  const [customTitle,setCustomTitle]=useState('내가 고민 중인 소비');
  const [customPrice,setCustomPrice]=useState('65000');
  const [customAlternative,setCustomAlternative]=useState('30000');
  const moment=MOMENTS[caseIndex];
  const title=custom?customTitle:moment.name;
  const price=custom?Math.max(0,Math.floor(Number(customPrice)||0)):moment.amount;
  const alternative=custom?Math.max(0,Math.floor(Number(customAlternative)||0)):moment.alternative;
  const spend=choice==='buy'?price:choice==='wait'?0:alternative;
  const current=useWallet().summary;
  const wouldHave=current.monthlyUsable-spend;
  const commit=()=>{
    if(!title.trim()||!Number.isSafeInteger(price)||price<=0||alternative>price)return;
    const d:WorldDecision={id:`world-${Date.now()}`,title,price,paid:spend,choice,at:Date.now(),note:custom?'내가 입력한 소비':moment.subtitle};
    act({type:'spend',decision:d},`${title}: ${choice==='wait'?'미루기':choice==='alternative'?'대안 선택':'구매'}를 가상 세계에 반영했어요.`);
  };
  return <div className={`page no-nav v7-page ${embedded?'v7-embedded':''}`}>
    <TopBar title="평행세계" onBack={embedded?undefined:nav.pop} center/>
    <header className="t-lab-head"><h1>이 돈을 쓰면,<br/>월말의 나는 괜찮을까?</h1></header>
    <div className="t-lab-budget"><span>이번 달 쓸 수 있는 돈</span><b className={`num ${current.monthlyUsable<0?'neg':''}`}>{won(current.monthlyUsable)}</b></div>
    <PageTabs mode={mode} setMode={setMode}/>
    {mode==='future'?<>
      <div className="v7-section-title"><span>지금 고민해 볼 상황</span><small>{caseIndex+1} / {MOMENTS.length}</small></div>
      <div className="v7-scenario-chooser">{MOMENTS.map((m,i)=><button key={m.name} className={!custom&&caseIndex===i?'active':''} aria-pressed={!custom&&caseIndex===i} onClick={()=>{setCustom(false);setCaseIndex(i);setChoice('alternative')}}>{m.name}</button>)}<button className={custom?'active':''} onClick={()=>setCustom(true)}>직접 입력 +</button></div>
      <section className="v7-scenario">
        <span className="v7-scene-label">{custom?'내 소비':moment.subtitle} <span>· 가상의 월세 납부 전</span></span>
        <div className="v7-scene-title"><div><strong>{title}</strong><p>{custom?'금액을 직접 넣고 선택해 보세요.':moment.dilemma}</p></div><span className="v7-scene-price">{won(price)}</span></div>
        {custom&&<div className="v7-fields"><label>고민 중인 것<input value={customTitle} onChange={e=>setCustomTitle(e.target.value)} maxLength={28}/></label><label>가격 (원)<input inputMode="numeric" value={customPrice} onChange={e=>setCustomPrice(e.target.value.replace(/[^0-9]/g,''))}/></label><label>대안 가격 (원)<input inputMode="numeric" value={customAlternative} onChange={e=>setCustomAlternative(e.target.value.replace(/[^0-9]/g,''))}/></label></div>}
        <div className="v7-choice-list" role="group" aria-label="이 소비의 선택지">{options.map((o,i)=><button key={o.id} className={choice===o.id?'active':''} aria-pressed={choice===o.id} onClick={()=>setChoice(o.id)}><span className="v7-choice-number">0{i+1}</span><span><b>{o.name}</b><small>{o.id==='buy'?(custom?'지금 결제':moment.value):o.id==='wait'?(custom?'이번 달에는 결제하지 않기':moment.delay):(custom?'조금 저렴한 대안':moment.alternativeText)}</small></span><strong>{o.id==='buy'?won(price):o.id==='wait'?'0원':won(alternative)}</strong><span className="v7-select-indicator"/></button>)}</div>
      </section>
      {title.trim()&&title!=='내가 고민 중인 소비'&&price>0&&<BetterPrice query={title} price={price} forceSearch={custom} onUse={({price:p})=>{setCustomTitle(title);setCustomPrice(String(price));setCustomAlternative(String(p));setCustom(true);setChoice('alternative');}}/>}
      <WorldCompare amount={price} choice={choice} alternative={alternative} baseline={current.monthlyUsable} title={title}/>
      <div className={`v7-decision-verdict ${wouldHave<0?'warning':''}`}><span>{wouldHave<0?'주의 · 생활비 안전선 아래':'이번 달 생활비 안에서 가능한 선택'}</span><p>{wouldHave<0?`선택하면 지켜두려던 돈에서 ${won(-wouldHave)}을 써야 해요.`:`선택 후에도 이번 달에 ${won(wouldHave)}을 쓸 수 있어요.`}</p></div>
      {alternative>price&&<p className="v7-invalid">대안 가격은 원래 가격보다 낮게 입력해 주세요.</p>}
      <button className="v7-primary" disabled={price<=0||alternative>price||!title.trim()||spend>wallet.cash} onClick={commit}>이 선택으로 내 세계 이어가기 <span>→</span></button>
      {message&&<p className="v7-confirmation" role="status">{message}</p>}
      <div className="v7-after-actions"><button onClick={()=>{nav.reset();nav.setTab('invest')}}>남은 돈을 저축·투자로 나누기 <span>↗</span></button><button onClick={()=>setMode('past')}>지난 선택이 쌓인 세계 보기 <span>↗</span></button></div>
    </>:<section className="v7-past"><div className="v7-section-title"><span>그때 달리했다면?</span><small>내 선택 {wallet.decisions.length}건</small></div>
      {wallet.decisions.length? <>
        <p className="v7-past-lead">같은 하루에서 출발했지만, 다른 선택을 했을 수도 있어요.</p>
        {wallet.decisions.slice().reverse().map((d)=><div key={d.id} className="v7-past-item"><small>{new Date(d.at).toLocaleDateString('ko-KR')} · {d.note}</small><b>{d.title}</b><div><span>실제로 체험한 선택<br/><strong>−{won(d.paid)}</strong></span><span>{d.choice==='buy'?'구매를 보류했다면':'지금 구매했다면'}<br/><strong>−{won(d.choice==='buy'?0:d.price)}</strong></span></div><p>{d.choice==='buy'?'실제 체험에 남은 경험과, 구매를 보류했다면 남았을 현금을 비교해 보세요.':`이 선택 하나로 ${won(d.price-d.paid)}을 이번 달에 남겼어요.`}</p></div>)}
        <button className="v7-subtle-button" onClick={()=>act({type:'undoDecision'},'가장 최근 선택을 되돌렸어요.')}>마지막 선택 되돌리기 ↶</button>
      </>:<div className="v7-empty-history"><span>◌</span><h3>아직 갈라진 세계가 없어요.</h3><p>내가 직접 소비를 선택해야 실제 고민이 시작돼요. 먼저 선택을 만들어 보세요.</p><button onClick={()=>setMode('future')}>첫 선택 해보기 →</button></div>}
      {message&&<p className="v7-confirmation" role="status">{message}</p>}
      <button className="v7-subtle-button" onClick={()=>nav.push({name:'past'})}>기존 실제 기록으로 과거 비교하기 ↗</button>
    </section>}
    <p className="v7-disclaimer">가상 예시 · 은행 계좌와 연결되지 않아요. 월세·생활비·주가도 실험용 가정입니다.</p>
  </div>;
}

const ETFS=INSTRUMENTS.filter(i=>i.type==='etf');
const SOURCE:Record<string,string>={kis:'한국투자증권',naver:'네이버 금융',yahoo:'Yahoo',demo:'예시 시세'};
const hhmm=(t:number)=>new Date(t).toLocaleTimeString('ko-KR',{hour:'2-digit',minute:'2-digit',timeZone:'Asia/Seoul'});
function quoteNote(q:Quote|undefined){
  if(!q)return '시세 불러오는 중';
  return `${SOURCE[q.source]??q.source} · ${q.date===new Date(Date.now()+9*3600e3).toISOString().slice(0,10)?'오늘':q.date.slice(5).replace('-','/')} ${hhmm(q.time)} 기준${q.delayed?' · 지연':''}`;
}

export function WorldInvestment() {
  const nav=useNav();
  const {wallet,act,message}=useWorldActions();
  const {summary:s}=useWallet();
  const m=useLiveQuotes(ETFS.map(e=>e.code));
  const [qty,setQty]=useState<Record<string,number>>({});
  const held=Object.entries(wallet.etfs||{}).filter(([,h])=>h.qty>0);
  return <div className="page v7-page v7-invest-page">
    <TopBar title="생활비로 ETF 사보기" onBack={nav.pop}/>
    <header className="v7-head"><span className="v7-eyebrow">MONEY LAB · 같은 돈, 다른 활용</span><h1>이번 달 남는 돈으로<br/>진짜 ETF를 사 보면?</h1><p>모의투자 탭과 같은 종목, 같은 시세를 써요. 돈은 가상이지만 가격은 실제 시장을 따라 움직여요.</p></header>
    <BalancePanel/>
    {held.length>0&&<><div className="v7-section-title"><span>생활비로 산 ETF</span><small>실시간 시세로 평가</small></div>
      <section className="etf-held">{held.map(([code,h])=>{const inst=INSTRUMENT_BY_CODE[code];const q=m.quotes[code];const value=etfValue(code,h,q?{[code]:q.price}:undefined);const pl=value-h.cost;
        return <div key={code} className="etf-held-row"><button className="etf-held-main" onClick={()=>nav.push({name:'stock',code})}><b>{inst?.name??code}</b><small>{h.qty}주 · 평균 {won(Math.round(h.cost/h.qty))}</small></button><span className="etf-held-val"><b>{won(value)}</b><small className={pl>0?'up':pl<0?'down':''}>{pl>0?'+':pl<0?'−':''}{won(Math.abs(pl))}</small></span>
          <button className="etf-sell" disabled={!q} onClick={()=>q&&act({type:'sellEtf',code,name:inst?.name??code,qty:1,price:q.price},`${inst?.name??code} 1주를 ${won(q.price)}에 팔고 현금으로 옮겼어요.`)}>1주 팔기</button></div>;})}
        <p className="etf-note">팔기 전까지 평가금은 이번 달 쓸 수 있는 돈에 들어가지 않아요.</p></section></>}
    <div className="v7-section-title"><span>살 수 있는 ETF</span><small>쓸 수 있는 돈 {won(Math.max(0,s.monthlyUsable))}</small></div>
    {ETFS.map(inst=>{const q=m.quotes[inst.code];const err=m.errors[inst.code];const n=qty[inst.code]??1;const total=q?n*q.price:0;const ok=!!q&&total<=s.monthlyUsable;
      return <section key={inst.code} className="v7-transfer-card etf-card">
        <div className="etf-top"><div className="v7-transfer-icon stocks">↗</div><div className="v7-transfer-title"><h2>{inst.name}</h2><p>{inst.summary}</p></div></div>
        <div className="etf-price"><strong>{q?won(q.price):'—'}</strong>{q&&q.changePct!=null&&<span className={q.changePct>0?'up':q.changePct<0?'down':''}>{q.changePct>0?'+':''}{q.changePct.toFixed(2)}%</span>}<small>{err&&!q?'시세를 불러오지 못했어요':quoteNote(q)}</small></div>
        <div className="etf-qty" role="group" aria-label="수량">{[1,2,3].map(k=><button key={k} className={n===k?'on':''} aria-pressed={n===k} onClick={()=>setQty(v=>({...v,[inst.code]:k}))}>{k}주</button>)}</div>
        <div className="v7-transfer-forecast"><span>사고 나면 이번 달 쓸 수 있는 돈</span><b>{q?won(s.monthlyUsable-total):'—'}</b></div>
        <button className="v7-action-stock" disabled={!ok} onClick={()=>q&&act({type:'buyEtf',code:inst.code,name:inst.name,qty:n,price:q.price},`${inst.name} ${n}주를 ${won(q.price)}에 샀어요.`)}>{!q?'시세를 기다리는 중':ok?`${won(total)}으로 ${n}주 사기`:'이번 달 쓸 수 있는 돈이 부족해요'}</button>
        <button className="v7-quiet" onClick={()=>nav.push({name:'stock',code:inst.code})}>차트 · 뉴스 보기 ↗</button>
      </section>;})}
    {message&&<div className="v7-confirmation" role="status">{message}</div>}
    <div className="v7-invest-footer"><button onClick={()=>{nav.pop();nav.setTab('invest')}}>1,000만 원 모의투자로 더 연습하기 →</button><button onClick={()=>{nav.reset();nav.setTab('learn')}}>ETF가 뭔지 배우기 →</button><button className="reset" onClick={()=>act({type:'reset'},'가상 생활비를 처음 상태로 되돌렸어요.')}>실험 처음부터 다시 시작</button></div>
    <p className="v7-disclaimer">실제 주문이 아닌 학습용 연습이에요. 가격은 시세 제공처의 최근 가격이고, 장이 닫혀 있으면 마지막 가격으로 계산해요. 수수료·세금은 빼고 계산해요.</p>
  </div>;
}
