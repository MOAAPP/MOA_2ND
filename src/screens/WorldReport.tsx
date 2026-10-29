import { useMemo } from 'react';
import { Won } from '../components/ds';
import { TopBar, useToast } from '../components/ui';
import { appToday } from '../lib/bank/sync';
import { demoWorldWallet, isEmptyWorld } from '../lib/demoWorld';
import { koreanDayLabel } from '../lib/worldHistory';
import { worldReport, type WorldReport as Report } from '../lib/worldReport';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';

const fmt = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const man = (n: number) => (n >= 10_000 ? `${(Math.round(n / 1000) / 10).toLocaleString('ko-KR')}만` : `${Math.round(n / 1000)}천`);
const CHOICE = { wait: '참음', alternative: '더 싸게', buy: '삼' } as const;

/** 공유용 카드 이미지(1080×1350). 금액과 횟수만, 품목 이름은 넣지 않는다. */
function shareCard(r: Report): Promise<Blob | null> {
  const c = document.createElement('canvas');
  c.width = 1080; c.height = 1350;
  const g = c.getContext('2d')!;
  const bg = g.createLinearGradient(0, 0, 0, 1350);
  bg.addColorStop(0, '#16163A'); bg.addColorStop(1, '#3D3BF3');
  g.fillStyle = bg; g.fillRect(0, 0, 1080, 1350);
  const font = (w: number, s: number) => `${w} ${s}px Pretendard Variable, Pretendard, -apple-system, sans-serif`;
  g.fillStyle = 'rgba(255,255,255,.7)'; g.font = font(600, 40); g.fillText('모아 · 평행세계 리포트', 90, 150);
  g.fillStyle = '#fff'; g.font = font(700, 64); g.fillText('다르게 선택해서', 90, 330); g.fillText('지킨 돈', 90, 410);
  const num = `+${r.savedTotal.toLocaleString('ko-KR')}`;
  g.font = font(800, num.length > 9 ? 130 : 150); g.fillText(num, 90, 600);
  const wNum = g.measureText(num).width;
  g.font = font(700, 70); g.fillText('원', 90 + wNum + 14, 600);
  // 두 갈래 선
  g.lineWidth = 12; g.lineCap = 'round';
  g.strokeStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(90, 900); g.bezierCurveTo(400, 900, 600, 1000, 990, 1060); g.stroke();
  g.strokeStyle = '#FFB020'; g.beginPath(); g.moveTo(90, 900); g.bezierCurveTo(400, 900, 600, 820, 990, 760); g.stroke();
  g.fillStyle = '#FFB020'; g.beginPath(); g.arc(990, 760, 22, 0, Math.PI * 2); g.fill();
  g.fillStyle = 'rgba(255,255,255,.85)'; g.font = font(600, 40);
  g.fillText(`선택 ${r.decisions}번 중 ${r.held}번 참거나 더 싸게`, 90, 1170);
  if (r.year.net > r.savedTotal) g.fillText(`1년 예금에 넣으면 ${r.year.net.toLocaleString('ko-KR')}원`, 90, 1235);
  g.fillStyle = 'rgba(255,255,255,.5)'; g.font = font(500, 30); g.fillText('학습용 가상 계좌 기준', 90, 1300);
  return new Promise((res) => c.toBlob(res, 'image/png'));
}

export function WorldReport() {
  const { state } = useStore();
  const nav = useNav();
  const toast = useToast();
  const sample = isEmptyWorld(state.worldWallet);
  const decisions = useMemo(() => (sample ? demoWorldWallet() : state.worldWallet).decisions, [sample, state.worldWallet]);
  const today = appToday(state.bank);
  const r = useMemo(() => worldReport(decisions, today), [decisions, today]);
  const max = Math.max(1, ...r.months.map((m) => m.fullPrice));

  const share = async () => {
    const blob = await shareCard(r);
    if (!blob) return;
    const file = new File([blob], 'moa-report.png', { type: 'image/png' });
    try {
      if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: '모아 평행세계 리포트' }); return; }
    } catch { /* 취소 */ return; }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'moa-report.png'; a.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast('이미지를 저장했어요');
  };

  return (
    <div className="page t-page no-nav wr-page">
      <TopBar onBack={nav.pop} title="평행세계 리포트" center />
      {sample && <p className="t-sample-note"><b>예시</b>예시 기록으로 만든 리포트예요.</p>}

      <section className="t-card wr-hero">
        <span className="wr-k">다르게 선택해서 지킨 돈</span>
        <strong className="wr-big"><Won n={r.savedTotal} sign="+" /></strong>
        <p>선택 {r.decisions}번 중 <b>{r.held}번</b> 참거나 더 싸게 샀어요{r.holdRate !== null ? ` (${Math.round(r.holdRate * 100)}%)` : ''}.</p>
        {r.year.interest > 0 && (
          <div className="wr-year"><span>이 돈을 오늘 {r.year.productName}에 1년 넣으면</span><b className="num">{fmt(r.year.net)}</b><small>세후 이자 +{fmt(r.year.interest)}</small></div>
        )}
      </section>

      <section className="t-card">
        <div className="t-card-head"><h2>달마다 두 세계</h2></div>
        {r.months.length === 0 ? <p className="t-empty">아직 기록이 없어요.</p> : (
          <div className="wr-months" role="list">
            {r.months.map((m) => (
              <div key={m.month} className="wr-month" role="listitem" aria-label={`${m.label} 정가로 다 샀다면 ${fmt(m.fullPrice)}, 실제 ${fmt(m.paid)}, 지킨 돈 ${fmt(m.saved)}`}>
                <span className="wr-m-label">{m.label}</span>
                <div className="wr-bars" aria-hidden="true">
                  <i className="full" style={{ width: `${(m.fullPrice / max) * 100}%` }} />
                  <i className="paid" style={{ width: `${(m.paid / max) * 100}%` }} />
                </div>
                <span className="wr-m-saved num">+{man(m.saved)}</span>
              </div>
            ))}
            <div className="wr-key"><span><i className="full" />정가로 다 샀다면</span><span><i className="paid" />실제로 쓴 돈</span></div>
          </div>
        )}
        {r.bestMonth && r.months.length > 1 && <p className="wr-note">{r.bestMonth.label}에 가장 많이 지켰어요. {r.bestMonth.decisions}번 중 {r.bestMonth.held}번 참았어요.</p>}
      </section>

      <section className="t-card">
        <div className="t-card-head"><h2>크게 지킨 선택</h2></div>
        <div className="t-list">
          {r.top.map((c) => (
            <div key={c.id} className="t-row wr-row">
              <span className={`t-avatar ${c.choice === 'wait' ? 'blue' : 'green'}`} aria-hidden="true">{c.choice === 'wait' ? '↗' : '₩'}</span>
              <span className="t-row-main"><b>{c.title}</b><small>{koreanDayLabel(c.day)} · {CHOICE[c.choice]}{c.yearNet > c.saved ? ` · 1년 뒤 ${fmt(c.yearNet)}` : ''}</small></span>
              <span className="t-row-amt num pos">+{fmt(c.saved)}</span>
            </div>
          ))}
          {r.top.length === 0 && <p className="t-empty">참거나 더 싸게 산 기록이 생기면 여기 보여요.</p>}
        </div>
      </section>

      <div className="wr-actions">
        <button type="button" className="d-btn primary block" onClick={() => void share()} disabled={r.decisions === 0}>이미지로 공유하기</button>
        <p className="t-foot">공유 이미지에는 금액과 횟수만 들어가요. 품목 이름은 넣지 않아요.</p>
      </div>
    </div>
  );
}
