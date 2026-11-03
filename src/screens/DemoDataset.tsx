import { useState } from 'react';
import fixture from '../data/moa92.json';
import { TopBar } from '../components/ui';
import { useNav } from '../state/nav';

/** Synthetic-only inspector. This does not mutate the user's money or ledger. */
const dayNames = ['일','월','화','수','목','금','토'];
const won = (n: number) => Math.round(n).toLocaleString('ko-KR') + '원';
const todayFixture = '2026-11-04';
const minDate = '2026-09-11';
const maxDate = '2026-12-11';

export function DemoDataset() {
  const nav = useNav();
  const [selected, setSelected] = useState(todayFixture);
  const day = fixture.daily.find((d) => d.date === selected);
  const txns = fixture.transactions.filter((t) => t.date === selected);
  const choices = fixture.choices.filter((c) => c.date === selected);
  const trades = fixture.investments.filter((t) => t.date === selected);
  const future = selected > todayFixture;
  const dateIndex = fixture.daily.findIndex((d) => d.date === selected);
  const onMove = (diff: number) => {
    const next = fixture.daily[dateIndex + diff];
    if (next) setSelected(next.date);
  };
  const categories = Object.entries(
    txns.filter((t) => t.kind === 'spend' && t.recorded === 1).reduce<Record<string, number>>(
      (sum, t) => ({ ...sum, [t.category]: (sum[t.category] ?? 0) + t.amount_krw }), {},
    ),
  ).sort((a, b) => b[1] - a[1]);
  return (
    <div className="page no-nav moa92-page">
      <TopBar onBack={nav.pop} title="공통 데이터 살펴보기" center />
      <div className="moa92-notice">
        <strong>100% 가상 데이터 · 총 92일</strong>
        <p>2026.09.11 ~ 12.11의 한 명(S01) 체험 데이터예요. DB 없이 앱에 들어 있으며 실제 금융 기록이나 주가가 아니에요.</p>
        <p>11월 5일부터 12월 11일까지는 아직 일어나지 않은 <b>미래 시뮬레이션</b>이에요.</p>
      </div>

      <section className="card moa92-picker">
        <div className="moa92-picker-head">
          <button type="button" disabled={dateIndex <= 0} onClick={() => onMove(-1)} aria-label="전날 보기">‹</button>
          <label>날짜 선택 <input aria-label="살펴볼 데이터 날짜" type="date" min={minDate} max={maxDate}
            value={selected} onChange={(e) => { if (e.target.value >= minDate && e.target.value <= maxDate) setSelected(e.target.value); }} /></label>
          <button type="button" disabled={dateIndex >= fixture.daily.length - 1} onClick={() => onMove(1)} aria-label="다음날 보기">›</button>
        </div>
        <div className="moa92-phase">{future ? '미래 가상 시나리오' : '과거 합성 예시'} · {day ? dayNames[new Date(selected + 'T00:00:00Z').getUTCDay()] + '요일' : ''}</div>
      </section>

      {day && (
        <>
          <div className="moa92-stats">
            <section><small>가계부에 적힌 소비</small><b>{won(day.recorded_variable_spend_krw)}</b></section>
            <section><small>시뮬레이터 발생 지출</small><b>{won(day.actual_variable_spend_krw)}</b></section>
            <section><small>입금·고정결제</small><b>{won(day.income_krw)} / {won(day.fixed_paid_krw + day.card_paid_krw)}</b></section>
            <section><small>시뮬레이션 계좌 잔액</small><b>{day.bank_balance_end_krw < 0 ? '부족 ' + won(-day.bank_balance_end_krw) : won(day.bank_balance_end_krw)}</b></section>
          </div>

          <section className="card moa92-list">
            <h2>그날의 가상 거래</h2>
            {txns.length ? txns.map((t) => (
              <div className="moa92-row" key={t.id}>
                <div><b>{t.merchant}</b><small>{t.kind === 'income' ? '입금' : t.kind === 'card_payment' ? '카드대금' : t.kind === 'fixed_bill' ? '고정비' : t.category}{t.recorded === 0 ? ' · 앱에 미기록' : ''}</small></div>
                <strong>{t.kind === 'income' ? '+' : '−'}{won(t.amount_krw)}</strong>
              </div>
            )) : <p className="small muted">이 날짜에는 생성된 거래가 없어요.</p>}
            {categories.length > 0 && <p className="moa92-extra">기록된 소비: {categories.slice(0,3).map(([name, amount]) => name + ' ' + won(amount)).join(' · ')}</p>}
          </section>

          {(choices.length > 0 || trades.length > 0) && (
            <section className="card moa92-list">
              <h2>평행세계 선택·가상 투자</h2>
              {choices.map((c) => (
                <div className="moa92-row" key={c.id}>
                  <div><b>{c.item}</b><small>{c.choice === 'buy' ? '구매' : c.choice === 'wait' ? '보류' : '대안 선택'} · 원래 {won(c.original_price_krw)}</small></div>
                  <strong>{won(c.paid_krw)}</strong>
                </div>
              ))}
              {trades.map((t) => (
                <div className="moa92-row" key={t.id}>
                  <div><b>{t.stock_name}</b><small>가상 {t.side === 'buy' ? '매수' : '매도'} · {t.qty}주 · 합성 단가 {won(t.price_krw)}</small></div>
                  <strong>{won(t.amount_krw)}</strong>
                </div>
              ))}
            </section>
          )}
          <p className="moa92-foot">기록이 없는 날은 실제로 돈을 안 쓴 날과 구분되지 않을 수 있어요. 이 화면의 ‘시뮬레이터 발생 지출’은 테스트용 정답으로, 실제 사용자의 개인 소비 데이터가 아니에요.</p>
        </>
      )}
    </div>
  );
}
