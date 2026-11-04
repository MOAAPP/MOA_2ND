import { todayKST, type ISODate } from '../../shared/dates';

export const DEMO_SNAPSHOT_DAY: ISODate = '2026-11-04';
export const DEMO_END_DAY: ISODate = '2026-12-11';

export interface AppClockSource {
  demo: boolean;
  /** Only advances when someone explicitly changes the presentation day. */
  demoDay?: ISODate;
}

/** S01 has observed transactions through 11/04. Later days remain unobserved scenarios. */
export function appDay(source: AppClockSource, clock = new Date()): ISODate {
  if (!source.demo) return todayKST(clock);
  const d = source.demoDay ?? DEMO_SNAPSHOT_DAY;
  return d < DEMO_SNAPSHOT_DAY ? DEMO_SNAPSHOT_DAY : d > DEMO_END_DAY ? DEMO_END_DAY : d;
}

/** Explicit KST end-of-day snapshot; never silently roll the demo with the device clock. */
export function appNow(source: AppClockSource, clock = Date.now()): number {
  return source.demo
    ? Date.parse(`${appDay(source)}T23:59:00+09:00`)
    : clock;
}

export function demoDayIsObserved(day: ISODate): boolean {
  return day <= DEMO_SNAPSHOT_DAY;
}
