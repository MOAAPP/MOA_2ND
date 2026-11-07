import { IconGear } from '../components/Icons';
import { useNav } from '../state/nav';
import { SaveHome } from './bank/SaveHome';
import { Practice } from './Learn';

/**
 * 자산 탭 = 가상 저축(예금·적금·자유 저축) + 모의투자.
 * Both live in the parallel-world wallet; neither is payment-account cash.
 * The existing tab ids ('save' | 'invest') are kept so every old
 * nav.setTab('save'|'invest') call still lands on the right sub-view.
 */
export function Assets({ focus }: { focus: 'save' | 'invest' }) {
  const nav = useNav();
  return (
    <div className="v23-assets">
      <header className="v23-assets-head">
        <div className="v23-assets-title">
          <h1>자산</h1>
          <button className="t-head-icon" aria-label="설정 열기" onClick={() => nav.push({ name: 'settings' })}><IconGear /></button>
        </div>
        <p>모두 평행세계의 가상 자산이에요. 결제계좌 잔액에 더하지 않고, 현금처럼 바로 쓸 수 없어요.</p>
        <div className="v23-seg" role="tablist" aria-label="자산 종류">
          <button role="tab" id="assets-tab-save" aria-selected={focus === 'save'} aria-controls="assets-panel" onClick={() => nav.setTab('save')}>저축 · 예적금</button>
          <button role="tab" id="assets-tab-invest" aria-selected={focus === 'invest'} aria-controls="assets-panel" onClick={() => nav.setTab('invest')}>모의투자</button>
        </div>
      </header>
      <div id="assets-panel" role="tabpanel" aria-labelledby={focus === 'save' ? 'assets-tab-save' : 'assets-tab-invest'}>
        {focus === 'save' ? <SaveHome embedded /> : <Practice embedded />}
      </div>
    </div>
  );
}
