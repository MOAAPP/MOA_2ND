import { useMemo, useState } from 'react';
import { BANKS, baseRateFor, getProduct, maxRate } from '../../lib/bank/products';
import { quoteJoin } from '../../lib/bank/engine';
import { ratePct } from '../../lib/bank/money';
import { CtaBar, TopBar } from '../../components/ui';
import { useBank } from '../../state/bank';
import { useNav } from '../../state/nav';
import { BankMark, KV, PrefList, fmtWon, kDate } from './BankUI';

export function ProductDetail({ id }: { id: string }) {
  const nav = useNav();
  const { today, ctx, bank } = useBank();
  const p = getProduct(id);
  const [months, setMonths] = useState(() => p?.rates[p.rates.length > 1 ? 1 : 0]?.months ?? 12);
  const [amount, setAmount] = useState(() => (p?.kind === 'installment' ? 100_000 : 1_000_000));

  const q = useMemo(() => (p ? quoteJoin(p, { amount, months, openedOn: today }, ctx, bank.contracts) : null), [p, amount, months, today, ctx, bank.contracts]);
  if (!p || !q) return <div className="page"><TopBar onBack={nav.pop} title="상품" /><p className="t-empty">상품을 찾을 수 없어요.</p></div>;
  const isInst = p.kind === 'installment';
  const free = p.installmentType === 'free';

  return (
    <div className="page t-page b-detail">
      <TopBar onBack={nav.pop} title="" />
      <header className="b-detail-head">
        <BankMark bankId={p.bank} size={52} />
        <small>{BANKS[p.bank]?.name} · {isInst ? (free ? '자유적립식 적금' : '정액적립식 적금') : p.compounding === 'monthly' ? '월복리 정기예금' : '정기예금'}</small>
        <h1>{p.name}</h1>
        <p>{p.summary}</p>
        <div className="b-detail-rates">
          <div><small>최고</small><b className="num">연 {ratePct(maxRate(p))}</b></div>
          <div><small>기본</small><b className="num">연 {ratePct(Math.max(...p.rates.map((r) => r.base)))}</b></div>
        </div>
      </header>

      <section className="t-card">
        <div className="t-card-head"><h2>기간별 기본금리</h2></div>
        <table className="b-rate-table">
          <thead><tr><th>기간</th><th>기본</th><th>우대 포함 최고</th></tr></thead>
          <tbody>
            {p.rates.map((r) => (
              <tr key={r.months} className={r.months === months ? 'on' : ''} onClick={() => setMonths(r.months)}>
                <td>{r.months}개월</td>
                <td className="num">{ratePct(r.base)}</td>
                <td className="num strong">{ratePct(r.base + p.maxPreferential)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="t-card">
        <div className="t-card-head"><h2>우대금리 <em>최대 +{p.maxPreferential.toFixed(1)}%p</em></h2></div>
        <PrefList prefs={q.prefs} mode="join" />
        {p.preferential.length > 0 && <p className="t-note">{isInst ? '적금 우대금리는 만기일에 기간 중 기록을 보고 정해져요.' : '예금 우대금리는 가입하는 날 확정돼요.'}</p>}
      </section>

      <section className="t-card">
        <div className="t-card-head"><h2>얼마나 받을까?</h2></div>
        <div className="t-field" style={{ marginTop: 0 }}>
          <label htmlFor="b-calc">{isInst ? (free ? '매달 넣는다고 하면' : '매달') : '맡길 돈'}</label>
          <div className="t-amount-input">
            <input id="b-calc" inputMode="numeric" value={amount ? amount.toLocaleString('ko-KR') : ''} placeholder="0" onChange={(e) => setAmount(Math.min(100_000_000, Number(e.target.value.replace(/[^0-9]/g, '')) || 0))} />
            <span>원</span>
          </div>
        </div>
        <div className="t-seg sm b-term-seg" role="group" aria-label="기간">
          {p.rates.map((r) => <button key={r.months} aria-pressed={months === r.months} onClick={() => setMonths(r.months)}>{r.months}개월</button>)}
        </div>
        {q.ok ? (
          <dl className="t-summary">
            <KV k="원금" v={fmtWon(q.principal)} />
            <KV k="적용 금리" sub={q.prefRate > 0 ? `기본 ${ratePct(baseRateFor(p, months) ?? 0)} + 우대 ${q.prefRate.toFixed(2)}` : undefined} v={`연 ${ratePct(q.appliedRate)}`} />
            <KV k="세전 이자" v={`+${fmtWon(q.interest)}`} tone="pos" />
            <KV k="이자소득세" sub="15.4%" v={`−${fmtWon(q.tax)}`} />
            <KV k={`${kDate(q.maturityOn)}에 받는 돈`} v={fmtWon(q.net)} tone="strong" />
          </dl>
        ) : (
          <p className="t-error">{q.error}</p>
        )}
      </section>

      <section className="t-card">
        <div className="t-card-head"><h2>꼭 알아둘 것</h2></div>
        <ul className="b-terms">
          {p.terms.map((t) => <li key={t}>{t}</li>)}
          <li>중도해지 이율: {p.earlyRates.map((e) => `${Number.isFinite(e.underMonths) ? `${e.underMonths}개월 미만` : '그 이후'} ${e.fixed !== undefined ? `연 ${e.fixed}%` : `기본금리의 ${Math.round((e.ratio ?? 0) * 100)}%`}`).join(' · ')}</li>
          <li>{isInst ? `납입 한도 ${free ? `1회 ${fmtWon(p.minAmount)}부터, 한 달 ${fmtWon(p.monthlyLimit ?? p.maxAmount)}까지` : `매달 ${fmtWon(p.minAmount)} ~ ${fmtWon(p.maxAmount)}`}` : `가입 금액 ${fmtWon(p.minAmount)} ~ ${fmtWon(p.maxAmount)}`}</li>
        </ul>
      </section>

      <p className="t-foot">학습용 가상 상품이에요. 실제 금융사·상품과 관계없어요.</p>
      <CtaBar>
        <button className="t-btn primary" style={{ marginTop: 0 }} onClick={() => nav.push({ name: 'join', id: p.id })}>가입하기</button>
      </CtaBar>
    </div>
  );
}
