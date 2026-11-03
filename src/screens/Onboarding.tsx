/**
 * 첫 실행 온보딩 — 모아의 핵심 문제(7~14일 안 필수결제 부족)를 실제 엔진으로 보여준다.
 *  0) 약속: 결제일 전에 잔고가 모자랄지 먼저 알려준다 + 믿을 수 있는 이유
 *  1) 같은 사람, 입금만 3일 늦어지면 (assessRisk 등록 일정·입금 지연 시나리오)
 *  2) 체크카드는 오늘, 신용카드는 청구일에 (billingDate + extraLines)
 *  3) AI는 결제 문자를 기록으로, 계산은 코드가 (exampleParseSpend + maskText)
 *  4) 시작 방법 고르기
 * 화면 숫자는 전부 src/lib/moa 계산 결과다(하드코딩 없음). 예시 상황은 기획서 시연 시나리오와 같다.
 */
import { useMemo, useState, type ReactNode } from 'react';
import { addDays, startOfMonth, todayKST, type ISODate } from '../../shared/dates';
import { maskText } from '../../shared/mask';
import { AiMark } from '../components/Ai';
import { Logo } from '../components/Glyph';
import { exampleNow } from '../lib/ai';
import { assessRisk, billingDate, emptyMoa, kstMs, setAnchor, upsertCard, upsertSchedule, type Line, type MoaState } from '../lib/moa';

const fmt = (n: number) => `${Math.round(Math.abs(n)).toLocaleString('ko-KR')}원`;
const dayOf = (d: ISODate) => `${Number(d.slice(8, 10))}일`;
const mdOf = (d: ISODate) => `${Number(d.slice(5, 7))}월 ${Number(d.slice(8, 10))}일`;

const STEPS = 5;
const BUY = 24_000;

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
    const pay = (extra?: Line[]) => assessRisk(state, now, today, extra ? { extraLines: extra } : {}).payments.find((p) => p.key.includes('ob-card')) ?? null;
    const credit = state.cards[0];
    const bill = billingDate(credit, today);
    const base = pay();
    const debit = pay([{ date: today, amount: -BUY, label: '살까 말까', source: 'txn', certainty: 'confirmed', essential: false }]);
    const onCredit = pay([{ date: bill, amount: -BUY, label: '살까 말까', source: 'card_bill', certainty: 'confirmed', essential: false, cardId: credit.id }]);
    const income = state.schedule.find((x) => x.id === 'ob-in')!;
    const card = state.schedule.find((x) => x.id === 'ob-card')!;
    return { today, base, debit, onCredit, bill, income, card, delayDays: state.delayDays, balance: state.anchor!.balance };
  }, []);
}
type Demo = ReturnType<typeof useDemo>;

export function Onboarding({ onDone, onDemo }: { onDone: () => void; onDemo: () => void }) {
  const [step, setStep] = useState(0);
  const [agree, setAgree] = useState(true);
  const [start, setStart] = useState<'demo' | 'mine'>('demo');
  const demo = useDemo();

  const next = () => setStep((s) => Math.min(STEPS - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const last = step === STEPS - 1;

  const screens: { kicker: string; title: ReactNode; sub: ReactNode; body: ReactNode; cta: string }[] = [
    {
      kicker: '20대를 위한 결제일 부족 예측',
      title: <>결제일 전에,<br />잔고가 모자랄지<br />먼저 알려줘요</>,
      sub: '월세·카드값 나가는 날 결제계좌에 돈이 있을지, 앞으로 2주를 미리 계산해요.',
      body: <Pledge />,
      cta: '어떻게 계산하는지 볼게요',
    },
    {
      kicker: '1 · 입금이 늦어지면',
      title: <>같은 사람이어도<br />입금 날짜에 따라 달라져요</>,
      sub: `입금이 ${demo.delayDays}일만 늦어져도 카드값 날 잔고가 모자랄 수 있어요. 아래를 눌러 비교해 보세요.`,
      body: <PayDay demo={demo} />,
      cta: '다음',
    },
    {
      kicker: '2 · 결제 수단',
      title: <>체크카드는 오늘,<br />신용카드는 청구일에 빠져요</>,
      sub: `${fmt(BUY)}짜리를 살 때 무엇으로 결제하느냐에 따라 ${dayOf(demo.card.date!)} 잔고가 달라져요.`,
      body: <PayMethod demo={demo} />,
      cta: '다음',
    },
    {
      kicker: '3 · 모아 AI',
      title: <>결제 문자는 AI가 정리하고,<br />계산은 앱이 해요</>,
      sub: '번호·이름을 가린 문장만 AI가 읽어 거래로 정리해요. 잔고와 위험 등급은 AI가 아니라 계산 엔진이 정해요.',
      body: <AiDemo />,
      cta: '다음',
    },
    {
      kicker: '시작하기',
      title: <>어떻게 시작할까요?</>,
      sub: '로그인도, 계좌 연결도 필요 없어요.',
      body: <StartPick start={start} setStart={setStart} agree={agree} setAgree={setAgree} />,
      cta: start === 'demo' ? '예시로 둘러보기' : '내 결제계좌 입력하기',
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
          disabled={last && start === 'mine' && !agree}
          onClick={() => (!last ? next() : start === 'demo' ? onDemo() : onDone())}
        >{s.cta}</button>
      </div>
    </div>
  );
}

/* ───────── 0. 약속 ───────── */
function Pledge() {
  return (
    <>
      <div className="ob-hero" aria-hidden="true">
        <div className="ob-hero-logo"><Logo size={40} /><b>모아</b></div>
        <svg viewBox="0 0 300 140" className="ob-hero-fork">
          <line x1="16" y1="96" x2="284" y2="96" className="ob-zero" />
          <path d="M16 52 C 90 52, 130 70, 170 60 S 240 40, 284 30" className="k" pathLength={1} />
          <path d="M16 52 C 90 52, 130 70, 170 84 S 240 124, 284 124" className="b" pathLength={1} />
          <circle cx="16" cy="52" r="6" className="o" />
          <circle cx="284" cy="30" r="7" className="k-dot" />
          <circle cx="284" cy="124" r="7" className="b-dot" />
          <text x="276" y="20" textAnchor="end" className="t">입금 제때</text>
          <text x="210" y="134" textAnchor="end" className="t">입금 늦음 · 부족</text>
          <text x="16" y="40" className="t">오늘</text>
          <text x="284" y="90" textAnchor="end" className="t">0원</text>
        </svg>
      </div>
      <ul className="ob-trust">
        <li><span className="ob-ic">₩</span><span><b>계좌를 연결하지 않아요</b><small>결제계좌 잔액과 결제 일정만 직접 넣거나 결제 문자로 채워요.</small></span></li>
        <li><span className="ob-ic">⌂</span><span><b>기록은 이 기기에만</b><small>로그인 없이 쓰고, 언제든 지울 수 있어요.</small></span></li>
        <li><span className="ob-ic">=</span><span><b>근거를 다 보여줘요</b><small>어떤 입출금 때문에 모자라는지 날짜별로 확인할 수 있어요.</small></span></li>
      </ul>
    </>
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
      <p className="ob-note">모아는 이런 상황을 결제일 7일·3일 전에 알려주고, 무엇을 바꾸면 되는지 선택지를 보여줘요. 추가 변동 지출이 없다고 둔 단순 예시예요.</p>
    </>
  );
}

/* ───────── 2. 결제 수단 ───────── */
function PayMethod({ demo }: { demo: Demo }) {
  const [m, setM] = useState<'debit' | 'credit'>('debit');
  const p = m === 'debit' ? demo.debit : demo.onCredit;
  const bal = p?.balances.registered ?? 0;
  const before = demo.base?.balances.registered ?? 0;
  return (
    <>
      <div className="ob-seg" role="radiogroup" aria-label="결제 수단">
        <button type="button" role="radio" aria-checked={m === 'debit'} className={m === 'debit' ? 'on' : ''} onClick={() => setM('debit')}>체크카드</button>
        <button type="button" role="radio" aria-checked={m === 'credit'} className={m === 'credit' ? 'on' : ''} onClick={() => setM('credit')}>신용카드</button>
      </div>
      <div className="ob-card ob-pay">
        <dl>
          <div><dt>{fmt(BUY)} 결제가 빠지는 날</dt><dd>{m === 'debit' ? '오늘' : `${mdOf(demo.bill)} (청구일)`}</dd></div>
          <div><dt>{dayOf(demo.card.date!)} {demo.card.name} 직후 · 사기 전</dt><dd className="num">{fmt(before)}</dd></div>
        </dl>
        <div className={`ob-pay-result ${bal < 0 ? 'short' : 'ok'}`} aria-live="polite">
          <small>{dayOf(demo.card.date!)} {demo.card.name} 직후 · 산 뒤</small>
          <strong className="num">{bal < 0 ? `${fmt(bal)} 모자라요` : `${fmt(bal)} 남아요`}</strong>
        </div>
      </div>
      <p className="ob-note">신용카드는 지금 잔고를 지켜주지만 {mdOf(demo.bill)} 청구액에 더해져요. 모아는 그 청구일까지 함께 계산해요.</p>
    </>
  );
}

/* ───────── 3. AI ───────── */
const SAMPLE_SMS = '[Web발신]\n신한카드(1234)승인\n김*현님\n6,800원 일시불\n10/29 08:42\n메가커피 서울여대점\n누적 412,300원';

function AiDemo() {
  const masked = useMemo(() => maskText(SAMPLE_SMS).text, []);
  const parsed = useMemo(() => exampleNow('parseSpend', { text: masked, today: todayKST() }).items[0], [masked]);
  const METHOD: Record<string, string> = { credit: '신용카드', debit: '체크카드', transfer: '계좌이체', cash: '현금', atm: 'ATM' };
  return (
    <>
      <div className="ob-split">
        <div className="ob-split-k ai"><small>AI가 정리</small><b>결제 문자 → 날짜·금액·결제 수단</b></div>
        <span aria-hidden="true">→</span>
        <div className="ob-split-k"><small>앱이 계산</small><b>결제일 잔고 · 위험 등급</b></div>
      </div>
      <div className="ob-card ob-sms"><small>가린 뒤 AI에게 보내는 문장</small><pre>{masked}</pre></div>
      {parsed && (
        <div className="ob-card ob-ai ok">
          <div className="ob-ai-head"><AiMark /><b>거래로 정리</b><span>확인 후 저장</span></div>
          <dl className="ob-parsed">
            <div><dt>가게</dt><dd>{parsed.name}</dd></div>
            <div><dt>금액</dt><dd className="num">{fmt(parsed.amount)}</dd></div>
            <div><dt>결제 수단</dt><dd>{parsed.method ? METHOD[parsed.method] : '확인 필요'}</dd></div>
            <div><dt>날짜</dt><dd>{parsed.date ?? '확인 필요'}</dd></div>
          </dl>
        </div>
      )}
      <p className="ob-note">AI가 읽은 결과는 저장 전에 직접 확인해요. 같은 문자를 다시 붙여넣어도 한 번만 저장돼요.</p>
    </>
  );
}

/* ───────── 4. 시작 ───────── */
function StartPick({ start, setStart, agree, setAgree }: { start: 'demo' | 'mine'; setStart: (v: 'demo' | 'mine') => void; agree: boolean; setAgree: (v: boolean) => void }) {
  return (
    <>
      <div className="ob-start" role="radiogroup" aria-label="시작 방법">
        <button type="button" role="radio" aria-checked={start === 'demo'} className={start === 'demo' ? 'on' : ''} onClick={() => setStart('demo')}>
          <span className="tag">추천</span>
          <b>예시로 먼저 둘러보기</b>
          <small>대학생 한 명의 결제계좌·카드·일정과 3개월 기록이 채워진 상태로 시작해요.</small>
        </button>
        <button type="button" role="radio" aria-checked={start === 'mine'} className={start === 'mine' ? 'on' : ''} onClick={() => setStart('mine')}>
          <b>내 결제계좌로 시작하기</b>
          <small>결제계좌 잔액과 가장 가까운 필수결제 1건만 넣으면 바로 계산해요.</small>
        </button>
      </div>
      {start === 'mine' && (
        <label className="ob-agree">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>입력한 금액은 이 기기에만 저장되고, 은행 계좌와 연결하지 않는다는 걸 확인했어요.</span>
        </label>
      )}
      <p className="ob-note">예시로 시작해도 더보기 › 결제계좌·일정 관리에서 언제든 내 정보로 바꿀 수 있어요.</p>
    </>
  );
}
