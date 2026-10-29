export function won(n: number): string {
  return `${Math.round(n).toLocaleString('ko-KR')}원`;
}

export function signedWon(n: number): string {
  const r = Math.round(n);
  if (r === 0) return '0원';
  return `${r > 0 ? '+' : '−'}${Math.abs(r).toLocaleString('ko-KR')}원`;
}

export function signedPct(n: number, digits = 2): string {
  const v = Number(n.toFixed(digits));
  if (v === 0) return '0%';
  return `${v > 0 ? '+' : '−'}${Math.abs(v).toFixed(digits)}%`;
}

export function pct(n: number, digits = 1): string {
  return `${n.toFixed(digits)}%`;
}

/** 금액을 '12만 3,000원'처럼 읽기 쉽게 */
export function wonShort(n: number): string {
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(Math.round(n));
  if (a < 10000) return `${sign}${a.toLocaleString('ko-KR')}원`;
  const man = Math.floor(a / 10000);
  const rest = a % 10000;
  return `${sign}${man.toLocaleString('ko-KR')}만${rest ? ` ${rest.toLocaleString('ko-KR')}` : ''}원`;
}

export function shares(n: number): string {
  return `${n.toLocaleString('ko-KR')}주`;
}

/** 그래프·범위용 아주 짧은 금액: 384,638 → '38.5만', 9,800 → '9,800' */
export function manShort(n: number): string {
  const sign = n < 0 ? '−' : '';
  const a = Math.abs(Math.round(n));
  if (a < 10000) return `${sign}${a.toLocaleString('ko-KR')}`;
  const v = a / 10000;
  const s = v >= 100 ? Math.round(v).toLocaleString('ko-KR') : String(Number(v.toFixed(1)));
  return `${sign}${s}만`;
}
