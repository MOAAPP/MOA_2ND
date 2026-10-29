import { describe, expect, it } from 'vitest';
import { addMonths } from '../shared/dates';
import { floorWon, interestTax, payout } from '../src/lib/bank/money';
import { PRODUCT_BY_ID } from '../src/lib/bank/products';
import {
  advance,
  bankTotals,
  closeEarly,
  earlyQuote,
  elapsedMonths,
  emptyBank,
  emptyContext,
  maturityInterest,
  migrateLegacy,
  openContract,
  payInto,
  quoteJoin,
  type BankResult,
  type BankState,
} from '../src/lib/bank/engine';
import { applyToWallet, bankContext } from '../src/lib/bank/sync';
import { emptyWorldWallet } from '../src/lib/worldWallet';

const ok = (r: BankResult | { error: string }): BankResult => {
  if ('error' in r) throw new Error(r.error);
  return r;
};
const BIG = 100_000_000;
const ctx = emptyContext();

describe('money', () => {
  it('이자는 원 미만, 세금은 각각 10원 미만 절사', () => {
    expect(floorWon(1234.9999999)).toBe(1235);
    expect(floorWon(1234.56)).toBe(1234);
    // 이자 12,345원 → 소득세 1,728.3→1,720 / 지방세 172.83→170
    expect(interestTax(12_345)).toEqual({ incomeTax: 1720, localTax: 170, total: 1890 });
    expect(payout(1_000_000, 12_345)).toEqual({ principal: 1_000_000, interest: 12_345, tax: 1890, net: 1_010_455 });
  });
});

describe('정기예금', () => {
  const p = PRODUCT_BY_ID['moa-held-deposit'];
  it('단리: 원금 × 금리 × 일수/365', () => {
    // 2026-01-01 ~ 2027-01-01 = 365일, 3.2% (우대 없음… 첫 가입 우대 0.1%가 붙음)
    const q = quoteJoin(p, { amount: 1_000_000, months: 12, openedOn: '2026-01-01' }, ctx, []);
    expect(q.ok).toBe(true);
    expect(q.baseRate).toBe(3.2);
    expect(q.prefRate).toBe(0.1); // 모아뱅크 첫 가입
    expect(q.appliedRate).toBe(3.3);
    expect(q.interest).toBe(33_000);
    expect(q.tax).toBe(4620 + 460);
    expect(q.net).toBe(1_000_000 + 33_000 - 5080);
  });

  it('참기 기록 3번이면 우대 0.2%p, 상한 0.3%p', () => {
    const c = { ...ctx, skipDates: ['2025-12-10', '2025-12-15', '2025-12-20'] };
    const q = quoteJoin(p, { amount: 1_000_000, months: 12, openedOn: '2026-01-01' }, c, []);
    expect(q.prefRate).toBe(0.3);
    expect(q.prefs.every((x) => x.achieved)).toBe(true);
  });

  it('월복리: 원금 × ((1+r/12)^n − 1)', () => {
    const h = PRODUCT_BY_ID['haneul-compound'];
    const q = quoteJoin(h, { amount: 10_000_000, months: 12, openedOn: '2026-03-01' }, ctx, []);
    const expected = Math.floor(10_000_000 * (Math.pow(1 + 0.0355 / 12, 12) - 1));
    expect(q.interest).toBe(expected);
    expect(q.interest).toBeGreaterThan(355_000); // 단리보다 많음
  });

  it('최소·최대 금액과 없는 기간은 거절', () => {
    expect(quoteJoin(p, { amount: 5_000, months: 12, openedOn: '2026-01-01' }, ctx).ok).toBe(false);
    expect(quoteJoin(p, { amount: 20_000_000, months: 12, openedOn: '2026-01-01' }, ctx).ok).toBe(false);
    expect(quoteJoin(p, { amount: 100_000, months: 7, openedOn: '2026-01-01' }, ctx).ok).toBe(false);
  });

  it('쓸 수 있는 돈보다 많으면 가입 불가', () => {
    const r = openContract(emptyBank(), p, { amount: 200_000, months: 6, openedOn: '2026-01-01' }, ctx, 100_000);
    expect('error' in r && r.error).toContain('부족');
  });

  it('중도해지: 경과 기간별 기본금리 비율, 우대금리 없음', () => {
    const r = ok(openContract(emptyBank(), p, { amount: 1_000_000, months: 12, openedOn: '2026-01-01' }, ctx, BIG));
    const c = r.bank.contracts[0];
    expect(earlyQuote(c, '2026-01-20').appliedRate).toBe(0.1); // 1개월 미만 고정 0.1%
    expect(earlyQuote(c, '2026-03-15').appliedRate).toBeCloseTo(0.32); // 3개월 미만 10%
    const s = earlyQuote(c, '2026-07-01'); // 6개월 경과 → 50%
    expect(s.appliedRate).toBeCloseTo(1.6);
    expect(s.interest).toBe(Math.floor((1_000_000 * 0.016 * 181) / 365));
    const closed = ok(closeEarly(r.bank, c.id, '2026-07-01'));
    expect(closed.cash).toBe(s.net);
    expect(closed.bank.contracts[0].status).toBe('closed');
  });

  it('만기일에 자동으로 원금+세후이자 수령', () => {
    const r = ok(openContract(emptyBank(), p, { amount: 1_000_000, months: 3, openedOn: '2026-01-01' }, ctx, BIG));
    const bank: BankState = { ...r.bank, lastProcessed: '2026-01-01' };
    const before = advance(bank, '2026-03-31', ctx, 0);
    expect(before.events).toHaveLength(0);
    const after = advance(before.bank, '2026-04-01', ctx, 0);
    expect(after.events[0].type).toBe('mature');
    const c = after.bank.contracts[0];
    expect(c.status).toBe('matured');
    // 90일, 2.8% + 첫가입 0.1%
    expect(c.settlement!.interest).toBe(Math.floor((1_000_000 * 0.029 * 90) / 365));
    expect(after.cash).toBe(c.settlement!.net);
  });
});

describe('정액 적금', () => {
  const p = PRODUCT_BY_ID['byeol-fixed'];
  it('모두 제날짜 납입: 월납입 × r/12 × n(n+1)/2 (+자동이체 우대)', () => {
    const q = quoteJoin(p, { amount: 100_000, months: 12, openedOn: '2026-01-10' }, ctx);
    expect(q.appliedRate).toBe(4.2); // 3.8 + 자동이체 0.4
    expect(q.principal).toBe(1_200_000);
    expect(q.interest).toBe(Math.floor(100_000 * (0.042 / 12) * 78));
  });

  it('자동이체 회차 처리, 잔액 부족이면 미납 → 우대 상실, 이자 감소', () => {
    const r = ok(openContract(emptyBank(), p, { amount: 100_000, months: 6, openedOn: '2026-01-10' }, ctx, BIG));
    let bank: BankState = { ...r.bank, lastProcessed: '2026-01-10' };
    const a = advance(bank, '2026-03-10', ctx, 150_000); // 2회차 성공(5만 남음), 3회차 미납
    expect(a.events.map((e) => e.type)).toEqual(['autoPay', 'missed']);
    expect(a.cash).toBe(-100_000);
    bank = a.bank;
    const c = bank.contracts[0];
    expect(c.payments.map((x) => x.round)).toEqual([1, 2]);
    expect(c.missedRounds).toEqual([3]);
    const end = advance(bank, '2026-07-10', ctx, BIG);
    const done = end.bank.contracts[0];
    expect(done.status).toBe('matured');
    expect(done.settlement!.appliedRate).toBe(3.5); // 미납이 있어 우대 없음
    expect(done.payments).toHaveLength(5);
    // 회차 1,2,4,5,6 → 남은 개월 6,5,3,2,1 = 17
    expect(done.settlement!.interest).toBe(Math.floor(100_000 * (0.035 / 12) * 17));
  });

  it('31일 가입은 짧은 달 말일에 자동이체', () => {
    const r = ok(openContract(emptyBank(), p, { amount: 50_000, months: 6, openedOn: '2026-01-31' }, ctx, BIG));
    const a = advance({ ...r.bank, lastProcessed: '2026-01-31' }, '2026-02-28', ctx, BIG);
    expect(a.events[0]).toMatchObject({ type: 'autoPay', on: '2026-02-28' });
  });
});

describe('자유적립 적금', () => {
  const p = PRODUCT_BY_ID['moa-challenge'];
  it('입금일부터 만기일까지 일할 이자, 월 한도 30만 원', () => {
    let r = ok(openContract(emptyBank(), p, { amount: 100_000, months: 6, openedOn: '2026-01-01' }, ctx, BIG));
    r = ok(payInto(r.bank, r.bank.contracts[0].id, 150_000, '2026-01-20', BIG));
    const over = payInto(r.bank, r.bank.contracts[0].id, 60_000, '2026-01-25', BIG);
    expect('error' in over && over.error).toContain('50,000');
    r = ok(payInto(r.bank, r.bank.contracts[0].id, 50_000, '2026-02-01', BIG));
    const c = r.bank.contracts[0];
    const days = (a: string) => Math.round((Date.UTC(2026, 6, 1) - Date.parse(a + 'T00:00:00Z')) / 86400000);
    const expected = Math.floor((100_000 * 0.03 * days('2026-01-01') + 150_000 * 0.03 * days('2026-01-20') + 50_000 * 0.03 * days('2026-02-01')) / 365);
    expect(maturityInterest(c, p, 3.0)).toBe(expected);
  });

  it('기간 중 참기 10번이면 만기에 우대 1.5%p', () => {
    const r = ok(openContract(emptyBank(), p, { amount: 100_000, months: 6, openedOn: '2026-01-01' }, ctx, BIG));
    const skips = Array.from({ length: 10 }, (_, i) => addMonths('2026-01-05', 0).replace('05', String(5 + i).padStart(2, '0')));
    const end = advance({ ...r.bank, lastProcessed: '2026-01-01' }, '2026-07-01', { ...ctx, skipDates: skips }, BIG);
    const s = end.bank.contracts[0].settlement!;
    expect(s.appliedRate).toBe(4.5);
    expect(end.bank.contracts[0].preferentialIds).toContain('skip10');
  });
});

describe('지갑 연결', () => {
  it('가입하면 현금이 줄고 예금 캐시와 거래내역이 생긴다', () => {
    const w = emptyWorldWallet();
    const r = ok(openContract(emptyBank(), PRODUCT_BY_ID['moa-held-deposit'], { amount: 50_000, months: 3, openedOn: '2026-01-01' }, ctx, BIG));
    const w2 = applyToWallet(w, r, '2026-01-01');
    expect(w2.cash).toBe(w.cash - 50_000);
    expect(w2.deposit).toBe(50_000);
    expect(w2.movements.at(-1)).toMatchObject({ kind: 'deposit', amount: 50_000 });
    expect(bankTotals(r.bank, '2026-01-01').principal).toBe(50_000);
  });

  it('예전 잔액은 기존 계약으로 옮긴다(한 번만)', () => {
    const b = migrateLegacy(emptyBank(), { deposit: 30_000, installment: 0 }, '2026-01-01');
    expect(b.contracts).toHaveLength(1);
    expect(migrateLegacy(b, { deposit: 30_000, installment: 0 }, '2026-01-01').contracts).toHaveLength(1);
  });

  it('참기 기록과 가계부 날짜로 우대조건 컨텍스트를 만든다', () => {
    const c = bankContext({
      records: [
        { id: 'a', createdAt: 0, source: 'decide', category: 'x', params: { amount: 1, date: '2026-01-02' }, choice: 'skip', reflectedOverride: null, inParallel: false, parallelAs: 'buy' },
        { id: 'b', createdAt: 0, source: 'spent', category: 'x', params: { amount: 1, date: '2026-01-03' }, choice: 'buy', reflectedOverride: null, inParallel: false, parallelAs: 'buy' },
      ],
      worldWallet: emptyWorldWallet(),
      spendLog: [{ date: '2026-01-04' }],
      learning: { completed: { l1: {}, l2: {} } },
    });
    expect(c.skipDates).toEqual(['2026-01-02']);
    expect(c.ledgerDates.sort()).toEqual(['2026-01-03', '2026-01-04']);
    expect(c.lessons).toBe(2);
  });

  it('경과 개월 계산', () => {
    expect(elapsedMonths('2026-01-31', '2026-02-27')).toBe(0);
    expect(elapsedMonths('2026-01-31', '2026-02-28')).toBe(1);
    expect(elapsedMonths('2026-01-10', '2026-07-09')).toBe(5);
    expect(elapsedMonths('2026-01-10', '2026-07-10')).toBe(6);
  });
});

describe('월급 주기 + 시간 이동', () => {
  it('매달 1일 고정지출이 빠지고 월급이 들어온 뒤 그날 자동이체가 처리된다', async () => {
    const { catchUp } = await import('../src/lib/bank/sync');
    const { WORLD_MONTHLY_INCOME, WORLD_FIXED_BILLS } = await import('../src/lib/worldWallet');
    const w0 = emptyWorldWallet(); // 쓸 수 있는 돈 120,000
    const r = ok(openContract(emptyBank(), PRODUCT_BY_ID['byeol-fixed'], { amount: 100_000, months: 6, openedOn: '2026-01-01', autoDay: 1 }, ctx, BIG));
    const w1 = applyToWallet(w0, r, '2026-01-01'); // 쓸 수 있는 돈 20,000
    const bank = { ...r.bank, lastProcessed: '2026-01-01', clockOffsetDays: 0 };
    const out = catchUp(bank, w1, ctx, new Date('2026-02-01T03:00:00Z'))!;
    expect(out.paydays).toBe(1);
    expect(out.events.map((e) => e.type)).toEqual(['autoPay']); // 월급 덕분에 미납 아님
    expect(out.wallet.cash).toBe(w1.cash - WORLD_FIXED_BILLS + WORLD_MONTHLY_INCOME - 100_000);
    expect(out.wallet.installment).toBe(200_000);
    // 같은 날 다시 돌려도 아무 일 없음
    expect(catchUp(out.bank, out.wallet, ctx, new Date('2026-02-01T05:00:00Z'))).toBeNull();
  });
});
