/**
 * 첫 실행 온보딩 (v20) — 공모전 핵심 흐름인 '14일 필수결제 부족 탐지'를 먼저 보여준다.
 *  0) MOA · AI 현금흐름 코치: 다음 결제일, 내 통장에 돈이 충분할까요?
 *  1) 결제일 하루의 부족: 입금이 사흘 늦으면 감당하던 카드값이 모자라는 장면
 *  2) 결제 전 선택 비교: 같은 2만4천원도 결제 수단에 따라 결과가 달라짐
 *  3) 숫자는 코드, 기록 정리는 AI: 결제 문자 마스킹 → 구조화
 *  4) 위험 등급과 기록 신뢰도를 나눠 보여줌
 *  5) 시작 방법 고르기
 * 1년 뒤 자산 비교·가상 예금은 앱 안 보조 기능으로 남기고 첫 진입에서는 뺐다.
 * 예시 숫자는 아래 상수로 계산한다(결과값 하드코딩 없음).
 */
import { useState, type ReactNode } from 'react';
import { AiMark } from '../components/Ai';
import { Logo } from '../components/Glyph';

const fmt = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const signed = (n: number) => `${n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;

/** 기획서 문제 정의의 가상 예시: 잔액 15만원, 10일 알바비 20만원, 11일 카드값 30만원 */
const EX = { balance: 150_000, income: 200_000, incomeDay: 10, payName: '카드값', payAmount: 300_000, payDay: 11, delay: 3 };
const BUY = { name: '배달 주문', amount: 24_000 };

/** 결제일 출금 직후 잔고 (입금이 결제일 이전·당일이면 반영) */
function balanceOnPayDay(delay: number, extraOut = 0) {
  const arrives = EX.incomeDay + delay <= EX.payDay;
  return EX.balance + (arrives ? EX.income : 0) - EX.payAmount - extraOut;
}

const STEPS = 6;

export function Onboarding({ onDone, onDemo }: { onDone: () => void; onDemo: () => void }) {
  const [step, setStep] = useState(0);
  const [agree, setAgree] = useState(true);
  const [start, setStart] = useState<'demo' | 'mine'>('demo');

  const next = () => setStep((s) => Math.min(STEPS - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const last = step === STEPS - 1;

  const screens: { kicker: string; title: ReactNode; sub: ReactNode; body: ReactNode; cta: string }[] = [
    {
      kicker: 'MOA · AI 현금흐름 코치',
      title: <>다음 결제일,<br />내 통장에 돈이<br />충분할까요?</>,
      sub: '다가오는 14일의 필수결제를 확인하고, 입금 지연이나 새로운 소비에 따른 잔액 변화를 미리 비교해 보세요.',
      body: <Pledge />,
      cta: '어떻게 알려주는지 볼게요',
    },
    {
      kicker: '1 · 결제일 하루의 부족',
      title: <>이번 달 지출이 아니라<br />결제일 잔고를 봐요</>,
      sub: `알바비가 ${EX.incomeDay}일에 들어오고 ${EX.payDay}일에 ${EX.payName}이 빠져나가는 상황이에요. 입금 날짜를 바꿔 보세요.`,
      body: <PayDay />,
      cta: '다음',
    },
    {
      kicker: '2 · 결제 전에',
      title: <>사기 전에 넣어 보면<br />결제일 잔고가 갈라져요</>,
      sub: '같은 금액이어도 체크카드인지 신용카드인지에 따라 돈이 빠지는 날이 달라요.',
      body: <Choice />,
      cta: '다음',
    },
    {
      kicker: '3 · 모아 AI',
      title: <>숫자는 앱이 계산하고,<br />기록 정리는 AI가 해요</>,
      sub: '결제 문자를 붙여넣으면 개인정보를 먼저 가린 뒤, AI가 금액·날짜·결제 수단을 뽑아요. 잔고와 경고 등급은 계산 엔진이 정해요.',
      body: <AiDemo />,
      cta: '다음',
    },
    {
      kicker: '4 · 믿을 수 있는 경고',
      title: <>얼마나 위험한지와<br />얼마나 믿을 만한지를<br />따로 보여줘요</>,
      sub: '잔액을 오래 확인하지 않았거나 기록이 빠진 것 같으면, 경고를 키우지 않고 확인을 먼저 부탁해요.',
      body: <Trust />,
      cta: '다음',
    },
    {
      kicker: '시작하기',
      title: <>어떻게 시작할까요?</>,
      sub: '로그인도, 계좌 연결도 필요 없어요.',
      body: <StartPick start={start} setStart={setStart} agree={agree} setAgree={setAgree} />,
      cta: start === 'demo' ? '예시로 둘러보기' : '1분 설정 시작하기',
    },
  ];
  const s = screens[step];

  return (
    <div className={`ob ob-step-${step}`} aria-roledescription="소개" aria-label={`${STEPS}단계 중 ${step + 1}단계`}>
      <div className="ob-top">
        <button type="button" className="ob-back" onClick={back} disabled={step === 0} aria-label="이전">‹</button>
        <div className="ob-progress" aria-hidden="true">{Array.from({ length: STEPS }, (_, i) => <i key={i} className={i <= step ? 'on' : ''} />)}</div>
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
      <div className="ob-hero-logo ob-hero-solo" aria-hidden="true"><Logo size={40} /><b>모아</b></div>
      <ul className="ob-trust">
        <li><span className="ob-ic">14</span><span><b>14일 안의 필수결제 확인</b><small>월세·카드값·통신비가 빠지는 날, 결제계좌에 돈이 남는지 봐요.</small></span></li>
        <li><span className="ob-ic">⇄</span><span><b>결제 전 선택 비교</b><small>살까 말까 고민될 때 넣어 보면 결제일 잔고가 어떻게 바뀌는지 보여줘요.</small></span></li>
        <li><span className="ob-ic">✓</span><span><b>위험 근거와 기록 신뢰도</b><small>왜 이런 판단이 나왔는지, 그 판단을 얼마나 믿어도 되는지 같이 보여줘요.</small></span></li>
      </ul>
      <p className="ob-note">기록은 이 기기에만 남고, 은행·카드와 연결하지 않아요.</p>
    </>
  );
}

/* ───────── 1. 결제일 하루의 부족 ───────── */
function PayDay() {
  const [delay, setDelay] = useState(0);
  const after = balanceOnPayDay(delay);
  const short = after < 0;
  const arrive = EX.incomeDay + delay;
  const rows = [
    { k: '지금 결제계좌', s: '오늘 확인한 잔액', v: EX.balance, c: 'in' },
    { k: `알바비 · ${arrive}일`, s: delay ? `${delay}일 늦게 들어오면` : '예정대로 들어오면', v: arrive <= EX.payDay ? EX.income : 0, c: arrive <= EX.payDay ? 'in' : 'bill' },
    { k: `${EX.payName} · ${EX.payDay}일`, s: '결제계좌에서 출금', v: -EX.payAmount, c: 'bill' },
  ];
  return (
    <>
      <div className="ob-seg" role="radiogroup" aria-label="알바비 입금">
        <button type="button" role="radio" aria-checked={delay === 0} className={delay === 0 ? 'on' : ''} onClick={() => setDelay(0)}>예정대로</button>
        <button type="button" role="radio" aria-checked={delay === EX.delay} className={delay === EX.delay ? 'on' : ''} onClick={() => setDelay(EX.delay)}>{EX.delay}일 지연</button>
      </div>
      <div className="ob-card">
        {rows.map((r) => (
          <div key={r.k} className={`ob-wf-row show ${r.c}`}>
            <span><b>{r.k}</b><small>{r.s}</small></span>
            <strong className="num">{r.v > 0 ? fmt(r.v) : r.v === 0 ? '아직 안 들어옴' : signed(r.v)}</strong>
          </div>
        ))}
        <div className={`ob-payday ${short ? 'short' : 'ok'}`}>
          <span>{EX.payDay}일 {EX.payName} 출금 직후</span>
          <strong className="num">{signed(after)}</strong>
          <em>{short ? `예정대로면 감당하던 ${EX.payName}에 ${fmt(-after)}이 모자라요` : '이번 결제일은 괜찮아요'}</em>
        </div>
      </div>
      <p className="ob-note">가계부 화면에는 '이번 달 지출'만 보이지만, 연체는 결제일 하루에 생겨요.</p>
    </>
  );
}

/* ───────── 2. 결제 전 선택 비교 ───────── */
function Choice() {
  const [pick, setPick] = useState<'skip' | 'debit' | 'credit'>('debit');
  const base = balanceOnPayDay(0);
  const after = pick === 'debit' ? balanceOnPayDay(0, BUY.amount) : base;
  const options: { id: typeof pick; label: string; note: string }[] = [
    { id: 'debit', label: '체크카드로 사기', note: '결제계좌에서 바로 빠져요' },
    { id: 'credit', label: '신용카드로 사기', note: '이용기간이 이미 마감됐다면 다음 카드값으로 넘어가요' },
    { id: 'skip', label: '참기', note: '가상 절약액으로 기록돼요' },
  ];
  const cur = options.find((o) => o.id === pick)!;
  return (
    <>
      <div className="ob-seg three" role="radiogroup" aria-label="결제 방법">
        {options.map((o) => (
          <button key={o.id} type="button" role="radio" aria-checked={pick === o.id} className={pick === o.id ? 'on' : ''} onClick={() => setPick(o.id)}>{o.label}</button>
        ))}
      </div>
      <div className="ob-card">
        <div className="ob-wf-row show bill">
          <span><b>{BUY.name}</b><small>{cur.note}</small></span>
          <strong className="num">{pick === 'skip' ? '0원' : signed(-BUY.amount)}</strong>
        </div>
        <div className="ob-two">
          <div className="keep"><small>안 사면 {EX.payDay}일 잔고</small><b className="num">{fmt(base)}</b><em>{EX.payName} 출금 직후</em></div>
          <div className={after < base ? 'buy' : 'keep'}><small>이 선택이면</small><b className="num">{signed(after)}</b><em>{after < base ? `${fmt(base - after)} 줄어요` : '이번 결제일엔 그대로예요'}</em></div>
        </div>
      </div>
      <p className="ob-note">신용카드는 카드 이용기간과 결제일을 등록해야 정확하게 계산해요.</p>
    </>
  );
}

/* ───────── 3. AI ───────── */
function AiDemo() {
  return (
    <>
      <div className="ob-split">
        <div className="ob-split-k ai"><small>AI가 정리</small><b>결제 문자·메모 → 금액, 날짜, 결제 수단</b></div>
        <span aria-hidden="true">→</span>
        <div className="ob-split-k"><small>앱이 계산</small><b>결제일 잔고 · 경고 등급</b></div>
      </div>
      <div className="ob-card ob-sms">
        <small>붙여넣은 결제 문자 (예시)</small>
        <p className="raw">[OO카드] 승인 <mark>홍*동</mark> 24,000원 일시불 11/03 19:42 배달앱 누적 312,000원</p>
        <small>AI에게 보내기 전, 기기에서 이름·카드번호를 가려요</small>
      </div>
      <div className={'ob-card ob-ai'}>
        <div className="ob-ai-head"><AiMark /><b>추출 결과 확인</b></div>
        <dl className="ob-calc">
          <div><dt>금액</dt><dd className="num">24,000원</dd></div>
          <div><dt>날짜</dt><dd>11월 3일</dd></div>
          <div><dt>결제 수단</dt><dd>신용카드 일시불</dd></div>
          <div><dt>가맹점</dt><dd>배달앱</dd></div>
        </dl>
        <p className="tip">확인을 눌러야 저장돼요. 문장에 없는 값은 AI가 채우지 않고 비워둬요.</p>
      </div>
    </>
  );
}

/* ───────── 4. 위험 등급 vs 기록 신뢰도 ───────── */
function Trust() {
  return (
    <div className="ob-card ob-trust2">
      <div className="row">
        <small>자금 부족 위험</small>
        <span className="mo-grade g-caution">주의</span>
        <p>"{EX.payDay}일 {EX.payName}, 급여가 늦어지면 모자랄 수 있어요"</p>
      </div>
      <div className="row">
        <small>기록 신뢰도</small>
        <span className="mo-rel r-check">기록 신뢰도 · 확인 필요</span>
        <p>"잔액을 확인한 지 9일 지났어요. 지금 잔액을 입력하면 다시 판단해요"</p>
      </div>
      <ul className="ob-levels">
        <li><span className="mo-rel r-enough">충분</span>최근 잔액 확인과 기록이 맞아요</li>
        <li><span className="mo-rel r-check">확인 필요</span>잔액 확인이 오래됐거나, 기록이 어긋났거나, 카드 결제일·입금 일정이 빠졌어요</li>
        <li><span className="mo-rel r-low">부족</span>위 문제가 두 가지 이상 겹쳐요</li>
      </ul>
      <p className="tip">잔액 확인이 7일을 넘기거나 기록이 어긋나면 등급은 '주의'보다 올라가지 않아요.</p>
    </div>
  );
}

/* ───────── 5. 시작 ───────── */
function StartPick({ start, setStart, agree, setAgree }: { start: 'demo' | 'mine'; setStart: (v: 'demo' | 'mine') => void; agree: boolean; setAgree: (v: boolean) => void }) {
  return (
    <>
      <div className="ob-start" role="radiogroup" aria-label="시작 방법">
        <button type="button" role="radio" aria-checked={start === 'demo'} className={start === 'demo' ? 'on' : ''} onClick={() => setStart('demo')}>
          <span className="tag">추천</span>
          <b>예시로 먼저 둘러보기</b>
          <small>결제일이 다가오는 대학생 한 명의 기록이 채워진 상태로 시작해요.</small>
        </button>
        <button type="button" role="radio" aria-checked={start === 'mine'} className={start === 'mine' ? 'on' : ''} onClick={() => setStart('mine')}>
          <b>1분 설정으로 시작하기</b>
          <small>결제계좌 잔액과 가장 가까운 필수결제 1건만 넣으면 바로 결과를 보여줘요.</small>
        </button>
      </div>
      {start === 'mine' && (
        <label className="ob-agree">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>입력한 금액은 이 기기에만 저장되고, 결제 문자는 개인정보를 가린 뒤에만 AI로 보낸다는 걸 확인했어요.</span>
        </label>
      )}
      <p className="ob-note">예시로 시작해도 설정에서 언제든 내 기록으로 바꿀 수 있어요.</p>
    </>
  );
}
