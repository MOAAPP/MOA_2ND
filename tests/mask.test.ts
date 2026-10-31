import { describe, expect, it } from 'vitest';
import { formatKey, looksSensitive, maskText } from '../shared/mask';

/**
 * 마스킹 검증 (기획서: 가상의 계좌번호·카드번호·전화번호·이름을 넣은 테스트 문자 50개 이상, 누출률 0% 목표).
 * 은행·카드사별 실제 문자 형식에 가짜 개인정보를 넣고, 마스킹 결과에 하나라도 남으면 누출로 센다.
 */

const NAMES = ['김지현', '박서연', '이도윤', '최하은', '정민준', '강예린', '윤서준', '한지우'];
const PARTIAL = ['김*현', '박*연', '이*윤', '최*은'];
const CARDS = ['5310-1234-5678-9012', '4518 8821 3345 6678', '9430-****-****-1234'];
const ACCOUNTS = ['110-432-987654', '352-1234-5678-93', '1002-345-678901', '3333-12-3456789', '123-****-5678'];
const PHONES = ['010-1234-5678', '01098765432', '02-345-6789', '010.2222.3333'];
const RRNS = ['990101-2345678', '010203-4******'];
const TAILS = ['1234', '5678', '9012', '4321'];

interface Case { text: string; pii: string[]; keep: string[] }

function cases(): Case[] {
  const out: Case[] = [];
  let i = 0;
  const pick = <T,>(xs: T[]) => xs[i++ % xs.length];
  for (let k = 0; k < 8; k++) {
    const n = pick(PARTIAL), t = pick(TAILS);
    out.push({ text: `[Web발신]\n신한카드(${t})승인\n${n}님\n6,800원 일시불\n10/29 08:42\n메가커피 서울여대점\n누적 412,300원`, pii: [n, `(${t})`], keep: ['6,800원', '메가커피', '412,300원', '10/29 08:42'] });
  }
  for (let k = 0; k < 8; k++) {
    const a = pick(ACCOUNTS), nm = pick(NAMES);
    out.push({ text: `[KB]10/29 13:20\n${a}\n${nm}\n입금\n200,000\n잔액350,000`, pii: [a, nm], keep: ['200,000', '잔액350,000'] });
  }
  for (let k = 0; k < 8; k++) {
    const a = pick(ACCOUNTS), nm = pick(NAMES);
    out.push({ text: `[토스뱅크] ${nm}님께서 50,000원을 보냈어요. 받는 계좌 ${a} 잔액 120,500원`, pii: [a, nm], keep: ['50,000원', '120,500원'] });
  }
  for (let k = 0; k < 6; k++) {
    const c = pick(CARDS);
    out.push({ text: `[Web발신]\n삼성카드 ${c}\n32,000원 승인취소\n10/28 13:02\n무신사스토어`, pii: [c], keep: ['32,000원', '무신사스토어'] });
  }
  for (let k = 0; k < 6; k++) {
    const p = pick(PHONES), n = pick(PARTIAL);
    out.push({ text: `[Web발신] 현대카드 ${n} 18,500원 할부3개월 배달의민족 문의 ${p}`, pii: [p, n], keep: ['18,500원', '배달의민족', '할부3개월'] });
  }
  for (let k = 0; k < 6; k++) {
    const nm = pick(NAMES), a = pick(ACCOUNTS);
    out.push({ text: `우리은행 출금 ${a} 보낸분 ${nm} 350,000원 월세 잔액 12,000원`, pii: [a, nm], keep: ['350,000원', '월세', '12,000원'] });
  }
  for (let k = 0; k < 4; k++) {
    const r = pick(RRNS), nm = pick(NAMES);
    out.push({ text: `예금주: ${nm} 주민번호 ${r} 확인 필요`, pii: [r, nm], keep: ['확인 필요'] });
  }
  for (let k = 0; k < 4; k++) {
    const t = pick(TAILS), nm = pick(NAMES);
    out.push({ text: `[하나] 체크카드(끝자리 ${t}) 1,450원 결제 10/27 07:55 서울교통공사 / ${nm} 이체 30,000원`, pii: [`끝자리 ${t}`, nm], keep: ['1,450원', '30,000원', '서울교통공사'] });
  }
  for (let k = 0; k < 4; k++) {
    const nm = pick(NAMES);
    out.push({ text: `[카카오뱅크] 입금 480,000원 10/10 ${nm} 잔액 512,300원 contact ${nm.slice(1)}@mail.com`, pii: [nm, `${nm.slice(1)}@mail.com`], keep: ['480,000원', '512,300원'] });
  }
  return out;
}

describe('결제 문자 마스킹', () => {
  const all = cases();
  it('테스트 문자 50개 이상', () => {
    expect(all.length).toBeGreaterThanOrEqual(50);
  });

  it('누출률 0% — 가짜 개인정보가 하나도 남지 않는다', () => {
    const leaks: string[] = [];
    let total = 0;
    for (const c of all) {
      const { text } = maskText(c.text);
      for (const p of c.pii) {
        total += 1;
        if (text.includes(p)) leaks.push(`${p} ← ${text}`);
      }
    }
    const rate = leaks.length / total;
    // 결과표에 쓰는 값
    console.info(`[mask] 문자 ${all.length}개 · 개인정보 ${total}개 · 누출 ${leaks.length}개 (${(rate * 100).toFixed(1)}%)`);
    expect(leaks).toEqual([]);
  });

  it('금액·가맹점·잔액·날짜는 남긴다', () => {
    const lost: string[] = [];
    for (const c of all) {
      const { text } = maskText(c.text);
      for (const k of c.keep) if (!text.includes(k)) lost.push(`${k} ← ${text}`);
    }
    expect(lost).toEqual([]);
  });

  it('마스킹 뒤에는 개인정보처럼 보이는 흔적이 없다', () => {
    for (const c of all) expect(looksSensitive(maskText(c.text).text)).toBe(false);
  });

  it('YYYY-MM-DD 날짜는 계좌번호로 보지 않는다', () => {
    expect(maskText('2026-10-29 스벅 6800원').text).toContain('2026-10-29');
  });

  it('사용자가 지정한 말도 가린다', () => {
    expect(maskText('스터디 모임 회비 12,000원 민지네', ['민지네']).text).toBe('스터디 모임 회비 12,000원 [이름]');
  });

  it('이름이 아닌 흔한 말은 가리지 않는다', () => {
    const { text } = maskText('[신한] 급여 입금 2,000,000원 / 월세 출금 350,000원');
    expect(text).toContain('급여 입금');
    expect(text).toContain('월세 출금');
  });

  it('문자 형식 키는 은행·종류로 묶인다', () => {
    expect(formatKey('[Web발신]\n신한카드(1234)승인 6,800원')).toBe('신한|카드|승인');
    expect(formatKey('[KB]10/29 입금 200,000')).toBe('KB|계좌|입금');
  });
});
