/**
 * v16 디자인 시스템 공통 컴포넌트(ux-v15 토큰 위, 스타일은 src/ux-v16-ds.css, 접두어 d-).
 * 화면마다 따로 만들던 금액 표시·숫자패드·칩을 여기로 모은다.
 */
import type { ReactNode } from 'react';
import { koreanWon, pressKey, type PadKey } from '../lib/numpad';

/** 큰 금액 + 한글 읽기. 0이면 placeholder를 흐리게 보여준다. */
export function AmountText({ value, placeholder = '0', reading = true, tone }: { value: number; placeholder?: string; reading?: boolean; tone?: 'error' }) {
  const empty = value <= 0;
  return (
    <div className={`d-amount ${tone === 'error' ? 'error' : ''}`} aria-live="polite">
      <p className={`d-amount-num num ${empty ? 'empty' : ''}`}>
        {empty ? placeholder : value.toLocaleString('ko-KR')}<span>원</span>
      </p>
      {reading && <p className="d-amount-read">{empty ? ' ' : koreanWon(value)}</p>}
    </div>
  );
}

const KEYS: PadKey[] = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '00', '0', 'back'];

/** 토스식 숫자패드. 키보드 대신 화면 하단에 고정. */
export function NumberPad({ value, onChange, max }: { value: number; onChange: (v: number) => void; max?: number }) {
  return (
    <div className="d-pad" role="group" aria-label="숫자 입력">
      {KEYS.map((k) => (
        <button
          key={k}
          type="button"
          className="d-pad-key num"
          aria-label={k === 'back' ? '지우기' : k}
          onClick={() => onChange(pressKey(value, k, max))}
          onContextMenu={(e) => { if (k === 'back') { e.preventDefault(); onChange(0); } }}
        >
          {k === 'back' ? <BackGlyph /> : k}
        </button>
      ))}
    </div>
  );
}

function BackGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7 6-7Z" />
      <path d="m12.5 9.5 5 5m0-5-5 5" />
    </svg>
  );
}

/** 가로 스크롤 칩 묶음(빠른 금액, 필터 등). */
export function Chips({ children, label }: { children: ReactNode; label?: string }) {
  return <div className="d-chips" role="group" aria-label={label}>{children}</div>;
}

export function Chip({ children, on, onClick }: { children: ReactNode; on?: boolean; onClick?: () => void }) {
  return <button type="button" className={`d-chip ${on ? 'on' : ''}`} aria-pressed={on} onClick={onClick}>{children}</button>;
}

/* ───────── v16 N3 2차: 버튼·카드·리스트·탭·빈 화면·스켈레톤 ───────── */

type ButtonTone = 'primary' | 'secondary' | 'ghost' | 'danger';

/** 높이 56(기본)/44(sm). 한 화면에 primary는 하나만. */
export function Button({ children, tone = 'primary', size, block = true, disabled, onClick, type = 'button', label }: {
  children: ReactNode; tone?: ButtonTone; size?: 'sm'; block?: boolean; disabled?: boolean; onClick?: () => void; type?: 'button' | 'submit'; label?: string;
}) {
  return (
    <button type={type} aria-label={label} className={`d-btn ${tone}${size === 'sm' ? ' sm' : ''}${block ? ' block' : ''}`} disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}

/** 버튼 두 개를 나란히(보조 1 : 주 1.6) */
export function ButtonRow({ children }: { children: ReactNode }) {
  return <div className="d-btn-row">{children}</div>;
}

/** 흰 카드. 카드 안에 카드를 넣지 않는다(ux-v15 원칙 2). */
export function Card({ title, action, children, tone, className = '' }: { title?: ReactNode; action?: ReactNode; children: ReactNode; tone?: 'universe'; className?: string }) {
  return (
    <section className={`d-card${tone ? ` ${tone}` : ''} ${className}`.trim()}>
      {(title || action) && <div className="d-card-head">{title && <h2>{title}</h2>}{action}</div>}
      {children}
    </section>
  );
}

/** 왼쪽 아이콘 · 가운데 제목/설명 · 오른쪽 금액. onClick이 있으면 버튼. */
export function ListRow({ icon, title, sub, right, rightSub, onClick, tone }: {
  icon?: ReactNode; title: ReactNode; sub?: ReactNode; right?: ReactNode; rightSub?: ReactNode; onClick?: () => void; tone?: 'pos' | 'neg';
}) {
  const body = (
    <>
      {icon && <span className="d-row-icon" aria-hidden="true">{icon}</span>}
      <span className="d-row-main"><b>{title}</b>{sub && <small>{sub}</small>}</span>
      {(right !== undefined || rightSub) && (
        <span className="d-row-right">
          {right !== undefined && <b className={`num${tone ? ` ${tone}` : ''}`}>{right}</b>}
          {rightSub && <small>{rightSub}</small>}
        </span>
      )}
    </>
  );
  return onClick ? <button type="button" className="d-row tap" onClick={onClick}>{body}</button> : <div className="d-row">{body}</div>;
}

/** 세그먼트 탭(2~4개) */
export function Tabs<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="d-tabs" role="tablist" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" role="tab" aria-selected={o.value === value} onClick={() => onChange(o.value)}>{o.label}</button>
      ))}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="d-empty">
      <span className="d-empty-mark" aria-hidden="true" />
      <b>{title}</b>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

/** 로딩 자리표시. lines 줄만큼 회색 막대. */
export function Skeleton({ lines = 3, label = '불러오는 중' }: { lines?: number; label?: string }) {
  return (
    <div className="d-skel" role="status" aria-label={label}>
      {Array.from({ length: lines }, (_, i) => <span key={i} style={{ width: `${i === lines - 1 ? 55 : 100 - i * 8}%` }} />)}
    </div>
  );
}

/** 금액: 숫자는 디스플레이 서체, '원'은 작게. sign은 부호를 강제로 붙일 때. */
export function Won({ n, sign }: { n: number; sign?: '+' | '−' }) {
  const neg = n < 0;
  const mark = sign ?? (neg ? '−' : '');
  return <span className="d-won"><span className="d-won-n">{mark}{Math.abs(Math.round(n)).toLocaleString('ko-KR')}</span><span className="d-won-u">원</span></span>;
}
