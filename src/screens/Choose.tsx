/**
 * N7 · 결제 전 결정 플로우 (PRODUCT_SPEC §4 F2)
 *   1) 무엇을 얼마에 (숫자패드) → 2) 미래 비용 미리보기(숫자 3개) → 3) 선택 → 4) 결과
 * 참기·대안을 고르면 아낀 돈이 자유 저축(모아 통장)으로 옮겨지고, 바로 예금으로 굴려볼 수 있다.
 * 계산은 전부 src/lib/futureCost.ts (테스트: tests/futureCost.test.ts).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { formatKDate, todayKST } from '../../shared/dates';
import { BetterPrice } from '../components/BetterPrice';
import { IconCamera, IconCheck, IconChevron } from '../components/Icons';
import { usePhotoReader } from '../components/PhotoReader';
import { CtaBar, Sheet, TopBar } from '../components/ui';
import { AmountText, Button, ButtonRow, Card, Chip, Chips, NumberPad } from '../components/ds';
import { ratePct } from '../lib/bank/money';
import { getProduct } from '../lib/bank/products';
import { FREQ_LABEL, futureCost, skipsInLast30, type Frequency } from '../lib/futureCost';
import { ruleClassify } from '../lib/ml/classify';
import { addAmount, koreanWon } from '../lib/numpad';
import { WORLD_FIXED_BILLS, WORLD_SAFETY_BUFFER, transactWorldWallet, type WorldDecision, type WorldWallet } from '../lib/worldWallet';
import { useBank } from '../state/bank';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';

type Phase = 'input' | 'preview' | 'done';
type Pick = 'hold' | 'alt' | 'buy';

const fmt = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const signed = (n: number) => `${n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;
const QUICK = [5_000, 10_000, 50_000, 100_000];
const FREQS: Frequency[] = ['once', 'weekly', 'daily'];

interface Outcome {
  pick: Pick;
  title: string;
  saved: number;
  paid: number;
  moved: number;
  /** 옮기려 했지만 이번 달 쓸 수 있는 돈이 모자라서 못 옮김 */
  moveFailed: boolean;
}

export function Choose() {
  const nav = useNav();
  const { state, update } = useStore();
  const bank = useBank();
  const [phase, setPhase] = useState<Phase>('input');
  const [name, setName] = useState('');
  const [price, setPrice] = useState(0);
  const [freq, setFreq] = useState<Frequency>('once');
  const [alt, setAlt] = useState(0);
  const [altLabel, setAltLabel] = useState('');
  const [altOpen, setAltOpen] = useState(false);
  const [pick, setPick] = useState<Pick | null>(null);
  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const [error, setError] = useState('');

  const photo = usePhotoReader(({ amount, name: n }) => {
    if (amount) setPrice(Math.min(100_000_000, Math.floor(amount)));
    if (n) setName(n.slice(0, 30));
  });

  const title = name.trim() || '사고 싶은 것';
  const w = state.worldWallet;
  const fc = useMemo(
    () => futureCost({
      price,
      altPrice: alt > 0 && alt < price ? alt : 0,
      frequency: freq,
      wallet: { cash: w.cash, fixedBills: WORLD_FIXED_BILLS, safetyBuffer: WORLD_SAFETY_BUFFER },
      today: bank.today,
      ctx: bank.ctx,
      history: bank.bank.contracts,
    }),
    [price, alt, freq, w.cash, bank.today, bank.ctx, bank.bank.contracts],
  );
  const hasAlt = alt > 0 && alt < price;
  const holdName = hasAlt ? '더 싸게 산 나' : '참은 나';

  const decide = (p: Pick) => {
    const paid = p === 'buy' ? price : p === 'alt' ? alt : 0;
    const saved = price - paid;
    const realToday = todayKST();
    const decision: WorldDecision = {
      id: `choose-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title,
      price,
      paid,
      choice: p === 'buy' ? 'buy' : p === 'alt' ? 'alternative' : 'wait',
      at: bank.today === realToday ? Date.now() : Date.parse(`${bank.today}T12:00:00+09:00`),
      note: `사기 전 비교 · ${FREQ_LABEL[freq]}${p === 'alt' && altLabel ? ` · ${altLabel}` : ''}`,
    };
    const spent = transactWorldWallet(w, { type: 'spend', decision });
    if (!spent) { setError('가상 계좌 현금이 부족해서 기록하지 못했어요.'); return; }
    let next: WorldWallet = spent;
    let moved = 0;
    if (saved > 0) {
      const m = transactWorldWallet(spent, { type: 'save', amount: saved });
      if (m) {
        const moves = [...m.movements];
        moves[moves.length - 1] = { ...moves[moves.length - 1], memo: `참은 돈 모으기 · ${title}` };
        next = { ...m, movements: moves };
        moved = saved;
      }
    }
    const category = ruleClassify(title, state.categoryMemory)?.category ?? '기타';
    update((s) => ({
      ...s,
      worldWallet: next,
      spendLog: paid > 0 ? [...s.spendLog, { date: bank.today, amount: paid, category, name: p === 'alt' && altLabel ? `${title} (${altLabel})` : title, from: 'record' as const }] : s.spendLog,
    }));
    setOutcome({ pick: p, title, saved, paid, moved, moveFailed: saved > 0 && moved === 0 });
    setPhase('done');
  };

  /* ───────── 4. 결과 ───────── */
  if (phase === 'done' && outcome) return <Done o={outcome} yearNet={fc.year.net} yearProduct={fc.year.how === 'deposit' ? fc.year.productId : ''} yearLabel={freq === 'once' ? '이 돈을 1년 굴리면' : `${FREQ_LABEL[freq]} 참으면 1년 뒤`} />;

  /* ───────── 1. 입력 ───────── */
  if (phase === 'input') {
    return (
      <div className="page t-page has-cta c-page">
        <TopBar onBack={nav.pop} title="사기 전에" />
        <section className="c-input">
          <label className="c-name">
            <span className="sr-only">무엇을 사고 싶어요?</span>
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 30))} placeholder="무엇을 사고 싶어요?" autoComplete="off" enterKeyHint="next" />
          </label>
          <AmountText value={price} placeholder="얼마예요?" />
          <Chips label="빠른 금액">
            {QUICK.map((v) => <Chip key={v} onClick={() => setPrice(addAmount(price, v))}>+{v >= 10_000 ? `${v / 10_000}만` : `${v / 1000}천`}</Chip>)}
            <label className="d-chip c-photo">
              <IconCamera width={16} height={16} aria-hidden="true" />사진으로
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) void photo.read(f); e.target.value = ''; }} />
            </label>
          </Chips>
          <div className="c-freq">
            <span>얼마나 자주 사요?</span>
            <Chips label="구매 빈도">
              {FREQS.map((f) => <Chip key={f} on={freq === f} onClick={() => setFreq(f)}>{FREQ_LABEL[f]}</Chip>)}
            </Chips>
          </div>
          <div className="d-pad-dock"><NumberPad value={price} onChange={setPrice} max={100_000_000} /></div>
          <button type="button" className="c-lab-link" onClick={() => nav.push({ name: 'lab' })}>예시 상황으로 먼저 연습해 볼래요 <IconChevron width={14} height={14} /></button>
        </section>
        <CtaBar>
          <Button disabled={price <= 0} onClick={() => { setPick(null); setPhase('preview'); }}>사면 어떻게 될지 보기</Button>
        </CtaBar>
        {photo.sheet}
      </div>
    );
  }

  /* ───────── 2~3. 미래 비용 미리보기 + 선택 ───────── */
  const short = fc.buy.usable < 0;
  const yearGap = fc.year.net;
  const maxBar = Math.max(1, fc.yearSpend, yearGap);
  const p = getProduct(fc.year.productId);

  return (
    <div className="page t-page has-cta c-page">
      <TopBar onBack={() => setPhase('input')} title="미래 비용" />
      <header className="c-head">
        <button type="button" className="c-item" onClick={() => setPhase('input')} aria-label="품목과 금액 고치기">
          <b>{title}</b><span className="num">{fmt(price)} · {FREQ_LABEL[freq]}</span><em>고치기</em>
        </button>
        <h1>{freq === 'once' ? '지금 사면' : `${FREQ_LABEL[freq]} 사면`}<br />이렇게 달라져요</h1>
      </header>

      <Card className="c-nums">
        <div className="c-num">
          <span className="c-num-label">이번 달 쓸 수 있는 돈</span>
          <div className="c-num-flow">
            <span className="num muted">{signed(fc.now.usable)}</span>
            <span className="c-arrow" aria-hidden="true">→</span>
            <strong className={`num ${short ? 'neg' : ''}`}>{signed(fc.buy.usable)}</strong>
          </div>
          <p className="c-num-sub">
            {freq !== 'once' ? `이번 달 남은 ${fc.timesThisMonth}번 × ${fmt(price)} = ${fmt(fc.buy.spendThisMonth)}` : `${fmt(price)}이 바로 빠져요`}
            {short && <><br /><b className="neg">지켜둘 생활비에서 {fmt(-fc.buy.usable)}을 꺼내 써요</b></>}
          </p>
        </div>

        <div className="c-num">
          <span className="c-num-label">{formatKDate(fc.nextBillDate)} 고정지출 내고 남는 돈 <em>D-{fc.daysToBill}</em></span>
          <div className="c-two">
            <div><small>사면</small><b className={`num ${fc.buy.afterBills < 0 ? 'neg' : ''}`}>{signed(fc.buy.afterBills)}</b></div>
            <div className="on"><small>{hasAlt ? '더 싸게 사면' : '참으면'}</small><b className="num">{signed(fc.hold.afterBills)}</b></div>
          </div>
          {fc.buy.afterBills < 0 && <p className="c-num-sub"><b className="neg">월세·통신비 낼 돈이 {fmt(-fc.buy.afterBills)} 모자라요</b></p>}
        </div>
      </Card>

      <Card tone="universe" className="c-year">
        <span className="c-year-label">1년 뒤, 두 세계의 차이</span>
        <strong className="c-year-num num">{fmt(yearGap)}</strong>
        <p className="c-year-read">{yearGap > 0 ? koreanWon(yearGap) : ''}</p>
        <div className="c-bars" role="img" aria-label={`산 나는 1년 동안 ${fmt(fc.yearSpend)}을 쓰고, ${holdName}는 ${fmt(yearGap)}을 모아요`}>
          <div><small>산 나 · 1년 동안 쓴 돈</small><span><i className="buy" style={{ width: `${(100 * fc.yearSpend) / maxBar}%` }} /></span><b className="num">{fmt(fc.yearSpend)}</b></div>
          <div><small>{holdName} · 모은 돈</small><span><i className="hold" style={{ width: `${Math.max(2, (100 * yearGap) / maxBar)}%` }} /></span><b className="num">{fmt(yearGap)}</b></div>
        </div>
        {fc.year.how !== 'none' && p ? (
          <p className="c-year-note">{fc.year.how === 'deposit' ? `아낀 ${fmt(fc.savedOnce)}을 ` : `매달 ${fmt(fc.year.monthly ?? 0)}씩 `}{p.name}(연 {ratePct(fc.year.appliedRate)})에 1년 넣으면 세후 이자 +{fmt(fc.year.interest - fc.year.tax)}</p>
        ) : fc.savedOnce > 0 ? (
          <p className="c-year-note">이 금액으로 가입할 수 있는 가상 상품이 없어서 이자 없이 계산했어요.</p>
        ) : null}
      </Card>

      <Card title="어떻게 할래요?" className="c-pick-card">
        <div className="c-picks" role="radiogroup" aria-label="선택">
          <PickRow on={pick === 'hold'} onClick={() => setPick('hold')} title="이번엔 참을래요" sub={`${fmt(price)}을 자유 저축으로 옮겨요`} />
          {hasAlt ? (
            <PickRow on={pick === 'alt'} onClick={() => setPick('alt')} title={`${fmt(alt)}짜리로 살래요`} sub={`${fmt(price - alt)} 아껴요${altLabel ? ` · ${altLabel}` : ''}`} action={<button type="button" className="c-pick-edit" onClick={(e) => { e.stopPropagation(); setAltOpen(true); }}>바꾸기</button>} />
          ) : (
            <button type="button" className="c-pick add" onClick={() => setAltOpen(true)}><span className="c-plus" aria-hidden="true">+</span><span><b>더 싸게 살 방법이 있어요</b><small>대안 가격을 넣으면 비교해 줘요</small></span></button>
          )}
          <PickRow on={pick === 'buy'} onClick={() => setPick('buy')} title="그래도 살래요" sub="필요한 소비라면 괜찮아요. 가계부에 적어둘게요" />
        </div>
        {name.trim().length >= 2 && price > 0 && (
          <div className="c-better">
            <BetterPrice query={name.trim()} price={price} onUse={({ price: lp, label }) => { if (lp < price) { setAlt(lp); setAltLabel(label); setPick('alt'); } }} />
          </div>
        )}
      </Card>

      <p className="t-foot">학습용 가상 계좌 기준이에요. 실제 결제나 이체는 일어나지 않아요.</p>
      {error && <p className="t-error" role="alert">{error}</p>}

      <CtaBar>
        <Button disabled={!pick} onClick={() => pick && decide(pick)}>
          {pick === 'hold' ? `${fmt(price)} 지키기` : pick === 'alt' ? `${fmt(alt)}에 사고 ${fmt(price - alt)} 지키기` : pick === 'buy' ? '산 걸로 기록하기' : '하나를 골라 주세요'}
        </Button>
      </CtaBar>

      {altOpen && (
        <AltSheet
          max={price - 1}
          value={alt}
          label={altLabel}
          onClose={() => setAltOpen(false)}
          onSave={(v, l) => { setAlt(v); setAltLabel(l); setPick(v > 0 ? 'alt' : null); setAltOpen(false); }}
        />
      )}
    </div>
  );
}

function PickRow({ on, onClick, title, sub, action }: { on: boolean; onClick: () => void; title: string; sub: string; action?: ReactNode }) {
  return (
    <div role="radio" aria-checked={on} tabIndex={0} className={`c-pick${on ? ' on' : ''}`} onClick={onClick} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick(); } }}>
      <span className="c-radio" aria-hidden="true" />
      <span className="c-pick-main"><b>{title}</b><small>{sub}</small></span>
      {action}
    </div>
  );
}

function AltSheet({ max, value, label, onClose, onSave }: { max: number; value: number; label: string; onClose: () => void; onSave: (v: number, l: string) => void }) {
  const [v, setV] = useState(value);
  const [l, setL] = useState(label);
  const over = v > max;
  return (
    <Sheet
      title="얼마짜리로 바꿀까요?"
      onClose={onClose}
      footer={<ButtonRow>{value > 0 && <Button tone="ghost" onClick={() => onSave(0, '')}>지우기</Button>}<Button disabled={v <= 0 || over} onClick={() => onSave(v, l.trim())}>이 가격으로 비교</Button></ButtonRow>}
    >
      <AmountText value={v} tone={over ? 'error' : undefined} />
      {over && <p className="t-error">원래 가격보다 싸야 해요.</p>}
      <input className="b-input c-alt-name" value={l} onChange={(e) => setL(e.target.value.slice(0, 20))} placeholder="어떤 걸로요? (예: 작년 모델, 중고)" />
      <div className="d-pad-dock"><NumberPad value={v} onChange={setV} max={100_000_000} /></div>
    </Sheet>
  );
}

/* ───────── 결과 화면 ───────── */

function useCountUp(target: number, ms = 700) {
  const [n, setN] = useState(0);
  useEffect(() => {
    const reduce = document.documentElement.classList.contains('reduce-motion') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reduce || target <= 0) { setN(target); return; }
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setN(Math.round(target * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

function Done({ o, yearNet, yearProduct, yearLabel }: { o: Outcome; yearNet: number; yearProduct: string; yearLabel: string }) {
  const nav = useNav();
  const { state, update } = useStore();
  const bank = useBank();
  const [moved, setMoved] = useState(o.moved);
  const shown = useCountUp(o.saved);
  const skips = skipsInLast30(bank.ctx.skipDates, bank.today);
  const goal = 3;
  // 바로 굴려보기: 한 번 아낀 돈은 1년 예금, 반복이거나 예금 최소금액보다 작으면 1천 원부터 넣는 참기 챌린지 적금
  const deposit = getProduct(yearProduct);
  const product = deposit && o.saved >= deposit.minAmount ? deposit : getProduct('moa-challenge');
  const canGrow = !!product && o.saved >= product.minAmount;
  const home = () => { nav.reset(); nav.setTab('home'); };
  /** 자유 저축에 옮긴 돈을 현금으로 돌려놓고(가입은 현금에서 빠지므로) 그 금액으로 가입 화면을 연다 */
  const grow = () => {
    if (!product) return;
    if (moved > 0) update((s) => ({ ...s, worldWallet: transactWorldWallet(s.worldWallet, { type: 'withdraw', amount: moved }) ?? s.worldWallet }));
    nav.replace({ name: 'join', id: product.id, amount: o.saved });
  };

  const unmove = () => {
    const back = transactWorldWallet(state.worldWallet, { type: 'withdraw', amount: moved });
    if (!back) return;
    update((s) => ({ ...s, worldWallet: transactWorldWallet(s.worldWallet, { type: 'withdraw', amount: moved }) ?? s.worldWallet }));
    setMoved(0);
  };

  if (o.pick === 'buy') {
    return (
      <div className="page t-page has-cta c-done">
        <div className="c-done-icon buy" aria-hidden="true"><IconCheck /></div>
        <h1>산 걸로 기록했어요</h1>
        <p className="c-done-sub">{o.title} {fmt(o.paid)} · 가계부에도 적어뒀어요</p>
        <Card className="c-done-card">
          <div className="c-done-kv"><span>이번 달 쓸 수 있는 돈</span><b className="num">{signed(bank.usable)}</b></div>
          {yearNet > 0 && <div className="c-done-kv"><span>대신 참았다면 1년 뒤</span><b className="num">{fmt(yearNet)}</b></div>}
          <p className="c-done-note">잘 산 소비였는지는 일주일 뒤 평행세계 탭에서 돌아볼 수 있어요.</p>
        </Card>
        <CtaBar><ButtonRow><Button tone="ghost" onClick={() => nav.replace({ name: 'ledger' })}>가계부 보기</Button><Button onClick={home}>홈으로</Button></ButtonRow></CtaBar>
      </div>
    );
  }

  return (
    <div className="page t-page has-cta c-done">
      <div className="c-done-icon" aria-hidden="true"><IconCheck /></div>
      <h1><span className="num">{fmt(shown)}</span><br />지켰어요</h1>
      <p className="c-done-sub">{o.pick === 'alt' ? `${o.title}을 ${fmt(o.paid)}에 사고 남긴 돈이에요` : `${o.title} 대신 남긴 돈이에요`}</p>

      <Card className="c-done-card">
        {moved > 0 ? (
          <div className="c-moved">
            <span className="c-coin" aria-hidden="true" />
            <span><b>자유 저축으로 옮겼어요</b><small>모으기 탭에서 언제든 꺼낼 수 있어요</small></span>
            <button type="button" className="c-undo" onClick={unmove}>되돌리기</button>
          </div>
        ) : (
          <div className="c-moved">
            <span className="c-coin off" aria-hidden="true" />
            <span><b>{o.moveFailed ? '자유 저축으로 옮기지 못했어요' : '현금에 그대로 뒀어요'}</b><small>{o.moveFailed ? '이번 달 쓸 수 있는 돈이 모자라요. 현금에 그대로 있어요' : '쓰지 않았으니 이번 달 쓸 수 있는 돈에 남아 있어요'}</small></span>
          </div>
        )}
        <div className="c-streak">
          <div className="c-streak-head"><b>최근 30일 참기 {Math.min(skips, goal)}/{goal}번</b><small>{skips >= goal ? '참은 돈 정기예금 우대금리 +0.2%p 조건을 채웠어요' : `${goal - skips}번 더 참으면 참은 돈 정기예금 우대금리 +0.2%p`}</small></div>
          <div className="c-dots" aria-hidden="true">{Array.from({ length: goal }, (_, i) => <i key={i} className={i < skips ? 'on' : ''} />)}</div>
        </div>
        {yearNet > 0 && <div className="c-done-kv"><span>{yearLabel}</span><b className="num pos">{fmt(yearNet)}</b></div>}
      </Card>

      <CtaBar>
        <ButtonRow>
          <Button tone="ghost" onClick={home}>홈으로</Button>
          {canGrow ? <Button onClick={grow}>{product!.kind === 'deposit' ? '예금으로 굴려보기' : '적금에 넣어보기'}</Button> : <Button onClick={() => { nav.reset(); nav.setTab('save'); }}>모으기 보기</Button>}
        </ButtonRow>
      </CtaBar>
    </div>
  );
}
