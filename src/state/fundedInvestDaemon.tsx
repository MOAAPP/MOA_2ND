import { useEffect } from 'react';
import { settleFundedOrders } from '../lib/fundedInvest';
import { useMarket } from './market';
import { useStore } from './store';

/** Applies pending limit-order fills to the home virtual wallet, never to a second balance. */
export function FundedInvestDaemon() {
  const { state, update } = useStore();
  const market = useMarket();
  const codes = [...new Set(state.investJournal.orders.filter(o => o.status === 'pending').map(o => o.code))].sort().join(',');

  useEffect(() => {
    if (!codes) return;
    return market.watch(codes.split(','));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codes]);

  useEffect(() => {
    if (!codes) return;
    const result = settleFundedOrders(state.worldWallet, state.investJournal, market.quotes, Date.now());
    if (!result.changed) return;
    update(s => {
      const latest = settleFundedOrders(s.worldWallet, s.investJournal, market.quotes, Date.now());
      return latest.changed ? { ...s, worldWallet: latest.wallet, investJournal: latest.journal } : s;
    });
  }, [codes, market.quotes, state.worldWallet, state.investJournal, update]);

  useEffect(() => {
    const newlyFilled = state.investJournal.fills.filter(f =>
      Date.now() - f.time < 3 * 60_000 && !state.cardJobIds[f.id]);
    newlyFilled.forEach(fill => void market.requestCard(fill));
  }, [state.investJournal.fills, state.cardJobIds, market.requestCard]);

  return null;
}
