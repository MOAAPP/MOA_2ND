import { useEffect, useState } from 'react';
import { IconFork, IconHome, IconPiggy, IconChartBars, IconReceipt } from './components/Icons';
import { ToastProvider, useKeyboardInset } from './components/ui';
import { CardNews, CardsList, DailyScreen } from './screens/CardNews';
import { Decide } from './screens/Decide';
import { Future } from './screens/Future';
import { Onboarding } from './screens/Onboarding';
import { ParallelLab } from './screens/ParallelLab';
import { Insights } from './screens/Insights';
import { Learn, Practice } from './screens/Learn';
import { Portfolio } from './screens/Portfolio';
import { Past } from './screens/Past';
import { Placement } from './screens/Placement';
import { Lesson } from './screens/Lesson';
import { GuideArticle } from './screens/GuideArticle';
import { RecordDetail } from './screens/RecordDetail';
import { FinanceEdit, Settings } from './screens/Settings';
import { StockDetail } from './screens/StockDetail';
import { MarketProvider } from './state/market';
import { NavProvider, useNav, type Screen, type Tab } from './state/nav';
import { StoreProvider, useStore } from './state/store';
import { demoData } from './lib/demo';
import { demoWorldWallet } from './lib/demoWorld';
import { V8Home } from './screens/V8Finance';
import { WorldInvestment } from './screens/ParallelLab';
import { WorldTimeline } from './screens/WorldTimeline';
import { Ledger } from './screens/Ledger';
import { NewChoice } from './screens/NewChoice';
import { Choose } from './screens/Choose';
import { SaveHome } from './screens/bank/SaveHome';
import { ProductDetail } from './screens/bank/ProductDetail';
import { Join } from './screens/bank/Join';
import { Account } from './screens/bank/Account';
import { BankClock } from './state/bank';
import { emptyBank } from './lib/bank/engine';
import { Research } from './screens/Research';
import { AskAi } from './screens/AskAi';
import { WorldReport } from './screens/WorldReport';
import { startSession } from './lib/research/log';
import { Shortfall } from './screens/moa/Shortfall';
import { MoaSetup, QuickStart } from './screens/moa/MoaSetup';
import { MoaAlertsDaemon } from './state/moa';
import { demoMoa, profileFromMoa } from './lib/moa/bridge';

const TABS: { id: Tab; label: string; Icon: typeof IconHome }[] = [
  { id: 'home', label: '홈', Icon: IconHome },
  { id: 'ledger', label: '가계부', Icon: IconReceipt },
  { id: 'forks', label: '평행세계', Icon: IconFork },
  { id: 'save', label: '모으기', Icon: IconPiggy },
  { id: 'invest', label: '투자', Icon: IconChartBars },
];

function BottomNav() {
  const nav = useNav();
  return (
    <nav className="bottom-nav" aria-label="주요 메뉴">
      {TABS.map(({ id, label, Icon }) => (
        <button key={id} aria-current={nav.tab === id || (id === 'invest' && nav.tab === 'learn') ? 'page' : undefined} onClick={() => nav.setTab(id)}>
          <Icon />
          {label}
        </button>
      ))}
    </nav>
  );
}

function ScreenView({ screen, onReplayIntro }: { screen: Screen; onReplayIntro: () => void }) {
  switch (screen.name) {
    case 'lab': return <ParallelLab key={screen.mode || 'future'} initialMode={screen.mode ?? 'future'}/>;
    case 'marketPractice': return <Practice />;
    case 'budgetInvest': return <WorldInvestment />;
    case 'decide': return <Decide key={screen.recordId ?? 'new'} recordId={screen.recordId} />;
    case 'record': return <RecordDetail id={screen.id} />;
    case 'past': return <Past />;
    case 'settings': return <Settings onReplayIntro={onReplayIntro} />;
    case 'finance': return <FinanceEdit />;
    case 'insights': return <Insights />;
    case 'future': return <Future />;
    case 'stock': return <StockDetail code={screen.code} />;
    case 'placement': return <Placement />;
    case 'lesson': return <Lesson key={screen.id} id={screen.id} />;
    case 'article': return <GuideArticle key={screen.id} id={screen.id} />;
    case 'daily': return <DailyScreen />;
    case 'cardnews': return <CardNews tradeId={screen.tradeId} jobId={screen.jobId} />;
    case 'cards': return <CardsList />;
    case 'portfolio': return <Portfolio />;
    case 'newChoice': return <NewChoice />;
    case 'product': return <ProductDetail key={screen.id} id={screen.id} />;
    case 'join': return <Join key={screen.id} id={screen.id} initialAmount={screen.amount} />;
    case 'choose': return <Choose />;
    case 'account': return <Account key={screen.id} id={screen.id} />;
    case 'research': return <Research />;
    case 'ask': return <AskAi initial={screen.q} />;
    case 'report': return <WorldReport />;
    case 'shortfall': return <Shortfall />;
    case 'moaSetup': return <MoaSetup />;
  }
}

let sessionLogged = false;

function Shell() {
  const { state, update } = useStore();
  const nav = useNav();
  const [replayIntro, setReplayIntro] = useState(() => new URLSearchParams(window.location.search).has('intro') || Boolean((window as Window & { __PB_FORCE_INTRO?: boolean }).__PB_FORCE_INTRO));
  const finishIntroPreview = () => {
    if (new URLSearchParams(window.location.search).has('intro')) {
      const url = new URL(window.location.href); url.searchParams.delete('intro');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
    }
    setReplayIntro(false);
  };
  useKeyboardInset();

  // 연구 참여자: 앱을 열 때마다 접속 1회 기록
  useEffect(() => {
    if (sessionLogged) return;
    sessionLogged = true;
    update((s) => ({ ...s, research: startSession(s.research, { now: Date.now(), demo: s.demo }) }));
  }, [update]);

  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', state.settings.reduceMotion);
  }, [state.settings.reduceMotion]);

  if (!state.introSeen || replayIntro) {
    return (
      <Onboarding
        onDone={() => {
          finishIntroPreview();
          nav.reset();
          update((s) => ({ ...s, introSeen: true }));
        }}
        onDemo={() => {
          finishIntroPreview();
          nav.reset();
          update((s) => ({ ...s, ...demoData(), worldWallet: demoWorldWallet(), bank: emptyBank(), demo: true, introSeen: true, setupDraft: null, moa: demoMoa(Date.now()) }));
          nav.setTab('home');
        }}
      />
    );
  }

  if (!state.profile) {
    // 1분 설정: 결제계좌 잔액 + 가장 가까운 필수결제 1건이면 바로 결과를 보여준다
    return (
      <div className="page t-page mo-page">
        <QuickStart
          onDone={() => {
            update((s) => ({ ...s, profile: profileFromMoa(s.moa, null), setupDraft: null }));
            nav.setTab('home');
            nav.push({ name: 'shortfall' });
          }}
        />
      </div>
    );
  }

  const top = nav.stack[nav.stack.length - 1];
  if (top) return <><BankClock /><MoaAlertsDaemon /><ScreenView screen={top} onReplayIntro={() => setReplayIntro(true)} /></>;

  return (
    <>
      <BankClock />
      <MoaAlertsDaemon />
      <main>
        {nav.tab === 'home' && <V8Home />}
        {nav.tab === 'ledger' && <Ledger />}
        {nav.tab === 'forks' && <WorldTimeline />}
        {nav.tab === 'save' && <SaveHome />}
        {nav.tab === 'invest' && <Practice />}
        {nav.tab === 'learn' && <Learn />}
      </main>
      <BottomNav />
    </>
  );
}

export function App() {
  return (
    <StoreProvider>
      <NavProvider>
        <ToastProvider>
          <MarketProvider>
            <div className="app">
              <Shell />
            </div>
          </MarketProvider>
        </ToastProvider>
      </NavProvider>
    </StoreProvider>
  );
}
