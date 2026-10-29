import { describe, it, expect } from 'vitest';
import { emptyWorldWallet, migrateWorldWallet, transactWorldWallet, walletSummary, WORLD_FIXED_BILLS, WORLD_SAFETY_BUFFER } from '../src/lib/worldWallet';

const buy=(qty:number,price=21_500)=>({type:'buyEtf' as const,code:'360750',name:'TIGER 미국S&P500',qty,price});
const sell=(qty:number,price:number)=>({type:'sellEtf' as const,code:'360750',name:'TIGER 미국S&P500',qty,price});

describe('shared demo cash / savings / real ETF',()=>{
  it('locks bills and safety fund before making investable cash visible',()=>{
    const initial=walletSummary(emptyWorldWallet());
    expect(initial.monthlyUsable).toBe(800_000-WORLD_FIXED_BILLS-WORLD_SAFETY_BUFFER);
  });
  it('saving moves spendable money but does not destroy assets',()=>{
    const before=emptyWorldWallet();
    const next=transactWorldWallet(before,{type:'save',amount:30_000})!;
    expect(walletSummary(next).monthlyUsable).toBe(90_000);
    expect(walletSummary(next).savings).toBe(30_000);
    expect(walletSummary(next).totalAssets).toBe(walletSummary(before).totalAssets);
  });
  it('buying an ETF moves cash into the holding and live price reprices it',()=>{
    const next=transactWorldWallet(emptyWorldWallet(),buy(1))!;
    expect(walletSummary(next).monthlyUsable).toBe(98_500);
    expect(walletSummary(next).stockValue).toBe(21_500);
    expect(walletSummary(next).totalAssets).toBe(800_000);
    const down=walletSummary(next,{'360750':20_000});
    expect(down.stockValue).toBe(20_000);
    expect(down.totalAssets).toBe(798_500);
    expect(down.stockProfit).toBe(-1_500);
    const sold=transactWorldWallet(next,sell(1,20_000))!;
    expect(walletSummary(sold).monthlyUsable).toBe(118_500);
    expect(walletSummary(sold).stockValue).toBe(0);
    expect(sold.etfs['360750']).toBeUndefined();
  });
  it('averages cost across buys and keeps cost proportional on partial sells',()=>{
    let w=transactWorldWallet(emptyWorldWallet(),buy(1,20_000))!;
    w=transactWorldWallet(w,buy(2,23_000))!;
    expect(w.etfs['360750']).toEqual({qty:3,cost:66_000});
    w=transactWorldWallet(w,sell(1,25_000))!;
    expect(w.etfs['360750']).toEqual({qty:2,cost:44_000});
  });
  it('cannot move protected cash into savings or ETFs, or sell more than held',()=>{
    expect(transactWorldWallet(emptyWorldWallet(),{type:'save',amount:150_000})).toBeNull();
    expect(transactWorldWallet(emptyWorldWallet(),buy(6))).toBeNull();
    expect(transactWorldWallet(emptyWorldWallet(),sell(1,20_000))).toBeNull();
  });
  it('turns the old fixed-price practice ETF back into cash',()=>{
    const w=migrateWorldWallet({cash:700_000,savings:0,deposit:0,installment:0,shares:2,priceRate:0,decisions:[],movements:[]} as never);
    expect(w.cash).toBe(720_000);
    expect(w.shares).toBeUndefined();
    expect(w.etfs).toEqual({});
    expect(w.movements.at(-1)?.memo).toContain('정리');
  });
});
