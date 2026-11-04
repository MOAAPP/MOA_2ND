import { useState } from 'react';
import { addDays, formatKDateTime } from '../../../shared/dates';
import { Button, Chip, Chips, NumberPad } from '../../components/ds';
import { Sheet, TopBar } from '../../components/ui';
import {
  GRADE_RANK,
  paymentSentence,
  setAnchor,
  type PaymentCheck,
  type ScenarioKey,
} from '../../lib/moa';
import { useNav } from '../../state/nav';
import { useMoa } from '../../state/moa';
import { AiLabel, BalanceChart, fmt, Fold, GradeBadge, HelpCard, md, ReliabilityRow } from './parts';

/**
 * 결제일 잔고 상세 — 이 화면의 일: "다가오는 필수결제마다 그날 결제계좌에 돈이 남는지" 보여주기.
 * 위에서부터 결론 → 결제 목록(고른 결제의 핵심 두 경우) → 할 수 있는 일. 그래프와 계산 근거는 접어 둔다.
 */
export function Shortfall({ paymentKey }: { paymentKey?: string } = {}) {
  const nav = useNav();
  const { moa, report, today, set } = useMoa();
  const [view, setView] = useState<'onTime' | 'late'>('onTime');
  const [balOpen, setBalOpen] = useState(false);
  const [sel, setSel] = useState<string | null>(paymentKey ?? null);
  const [allCases, setAllCases] = useState(false);

  const until = addDays(today, 14);
  const keys: ScenarioKey[] = view === 'late' ? ['delay', 'combo'] : report.forecast.ready.ready ? ['base', 'high'] : ['registered'];
  const focus = (sel && report.payments.find((p) => p.key === sel)) || report.worst;
  const ev = report.evidence;
  const mainKey: ScenarioKey = report.forecast.ready.ready ? 'base' : 'registered';
  const left = (v: number) => (v < 0 ? `${fmt(-v)} 모자라요` : `${fmt(v)} 남아요`);

  return (
    <div className="page t-page mo-page">
      <TopBar onBack={nav.pop} title="결제일 잔고" />
      <p className="mo-intro">다가오는 필수결제마다, 그날 결제계좌에 돈이 남는지 보여줘요.</p>
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
              </>
            ) : <h1>14일 안에 등록된 필수결제가 없어요</h1>}
            {report.reliability.level !== 'enough' && <ReliabilityRow value={report.reliability} onFix={() => setBalOpen(true)} />}
          </section>

          <section className="t-card">
            <div className="t-card-head"><h2>14일 안 필수결제</h2><small className="mo-hint">눌러서 하나씩 볼 수 있어요</small></div>
            <ul className="mo-pays">
              {report.payments.map((p) => (
                <li key={p.key}>
                  <button className={focus?.key === p.key ? 'on' : ''} onClick={() => { setSel(p.key); setAllCases(false); }}>
                    <span><b>{md(p.date)} {p.name}</b><small>D-{p.daysUntil} · {fmt(p.amount)}</small></span>
                    <GradeBadge grade={p.grade} />
                  </button>
                </li>
              ))}
              {!report.payments.length && <li className="t-empty">등록된 필수결제가 없어요.</li>}
            </ul>
            {focus && (
              <div className="mo-two">
                <p className="mo-two-title">{md(focus.date)} {focus.name} 빠진 직후 잔고</p>
                <dl>
                  <div className={focus.balances[mainKey] < 0 ? 'neg' : ''}><dt>{mainKey === 'base' ? '평소처럼 쓰면' : '등록한 일정대로면'}</dt><dd>{left(focus.balances[mainKey])}</dd></div>
                  <div className={focus.balances.delay < 0 ? 'neg' : ''}><dt>입금이 {report.delayDays}일 늦으면</dt><dd>{left(focus.balances.delay)}</dd></div>
                </dl>
                <button className="mo-link" onClick={() => setAllCases((v) => !v)}>{allCases ? '접기' : '다른 경우도 보기'}</button>
                {allCases && <ScenarioTable p={focus} delay={report.delayDays} />}
              </div>
            )}
          </section>

          <section className="t-card mo-actions">
            <h2>지금 할 수 있는 일</h2>
            <button className="mo-act" onClick={() => nav.push({ name: 'choose' })}><b>이거 사도 될까?</b><small>금액을 넣으면 결제일 잔고와 평행세계 1년 뒤를 같이 보여줘요</small></button>
            <button className="mo-act" onClick={() => setBalOpen(true)}><b>지금 잔액 다시 넣기</b><small>은행 앱에 보이는 숫자로 바로 다시 계산해요</small></button>
            <button className="mo-act" onClick={() => nav.push({ name: 'moaSetup' })}><b>결제·입금 일정 고치기</b><small>월세·카드 결제일·월급 날짜</small></button>
          </section>

          {report.settlements.filter((x) => x.expected > 0 && x.diff !== 0).map((x) => (
            <section key={x.paymentTxnId} className="t-card mo-settle">
              <h2>카드값이 예상과 달라요</h2>
              <p>{md(x.billDate)} 청구 예정 {fmt(x.expected)} → 실제 출금 {fmt(x.actual)} (차액 {x.diff > 0 ? '+' : '−'}{fmt(Math.abs(x.diff))}). 실제 출금액으로 계산했어요. 빠진 결제가 있는지 확인해 주세요.</p>
            </section>
          ))}

          <HelpCard report={report} />

          <Fold title="잔고 흐름 그래프" hint="앞으로 30일, 날짜별 결제계좌 잔고">
            <Chips label="입금 시나리오">
              <Chip on={view === 'onTime'} onClick={() => setView('onTime')}>입금 예정대로</Chip>
              <Chip on={view === 'late'} onClick={() => setView('late')}>입금 {report.delayDays}일 지연</Chip>
            </Chips>
            <BalanceChart series={report.series} keys={keys} payments={report.payments} from={today} until={until} />
            <p className="mo-fine">판단은 14일 안 결제일만 해요. 확률은 쓰지 않고 '평소보다 많이 쓰는 경우'로만 보여드려요.</p>
          </Fold>

          <Fold title="어떻게 계산했어요?" hint="잔액·출금·입금·예상 지출">
            <div className="t-card-head"><AiLabel>숫자는 모두 계산값</AiLabel></div>
            <dl className="mo-kv">
              <div><dt>결제계좌 잔액 확인</dt><dd>{fmt(report.anchorBalance ?? 0)}<small>{report.anchorAt ? formatKDateTime(report.anchorAt) : ''}{moa.anchor?.source === 'sms' ? ' · 문자' : ' · 직접 입력'}</small></dd></div>
              <div><dt>14일 안 확정·등록 출금</dt><dd>{fmt(ev.confirmedOut)}</dd></div>
              <div><dt>14일 안 예상 변동 지출 (결제계좌분)</dt><dd>{report.forecast.ready.ready ? fmt(ev.forecastOut) : '예측 전'}<small>{report.forecast.ready.message}</small></dd></div>
              <div><dt>예정 입금</dt><dd>{ev.scheduledIn.length ? ev.scheduledIn.map((x) => `${md(x.date)} ${x.label} ${fmt(x.amount)}`).join(', ') : '없음'}</dd></div>
              <div><dt>불확실 입금 (계산에서 뺌)</dt><dd>{ev.uncertainIn.length ? ev.uncertainIn.map((x) => `${md(x.date)} ${x.label} ${fmt(x.amount)}`).join(', ') : '없음'}{report.ifUncertainArrives !== null && <small>들어온다면 가장 낮은 결제일 잔고 {fmt(report.ifUncertainArrives)}</small>}</dd></div>
              {report.forecast.ready.ready && <div><dt>결제 수단 비중 (최근 4주)</dt><dd>결제계좌 {Math.round(report.forecast.shares.pay * 100)}% · 신용카드 {Math.round(report.forecast.shares.credit * 100)}% · 현금·다른 계좌 {Math.round(report.forecast.shares.outside * 100)}%</dd></div>}
              {ev.outsideCount > 0 && <div><dt>결제계좌와 무관한 소비</dt><dd>{ev.outsideCount}건<small>지갑 현금·다른 계좌 체크카드는 소비 집계에만 넣어요</small></dd></div>}
            </dl>
          </Fold>
        </>
      )}

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
