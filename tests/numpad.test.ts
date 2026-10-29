import { describe, expect, it } from 'vitest';
import { addAmount, koreanWon, pressKey } from '../src/lib/numpad';

describe('pressKey', () => {
  it('숫자를 뒤에 붙인다', () => {
    expect(pressKey(0, '3')).toBe(3);
    expect(pressKey(3, '0')).toBe(30);
    expect(pressKey(30, '00')).toBe(3000);
  });
  it('0에서 0/00을 눌러도 0', () => {
    expect(pressKey(0, '0')).toBe(0);
    expect(pressKey(0, '00')).toBe(0);
  });
  it('지우기와 전체 지우기', () => {
    expect(pressKey(12_345, 'back')).toBe(1_234);
    expect(pressKey(7, 'back')).toBe(0);
    expect(pressKey(0, 'back')).toBe(0);
    expect(pressKey(99_999, 'clear')).toBe(0);
  });
  it('최대치를 넘는 입력은 무시', () => {
    expect(pressKey(10_000_000, '0')).toBe(100_000_000);
    expect(pressKey(100_000_000, '0')).toBe(100_000_000);
    expect(pressKey(50_000, '00', 1_000_000)).toBe(50_000);
  });
  it('소수·음수 입력은 정수로 정리', () => {
    expect(pressKey(12.9, '1')).toBe(121);
    expect(pressKey(-5, '1')).toBe(1);
  });
});

describe('addAmount', () => {
  it('더하고 최대에서 멈춘다', () => {
    expect(addAmount(20_000, 10_000)).toBe(30_000);
    expect(addAmount(990_000, 50_000, 1_000_000)).toBe(1_000_000);
  });
});

describe('koreanWon', () => {
  it('만·억 단위로 읽는다', () => {
    expect(koreanWon(0)).toBe('0원');
    expect(koreanWon(1_200)).toBe('1,200원');
    expect(koreanWon(30_000)).toBe('3만 원');
    expect(koreanWon(32_000)).toBe('3만 2,000원');
    expect(koreanWon(1_500_000)).toBe('150만 원');
    expect(koreanWon(100_000_000)).toBe('1억 원');
    expect(koreanWon(123_450_000)).toBe('1억 2,345만 원');
    expect(koreanWon(200_000_500)).toBe('2억 500원');
  });
});
