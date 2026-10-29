import { createContext, useCallback, useContext, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { wonShort } from '../../shared/format';
import { IconAlert, IconBack, IconCheck, IconClose, IconInfo } from './Icons';

/* ── 키보드가 올라와도 하단 버튼이 가려지지 않도록 ── */
export function useKeyboardInset() {
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const inset = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      const kb = inset > 80 ? inset : 0;
      document.documentElement.style.setProperty('--kb', `${kb}px`);
      document.documentElement.classList.toggle('kb-open', kb > 0);
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    onResize();
    return () => {
      vv.removeEventListener('resize', onResize);
      vv.removeEventListener('scroll', onResize);
    };
  }, []);
}

export function TopBar({ title, onBack, right, center }: { title?: ReactNode; onBack?: () => void; right?: ReactNode; center?: boolean }) {
  return (
    <header className={`topbar${onBack ? ' plain' : ''}`}>
      {onBack && (
        <button className="icon-btn" onClick={onBack} aria-label="뒤로 가기">
          <IconBack />
        </button>
      )}
      {center ? <div className="title-center">{title}</div> : <h1>{title}</h1>}
      {right ?? (center && onBack ? <span style={{ width: 44 }} /> : null)}
    </header>
  );
}

export function CtaBar({ children }: { children: ReactNode }) {
  return <div className="cta-bar">{children}</div>;
}

export function Sheet({ title, onClose, children, footer }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      prev?.focus?.();
    };
  }, [onClose]);
  return (
    <>
      <div className="sheet-backdrop" onClick={onClose} />
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby={id} ref={ref} tabIndex={-1}>
        <div className="sheet-head">
          <h2 id={id}>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="닫기">
            <IconClose />
          </button>
        </div>
        <div className="sheet-body">{children}</div>
        {footer && <div className="sheet-foot">{footer}</div>}
      </div>
    </>
  );
}

export function ConfirmSheet({ title, body, confirm, danger, onConfirm, onClose }: { title: string; body: ReactNode; confirm: string; danger?: boolean; onConfirm: () => void; onClose: () => void }) {
  return (
    <Sheet
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost flex" onClick={onClose}>
            취소
          </button>
          <button className={`btn ${danger ? 'danger' : 'primary'} flex`} onClick={onConfirm}>
            {confirm}
          </button>
        </>
      }
    >
      <div className="ink2" style={{ fontSize: 15 }}>{body}</div>
    </Sheet>
  );
}

/** 금액 입력: 숫자만, 콤마 표시, 한글 금액 읽기, 빠른 추가 칩 */
export function AmountInput({
  value,
  onChange,
  label,
  placeholder = '0',
  autoFocus,
  quick = [10000, 50000, 100000],
  allowZero = true,
  max = 10_000_000_000,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  label: string;
  placeholder?: string;
  autoFocus?: boolean;
  quick?: number[];
  allowZero?: boolean;
  max?: number;
}) {
  const id = useId();
  return (
    <div className="amount-input">
      <label htmlFor={id} className="sr-only">{label}</label>
      <div className="amount-field">
      <input
        id={id}
        inputMode="numeric"
        autoComplete="off"
        enterKeyHint="done"
        autoFocus={autoFocus}
        placeholder={placeholder}
        value={value === undefined ? '' : value.toLocaleString('ko-KR')}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, '');
          if (!digits) return onChange(undefined);
          const n = Math.min(Number(digits), max);
          onChange(!allowZero && n === 0 ? undefined : n);
        }}
        className="num"
      />
      <span className="unit">원</span>
      </div>
      <div className="read" aria-live="polite">{value !== undefined && value >= 10000 ? wonShort(value) : ''}</div>
      {quick.length > 0 && (
        <div className="chips">
          {quick.map((q) => (
            <button key={q} type="button" className="chip" onClick={() => onChange(Math.min((value ?? 0) + q, max))}>
              +{wonShort(q).replace('원', '')}
            </button>
          ))}
          {value !== undefined && (
            <button type="button" className="chip" onClick={() => onChange(undefined)}>
              지우기
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function WorldTag({ kind, children }: { kind: 'real' | 'para'; children?: ReactNode }) {
  return (
    <span className={`world-tag ${kind}`}>
      <span className="sym" aria-hidden />
      {children ?? (kind === 'real' ? '지금대로' : '다르게 골랐다면')}
    </span>
  );
}

export function Notice({ kind = 'info', children }: { kind?: 'info' | 'warn' | 'danger' | 'ok' | 'neutral'; children: ReactNode }) {
  const Icon = kind === 'ok' ? IconCheck : kind === 'warn' || kind === 'danger' ? IconAlert : IconInfo;
  return (
    <div className={`notice ${kind}`} role={kind === 'danger' ? 'alert' : undefined}>
      <Icon />
      <div>{children}</div>
    </div>
  );
}

export function Switch({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <span className="switch">
      <input type="checkbox" role="switch" aria-label={label} checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span />
    </span>
  );
}

export function Seg<T extends string>({ value, options, onChange, label }: { value: T; options: { value: T; label: string }[]; onChange: (v: T) => void; label: string }) {
  return (
    <div className="seg" role="group" aria-label={label}>
      {options.map((o) => (
        <button key={o.value} type="button" aria-pressed={o.value === value} onClick={() => onChange(o.value)}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="empty">
      <div className="em-title">{title}</div>
      {children && <div className="small">{children}</div>}
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function Spinner({ label = '불러오는 중' }: { label?: string }) {
  return (
    <span className="row" role="status" style={{ gap: 8 }}>
      <span className="spinner" aria-hidden />
      <span className="small muted">{label}</span>
    </span>
  );
}

/* ── 토스트 ── */
const ToastCtx = createContext<(msg: string) => void>(() => {});
export function ToastProvider({ children }: { children: ReactNode }) {
  const [msg, setMsg] = useState<string | null>(null);
  const t = useRef<number>();
  const show = useCallback((m: string) => {
    setMsg(m);
    window.clearTimeout(t.current);
    t.current = window.setTimeout(() => setMsg(null), 2600);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {msg && (
        <div className="toast" role="status" aria-live="polite">
          {msg}
        </div>
      )}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);
