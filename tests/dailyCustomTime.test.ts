import { describe, expect, it } from 'vitest';
import type { Subscription } from '../server/lib/types';
import { isDue, nextRunAt, timeToMinutes } from '../server/lib/daily';

const sub = (time: string): Subscription => ({
  deviceHash: 'sample-device',
  enabled: true,
  time,
  includePhotos: false,
  level: 1,
  nextLessonId: null,
  streak: 0,
  holdings: [],
  watchlist: [],
  updatedAt: 0,
  createdAt: 0,
});

describe('데일리 카드뉴스 사용자 지정 시각 (KST)', () => {
  it('미리 정해둔 시간 외에도 분 단위 시각을 해석한다', () => {
    expect(timeToMinutes('13:17')).toBe(13 * 60 + 17);
    expect(timeToMinutes('23:59')).toBe(23 * 60 + 59);
    expect(timeToMinutes('00:01')).toBe(1);
  });
  it('오후 1시 17분 예약은 1시 16분에 실행 대상이 아니다', () => {
    expect(isDue(sub('13:17'), new Date('2026-11-03T04:16:00.000Z'))).toBe(false);
    expect(nextRunAt(sub('13:17'), new Date('2026-11-03T04:16:00.000Z')))
      .toBe(Date.parse('2026-11-03T04:17:00.000Z'));
  });
  it('예약 시각을 지난 뒤에만 대기 상태가 되고 성공한 날은 중복 실행하지 않는다', () => {
    const due = sub('13:17');
    const at = new Date('2026-11-03T04:17:00.000Z');
    expect(isDue(due, at)).toBe(true);
    due.lastRun = { date: '2026-11-03', jobId: 'sample-card', status: 'ok', attempts: 1, lastAttemptAt: at.getTime() };
    expect(isDue(due, at)).toBe(false);
    expect(nextRunAt(due, at)).toBe(Date.parse('2026-11-04T04:17:00.000Z'));
  });
});
