import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

export type Tab = 'home' | 'forks' | 'save' | 'invest' | 'learn';

export type Screen =
  | { name: 'lab'; mode?: 'past' | 'future' }
  | { name: 'marketPractice' }
  | { name: 'budgetInvest' }
  | { name: 'decide'; recordId?: string }
  | { name: 'record'; id: string }
  | { name: 'past' }
  | { name: 'settings' }
  | { name: 'finance' }
  | { name: 'insights' }
  | { name: 'future' }
  | { name: 'stock'; code: string }
  | { name: 'placement' }
  | { name: 'lesson'; id: string }
  | { name: 'article'; id: string }
  | { name: 'daily' }
  | { name: 'cardnews'; tradeId: string; jobId?: string }
  | { name: 'cards' }
  | { name: 'portfolio' }
  | { name: 'ledger' }
  | { name: 'newChoice' }
  | { name: 'product'; id: string }
  | { name: 'join'; id: string; amount?: number }
  | { name: 'choose' }
  | { name: 'account'; id: string }
  | { name: 'research' }
  | { name: 'report' };

interface Nav {
  tab: Tab;
  stack: Screen[];
  setTab: (t: Tab) => void;
  push: (s: Screen) => void;
  replace: (s: Screen) => void;
  pop: () => void;
  reset: () => void;
}

const NavCtx = createContext<Nav | null>(null);

/** 화면 스택 + 브라우저 뒤로 가기 연동 */
export function NavProvider({ children }: { children: ReactNode }) {
  const [tab, setTabState] = useState<Tab>('home');
  const [stack, setStack] = useState<Screen[]>([]);
  const depth = useRef(0);

  useEffect(() => {
    const onPop = () => {
      if (depth.current > 0) {
        depth.current -= 1;
        setStack((s) => s.slice(0, -1));
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const push = useCallback((s: Screen) => {
    depth.current += 1;
    history.pushState({ pb: depth.current }, '');
    setStack((st) => [...st, s]);
    window.scrollTo(0, 0);
  }, []);
  const replace = useCallback((s: Screen) => {
    setStack((st) => (st.length ? [...st.slice(0, -1), s] : [s]));
    window.scrollTo(0, 0);
  }, []);
  const pop = useCallback(() => {
    if (depth.current > 0) history.back();
  }, []);
  const reset = useCallback(() => {
    const n = depth.current;
    depth.current = 0;
    setStack([]);
    if (n > 0) history.go(-n);
  }, []);
  const setTab = useCallback(
    (t: Tab) => {
      setTabState(t);
      window.scrollTo(0, 0);
    },
    [],
  );

  const value = useMemo(() => ({ tab, stack, setTab, push, replace, pop, reset }), [tab, stack, setTab, push, replace, pop, reset]);
  return <NavCtx.Provider value={value}>{children}</NavCtx.Provider>;
}

export function useNav() {
  const n = useContext(NavCtx);
  if (!n) throw new Error('NavProvider 필요');
  return n;
}
