import { useMemo } from 'react';
import type { ISODate } from '../../../shared/dates';
import { assessRisk, GRADE_RANK, type Line } from '../../lib/moa';
import { useNav } from '../../state/nav';
import { useMoa } from '../../state/moa';
import { fmt, GradeBadge, md } from './parts';

/**
 * 산 나 / 안 산 나의 필수결제일 등급 비교 (체크카드로 결제일에 바로 빠진다고 가정).
 * 확률 대신 등록 일정·기본·상단 지출·입금 지연·복합 시나리오 등급으로 보여준다.
 */
export function PaymentGradeCompare({ amount, date, installments }: { amount: number; date: ISODate; installments?: number }) {
  const nav = useNav();
  const { moa, now, today, report } = useMoa();
  const buy = useMemo(() => {
    const n = installments && installments >= 2 ? installments : 1;
    const extra: Line[] = [{ date: date < today ? today : date, amount: -Math.round(amount / n), label: '이 소비', source: 'txn', certainty: 'confirmed', essential: false }];
    return assessRisk(moa, now, today, { extraLines: extra });
  }, [moa, now, today, amount, date, installments]);
  if (!report.hasAnchor) return null;
  const a = buy.worst, b = report.worst;
  return (
    <section className="blk">
      <div className="block-head"><h2>14일 안 필수결제일은</h2></div>
      {a || b ? (
        <dl className="kv-rows">
          <div className="head"><dt /><dd>사면</dd><dd className="para">안 사면</dd></div>
          <div><dt>가장 위험한 결제</dt><dd>{a ? <GradeBadge grade={a.grade} /> : '—'}</dd><dd>{b ? <GradeBadge grade={b.grade} /> : '—'}</dd></div>
          <div><dt>그날 출금 뒤 (기본)</dt><dd className="num">{a ? fmt(a.balances.base) : '—'}<small>{a ? `${md(a.date)} ${a.name}` : ''}</small></dd><dd className="num">{b ? fmt(b.balances.base) : '—'}<small>{b ? `${md(b.date)} ${b.name}` : ''}</small></dd></div>
        </dl>
      ) : <p className="sheet-text">14일 안에 등록된 필수결제가 없어요.</p>}
      {a && b && GRADE_RANK[a.grade] > GRADE_RANK[b.grade] && <p className="sheet-text">사면 등급이 올라가요. 신용카드로 사면 출금일이 달라져서 결과가 바뀔 수 있어요.</p>}
      <button className="btn secondary block sm" style={{ marginTop: 12 }} onClick={() => nav.push({ name: 'shortfall' })}>결제 수단별로 자세히 보기</button>
    </section>
  );
}
