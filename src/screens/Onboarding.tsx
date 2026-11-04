/**
 * 첫 실행 온보딩 — 모아의 핵심 문제(7~14일 안 필수결제 부족)를 실제 엔진으로 보여준다.
 *  0) 약속: 결제일 전에 잔고가 모자랄지 먼저 알려준다 + 믿을 수 있는 이유
 *  1) 내 결제계좌: 같은 사람, 입금만 3일 늦어지면 (assessRisk 등록 일정·입금 지연 시나리오)
 *  2) 평행세계: 사고 싶은 게 생기면 산 나와 참은 나의 1년 뒤 (futureCost)
 *  3) AI는 결제 문자를 기록으로, 계산은 코드가 (exampleParseSpend + maskText)
 *  4) 시작 방법 고르기
 * 화면 숫자는 전부 src/lib/moa 계산 결과다(하드코딩 없음). 예시 상황은 기획서 시연 시나리오와 같다.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { addDays, startOfMonth, todayKST, type ISODate } from '../../shared/dates';
import { exampleCoach } from '../lib/ai/example';
import { fallDemoProfiles } from '../lib/fallDemo';
import { Won } from '../components/ds';
import { FREQ_LABEL, futureCost, type Frequency } from '../lib/futureCost';
import { WORLD_FIXED_BILLS, WORLD_MONTHLY_INCOME, WORLD_SAFETY_BUFFER } from '../lib/worldWallet';
import { ForkChart } from './Choose';
import { assessRisk, emptyMoa, kstMs, setAnchor, upsertCard, upsertSchedule, type MoaState } from '../lib/moa';

const fmt = (n: number) => `${Math.round(Math.abs(n)).toLocaleString('ko-KR')}원`;
const dayOf = (d: ISODate) => `${Number(d.slice(8, 10))}일`;

const STEPS = 4;

/** 기획서 시연 시나리오: 잔액 15만원, 10일 알바비 20만원 입금 예정, 11일 카드값 30만원 */
function demoState(today: ISODate, month: ISODate): MoaState {
  let m = setAnchor(emptyMoa(), 150_000, kstMs(today, 9));
  m = upsertSchedule(m, { id: 'ob-in', name: '알바비', direction: 'in', amount: 200_000, recurrence: 'once', date: addDays(month, 9), essential: false, status: 'scheduled' });
  m = upsertSchedule(m, { id: 'ob-card', name: '카드값', direction: 'out', amount: 300_000, recurrence: 'once', date: addDays(month, 10), essential: true });
  m = upsertCard(m, { id: 'ob-credit', name: '신용카드', kind: 'credit', linked: false, cutoffDay: 31, payDay: 14 });
  return m;
}

function useDemo() {
  return useMemo(() => {
    const month = startOfMonth(todayKST());
    const today = addDays(month, 2);
    const state = demoState(today, month);
    const now = kstMs(today, 10);
    const base = assessRisk(state, now, today).payments.find((p) => p.key.includes('ob-card')) ?? null;
    const income = state.schedule.find((x) => x.id === 'ob-in')!;
    const card = state.schedule.find((x) => x.id === 'ob-card')!;
    return { today, base, income, card, delayDays: state.delayDays, balance: state.anchor!.balance };
  }, []);
}
type Demo = ReturnType<typeof useDemo>;

export function Onboarding({ onDone, onDemo, existingData = false }: { onDone: () => void; onDemo: (profileId: string) => Promise<void>; existingData?: boolean }) {
  const [step, setStep] = useState(0);
  const [start, setStart] = useState<'demo' | 'mine'>('demo');
  const [scenario, setScenario] = useState('U03');
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const demo = useDemo();
  const [itemId, setItemId] = useState(ITEMS[2].id);

  const next = () => setStep((s) => Math.min(STEPS - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const last = step === STEPS - 1;
  const startDemo = async () => {
    if (loadingDemo) return;
    setLoadingDemo(true);
    setDemoError(null);
    try { await onDemo(scenario); }
    catch (error) { setDemoError(error instanceof Error ? error.message : '예시 데이터를 불러오지 못했어요.'); }
    finally { setLoadingDemo(false); }
  };

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
      title: <>내 돈으로 시작할까요?</>,
      sub: '로그인이나 은행 연결은 필요 없어요. 직접 입력하거나 예시로 둘러볼 수 있어요.',
      body: <StartPick start={start} setStart={setStart} existingData={existingData} scenario={scenario} setScenario={setScenario} />,
      cta: start === 'demo' ? (existingData ? '기존 기록으로 돌아가기' : '예시로 바로 둘러보기') : '내 결제계좌 입력하기',
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
        <button
          type="button"
          className="ob-btn"
          disabled={loadingDemo}
          onClick={() => (!last ? next() : start === 'demo' ? void startDemo() : onDone())}
        >{loadingDemo ? '예시 데이터를 여는 중…' : s.cta}</button>
        {demoError && <p role="alert" className="ob-data-error">{demoError}</p>}
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
      <p className="ob-note">모두 가상의 날짜와 금액이에요. 실제 결제계좌를 연결하지 않고도 입력한 일정으로 잔액을 계산할 수 있어요.</p>
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
  const day = addDays(startOfMonth(todayKST()), 9);
  const fc = useMemo(() => futureCost({
    price: item.price, frequency: item.freq, today: day,
    wallet: { cash: WORLD_MONTHLY_INCOME, fixedBills: WORLD_FIXED_BILLS, safetyBuffer: WORLD_SAFETY_BUFFER },
  }), [item, day]);
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
  const count = item.id === 'latte' ? 9 : item.id === 'buds' ? 1 : 4;
  const usableNow = 120_000; // synthetic, explicitly labeled in the UI
  const today = addDays(startOfMonth(todayKST()), 9);
  const outcome = futureCost({
    price: item.price,
    frequency: item.freq,
    today,
    wallet: { cash: WORLD_MONTHLY_INCOME, fixedBills: WORLD_FIXED_BILLS, safetyBuffer: WORLD_SAFETY_BUFFER },
  });
  const explanation = exampleCoach({
    item: item.name,
    category,
    price: item.price,
    frequency: item.freq,
    usableNow,
    usableAfter: usableNow - item.price,
    afterBills: usableNow - item.price,
    yearGap: outcome.year.net,
    categoryCount30: count,
    categorySpentThisMonth: count * item.price,
  });
  return (
    <>
      <div className="ob-insight-summary">
        <span className="ob-insight-overline">예시 사용자의 지난 30일</span>
        <div className="ob-insight-row">
          <span>{category} 지출</span>
          <strong className="num">{count}회 · {fmt(count * item.price)}</strong>
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
function StartPick({ start, setStart, existingData, scenario, setScenario }: { start: 'demo' | 'mine'; setStart: (v: 'demo' | 'mine') => void; existingData: boolean; scenario: string; setScenario: (id: string) => void }) {
  return (
    <>
      <div className="ob-start" role="radiogroup" aria-label="시작 방법">
        <button type="button" role="radio" aria-checked={start === 'demo'} className={start === 'demo' ? 'on' : ''} onClick={() => setStart('demo')}>
          <span className="tag">추천</span>
          <b>{existingData ? '지금 내 기록으로 돌아가기' : '예시로 먼저 둘러보기'}</b>
          <small>{existingData ? '이미 저장한 기록과 평행세계 가상 자산은 그대로 유지해요.' : '가상의 생활비와 결제 일정이 채워진 상태로 앱을 체험해요.'}</small>
        </button>
        <button type="button" role="radio" aria-checked={start === 'mine'} className={start === 'mine' ? 'on' : ''} onClick={() => setStart('mine')}>
          <b>{existingData ? '내 결제계좌 설정 다시 보기' : '내 결제계좌로 시작하기'}</b>
          <small>{existingData ? '기존 기록을 지우지 않고 결제계좌 잔액과 예정 결제를 확인해요.' : '잔액과 가장 가까운 필수결제 한 건만 입력하면 바로 시작해요.'}</small>
        </button>
      </div>
      {start === 'demo' && !existingData && (
        <details className="ob-scenario-panel">
          <summary>팀 테스트용 예시 시나리오 선택</summary>
          <label htmlFor="fall-scenario-select">가상 사용자 10명 중 선택</label>
          <select id="fall-scenario-select" aria-label="테스트 시나리오" value={scenario} onChange={(e) => setScenario(e.target.value)}>
            {fallDemoProfiles().map((p) => <option key={p.id} value={p.id}>{p.id} · {p.title} · {p.scenario}</option>)}
          </select>
          <small>2026.09.11~12.11 공통 합성 데이터 · 관측 기록은 11월 3일까지 · 실제 사용자가 아니에요.</small>
        </details>
      )}
      <p className="ob-note">{existingData ? '소개를 다시 보는 동안 기존 데이터는 지우지 않아요.' : '예시는 가상 돈으로 시작해요. 내 정보를 처음 입력하면 그 잔액을 평행세계 투자 지갑에도 반영해요.'}</p>
    </>
  );
}
