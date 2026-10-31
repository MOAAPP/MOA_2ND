import { describe, expect, it } from 'vitest';
import { addDays, type ISODate } from '../../shared/dates';
import { decideAdoption, rollingBacktest, splitUser, trainLabels, upperWidth, type WindowResult } from '../../src/core/evaluate';
import { labeledDays, last7Mean, predictFrom, weekdayMean, type DailyPredictor, type LabeledDay } from '../../src/core/forecast';
import { kst } from '../../src/core/time';
import type { DayStatus, Txn } from '../../src/core/types';
import { spend } from './fixtures';

function labels(from: ISODate, n: number, f: (i: number) => number = () => 10000): LabeledDay[] {
  return Array.from({ length: n }, (_, i) => ({ date: addDays(from, i), amount: f(i), status: 'self_reported' as const }));
}

describe('정답으로 쓸 날', () => {
  it('대조 완료일·자기보고 완료일만 정답, 0원인 날도 완료 버튼이면 0원', () => {
    const txns: Txn[] = [spend('2026-10-01 12:00', 5000, 'debit'), spend('2026-10-02 12:00', 7000, 'credit'), spend('2026-10-04 12:00', 3000, 'cash')];
    const st = new Map<ISODate, DayStatus>([
      ['2026-10-01', 'reconciled'],
      ['2026-10-02', 'partial'],
      ['2026-10-03', 'self_reported'],
      ['2026-10-04', 'balance_only'],
      ['2026-10-05', 'missing'],
    ]);
    expect(labeledDays(txns, st)).toEqual([
      { date: '2026-10-01', amount: 5000, status: 'reconciled' },
      { date: '2026-10-03', amount: 0, status: 'self_reported' },
    ]);
  });
});

describe('평가 구간은 날짜로 고정', () => {
  const first = '2026-08-01';
  const last = addDays(first, 69); // 70일
  const s = splitUser(first, last)!;
  it('마지막 28일 최종, 그 앞 14일 선택, 나머지 학습, 학습 앞 7일은 초기 관측', () => {
    expect(s.final).toEqual({ from: addDays(last, -27), to: last });
    expect(s.select).toEqual({ from: addDays(last, -41), to: addDays(last, -28) });
    expect(s.train).toEqual({ from: first, to: addDays(last, -42) });
    expect(s.warmup.to).toBe(addDays(first, 6));
    expect(s.eval14).toBe(true);
    const tl = trainLabels(labels(first, 70), s);
    expect(tl[0].date).toBe(addDays(first, 7));
    expect(tl.length).toBe(28 - 7);
  });
  it('70일 미만이면 7일 예측 평가에만', () => {
    expect(splitUser(first, addDays(first, 60))!.eval14).toBe(false);
  });
  it('28일 최종 구간: 7일 예측 22개(독립 4), 14일 예측 15개(독립 2)', () => {
    const L = labels(first, 70);
    const b7 = rollingBacktest(weekdayMean, L, s.final, 7);
    const b14 = rollingBacktest(weekdayMean, L, s.final, 14);
    expect([b7.windows.length, b7.independent]).toEqual([22, 4]);
    expect([b14.windows.length, b14.independent]).toEqual([15, 2]);
  });
  it('14일 선택 구간: 7일 예측 8개, 겹치지 않는 것 2개', () => {
    const b = rollingBacktest(last7Mean, labels(first, 70), s.select, 7);
    expect([b.windows.length, b.independent]).toEqual([8, 2]);
  });
  it('창 안에 라벨이 빠진 날이 있으면 그 사례는 완결되지 않음', () => {
    const L = labels(first, 70).filter((d) => d.date !== addDays(last, -14));
    const b = rollingBacktest(weekdayMean, L, s.final, 7);
    expect(b.windows.length).toBe(22 - 7);
    expect(b.skipped).toBe(7);
  });
});

describe('데이터 누수 방지', () => {
  it('예측기는 기준일 이후 라벨을 볼 수 없다', () => {
    const spy: DailyPredictor = {
      name: 'spy',
      predict(history, origin, targets) {
        expect(history.every((d) => d.date <= origin)).toBe(true);
        return targets.map(() => 0);
      },
    };
    const L = labels('2026-10-01', 30);
    predictFrom(spy, L, '2026-10-15', ['2026-10-16']);
    rollingBacktest(spy, L, { from: '2026-10-10', to: '2026-10-30' }, 7);
  });
  it('기준선: 최근 7일 평균, 요일별 평균', () => {
    const L = labels('2026-10-05', 14, (i) => (i % 7 === 5 || i % 7 === 6 ? 30000 : 10000)); // 10/10·11(토·일) 비쌈
    expect(last7Mean.predict(L, '2026-10-18', ['2026-10-19'])).toEqual([(10000 * 5 + 30000 * 2) / 7]);
    expect(weekdayMean.predict(L, '2026-10-18', ['2026-10-24', '2026-10-26'])).toEqual([30000, 10000]);
    expect(kst('2026-10-24 00:00')).toBeLessThan(kst('2026-10-26 00:00'));
  });
});

describe('ML 채택 조건', () => {
  const w = (errs: number[]): WindowResult[] => errs.map((e, i) => ({ origin: addDays('2026-10-01', i), h: 7, actual: 0, pred: 0, err: e }));
  it('합친 선택 구간과 모든 사용자에서 두 기준선보다 낮을 때만 ML', () => {
    const d = decideAdoption([
      { user: 'u1', ml: w([1, 1]), last7: w([3, 3]), weekday: w([2, 2]) },
      { user: 'u2', ml: w([2, 2]), last7: w([4, 4]), weekday: w([5, 5]) },
    ]);
    expect(d.useMl).toBe(true);
    expect(d.chosen).toBe('ml');
  });
  it('사용자별로 우열이 엇갈리면 요일별 평균 유지', () => {
    const d = decideAdoption([
      { user: 'u1', ml: w([1, 1]), last7: w([9, 9]), weekday: w([9, 9]) },
      { user: 'u2', ml: w([5, 5]), last7: w([4, 4]), weekday: w([4, 4]) },
    ]);
    expect(d.useMl).toBe(false);
    expect(d.chosen).toBe('weekday');
    expect(d.reason).toBe('사용자별로 우열이 엇갈림');
  });
  it('비슷하거나 나쁘면 요일별 평균', () => {
    const d = decideAdoption([{ user: 'u1', ml: w([3]), last7: w([3]), weekday: w([3]) }]);
    expect(d.useMl).toBe(false);
  });
});

describe('상단 폭', () => {
  it('본인 오차가 10개 이상이면 본인 상위 20%, 아니면 공통, 둘 다 없으면 null', () => {
    const ten = Array.from({ length: 10 }, (_, i) => i * 100);
    expect(upperWidth(ten, undefined)).toEqual({ width: 720, source: 'personal' });
    expect(upperWidth([1, 2], ten)).toEqual({ width: 720, source: 'global' });
    expect(upperWidth([1, 2], [1])).toBeNull();
    expect(upperWidth(Array(10).fill(-500), undefined)).toEqual({ width: 0, source: 'personal' });
  });
});
