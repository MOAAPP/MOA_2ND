/**
 * 회계 규칙 단위 테스트 — 기획서 '결제 수단별 잔고 반영 규칙' 표의 행마다 최소 2개.
 */
import { describe, expect, it } from 'vitest';
import { latestAnchor, projectBalance } from '../../src/core/balance';
import { buildLedger, creditPayDate, dailyVariableSpend, installmentPlan, sumPostings } from '../../src/core/ledger';
import { kst, kstDate } from '../../src/core/time';
import type { CreditCard, Txn } from '../../src/core/types';
import { A, B, baseSetup, id, obs, spend } from './fixtures';

const setup = baseSetup();
const cc = setup.cards.find((c) => c.id === 'cc') as CreditCard;
const ledger = (txns: Txn[]) => buildLedger(txns, setup.cards);
const move = (txns: Txn[], fromAt: string, toAt: string, acc = A) => sumPostings(ledger(txns).postings, acc, kst(fromAt), kst(toAt));

describe('체크카드·계좌이체 결제: 결제 즉시 결제계좌에서', () => {
  it('체크카드 결제는 같은 시각 결제계좌 출금', () => {
    const t = spend('2026-10-29 13:20', 6800, 'debit');
    const [p] = ledger([t]).postings;
    expect(p.accountId).toBe(A);
    expect(p.debitAt).toBe(kst('2026-10-29 13:20'));
    expect(p.amount).toBe(-6800);
  });
  it('계좌이체도 결제 즉시, 소비 집계에는 구매일로 포함', () => {
    const t = spend('2026-10-29 09:00', 30000, 'transfer');
    expect(move([t], '2026-10-29 00:00', '2026-10-29 23:59')).toBe(-30000);
    expect(dailyVariableSpend([t]).get('2026-10-29')).toBe(30000);
  });
});

describe('지갑 현금 결제: 잔고 반영 안 함, 소비 집계 포함', () => {
  it('현금 결제는 결제계좌 Posting이 없다', () => {
    expect(ledger([spend('2026-10-29 12:00', 5000, 'cash')]).postings).toHaveLength(0);
  });
  it('현금 결제는 소비 집계에는 들어간다', () => {
    const v = dailyVariableSpend([spend('2026-10-29 12:00', 5000, 'cash'), spend('2026-10-29 18:00', 3000, 'cash')]);
    expect(v.get('2026-10-29')).toBe(8000);
  });
});

describe('ATM 현금 인출: 인출 즉시 출금, 소비 집계 제외', () => {
  const atm: Txn = { id: id(), type: 'atm', occurredAt: kst('2026-10-29 10:00'), amount: 50000, accountId: A };
  it('인출 즉시 결제계좌에서 빠진다', () => {
    expect(move([atm], '2026-10-29 00:00', '2026-10-29 10:00')).toBe(-50000);
  });
  it('인출 자체는 소비가 아니다', () => {
    expect(dailyVariableSpend([atm]).size).toBe(0);
  });
});

describe('신용카드 일시불(이미 사용): 청구 주기 결제일에 청구 예정으로 쌓임', () => {
  it('10/20 사용 → 이용 기간 10/31 마감 → 11/14 결제일 00:00 출금', () => {
    expect(creditPayDate(cc, kst('2026-10-20 15:00'))).toBe('2026-11-14');
    const [p] = ledger([spend('2026-10-20 15:00', 30000, 'credit')]).postings;
    expect(p.role).toBe('card_charge');
    expect(p.payDate).toBe('2026-11-14');
    expect(p.debitAt).toBe(kst('2026-11-14 00:00'));
  });
  it('구매일엔 잔고 그대로, 소비 집계는 구매일 기준', () => {
    const t = spend('2026-10-20 15:00', 30000, 'credit');
    expect(move([t], '2026-10-20 00:00', '2026-11-13 23:59')).toBe(0);
    expect(move([t], '2026-11-13 23:59', '2026-11-14 00:00')).toBe(-30000);
    expect(dailyVariableSpend([t]).get('2026-10-20')).toBe(30000);
  });
  it('기준일(31=말일)이 짧은 달에도 말일로 처리', () => {
    expect(creditPayDate(cc, '2027-02-28')).toBe('2027-03-14');
    expect(creditPayDate(cc, '2027-03-01')).toBe('2027-04-14');
  });
});

describe('신용카드 할부: 회차별 출금일, 소비 집계는 구매일 총액', () => {
  it('3개월 할부 100,000원 → 33,334 / 33,333 / 33,333, 11·12·1월 14일', () => {
    const plan = installmentPlan(cc, kst('2026-10-05 10:00'), 100000, 3);
    expect(plan).toEqual([
      { payDate: '2026-11-14', amount: 33334 },
      { payDate: '2026-12-14', amount: 33333 },
      { payDate: '2027-01-14', amount: 33333 },
    ]);
  });
  it('3회차 출금만 따로 잡히고 집계는 구매일 총액', () => {
    const t = spend('2026-10-05 10:00', 100000, 'credit', { installments: 3 });
    const ps = ledger([t]).postings;
    expect(ps.map((p) => p.payDate)).toEqual(['2026-11-14', '2026-12-14', '2027-01-14']);
    expect(move([t], '2027-01-13 23:59', '2027-01-14 00:00')).toBe(-33333);
    expect(dailyVariableSpend([t]).get('2026-10-05')).toBe(100000);
  });
});

describe('카드 대금 출금: 한 건으로 처리하고 청구 예정은 지움', () => {
  it('청구 예정과 같은 금액이면 차액 0, 출금은 한 번만', () => {
    const a = spend('2026-10-03 12:00', 20000, 'credit');
    const b = spend('2026-10-21 12:00', 10000, 'credit');
    const bill: Txn = { id: id(), type: 'card_bill', occurredAt: kst('2026-11-14 06:00'), amount: 30000, cardId: 'cc', accountId: A };
    const r = ledger([a, b, bill]);
    expect(r.postings.filter((p) => p.role === 'card_charge')).toHaveLength(0);
    expect(r.bills[0]).toMatchObject({ expected: 30000, actual: 30000, diff: 0, needsConfirm: false });
    expect(sumPostings(r.postings, A, kst('2026-11-01 00:00'), kst('2026-11-30 00:00'))).toBe(-30000);
  });
  it('청구액이 다르면 차액만 조정하고 확인 요청 (중복 차감 없음)', () => {
    const a = spend('2026-10-03 12:00', 20000, 'credit');
    const bill: Txn = { id: id(), type: 'card_bill', occurredAt: kst('2026-11-14 06:00'), amount: 21500, cardId: 'cc', accountId: A };
    const r = ledger([a, bill]);
    expect(r.bills[0]).toMatchObject({ expected: 20000, actual: 21500, diff: 1500, needsConfirm: true });
    expect(sumPostings(r.postings, A, kst('2026-11-01 00:00'), kst('2026-11-30 00:00'))).toBe(-21500);
  });
  it('카드 대금 출금은 소비 집계에서 제외', () => {
    const bill: Txn = { id: id(), type: 'card_bill', occurredAt: kst('2026-11-14 06:00'), amount: 21500, cardId: 'cc', accountId: A };
    expect(dailyVariableSpend([bill]).size).toBe(0);
  });
});

describe('본인 계좌 간 이체: 결제계좌로 들고 날 때만 반영', () => {
  it('결제계좌 → 저축통장 이체는 결제계좌 출금', () => {
    const t: Txn = { id: id(), type: 'own_transfer', occurredAt: kst('2026-10-29 09:00'), amount: 100000, from: A, to: B };
    expect(move([t], '2026-10-29 00:00', '2026-10-29 23:59')).toBe(-100000);
    expect(move([t], '2026-10-29 00:00', '2026-10-29 23:59', B)).toBe(100000);
  });
  it('한 계좌만 추적할 때: 다른 계좌끼리 이체는 결제계좌에 영향 없음, 집계 제외', () => {
    const t: Txn = { id: id(), type: 'own_transfer', occurredAt: kst('2026-10-29 09:00'), amount: 100000, from: B, to: 'acc-c' };
    expect(move([t], '2026-10-29 00:00', '2026-10-29 23:59')).toBe(0);
    expect(dailyVariableSpend([t]).size).toBe(0);
  });
});

describe('적금 납입: 납입일 출금, 소비 집계 제외', () => {
  const t: Txn = { id: id(), type: 'saving', occurredAt: kst('2026-10-25 08:00'), amount: 500000, accountId: A, name: '청년미래적금' };
  it('납입일에 결제계좌에서 빠진다', () => {
    expect(move([t], '2026-10-25 00:00', '2026-10-25 23:59')).toBe(-500000);
  });
  it('소비가 아니라 저축', () => {
    expect(dailyVariableSpend([t]).size).toBe(0);
  });
});

describe('급여·용돈 입금: t₀ 이후 입금만', () => {
  it('잔액 확인 전날 들어온 급여는 다시 더하지 않는다 (B₀=30만, 시작값 50만 아님)', () => {
    const pay: Txn = { id: id(), type: 'income', occurredAt: kst('2026-10-28 09:00'), amount: 200000, accountId: A };
    const anchor = latestAnchor([obs('2026-10-29 10:00', 300000)], A)!;
    const days = projectBalance(anchor, ledger([pay]).postings, A, '2026-10-30');
    expect(days[0].open).toBe(300000);
    expect(days[days.length - 1].close).toBe(300000);
  });
  it('잔액 확인 뒤 들어온 입금(잔액 없는 문자)은 반영', () => {
    const pay: Txn = { id: id(), type: 'income', occurredAt: kst('2026-10-29 15:00'), amount: 200000, accountId: A };
    const anchor = latestAnchor([obs('2026-10-29 10:00', 300000)], A)!;
    const days = projectBalance(anchor, ledger([pay]).postings, A, '2026-10-29');
    expect(days[0].close).toBe(500000);
  });
});

describe('중복 차감 방지', () => {
  it('같은 신용카드 지출이 소비일과 청구일에 두 번 빠지지 않는다', () => {
    const t = spend('2026-10-20 15:00', 30000, 'credit');
    const bill: Txn = { id: id(), type: 'card_bill', occurredAt: kst('2026-11-14 07:00'), amount: 30000, cardId: 'cc', accountId: A };
    const total = sumPostings(ledger([t, bill]).postings, A, kst('2026-10-01 00:00'), kst('2026-12-01 00:00'));
    expect(total).toBe(-30000);
  });
  it('연결된 환불은 원거래에서 빼되 0원 아래로 내려가지 않는다', () => {
    const t = spend('2026-10-20 15:00', 10000, 'debit');
    const r: Txn = { id: id(), type: 'refund', occurredAt: kst('2026-10-21 10:00'), amount: 15000, linkedTxnId: t.id };
    expect(dailyVariableSpend([t, r]).get('2026-10-20')).toBe(0);
  });
  it('연결되지 않은 환불은 잔고에는 입금, 학습 정답에서는 제외', () => {
    const r: Txn = { id: id(), type: 'refund', occurredAt: kst('2026-10-21 10:00'), amount: 15000, accountId: A };
    expect(move([r], '2026-10-21 00:00', '2026-10-21 23:59')).toBe(15000);
    expect(dailyVariableSpend([r]).size).toBe(0);
  });
});

describe('결제계좌 연결 확인', () => {
  it('다른 계좌에 연결된 체크카드는 결제계좌 잔고 그대로, 소비 집계에는 포함', () => {
    const t = spend('2026-10-29 12:00', 9000, 'debit', { cardId: 'chkB' });
    expect(move([t], '2026-10-29 00:00', '2026-10-29 23:59')).toBe(0);
    expect(dailyVariableSpend([t]).get('2026-10-29')).toBe(9000);
  });
  it('처음 보는 카드는 어느 계좌인지 묻도록 표시', () => {
    const t = spend('2026-10-29 12:00', 9000, 'debit', { cardId: 'new-card' });
    const r = ledger([t]);
    expect(r.unknownCards).toEqual(['new-card']);
    expect(r.postings).toHaveLength(0);
    expect(kstDate(kst('2026-10-29 23:59'))).toBe('2026-10-29');
  });
});
