import { IconGear } from './Icons';
import { useNav } from '../state/nav';

/** 투자 탭 머리: 모의투자 | 금융 학습 */
export function InvestHead() {
  const nav = useNav();
  return (
    <header className="t-head ih-head">
      <div className="ih-tabs" role="tablist" aria-label="투자">
        <button role="tab" aria-selected={nav.tab === 'invest'} onClick={() => nav.setTab('invest')}>모의투자</button>
        <button role="tab" aria-selected={nav.tab === 'learn'} onClick={() => nav.setTab('learn')}>금융 학습</button>
      </div>
      <button className="t-head-icon" aria-label="설정" onClick={() => nav.push({ name: 'settings' })}><IconGear /></button>
    </header>
  );
}
