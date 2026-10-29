import { useMemo, useState } from 'react';
import { diffDays, formatKDate, todayKST } from '../../shared/dates';
import { won, wonShort } from '../../shared/format';
import { AmountInput, Empty, Notice, Seg, Sheet, TopBar, WorldTag } from '../components/ui';
import { recordLabel } from '../lib/cashflow';
import { neededMonthly, projectGoal, type Frequency, type GoalProjection } from '../lib/goals';
import type { Goal } from '../lib/types';
import { useStore } from '../state/store';
import { useNav } from '../state/nav';

function GoalSheet({ goal, onClose, onSave, onDelete }: { goal?: Goal; onClose: () => void; onSave: (g: Goal) => void; onDelete?: () => void }) {
  const [name, setName] = useState(goal?.name ?? '');
  const [target, setTarget] = useState<number | undefined>(goal?.target);
  const [saved, setSaved] = useState<number | undefined>(goal?.saved);
  const [date, setDate] = useState(goal?.targetDate ?? '');
  const [monthly, setMonthly] = useState<number | undefined>(goal?.monthlySaving);
  const ok = name.trim() && target;
  return (
    <Sheet
      title={goal ? '목표 수정' : '목표 만들기'}
      onClose={onClose}
      footer={
        <>
          {onDelete && <button className="btn ghost" onClick={onDelete}>삭제</button>}
          <button className="btn primary flex" disabled={!ok} onClick={() => onSave({ name: name.trim(), target: target!, saved: saved ?? 0, targetDate: date || undefined, monthlySaving: monthly, annualRate: goal?.annualRate ?? 0 })}>저장</button>
        </>
      }
    >
      <label className="field" style={{ marginTop: 4 }}>
        <span className="lab">목표 이름</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 겨울 여행, 비상금" maxLength={20} />
      </label>
      <div className="chips">{['여행비', '비상금', '노트북', '자격증'].map((s) => <button key={s} className="chip" aria-pressed={name === s} onClick={() => setName(s)}>{s}</button>)}</div>
      <div className="field"><span className="lab">목표 금액</span><AmountInput value={target} onChange={setTarget} label="목표 금액" allowZero={false} quick={[500000, 1000000]} /></div>
      <div className="field"><span className="lab">지금까지 모은 돈</span><AmountInput value={saved} onChange={setSaved} label="모은 돈" quick={[]} /></div>
      <div className="field"><span className="lab">매달 목표에 넣을 수 있는 돈</span><AmountInput value={monthly} onChange={setMonthly} label="월 저축액" quick={[50000, 100000]} /><div className="hint">도착 시점 계산에 쓰는 가정이에요.</div></div>
      <label className="field"><span className="lab">목표 날짜 (선택)</span><input className="input" type="date" min={todayKST()} value={date} onChange={(e) => setDate(e.target.value)} /></label>
    </Sheet>
  );
}

function PathChart({ a, b, target }: { a: GoalProjection; b: GoalProjection; target: number }) {
  const W = 340, H = 150, P = 10;
  const n = Math.max(a.path.length, b.path.length, 2) - 1;
  const maxV = Math.max(target, ...a.path.map((p) => p.balance), ...b.path.map((p) => p.balance)) * 1.05;
  const x = (i: number) => P + (i / n) * (W - 2 * P);
  const y = (v: number) => H - 22 - (Math.max(0, v) / maxV) * (H - 40);
  const d = (g: GoalProjection) => g.path.map((p, i) => `${i ? 'L' : 'M'}${x(p.month).toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="fork-chart" role="img" aria-label="목표까지 두 세계의 모이는 속도">
      <line className="minline" x1={P} x2={W - P} y1={y(target)} y2={y(target)} />
      <text x={W - P} y={y(target) - 5} textAnchor="end">목표 {wonShort(target)}</text>
      <path className="real-line" d={d(a)} />
      <path className="para-line" d={d(b)} />
      <text x={P} y={H - 6}>지금</text>
      <text x={W - P} y={H - 6} textAnchor="end">{n}개월 후</text>
    </svg>
  );
}

export function Future() {
  const { state, update } = useStore();
  const nav = useNav();
  const profile = state.profile!;
  const goal = profile.goal;
  const today = todayKST();
  const [edit, setEdit] = useState(false);
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [freq, setFreq] = useState<Frequency>('weekly');
  const [months, setMonths] = useState(6);
  const [dir, setDir] = useState<'save' | 'spend'>('save');
  const [fromRecord, setFromRecord] = useState<string>('');

  const saveGoal = (g: Goal | undefined) => {
    update((s) => ({ ...s, profile: s.profile ? { ...s.profile, goal: g } : s.profile }));
    setEdit(false);
  };

  const buyRecords = state.records.filter((r) => r.choice === 'buy' || r.choice === 'alt');
  const amt = amount ?? 0;

  const proj = useMemo(() => {
    if (!goal) return null;
    const base = { target: goal.target, saved: goal.saved, monthlySaving: goal.monthlySaving ?? 0, annualRate: goal.annualRate ?? 0, today };
    const a = projectGoal(base);
    const b = amt > 0 ? projectGoal({ ...base, extra: { amount: dir === 'save' ? amt : -amt, frequency: freq, months } }) : null;
    return { a, b };
  }, [goal, amt, freq, months, dir, today]);

  if (!goal) {
    return (
      <div className="page">
        <TopBar title="내 목표" onBack={nav.pop} />
        <div className="card">
          <Empty title="목표를 정하면 두 세계의 도착 시점을 비교해요" action={<button className="btn primary" onClick={() => setEdit(true)}>목표 만들기</button>}>
            여행비·비상금·갖고 싶은 물건처럼 모으고 싶은 돈을 정해보세요.
          </Empty>
        </div>
        {edit && <GoalSheet onClose={() => setEdit(false)} onSave={saveGoal} />}
      </div>
    );
  }

  const progress = Math.min(1, goal.saved / goal.target);
  const monthsLeft = goal.targetDate ? Math.max(1, Math.round(diffDays(today, goal.targetDate) / 30.44)) : null;
  const need = monthsLeft ? neededMonthly(goal.target, goal.saved, monthsLeft) : null;
  const diffMonths = proj?.b && proj.a.months !== null && proj.b.months !== null ? proj.a.months - proj.b.months : null;

  return (
    <div className="page">
      <TopBar title="내 목표" onBack={nav.pop} />
      <section className="card">
        <div className="row between">
          <div className="small ink2">목표</div>
          <button className="link-btn" onClick={() => setEdit(true)}>수정</button>
        </div>
        <div className="bold" style={{ fontSize: 20 }}>{goal.name}</div>
        <div className="num" style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em' }}>{won(goal.saved)} <span className="muted" style={{ fontSize: 16, fontWeight: 600 }}>/ {won(goal.target)}</span></div>
        <div className="progress" style={{ height: 8, marginTop: 10 }} role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}><div style={{ width: `${progress * 100}%` }} /></div>
        <div className="row between small" style={{ marginTop: 8 }}>
          <span className="ink2">남은 금액 {won(Math.max(0, goal.target - goal.saved))}</span>
          {goal.targetDate && <span className="muted">목표일 {formatKDate(goal.targetDate, { year: true })}</span>}
        </div>
        {need !== null && <p className="small" style={{ marginBottom: 0 }}>목표일까지 가려면 매달 약 <b>{won(need)}</b>이 필요해요 (이자 미반영).</p>}
      </section>

      <section className="section">
        <div className="section-head"><h2>현재 패턴을 유지한 나</h2></div>
        <div className="world-card real">
          <WorldTag kind="real" />
          {goal.monthlySaving ? (
            <>
              <div className="amount">{proj!.a.arrival ? formatKDate(proj!.a.arrival, { year: true }) : '도착 시점 계산 불가'}</div>
              <div className="cap">매달 {won(goal.monthlySaving)}씩 모은다고 가정{proj!.a.months !== null ? ` · ${proj!.a.months}개월` : ''}</div>
            </>
          ) : (
            <div className="cap" style={{ marginTop: 8 }}>
              매달 목표에 넣을 금액을 정하면 도착 시점을 계산해요. <button className="link-btn" onClick={() => setEdit(true)}>월 저축액 정하기</button>
            </div>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>선택을 바꾼 나</h2></div>
        <div className="card">
          <Seg label="방향" value={dir} onChange={setDir} options={[{ value: 'save', label: '이 소비를 줄이면' }, { value: 'spend', label: '이 소비가 늘면' }]} />
          {buyRecords.length > 0 && (
            <label className="field">
              <span className="lab">내 기록에서 고르기 (선택)</span>
              <select className="select" value={fromRecord} onChange={(e) => {
                setFromRecord(e.target.value);
                const r = state.records.find((x) => x.id === e.target.value);
                if (r) setAmount(r.choice === 'alt' ? r.params.amount - (r.params.altAmount ?? 0) : r.params.amount);
              }}>
                <option value="">직접 입력</option>
                {buyRecords.slice(0, 20).map((r) => <option key={r.id} value={r.id}>{recordLabel(r)} · {won(r.params.amount)}</option>)}
              </select>
            </label>
          )}
          <div className="field"><span className="lab">한 번에 얼마</span><AmountInput value={amount} onChange={(v) => { setAmount(v); setFromRecord(''); }} label="금액" quick={[5000, 10000, 30000]} /></div>
          <div className="field"><span className="lab">얼마나 자주</span><Seg label="반복" value={freq} onChange={setFreq} options={[{ value: 'once', label: '한 번' }, { value: 'weekly', label: '매주' }, { value: 'monthly', label: '매달' }]} /></div>
          {freq !== 'once' && (
            <label className="field">
              <span className="lab">기간</span>
              <select className="select" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
                {[1, 3, 6, 12, 24].map((m) => <option key={m} value={m}>{m}개월 동안</option>)}
              </select>
            </label>
          )}
        </div>

        {proj?.b && goal.monthlySaving ? (
          <div className="card">
            <div className="world-pair">
              <div className="world-card real" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
                <WorldTag kind="real">지금 패턴</WorldTag>
                <div className="amount" style={{ fontSize: 18 }}>{proj.a.arrival ? formatKDate(proj.a.arrival, { year: true }) : '계산 불가'}</div>
              </div>
              <div className="world-card para">
                <WorldTag kind="para">바꾼 나</WorldTag>
                <div className="amount" style={{ fontSize: 18 }}>{proj.b.arrival ? formatKDate(proj.b.arrival, { year: true }) : '계산 불가'}</div>
              </div>
            </div>
            {diffMonths !== null && (
              <p className="bold" style={{ fontSize: 17, margin: '14px 0 4px' }}>
                {diffMonths > 0 ? `약 ${diffMonths}개월 먼저 도착할 수 있어요` : diffMonths < 0 ? `약 ${-diffMonths}개월 늦게 도착해요` : '도착 시점이 같은 달이에요'}
              </p>
            )}
            <PathChart a={proj.a} b={proj.b} target={goal.target} />
            <div className="notice neutral" style={{ marginTop: 10 }}>
              <div className="small">
                <b>가정</b>: 매달 {won(goal.monthlySaving)} 저축 유지 · {dir === 'save' ? '아낀' : '더 쓴'} 돈 {won(amt)}을 {freq === 'once' ? '한 번' : freq === 'weekly' ? `매주(월 평균 4.3회), ${months}개월 동안` : `매달, ${months}개월 동안`} 목표에 {dir === 'save' ? '더 넣음' : '덜 넣음'} · 이자 {goal.annualRate ?? 0}%.
                <br />예상일 뿐, 도착을 보장하지 않아요. 모의투자 자금과 수익은 포함하지 않아요.
              </div>
            </div>
          </div>
        ) : (
          amt > 0 && !goal.monthlySaving && <Notice kind="info">월 저축액을 정하면 비교 결과가 나와요.</Notice>
        )}
      </section>

      {edit && <GoalSheet goal={goal} onClose={() => setEdit(false)} onSave={saveGoal} onDelete={() => saveGoal(undefined)} />}
    </div>
  );
}
