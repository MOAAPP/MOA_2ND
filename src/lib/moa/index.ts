export * from './types';
export * from './billing';
export * from './ledger';
export * from './forecast';
export * from './risk';
export * from './alerts';
export * from './actions';

/** 한국 시간 날짜·시각 → epoch ms */
export function kstMs(date: string, hh = 12, mm = 0): number {
  const [y, m, d] = date.split('-').map(Number);
  return Date.UTC(y, m - 1, d, hh - 9, mm);
}
