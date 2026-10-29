import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { addDays, addMonths, formatKDate, todayKST, weekdayOf, type ISODate } from '../../shared/dates';
import { CATEGORIES } from '../lib/categories';
import { useClassifier } from '../lib/ml/provider';
import { CONFIDENCE_ASK } from '../lib/ml/types';
import { CategoryIcon } from './CategoryIcon';
import { IconTile } from './Glyph';
import { IconCheck, IconChevron } from './Icons';
import { Sheet } from './ui';

/* 입력 부품: 한 화면에 질문 하나, 답은 큰 버튼으로 */

export function StepHead({ title, desc }: { title: ReactNode; desc?: ReactNode }) {
  return (
    <div className="step-head">
      <h1 className="step-title">{title}</h1>
      {desc && <p className="step-desc">{desc}</p>}
    </div>
  );
}

export interface Opt<T> {
  value: T;
  label: ReactNode;
  sub?: ReactNode;
  icon?: ReactNode;
}

/** 큰 선택지 목록 (하나 고르기) */
export function OptionList<T extends string | number>({ options, value, onPick, label }: { options: Opt<T>[]; value: T | undefined | null; onPick: (v: T) => void; label: string }) {
  return (
    <div className="opt-list" role="radiogroup" aria-label={label}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button key={String(o.value)} type="button" role="radio" aria-checked={on} className={`opt${on ? ' on' : ''}`} onClick={() => onPick(o.value)}>
            {o.icon && <span className="opt-icon">{o.icon}</span>}
            <span className="opt-text">
              <span className="opt-label">{o.label}</span>
              {o.sub && <span className="opt-sub">{o.sub}</span>}
            </span>
            <span className="opt-check" aria-hidden>{on && <IconCheck />}</span>
          </button>
        );
      })}
    </div>
  );
}

/** 앞에서 답한 내용. 누르면 그 질문으로 돌아간다 */
export function AnswerChips({ items }: { items: { label: ReactNode; onClick: () => void }[] }) {
  if (!items.length) return null;
  return (
    <div className="answers">
      {items.map((it, i) => (
        <button key={i} type="button" className="answer" onClick={it.onClick}>
          {it.label}
        </button>
      ))}
    </div>
  );
}

/* 카테고리: 이름으로 알아서 고르고, 다르면 눌러서 바꾼다 */
export function CategoryPill({
  name,
  value,
  onChange,
  memory,
  userPicked,
}: {
  name: string;
  value: string;
  onChange: (c: string, by: 'auto' | 'user') => void;
  memory: Record<string, string>;
  userPicked: boolean;
}) {
  const { result, pending } = useClassifier(name, memory);
  const [open, setOpen] = useState(false);
  const lastAuto = useRef<string | null>(null);
  const sure = !!result && result.confidence >= CONFIDENCE_ASK;

  useEffect(() => {
    if (!result || userPicked || !sure) return;
    if (result.category !== lastAuto.current) {
      lastAuto.current = result.category;
      onChange(result.category, 'auto');
    }
  }, [result, sure, userPicked, onChange]);

  const ask = !userPicked && name.trim().length >= 2 && !pending && !!result && !sure;

  return (
    <>
      <button type="button" className={`cat-row${ask ? ' ask' : ''}`} onClick={() => setOpen(true)}>
        {ask ? <span className="cat-icon q" aria-hidden>?</span> : <CategoryIcon category={value} size={40} />}
        <span className="cat-name">{ask ? '어떤 종류인지 골라주세요' : value}</span>
        <span className="cat-change">
          {ask ? '고르기' : '바꾸기'}
          <IconChevron width={16} height={16} />
        </span>
      </button>
      {open && (
        <Sheet title="어떤 종류인가요?" onClose={() => setOpen(false)}>
          <div className="cat-grid">
            {CATEGORIES.map((c) => (
              <button
                key={c}
                type="button"
                className={`cat-tile${value === c && !ask ? ' on' : ''}`}
                onClick={() => {
                  onChange(c, 'user');
                  setOpen(false);
                }}
              >
                <CategoryIcon category={c} size={44} />
                <span>{c}</span>
              </button>
            ))}
          </div>
          {name.trim() && <p className="sheet-note">고른 종류는 ‘{name.trim()}’에 기억해둘게요.</p>}
        </Sheet>
      )}
    </>
  );
}

/* 날짜: 자주 고르는 날은 버튼으로, 나머지만 달력 */
export function nextWeekend(from: ISODate): ISODate {
  const w = weekdayOf(from);
  return w === 6 ? from : addDays(from, (6 - w + 7) % 7 || 7);
}

export function QuickDate({
  value,
  onChange,
  min,
  max,
  options,
}: {
  value: ISODate;
  onChange: (d: ISODate) => void;
  min?: ISODate;
  max?: ISODate;
  options: { label: string; date: ISODate }[];
}) {
  const id = useId();
  const [picker, setPicker] = useState(() => !options.some((o) => o.date === value));
  return (
    <div>
      <div className="date-grid">
        {options.map((o) => (
          <button
            key={o.label}
            type="button"
            className={`date-btn${o.date === value && !picker ? ' on' : ''}`}
            onClick={() => {
              setPicker(false);
              onChange(o.date);
            }}
          >
            <b>{o.label}</b>
            <span>{formatKDate(o.date, { weekday: true })}</span>
          </button>
        ))}
        <button type="button" className={`date-btn${picker ? ' on' : ''}`} onClick={() => setPicker(true)}>
          <b>다른 날</b>
          <span>{picker ? formatKDate(value, { weekday: true }) : '달력에서 고르기'}</span>
        </button>
      </div>
      {picker && (
        <label htmlFor={id} className="date-picker">
          <span className="sr-only">날짜</span>
          <input id={id} className="input" type="date" min={min} max={max} value={value} onChange={(e) => e.target.value && onChange(e.target.value)} />
        </label>
      )}
    </div>
  );
}

/** 살 날 후보: 오늘, 이번 주말, 다음 수입 다음 날(없으면 한 달 뒤) */
export function purchaseDateOptions(nextIncome: ISODate | null, incomeName: string | null, today = todayKST()) {
  const opts: { label: string; date: ISODate }[] = [
    { label: '오늘', date: today },
    { label: '이번 주말', date: nextWeekend(today) },
  ];
  if (nextIncome && nextIncome > today) opts.push({ label: `${incomeName ?? '수입'} 들어온 뒤`, date: addDays(nextIncome, 1) });
  else opts.push({ label: '한 달 뒤', date: addMonths(today, 1) });
  return opts;
}

/* 사진으로 입력 */
export function PhotoButton({ onFile, label }: { onFile: (f: File) => void; label: string }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFile(f);
          e.target.value = '';
        }}
      />
      <button type="button" className="photo-btn" onClick={() => ref.current?.click()}>
        <IconTile name="camera" tone="teal" size={30} radius={10} />
        {label}
      </button>
    </>
  );
}
