/** Local-only simulated finances; balances and returns are never connected to a bank or brokerage. */
export const WORLD_START_CASH = 800_000;
export const WORLD_FIXED_BILLS = 530_000;
export const WORLD_SAFETY_BUFFER = 150_000;
/** 예전 버전의 '연습용 가상 ETF' 고정 가격. 저장된 기록을 옮길 때만 쓴다. */
export const LEGACY_STOCK_PRICE = 10_000;

export type WorldDecision = { id:string; title:string; price:number; paid:number; choice:'buy'|'wait'|'alternative'; at:number; note:string };
export type WorldMovement = {id:string; kind:'save'|'withdraw'|'deposit'|'redeemDeposit'|'installment'|'cancelInstallment'|'buyStock'|'sellStock'; amount:number; at:number; memo:string; code?:string; qty?:number};
/** 생활비로 산 ETF. 모의투자 탭과 같은 종목·같은 시세를 쓴다. cost = 산 금액 합계(평균단가 × 수량) */
export type EtfHolding = { qty:number; cost:number };
export type WorldWallet = {
  cash:number; savings:number; deposit:number; installment:number;
  etfs:Record<string,EtfHolding>;
  /** @deprecated 예전 고정가 가상 ETF. migrateWorldWallet 이 현금으로 돌려놓는다. */
  shares?:number; priceRate?:number;
  decisions:WorldDecision[]; movements:WorldMovement[];
};
export const emptyWorldWallet = ():WorldWallet => ({cash:WORLD_START_CASH,savings:0,deposit:0,installment:0,etfs:{},decisions:[],movements:[]});

/** 종목코드 → 지금 가격. 시세가 없으면 산 가격(평균단가)으로 평가한다. */
export type PriceMap = Record<string, number | undefined>;

export function etfValue(code:string,h:EtfHolding,prices?:PriceMap){
  const p=prices?.[code];
  return p&&p>0?Math.round(h.qty*p):h.cost;
}

export function walletSummary(w:WorldWallet,prices?:PriceMap){
  const deposit=w.deposit||0, installment=w.installment||0, freeSavings=w.savings||0;
  const holdings=Object.entries(w.etfs||{}).filter(([,h])=>h.qty>0);
  const stockValue=holdings.reduce((s,[code,h])=>s+etfValue(code,h,prices),0);
  const stockCost=holdings.reduce((s,[,h])=>s+h.cost,0);
  const savings=freeSavings+deposit+installment;
  return {cash:w.cash,savings,freeSavings,deposit,installment,stockValue,stockCost,stockProfit:stockValue-stockCost,
    totalAssets:w.cash+savings+stockValue,monthlyUsable:w.cash-WORLD_FIXED_BILLS-WORLD_SAFETY_BUFFER,
    afterBills:w.cash-WORLD_FIXED_BILLS,protectedBills:WORLD_FIXED_BILLS,protectedBuffer:WORLD_SAFETY_BUFFER};
}

export type WorldWalletAction=
  | {type:'save'|'withdraw'|'deposit'|'redeemDeposit'|'installment'|'cancelInstallment';amount:number}
  | {type:'buyEtf'|'sellEtf';code:string;name:string;qty:number;price:number}
  | {type:'spend';decision:WorldDecision}
  | {type:'undoDecision'} | {type:'reset'};

const memo:Record<WorldMovement['kind'],string>={save:'자유 저축',withdraw:'자유 저축 꺼내기',deposit:'가상 예금 가입',redeemDeposit:'가상 예금 해지',installment:'가상 적금 납입',cancelInstallment:'가상 적금 해지',buyStock:'ETF 매수',sellStock:'ETF 매도'};
let seq=0;
function record(w:WorldWallet,kind:WorldMovement['kind'],amount:number,patch:Partial<WorldWallet>,extra:Partial<WorldMovement>={}):WorldWallet{
  const at=Date.now();
  return {...w,...patch,movements:[...(w.movements||[]),{id:`${kind}-${at}-${(w.movements||[]).length}-${seq++}`,kind,amount,at,memo:memo[kind],...extra}]};
}

export function transactWorldWallet(w:WorldWallet,action:WorldWalletAction):WorldWallet|null{
  if(action.type==='reset')return emptyWorldWallet();
  if(action.type==='undoDecision'){const last=w.decisions.at(-1);return last?{...w,cash:w.cash+last.paid,decisions:w.decisions.slice(0,-1)}:null;}
  if(action.type==='spend'){const d=action.decision;if(!Number.isSafeInteger(d.paid)||d.paid<0||d.paid>w.cash||w.decisions.some(x=>x.id===d.id))return null;return {...w,cash:w.cash-d.paid,decisions:[...w.decisions,d]};}
  if(action.type==='buyEtf'||action.type==='sellEtf'){
    const {code,name,qty,price}=action;
    if(!code||!Number.isSafeInteger(qty)||qty<=0||!Number.isFinite(price)||price<=0)return null;
    const amount=Math.round(qty*price);
    const etfs={...(w.etfs||{})};
    const cur=etfs[code]??{qty:0,cost:0};
    if(action.type==='buyEtf'){
      if(amount>Math.max(0,walletSummary(w).monthlyUsable))return null;
      etfs[code]={qty:cur.qty+qty,cost:cur.cost+amount};
      return record(w,'buyStock',amount,{cash:w.cash-amount,etfs},{memo:`${name} ${qty}주 매수`,code,qty});
    }
    if(qty>cur.qty)return null;
    const left=cur.qty-qty;
    if(left>0)etfs[code]={qty:left,cost:Math.round(cur.cost*left/cur.qty)};else delete etfs[code];
    return record(w,'sellStock',amount,{cash:w.cash+amount,etfs},{memo:`${name} ${qty}주 매도`,code,qty});
  }
  const n=(action as {amount:number}).amount;
  if(!Number.isSafeInteger(n)||n<=0)return null;
  const buckets:{[key:string]:keyof Pick<WorldWallet,'savings'|'deposit'|'installment'>}={save:'savings',withdraw:'savings',deposit:'deposit',redeemDeposit:'deposit',installment:'installment',cancelInstallment:'installment'};
  const key=buckets[action.type];
  const add=['save','deposit','installment'].includes(action.type);
  if(add&&n>Math.max(0,walletSummary(w).monthlyUsable))return null;
  if(!add&&n>(w[key]||0))return null;
  return record(w,action.type,n,{cash:w.cash+(add?-n:n),[key]:(w[key]||0)+(add?n:-n)});
}

/**
 * 예전 저장본의 '연습용 가상 ETF'(고정 가격)를 정리한다.
 * 실제 시세가 없는 종목이라 산 가격 그대로 현금으로 돌려놓고, 그 사실을 기록에 남긴다.
 */
export function migrateWorldWallet(raw:Partial<WorldWallet>|undefined):WorldWallet{
  const base=emptyWorldWallet();
  const w:WorldWallet={...base,...(raw??{}),etfs:{...(raw?.etfs??{})},
    decisions:Array.isArray(raw?.decisions)?raw!.decisions:[],movements:Array.isArray(raw?.movements)?raw!.movements:[]};
  const legacy=Math.max(0,Math.floor(raw?.shares??0));
  if(legacy>0){
    const refund=Math.round(legacy*LEGACY_STOCK_PRICE*(1+(raw?.priceRate??0)));
    w.cash+=refund;
    w.movements=[...w.movements,{id:`legacy-etf-${legacy}-${w.movements.length}`,kind:'sellStock',amount:refund,at:Date.now(),memo:'연습용 가상 ETF 정리 (실제 ETF로 바뀜)'}];
  }
  delete w.shares;delete w.priceRate;
  return w;
}
