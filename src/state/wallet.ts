import { useMemo } from 'react';
import { walletSummary, type PriceMap } from '../lib/worldWallet';
import { useLiveQuotes } from './market';
import { useStore } from './store';

/** 생활비 장부 요약 + 보유 ETF를 모의투자와 같은 실시간 시세로 평가 */
export function useWallet() {
  const { state } = useStore();
  const wallet = state.worldWallet;
  const codes = Object.keys(wallet.etfs || {}).filter((c) => (wallet.etfs[c]?.qty ?? 0) > 0).sort();
  const m = useLiveQuotes(codes);
  const prices: PriceMap = useMemo(() => {
    const out: PriceMap = {};
    for (const c of codes) out[c] = m.quotes[c]?.price;
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codes.join(','), m.quotes]);
  const summary = useMemo(() => walletSummary(wallet, prices), [wallet, prices]);
  return { wallet, prices, summary, market: m };
}
