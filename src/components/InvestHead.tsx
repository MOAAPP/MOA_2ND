import { IconGear } from './Icons';
import { useNav } from '../state/nav';

/** 투자 탭 머리: 모의투자 | 금융 학습 */
export function InvestHead() {
  const nav = useNav();
  return (
    <>
    <header className="t-head ih-head">
      <div className="ih-tabs" role="tablist" aria-label="투자">
        <button role="tab" aria-selected={nav.tab === 'invest'} onClick={() => nav.setTab('invest')}>모의투자</button>
        <button role="tab" aria-selected={nav.tab === 'learn'} onClick={() => nav.setTab('learn')}>금융 학습</button>
      </div>
      <button className="t-head-icon" aria-label="설정" onClick={() => nav.push({ name: 'settings' })}><IconGear /></button>
    </header>
    <p className="mo-intro ih-intro">{nav.tab === 'invest' ? '평행세계 가상 지갑의 남는 돈으로 주식·ETF를 연습해요' : '투자하기 전에 알아두면 좋은 걸 짧게 배워요'}</p>
    </>
  );
}
