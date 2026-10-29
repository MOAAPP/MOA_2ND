import { describe, it, expect } from 'vitest';
import { emptyWorldWallet, walletSummary, transactWorldWallet } from '../src/lib/worldWallet';
describe('v8 unified virtual ledger',()=>{
  it('does not double-count transfers to deposit or installments',()=>{
    let w=emptyWorldWallet();const initial=walletSummary(w).totalAssets;
    w=transactWorldWallet(w,{type:'deposit',amount:20000})!;
    w=transactWorldWallet(w,{type:'installment',amount:10000})!;
    expect(walletSummary(w).monthlyUsable).toBe(90000);
    expect(walletSummary(w).deposit).toBe(20000);
    expect(walletSummary(w).installment).toBe(10000);
    expect(walletSummary(w).totalAssets).toBe(initial);
  });
  it('decreases total on an actual purchase, not by foregone alternative',()=>{
    const w=transactWorldWallet(emptyWorldWallet(),{type:'spend',decision:{id:'one',title:'배달',price:25000,paid:10000,choice:'alternative',note:'예시',at:0}})!;
    expect(walletSummary(w).totalAssets).toBe(790000);
    expect(w.decisions[0].price-w.decisions[0].paid).toBe(15000);
  });
  it('revalues ETF without changing spendable cash until sale',()=>{
    let w=transactWorldWallet(emptyWorldWallet(),{type:'buyEtf',code:'069500',name:'KODEX 200',qty:1,price:40_000})!;
    const usable=walletSummary(w).monthlyUsable;
    expect(walletSummary(w,{'069500':34_000}).monthlyUsable).toBe(usable);
    expect(walletSummary(w,{'069500':34_000}).totalAssets).toBe(794_000);
    w=transactWorldWallet(w,{type:'sellEtf',code:'069500',name:'KODEX 200',qty:1,price:34_000})!;
    expect(walletSummary(w).monthlyUsable).toBe(114_000);
  });
});
