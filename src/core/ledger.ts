/**
 * 결제 수단별 잔고 반영 규칙 (기획서 '결제 수단별 잔고 반영 규칙' 표).
 *
 * 확정 거래(Txn) → 계좌 기준 Posting 으로 바꾼다.
 * - occurredAt: 소비가 일어난 시각 / debitAt: 계좌에서 실제로 빠지는(빠질) 시각
 * - 신용카드 사용분은 해당 청구 주기의 결제일 00:00(KST)에 '청구 예정'으로 쌓이고,
 *   카드 대금 출금 문자가 오면 그 주기의 청구 예정을 지우고 실제 출금 한 건으로 바꾼다.
 */
import { diffDays, type ISODate } from '../../shared/dates';
import { kstDate, kstStart, nextMonthlyAfter, nextMonthlyOnOrAfter } from './time';
import { type AccountRef, type Card, type CreditCard, type Method, type Ms, type Txn } from './types';

export type PostingRole =
  | 'variable' // 체크·계좌이체 변동 지출 (D̂)
  | 'essential_spend' // 필수 지출을 거래로 기록한 것 (월세 이체 등)
  | 'card_charge' // 신용카드 청구 예정 (Ĉ 확정분)
  | 'card_bill' // 실제 카드 대금 출금
  | 'fixed' // 고정 출금 일정 (F)
  | 'income' // 입금 (I)
  | 'transfer' // 본인 계좌 간 이체
  | 'saving' // 적금 납입
  | 'atm' // 현금 인출
  | 'refund';

export interface Posting {
  id: string;
  sourceId: string;
  role: PostingRole;
  occurredAt: Ms;
  debitAt: Ms;
  accountId: AccountRef;
  /** 계좌 기준 부호: 들어오면 +, 나가면 − */
  amount: number;
  status: 'confirmed' | 'forecast';
  forecastRunId?: string;
  method?: Method;
  cardId?: string;
  /** 신용카드 청구분이 묶이는 결제일 */
  payDate?: ISODate;
  label?: string;
  essential?: boolean;
}

/** 카드 대금 대조 결과 — 차액이 있으면 사용자 확인 필요 */
export interface BillReconciliation {
  billTxnId: string;
  cardId: string;
  payDate: ISODate;
  expected: number;
  actual: number;
  diff: number;
  needsConfirm: boolean;
}

/** 사용 시각이 속한 청구 주기의 결제일 */
export function creditPayDate(card: CreditCard, used: Ms | ISODate): ISODate {
  const date = typeof used === 'number' ? kstDate(used) : used;
  const cycleEnd = nextMonthlyOnOrAfter(date, card.cycleEndDay);
  return nextMonthlyAfter(cycleEnd, card.payDay);
}

/** 할부 회차별 결제일·금액. 원 단위 나머지는 1회차에 더한다. */
export function installmentPlan(card: CreditCard, used: Ms, total: number, n: number): { payDate: ISODate; amount: number }[] {
  const each = Math.floor(total / n);
  const rest = total - each * n;
  const out: { payDate: ISODate; amount: number }[] = [];
  let pay = creditPayDate(card, used);
  for (let i = 0; i < n; i++) {
    out.push({ payDate: pay, amount: i === 0 ? each + rest : each });
    pay = nextMonthlyAfter(pay, card.payDay);
  }
  return out;
}

export interface LedgerResult {
  postings: Posting[];
  bills: BillReconciliation[];
  /** 어느 계좌에서 빠지는지 모르는 체크카드 (처음 보는 카드 → 한 번 묻는다) */
  unknownCards: string[];
}

/** 카드 대금 문자를 청구 예정 묶음과 맞출 때 허용하는 날짜 차이(일) */
export const BILL_MATCH_DAYS = 5;

export function buildLedger(txns: Txn[], cards: Card[]): LedgerResult {
  const cardById = new Map(cards.map((c) => [c.id, c]));
  const unknown = new Set<string>();
  const postings: Posting[] = [];
  const spendById = new Map<string, Extract<Txn, { type: 'spend' }>>();
  for (const t of txns) if (t.type === 'spend') spendById.set(t.id, t);

  const sorted = [...txns].sort((a, b) => a.occurredAt - b.occurredAt);
  for (const t of sorted) {
    switch (t.type) {
      case 'spend': {
        const role: PostingRole = t.essential ? 'essential_spend' : 'variable';
        if (t.method === 'cash') break; // 지갑 현금: 잔고 반영 안 함
        if (t.method === 'transfer') {
          if (!t.accountId) break;
          postings.push(p(t, role, t.occurredAt, t.accountId, -t.amount, 'transfer'));
          break;
        }
        const card = t.cardId ? cardById.get(t.cardId) : undefined;
        if (t.method === 'debit') {
          if (!card || card.kind !== 'debit' || !card.accountId) {
            if (t.cardId) unknown.add(t.cardId);
            break; // 소비 집계에만 들어가고 잔고는 그대로
          }
          postings.push(p(t, role, t.occurredAt, card.accountId, -t.amount, 'debit', card.id));
          break;
        }
        // credit
        if (!card || card.kind !== 'credit') {
          if (t.cardId) unknown.add(t.cardId);
          break;
        }
        const n = t.installments && t.installments >= 2 ? Math.floor(t.installments) : 1;
        const plan = n === 1 ? [{ payDate: creditPayDate(card, t.occurredAt), amount: t.amount }] : installmentPlan(card, t.occurredAt, t.amount, n);
        plan.forEach((x, i) =>
          postings.push({
            ...p(t, 'card_charge', kstStart(x.payDate), card.accountId, -x.amount, 'credit', card.id),
            id: n === 1 ? t.id : `${t.id}#${i + 1}`,
            payDate: x.payDate,
            label: n === 1 ? undefined : `할부 ${i + 1}/${n}`,
          }),
        );
        break;
      }
      case 'atm':
        postings.push(p(t, 'atm', t.occurredAt, t.accountId, -t.amount));
        break;
      case 'card_bill':
        postings.push({ ...p(t, 'card_bill', t.occurredAt, t.accountId, -t.amount), cardId: t.cardId });
        break;
      case 'own_transfer':
        postings.push({ ...p(t, 'transfer', t.occurredAt, t.from, -t.amount), id: `${t.id}:out` });
        postings.push({ ...p(t, 'transfer', t.occurredAt, t.to, t.amount), id: `${t.id}:in` });
        break;
      case 'saving':
        postings.push(p(t, 'saving', t.occurredAt, t.accountId, -t.amount));
        break;
      case 'income':
        postings.push(p(t, 'income', t.occurredAt, t.accountId, t.amount));
        break;
      case 'refund': {
        const orig = t.linkedTxnId ? spendById.get(t.linkedTxnId) : undefined;
        if (orig && orig.method === 'credit') {
          const card = orig.cardId ? cardById.get(orig.cardId) : undefined;
          if (card && card.kind === 'credit') {
            // 카드 취소: 취소일이 속한 청구 주기에서 청구 예정을 줄인다
            const payDate = creditPayDate(card, t.occurredAt);
            postings.push({ ...p(t, 'refund', kstStart(payDate), card.accountId, t.amount, 'credit', card.id), payDate });
          }
          break;
        }
        if (orig && orig.method === 'debit') {
          const card = orig.cardId ? cardById.get(orig.cardId) : undefined;
          if (card && card.kind === 'debit' && card.accountId) postings.push(p(t, 'refund', t.occurredAt, card.accountId, t.amount, 'debit', card.id));
          break;
        }
        if (orig && orig.method === 'transfer' && orig.accountId) {
          postings.push(p(t, 'refund', t.occurredAt, orig.accountId, t.amount));
          break;
        }
        if (t.accountId) postings.push(p(t, 'refund', t.occurredAt, t.accountId, t.amount));
        break;
      }
    }
  }

  const bills = settleCardBills(postings);
  return { postings: postings.filter((x) => !x.id.startsWith('~cleared~')), bills, unknownCards: [...unknown] };
}

function p(t: Txn, role: PostingRole, debitAt: Ms, accountId: AccountRef, amount: number, method?: Method, cardId?: string): Posting {
  return {
    id: t.id,
    sourceId: t.id,
    role,
    occurredAt: t.occurredAt,
    debitAt,
    accountId,
    amount,
    status: 'confirmed',
    method,
    cardId,
    essential: t.type === 'spend' ? !!t.essential : undefined,
  };
}

/**
 * 카드 대금 출금: 쌓여 있던 청구 예정(같은 카드, 결제일이 출금일과 가장 가까운 묶음)과 맞춰 한 건으로 처리.
 * 청구 예정은 지우고(id 앞에 표시) 실제 출금만 남긴다. 금액이 다르면 차액만 조정하고 확인 요청.
 */
function settleCardBills(postings: Posting[]): BillReconciliation[] {
  const out: BillReconciliation[] = [];
  const bills = postings.filter((x) => x.role === 'card_bill');
  for (const bill of bills) {
    const billDate = kstDate(bill.debitAt);
    const groups = new Map<ISODate, Posting[]>();
    for (const x of postings) {
      if (x.cardId !== bill.cardId || !x.payDate || x.id.startsWith('~cleared~')) continue;
      if (x.role !== 'card_charge' && x.role !== 'refund') continue;
      if (Math.abs(diffDays(x.payDate, billDate)) > BILL_MATCH_DAYS) continue;
      const g = groups.get(x.payDate) ?? [];
      g.push(x);
      groups.set(x.payDate, g);
    }
    let best: ISODate | null = null;
    for (const d of groups.keys()) if (!best || Math.abs(diffDays(d, billDate)) < Math.abs(diffDays(best, billDate))) best = d;
    const expected = best ? -(groups.get(best)!.reduce((s, x) => s + x.amount, 0)) : 0;
    if (best) for (const x of groups.get(best)!) x.id = `~cleared~${x.id}`;
    const actual = -bill.amount;
    bill.payDate = best ?? billDate;
    out.push({
      billTxnId: bill.sourceId,
      cardId: bill.cardId!,
      payDate: best ?? billDate,
      expected,
      actual,
      diff: actual - expected,
      needsConfirm: actual !== expected,
    });
  }
  return out;
}

/** 결제 수단 그룹 (예측한 변동 지출을 나눌 때 쓰는 단위) */
export type MethodGroup = 'account' | 'credit' | 'cash' | 'other';

/** 거래가 어떤 결제 수단 그룹인지: 결제계좌에서 바로 빠지는 체크·이체 / 신용카드 / 현금 / 다른 계좌 */
export function methodGroup(t: Extract<Txn, { type: 'spend' }>, cards: Card[], paymentAccountId: AccountRef): MethodGroup {
  if (t.method === 'cash') return 'cash';
  if (t.method === 'credit') return 'credit';
  if (t.method === 'transfer') return t.accountId === paymentAccountId ? 'account' : 'other';
  const card = cards.find((c) => c.id === t.cardId);
  return card && card.kind === 'debit' && card.accountId === paymentAccountId ? 'account' : 'other';
}

/**
 * 소비 집계: 날짜별 변동 지출 합계 (구매일 기준, 필수 지출 제외).
 * - 신용카드 할부는 구매일에 총액
 * - 원거래와 연결된 취소·환불은 원거래 날짜에서 빼되 0원 아래로 내려가지 않음
 * - 연결되지 않은 환불, 카드 대금, 이체, 적금, ATM 인출은 집계하지 않음
 */
export function dailyVariableSpend(txns: Txn[]): Map<ISODate, number> {
  const perTxn = new Map<string, { date: ISODate; amount: number }>();
  for (const t of txns) if (t.type === 'spend' && !t.essential && !t.planned) perTxn.set(t.id, { date: kstDate(t.occurredAt), amount: t.amount });
  for (const t of txns) {
    if (t.type !== 'refund' || !t.linkedTxnId) continue;
    const o = perTxn.get(t.linkedTxnId);
    if (o) o.amount = Math.max(0, o.amount - t.amount);
  }
  const out = new Map<ISODate, number>();
  for (const { date, amount } of perTxn.values()) out.set(date, (out.get(date) ?? 0) + amount);
  return out;
}

/** 같은 날짜 범위의 결제계좌 기준 이동 (테스트·대조용) */
export function sumPostings(postings: Posting[], accountId: AccountRef, afterExclusive: Ms, untilInclusive: Ms): number {
  return postings.filter((x) => x.accountId === accountId && x.debitAt > afterExclusive && x.debitAt <= untilInclusive).reduce((s, x) => s + x.amount, 0);
}

