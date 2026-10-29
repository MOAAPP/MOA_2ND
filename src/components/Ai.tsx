import type { ReactNode } from 'react';
import type { AiSource } from '../lib/ai';

/** AI 표시(반짝이 + AI) */
export function AiMark({ label = 'AI' }: { label?: string }) {
  return (
    <span className="ai-mark">
      <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 2.5l2.1 6.2 6.4 2.3-6.4 2.3L12 19.5l-2.1-6.2L3.5 11l6.4-2.3L12 2.5z" fill="currentColor" />
        <path d="M19 15.5l.9 2.4 2.4.9-2.4.9-.9 2.4-.9-2.4-2.4-.9 2.4-.9.9-2.4z" fill="currentColor" opacity=".7" />
      </svg>
      {label}
    </span>
  );
}

/** 응답 출처 한 줄. 예시 응답이면 그렇다고 적는다. */
export function AiSourceNote({ source }: { source: AiSource }) {
  return <small className="ai-src">{source === 'live' ? 'AI가 만든 답이에요 · 숫자는 앱이 계산해요' : '예시 AI 응답이에요 · 숫자는 앱이 계산해요'}</small>;
}

export function AiLines({ n = 2 }: { n?: number }) {
  return <span className="ai-skel" aria-label="AI가 생각하는 중">{Array.from({ length: n }, (_, i) => <i key={i} style={{ width: `${92 - i * 22}%` }} />)}</span>;
}

/** AI 카드: 제목 줄 + 본문 + 출처. loading이면 스켈레톤. */
export function AiCard({ title, loading, source, children, tone, className = '', foot = true }: {
  title?: ReactNode; loading: boolean; source: AiSource; children?: ReactNode; tone?: 'ok' | 'careful' | 'warn' | 'dark'; className?: string; foot?: boolean;
}) {
  return (
    <section className={`ai-card ${tone ?? ''} ${className}`.trim()} aria-busy={loading}>
      <div className="ai-card-head"><AiMark />{title && <b>{title}</b>}</div>
      <div className="ai-card-body">{loading ? <AiLines /> : children}</div>
      {foot && !loading && <AiSourceNote source={source} />}
    </section>
  );
}
