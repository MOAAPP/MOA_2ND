import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { addDays, endOfMonth, formatKDate, maxDate, todayKST } from '../../shared/dates';
import { won } from '../../shared/format';
import { OptionList, StepHead } from '../components/flow';
import { IconTile, type GlyphName, type Tone } from '../components/Glyph';
import { IconPlus } from '../components/Icons';
import { ParallelChart } from '../components/ParallelChart';
import { ScheduleSheet, scheduleText } from '../components/ScheduleEditor';
import { AmountInput, CtaBar, TopBar } from '../components/ui';
import { balanceOn, buildWorlds, firstBelow, lowestFrom, occurrences } from '../lib/cashflow';
import { demoData } from '../lib/demo';
import type { Profile, ScheduleItem } from '../lib/types';
import { useStore, type SetupDraft } from '../state/store';

const emptyDraft = (): SetupDraft => ({ step: 0, incomes: [], noIncome: false, expenses: [], reflected: [] });

export function buildProfile(d: SetupDraft, now = Date.now()): Profile {
  const g = d.goal;
  return {
    baseBalance: d.balance ?? 0,
    baseDate: todayKST(new Date(now)),
    baseSetAt: now,
    minBalance: d.minBalance ?? 0,
    dailySpend: d.dailySpend || undefined,
    items: [...d.incomes, ...d.expenses],
    reflectedOnBaseDate: d.reflected,
    goal: !d.skipGoal && g?.target && g.name ? { name: g.name, target: g.target, saved: g.saved ?? 0, targetDate: g.targetDate, monthlySaving: g.monthlySaving, annualRate: 0 } : undefined,
  };
}

/* 단계: 0 잔고 · 1 들어오는 돈 · 2 나가는 돈 · 3 하루 생활비 · 4 지킬 돈 · 5 목표 · 6 오늘 반영(있을 때) · 7 준비 끝 */
const B = { balance: 0, income: 1, expense: 2, daily: 3, min: 4, goal: 5, today: 6, done: 7 } as const;

type Preset = { name: string; day: number; icon: ReactNode };
const ic = (g: GlyphName, t: Tone) => <IconTile name={g} tone={t} size={44} />;
const INCOME: Preset[] = [
  { name: '월급', day: 25, icon: ic('briefcase', 'blue') },
  { name: '알바비', day: 10, icon: ic('coin', 'amber') },
  { name: '용돈', day: 1, icon: ic('wallet', 'violet') },
  { name: '장학금', day: 1, icon: ic('school', 'teal') },
];
const EXPENSE: Preset[] = [
  { name: '월세', day: 25, icon: ic('home', 'orange') },
  { name: '통신비', day: 15, icon: ic('phone', 'blue') },
  { name: '카드값', day: 14, icon: ic('card', 'violet') },
  { name: '구독료', day: 5, icon: ic('play', 'red') },
  { name: '교통비', day: 1, icon: ic('bus', 'teal') },
];
const GOALS: { name: string; icon: ReactNode }[] = [
  { name: '여행', icon: ic('plane', 'blue') },
  { name: '비상금', icon: ic('shield', 'teal') },
  { name: '노트북', icon: ic('laptop', 'slate') },
  { name: '독립 자금', icon: ic('key', 'amber') },
];

function useCountUp(target: number, ms = 700) {
  const [v, setV] = useState(target);
  const from = useRef(0);
  useEffect(() => {
    const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('reduce-motion');
    if (reduce) return setV(target);
    let raf = 0;
    const start = performance.now();
    const a = from.current;
    const tick = (t: number) => {
      const k = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - k, 3);
      setV(Math.round(a + (target - a) * e));
      if (k < 1) raf = requestAnimationFrame(tick);
      else from.current = target;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return v;
}

function ScheduleStep({ kind, items, onChange, presets }: { kind: 'income' | 'expense'; items: ScheduleItem[]; onChange: (items: ScheduleItem[]) => void; presets: Preset[] }) {
  const [edit, setEdit] = useState<{ item: ScheduleItem | null; preset?: Preset } | null>(null);
  const added = new Set(items.map((i) => i.name));
  return (
    <>
      <div className="preset-grid">
        {presets.map((p) => (
          <button key={p.name} type="button" className={`preset${added.has(p.name) ? ' done' : ''}`} onClick={() => setEdit({ item: items.find((i) => i.name === p.name) ?? null, preset: p })}>
            {p.icon}
            {p.name}
          </button>
        ))}
        <button type="button" className="preset" onClick={() => setEdit({ item: null })}>
          <span className="icon-tile" style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--surface-2)', color: 'var(--ink-3)' }}><IconPlus width={22} height={22} /></span>
          직접 입력
        </button>
      </div>
      {items.length > 0 && (
        <div className="onb-items">
          {items.map((it) => (
            <button key={it.id} className="onb-item" onClick={() => setEdit({ item: it })}>
              <span className="oi-main">
                <span className="oi-t" style={{ display: 'block' }}>{it.name}</span>
                <span className="oi-s">{scheduleText(it)}</span>
              </span>
              <b className="num">{kind === 'income' ? '+' : '−'}{won(it.amount)}</b>
            </button>
          ))}
        </div>
      )}
      {edit && (
        <ScheduleSheet
          kind={kind}
          item={edit.item}
          preset={edit.preset && !edit.item ? { name: edit.preset.name, day: edit.preset.day } : undefined}
          onClose={() => setEdit(null)}
          onSave={(it) => {
            onChange(edit.item ? items.map((x) => (x.id === it.id ? it : x)) : [...items, it]);
            setEdit(null);
          }}
          onDelete={edit.item ? () => { onChange(items.filter((x) => x.id !== edit.item!.id)); setEdit(null); } : undefined}
        />
      )}
    </>
  );
}

export function Setup({ onFinish }: { onFinish: (goCompare: boolean) => void }) {
  const { state, update } = useStore();
  const d = state.setupDraft ?? emptyDraft();
  const today = todayKST();
  const set = (p: Partial<SetupDraft>) => update((s) => ({ ...s, setupDraft: { ...(s.setupDraft ?? emptyDraft()), ...p } }));

  const todayItems = useMemo(() => [...d.incomes, ...d.expenses].filter((i) => occurrences(i, today, today).length > 0), [d.incomes, d.expenses, today]);
  const steps: number[] = todayItems.length ? [0, 1, 2, 3, 4, 5, 6, 7] : [0, 1, 2, 3, 4, 5, 7];
  const pos = Math.max(0, steps.indexOf(d.step));
  const step = steps[pos];
  const go = (dir: 1 | -1) => set({ step: steps[Math.min(steps.length - 1, Math.max(0, pos + dir))] });

  const finish = (compare: boolean) => {
    update((s) => ({ ...s, profile: buildProfile(d), setupDraft: null }));
    onFinish(compare);
  };
  const startDemo = () => {
    update((s) => ({ ...s, ...demoData(), demo: true, setupDraft: null }));
    onFinish(false);
  };

  const dailyOpts = [
    { value: 6000, label: '5천 원 안쪽', sub: '거의 집밥, 가끔 커피', icon: ic('home', 'teal') },
    { value: 11000, label: '1만 원쯤', sub: '점심 한 끼에 커피 한 잔', icon: ic('cup', 'brown') },
    { value: 17000, label: '1만 5천 원쯤', sub: '하루 두 끼는 밖에서', icon: ic('bowl', 'orange') },
    { value: 25000, label: '2만 원 넘게', sub: '약속이 자주 있어요', icon: ic('ticket', 'red') },
    { value: 0, label: '잘 모르겠어요', sub: '쓴 돈을 기록하면 알아서 맞춰져요', icon: ic('spark', 'violet') },
  ];
  const minOpts = [
    { value: 0, label: '없어요', sub: '0원까지 써도 괜찮아요', icon: ic('wallet', 'slate') },
    { value: 50000, label: '5만 원', sub: '급하게 쓸 교통비 정도', icon: ic('shield', 'teal') },
    { value: 100000, label: '10만 원', sub: '갑자기 생기는 일에 대비', icon: ic('shield', 'blue') },
    { value: 300000, label: '30만 원', sub: '다음 달 월세 일부까지', icon: ic('piggy', 'violet') },
  ];

  const canNext = (() => {
    switch (step) {
      case B.balance: return d.balance !== undefined;
      case B.daily: return d.dailySpend !== undefined;
      case B.min: return d.minBalance !== undefined;
      case B.goal: return d.skipGoal || !d.goal?.name || !!d.goal?.target;
      default: return true;
    }
  })();

  return (
    <div className="page no-nav has-cta onb">
      <TopBar onBack={pos > 0 && step !== B.done ? () => go(-1) : undefined} title="" />
      {step !== B.done && (
        <div className="progress" aria-label={`${steps.length - 1}단계 중 ${pos + 1}단계`}>
          <div style={{ width: `${((pos + 1) / (steps.length - 1)) * 100}%` }} />
        </div>
      )}

      {step === B.balance && (
        <>
          <StepHead title={<>지금 통장에<br />얼마 있어요?</>} desc="생활비 쓰는 통장 하나만 생각해 주세요. 계좌 연결 없이 숫자만 받아요." />
          <div className="step-body xl" key="b0">
            <AmountInput value={d.balance} onChange={(v) => set({ balance: v })} label="지금 잔고" autoFocus quick={[]} />
          </div>
          <button className="onb-link" onClick={startDemo}>예시 통장으로 먼저 구경할게요</button>
        </>
      )}

      {step === B.income && (
        <>
          <StepHead title={<>매달 들어오는 돈이<br />있어요?</>} desc="들어오는 날을 알면 돈이 모자란 날을 미리 찾을 수 있어요." />
          <div className="step-body" key="b1">
            <ScheduleStep kind="income" items={d.incomes} onChange={(incomes) => set({ incomes, noIncome: false })} presets={INCOME} />
          </div>
        </>
      )}

      {step === B.expense && (
        <>
          <StepHead title={<>매달 꼭 나가는 돈은<br />뭐가 있어요?</>} desc="그날 잔고가 충분한지 같이 봐드릴게요." />
          <div className="step-body" key="b2">
            <ScheduleStep kind="expense" items={d.expenses} onChange={(expenses) => set({ expenses })} presets={EXPENSE} />
          </div>
        </>
      )}

      {step === B.daily && (
        <>
          <StepHead title={<>하루에 보통<br />얼마쯤 써요?</>} desc="밥, 커피, 교통비처럼 그때그때 쓰는 돈이요." />
          <div className="step-body" key="b3">
            <OptionList label="하루 생활비" value={d.dailySpend} onPick={(v) => set({ dailySpend: v })} options={dailyOpts} />
          </div>
        </>
      )}

      {step === B.min && (
        <>
          <StepHead title={<>통장에 이만큼은<br />꼭 남겨두고 싶어요</>} desc="이 아래로 내려갈 것 같으면 미리 알려드려요." />
          <div className="step-body" key="b4">
            <OptionList label="지킬 돈" value={d.minBalance} onPick={(v) => set({ minBalance: v })} options={minOpts} />
          </div>
        </>
      )}

      {step === B.goal && (
        <>
          <StepHead title={<>모으고 있는 돈이<br />있어요?</>} desc="오늘의 선택이 목표를 얼마나 당기는지 보여드려요." />
          <div className="step-body" key="b5">
            <div className="preset-grid">
              {GOALS.map((g) => (
                <button key={g.name} type="button" className={`preset${d.goal?.name === g.name ? ' done' : ''}`} onClick={() => set({ goal: { ...d.goal, name: g.name }, skipGoal: false })}>
                  {g.icon}
                  {g.name}
                </button>
              ))}
            </div>
            {d.goal?.name && (
              <>
                <div className="field">
                  <span className="lab">{d.goal.name}에 얼마가 필요해요?</span>
                  <AmountInput value={d.goal?.target} onChange={(v) => set({ goal: { ...d.goal, target: v } })} label="목표 금액" quick={[]} />
                </div>
                <div className="field">
                  <span className="lab">한 달에 얼마씩 모을 수 있어요?</span>
                  <AmountInput value={d.goal?.monthlySaving} onChange={(v) => set({ goal: { ...d.goal, monthlySaving: v } })} label="한 달 저축" quick={[]} />
                </div>
              </>
            )}
          </div>
        </>
      )}

      {step === B.today && (
        <>
          <StepHead title={<>오늘 예정된 돈,<br />벌써 통장에 반영됐어요?</>} desc="이미 들어오거나 빠졌으면 두 번 계산하지 않을게요." />
          <div className="step-body" key="b6">
            {todayItems.map((it) => (
              <div key={it.id} className="onb-item" style={{ cursor: 'default' }}>
                <span className="oi-main">
                  <span className="oi-t" style={{ display: 'block' }}>{it.name}</span>
                  <span className="oi-s">{it.kind === 'income' ? '+' : '−'}{won(it.amount)}</span>
                </span>
                <div className="day-chips" style={{ gridTemplateColumns: 'repeat(2, auto)' }}>
                  <button type="button" aria-pressed={d.reflected.includes(it.id)} onClick={() => set({ reflected: [...new Set([...d.reflected, it.id])] })}>반영됐어요</button>
                  <button type="button" aria-pressed={!d.reflected.includes(it.id)} onClick={() => set({ reflected: d.reflected.filter((x) => x !== it.id) })}>아직이요</button>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {step === B.done && <Done draft={d} />}

      <CtaBar>
        {step === B.done ? (
          <>
            <button className="btn ghost" onClick={() => finish(false)}>홈으로</button>
            <button className="btn primary flex" onClick={() => finish(true)}>사고 싶은 거 비교하기</button>
          </>
        ) : step === B.income && !d.incomes.length ? (
          <button className="btn primary block" onClick={() => { set({ noIncome: true }); go(1); }}>정해진 수입은 없어요</button>
        ) : step === B.expense && !d.expenses.length ? (
          <button className="btn primary block" onClick={() => go(1)}>없어요, 넘어갈게요</button>
        ) : step === B.goal && !d.goal?.name ? (
          <button className="btn primary block" onClick={() => { set({ skipGoal: true }); go(1); }}>지금은 없어요</button>
        ) : (
          <button className="btn primary block" disabled={!canNext} onClick={() => go(1)}>다음</button>
        )}
      </CtaBar>
    </div>
  );
}

function Done({ draft }: { draft: SetupDraft }) {
  const today = todayKST();
  const p = useMemo(() => buildProfile(draft), [draft]);
  const monthEnd = endOfMonth(today);
  const horizon = maxDate(monthEnd, addDays(today, 31));
  const w = useMemo(() => buildWorlds(p, [], horizon), [p, horizon]);
  const [cursor, setCursor] = useState(monthEnd);
  const end = balanceOn(w.reality, monthEnd) ?? p.baseBalance;
  const shown = useCountUp(end);
  const low = lowestFrom(w.reality, today);
  const negative = firstBelow(w.reality, 0, today);
  const below = firstBelow(w.reality, p.minBalance, today);

  return (
    <>
      <StepHead title={<>이대로면 이번 달 말에<br />이만큼 남아요</>} />
      <div className="step-body" key="done" style={{ marginTop: 16 }}>
        <div className="result-big num">{won(shown)}</div>
        <div className="result-sub">
          {`${formatKDate(monthEnd)} 기준, 고정 지출만 넣은 값`}
        </div>
        <div style={{ marginTop: 20 }}>
          <ParallelChart real={{ days: w.reality.days, label: '지금대로' }} from={today} minBalance={p.minBalance} cursor={cursor} onCursor={setCursor} legend={false} height={200} />
        </div>
        <div className="risks" style={{ marginTop: 12 }}>
          <div className={`risk ${negative ? 'danger' : below ? 'warn' : 'ok'}`}>
            <span className="rk-l">가장 적을 때</span>
            <span className="rk-v num">{won(low.amount)}<small>{formatKDate(low.date)}</small></span>
          </div>
        </div>
        <p className="muted-note">
          {negative
            ? `${formatKDate(negative)}에 잔고가 0원 아래로 내려가요. 그 전에 쓰는 돈을 조금 줄여야 해요.`
            : '사고 싶은 게 생기면 사기 전에 비교해 보세요. 산 나와 안 산 나의 월말을 나란히 보여드려요.'}
        </p>
      </div>
    </>
  );
}
