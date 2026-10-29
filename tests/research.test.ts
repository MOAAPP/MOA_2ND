import { describe, expect, it } from 'vitest';
import { appendEvent, assignArm, CSV_COLUMNS, emptyResearch, join, leave, metrics, migrateResearch, startSession, toCSV, toJSON } from '../src/lib/research/log';

const T = Date.parse('2026-10-29T12:00:00+09:00');
const ctx = (d = 0) => ({ now: T + d * 86_400_000, demo: false });
let seed = 1;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('연구 로깅', () => {
  it('동의 전에는 아무것도 쌓이지 않는다', () => {
    const r = emptyResearch(rand);
    expect(appendEvent(r, { type: 'session_start' }, ctx())).toBe(r);
    expect(startSession(r, ctx())).toBe(r);
  });

  it('무작위 배정은 참여 번호로 고정되고 대략 반반이다', () => {
    const r = emptyResearch(rand);
    expect(assignArm(r.pid)).toBe(r.arm);
    let a = 0;
    for (let i = 0; i < 2000; i++) if (emptyResearch(rand).arm === 'preview') a++;
    expect(a / 2000).toBeGreaterThan(0.45);
    expect(a / 2000).toBeLessThan(0.55);
  });

  it('링크로 받은 조건이 우선한다', () => {
    expect(join(emptyResearch(rand), ctx(), 'control').arm).toBe('control');
  });

  it('지표: 참기 비율·지킨 돈·재방문 간격·중도해지율·납입 성실도', () => {
    let r = join(emptyResearch(rand), ctx(), 'preview');
    const dm = (choice: 'hold' | 'alt' | 'buy', price: number, paid: number, d: number) =>
      (r = appendEvent(r, { type: 'decision_made', choice, price, paid, saved: price - paid, freq: 'once', category: '카페', dwellMs: 3000, moved: price > paid }, ctx(d)));
    dm('hold', 10_000, 0, 0);
    r = startSession(r, ctx(2)); dm('buy', 5_000, 5_000, 2);
    r = startSession(r, ctx(5)); dm('alt', 20_000, 12_000, 5);
    r = appendEvent(r, { type: 'bank_join', kind: 'installment', productId: 'x', amount: 50_000, months: 6, fromSaved: true }, ctx(5));
    r = appendEvent(r, { type: 'bank_join', kind: 'deposit', productId: 'y', amount: 100_000, months: 12, fromSaved: true }, ctx(5));
    r = appendEvent(r, { type: 'bank_close_early', kind: 'deposit', productId: 'y', heldDays: 3, termMonths: 12 }, ctx(8));
    r = appendEvent(r, { type: 'autopay', paid: 3, missed: 1 }, ctx(9));
    const m = metrics(r.events);
    expect(m.decisions).toBe(3);
    expect(m.holdRate).toBeCloseTo(2 / 3);
    expect(m.pureHoldRate).toBeCloseTo(1 / 3);
    expect(m.savedTotal).toBe(18_000);
    expect(m.sessions).toBe(3);
    expect(m.returnGapDaysMedian).toBe(2.5);
    expect(m.earlyCloseRate).toBe(0.5);
    expect(m.autopayRate).toBe(0.75);
    expect(r.events.map((e) => e.seq)).toEqual(r.events.map((_, i) => i + 1));
    expect(new Set(r.events.map((e) => e.pid)).size).toBe(1);
  });

  it('체험 데이터는 따로 뺄 수 있다', () => {
    let r = join(emptyResearch(rand), ctx());
    r = appendEvent(r, { type: 'decision_made', choice: 'hold', price: 1000, paid: 0, saved: 1000, freq: 'once', category: '기타', dwellMs: 0, moved: true }, { now: T, demo: true });
    expect(metrics(r.events).decisions).toBe(1);
    expect(metrics(r.events, { includeDemo: false }).decisions).toBe(0);
  });

  it('그만두면 더 쌓이지 않고, 지우기를 고르면 기록이 사라진다', () => {
    let r = join(emptyResearch(rand), ctx());
    r = leave(r, ctx(1), false);
    expect(r.joined).toBe(false);
    expect(r.events.at(-1)!.type).toBe('left');
    expect(appendEvent(r, { type: 'session_start' }, ctx(2))).toBe(r);
    expect(leave(join(emptyResearch(rand), ctx()), ctx(), true).events).toHaveLength(0);
  });

  it('CSV는 열 개수가 맞고 쉼표·따옴표를 감싼다', () => {
    let r = join(emptyResearch(rand), ctx());
    r = appendEvent(r, { type: 'decision_made', choice: 'buy', price: 1000, paid: 1000, saved: 0, freq: 'once', category: '식비, "간식"', dwellMs: 10, moved: false }, ctx());
    const lines = toCSV(r.events).split('\n');
    expect(lines[0].split(',')).toHaveLength(CSV_COLUMNS.length);
    expect(lines[2]).toContain('"식비, ""간식"""');
    const j = JSON.parse(toJSON(r, T));
    expect(j.schema).toBe('moa-research/1');
    expect(j.events).toHaveLength(2);
  });

  it('예전 저장본(연구 필드 없음)도 불러온다', () => {
    const r = migrateResearch(undefined);
    expect(r.joined).toBe(false);
    expect(migrateResearch({ pid: 'P-AAAAAA', joined: true } as never).arm).toBe(assignArm('P-AAAAAA'));
  });
});
