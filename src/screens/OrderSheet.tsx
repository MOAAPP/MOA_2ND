import { useState } from 'react';
import { formatKDate, formatKDateTime } from '../../shared/dates';
import { signedWon, won, shares } from '../../shared/format';
import { INSTRUMENT_BY_CODE } from '../../shared/instruments';
import { roundToTick, tickSize } from '../../shared/krx';
import type { Quote } from '../../shared/market';
import { Notice, Seg, Sheet, WorldTag } from '../components/ui';
import { uid } from '../lib/id';
import { availableCash, availableQty, fillWorlds, placeOrder, type Fill, type Order, type OrderType, type Side } from '../lib/trading';
import { useMarket } from '../state/market';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';

export function OrderSheet({ code, side, quote, onClose }: { code: string; side: Side; quote: Quote | null; onClose: () => void }) {
  const { state, update } = useStore();
  const m = useMarket();
  const nav = useNav();
  const inst = INSTRUMENT_BY_CODE[code];
  const [orderId] = useState(() => uid('ord')); // 시트를 열 때 한 번 만든 ID → 중복 클릭해도 한 번만 처리
  const marketOpen = m.status.state === 'open';
  const [type, setType] = useState<OrderType>(marketOpen && quote ? 'market' : 'limit');
  const [qty, setQty] = useState(1);
  const [limit, setLimit] = useState<number>(quote ? quote.price : 0);
  const [step, setStep] = useState<'form' | 'confirm' | 'result'>('form');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ order?: Order; fill?: Fill; error?: string } | null>(null);

  const p = state.portfolio;
  const price = type === 'market' ? quote?.price ?? 0 : limit;
  const est = qty * price;
  const avail = availableCash(p);
  const availQ = availableQty(p, code);
  const tick = tickSize(price || 1, inst.type);
  const tickOk = type === 'market' || (limit > 0 && limit % tickSize(limit, inst.type) === 0);
  const maxQty = side === 'buy' ? (price > 0 ? Math.floor(avail / price) : 0) : availQ;
  const formOk = qty >= 1 && price > 0 && tickOk && (side === 'buy' ? est <= avail : qty <= availQ) && (type === 'limit' || (marketOpen && !!quote));
  const verb = side === 'buy' ? '매수' : '매도';

  const submit = () => {
    if (busy) return;
    setBusy(true);
    const ctx = { now: Date.now(), market: m.status, quote };
    const req = { id: orderId, code, name: inst.name, side, type, qty, limitPrice: type === 'limit' ? limit : undefined };
    const r = placeOrder(state.portfolio, req, ctx);
    if (r.ok) {
      update((s) => {
        const again = placeOrder(s.portfolio, req, ctx);
        return again.ok ? { ...s, portfolio: again.state } : s;
      });
      setResult({ order: r.order, fill: r.fill });
      if (r.fill && !r.duplicate) {
        const f = r.fill;
        window.setTimeout(() => void m.requestCard(f), 60);
      }
    } else {
      setResult({ error: r.error });
    }
    setStep('result');
  };

  if (step === 'result' && result) {
    const fill = result.fill;
    const w = fill ? fillWorlds(fill, quote?.price ?? null) : null;
    return (
      <Sheet title={result.error ? '주문하지 못했어요' : fill ? `모의 ${verb} 체결` : '모의 주문 대기 중'} onClose={onClose} footer={
        <>
          {fill && <button className="btn ghost" onClick={() => { onClose(); nav.push({ name: 'cardnews', tradeId: fill.id }); }}>카드뉴스</button>}
          <button className="btn primary flex" onClick={onClose}>확인</button>
        </>
      }>
        {result.error && <Notice kind="danger">{result.error}</Notice>}
        {fill && (
          <>
            <Notice kind="ok">{inst.name} {shares(fill.qty)}를 {won(fill.price)}에 모의 {verb}했어요. 실제 거래가 아니에요.</Notice>
            <dl className="kv" style={{ marginTop: 14 }}>
              <dt>체결 금액</dt><dd className="num">{won(fill.qty * fill.price)}</dd>
              <dt>체결 근거</dt><dd>{fill.basis === 'market' ? '확인 화면의 시세' : '관측 시세'}{fill.quoteTime ? ` (${formatKDateTime(fill.quoteTime)})` : ''}</dd>
              {fill.realizedPnl !== undefined && <><dt>실현손익</dt><dd className={`num ${fill.realizedPnl > 0 ? 'up' : fill.realizedPnl < 0 ? 'down' : ''}`}>{signedWon(fill.realizedPnl)}</dd></>}
              <dt>남은 모의 현금</dt><dd className="num">{won(fill.cashAfter)}</dd>
            </dl>
            {w && (
              <div className="world-pair" style={{ marginTop: 14 }}>
                <div className="world-card real" style={{ padding: 14 }}>
                  <WorldTag kind="real">{w.mine.label}</WorldTag>
                  <div className="num bold" style={{ marginTop: 6 }}>{w.mine.value !== null ? won(w.mine.value) : '—'}</div>
                  <div className="xs muted">{w.mine.note}</div>
                </div>
                <div className="world-card para" style={{ padding: 14 }}>
                  <WorldTag kind="para">{w.other.label}</WorldTag>
                  <div className="num bold" style={{ marginTop: 6 }}>{w.other.value !== null ? won(w.other.value) : '—'}</div>
                  <div className="xs muted">{w.other.note}</div>
                </div>
              </div>
            )}
            <p className="xs muted">지금은 체결 직후라 두 세계가 거의 같아요. 이후 관측된 가격으로만 차이를 보여줘요. 수수료·세금 미반영.</p>
            <Notice kind="info">카드뉴스 4장을 만들고 있어요.{state.settings.autoSendDiscord && state.settings.discordConsent ? ' 완성되면 Discord로 자동 전송돼요.' : ' Discord 전송은 카드뉴스 화면에서 할 수 있어요.'}</Notice>
          </>
        )}
        {result.order && !fill && (
          <>
            <Notice kind="info">지정가 {won(result.order.limitPrice!)}에 {shares(result.order.qty)} 모의 {verb} 주문을 걸어뒀어요.</Notice>
            <dl className="kv" style={{ marginTop: 14 }}>
              <dt>유효 거래일</dt><dd>{formatKDate(result.order.validDay, { weekday: true })}</dd>
              <dt>{side === 'buy' ? '예약된 금액' : '예약된 수량'}</dt><dd className="num">{side === 'buy' ? won(result.order.qty * result.order.limitPrice!) : shares(result.order.qty)}</dd>
            </dl>
            <p className="small ink2">가격 조건을 만족하는 시세가 확인되면 체결돼요. 그날 장 마감까지 체결되지 않으면 만료되고 예약이 풀려요. 보유·주문 화면에서 취소할 수 있어요.</p>
          </>
        )}
      </Sheet>
    );
  }

  if (step === 'confirm') {
    return (
      <Sheet title={`모의 ${verb} 주문 확인`} onClose={onClose} footer={
        <>
          <button className="btn ghost" onClick={() => setStep('form')} disabled={busy}>수정</button>
          <button className={`btn flex ${side === 'buy' ? 'danger' : 'primary'}`} onClick={submit} disabled={busy}>{busy ? '처리 중…' : `모의 ${verb}하기`}</button>
        </>
      }>
        <dl className="kv" style={{ fontSize: 16 }}>
          <dt>종목</dt><dd>{inst.name}</dd>
          <dt>주문 방식</dt><dd>{type === 'market' ? '시장가(확인 화면 시세로 체결)' : '지정가'}</dd>
          <dt>가격</dt><dd className="num">{won(price)}</dd>
          <dt>수량</dt><dd className="num">{shares(qty)}</dd>
          <dt>예상 금액</dt><dd className="num bold">{won(est)}</dd>
        </dl>
        {quote && <p className="xs muted">기준 시세 {won(quote.price)} · {formatKDateTime(quote.time)} 기준</p>}
        <Notice kind="neutral">실제 증권 계좌와 연결되지 않은 모의 주문이에요. 수수료·세금은 반영하지 않아요.</Notice>
      </Sheet>
    );
  }

  return (
    <Sheet title={`${inst.name} 모의 ${verb}`} onClose={onClose} footer={<button className={`btn block ${side === 'buy' ? 'danger' : 'primary'}`} disabled={!formOk} onClick={() => setStep('confirm')}>다음</button>}>
      <Seg label="주문 방식" value={type} onChange={setType} options={[{ value: 'market', label: '시장가' }, { value: 'limit', label: '지정가' }]} />
      {type === 'market' && !marketOpen && <div style={{ marginTop: 10 }}><Notice kind="warn">지금은 {m.status.label}이라 시장가로 주문할 수 없어요. 지정가로 예약하면 {formatKDate(m.status.orderDay)}에 유효해요.</Notice></div>}
      {type === 'market' && marketOpen && !quote && <div style={{ marginTop: 10 }}><Notice kind="warn">시세를 받지 못해 시장가 주문을 할 수 없어요.</Notice></div>}

      {type === 'limit' && (
        <div className="field">
          <span className="lab">지정 가격 <span className="muted">(호가 단위 {won(tick)})</span></span>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn ghost sm" aria-label="가격 내리기" onClick={() => setLimit((v) => Math.max(tick, roundToTick(v - tickSize(v, inst.type), inst.type)))}>−</button>
            <input className={`input num${tickOk ? '' : ' err'}`} inputMode="numeric" style={{ textAlign: 'center' }} value={limit ? limit.toLocaleString('ko-KR') : ''} onChange={(e) => setLimit(Number(e.target.value.replace(/[^\d]/g, '')) || 0)} onBlur={() => limit && setLimit(roundToTick(limit, inst.type))} aria-label="지정 가격" />
            <button className="btn ghost sm" aria-label="가격 올리기" onClick={() => setLimit((v) => roundToTick(v + tickSize(v, inst.type), inst.type))}>+</button>
          </div>
          {!tickOk && <div className="error">호가 단위에 맞지 않아요. 입력을 마치면 가까운 단위로 맞춰져요.</div>}
          {quote && <div className="hint">현재 {won(quote.price)} · {side === 'buy' ? '이 가격 이하' : '이 가격 이상'}의 시세가 확인되면 체결돼요.</div>}
        </div>
      )}

      <div className="field">
        <span className="lab">수량</span>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn ghost sm" aria-label="수량 줄이기" onClick={() => setQty((v) => Math.max(1, v - 1))}>−</button>
          <input className="input num" inputMode="numeric" style={{ textAlign: 'center' }} value={qty || ''} onChange={(e) => setQty(Math.min(1_000_000, Number(e.target.value.replace(/[^\d]/g, '')) || 0))} aria-label="수량" />
          <button className="btn ghost sm" aria-label="수량 늘리기" onClick={() => setQty((v) => v + 1)}>+</button>
        </div>
        <div className="chips">
          {[1, 5, 10].map((n) => <button key={n} className="chip" onClick={() => setQty(n)}>{n}주</button>)}
          <button className="chip" disabled={maxQty < 1} onClick={() => setQty(Math.max(1, maxQty))}>최대 {maxQty.toLocaleString('ko-KR')}주</button>
        </div>
      </div>

      <dl className="kv" style={{ marginTop: 20 }}>
        <dt>예상 주문 금액</dt><dd className="num bold">{price ? won(est) : '—'}</dd>
        {side === 'buy' ? (<><dt>주문 가능 금액</dt><dd className={`num ${est > avail ? 'up' : ''}`}>{won(avail)}</dd></>) : (<><dt>매도 가능 수량</dt><dd className={`num ${qty > availQ ? 'up' : ''}`}>{shares(availQ)}</dd></>)}
      </dl>
      {side === 'buy' && est > avail && <p className="error small">주문 가능 금액을 넘었어요.</p>}
      <p className="xs muted" style={{ marginTop: 14 }}>
        모의 체결 규칙: 시장가는 장중에 확인 화면의 시세로 체결해요. 지정가는 주문 후 관측한 시세가 조건을 만족하면 그 시세로, 장 시작 전 주문은 그날 저가(매수)·고가(매도)가 닿으면 지정가로 체결해요. 시세는 앱이 열려 있을 때 확인해요.
      </p>
    </Sheet>
  );
}
