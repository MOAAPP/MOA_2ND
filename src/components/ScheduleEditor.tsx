import { useState } from 'react';
import { formatKDate, todayKST } from '../../shared/dates';
import { won } from '../../shared/format';
import { nextOccurrence } from '../lib/cashflow';
import { uid } from '../lib/id';
import type { ScheduleItem } from '../lib/types';
import { IconPlus } from './Icons';
import { AmountInput, Sheet } from './ui';


export function scheduleText(item: ScheduleItem): string {
  if (item.recurrence === 'once') return item.date ? `${formatKDate(item.date)} 한 번` : '날짜 미정';
  return item.day === 31 ? '매월 말일' : `매월 ${item.day}일`;
}

export function ScheduleList({ kind, items, onChange }: { kind: 'income' | 'expense'; items: ScheduleItem[]; onChange: (items: ScheduleItem[]) => void }) {
  const [editing, setEditing] = useState<ScheduleItem | 'new' | null>(null);
  const today = todayKST();
  return (
    <div>
      {items.length > 0 && (
        <ul className="list card" style={{ padding: '4px 18px', marginTop: 20 }}>
          {items.map((it) => {
            const next = nextOccurrence(it, today);
            return (
              <li key={it.id}>
                <button className="list-item" onClick={() => setEditing(it)}>
                  <div className="grow">
                    <div className="t">{it.name}</div>
                    <div className="s">
                      {scheduleText(it)}
                      {next && it.recurrence === 'monthly' ? ` · 다음 ${formatKDate(next)}` : ''}
                    </div>
                  </div>
                  <div className={`bold num ${kind === 'income' ? '' : ''}`}>
                    {kind === 'income' ? '+' : '−'}
                    {won(it.amount)}
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <button className="btn ghost block" style={{ marginTop: 12 }} onClick={() => setEditing('new')}>
        <IconPlus /> {kind === 'income' ? '들어올 돈 추가' : '나갈 돈 추가'}
      </button>
      {editing && (
        <ScheduleSheet
          kind={kind}
          item={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSave={(it) => {
            onChange(editing === 'new' ? [...items, it] : items.map((x) => (x.id === it.id ? it : x)));
            setEditing(null);
          }}
          onDelete={
            editing !== 'new'
              ? () => {
                  onChange(items.filter((x) => x.id !== editing.id));
                  setEditing(null);
                }
              : undefined
          }
        />
      )}
    </div>
  );
}

export function ScheduleSheet({ kind, item, preset, onClose, onSave, onDelete }: { kind: 'income' | 'expense'; item: ScheduleItem | null; preset?: { name: string; day: number }; onClose: () => void; onSave: (i: ScheduleItem) => void; onDelete?: () => void }) {
  const [name, setName] = useState(item?.name ?? preset?.name ?? '');
  const [amount, setAmount] = useState<number | undefined>(item?.amount);
  const [rec, setRec] = useState<'monthly' | 'once'>(item?.recurrence ?? 'monthly');
  const [day, setDay] = useState<number>(item?.day ?? preset?.day ?? 25);
  const [date, setDate] = useState<string>(item?.date ?? todayKST());
  const [touched, setTouched] = useState(false);
  const valid = name.trim().length > 0 && !!amount && amount > 0 && (rec === 'monthly' || !!date);
  const save = () => {
    setTouched(true);
    if (!valid) return;
    onSave({ id: item?.id ?? uid('it'), kind, name: name.trim(), amount: amount!, recurrence: rec, day: rec === 'monthly' ? day : undefined, date: rec === 'once' ? date : undefined });
  };
  const QUICK_DAYS = [1, 5, 10, 15, 20, 25, 31];
  const title = item ? item.name : preset ? preset.name : kind === 'income' ? '들어오는 돈' : '나가는 돈';
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <>
          {onDelete && (
            <button className="btn ghost" onClick={onDelete}>
              삭제
            </button>
          )}
          <button className="btn primary flex" onClick={save}>
            {item ? '저장' : '추가하기'}
          </button>
        </>
      }
    >
      {!preset && !item && (
        <label className="field" style={{ marginTop: 4 }}>
          <span className="lab">이름</span>
          <input className={`input${touched && !name.trim() ? ' err' : ''}`} value={name} onChange={(e) => setName(e.target.value)} placeholder={kind === 'income' ? '용돈' : '월세'} maxLength={20} autoFocus />
        </label>
      )}
      <div className="field" style={preset || item ? { marginTop: 4 } : undefined}>
        <span className="lab">얼마예요?</span>
        <AmountInput value={amount} onChange={setAmount} label="금액" allowZero={false} quick={[]} autoFocus={!!(preset || item)} />
        {touched && !amount && <div className="error">금액을 넣어주세요.</div>}
      </div>
      <div className="field">
        <span className="lab">{rec === 'monthly' ? (kind === 'income' ? '매달 며칠에 들어와요?' : '매달 며칠에 나가요?') : '언제요?'}</span>
        {rec === 'monthly' ? (
          <>
            <div className="day-chips">
              {QUICK_DAYS.map((d) => (
                <button key={d} type="button" aria-pressed={day === d} onClick={() => setDay(d)}>{d === 31 ? '말일' : `${d}일`}</button>
              ))}
              <select className="select" style={{ minHeight: 44, borderRadius: 12, fontSize: 15, padding: '0 8px' }} value={QUICK_DAYS.includes(day) ? '' : day} onChange={(e) => e.target.value && setDay(Number(e.target.value))} aria-label="다른 날짜">
                <option value="">그 외</option>
                {Array.from({ length: 30 }, (_, i) => i + 1).filter((d) => !QUICK_DAYS.includes(d)).map((d) => <option key={d} value={d}>{d}일</option>)}
              </select>
            </div>
          </>
        ) : (
          <input className="input" type="date" value={date} min={todayKST()} onChange={(e) => setDate(e.target.value)} />
        )}
        <button type="button" className="link-btn" style={{ fontSize: 14, color: 'var(--ink-3)' }} onClick={() => setRec(rec === 'monthly' ? 'once' : 'monthly')}>
          {rec === 'monthly' ? '이번 한 번만 있는 돈이에요' : '매달 있는 돈이에요'}
        </button>
      </div>
    </Sheet>
  );
}
