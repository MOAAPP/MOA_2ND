import { useMemo } from 'react';
import { addDays, endOfMonth, maxDate, todayKST } from '../../shared/dates';
import { won } from '../../shared/format';
import { IconTile } from '../components/Glyph';
import { TopBar } from '../components/ui';
import { analyzePersonalSpending } from '../lib/ml/personalModel';
import { spendHistory } from '../lib/ml/provider';
import { useAppForecast } from '../lib/ml/risk';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';

export function Insights() {
  const { state } = useStore();
  const nav = useNav();
  const today = todayKST();
  const p = state.profile!;
  const from = maxDate(today, p.baseDate);
  const to = maxDate(addDays(from, 14), endOfMonth(from));
  const history = useMemo(() => spendHistory(state.records, state.spendLog, today), [state.records, state.spendLog, today]);
  const report = useMemo(() => analyzePersonalSpending({ from: addDays(from, 1), to, today, history, dailySpend: p.dailySpend }), [from, to, today, history, p.dailySpend]);
  const forecast = useAppForecast(p, state.records, state.spendLog, today, from, to);
  const next7 = forecast.days.slice(0, 7);
  const mean = next7.length ? Math.round(next7.reduce((s, d) => s + d.p50, 0) / next7.length) : 0;
  const max = Math.max(1, ...next7.map(d => d.p50));
  const labels = ['일', '월', '화', '수', '목', '금', '토'];
  const mode = report.status === 'active' ? '내 기록으로 예측' : report.status === 'baseline' ? '평균으로 예측' : '기록 모으는 중';
  return <div className="page no-nav insight-page">
    <TopBar title="내 소비 분석" center onBack={nav.pop}/>
    <div className="insight-lead"><span className="ux-kicker">MY MONEY PATTERN</span><h1>내가 돈을 더 쓰는 날,<br/>다음 선택을 바꿔 볼까요?</h1><p>입력한 기록을 바탕으로 생활비를 추정하고, 소비하기 전 다른 세계를 비교해 볼 수 있어요.</p></div>
    <section className="ux-insight-hero"><div className="ux-insight-hero-top"><IconTile name="trend" size={44} tone="blue"/><span className="ux-data-tag">{mode}</span></div><span className="ux-insight-label">앞으로 7일간 하루 생활비 추정 평균</span><strong>{won(mean)}</strong><p>{forecast.engine === 'local' ? '최근 기록을 학습한 요일·추세 모델 기준' : forecast.engine === 'model' ? `연결된 외부 모델(${forecast.modelName ?? 'ML'}) 기준` : '입력값과 기록을 조합한 기본 추정 기준'}</p>
      <div className="ux-week-chart" role="img" aria-label="향후 일주일의 하루 생활비 추정 막대그래프">{next7.map(d=><div key={d.date} className="ux-week-column"><div className="ux-week-bar-track"><span style={{height:`${Math.max(4,100*d.p50/max)}%`}}/></div><small>{labels[new Date(`${d.date}T00:00:00Z`).getUTCDay()]}</small></div>)}</div>
      <div className="ux-chart-caption">막대가 높을수록 지출이 많을 것으로 추정해요 · 확정 지출 아님</div>
    </section>
    <div className="ux-insight-grid"><div className="ux-mini-insight"><span>분석에 사용한 기록</span><b>{report.transactions}건</b><small>{report.historyDays}일 구간</small></div><div className="ux-mini-insight"><span>가장 지출이 큰 분류</span><b>{report.topCategory?.name ?? '기록 없음'}</b><small>{report.topCategory ? `기록된 금액의 ${Math.round(report.topCategory.share*100)}%` : '소비 내역을 추가해 주세요'}</small></div></div>
    <section className="ux-insight-note"><div className="ux-insight-note-icon">✦</div><div><b>이렇게 활용해 보세요</b><p>{report.busyWeekday ? `${report.busyWeekday.day}에는 평균 ${won(report.busyWeekday.average)}을 쓴 기록이 있어요. 그날 필요한 소비인지 미리 비교해 보세요.` : '지출을 꾸준히 기록하면 소비가 몰리는 요일과 종류를 파악할 수 있어요.'}</p><button onClick={() => nav.push({ name:'decide' })}>이 소비의 다른 미래 확인하기 →</button></div></section>
    <section className="pb6-insights-action"><span>ANOTHER WORLD</span><h2>이번 주의 또 다른 나를 만나보세요.</h2><p>예상 지출은 가정에 따른 추정치예요. 다음 소비를 미리 비교하면 월말 결과를 확인할 수 있어요.</p><button onClick={()=>nav.push({name:'lab'})}>가상 세계에서 먼저 체험하기 →</button></section>
  </div>;
}
