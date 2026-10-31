/**
 * 결제 전 선택 비교 (기획서 '살까 말까', 시연 4·5단계).
 *
 * 같은 계산 엔진에 '산다'를 가정한 거래 하나만 더 넣어 두 갈래 잔고를 비교한다.
 * 결제 수단에 따라 실제 출금일이 달라진다: 체크카드는 바로, 신용카드는 청구 결제일에.
 * 신용카드이고 결제일이 계산 범위 밖이면 '이번 결제일에는 영향 없음, 다음 카드값에 더해짐'.
 * 안 쓴 금액은 가상 절약액으로 기록한다 (실제 이체 아님).
 */
import { addDays, type ISODate } from '../../shared/dates';
import { creditPayDate } from './ledger';
import { assessRisk, HORIZON_DAYS, type Grade, type RiskInput, type RiskReport } from './risk';
import type { Method, Txn } from './types';

export interface ChoiceInput {
  amount: number;
  method: Extract<Method, 'debit' | 'credit' | 'transfer' | 'cash'>;
  cardId?: string;
  accountId?: string;
  installments?: number;
  category?: string;
}

export interface ChoiceCompare {
  skip: RiskReport;
  buy: RiskReport;
  gradeIfSkip: Grade;
  gradeIfBuy: Grade;
  /** 신용카드일 때 이 결제가 청구되는 결제일 */
  creditPayDate: ISODate | null;
  /** 결제일이 14일 계산 범위 밖이라 이번 판단에 영향 없음 */
  outsideHorizon: boolean;
  /** 참으면 기록되는 가상 절약액 */
  virtualSaving: number;
}

export const DECIDE_PROMPT_MIN = 30_000;

export function compareChoice(base: RiskInput, c: ChoiceInput): ChoiceCompare {
  const hypothetical: Txn = {
    id: `choice:${base.now}`,
    type: 'spend',
    occurredAt: base.now,
    amount: c.amount,
    method: c.method,
    cardId: c.cardId,
    accountId: c.accountId,
    installments: c.installments,
    category: c.category,
    planned: true,
  };
  const skip = assessRisk(base);
  const buy = assessRisk({ ...base, txns: [...base.txns, hypothetical] });
  let payDate: ISODate | null = null;
  if (c.method === 'credit' && c.cardId) {
    const card = base.setup.cards.find((x) => x.id === c.cardId);
    if (card && card.kind === 'credit') payDate = creditPayDate(card, base.now);
  }
  const horizonEnd = addDays(skip.today, base.horizonDays ?? HORIZON_DAYS);
  return {
    skip,
    buy,
    gradeIfSkip: skip.grade,
    gradeIfBuy: buy.grade,
    creditPayDate: payDate,
    outsideHorizon: !!payDate && payDate > horizonEnd,
    virtualSaving: c.amount,
  };
}
