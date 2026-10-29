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
