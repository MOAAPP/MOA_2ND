/**
 * 금액 입력 숫자패드 로직(원 단위 정수). UI 없이 테스트할 수 있게 순수 함수로 둔다.
 */
export type PadKey = '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '00' | 'back' | 'clear';

export const PAD_MAX = 100_000_000;

/** 키 하나를 눌렀을 때 다음 금액. 최대치를 넘는 입력은 무시(이전 값 유지). */
export function pressKey(value: number, key: PadKey, max = PAD_MAX): number {
  const v = Math.max(0, Math.trunc(value));
  if (key === 'clear') return 0;
  if (key === 'back') return Math.floor(v / 10);
  const next = Number(String(v) + key);
  if (!Number.isFinite(next)) return v;
  return next > max ? v : next;
}

/** 빠른 금액 버튼(+1만 등). 최대치에서 멈춘다. */
export function addAmount(value: number, add: number, max = PAD_MAX): number {
  return Math.min(max, Math.max(0, Math.trunc(value) + Math.trunc(add)));
}

/**
 * 금액을 한글 읽기로: 123_450_000 → "1억 2,345만 원", 30_000 → "3만 원", 1_200 → "1,200원".
 * 큰 숫자 옆에 작게 붙여 "몇 만 원인지" 바로 읽히게 한다.
 */
export function koreanWon(n: number): string {
  const v = Math.max(0, Math.trunc(n));
  if (v === 0) return '0원';
  const eok = Math.floor(v / 100_000_000);
  const man = Math.floor((v % 100_000_000) / 10_000);
  const rest = v % 10_000;
  const parts: string[] = [];
  if (eok) parts.push(`${eok.toLocaleString('ko-KR')}억`);
  if (man) parts.push(`${man.toLocaleString('ko-KR')}만`);
  if (rest) parts.push(rest.toLocaleString('ko-KR'));
  return rest ? `${parts.join(' ')}원` : `${parts.join(' ')} 원`;
}
