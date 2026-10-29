import { describe, expect, it } from 'vitest';
import { pickLowest } from '../server/lib/purchase';
import { parsePurchaseText } from '../src/lib/ocr';

describe('사진 글자에서 금액 찾기', () => {
  it('영수증은 합계 줄의 금액을 고른다', () => {
    const text = ['스타벅스 신촌점', '아이스 아메리카노 2 9,000', '치즈케이크 1 6,900', '부가세 1,445', '합계 15,900원', '받은금액 20,000', '거스름돈 4,100'].join('\n');
    const r = parsePurchaseText(text);
    expect(r.amount).toBe(15900);
    expect(r.candidates).toContain(9000);
    expect(r.candidates).not.toContain(20000);
  });

  it('합계 다음 줄에 숫자가 있는 영수증', () => {
    const r = parsePurchaseText('GS25\n삼각김밥 1,500\n총 결제금액\n3,200');
    expect(r.amount).toBe(3200);
  });

  it('쇼핑 캡처는 할인가를 고르고 이름도 찾는다', () => {
    const r = parsePurchaseText('뉴발란스 530 스틸그레이\n정가 139,000원\n할인가 119,000원\n무료배송');
    expect(r.amount).toBe(119000);
    expect(r.name).toBe('뉴발란스 530 스틸그레이');
  });

  it('숫자가 없으면 금액 없음', () => {
    expect(parsePurchaseText('안녕하세요').amount).toBeUndefined();
  });
});

describe('최저가 고르기', () => {
  it('케이스 같은 너무 싼 결과는 빼고 가격순', () => {
    const mk = (price: number, title = 'x') => ({ title, price, mall: 'm', link: `l${price}` });
    const r = pickLowest([mk(259000), mk(9900, '케이스'), mk(249000), mk(271000), mk(12000, '필름'), mk(255000)]);
    expect(r.items[0].price).toBe(249000);
    expect(r.items.every((i) => i.price > 100000)).toBe(true);
  });
});
