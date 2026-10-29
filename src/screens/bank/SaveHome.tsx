import { useMemo, useState } from 'react';
import { addDays } from '../../../shared/dates';
import { PRODUCTS, getProduct, maxRate, type Product } from '../../lib/bank/products';
import { accruedToDate, preferentialRate, principalOf, type Contract } from '../../lib/bank/engine';
import { ratePct } from '../../lib/bank/money';
import { transactWorldWallet } from '../../lib/worldWallet';
import { Sheet, useToast } from '../../components/ui';
import { IconChevron } from '../../components/Icons';
import { useBank } from '../../state/bank';
import { useNav } from '../../state/nav';
import { useStore } from '../../state/store';
import { TAvatar, TopHeader } from '../V8Finance';
import { BankMark, ProductRow, dday, fmtWon, kDate } from './BankUI';

const preferentialRateSafe = (p: Product | undefined, ids: string[]) => (p ? preferentialRate(p, ids) : 0);

type Filter = 'all' | 'deposit' | 'installment';
type Sort = 'rate' | 'short' | 'min';

function AccountRow({ c, today, onClick }: { c: Contract; today: string; onClick: () => void }) {
  const p = getProduct(c.productId);
  const rate = c.baseRate + preferentialRateSafe(p, c.preferentialIds);
  const total = Math.max(1, Math.round((Date.parse(c.maturityOn) - Date.parse(c.openedOn)) / 864e5));
  const done = Math.min(total, Math.max(0, Math.round((Date.parse(today) - Date.parse(c.openedOn)) / 864e5)));
  const missed = c.missedRounds.length > 0;
  return (
    <button className="b-acct" onClick={onClick}>
      <BankMark bankId={p?.bank ?? 'moa'} size={40} />
      <span className="b-acct-main">
        <small>{c.nickname || p?.name}{missed && <i className="b-dot" aria-label="미납 있음" />}</small>
        <b className="num">{fmtWon(principalOf(c))}</b>
        <span className="b-acct-meta">
          <em>연 {ratePct(rate)}</em>
          <em>{c.kind === 'deposit' ? '예금' : c.installmentType === 'fixed' ? `적금 ${c.payments.length}/${c.termMonths}회` : '자유적금'}</em>
          <em className="dd">{dday(today, c.maturityOn)}</em>
        </span>
        <span className="b-acct-bar" aria-hidden="true"><i style={{ width: `${(100 * done) / total}%` }} /></span>
      </span>
      <IconChevron className="t-chev" />
    </button>
  );
}

function FreeSavingsSheet({ onClose }: { onClose: () => void }) {
  const { state, update } = useStore();
  const toast = useToast();
  const { usable, freeSavings } = useBank();
  const [amount, setAmount] = useState(10_000);
  const run = (type: 'save' | 'withdraw') => {
    const a = { type, amount } as const;
    if (!transactWorldWallet(state.worldWallet, a)) { toast(type === 'save' ? '이번 달 쓸 수 있는 돈이 부족해요' : '꺼낼 수 있는 금액보다 많아요'); return; }
    update((s) => { const w = transactWorldWallet(s.worldWallet, a); return w ? { ...s, worldWallet: w } : s; });
    toast(type === 'save' ? `자유 저축에 ${fmtWon(amount)}을 옮겼어요` : `${fmtWon(amount)}을 현금으로 돌렸어요`);
    onClose();
  };
  return (
    <Sheet title="자유 저축" onClose={onClose} footer={<>
      <button className="btn ghost flex" disabled={amount <= 0 || amount > freeSavings} onClick={() => run('withdraw')}>꺼내기</button>
      <button className="btn primary flex" disabled={amount <= 0 || amount > usable} onClick={() => run('save')}>넣기</button>
    </>}>
      <p className="sheet-text">이자는 없지만 언제든 꺼낼 수 있어요. 지금 <b>{fmtWon(freeSavings)}</b> 있어요.</p>
      <div className="t-field">
        <div className="t-amount-input">
          <input inputMode="numeric" aria-label="금액" value={amount ? amount.toLocaleString('ko-KR') : ''} placeholder="0" onChange={(e) => setAmount(Math.min(100_000_000, Number(e.target.value.replace(/[^0-9]/g, '')) || 0))} />
          <span>원</span>
        </div>
        <div className="t-quick">
          {[10_000, 30_000, 50_000].map((v) => <button key={v} aria-pressed={amount === v} onClick={() => setAmount(v)}>{v / 10_000}만원</button>)}
        </div>
      </div>
    </Sheet>
  );
}

export function SaveHome() {
  const nav = useNav();
  const { bank, today, totals, usable, freeSavings, travel } = useBank();
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('rate');
  const [freeOpen, setFreeOpen] = useState(false);
  const [showPast, setShowPast] = useState(false);

  const active = bank.contracts.filter((c) => c.status === 'active').sort((a, b) => a.maturityOn.localeCompare(b.maturityOn));
  const past = bank.contracts.filter((c) => c.status !== 'active').reverse();
  const accrued = active.reduce((s, c) => s + accruedToDate(c, today), 0);
  const nextC = active[0];

  const products = useMemo(() => {
    const list = PRODUCTS.filter((p) => filter === 'all' || p.kind === filter);
    const minTerm = (p: (typeof PRODUCTS)[number]) => Math.min(...p.rates.map((r) => r.months));
    return [...list].sort((a, b) => (sort === 'rate' ? maxRate(b) - maxRate(a) : sort === 'short' ? minTerm(a) - minTerm(b) : a.minAmount - b.minAmount));
  }, [filter, sort]);

  return (
    <div className="page t-page b-save">
      <TopHeader title="모으기" />

      <section className="t-card b-hero">
        <span className="t-label">모은 돈</span>
        <strong className="t-hero-num num">{fmtWon(totals.principal + freeSavings + accrued)}</strong>
        <p className="b-hero-sub">
          원금 {fmtWon(totals.principal + freeSavings)} · 쌓이는 이자 <b className="pos">+{fmtWon(accrued)}</b>
        </p>
        {nextC ? (
          <button className="b-next" onClick={() => nav.push({ name: 'account', id: nextC.id })}>
            <span className="b-next-dd num">{dday(today, nextC.maturityOn)}</span>
            <span>{nextC.nickname || getProduct(nextC.productId)?.name} 만기 · {kDate(nextC.maturityOn)}</span>
            <IconChevron />
          </button>
        ) : (
          <p className="b-hero-empty">참아서 아낀 돈을 예금·적금에 넣으면 여기서 불어나는 걸 볼 수 있어요.</p>
        )}
        <div className="b-usable">이번 달 넣을 수 있는 돈 <b className="num">{fmtWon(usable)}</b></div>
      </section>

      <section className="t-card">
        <div className="t-card-head"><h2>내 계좌 <em>{active.length + 1}</em></h2></div>
        <div className="b-accts">
          {active.map((c) => <AccountRow key={c.id} c={c} today={today} onClick={() => nav.push({ name: 'account', id: c.id })} />)}
          <button className="b-acct" onClick={() => setFreeOpen(true)}>
            <TAvatar kind="saving" />
            <span className="b-acct-main">
              <small>자유 저축 · 이자 없음</small>
              <b className="num">{fmtWon(freeSavings)}</b>
              <span className="b-acct-meta"><em>언제든 넣고 꺼내기</em></span>
            </span>
            <IconChevron className="t-chev" />
          </button>
        </div>
        {active.length === 0 && <p className="t-note">아직 가입한 예금·적금이 없어요. 아래에서 골라보세요.</p>}
        {past.length > 0 && (
          <>
            <button className="t-link b-past-toggle" onClick={() => setShowPast((v) => !v)}>{showPast ? '지난 계좌 접기' : `만기·해지된 계좌 ${past.length}개 보기`}</button>
            {showPast && (
              <div className="t-list">
                {past.map((c) => {
                  const p = getProduct(c.productId);
                  return (
                    <button key={c.id} className="t-row" onClick={() => nav.push({ name: 'account', id: c.id })}>
                      <BankMark bankId={p?.bank ?? 'moa'} size={36} />
                      <span className="t-row-main"><b>{c.nickname || p?.name}</b><small>{c.status === 'matured' ? '만기' : '중도해지'} · {kDate(c.settlement?.on ?? c.maturityOn)}</small></span>
                      <span className="t-row-amt num pos">+{fmtWon((c.settlement?.interest ?? 0) - (c.settlement?.tax ?? 0))}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </section>

      <section className="t-card">
        <div className="t-card-head"><h2>상품 찾기</h2></div>
        <div className="t-seg sm" role="tablist" aria-label="상품 종류">
          {([['all', '전체'], ['deposit', '예금'], ['installment', '적금']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} onClick={() => setFilter(k)}>{l}</button>
          ))}
        </div>
        <div className="t-chips b-sort" role="group" aria-label="정렬">
          {([['rate', '최고금리순'], ['short', '짧은 기간순'], ['min', '적은 금액부터']] as const).map(([k, l]) => (
            <button key={k} aria-pressed={sort === k} onClick={() => setSort(k)}>{l}</button>
          ))}
        </div>
        <div className="t-list">
          {products.map((p) => <ProductRow key={p.id} p={p} onClick={() => nav.push({ name: 'product', id: p.id })} />)}
        </div>
      </section>

      <section className="t-card b-clock">
        <div className="t-card-head"><h2>시간 이동</h2><span className="t-badge amber">발표·체험용</span></div>
        <p className="t-card-desc">
          앱 날짜 <b className="num">{kDate(today)}</b>{bank.clockOffsetDays ? ` (실제보다 ${bank.clockOffsetDays}일 뒤)` : ''}. 날짜를 앞으로 옮기면 그 사이의 자동이체와 만기가 차례로 처리돼요.
        </p>
        <div className="t-quick">
          <button onClick={() => travel(7)}>+1주</button>
          <button onClick={() => travel(30)}>+1달</button>
          <button onClick={() => travel(91)}>+3달</button>
        </div>
        <p className="t-note">다음 날짜: {kDate(addDays(today, 30))} (+1달)</p>
      </section>

      <p className="t-foot">모든 상품은 학습용 가상 상품이에요. 금리·세금(15.4%)·중도해지 규칙은 실제 은행 방식을 단순하게 따랐고, 실제 금융사와 연결되지 않아요.</p>
      {freeOpen && <FreeSavingsSheet onClose={() => setFreeOpen(false)} />}
    </div>
  );
}
