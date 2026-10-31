import { useMemo, useState } from 'react';
import { addDays, formatKDate, formatKDateTime } from '../../../shared/dates';
import { Button, Chip, Chips, NumberPad } from '../../components/ds';
import { Sheet, TopBar } from '../../components/ui';
import {
  assessRisk,
  billingDate,
  GRADE_LABEL,
  GRADE_RANK,
  METHOD_LABEL,
  paymentSentence,
  setAnchor,
  type Line,
  type PaymentCheck,
  type ScenarioKey,
} from '../../lib/moa';
import { useNav } from '../../state/nav';
import { useMoa } from '../../state/moa';
import { AiLabel, BalanceChart, fmt, GradeBadge, HelpCard, md } from './parts';

/**
 * 부족 가능일 상세 — 근거, 시나리오 전환(급여 지연), 살까 말까(결제 수단별).
 * 시연 시나리오 2~5단계가 이 화면에서 이어진다.
 */
export function Shortfall() {
  const nav = useNav();
  const { moa, report, now, today, set } = useMoa();
  const [view, setView] = useState<'onTime' | 'late'>('onTime');
  const [what, setWhat] = useState<{ amount: number; method: 'debit' | 'credit' } | null>(null);
  const [whatOpen, setWhatOpen] = useState(false);
  const [balOpen, setBalOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(null);

  const credit = moa.cards.find((c) => c.kind === 'credit' && c.payDay && c.cutoffDay);
  const extra: Line[] | null = useMemo(() => {
    if (!what || !what.amount) return null;
    if (what.method === 'credit' && credit) return [{ date: billingDate(credit, today), amount: -what.amount, label: '살까 말까', source: 'card_bill', certainty: 'confirmed', essential: false, cardId: credit.id }];
    return [{ date: today, amount: -what.amount, label: '살까 말까', source: 'txn', certainty: 'confirmed', essential: false }];
  }, [what, credit, today]);
  const withBuy = useMemo(() => (extra ? assessRisk(moa, now, today, { extraLines: extra }) : null), [extra, moa, now, today]);

  const until = addDays(today, 14);
  const keys: ScenarioKey[] = view === 'late' ? ['delay', 'combo'] : report.forecast.ready.ready ? ['base', 'high'] : ['registered'];
  const shown = withBuy ?? report;
  const focus = (sel && shown.payments.find((p) => p.key === sel)) || shown.worst;
  const focusBefore = focus ? report.payments.find((p) => p.key === focus.key) : null;
  const ev = report.evidence;

  return (
    <div className="page t-page mo-page">
      <TopBar onBack={nav.pop} title="결제일 잔고" />
      {!report.hasAnchor ? (
        <section className="t-card"><p>결제계좌 잔액을 먼저 알려주세요.</p><Button onClick={() => nav.replace({ name: 'moaSetup' })}>설정하기</Button></section>
      ) : (
        <>
          <section className={`t-card mo-hero ${focus ? `g-${focus.grade}` : ''}`}>
            {focus ? (
              <>
                <GradeBadge grade={focus.grade} />
                <h1>{paymentSentence(focus, report.delayDays).title}</h1>
                <p>{paymentSentence(focus, report.delayDays).body}</p>
                {withBuy && focusBefore && focusBefore.grade !== focus.grade && (
                  <p className="mo-shift">살 때 <b>{GRADE_LABEL[focus.grade]}</b> · 참으면 <b>{GRADE_LABEL[focusBefore.grade]}</b></p>
                )}
              </>
            ) : <h1>14일 안에 등록된 필수결제가 없어요</h1>}
          </section>

          <section className="t-card">
            <div className="t-card-head"><h2>결제계좌 잔고 흐름</h2></div>
            <Chips label="입금 시나리오">
              <Chip on={view === 'onTime'} onClick={() => setView('onTime')}>입금 예정대로</Chip>
              <Chip on={view === 'late'} onClick={() => setView('late')}>입금 {report.delayDays}일 지연</Chip>
            </Chips>
            <BalanceChart series={shown.series} keys={keys} payments={shown.payments} from={today} until={until}
              alt={withBuy ? { days: (view === 'late' ? report.series.delay : report.forecast.ready.ready ? report.series.base : report.series.registered), label: '참으면' } : undefined} />
            <p className="mo-fine">30일 흐름은 참고용이고, 판단은 14일 안 결제일만 해요. 확률은 쓰지 않고 '평소보다 많이 쓰는 경우'로만 보여드려요.</p>
          </section>

          <section className="t-card">
            <div className="t-card-head"><h2>필수결제</h2></div>
            <ul className="mo-pays">
              {shown.payments.map((p) => (
                <li key={p.key}>
                  <button className={sel === p.key || (!sel && focus?.key === p.key) ? 'on' : ''} onClick={() => setSel(p.key)}>
                    <span><b>{md(p.date)} {p.name}</b><small>D-{p.daysUntil} · {fmt(p.amount)}</small></span>
                    <GradeBadge grade={p.grade} />
                  </button>
                </li>
              ))}
              {!shown.payments.length && <li className="t-empty">등록된 필수결제가 없어요.</li>}
            </ul>
            {focus && <ScenarioTable p={focus} delay={report.delayDays} />}
          </section>

          <section className="t-card">
            <div className="t-card-head"><h2>살까 말까</h2></div>
            {what ? (
              <div className="mo-what">
                <p><b>{fmt(what.amount)}</b> · {METHOD_LABEL[what.method]}</p>
                {what.method === 'credit' && credit && <p className="mo-fine">{credit.name} 출금일 {formatKDate(billingDate(credit, today))}에 청구돼요.{billingDate(credit, today) > until ? ' 이번 14일 결제일에는 영향이 없고 다음 카드값에 더해져요.' : ''}</p>}
                {what.method === 'credit' && !credit && <p className="mo-warn">신용카드 결제일을 등록하면 출금일을 정확히 계산해요. 지금은 오늘 빠지는 것으로 봤어요.</p>}
                <Chips label="결제 수단">
                  <Chip on={what.method === 'debit'} onClick={() => setWhat({ ...what, method: 'debit' })}>체크카드</Chip>
                  <Chip on={what.method === 'credit'} onClick={() => setWhat({ ...what, method: 'credit' })}>신용카드</Chip>
                </Chips>
                <div className="mo-row">
                  <Button tone="secondary" onClick={() => setWhat(null)}>참았어요</Button>
                  <Button tone="secondary" onClick={() => setWhatOpen(true)}>금액 바꾸기</Button>
                </div>
              </div>
            ) : (
              <>
                <p className="mo-fine">큰 지출 전에 넣어 보면 잔고 그래프가 두 갈래로 나뉘어요. 기록에는 남지 않아요.</p>
                <Button onClick={() => setWhatOpen(true)}>금액 넣어 보기</Button>
              </>
            )}
          </section>

          <section className="t-card">
            <div className="t-card-head"><h2>근거</h2><AiLabel>숫자는 모두 계산값</AiLabel></div>
            <dl className="mo-kv">
              <div><dt>결제계좌 잔액 확인</dt><dd>{fmt(report.anchorBalance ?? 0)}<small>{report.anchorAt ? formatKDateTime(report.anchorAt) : ''}{moa.anchor?.source === 'sms' ? ' · 문자' : ' · 직접 입력'}</small></dd></div>
              <div><dt>14일 안 확정·등록 출금</dt><dd>{fmt(ev.confirmedOut)}</dd></div>
              <div><dt>14일 안 예상 변동 지출 (결제계좌분)</dt><dd>{report.forecast.ready.ready ? fmt(ev.forecastOut) : '예측 전'}<small>{report.forecast.ready.message}</small></dd></div>
              <div><dt>예정 입금</dt><dd>{ev.scheduledIn.length ? ev.scheduledIn.map((x) => `${md(x.date)} ${x.label} ${fmt(x.amount)}`).join(', ') : '없음'}</dd></div>
              <div><dt>불확실 입금 (계산에서 뺌)</dt><dd>{ev.uncertainIn.length ? ev.uncertainIn.map((x) => `${md(x.date)} ${x.label} ${fmt(x.amount)}`).join(', ') : '없음'}{report.ifUncertainArrives !== null && <small>들어온다면 가장 낮은 결제일 잔고 {fmt(report.ifUncertainArrives)}</small>}</dd></div>
              {report.forecast.ready.ready && <div><dt>결제 수단 비중 (최근 4주)</dt><dd>결제계좌 {Math.round(report.forecast.shares.pay * 100)}% · 신용카드 {Math.round(report.forecast.shares.credit * 100)}% · 현금·다른 계좌 {Math.round(report.forecast.shares.outside * 100)}%</dd></div>}
              {ev.outsideCount > 0 && <div><dt>결제계좌와 무관한 소비</dt><dd>{ev.outsideCount}건<small>지갑 현금·다른 계좌 체크카드는 소비 집계에만 넣어요</small></dd></div>}
            </dl>
            <Button tone="secondary" onClick={() => setBalOpen(true)}>지금 잔액 다시 알려주기</Button>
          </section>

          {report.settlements.filter((s) => s.expected > 0 && s.diff !== 0).map((s) => (
            <section key={s.paymentTxnId} className="t-card mo-settle">
              <h2>카드값이 예상과 달라요</h2>
              <p>{md(s.billDate)} 청구 예정 {fmt(s.expected)} → 실제 출금 {fmt(s.actual)} (차액 {s.diff > 0 ? '+' : '−'}{fmt(Math.abs(s.diff))}). 실제 출금액으로 계산했어요. 빠진 결제가 있는지 확인해 주세요.</p>
            </section>
          ))}

          <HelpCard report={report} />
          <button className="mo-link" onClick={() => nav.push({ name: 'moaSetup' })}>잔액·카드·일정 관리</button>
        </>
      )}

      {whatOpen && <WhatIfSheet initial={what?.amount ?? 24000} onClose={() => setWhatOpen(false)} onDone={(amount) => { setWhat({ amount, method: what?.method ?? 'debit' }); setWhatOpen(false); }} />}
      {balOpen && <BalanceSheet initial={report.anchorBalance ?? 0} onClose={() => setBalOpen(false)} onDone={(b) => { set((m) => setAnchor(m, b, Date.now())); setBalOpen(false); }} />}
    </div>
  );
}

function ScenarioTable({ p, delay }: { p: PaymentCheck; delay: number }) {
  const rows: { k: ScenarioKey; label: string }[] = [
    { k: 'registered', label: '등록 일정만 (예측 지출 없이)' },
    { k: 'base', label: '기본 (평소처럼 쓰면)' },
    { k: 'high', label: '평소보다 많이 쓰면' },
    { k: 'delay', label: `입금이 ${delay}일 늦어지면` },
    { k: 'combo', label: '둘 다 겹치면' },
  ];
  return (
    <dl className="mo-scn" aria-label={`${md(p.date)} ${p.name} 출금 직후 잔고`}>
      {rows.map((r) => (
        <div key={r.k} className={p.balances[r.k] < 0 ? 'neg' : ''}>
          <dt>{r.label}</dt>
          <dd>{p.balances[r.k] < 0 ? `${fmt(-p.balances[r.k])} 모자람` : `${fmt(p.balances[r.k])} 남음`}</dd>
        </div>
      ))}
      {p.upperBasis !== 'none' && <p className="mo-fine">'많이 쓰면'은 결제일까지 남은 {p.daysUntil + 1}일의 과거 누적 오차 상위 20% 수준({fmt(p.upper)})을 더했어요{p.upperBasis === 'common' ? ' — 내 기록이 적어 공통 기준을 썼어요' : ''}.</p>}
      {p.capped && <p className="mo-warn">{p.capped === 'stale' ? '잔액을 7일 넘게 확인하지 않아 등급을 주의까지만 보여드려요.' : '빠진 기록이 있는 것 같아 등급을 주의까지만 보여드려요.'}</p>}
      {GRADE_RANK[p.grade] === 0 && <p className="mo-fine">네 경우 모두 괜찮아서 따로 알리지 않아요.</p>}
    </dl>
  );
}

function WhatIfSheet({ initial, onClose, onDone }: { initial: number; onClose: () => void; onDone: (n: number) => void }) {
  const [v, setV] = useState(initial);
  return (
    <Sheet title="얼마짜리예요?" onClose={onClose} footer={<Button disabled={!v} onClick={() => onDone(v)}>{fmt(v)} 넣어 보기</Button>}>
      <p className="mo-amount num">{fmt(v)}</p>
      <NumberPad value={v} onChange={setV} max={10_000_000} />
    </Sheet>
  );
}

export function BalanceSheet({ initial, onClose, onDone, title = '결제계좌에 지금 얼마 있어요?' }: { initial: number; onClose: () => void; onDone: (n: number) => void; title?: string }) {
  const [v, setV] = useState(initial);
  return (
    <Sheet title={title} onClose={onClose} footer={<Button onClick={() => onDone(v)}>{fmt(v)}으로 저장</Button>}>
      <p className="mo-fine">은행 앱에 보이는 숫자를 그대로 넣어 주세요. 지금 시각을 기준으로 다시 계산해요.</p>
      <p className="mo-amount num">{fmt(v)}</p>
      <NumberPad value={v} onChange={setV} max={100_000_000} />
    </Sheet>
  );
}
