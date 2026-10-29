import { useMemo, useState } from 'react';
import { parseISO } from '../../../shared/dates';
import { BANKS, getProduct } from '../../lib/bank/products';
import { quoteJoin } from '../../lib/bank/engine';
import { ratePct } from '../../lib/bank/money';
import { CtaBar, TopBar } from '../../components/ui';
import { IconCheck } from '../../components/Icons';
import { useBank } from '../../state/bank';
import { useNav } from '../../state/nav';
import { BankMark, KV, fmtWon, kDate } from './BankUI';

const STEPS = ['금액', '기간', '상품 설명', '확인'] as const;

export function Join({ id }: { id: string }) {
  const nav = useNav();
  const bank = useBank();
  const p = getProduct(id);
  const [step, setStep] = useState(0);
  const [amount, setAmount] = useState<number>(0);
  const [months, setMonths] = useState(() => p?.rates[0]?.months ?? 12);
  const openDay = parseISO(bank.today).d;
  const [autoDay, setAutoDay] = useState(openDay);
  const [nickname, setNickname] = useState('');
  const [agreed, setAgreed] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState('');

  const fixed = p?.installmentType === 'fixed';
  const free = p?.installmentType === 'free';
  const q = useMemo(() => (p ? quoteJoin(p, { amount, months, openedOn: bank.today, autoDay: fixed ? autoDay : undefined }, bank.ctx, bank.bank.contracts) : null), [p, amount, months, autoDay, fixed, bank.today, bank.ctx, bank.bank.contracts]);
  if (!p || !q) return <div className="page"><TopBar onBack={nav.pop} title="가입" /><p className="t-empty">상품을 찾을 수 없어요.</p></div>;

  const over = amount > bank.usable;
  const amountError = amount > 0 ? (over ? `이번 달 넣을 수 있는 돈(${fmtWon(bank.usable)})보다 많아요.` : !q.ok ? q.error : '') : '';
  const canNext = [amount > 0 && !over && q.ok, q.ok, agreed, q.ok && !over][step];

  if (done) {
    return (
      <div className="page t-page b-done">
        <div className="b-done-icon" aria-hidden="true"><IconCheck /></div>
        <h1>가입했어요</h1>
        <p>{p.name}에 {fmtWon(amount)}을 {fixed ? '1회차로 ' : ''}넣었어요.</p>
        <dl className="t-summary b-done-sum">
          <KV k="만기일" v={kDate(q.maturityOn)} />
          <KV k="적용 금리" v={`연 ${ratePct(q.appliedRate)}`} />
          <KV k={fixed ? '모두 내면 받는 돈' : '만기에 받는 돈'} v={fmtWon(q.net)} tone="strong" />
        </dl>
        {fixed && <p className="t-note">다음 자동이체: 매달 {autoDay >= 31 ? '말일' : `${autoDay}일`} {fmtWon(amount)}</p>}
        <CtaBar>
          <div className="t-btn-row" style={{ width: '100%' }}>
            <button className="t-btn ghost" style={{ marginTop: 0 }} onClick={() => { nav.reset(); nav.setTab('save'); }}>모으기 홈</button>
            <button className="t-btn primary" style={{ marginTop: 0 }} onClick={() => nav.replace({ name: 'account', id: done })}>계좌 보기</button>
          </div>
        </CtaBar>
      </div>
    );
  }

  const submit = () => {
    const r = bank.join(p, { amount, months, autoDay: fixed ? autoDay : undefined, nickname });
    if (r.error) { setError(r.error); return; }
    setDone(r.id ?? null);
  };

  return (
    <div className="page t-page b-join">
      <TopBar onBack={() => (step ? setStep(step - 1) : nav.pop())} title={p.name} />
      <ol className="b-steps" aria-label="가입 단계">
        {STEPS.map((s, i) => <li key={s} className={i === step ? 'on' : i < step ? 'done' : ''} aria-current={i === step ? 'step' : undefined}>{s}</li>)}
      </ol>

      {step === 0 && (
        <section className="b-join-body">
          <h2>{p.kind === 'deposit' ? '얼마를 맡길까요?' : fixed ? '매달 얼마씩 모을까요?' : '처음에 얼마를 넣을까요?'}</h2>
          <div className="t-amount-input">
            <input autoFocus inputMode="numeric" aria-label="금액" value={amount ? amount.toLocaleString('ko-KR') : ''} placeholder="0" onChange={(e) => setAmount(Math.min(100_000_000, Number(e.target.value.replace(/[^0-9]/g, '')) || 0))} />
            <span>원</span>
          </div>
          {amountError ? <p className="t-error">{amountError}</p> : <p className="b-hint">이번 달 넣을 수 있는 돈 <b className="num">{fmtWon(bank.usable)}</b></p>}
          <div className="t-quick">
            {(p.kind === 'deposit' ? [50_000, 100_000, 300_000] : [10_000, 30_000, 50_000]).map((v) => (
              <button key={v} onClick={() => setAmount(Math.min(v + amount, 100_000_000))}>+{v / 10_000}만</button>
            ))}
            <button onClick={() => setAmount(Math.min(bank.usable, p.maxAmount))}>최대</button>
          </div>
          <p className="t-note">{p.kind === 'deposit' ? `${fmtWon(p.minAmount)}부터 ${fmtWon(p.maxAmount)}까지` : free ? `1회 ${fmtWon(p.minAmount)}부터, 한 달 ${fmtWon(p.monthlyLimit ?? p.maxAmount)}까지` : `매달 ${fmtWon(p.minAmount)} ~ ${fmtWon(p.maxAmount)}`}</p>
        </section>
      )}

      {step === 1 && (
        <section className="b-join-body">
          <h2>얼마 동안 모을까요?</h2>
          <div className="b-term-list" role="radiogroup" aria-label="기간">
            {p.rates.map((r) => {
              const tq = quoteJoin(p, { amount, months: r.months, openedOn: bank.today, autoDay: fixed ? autoDay : undefined }, bank.ctx, bank.bank.contracts);
              return (
                <button key={r.months} role="radio" aria-checked={months === r.months} className="b-term" onClick={() => setMonths(r.months)}>
                  <span className="b-radio" aria-hidden="true" />
                  <span className="b-term-main"><b>{r.months}개월</b><small>{kDate(tq.maturityOn)} 만기</small></span>
                  <span className="b-term-right"><b className="num">연 {ratePct(tq.appliedRate)}</b><small className="num">+{fmtWon(tq.interest - tq.tax)}</small></span>
                </button>
              );
            })}
          </div>
          {fixed && (
            <div className="t-field">
              <label>자동이체일</label>
              <div className="t-chips">
                {Array.from(new Set([openDay, 1, 10, 15, 25, 31])).sort((a, b) => a - b).map((d) => (
                  <button key={d} aria-pressed={autoDay === d} onClick={() => setAutoDay(d)}>{d === 31 ? '말일' : `${d}일`}{d === openDay ? ' (오늘)' : ''}</button>
                ))}
              </div>
              <p className="t-note">1회차는 오늘 내고, 2회차부터 매달 이 날짜에 빠져나가요. 그날 이번 달 쓸 수 있는 돈이 부족하면 미납돼요.</p>
            </div>
          )}
          <div className="t-field">
            <label htmlFor="b-nick">계좌 별명 <small className="muted">(선택)</small></label>
            <input id="b-nick" className="b-input" maxLength={16} placeholder={`예: 여행 자금, ${p.name}`} value={nickname} onChange={(e) => setNickname(e.target.value)} />
          </div>
        </section>
      )}

      {step === 2 && (
        <section className="b-join-body">
          <h2>가입 전에 확인해 주세요</h2>
          <div className="b-terms-box">
            <div className="b-terms-head"><BankMark bankId={p.bank} size={32} /><b>{BANKS[p.bank]?.name} {p.name}</b></div>
            <ul className="b-terms">
              {p.terms.map((t) => <li key={t}>{t}</li>)}
              <li>만기가 지나면 원금과 세후 이자를 현금으로 자동으로 돌려받아요. 만기 후 이자는 없어요.</li>
              <li>학습용 가상 상품이에요. 실제 돈이 움직이지 않아요.</li>
            </ul>
          </div>
          <label className="b-agree">
            <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} />
            <span>상품 설명을 모두 확인했어요</span>
          </label>
        </section>
      )}

      {step === 3 && (
        <section className="b-join-body">
          <h2>이대로 가입할까요?</h2>
          <dl className="t-summary b-confirm">
            <KV k="상품" v={p.name} />
            <KV k={p.kind === 'deposit' ? '맡기는 돈' : fixed ? '매달 납입' : '처음 넣는 돈'} v={fmtWon(amount)} />
            <KV k="기간" v={`${months}개월 · ${kDate(q.maturityOn)} 만기`} />
            {fixed && <KV k="자동이체" v={`매달 ${autoDay >= 31 ? '말일' : `${autoDay}일`}`} />}
            <KV k="적용 금리" sub={q.prefRate > 0 ? `우대 +${q.prefRate.toFixed(2)}%p 포함` : undefined} v={`연 ${ratePct(q.appliedRate)}`} />
            <KV k="세후 이자 (예상)" v={`+${fmtWon(q.interest - q.tax)}`} tone="pos" />
            <KV k="만기에 받는 돈 (예상)" v={fmtWon(q.net)} tone="strong" />
            <KV k="가입 후 이번 달 쓸 수 있는 돈" v={fmtWon(bank.usable - amount)} />
          </dl>
          {free && <p className="t-note">자유적금 예상액은 매달 같은 금액을 넣는다고 가정했어요.</p>}
          {error && <p className="t-error">{error}</p>}
        </section>
      )}

      <CtaBar>
        <button className="t-btn primary" style={{ marginTop: 0 }} disabled={!canNext} onClick={() => (step < 3 ? setStep(step + 1) : submit())}>
          {step < 3 ? '다음' : `${fmtWon(amount)} 넣고 가입하기`}
        </button>
      </CtaBar>
    </div>
  );
}
