import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { won } from '../../shared/format';
import { useStore } from '../state/store';
import {
  compareScenarios, getDemoDefault, getDemoHome, getDemoUsers, getInstruments, saveScenario,
  type CompareRequest, type CompareResult, type HomeState, type Instrument,
  type ScenarioPath,
} from '../lib/stage3Api';

const W = (amount: number | undefined | null) => amount == null ? '—' : won(amount);
function shiftDate(iso: string, days: number) {
  const [y,m,d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m-1, d + days)).toISOString().slice(0,10);
}
function splitBudget(amount: number) {
  const purchase = Math.floor(amount * .4);
  const savings = Math.floor(amount * .3);
  const investment = Math.floor(amount * .2);
  return {purchase, savings, investment, cash: amount-purchase-savings-investment};
}
const labels: Record<string,string> = {
  purchase_now: '지금 구매', no_purchase: '미구매', purchase_delay: '구매 연기',
  virtual_savings: '가상 저축', virtual_investment: '가상 투자', mixed: '혼합 배분',
};
const emptyReq: CompareRequest = {
  user_id: '', as_of: '', horizon_days: 30, purchase_amount: 0,
  purchase_date: '', purchase_delay_days: 7, payment_method: 'debit',
  savings_amount: 0, savings_monthly_amount: 0, savings_goal_current: 0,
  investment_amount: 0, investment_return_percent: 0, minimum_required_balance: 0,
  stress: 'baseline', allocation: splitBudget(0),
};

type ContextState = {
  user: string; day: string; users: string[]; dateStart: string; dateEnd: string;
  home: HomeState|null; instruments: Instrument[]; comparison: CompareResult|null;
  params: CompareRequest; loading: boolean; comparing: boolean; error: string;
  compareError: string; retry: () => void; selectUser: (v: string) => void;
  selectDay: (v: string) => void; updateParams: (value: Partial<CompareRequest>) => void;
};
const Context = createContext<ContextState|null>(null);
function useTwin() {
  const ctx = useContext(Context);
  if (!ctx) throw new Error('Stage3Provider required');
  return ctx;
}

export function Stage3Provider({children}: {children: ReactNode}) {
  const [user,setUser]=useState('');
  const [day,setDay]=useState('');
  const [users,setUsers]=useState<string[]>([]);
  const [dateStart,setDateStart]=useState('');
  const [dateEnd,setDateEnd]=useState('');
  const [home,setHome]=useState<HomeState|null>(null);
  const [homeKey,setHomeKey]=useState('');
  const [instruments,setInstruments]=useState<Instrument[]>([]);
  const [comparison,setComparison]=useState<CompareResult|null>(null);
  const [params,setParams]=useState<CompareRequest>(emptyReq);
  const [error,setError]=useState('');
  const [compareError,setCompareError]=useState('');
  const [loading,setLoading]=useState(true);
  const [comparing,setComparing]=useState(false);
  const [retryCount,setRetryCount]=useState(0);
  const retry=()=>setRetryCount(n=>n+1);

  useEffect(()=>{
    const controller=new AbortController();
    setLoading(true); setError('');
    Promise.all([getDemoDefault(controller.signal),getDemoUsers(controller.signal)])
      .then(([main, list])=>{
        if(controller.signal.aborted)return;
        if(!list.users.includes(main.user_id))throw new Error('기본 시연 사용자 ID가 20명 목록에 없어요.');
        setUsers(list.users);setDateStart(main.observation_start);setDateEnd(main.observation_end);
        setUser(v=>v||main.user_id);setDay(v=>v||main.as_of_date);
      })
      .catch(e=>{if(!controller.signal.aborted){setError(e instanceof Error?e.message:'기본 데이터 조회 실패');setLoading(false);}});
    return ()=>controller.abort();
  },[retryCount]);

  useEffect(()=>{
    if(!user||!day)return;
    const controller=new AbortController();
    setLoading(true);setHome(null);setHomeKey('');setComparison(null);
    setError('');setCompareError('');setInstruments([]);
    Promise.all([getDemoHome(user,day,controller.signal),getInstruments(user,day,controller.signal)])
      .then(([current, assets])=>{
        if(controller.signal.aborted)return;
        setHome(current);setHomeKey(`${user}:${day}`);setInstruments(assets.prices);
        const candidate = current.purchase_candidates.at(-1);
        const total = candidate?.main_product?.final_estimated_payment ?? 0;
        const amount = Number.isSafeInteger(total) && total > 0 ? total : 0;
        const firstInstrument=assets.prices[0];
        setParams({
          ...emptyReq, user_id:user, as_of:day, purchase_date:shiftDate(day,1),
          purchase_amount:amount, savings_amount:amount, investment_amount:amount,
          investment_code:firstInstrument?.code, allocation:splitBudget(Math.min(amount,Math.max(0,current.available_cash))),
        });
        setLoading(false);
      })
      .catch(e=>{if(!controller.signal.aborted){
        setError(e instanceof Error?e.message:'금융 데이터를 불러오지 못했어요.');setLoading(false);
      }});
    return ()=>controller.abort();
  },[user,day,retryCount]);

  useEffect(()=>{
    if(!home||homeKey!==`${user}:${day}` || params.user_id!==user || params.as_of!==day)return;
    const controller=new AbortController();
    const timer=window.setTimeout(()=>{
      setComparing(true);setComparison(null);setCompareError('');
      compareScenarios(params,controller.signal).then(data=>{
        if(!controller.signal.aborted)setComparison(data);
      }).catch(e=>{
        if(!controller.signal.aborted){setComparison(null);setCompareError(e instanceof Error?e.message:'시나리오 계산 실패');}
      }).finally(()=>{if(!controller.signal.aborted)setComparing(false);});
    },180);
    return ()=>{window.clearTimeout(timer);controller.abort();};
  },[home,homeKey,user,day,params]);

  const updateParams=(value:Partial<CompareRequest>)=>setParams(old=>({...old,...value}));
  const visibleHome=homeKey===`${user}:${day}`?home:null;
  return <Context.Provider value={{user,day,users,dateStart,dateEnd,home:visibleHome,
      instruments,comparison,params,loading,comparing,error,compareError,retry,
      selectUser:setUser,selectDay:setDay,updateParams}}>{children}</Context.Provider>;
}

function ErrorNotice({message,retry}:{message:string;retry:()=>void}) {
  return <div className="st3-error" role="alert"><b>데이터를 표시할 수 없어요</b><p>{message}</p>
    <button type="button" onClick={retry}>다시 불러오기</button>
    <small>백엔드 실행: uvicorn app.main:app --reload --port 8000 · API 문서: 127.0.0.1:8000/docs</small>
  </div>;
}
function Scope() {
  const {user,day,users,dateStart,dateEnd,selectUser,selectDay}=useTwin();
  return <div className="st3-scope" aria-label="개발용 합성 사용자와 관측 기준일">
    <div><span className="st3-eyebrow">SYNTHETIC DATA · 개발/시연용</span><small>{dateStart} ~ {dateEnd} 관측</small></div>
    <div className="st3-fields">
      <label>시연 사용자 <select value={user} onChange={e=>selectUser(e.target.value)}
        aria-label="가상 사용자 선택">{users.map(id=><option key={id} value={id}>{id}</option>)}</select></label>
      <label>기준일 <input type="date" value={day} min={dateStart} max={dateEnd}
        onChange={e=>selectDay(e.target.value)} aria-label="금융 관측 기준일" /></label>
      <button type="button" aria-label="하루 전" disabled={!day||day<=dateStart} onClick={()=>selectDay(shiftDate(day,-1))}>‹</button>
      <button type="button" aria-label="하루 뒤" disabled={!day||day>=dateEnd} onClick={()=>selectDay(shiftDate(day,1))}>›</button>
    </div>
  </div>;
}
function Title({name,subtitle}:{name:string;subtitle:string}){
  return <header className="t-head"><div><h1>{name}</h1><p className="t-head-sub">{subtitle}</p></div></header>;
}
function Info({title,children}:{title:string;children:ReactNode}){
  return <section className="st3-section"><h2>{title}</h2>{children}</section>;
}
function MiniLine({values}:{values:number[]}) {
  if(!values.length)return <p>현금흐름 자료 없음</p>;
  const max=Math.max(...values), min=Math.min(...values);
  const range=Math.max(1,max-min);
  const pts=values.map((v,i)=>`${10+i*320/Math.max(1,values.length-1)},${88-(v-min)*68/range}`).join(' ');
  return <svg className="st3-line" viewBox="0 0 340 110" role="img" aria-label="FastAPI 계산 일별 결제계좌 잔액">
    <path d="M10 88 H330" stroke="currentColor" opacity=".15" fill="none"/>
    <polyline points={pts} stroke="currentColor" strokeWidth="2.5" fill="none" strokeLinejoin="round" strokeLinecap="round"/>
    {values.length>1&&<circle cx="330" cy={88-(values[values.length-1]-min)*68/range} r="4" fill="currentColor"/>}
  </svg>;
}
export function Stage3Home() {
  const {update}=useStore();
  const {home,comparison,loading,error,retry,day,user}=useTwin();
  if(error)return <div className="page t-page t-home ux-home"><Title name="모아" subtitle="결제일을 확인하고, 오늘의 소비를 관리해요"/><Scope/><ErrorNotice message={error} retry={retry}/></div>;
  return <div className="page t-page t-home ux-home st3">
    <Title name="모아" subtitle="결제일을 확인하고, 오늘의 소비를 관리해요" />
    <Scope />
    {loading||!home?<p className="st3-loading" role="status">공통 금융 데이터셋을 불러오는 중이에요…</p>:<>
      <section className="st3-hero">
        <small>내 결제계좌 · {user} · {day} 기준</small>
        <h2>현재 확인된 결제계좌 잔액</h2><strong className="num">{W(home.available_cash)}</strong>
        <p>합성 관측 스냅샷 · 가상 저축과 모의투자 평가액은 포함하지 않아요.</p>
        <div className="st3-horizons">{[3,7,14].map(k=><div key={k}><small>{k}일 뒤 예상</small>
          <b className="num">{W(home.future_balances[String(k)])}</b></div>)}</div>
      </section>
      {!home.has_observation_on_date&&<p className="st3-caution">이 날짜에는 완전한 관측 일별 기록이 없어요. 가장 가까운 이전 잔액 기준을 확인하세요.</p>}
      <Info title="앞으로 14일 결제계좌 흐름">
        <MiniLine values={[home.available_cash,...home.daily_cashflow.map(d=>d.closing_balance)]}/>
        <p className="st3-muted">Python 금융 엔진의 등록 일정 기준 · ML 예측 미반영 · 기간 최저 잔액 {W(home.minimum_balance)}</p>
      </Info>
      <Info title="가까운 필수결제">
        {home.upcoming_essential_payments.length?home.upcoming_essential_payments.slice(0,5).map(e=>
          <div className="st3-row" key={e.id}><span><b>{e.label}</b><small>{e.debit_at.slice(0,10)}</small></span><strong>−{W(-e.amount)}</strong></div>
        ):<p className="st3-muted">선택 기간에 등록된 필수결제가 없어요.</p>}
      </Info>
      <Info title="들어올 돈">
        {home.upcoming_income.length?home.upcoming_income.slice(0,4).map(e=>
          <div className="st3-row" key={e.id}><span><b>{e.label}</b><small>{e.debit_at.slice(0,10)}</small></span><strong>+{W(e.amount)}</strong></div>
        ):<p className="st3-muted">기간 내 확정된 입금 일정이 없어요.</p>}
      </Info>
      <Info title="최근 거래">
        {home.recent_transactions.length?home.recent_transactions.slice(0,6).map(tx=>
          <div className="st3-row" key={tx.id}><span><b>{tx.name}</b><small>{tx.date} · {tx.method}</small></span><strong>{W(tx.amount)}</strong></div>
        ):<p className="st3-muted">해당 날짜까지 확인된 거래 내역이 없어요.</p>}
      </Info>
      <Info title="가상 저축·투자 현황">
        <p className="st3-muted">목표 저축: {home.savings_goals.length?'등록된 목표 있음':'공통 데이터셋에 목표 정보 없음 · 시나리오에서 새 목표 설정 가능'}</p>
        <p className="st3-muted">가상 투자: {Object.keys(home.virtual_investments.positions??{}).length}개 종목 보유 (원본 테스트 지갑, 실제 결제계좌에 영향 없음)</p>
        {comparison&&<p className="st3-muted">평행세계 비교: {comparison.paths.filter(p=>p.status==='calculated').length}개 계산됨 · 기본 변동 지출 전망은 최근 관측 평균이며 ML 예측이 아닙니다.</p>}
      </Info>
      <p className="st3-legal">합성 금융 데이터로 재현한 시연 결과이며 실제 계좌·시세·검증된 AI 예측이 아닙니다.</p>
      <button className="st3-expand" type="button" onClick={()=>update(s=>({...s,demo:false,profile:null,introSeen:false,setupDraft:null}))}>내 재무 정보 직접 입력하기</button>
    </>}
  </div>;
}

function MoneyControl({title,value,onChange}:{title:string;value:number;onChange:(v:number)=>void}) {
  return <label className="st3-money"><span>{title}</span><input type="number" inputMode="numeric" min="0"
    value={value} onChange={e=>onChange(Math.max(0,Math.round(Number(e.target.value)||0)))} /></label>;
}
function PathCard({path}:{path:ScenarioPath}) {
  return <article className="st3-world-card">
    <div className="st3-world-name"><b>{path.label}</b><small>{path.status==='calculated'?'계산 완료':path.status==='needs_confirmation'?'출금일·가격 확인 필요':'금융 제약 위반'}</small></div>
    <strong className="num">{path.status==='calculated'?W(path.future_balances['14']):'확인 필요'}</strong>
    <div className="st3-world-grid"><span>기간 최저 {W(path.minimum_balance)}</span>
      <span>{path.minimum_balance_met?'최소잔액 충족':'최소잔액 부족'}</span></div>
    <div className="st3-world-grid"><span>가상 저축 {W(path.virtual_savings)}</span>
      <span>투자 평가 {W(path.virtual_investment_value)}</span></div>
    {path.first_shortfall_date&&<p className="st3-warning">부족 발생: {path.first_shortfall_date}</p>}
    {path.savings_goal_reached_date&&<p>목표 저축 달성 예상일: {path.savings_goal_reached_date}</p>}
    {path.purchase_delay_days>0&&<small>구매 {path.purchase_delay_days}일 연기</small>}
    <MiniLine values={[path.available_cash,...path.daily_cashflow.map(d=>d.closing_balance)]}/>
  </article>;
}
export function Stage3Worlds() {
  const {home,params,updateParams,comparison,comparing,compareError,loading,error,retry,instruments}=useTwin();
  const [all,setAll]=useState(false);
  const [saveMessage,setSaveMessage]=useState('');
  const [saving,setSaving]=useState(false);
  const updateAmount=(purchase_amount:number)=>updateParams({purchase_amount,
    savings_amount:purchase_amount,investment_amount:purchase_amount,
    allocation:splitBudget(Math.min(purchase_amount,Math.max(0,home?.available_cash??0)))});
  const allocated=Object.values(params.allocation).reduce((sum, n)=>sum+n,0);
  const capExceeded=allocated>params.purchase_amount || (home!=null&&allocated>home.available_cash);
  async function save() {
    if(!comparison||capExceeded)return;
    setSaving(true);setSaveMessage('');
    try{const result=await saveScenario(params);setSaveMessage(`선택 조건을 가상 기록에 저장했어요 · ${result.id.slice(0,8)}`);}
    catch(e){setSaveMessage(e instanceof Error?e.message:'저장 실패');}
    finally{setSaving(false);}
  }
  return <div className="page t-page ux-home st3">
    <Title name="나의 평행세계" subtitle="같은 시작 잔액에서 구매·저축·투자 선택을 비교해요"/>
    <Scope/>
    {error?<ErrorNotice message={error} retry={retry}/>:loading||!home?<p className="st3-loading">선택한 사용자 상태를 읽는 중이에요…</p>:<>
      <Info title="비교할 선택">
        <MoneyControl title="상품 최종 결제 금액" value={params.purchase_amount} onChange={updateAmount}/>
        <div className="st3-formgrid">
          <label>구매 희망일 <input type="date" min={shiftDate(params.as_of,1)} value={params.purchase_date}
            onChange={e=>updateParams({purchase_date:e.target.value})}/></label>
          <label>구매 연기 일수 <input type="number" min="1" max="90" value={params.purchase_delay_days}
            onChange={e=>updateParams({purchase_delay_days:Math.max(1,Math.round(Number(e.target.value)||1))})}/></label>
          <label>결제 수단 <select value={params.payment_method}
            onChange={e=>updateParams({payment_method:e.target.value as CompareRequest['payment_method']})}>
            <option value="debit">체크카드 (즉시)</option><option value="transfer">계좌이체</option>
            <option value="credit">신용카드 (출금일 확인 필요)</option>
          </select></label>
          {params.payment_method==='credit'&&<label>지금 구매 신용카드 출금일 <input type="date" value={params.credit_debit_date??''}
            min={params.purchase_date} onChange={e=>updateParams({credit_debit_date:e.target.value||undefined})}/></label>}
        </div>
      </Info>
      <Info title="저축 · 투자 조건">
        <div className="st3-formgrid">
          <MoneyControl title="저축 경로 납입" value={params.savings_amount} onChange={savings_amount=>updateParams({savings_amount})}/>
          <MoneyControl title="투자 경로 배분" value={params.investment_amount} onChange={investment_amount=>updateParams({investment_amount})}/>
          <MoneyControl title="매월 정기 저축" value={params.savings_monthly_amount} onChange={savings_monthly_amount=>updateParams({savings_monthly_amount})}/>
          <MoneyControl title="저축 목표 (미설정은 0)" value={params.savings_goal_target??0}
            onChange={savings_goal_target=>updateParams({savings_goal_target:savings_goal_target||undefined})}/>
          <MoneyControl title="보호할 최소 잔액" value={params.minimum_required_balance}
            onChange={minimum_required_balance=>updateParams({minimum_required_balance})}/>
          <label>투자 검증 종목 <select value={params.investment_code??''}
            onChange={e=>updateParams({investment_code:e.target.value})}>
              {instruments.map(x=><option key={x.code} value={x.code}>{x.name} ({x.code})</option>)}
            </select></label>
        </div>
      </Info>
      <Info title="혼합 배분 · 같은 돈 나누기">
        <p className="st3-muted">초기 40·30·20·10%는 조정 가능한 비교 가정이며 데이터셋의 실제 사용 기록이 아닙니다.</p>
        <div className="st3-formgrid">
          {(['purchase','savings','investment','cash'] as const).map(k=>
            <MoneyControl key={k} title={{purchase:'구매',savings:'저축',investment:'투자',cash:'현금 보유'}[k]}
              value={params.allocation[k]} onChange={v=>updateParams({allocation:{...params.allocation,[k]:v}})}/>)}
        </div>
        <p className={capExceeded?'st3-warning':'st3-muted'}>배분 합계 {W(allocated)} / 비교 예산 {W(params.purchase_amount)} / 현재 현금 {W(home.available_cash)}
          {capExceeded?' · 초과 배분으로 계산할 수 없어요.':''}</p>
      </Info>
      <Info title="위험 가정">
        <label>스트레스 조건 <select value={params.stress} onChange={e=>updateParams({stress:e.target.value as CompareRequest['stress']})}>
          <option value="baseline">최근 관측 평균 기준선</option><option value="higher_spending">지출 증가 (명시적 가정)</option>
          <option value="delayed_income">소득 입금 지연</option><option value="combined">지출 증가 + 입금 지연</option>
          <option value="investment_loss">가상 투자 손실</option>
        </select></label>
        {params.stress==='investment_loss'&&<label>투자 수익률 가정 (%) <input type="number" min="-100" max="0" value={params.investment_return_percent}
          onChange={e=>updateParams({investment_return_percent:Number(e.target.value)||0})}/></label>}
        <p className="st3-muted">미래 변동 지출은 ML 결과가 아닌 과거 관측값의 7일 평균으로 처리합니다. 검증되지 않은 확률은 제시하지 않습니다.</p>
      </Info>
      {compareError&&<ErrorNotice message={compareError} retry={retry}/>}
      {comparing&&<p className="st3-loading" role="status">Python 엔진으로 여섯 경로 다시 계산하는 중…</p>}
      {comparison&&!capExceeded&&<>
        <Info title="먼저 비교하는 4개 경로">
          <div className="st3-worlds">{comparison.paths.slice(0,all?6:4).map(p=><PathCard key={p.scenario_id} path={p}/>)}</div>
          <button type="button" className="st3-expand" onClick={()=>setAll(v=>!v)}>{all?'핵심 경로만 보기':'투자·혼합 배분까지 6개 모두 보기'}</button>
          <p className="st3-muted">동일한 출발 현금 {W(comparison.available_cash)} · 예측 기준: {comparison.baseline_source} · 일일 변동 지출 {W(comparison.baseline_daily_variable_expense)}</p>
        </Info>
        <button type="button" className="st3-save" disabled={saving||comparing} onClick={()=>void save()}>{saving?'저장 중…':'이 비교 조건 저장하기'}</button>
        {saveMessage&&<p role="status" className="st3-muted">{saveMessage}</p>}
      </>}
    </>}
  </div>;
}
export function Stage3Assets() {
  const {home,instruments,comparison,error,loading,retry}=useTwin();
  return <div className="page t-page ux-home st3">
    <Title name="가상 저축 · 투자" subtitle="가상자산과 결제계좌를 구분해 보여줘요"/>
    <Scope/>
    {error?<ErrorNotice message={error} retry={retry}/>:loading||!home?<p className="st3-loading">가상 자산 자료 확인 중…</p>:<>
      <Info title="공통 데이터셋의 기존 모의투자">
        <p className="st3-muted">결제계좌에 반영하지 않는 독립된 가상 포트폴리오입니다.</p>
        <div className="st3-row"><span>모의 전용 현금</span><b>{W(home.virtual_investments.virtual_cash)}</b></div>
        {Object.entries(home.virtual_investments.positions??{}).map(([code,v])=>
          <div className="st3-row" key={code}><span><b>{code}</b><small>{v.qty}주 · 과거 모의 매수원가</small></span><b>{W(v.cost_basis)}</b></div>)}
      </Info>
      <Info title="검증용 ETF·주식 가격">
        {instruments.map(i=><div key={i.code} className="st3-row"><span><b>{i.name}</b><small>{i.code} · {i.price_date} · 합성 테스트 가격</small></span><strong>{W(i.price)}</strong></div>)}
        {!instruments.length&&<p className="st3-muted">기준일까지의 검증용 매매 가격 자료가 없어요.</p>}
      </Info>
      <Info title="새로운 평행세계에 배분한 자산">
        {comparison?comparison.paths.filter(p=>p.virtual_savings||p.virtual_investment_value).map(p=>
          <div key={p.scenario_id} className="st3-row"><span><b>{p.label}</b><small>현금에서 이동 · 독립 시뮬레이션</small></span><strong>{W(p.virtual_savings+p.virtual_investment_value)}</strong></div>):
          <p className="st3-muted">구매·저축·투자 선택을 비교하면 이곳에 결과가 표시됩니다.</p>}
      </Info>
      <p className="st3-legal">실제 시세가 아니며 합성 과거 거래 가격을 사용합니다. 투자 수익률은 보장되지 않습니다.</p>
    </>}
  </div>;
}
export function Stage3Ledger(){
  const {home,error,loading,retry}=useTwin();
  return <div className="page t-page ux-home st3"><Title name="가계부" subtitle="선택한 날짜까지 관측된 합성 거래"/>
    <Scope/>{error?<ErrorNotice message={error} retry={retry}/>:loading||!home?<p className="st3-loading">거래 내역 불러오는 중…</p>:
      <Info title={`최근 관측 거래 · 총 ${home.observed_transaction_count}건`}>
        {home.recent_transactions.map(x=><div className="st3-row" key={x.id}><span><b>{x.name}</b><small>{x.date} · {x.kind}</small></span><b>{W(x.amount)}</b></div>)}
      </Info>}
  </div>;
}
