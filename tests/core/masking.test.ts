/**
 * 마스킹 검증 — 은행·카드사별 문자 형식에 가상의 계좌번호·카드번호·전화번호·이름을 넣은 테스트 문자 50개 이상.
 * LLM에 전달될 최종 문자열에 가상 개인정보가 하나라도 남은 비율(누출률)을 잰다. 목표 0%.
 * 금액·날짜·시각·잔액은 남아야 한다.
 */
import { describe, expect, it } from 'vitest';
import { formatSignature, maskPayment, maskRanges, needsConfirm } from '../../shared/masking';

const NAMES = ['홍길동', '김민지', '이서연', '박지훈', '최유진', '정다은', '강하늘', '윤서아', '임도현', '한지민'];
const PHONES = ['010-1234-5678', '01098765432', '010 2222 3333', '02-555-1234', '031-123-4567'];
const ACCOUNTS = ['110-234-567890', '3333-01-2345678', '1002-345-678901', '94180100123456', '356-0123-4567-83'];
const CARDS = ['5310-12**-****-7788', '9410*1**', '4518-4420-1234-5678', '1234-56**-****-9012', '5310*3**'];
const RRNS = ['990101-2345678', '020315-4******'];

interface Case {
  text: string;
  pii: string[];
  keep: string[];
}

function cases(): Case[] {
  const out: Case[] = [];
  for (let i = 0; i < 10; i++) {
    const n = NAMES[i];
    const masked = `${n[0]}*${n[2]}`;
    const card = CARDS[i % CARDS.length];
    const acc = ACCOUNTS[i % ACCOUNTS.length];
    const ph = PHONES[i % PHONES.length];
    const amt = `${(i + 1) * 3}${i % 2 ? ',500' : ',000'}원`;
    const bal = `${(i + 2) * 41},${i}00원`;
    out.push(
      { text: `[Web발신]\n신한카드(${card.slice(-4)})승인 ${masked}님 ${amt}(일시불)10/29 13:2${i} 스타벅스 누적1,234,500원`, pii: [masked], keep: [amt, '10/29', '스타벅스'] },
      { text: `[Web발신]\nKB국민체크(${card.slice(0, 4)})\n${masked}님\n10/29 12:0${i}\n${amt} 승인\nGS25역삼점\n잔액${bal}`, pii: [masked], keep: [amt, bal, 'GS25역삼점'] },
      { text: `[Web발신]\n[우리은행] ${acc} 입금 ${amt} ${n} 잔액 ${bal} 10/29 09:1${i}`, pii: [acc, n], keep: [amt, bal] },
      { text: `[Web발신]\n카카오뱅크 출금 ${amt}\n${n} 송금\n잔액 ${bal}\n문의 ${ph}`, pii: [n, ph], keep: [amt, bal] },
      { text: `[하나] ${n}님 카드 ${card} ${amt} 할부3개월 쿠팡 10/2${i % 9} 고객센터 ${ph}`, pii: [n, card, ph], keep: [amt, '쿠팡'] },
      { text: `토스뱅크 ${acc}\n${n} 이체 ${amt}\n잔액 ${bal}\n본인확인 ${RRNS[i % 2]} 담당 ${n.slice(0, 3)}@moa.kr`, pii: [acc, n, RRNS[i % 2], `${n.slice(0, 3)}@moa.kr`], keep: [amt, bal] },
    );
  }
  return out;
}

describe('결제 문자 마스킹 (누출률)', () => {
  const all = cases();
  it(`테스트 문자 ${all.length}개 — 가상 개인정보 누출률 0%`, () => {
    expect(all.length).toBeGreaterThanOrEqual(50);
    const leaks: string[] = [];
    for (const c of all) {
      const { text } = maskPayment(c.text);
      for (const p of c.pii) if (text.includes(p) || text.includes(p.replace(/\D/g, '').slice(0, 8) || '∅')) leaks.push(`${p} ← ${text}`);
    }
    const rate = leaks.length / all.length;
    expect(leaks).toEqual([]);
    expect(rate).toBe(0);
  });
  it('금액·잔액·날짜·가맹점은 남는다', () => {
    const lost: string[] = [];
    for (const c of all) {
      const { text } = maskPayment(c.text);
      for (const k of c.keep) if (!text.includes(k)) lost.push(`${k} ← ${text}`);
    }
    expect(lost).toEqual([]);
  });
  it('원문 값은 결과 객체 어디에도 담기지 않는다 (개수만)', () => {
    const r = maskPayment('[우리은행] 110-234-567890 입금 30,000원 홍길동 잔액 120,000원');
    expect(JSON.stringify(r)).not.toContain('567890');
    expect(JSON.stringify(r)).not.toContain('홍길동');
    expect(r.counts.account).toBe(1);
    expect(r.counts.name).toBe(1);
  });
});

describe('전송 전 확인', () => {
  it('같은 은행·같은 형식이면 같은 서명 → 한 번 승인한 형식은 자동 전송', () => {
    const a = formatSignature('[Web발신]\nKB국민체크(5310)\n홍*동님\n10/29 12:01\n6,800원 승인\nGS25역삼점\n잔액120,000원');
    const b = formatSignature('[Web발신]\nKB국민체크(5310)\n김*지님\n10/30 18:44\n12,300원 승인\n이디야강남점\n잔액98,500원');
    expect(a).toBe(b);
    expect(needsConfirm(a, new Set([b]))).toBe(false);
    expect(needsConfirm(a, new Set())).toBe(true);
    expect(needsConfirm(a, new Set([b]), true)).toBe(true);
  });
  it('사용자가 더 가릴 부분을 지정할 수 있다', () => {
    expect(maskRanges('스타벅스 강남R점 6,800원', [{ start: 5, end: 9 }])).toBe('스타벅스 [가림] 6,800원');
  });
});
