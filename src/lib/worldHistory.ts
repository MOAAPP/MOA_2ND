import { WORLD_FIXED_BILLS, WORLD_SAFETY_BUFFER, WORLD_START_CASH, type WorldWallet } from './worldWallet';

/** KST calendar day. This simulator stores timestamps but displays local day closes. */
export const koreaDay = (ms:number) => new Date(ms + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
export const koreanDayLabel = (iso:string) => `${Number(iso.slice(5,7))}월 ${Number(iso.slice(8,10))}일`;
const dayEndUTC = (iso:string) => Date.parse(`${iso}T14:59:59.999Z`);

export type WorldHistoryEvent = {
  id:string; at:number; day:string; kind:'consumption'|'saving'|'investing';
  title:string; detail:string; cashDelta:number; referenceDelta:number; difference:number;
};
export type WorldHistoryPoint = {date:string; actual:number; alternative:number; gap:number; events:WorldHistoryEvent[]};

export function historyEvents(wallet:WorldWallet):WorldHistoryEvent[]{
  const decisions = (wallet.decisions || []).map(d=>({
    id:d.id,at:d.at,day:koreaDay(d.at),kind:'consumption' as const,title:d.title,
    detail:d.choice==='buy'?'지금 구매':d.choice==='alternative'?'다른 대안 선택':'구매 보류',
    cashDelta:-d.paid,referenceDelta:-d.price,difference:d.price-d.paid,
  }));
  const moves = (wallet.movements || []).map(m=>{
    const out=['withdraw','redeemDeposit','cancelInstallment','sellStock'].includes(m.kind);
    const investing=['buyStock','sellStock'].includes(m.kind);
    const delta=out?m.amount:-m.amount;
    return {id:m.id,at:m.at,day:koreaDay(m.at),kind:investing?'investing' as const:'saving' as const,
      title:m.memo,detail:out?(investing?'가상 주식 → 현금':'저축 자산 → 현금'):(investing?'현금 → 가상 주식':'현금 → 저축 자산'),
      cashDelta:delta,referenceDelta:delta,difference:0};
  });
  return [...decisions,...moves].sort((a,b)=>a.at-b.at);
}

/**
 * Spending power, not total assets. Actual = recorded choices. Alternative = each
 * considered purchase at full price; transfers to savings/stocks affect both.
 * Missing historical ledger entries from older saves are a constant adjustment,
 * not fabricated dated events; latest actual matches persisted wallet cash.
 */
export function worldHistory(wallet:WorldWallet,days=30,now=Date.now()):WorldHistoryPoint[]{
  const events = historyEvents(wallet);
  const expectedCash = WORLD_START_CASH + events.reduce((sum,e)=>sum+e.cashDelta,0);
  const adjustment = wallet.cash - expectedCash;
  const anchor = koreaDay(now);
  const endDate = Date.parse(`${anchor}T00:00:00.000Z`);
  const dates=Array.from({length:days},(_,i)=>new Date(endDate-(days-i-1)*86400000).toISOString().slice(0,10));
  const protectedCash=WORLD_FIXED_BILLS+WORLD_SAFETY_BUFFER;
  let cursor=0, actual=WORLD_START_CASH+adjustment-protectedCash,alternative=actual;
  return dates.map(date=>{
    const todays:WorldHistoryEvent[]=[];
    const end=dayEndUTC(date);
    while(cursor<events.length&&events[cursor].at<=end){
      const e=events[cursor++];actual+=e.cashDelta;alternative+=e.referenceDelta;
      if(e.day===date)todays.push(e);
    }
    return {date,actual,alternative,gap:actual-alternative,events:todays};
  });
}
