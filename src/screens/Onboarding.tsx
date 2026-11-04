/**
 * 첫 실행 온보딩 — 모아의 핵심 문제(7~14일 안 필수결제 부족)를 실제 엔진으로 보여준다.
 *  0) 약속: 결제일 전에 잔고가 모자랄지 먼저 알려준다 + 믿을 수 있는 이유
 *  1) 내 결제계좌: 같은 사람, 입금만 3일 늦어지면 (assessRisk 등록 일정·입금 지연 시나리오)
 *  2) 평행세계: 사고 싶은 게 생기면 산 나와 참은 나의 1년 뒤 (futureCost)
 *  3) AI는 결제 문자를 기록으로, 계산은 코드가 (exampleParseSpend + maskText)
 *  4) 시작 방법 고르기
 * 화면 숫자는 2026-11-04 S01 공용 합성 원장과 src/lib/moa 계산 결과를 따른다.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { addDays, todayKST, type ISODate } from '../../shared/dates';
import { exampleCoach } from '../lib/ai/example';
import { Won } from '../components/ds';
import { FREQ_LABEL, futureCost, type Frequency } from '../lib/futureCost';
import { WORLD_SAFETY_BUFFER, walletSummary } from '../lib/worldWallet';
import { demoData } from '../lib/demo';
import { demoWorldWalletFromShared } from '../lib/demoWorld';
import { ForkChart } from './Choose';
import { assessRisk } from '../lib/moa';
import { demoMoa } from '../lib/moa/bridge';

const fmt = (n: number) => `${Math.round(Math.abs(n)).toLocaleString('ko-KR')}원`;
const dayOf = (d: ISODate) => `${Number(d.slice(8, 10))}일`;

const STEPS = 4;

/** Onboarding presents the SAME S01 fixture that opens in the app.
 * This preview is anchored to the synthetic 2026-11-04 snapshot, not an
 * invented 150,000 KRW account with an unrelated 300,000 KRW card bill.
 */
const S01_SNAPSHOT_AT = Date.parse('2026-11-04T14:30:00+09:00');
function useDemo() {
  return useMemo(() => {
    const now=S01_SNAPSHOT_AT;
    const today=todayKST(new Date(now));
    const state=demoMoa(now);
    const report=assessRisk(state,now,today);
    const payment=report.payments.find(p=>p.date==='2026-11-14'&&p.name.includes('신용')) ??
      report.payments.find(p=>p.name.includes('카드'));
    const income=state.schedule.find(s=>s.id==='S01-income');
    if (!payment || !income) throw new Error('S01 demonstration income/card schedule missing');
    return {
      today, base:payment,
      income:{...income,date:today.slice(0,7)+'-'+String(income.day).padStart(2,'0')},
      card:{name:payment.name,date:payment.date,amount:payment.amount},
      delayDays:state.delayDays,
      balance:state.anchor!.balance,
    };
  },[]);
}
type Demo = ReturnType<typeof useDemo>;

export function Onboarding({ onDone, onDemo, existingData = false }: { onDone: () => void; onDemo: () => void; existingData?: boolean }) {
  const [step, setStep] = useState(0);
  const [start, setStart] = useState<'demo' | 'mine'>('demo');
  const demo = useDemo();
  const [itemId, setItemId] = useState(ITEMS[2].id);

  const next = () => setStep((s) => Math.min(STEPS - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const last = step === STEPS - 1;

  const screens: { kicker: string; title: ReactNode; sub: ReactNode; body: ReactNode; cta: string }[] = [
    {
      kicker: '모아 · 결제일 먼저',
      title: <>결제일에 돈이 모자랄까?<br />미리 비교해 봐요</>,
      sub: '입금이 조금만 늦어져도 카드값을 못 낼 수 있어요. 아래 예시에서 입금 날짜를 바꿔 보세요.',
      body: <PayDay demo={demo} />,
      cta: '소비 선택도 비교해 보기',
    },
    {
      kicker: '1 · 산 나와 안 산 나',
      title: <>하나의 선택으로<br />두 미래를 비교해요</>,
      sub: '구매·보류에 따라 1년 뒤 가상 자산이 얼마나 달라지는지 직접 살펴보세요.',
      body: <World itemId={itemId} setItemId={setItemId} />,
      cta: '모아의 소비 분석 보기',
    },
    {
      kicker: '2 · 소비 패턴 분석',
      title: <>내 소비를 이해하고,<br />더 나은 선택을 찾도록</>,
      sub: '반복 지출과 다음 결제일을 함께 살펴보고, 지금 구매할 때와 미룰 때의 차이를 설명해요.',
      body: <AiDecisionDemo itemId={itemId} />,
      cta: '모아 시작하기',
    },
    {
      kicker: '이제 시작해요',
      title: <>{existingData ? '기존 기록을 이어서 볼까요?' : '일단 예시로 체험해 볼까요?'}</>,
      sub: existingData ? '저장된 기록은 그대로 두고 이어서 볼 수 있어요.' : '가입이나 계좌 연결 없이 예시 데이터를 불러와 먼저 써 볼 수 있어요. 직접 입력은 나중에 해도 돼요.',
      body: <StartPick start={start} setStart={setStart} existingData={existingData} />,
      cta: start === 'demo' ? (existingData ? '기존 기록으로 돌아가기' : '일단 예시 데이터로 시작하기') : existingData ? '현재 결제계좌 설정 확인하기' : '내 정보 직접 입력하기',
    },
  ];
  const s = screens[step];

  return (
    <div className={`ob ob-step-${step}`} aria-roledescription="소개" aria-label={`${STEPS}단계 중 ${step + 1}단계`}>
      <div className="ob-top">
        <button type="button" className="ob-back" onClick={back} disabled={step === 0} aria-label="이전">‹</button>
        <div className="ob-progress" style={{ gridTemplateColumns: `repeat(${STEPS}, 1fr)` }} aria-hidden="true">{Array.from({ length: STEPS }, (_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
        <button type="button" className="ob-skip" onClick={() => setStep(STEPS - 1)} style={{ visibility: last ? 'hidden' : 'visible' }}>건너뛰기</button>
      </div>

      <main className="ob-main" key={step}>
        <span className="ob-kicker">{s.kicker}</span>
        <h1>{s.title}</h1>
        <p className="ob-sub">{s.sub}</p>
        <div className="ob-body">{s.body}</div>
      </main>

      <div className="ob-cta">
        {step === 0 ? (
          <>
            <button type="button" className="ob-btn" onClick={onDemo}>
              {existingData ? '기존 기록으로 돌아가기' : '일단 예시 데이터로 시작하기'}
            </button>
            <button type="button" className="ob-secondary" onClick={next}>기능 설명 먼저 보기</button>
          </>
        ) : (
          <button
            type="button"
            className="ob-btn"
            onClick={() => (!last ? next() : start === 'demo' ? onDemo() : onDone())}
          >{s.cta}</button>
        )}
      </div>
    </div>
  );
}

/* ───────── 1. 입금 지연 ───────── */
function PayDay({ demo }: { demo: Demo }) {
  const [late, setLate] = useState(false);
  const bal = demo.base ? (late ? demo.base.balances.delay : demo.base.balances.registered) : 0;
  const inDate = late ? addDays(demo.income.date!, demo.delayDays) : demo.income.date!;
  return (
    <>
      <div className="ob-seg" role="radiogroup" aria-label="입금 상황">
        <button type="button" role="radio" aria-checked={!late} className={!late ? 'on' : ''} onClick={() => setLate(false)}>입금 예정대로</button>
        <button type="button" role="radio" aria-checked={late} className={late ? 'on' : ''} onClick={() => setLate(true)}>입금 {demo.delayDays}일 늦음</button>
      </div>
      <div className="ob-card ob-pay">
        <dl>
          <div><dt>지금 결제계좌</dt><dd className="num">{fmt(demo.balance)}</dd></div>
          <div className={late ? 'moved' : ''}><dt>{dayOf(inDate)} {demo.income.name} 입금{late ? ' (카드값 뒤)' : ''}</dt><dd className="num pos">+{fmt(demo.income.amount)}</dd></div>
          <div><dt>{dayOf(demo.card.date!)} {demo.card.name}</dt><dd className="num">−{fmt(demo.card.amount)}</dd></div>
        </dl>
        <div className={`ob-pay-result ${bal < 0 ? 'short' : 'ok'}`} aria-live="polite">
          <small>{dayOf(demo.card.date!)} {demo.card.name} 직후</small>
          <strong className="num">{bal < 0 ? `${fmt(bal)} 모자라요` : `${fmt(bal)} 남아요`}</strong>
        </div>
      </div>
      <p className="ob-note">2026년 11월 4일 S01 합성 데이터와 같은 잔액·입금 일정·카드 결제일이에요. 실제 계좌는 연결하지 않아요.</p>
    </>
  );
}

/* ───────── 2. 평행세계 ───────── */
const ITEMS: { id: string; emoji: string; name: string; price: number; freq: Frequency }[] = [
  { id: 'latte', emoji: '☕️', name: '카페 라떼', price: 4_500, freq: 'daily' },
  { id: 'buds', emoji: '🎧', name: '무선 이어폰', price: 159_000, freq: 'once' },
  { id: 'delivery', emoji: '🍗', name: '배달 치킨', price: 24_000, freq: 'weekly' },
];

function World({ itemId, setItemId }: { itemId: string; setItemId: (id: string) => void }) {
  const item = ITEMS.find((i) => i.id === itemId)!;
  const wallet=useMemo(()=>demoWorldWalletFromShared(S01_SNAPSHOT_AT),[]);
  const day=todayKST(new Date(S01_SNAPSHOT_AT));
  const fc=useMemo(()=>futureCost({
    price:item.price, frequency:item.freq, today:day,
    wallet:{cash:wallet.cash,fixedBills:wallet.fixedBills??0,safetyBuffer:WORLD_SAFETY_BUFFER},
  }),[item,day,wallet]);
  return (
    <>
      <div className="ob-items" role="radiogroup" aria-label="예시 고르기">
        {ITEMS.map((i) => (
          <button key={i.id} type="button" role="radio" aria-checked={i.id === itemId} className={i.id === itemId ? 'on' : ''} onClick={() => setItemId(i.id)}>
            <span className="e" aria-hidden="true">{i.emoji}</span>
            <b>{i.name}</b>
            <small className="num">{fmt(i.price)} · {FREQ_LABEL[i.freq]}</small>
          </button>
        ))}
      </div>
      <div className="ob-card ob-fork">
        <div className="ob-fork-head">
          <span>1년 뒤 두 세계 차이</span>
          <strong className="num" key={item.id}><Won n={fc.year.net} /></strong>
        </div>
        <ForkChart key={item.id} spend={fc.yearSpend} keep={fc.year.net} holdName="참은 나" />
      </div>
      <p className="ob-note">가상 투자에 쓴 금액은 현금에서 빠지고, 매도 체결 전까지는 생활비로 사용할 수 없어요.</p>
    </>
  );
}

/* ───────── 2. 소비 선택 분석 (가상 데이터로 화면 체험) ───────── */
/**
 * Onboarding never presents a rules fallback as a live LLM result.
 * The example uses the same decision-coaching fallback available in the app,
 * with synthetic spending observations and a calculation from futureCost.
 */
function AiDecisionDemo({ itemId }: { itemId: string }) {
  const item = ITEMS.find((i) => i.id === itemId)!;
  const category = item.id === 'latte' ? '카페' : item.id === 'buds' ? '쇼핑' : '식비';
  const day=todayKST(new Date(S01_SNAPSHOT_AT));
  const since=addDays(day,-29);
  const records=demoData(S01_SNAPSHOT_AT).spendLog
    .filter(x=>x.date>=since&&x.date<=day&&x.category===category);
  const count=records.length;
  const observedSpend=records.reduce((sum,x)=>sum+x.amount,0);
  const wallet=demoWorldWalletFromShared(S01_SNAPSHOT_AT);
  const summary=walletSummary(wallet);
  const usableNow=Math.max(0,summary.monthlyUsable);
  const outcome=futureCost({
    price:item.price,frequency:item.freq,today:day,
    wallet:{cash:wallet.cash,fixedBills:wallet.fixedBills??0,safetyBuffer:WORLD_SAFETY_BUFFER},
  });
  const explanation = exampleCoach({
    item: item.name,
    category,
    price: item.price,
    frequency: item.freq,
    usableNow,
    usableAfter: usableNow - item.price,
    afterBills: summary.afterBills - item.price,
    yearGap: outcome.year.net,
    categoryCount30: count,
    categorySpentThisMonth: observedSpend,
  });
  return (
    <>
      <div className="ob-insight-summary">
        <span className="ob-insight-overline">예시 사용자의 지난 30일</span>
        <div className="ob-insight-row">
          <span>{category} 지출</span>
          <strong className="num">{count}회 · {fmt(observedSpend)}</strong>
        </div>
        <div className="ob-insight-row">
          <span>남은 가상 소비 가능 금액</span>
          <strong className="num">{fmt(usableNow)}</strong>
        </div>
      </div>
      <div className="ob-card ob-insight-result">
        <span className="ob-insight-overline">선택에 도움을 주는 분석 예시</span>
        <h2>지금 {item.name}을 사면 어떨까요?</h2>
        <p>{explanation.message}</p>
        {explanation.tip && <div className="ob-insight-tip"><b>고려할 대안</b><span>{explanation.tip}</span></div>}
      </div>
      <p className="ob-note">가상의 지출 기록으로 만든 체험 화면이에요. 실제 개인별 예측·AI 기능은 입력된 자료와 이용 가능한 분석 방식에 따라 달라져요.</p>
    </>
  );
}

/* ───────── 4. 시작 ───────── */
function StartPick({ start, setStart, existingData }: { start: 'demo' | 'mine'; setStart: (v: 'demo' | 'mine') => void; existingData: boolean }) {
  return (
    <>
      <div className="ob-start" role="radiogroup" aria-label="시작 방법">
        <button type="button" role="radio" aria-checked={start === 'demo'} className={start === 'demo' ? 'on' : ''} onClick={() => setStart('demo')}>
          <span className="tag">추천</span>
          <b>{existingData ? '기존 기록으로 돌아가기' : '일단 예시 데이터로 시작하기'}</b>
          <small>{existingData ? '이미 저장한 기록과 평행세계 가상 자산은 그대로 유지해요.' : '가상의 생활비와 결제 일정이 채워진 상태로 앱을 체험해요.'}</small>
        </button>
        <button type="button" role="radio" aria-checked={start === 'mine'} className={start === 'mine' ? 'on' : ''} onClick={() => setStart('mine')}>
          <b>{existingData ? '현재 결제계좌 설정 확인하기' : '내 정보 직접 입력하기'}</b>
          <small>{existingData ? '기존 기록은 지우지 않고 잔액과 예정 결제만 확인해요.' : '예시 데이터 없이 내 잔액과 결제일을 직접 입력해요.'}</small>
        </button>
      </div>
      <p className="ob-note">{existingData ? '소개를 다시 보는 동안 기존 데이터는 지우지 않아요.' : '예시는 가상 돈으로 시작해요. 내 정보를 처음 입력하면 그 잔액을 평행세계 투자 지갑에도 반영해요.'}</p>
    </>
  );
}
