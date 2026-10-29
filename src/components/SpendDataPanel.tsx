import { useRef, useState } from 'react';
import { addDays, endOfMonth, formatKDate, maxDate, todayKST } from '../../shared/dates';
import { won } from '../../shared/format';
import { demoData } from '../lib/demo';
import { parseSpendCsv, sampleCsv, type CsvResult } from '../lib/ml/csv';
import { mlConfigured } from '../lib/ml/provider';
import { dailyMean } from '../lib/ml/montecarlo';
import { useAppForecast } from '../lib/ml/risk';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';
import { Notice, useToast } from './ui';

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 설정 > 생활비 예측 데이터: CSV 불러오기, 분류 기록 내보내기, 예시 데이터 */
export function SpendDataPanel() {
  const nav = useNav();
  const { state, update } = useStore();
  const toast = useToast();
  const today = todayKST();
  const fileRef = useRef<HTMLInputElement>(null);
  const [result, setResult] = useState<CsvResult | null>(null);
  const p = state.profile;
  const from = p ? maxDate(today, p.baseDate) : today;
  const forecast = useAppForecast(p ?? { baseBalance: 0, baseDate: today, baseSetAt: 0, minBalance: 0, items: [], reflectedOnBaseDate: [] }, state.records, state.spendLog, today, from, maxDate(endOfMonth(from), addDays(from, 31)));
  const csvCount = state.spendLog.filter((e) => e.from === 'csv').length;
  const memCount = Object.keys(state.categoryMemory).length;
  const avg = forecast.days.length ? Math.round(forecast.days.reduce((s, d) => s + dailyMean(d), 0) / forecast.days.length / 100) * 100 : 0;

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    if (f.size > 8_000_000) {
      toast('8MB보다 큰 파일은 읽지 않아요');
      return;
    }
    const r = parseSpendCsv(await f.text(), today, state.categoryMemory);
    setResult(r);
    if (r.entries.length) {
      update((s) => ({ ...s, spendLog: [...s.spendLog.filter((e) => e.from !== 'csv'), ...r.entries] }));
      toast(`지출 ${r.entries.length}건을 불러왔어요`);
      nav.goTab('ledger');
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  return (
    <div className="card">
      <p className="sheet-text" style={{ marginBottom: 12 }}>
        {avg > 0 ? <>요즘 하루에 보통 <b>{won(avg)}</b>쯤 쓰는 걸로 보고 계산하고 있어요.</> : '하루 생활비 정보가 없어서 고정 지출만으로 계산하고 있어요.'}
      </p>
      <dl className="kv">
        <dt>직접 기록한 쓴 돈</dt>
        <dd className="num">{state.records.filter((r) => r.source === 'spent').length}건</dd>
        <dt>CSV로 불러온 지출</dt>
        <dd className="num">{csvCount}건</dd>
        <dt>직접 고친 종류</dt>
        <dd className="num">{memCount}개</dd>
      </dl>

      <div className="stack" style={{ marginTop: 14 }}>
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="sr-only" id="csv-in" onChange={(e) => onFile(e.target.files?.[0])} />
        <label htmlFor="csv-in" className="btn secondary block sm">지출 CSV 불러오기</label>
        {(csvCount > 0 || state.spendLog.length > 0) && <button className="btn block sm" onClick={() => nav.goTab('ledger')}>날짜별 지출 내역 보기 →</button>}
        <div className="stack">
          <button className="btn ghost sm block" onClick={() => download('평행통장_샘플지출.csv', sampleCsv(today), 'text/csv')}>샘플 CSV 받기</button>
          <button className="btn ghost sm block" disabled={!memCount} onClick={() => download('category_corrections.json', JSON.stringify(Object.entries(state.categoryMemory).map(([name, category]) => ({ name, category })), null, 2), 'application/json')}>고친 분류 파일로 받기</button>
        </div>
        {csvCount > 0 && (
          <button className="btn ghost sm block" onClick={() => update((s) => ({ ...s, spendLog: s.spendLog.filter((e) => e.from !== 'csv') }))}>불러온 CSV 지우기</button>
        )}
      </div>
      <p className="xs muted" style={{ marginBottom: 0 }}>
        은행이나 가계부 앱에서 내려받은 CSV를 넣으면 최근 90일 쓴 돈을 계산에 반영해요. 날짜와 금액 칸만 있으면 되고, 월세처럼 매달 나가는 돈은 빼고 읽어요. 파일은 이 기기 안에서만 열어요.
        {mlConfigured && ' 예측 서버가 연결돼 있으면 계산할 때만 기록을 보내고 저장하지 않아요.'}
      </p>

      {result && (
        <div style={{ marginTop: 12 }}>
          <Notice kind={result.entries.length ? 'ok' : 'warn'}>
            {result.total}줄 중 {result.entries.length}건을 생활비로 반영했어요
            {result.skippedFixed ? ` · 고정지출 ${result.skippedFixed}건 제외` : ''}
            {result.lastDate ? ` · 마지막 기록 ${formatKDate(result.lastDate)}` : ''}
            {result.errors.map((e) => <div key={e} className="xs">{e}</div>)}
          </Notice>
        </div>
      )}

      <hr className="divider" />
      <button
        className="btn ghost sm block"
        onClick={() => {
          const demo = demoData();
          update((s) => ({ ...s, ...demo, demo: true, setupDraft: null }));
          toast('예시 통장으로 바꿨어요');
        }}
      >
        예시 통장으로 바꾸기
      </button>
      {state.demo && (
        <p className="xs muted" style={{ marginBottom: 0 }}>지금 예시 통장을 보고 있어요. 위에서 ‘생활비 정보와 소비 기록’을 초기화하면 내 통장으로 시작해요.</p>
      )}
    </div>
  );
}
