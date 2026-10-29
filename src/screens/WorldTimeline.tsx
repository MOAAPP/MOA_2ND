import { useMemo, useRef, useState } from 'react';
import { won } from '../../shared/format';
import { IconCamera, IconChevron, IconGear } from '../components/Icons';
import { ParallelSwipe, type SwipeHandle } from '../components/ParallelSwipe';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';
import { historyEvents, koreanDayLabel, worldHistory } from '../lib/worldHistory';

const money = (n: number) => `${n < 0 ? '−' : ''}${won(Math.abs(Math.round(n)))}`;
const RANGES = [{ d: 7, label: '1주' }, { d: 30, label: '1개월' }, { d: 90, label: '3개월' }] as const;

export function WorldTimeline() {
  const { state } = useStore();
  const nav = useNav();
  const wallet = state.worldWallet;
  const [days, setDays] = useState<7 | 30 | 90>(30);
  const [filter, setFilter] = useState<'all' | 'consumption' | 'saving' | 'investing'>('all');
  const swipe = useRef<SwipeHandle>(null);
  const points = useMemo(() => worldHistory(wallet, days), [wallet, days]);
  const events = useMemo(() => historyEvents(wallet).reverse(), [wallet]);
  const shown = events.filter((e) => filter === 'all' || filter === e.kind);
  const rangeIdx = RANGES.findIndex((r) => r.d === days);

  const focus = (day: string) => {
    if (!points.some((p) => p.date === day)) setDays(90);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    window.setTimeout(() => swipe.current?.focusDay(day), days === 90 || points.some((p) => p.date === day) ? 250 : 650);
  };

  return (
    <div className="page t-page t-world">
      <header className="t-head">
        <h1>평행세계</h1>
        <button className="t-head-icon" aria-label="설정" onClick={() => nav.push({ name: 'settings' })}><IconGear /></button>
      </header>

      <section className="t-card t-swipe-card" aria-label="두 세계 비교">
        <ParallelSwipe ref={swipe} points={points} />
        <div className="t-slide-seg" role="group" aria-label="그래프 기간" style={{ ['--i' as string]: rangeIdx }}>
          <span className="t-slide-pill" aria-hidden="true" />
          {RANGES.map((r) => <button key={r.d} aria-pressed={days === r.d} onClick={() => setDays(r.d)}>{r.label}</button>)}
        </div>
        <p className="t-swipe-hint"><span aria-hidden="true">↔</span> 그래프를 누른 채 좌우로 밀어보세요</p>
      </section>

      <button className="t-cta-card" onClick={() => nav.push({ name: 'newChoice' })}>
        <span className="t-cta-icon"><IconCamera /></span>
        <span className="t-cta-text"><b>새로운 선택 기록하기</b><small>상품 캡처만 올리면 가격을 읽어드려요</small></span>
        <IconChevron className="t-chev" />
      </button>

      <section className="t-card">
        <div className="t-card-head"><h2>선택 기록 <em>{events.length}</em></h2></div>
        <div className="t-chips" role="group" aria-label="기록 종류">
          {([{ id: 'all', label: '전체' }, { id: 'consumption', label: '소비' }, { id: 'saving', label: '예·적금' }, { id: 'investing', label: '모의투자' }] as const).map((o) => (
            <button key={o.id} aria-pressed={filter === o.id} onClick={() => setFilter(o.id)}>{o.label}</button>
          ))}
        </div>
        <div className="t-list">
          {shown.slice(0, 16).map((e) => {
            const saved = e.kind === 'consumption' && e.difference > 0;
            const value = e.kind === 'consumption' ? (saved ? `+${money(e.difference)}` : money(e.cashDelta)) : money(Math.abs(e.cashDelta));
            return (
              <button key={e.id} className="t-row" onClick={() => focus(e.day)}>
                <span className={`t-avatar ${e.kind === 'consumption' ? (saved ? 'blue' : 'grey') : e.kind === 'saving' ? 'green' : 'violet'}`} aria-hidden="true">
                  {e.kind === 'consumption' ? (saved ? '↗' : '−') : e.kind === 'saving' ? '₩' : '◆'}
                </span>
                <span className="t-row-main"><b>{e.title}</b><small>{koreanDayLabel(e.day)} · {e.detail}</small></span>
                <span className={`t-row-amt num ${saved ? 'pos' : ''}`}>{value}</span>
              </button>
            );
          })}
          {shown.length === 0 && <p className="t-empty">아직 기록이 없어요. 위에서 첫 선택을 남겨보세요.</p>}
        </div>
      </section>

      <p className="t-foot">그래프는 이번 달 쓸 수 있는 가상 현금 기준이에요. 기록을 누르면 그날로 이동해요. 두 세계의 차이는 실제 자산에 더하지 않아요.</p>
    </div>
  );
}
