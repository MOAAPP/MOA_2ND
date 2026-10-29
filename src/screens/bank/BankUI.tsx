import type { ReactNode } from 'react';
import { diffDays, formatKDate, parseISO, type ISODate } from '../../../shared/dates';
import { won } from '../../../shared/format';
import { BANKS, maxRate, type Product } from '../../lib/bank/products';
import { ratePct } from '../../lib/bank/money';
import type { PrefStatus } from '../../lib/bank/engine';
import { IconCheck, IconChevron } from '../../components/Icons';

export const fmtWon = (n: number) => won(Math.max(0, Math.round(n)));

export function BankMark({ bankId, size = 44 }: { bankId: string; size?: number }) {
  const b = BANKS[bankId];
  return (
    <span className="b-mark" style={{ width: size, height: size, background: `${b?.color ?? '#3182F6'}1A`, color: b?.color ?? '#3182F6', fontSize: size * 0.32 }} aria-hidden="true">
      {b?.short ?? '?'}
    </span>
  );
}

export function dday(today: ISODate, target: ISODate): string {
  const d = diffDays(today, target);
  if (d === 0) return 'D-DAY';
  return d > 0 ? `D-${d}` : `D+${-d}`;
}

export const dotDate = (iso: ISODate) => {
  const { y, m, d } = parseISO(iso);
  return `${y}.${m}.${d}`;
};

export function ProductRow({ p, onClick }: { p: Product; onClick: () => void }) {
  const base = Math.max(...p.rates.map((r) => r.base));
  const terms = p.rates.map((r) => `${r.months}개월`).join('·');
  return (
    <button className="t-row b-prod-row" onClick={onClick}>
      <BankMark bankId={p.bank} />
      <span className="t-row-main">
        <b>{p.name}</b>
        <small>{BANKS[p.bank]?.name} · {terms}</small>
        {p.tags.length > 0 && <span className="b-tags">{p.tags.slice(0, 2).map((t) => <em key={t}>{t}</em>)}</span>}
      </span>
      <span className="b-rate-col">
        <b className="num">최고 {ratePct(maxRate(p))}</b>
        <small className="num">기본 {ratePct(base)}</small>
      </span>
    </button>
  );
}

export function PrefList({ prefs, mode }: { prefs: PrefStatus[]; mode: 'join' | 'account' }) {
  if (!prefs.length) return <p className="t-note">이 상품은 우대조건이 없어요. 가입하는 순간 금리가 정해져요.</p>;
  return (
    <ul className="b-prefs">
      {prefs.map((x) => (
        <li key={x.id} className={x.achieved ? 'done' : ''}>
          <span className="b-pref-check" aria-hidden="true">{x.achieved ? <IconCheck /> : null}</span>
          <span className="b-pref-main">
            <b>{x.label}</b>
            {x.progress && (
              <span className="b-pref-bar" role="img" aria-label={`${x.progress.now}/${x.progress.goal}`}>
                <i style={{ width: `${Math.min(100, (100 * x.progress.now) / x.progress.goal)}%` }} />
              </span>
            )}
            <small>
              {x.achieved ? (mode === 'join' ? '지금 조건을 채웠어요' : '달성했어요') : x.progress ? `${x.progress.now} / ${x.progress.goal}` : '아직이에요'}
            </small>
          </span>
          <span className={`b-pref-bonus num ${x.achieved ? 'on' : ''}`}>+{x.bonus.toFixed(1)}%p</span>
        </li>
      ))}
    </ul>
  );
}

export function KV({ k, v, tone, sub }: { k: ReactNode; v: ReactNode; tone?: 'pos' | 'neg' | 'strong'; sub?: ReactNode }) {
  return (
    <div>
      <dt>{k}{sub && <small>{sub}</small>}</dt>
      <dd className={`num ${tone ?? ''}`}>{v}</dd>
    </div>
  );
}

export function SectionLink({ title, more, onClick }: { title: string; more?: string; onClick?: () => void }) {
  return (
    <div className="t-card-head">
      <h2>{title}</h2>
      {more && onClick && <button className="t-more as-btn" onClick={onClick}>{more}<IconChevron /></button>}
    </div>
  );
}

export const kDate = (iso: ISODate) => formatKDate(iso, { year: true });
