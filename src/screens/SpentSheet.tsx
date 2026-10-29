import { useCallback, useState } from 'react';
import { addDays, formatKDate, todayKST } from '../../shared/dates';
import { CategoryPill, PhotoButton, QuickDate } from '../components/flow';
import { usePhotoReader } from '../components/PhotoReader';
import { AmountInput, Sheet, Switch, useToast } from '../components/ui';
import { isPrimaryReflected } from '../lib/cashflow';
import { uid } from '../lib/id';
import type { DecisionRecord } from '../lib/types';
import { rememberCategory, useStore } from '../state/store';

/** 쓴 돈 기록. 금액, 무엇, 언제만 묻고 나머지는 알아서 */
export function SpentSheet({ onClose }: { onClose: () => void }) {
  const { state, update } = useStore();
  const toast = useToast();
  const profile = state.profile!;
  const today = todayKST();
  const [amount, setAmount] = useState<number | undefined>();
  const [name, setName] = useState('');
  const [category, setCategory] = useState('식비');
  const [userPicked, setUserPicked] = useState(false);
  const [date, setDate] = useState(today);
  const [more, setMore] = useState(false);
  const [override, setOverride] = useState<boolean | null>(null);
  const [inParallel, setInParallel] = useState(false);
  const [saving, setSaving] = useState(false);

  const onCategory = useCallback((c: string, by: 'auto' | 'user') => {
    setCategory(c);
    if (by === 'user') setUserPicked(true);
  }, []);
  const photo = usePhotoReader((r) => {
    setAmount(r.amount);
    if (r.name) setName(r.name);
  });

  const draft: DecisionRecord = {
    id: 'draft',
    createdAt: Date.now(),
    source: 'spent',
    category,
    name: name.trim() || undefined,
    params: { amount: amount ?? 0, date },
    choice: 'buy',
    reflectedOverride: override,
    inParallel,
    parallelAs: 'skip',
  };
  const reflected = isPrimaryReflected(draft, profile);

  const save = () => {
    if (!amount || saving) return;
    setSaving(true);
    const rec: DecisionRecord = { ...draft, id: uid('rec'), createdAt: Date.now(), choiceAt: Date.now() };
    update((s) => {
      const next = { ...s, records: [rec, ...s.records] };
      return userPicked && name.trim() ? rememberCategory(next, name, category) : next;
    });
    toast('기록했어요');
    onClose();
  };

  return (
    <Sheet
      title="쓴 돈 기록"
      onClose={onClose}
      footer={
        <button className="btn primary block" disabled={!amount || saving} onClick={save}>
          기록하기
        </button>
      }
    >
      <AmountInput value={amount} onChange={setAmount} label="쓴 금액" autoFocus allowZero={false} quick={[]} />
      <div className="amount-tools">
        <PhotoButton label="영수증으로 입력" onFile={photo.read} />
      </div>

      <label className="field">
        <span className="lab">어디에 썼어요?</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="점심, 아메리카노, 택시" maxLength={30} />
      </label>
      <CategoryPill name={name} value={category} onChange={onCategory} memory={state.categoryMemory} userPicked={userPicked} />

      <div className="field">
        <span className="lab">언제요?</span>
        <QuickDate
          value={date}
          max={today}
          onChange={(d) => {
            setDate(d);
            setOverride(null);
          }}
          options={[
            { label: '오늘', date: today },
            { label: '어제', date: addDays(today, -1) },
            { label: '그저께', date: addDays(today, -2) },
          ]}
        />
      </div>

      {more ? (
        <div className="field">
          {date <= profile.baseDate && (
            <div className="row between" style={{ padding: '10px 0' }}>
              <div>
                <div className="bold" style={{ fontSize: 15 }}>잔고에 이미 빠져 있어요</div>
                <div className="small muted">{formatKDate(profile.baseDate)}에 입력한 잔고에 포함돼 있으면 켜두세요.</div>
              </div>
              <Switch label="잔고에 이미 빠져 있어요" checked={reflected} onChange={(v) => setOverride(v)} />
            </div>
          )}
          <div className="row between" style={{ padding: '10px 0' }}>
            <div>
              <div className="bold" style={{ fontSize: 15 }}>안 썼다면? 그래프에 넣기</div>
              <div className="small muted">홈 그래프에서 이 돈을 안 쓴 나와 비교해요.</div>
            </div>
            <Switch label="안 썼다면 그래프에 넣기" checked={inParallel} onChange={setInParallel} />
          </div>
        </div>
      ) : (
        <button className="link-btn" style={{ marginTop: 12, color: 'var(--ink-3)' }} onClick={() => setMore(true)}>
          더 설정하기
        </button>
      )}
      {photo.sheet}
    </Sheet>
  );
}
