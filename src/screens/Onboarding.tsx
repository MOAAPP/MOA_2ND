/**
 * 첫 실행 온보딩 (v19) — 모아의 계산 로직을 실제 엔진으로 한 단계씩 보여준다.
 *  0) 약속 + 믿을 수 있는 이유
 *  1) 쓸 수 있는 돈 = 들어온 돈 − 낼 돈 − 지켜둘 돈
 *  2) 사기 전에 두 세계로 나눠 보기 (futureCost, 직접 골라보기)
 *  3) 참은 돈 → 모아 통장 → 예금, 세후 1년 뒤 (bestYearPlan)
 *  4) 숫자는 앱, 말은 AI (exampleCoach)
 *  5) 시작 방법 고르기
 * 화면 숫자는 전부 src/lib 계산 함수에서 나온다(하드코딩 없음).
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { startOfMonth, todayKST, addDays } from '../../shared/dates';
import { AiMark } from '../components/Ai';
import { Logo } from '../components/Glyph';
import { Won } from '../components/ds';
import { exampleNow } from '../lib/ai';
import { ratePct } from '../lib/bank/money';
import { FREQ_LABEL, futureCost, type Frequency } from '../lib/futureCost';
import { WORLD_FIXED_BILLS, WORLD_MONTHLY_INCOME, WORLD_SAFETY_BUFFER } from '../lib/worldWallet';
import { ForkChart } from './Choose';

const fmt = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const signed = (n: number) => `${n < 0 ? '−' : ''}${fmt(Math.abs(n))}`;

const ITEMS: { id: string; emoji: string; name: string; price: number; freq: Frequency; category: string }[] = [
  { id: 'latte', emoji: '☕️', name: '카페 라떼', price: 4_500, freq: 'daily', category: '카페' },
  { id: 'buds', emoji: '🎧', name: '무선 이어폰', price: 159_000, freq: 'once', category: '쇼핑' },
  { id: 'delivery', emoji: '🍗', name: '배달 치킨', price: 24_000, freq: 'weekly', category: '식비' },
];

const STEPS = 6;

/** 숫자가 0에서 목표까지 올라가는 효과 */
function useCount(target: number, run: boolean, ms = 700) {
  const [v, setV] = useState(run ? 0 : target);
  useEffect(() => {
    if (!run || document.documentElement.classList.contains('reduce-motion')) { setV(target); return; }
    let raf = 0; const t0 = performance.now();
    const tick = (t: number) => { const k = Math.min(1, (t - t0) / ms); setV(target * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, run, ms]);
  return v;
}

export function Onboarding({ onDone, onDemo }: { onDone: () => void; onDemo: () => void }) {
  const [step, setStep] = useState(0);
  const [itemId, setItemId] = useState(ITEMS[0].id);
  const [agree, setAgree] = useState(true);
  const [start, setStart] = useState<'demo' | 'mine'>('demo');
  const item = ITEMS.find((i) => i.id === itemId)!;

  // 예시 날짜: 이번 달 10일(월급 들어오고 한 주 지난 때). 계산은 실제 엔진 그대로.
  const day = addDays(startOfMonth(todayKST()), 9);
  const usable = WORLD_MONTHLY_INCOME - WORLD_FIXED_BILLS - WORLD_SAFETY_BUFFER;
  const fc = useMemo(() => futureCost({
    price: item.price, frequency: item.freq, today: day,
    wallet: { cash: WORLD_MONTHLY_INCOME, fixedBills: WORLD_FIXED_BILLS, safetyBuffer: WORLD_SAFETY_BUFFER },
  }), [item, day]);
  const coach = useMemo(() => exampleNow('coach', {
    item: item.name, category: item.category, price: item.price, frequency: item.freq,
    usableNow: fc.now.usable, usableAfter: fc.buy.usable, afterBills: fc.buy.afterBills, yearGap: fc.year.net,
    categorySpentThisMonth: item.category === '카페' ? 31_500 : 0, categoryCount30: item.category === '카페' ? 7 : 1,
  }), [item, fc]);

  const next = () => setStep((s) => Math.min(STEPS - 1, s + 1));
  const back = () => setStep((s) => Math.max(0, s - 1));
  const last = step === STEPS - 1;

  const screens: { kicker: string; title: ReactNode; sub: ReactNode; body: ReactNode; cta: string }[] = [
    {
      kicker: '20대를 위한 소비 결정 가계부',
      title: <>사기 전에,<br />1년 뒤 내 돈을<br />먼저 봐요</>,
      sub: '오늘의 작은 선택이 통장을 어떻게 바꾸는지 숫자로 보여주는 가계부예요.',
      body: <Pledge />,
      cta: '어떻게 계산하는지 볼게요',
    },
    {
      kicker: '1 · 쓸 수 있는 돈',
      title: <>통장 잔고 말고,<br />진짜 여유부터 계산해요</>,
      sub: '이번 달 들어온 돈에서 꼭 낼 돈과 지켜둘 돈을 먼저 빼요.',
      body: <Waterfall usable={usable} run={step === 1} />,
      cta: '다음',
    },
    {
      kicker: '2 · 사기 전에',
      title: <>사고 싶은 게 생기면<br />두 세계로 나눠 봐요</>,
      sub: '하나 골라 보세요. 산 나와 참은 나가 1년 동안 얼마나 벌어지는지 바로 계산해요.',
      body: <Fork itemId={itemId} setItemId={setItemId} fc={fc} usable={usable} />,
      cta: '다음',
    },
    {
      kicker: '3 · 참은 돈의 길',
      title: <>참은 돈은 사라지지 않고<br />이자까지 붙어요</>,
      sub: '참으면 그 돈이 모아 통장으로 옮겨지고, 바로 가상 예금·적금에 넣어 볼 수 있어요.',
      body: <Path item={item} fc={fc} />,
      cta: '다음',
    },
    {
      kicker: '4 · 모아 AI',
      title: <>숫자는 앱이 계산하고,<br />AI가 쉽게 풀어줘요</>,
      sub: 'AI는 숫자를 만들지 않아요. 앱이 계산한 결과만 보고 지금 내 상황에 맞게 말해줘요.',
      body: <AiDemo item={item} coach={coach} />,
      cta: '다음',
    },
    {
      kicker: '시작하기',
      title: <>어떻게 시작할까요?</>,
      sub: '로그인도, 계좌 연결도 필요 없어요.',
      body: <StartPick start={start} setStart={setStart} agree={agree} setAgree={setAgree} />,
      cta: start === 'demo' ? '예시로 둘러보기' : '내 생활비 입력하기',
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
      <div className="ob-hero" aria-hidden="true">
        <div className="ob-hero-logo"><Logo size={40} /><b>모아</b></div>
        <svg viewBox="0 0 300 140" className="ob-hero-fork">
          <path d="M16 70 C 110 70, 170 22, 284 22" className="k" pathLength={1} />
          <path d="M16 70 C 110 70, 170 118, 284 118" className="b" pathLength={1} />
          <circle cx="16" cy="70" r="6" className="o" />
          <circle cx="284" cy="22" r="7" className="k-dot" />
          <circle cx="284" cy="118" r="7" className="b-dot" />
          <text x="276" y="48" textAnchor="end" className="t">참은 나</text>
          <text x="276" y="104" textAnchor="end" className="t">산 나</text>
          <text x="16" y="96" className="t">오늘</text>
        </svg>
      </div>
      <ul className="ob-trust">
        <li><span className="ob-ic">₩</span><span><b>진짜 돈은 오가지 않아요</b><small>가상 계좌로 연습해요. 은행·카드와 연결하지 않아요.</small></span></li>
        <li><span className="ob-ic">⌂</span><span><b>기록은 이 기기에만</b><small>로그인 없이 쓰고, 언제든 지울 수 있어요.</small></span></li>
        <li><span className="ob-ic">=</span><span><b>계산식을 다 보여줘요</b><small>이자·세금은 은행 계산법(세금 15.4%) 그대로예요.</small></span></li>
      </ul>
    </>
  );
}

/* ───────── 1. 쓸 수 있는 돈 ───────── */
function Waterfall({ usable, run }: { usable: number; run: boolean }) {
  const v = useCount(usable, run, 900);
  const rows = [
    { k: '이번 달 들어온 돈', s: '월급·알바비', v: WORLD_MONTHLY_INCOME, c: 'in' },
    { k: '꼭 낼 돈', s: '월세·통신비 같은 고정지출', v: -WORLD_FIXED_BILLS, c: 'bill' },
    { k: '지켜둘 생활비', s: '갑자기 쓸 일을 위한 안전선', v: -WORLD_SAFETY_BUFFER, c: 'safe' },
  ];
  const total = WORLD_MONTHLY_INCOME;
  return (
    <div className="ob-card">
      {rows.map((r, i) => (
        <div key={r.k} className={`ob-wf-row ${r.c}`} style={{ animationDelay: `${120 + i * 220}ms` }}>
          <span><b>{r.k}</b><small>{r.s}</small></span>
          <strong className="num">{r.v > 0 ? fmt(r.v) : signed(r.v)}</strong>
        </div>
      ))}
      <div className="ob-wf-bar" aria-hidden="true">
        <i className="bill" style={{ width: `${(100 * WORLD_FIXED_BILLS) / total}%` }} />
        <i className="safe" style={{ width: `${(100 * WORLD_SAFETY_BUFFER) / total}%` }} />
        <i className="free" style={{ width: `${(100 * usable) / total}%` }} />
      </div>
      <div className="ob-wf-total">
        <span>마음 편히 쓸 수 있는 돈</span>
        <strong><Won n={v} /></strong>
      </div>
      <p className="ob-formula">쓸 수 있는 돈 = 들어온 돈 − 꼭 낼 돈 − 지켜둘 돈</p>
    </div>
  );
}

/* ───────── 2. 두 세계 ───────── */
function Fork({ itemId, setItemId, fc, usable }: { itemId: string; setItemId: (id: string) => void; fc: ReturnType<typeof futureCost>; usable: number }) {
  const item = ITEMS.find((i) => i.id === itemId)!;
  const short = fc.buy.usable < 0;
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
        <div className="ob-two">
          <div className="buy"><small>사면 이번 달 쓸 수 있는 돈</small><b className={`num ${short ? 'neg' : ''}`}>{signed(fc.buy.usable)}</b><em>{short ? '지켜둘 돈까지 써요' : `${fmt(usable)}에서 ${fmt(fc.buy.spendThisMonth)} 줄어요`}</em></div>
          <div className="keep"><small>참으면</small><b className="num">{fmt(fc.hold.usable)}</b><em>그대로 남아요</em></div>
        </div>
      </div>
    </>
  );
}

/* ───────── 3. 참은 돈의 길 ───────── */
function Path({ item, fc }: { item: (typeof ITEMS)[number]; fc: ReturnType<typeof futureCost> }) {
  const y = fc.year;
  const kind = y.how === 'installment' ? '적금' : '예금';
  const steps = [
    { t: '참기', v: item.freq === 'once' ? fmt(item.price) : `${FREQ_LABEL[item.freq]} ${fmt(item.price)}`, s: `${item.name} 대신` },
    { t: '모아 통장', v: y.how === 'installment' ? `매달 ${fmt(y.monthly ?? 0)}` : fmt(y.principal), s: '자유 저축으로 바로 옮겨요' },
    { t: `가상 ${kind}`, v: y.productName ? `연 ${ratePct(y.appliedRate)}` : '이자 없이 모으기', s: y.productName || '가입 가능한 상품 없음' },
  ];
  return (
    <div className="ob-card">
      <ol className="ob-path">
        {steps.map((s, i) => (
          <li key={s.t} style={{ animationDelay: `${100 + i * 200}ms` }}>
            <span className="n">{i + 1}</span>
            <span className="m"><b>{s.t}</b><small>{s.s}</small></span>
            <strong className="num">{s.v}</strong>
          </li>
        ))}
      </ol>
      <dl className="ob-calc">
        <div><dt>1년 동안 모은 원금</dt><dd className="num">{fmt(y.principal)}</dd></div>
        <div><dt>이자</dt><dd className="num">+{fmt(y.interest)}</dd></div>
        <div><dt>이자소득세 15.4%</dt><dd className="num">−{fmt(y.tax)}</dd></div>
        <div className="total"><dt>1년 뒤 받는 돈</dt><dd className="num">{fmt(y.net)}</dd></div>
      </dl>
    </div>
  );
}

/* ───────── 4. AI ───────── */
function AiDemo({ item, coach }: { item: (typeof ITEMS)[number]; coach: { tone: string; message: string; tip: string | null } }) {
  return (
    <>
      <div className="ob-split">
        <div className="ob-split-k"><small>앱이 계산</small><b>쓸 수 있는 돈 · 결제일 잔고 · 1년 차이</b></div>
        <span aria-hidden="true">→</span>
        <div className="ob-split-k ai"><small>AI가 말로</small><b>지금 나에게 맞는 한마디</b></div>
      </div>
      <div className={`ob-card ob-ai ${coach.tone}`}>
        <div className="ob-ai-head"><AiMark /><b>AI 코치</b><span>{item.emoji} {item.name}</span></div>
        <p>{coach.message}</p>
        {coach.tip && <p className="tip">{coach.tip}</p>}
      </div>
      <div className="ob-card ob-ai-more">
        <div><AiMark label="" /><span><b>가계부 정리</b><small>카드 승인 문자를 붙여넣으면 여러 건을 한 번에 적어요</small></span></div>
        <div><AiMark label="" /><span><b>물어보기</b><small>"이번 달 얼마 더 쓸 수 있어?"에 내 숫자로 답해요</small></span></div>
      </div>
    </>
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
          <small>대학생 한 명의 3개월 기록이 채워진 상태로 시작해요. 바로 눌러 볼 수 있어요.</small>
        </button>
        <button type="button" role="radio" aria-checked={start === 'mine'} className={start === 'mine' ? 'on' : ''} onClick={() => setStart('mine')}>
          <b>내 생활비로 시작하기</b>
          <small>잔고·월급·고정지출만 넣으면 돼요. 2분이면 끝나요.</small>
        </button>
      </div>
      {start === 'mine' && (
        <label className="ob-agree">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
          <span>입력한 금액은 이 기기에만 저장되고, 은행 계좌와 연결하지 않는다는 걸 확인했어요.</span>
        </label>
      )}
      <p className="ob-note">예시로 시작해도 설정에서 언제든 내 생활비로 바꿀 수 있어요.</p>
    </>
  );
}
