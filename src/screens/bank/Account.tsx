import { useMemo, useState } from 'react';
import { diffDays, formatShort } from '../../../shared/dates';
import { BANKS, getProduct } from '../../lib/bank/products';
import { accruedToDate, earlyQuote, maturityQuote, prefStatus, principalOf, roundDue } from '../../lib/bank/engine';
import { ratePct } from '../../lib/bank/money';
import { HISTORY_FILTERS, historyView, type HistoryFilter } from '../../lib/bank/history';
import { ConfirmSheet, Sheet, TopBar, useToast } from '../../components/ui';
import { useBank } from '../../state/bank';
import { useNav } from '../../state/nav';
import { BankMark, KV, PrefList, dday, dotDate, fmtWon, kDate } from './BankUI';

export function Account({ id }: { id: string }) {
  const nav = useNav();
  const toast = useToast();
  const { bank, today, ctx, usable, pay, close } = useBank();
  const c = bank.contracts.find((x) => x.id === id);
  const p = c ? getProduct(c.productId) : undefined;
  const [closing, setClosing] = useState(false);
  const [paying, setPaying] = useState(false);
  const [payAmt, setPayAmt] = useState(10_000);
  const [payErr, setPayErr] = useState('');
  const [hf, setHf] = useState<HistoryFilter>('all');

  const mq = useMemo(() => (c ? maturityQuote(c, ctx, today, bank.contracts) : null), [c, ctx, today, bank.contracts]);
  if (!c || !p || !mq) return <div className="page"><TopBar onBack={nav.pop} title="계좌" /><p className="t-empty">계좌를 찾을 수 없어요.</p></div>;

  const active = c.status === 'active';
  const principal = principalOf(c);
  const accrued = accruedToDate(c, today);
  const totalDays = Math.max(1, diffDays(c.openedOn, c.maturityOn));
  const passed = Math.min(totalDays, Math.max(0, diffDays(c.openedOn, today)));
  const prefs = c.kind === 'deposit'
    ? prefStatus(p, ctx, { openedOn: c.openedOn, asOf: c.openedOn, maturityOn: c.maturityOn, bankHistory: bank.contracts, contract: c }).map((x) => ({ ...x, achieved: c.preferentialIds.includes(x.id) }))
    : mq.prefs;
  const early = active ? earlyQuote(c, today) : null;
  const hv = historyView(bank.log.filter((e) => e.contractId === c.id), hf, c.settlement);
  const color = BANKS[p.bank]?.color ?? '#3182F6';
  const s = c.settlement;

  return (
    <div className="page t-page b-account">
      <TopBar onBack={nav.pop} title="" />

      <section className="b-acct-hero" style={{ ['--bank' as string]: color }}>
        <div className="b-acct-hero-top">
          <BankMark bankId={p.bank} size={36} />
          <span>{BANKS[p.bank]?.name}</span>
          <span className={`b-status ${c.status}`}>{active ? dday(today, c.maturityOn) : c.status === 'matured' ? '만기' : '해지'}</span>
        </div>
        <h1>{c.nickname || p.name}</h1>
        {c.nickname && <small className="b-acct-prod">{p.name}</small>}
        <strong className="num">{fmtWon(active ? principal : s?.net ?? principal)}</strong>
        <small className="b-acct-cap">{active ? '넣은 원금' : '받은 돈 (세후)'}</small>
        {active && (
          <>
            <div className="b-progress" role="img" aria-label={`기간 ${Math.round((100 * passed) / totalDays)}% 지남`}><i style={{ width: `${(100 * passed) / totalDays}%` }} /></div>
            <div className="b-progress-key"><span>{dotDate(c.openedOn)} 가입</span><span>{dotDate(c.maturityOn)} 만기</span></div>
          </>
        )}
      </section>

      {active ? (
        <section className="t-card">
          <dl className="t-summary" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
            <KV k="지금까지 쌓인 이자" sub="세전" v={`+${fmtWon(accrued)}`} tone="pos" />
            <KV k="적용 금리" sub={c.kind === 'installment' && p.preferential.length ? '우대는 만기에 확정' : undefined} v={`연 ${ratePct(mq.appliedRate)}`} />
            <KV k="만기 예상 수령액" sub={c.installmentType === 'fixed' ? '남은 회차 포함' : '세후'} v={fmtWon(mq.net)} tone="strong" />
            <KV k="세전 이자 / 세금" v={`${fmtWon(mq.interest)} / ${fmtWon(mq.tax)}`} />
          </dl>
          {c.installmentType === 'free' && (
            <button className="t-btn primary" onClick={() => { setPaying(true); setPayErr(''); }}>돈 넣기</button>
          )}
        </section>
      ) : s && (
        <section className="t-card">
          <div className="t-card-head"><h2>{s.reason === 'maturity' ? '만기 수령' : '중도해지 정산'}</h2></div>
          <dl className="t-summary" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
            <KV k="원금" v={fmtWon(s.principal)} />
            <KV k="적용 금리" v={`연 ${ratePct(s.appliedRate)}`} />
            <KV k="세전 이자" v={`+${fmtWon(s.interest)}`} tone="pos" />
            <KV k="이자소득세" v={`−${fmtWon(s.tax)}`} />
            <KV k={`${kDate(s.on)}에 받은 돈`} v={fmtWon(s.net)} tone="strong" />
          </dl>
        </section>
      )}

      {c.installmentType === 'fixed' && c.monthlyAmount && (
        <section className="t-card">
          <div className="t-card-head"><h2>납입 회차 <em>{c.payments.length}/{c.termMonths}</em></h2></div>
          <div className="b-rounds">
            {Array.from({ length: c.termMonths }, (_, i) => {
              const k = i + 1;
              const pay = c.payments.find((x) => x.round === k);
              const missed = c.missedRounds.includes(k);
              const due = roundDue(c, k);
              const st = pay ? 'paid' : missed ? 'missed' : due <= today ? 'due' : 'next';
              return (
                <div key={k} className={`b-round ${st}`} title={`${k}회차 ${dotDate(due)}`}>
                  <b>{k}</b>
                  <small>{formatShort(due)}</small>
                </div>
              );
            })}
          </div>
          <div className="b-rounds-key"><span><i className="paid" />납입</span><span><i className="missed" />미납</span><span><i className="next" />예정</span></div>
          <p className="t-note">매달 {c.autoDay && c.autoDay >= 31 ? '말일' : `${c.autoDay}일`} {fmtWon(c.monthlyAmount)} 자동이체{c.missedRounds.length ? ` · 미납 ${c.missedRounds.length}회는 이자가 붙지 않고 자동이체 우대도 사라져요` : ''}</p>
        </section>
      )}

      {p.preferential.length > 0 && (
        <section className="t-card">
          <div className="t-card-head"><h2>우대금리 조건</h2></div>
          <PrefList prefs={prefs} mode="account" />
        </section>
      )}

      <section className="t-card">
        <div className="t-card-head"><h2>거래 내역</h2></div>
        <div className="t-chips b-hist-chips" role="group" aria-label="거래 내역 필터">
          {HISTORY_FILTERS.map((f) => <button key={f.id} aria-pressed={hf === f.id} onClick={() => setHf(f.id)}>{f.label}</button>)}
        </div>
        {hv.count > 0 && hf !== 'all' && (
          <p className="b-hist-total"><span>{hf === 'in' ? '넣은 돈 합계' : hf === 'out' ? '받은 돈 합계' : '세후 이자 합계'}</span><b className="num">{hf === 'in' ? fmtWon(hv.total) : `+${fmtWon(hv.total)}`}</b></p>
        )}
        {hv.count ? (
          <div className="b-history">
            {hv.rows.map(({ event: e, interest }) => (
              <div key={e.id} className="b-hist-row">
                <span className="b-hist-date num">{formatShort(e.on)}</span>
                <span className="b-hist-memo">{interest ? <>{e.type === 'mature' ? '만기 이자' : '중도해지 이자'}<small>세전 {fmtWon(interest.gross)} · 세금 −{fmtWon(interest.tax)}</small></> : e.memo}</span>
                <span className={`num b-hist-amt ${interest ? 'pos' : e.type === 'missed' ? 'neg' : e.cash > 0 ? 'pos' : ''}`}>{interest ? `+${fmtWon(interest.net)}` : e.type === 'missed' ? '미납' : e.cash > 0 ? `+${fmtWon(e.cash)}` : fmtWon(-e.cash)}</span>
              </div>
            ))}
          </div>
        ) : <p className="t-empty">{hf === 'interest' ? (active ? `이자는 ${dotDate(c.maturityOn)} 만기에 한 번에 들어와요.` : '받은 이자가 없어요.') : hf === 'out' ? '아직 받은 돈이 없어요.' : '거래 내역이 없어요.'}</p>}
      </section>

      {active && early && (
        <section className="t-card b-early">
          <div className="t-card-head"><h2>지금 해지하면</h2></div>
          <dl className="t-summary" style={{ marginTop: 0, paddingTop: 0, borderTop: 0 }}>
            <KV k="중도해지 금리" v={`연 ${ratePct(early.appliedRate)}`} />
            <KV k="받는 돈" v={fmtWon(early.net)} />
            <KV k="만기까지 기다리면" v={fmtWon(mq.net)} />
            <KV k="놓치는 이자" v={`−${fmtWon(Math.max(0, mq.net - early.net - (mq.principal - principal)))}`} tone="neg" />
          </dl>
          <button className="t-btn ghost" onClick={() => setClosing(true)}>중도해지하기</button>
        </section>
      )}

      {closing && early && (
        <ConfirmSheet
          title="정말 해지할까요?"
          danger
          confirm={`${fmtWon(early.net)} 받고 해지`}
          body={<>지금 해지하면 연 {ratePct(early.appliedRate)}만 적용돼서 <b>{fmtWon(Math.max(0, mq.net - early.net - (mq.principal - principal)))}</b>의 이자를 놓쳐요. 해지한 계좌는 되돌릴 수 없어요.</>}
          onClose={() => setClosing(false)}
          onConfirm={() => {
            const err = close(c.id);
            setClosing(false);
            if (err) toast(err); else toast(`${fmtWon(early.net)}을 현금으로 받았어요`);
          }}
        />
      )}

      {paying && (
        <Sheet title="돈 넣기" onClose={() => setPaying(false)} footer={<button className="btn primary flex" disabled={payAmt <= 0} onClick={() => { const err = pay(c.id, payAmt); if (err) setPayErr(err); else { setPaying(false); toast(`${fmtWon(payAmt)}을 넣었어요`); } }}>{fmtWon(payAmt)} 넣기</button>}>
          <p className="sheet-text">넣은 날부터 만기일까지 일수만큼 이자가 붙어요. 이번 달 넣을 수 있는 돈 <b>{fmtWon(usable)}</b></p>
          <div className="t-field">
            <div className="t-amount-input">
              <input autoFocus inputMode="numeric" aria-label="넣을 금액" value={payAmt ? payAmt.toLocaleString('ko-KR') : ''} placeholder="0" onChange={(e) => { setPayErr(''); setPayAmt(Math.min(10_000_000, Number(e.target.value.replace(/[^0-9]/g, '')) || 0)); }} />
              <span>원</span>
            </div>
            <div className="t-quick">{[5_000, 10_000, 30_000].map((v) => <button key={v} aria-pressed={payAmt === v} onClick={() => setPayAmt(v)}>{v.toLocaleString('ko-KR')}원</button>)}</div>
            {payErr && <p className="t-error">{payErr}</p>}
          </div>
        </Sheet>
      )}
    </div>
  );
}
