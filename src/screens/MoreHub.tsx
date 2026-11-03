import { IconBook, IconChartBars, IconChevron, IconFork, IconGear, IconPiggy, IconShield } from '../components/Icons';
import { useNav, type Screen, type Tab } from '../state/nav';
import { TopHeader } from './V8Finance';

type Item = { title: string; detail: string; Icon: typeof IconFork } & ({ tab: Tab } | { screen: Screen });

/** 결제일 예측과 별개인 연습 기능. 모두 학습용 가상 데이터라 결제계좌 계산에 섞이지 않는다. */
const PRACTICE: Item[] = [
  { title: '평행세계', detail: '다르게 골랐다면 1년 뒤 얼마가 달라졌을까', Icon: IconFork, tab: 'forks' },
  { title: '모으기', detail: '가상 예금·적금으로 모으는 연습', Icon: IconPiggy, tab: 'save' },
  { title: '투자 연습', detail: '실제 시세로 하는 모의투자', Icon: IconChartBars, tab: 'invest' },
  { title: '금융 학습', detail: '처음 보는 금융 용어를 짧게', Icon: IconBook, tab: 'learn' },
];

const SETTINGS: Item[] = [
  { title: '결제계좌·일정 관리', detail: '잔액, 필수결제, 카드 결제일, 입금 일정', Icon: IconShield, screen: { name: 'moaSetup' } },
  { title: '설정', detail: '알림, 데이터, AI 전송 확인', Icon: IconGear, screen: { name: 'settings' } },
];

function Rows({ items }: { items: Item[] }) {
  const nav = useNav();
  return (
    <div className="t-list">
      {items.map((it) => (
        <button key={it.title} className="t-row" onClick={() => ('tab' in it ? nav.setTab(it.tab) : nav.push(it.screen))}>
          <span className="more-ico" aria-hidden="true"><it.Icon /></span>
          <span className="t-row-main"><b>{it.title}</b><small>{it.detail}</small></span>
          <span className="more-chev" aria-hidden="true"><IconChevron /></span>
        </button>
      ))}
    </div>
  );
}

export function MoreHub() {
  return (
    <div className="page t-page">
      <TopHeader title="더보기" />
      <section className="t-card">
        <div className="t-card-head"><h2>모아 설정</h2></div>
        <Rows items={SETTINGS} />
      </section>
      <section className="t-card">
        <div className="t-card-head"><h2>연습 기능</h2><span className="t-badge">가상</span></div>
        <Rows items={PRACTICE} />
      </section>
      <p className="t-foot">연습 기능의 금액은 학습용 가상 데이터예요. 결제일 잔고 계산에는 들어가지 않아요.</p>
    </div>
  );
}
