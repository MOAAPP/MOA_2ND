import { useMemo, useState } from 'react';
import { formatKDate, formatKDateTime, formatShort, todayKST } from '../../shared/dates';
import { signedWon, won } from '../../shared/format';
import { ConfirmSheet, Empty, Notice, Seg, Switch, TopBar, useToast, WorldTag } from '../components/ui';
import { isPrimaryReflected, recordLabel } from '../lib/cashflow';
import { CHOICE_LABEL, IF_NAME, WORLD_NAME } from '../lib/categories';
import { compareChoices } from '../lib/scenarios';
import type { Choice, DecisionRecord } from '../lib/types';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';
import { choicePill } from './Forks';
import { defaultParallelAs } from './Decide';

function feasible(r: DecisionRecord): Choice[] {
  return ['buy', 'skip', ...(r.params.delayDate ? (['delay'] as Choice[]) : []), ...(r.params.altAmount ? (['alt'] as Choice[]) : [])];
}

export function RecordDetail({ id }: { id: string }) {
  const { state, update } = useStore();
  const nav = useNav();
  const toast = useToast();
  const rec = state.records.find((r) => r.id === id);
  const profile = state.profile!;
  const [del, setDel] = useState(false);
  const [reason, setReason] = useState(rec?.reason ?? '');

  const choices = rec ? feasible(rec) : [];
  const latest = useMemo(
    () => (rec ? compareChoices({ profile, records: state.records, params: rec.params, label: recordLabel(rec), choices, today: todayKST(), excludeRecordId: rec.id }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rec, profile, state.records],
  );

  if (!rec) {
    return (
      <div className="page no-nav">
        <TopBar onBack={nav.pop} title="기록" center />
        <Empty title="기록을 찾지 못했어요">삭제되었을 수 있어요.</Empty>
      </div>
    );
  }

  const patch = (p: Partial<DecisionRecord>) => update((s) => ({ ...s, records: s.records.map((r) => (r.id === rec.id ? { ...r, ...p } : r)) }));
  const setChoice = (c: Choice) => {
    patch({ choice: c, choiceAt: Date.now(), parallelAs: rec.parallelAs === c || !rec.choice ? defaultParallelAs(c) : rec.parallelAs });
    toast(`'${CHOICE_LABEL[c]}'로 바꿨어요`);
  };
  const snap = rec.snapshot?.byChoice;
  const canReflect = rec.choice && rec.params.date <= profile.baseDate;

  return (
    <div className="page no-nav">
      <TopBar onBack={nav.pop} title="선택 기록" center />

      <section className="hero" style={{ paddingTop: 4 }}>
        <div className="row" style={{ gap: 6 }}>{choicePill(rec)}<span className="small muted">{rec.category}</span></div>
        <div className="big num" style={{ fontSize: 30 }}>{won(rec.params.amount)}</div>
        <div className="bold" style={{ fontSize: 17 }}>{recordLabel(rec)}</div>
        <div className="basis">
          {formatKDate(rec.params.date)} · {rec.source === 'spent' ? '이미 쓴 돈' : '사기 전 확인'}
          {rec.params.installments ? ` · ${rec.params.installments}개월 할부` : ''}
          {rec.params.delayDate ? ` · 미룰 날 ${formatShort(rec.params.delayDate)}` : ''}
          {rec.params.altAmount ? ` · 대안 ${won(rec.params.altAmount)}` : ''}
        </div>
        {rec.memo && <p className="small ink2" style={{ margin: '8px 0 0' }}>“{rec.memo}”</p>}
        <p className="xs muted" style={{ marginTop: 6 }}>실제 결제·이체가 아닌 내 선택 기록이에요.</p>
      </section>

      <section className="section">
        <div className="section-head"><h2>내가 한 선택</h2>{rec.source === 'decide' && <button className="link-btn" onClick={() => nav.push({ name: 'decide', recordId: rec.id })}>다시 비교하기</button>}</div>
        <div className="choice-grid">
          {choices.map((c) => (
            <button key={c} className="choice-btn" aria-pressed={rec.choice === c} onClick={() => setChoice(c)}>
              {CHOICE_LABEL[c]}
              <small>{WORLD_NAME[c]}</small>
            </button>
          ))}
        </div>
      </section>

      {rec.choice && (
        <section className="section">
          <div className="section-head"><h2>평행세계</h2></div>
          <div className="card">
            <div className="row between">
              <div>
                <div className="bold">홈 그래프에 같이 그리기</div>
                <div className="small muted">켜면 홈의 평행 잔고에 이 기록의 다른 선택이 반영돼요.</div>
              </div>
              <Switch label="평행세계에 넣기" checked={rec.inParallel} onChange={(v) => patch({ inParallel: v })} />
            </div>
            {rec.inParallel && (
              <div style={{ marginTop: 14 }}>
                <div className="small ink2" style={{ marginBottom: 6 }}>평행세계의 나는…</div>
                <Seg label="평행세계 선택" value={rec.parallelAs} onChange={(v) => patch({ parallelAs: v })} options={choices.filter((c) => c !== rec.choice).map((c) => ({ value: c, label: IF_NAME[c] }))} />
                <p className="xs muted" style={{ marginBottom: 0 }}>같은 기록은 한 번만 반영돼요. 실제 거래와 연결해 차이만 더하거나 빼요.</p>
              </div>
            )}
            {canReflect && (
              <>
                <hr className="divider" />
                <div className="row between">
                  <div>
                    <div className="bold" style={{ fontSize: 15 }}>입력한 잔고에 이미 빠져 있어요</div>
                    <div className="small muted">켜져 있으면 예상 잔고에서 다시 빼지 않아요.</div>
                  </div>
                  <Switch label="잔고에 이미 반영됨" checked={isPrimaryReflected(rec, profile)} onChange={(v) => patch({ reflectedOverride: v })} />
                </div>
              </>
            )}
          </div>
        </section>
      )}

      <section className="section">
        <div className="section-head"><h2>그때 다른 선택을 했다면</h2></div>
        <div className="card">
          <table className="compare-table">
            <thead>
              <tr><th>월말 예상</th><th>기록 당시</th><th>최신 정보로</th></tr>
            </thead>
            <tbody>
              {choices.map((c) => {
                const s = snap?.[c];
                const l = latest?.results[c];
                return (
                  <tr key={c}>
                    <td>
                      {rec.choice === c ? <WorldTag kind="real">{WORLD_NAME[c]}</WorldTag> : <span>{WORLD_NAME[c]}</span>}
                    </td>
                    <td className="num">{s ? won(s.monthEnd) : '—'}{s?.shortfall && <div className="xs up">부족 있었음</div>}</td>
                    <td className="num">{l ? won(l.monthEnd.balance) : '—'}{l?.shortfall && <div className="xs up">부족</div>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="xs muted" style={{ marginBottom: 0 }}>
            {rec.snapshot ? `기록 당시: ${formatKDateTime(rec.snapshot.computedAt)} 입력 정보 기준. ` : '이미 쓴 돈 기록은 당시 비교 결과가 없어요. '}
            최신: 지금의 잔고·일정·다른 기록으로 다시 계산했어요{latest ? ` (${formatKDate(latest.results.buy!.monthEnd.date)} 기준)` : ''}.
          </p>
          {snap?.buy && snap?.skip && latest?.results.buy && latest.results.skip && (
            <p className="small" style={{ marginBottom: 0 }}>
              산 나와 안 산 나의 차이: 당시 {signedWon(snap.skip.monthEnd - snap.buy.monthEnd)} → 최신 {signedWon(latest.results.skip.monthEnd.balance - latest.results.buy.monthEnd.balance)}
            </p>
          )}
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>돌아보기 <span className="muted small">(선택)</span></h2></div>
        <div className="card">
          <div className="small ink2" style={{ marginBottom: 8 }}>이 선택에 얼마나 만족하나요?</div>
          <div className="stars" role="group" aria-label="만족도">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} aria-pressed={(rec.satisfaction ?? 0) >= n} aria-label={`${n}점`} onClick={() => patch({ satisfaction: rec.satisfaction === n ? undefined : n })}>★</button>
            ))}
          </div>
          <label className="field" style={{ marginTop: 14 }}>
            <span className="lab">이유 (선택)</span>
            <textarea className="textarea" value={reason} onChange={(e) => setReason(e.target.value)} onBlur={() => patch({ reason: reason.trim() || undefined })} placeholder="예: 매일 신어서 만족해요" maxLength={120} />
          </label>
          {rec.satisfaction && rec.satisfaction >= 4 && (rec.choice === 'buy' || rec.choice === 'alt') && (
            <Notice kind="ok">잘 쓴 돈으로 남겨둘게요. 돈이 줄어든 만큼 얻은 게 있었던 선택이에요.</Notice>
          )}
        </div>
      </section>

      <button className="btn text block" style={{ marginTop: 20, color: 'var(--danger)' }} onClick={() => setDel(true)}>기록 삭제</button>
      {del && (
        <ConfirmSheet
          title="이 기록을 삭제할까요?"
          body="삭제하면 홈의 예상 잔고와 평행세계 계산에서도 빠져요. 되돌릴 수 없어요."
          confirm="삭제"
          danger
          onClose={() => setDel(false)}
          onConfirm={() => {
            update((s) => ({ ...s, records: s.records.filter((r) => r.id !== rec.id) }));
            toast('기록을 삭제했어요');
            nav.pop();
          }}
        />
      )}
    </div>
  );
}
