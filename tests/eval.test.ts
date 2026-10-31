import { describe, expect, it } from 'vitest';
import { addDays } from '../shared/dates';
import { BASE_PRED, cumMae, seriesOfSynth, windows, EVAL_DAYS, SELECT_DAYS } from '../scripts/eval/run';
import { makeUser, SPECS, stateAt, SYNTH_END } from '../scripts/eval/synthetic';

describe('검증 도구', () => {
  it('합성 사용자는 같은 시드면 같은 데이터', () => {
    const a = makeUser(SPECS[0]);
    const b = makeUser(SPECS[0]);
    expect(a.actual.length).toBe(b.actual.length);
    expect([...a.trueClose.values()]).toEqual([...b.trueClose.values()]);
  });
  it('10명, 정답 라벨(필수결제일 실제 잔고)이 남는다', () => {
    expect(SPECS).toHaveLength(10);
    const u = makeUser(SPECS[7]); // 급여 지연
    expect(u.payments.length).toBeGreaterThan(0);
    expect(u.payments.every((p) => typeof p.short === 'boolean')).toBe(true);
  });
  it('그날 아침 상태: 전날까지 기록만, 잔액은 마지막 잔액 문자', () => {
    const u = makeUser(SPECS[0]);
    const day = addDays(SYNTH_END, -10);
    const { state, nowMs } = stateAt(u, day);
    expect(state.txns.every((t) => t.occurredAt < nowMs)).toBe(true);
    expect(state.anchor!.at).toBeLessThan(nowMs);
    expect(Object.keys(state.dayStatus).every((d) => d < day)).toBe(true);
  });
  it('잔액 미확인 사용자(S04)는 처음 입력한 잔액만 있다', () => {
    const u = makeUser(SPECS[3]);
    expect(stateAt(u, SYNTH_END).state.anchor!.source).toBe('manual');
  });
  it('평가 구간은 날짜로 고정: 마지막 28일 평가, 그 앞 14일 선택', () => {
    const s = seriesOfSynth(makeUser(SPECS[2]));
    const w = windows(s);
    expect(w.evalStart).toBe(addDays(s.last, -(EVAL_DAYS - 1)));
    expect(w.selectStart).toBe(addDays(w.evalStart, -SELECT_DAYS));
  });
  it('7일 누적 MAE와 사례 수', () => {
    const s = seriesOfSynth(makeUser(SPECS[3]));
    const w = windows(s);
    const r = cumMae(s, BASE_PRED.weekday, 7, w.evalStart, s.last);
    expect(r.independent).toBe(4);
    expect(r.cases).toBeGreaterThan(0);
    expect(r.mae).toBeGreaterThanOrEqual(0);
  });
});
