/**
 * 모아 계산 엔진 공통 타입 (기획서 2026-10-29 기준).
 *
 * 원칙
 * - 금액은 원 단위 정수. 지출도 양수로 받고, 잔고 계산에서만 부호를 붙인다.
 * - 시각은 epoch ms(Ms). 날짜는 한국 시간 기준 'YYYY-MM-DD'.
 * - 숫자(잔고·날짜·부족 금액)는 모두 이 엔진이 계산한다. LLM은 문장만 만든다.
 */
import type { ISODate } from '../../shared/dates';

export type Ms = number;

/** 잔고 계산 대상 계좌 구분 */
export type AccountRef = string;
/** 지갑 현금. 결제계좌가 아니다. */
export const CASH: AccountRef = 'cash';

export interface Account {
  id: AccountRef;
  name: string;
  /** 필수결제가 빠져나가는 결제계좌. MVP는 정확히 1개만 true */
  isPayment: boolean;
}

/** 체크카드 — 연결 계좌에서 결제 즉시 출금 */
export interface DebitCard {
  id: string;
  kind: 'debit';
  name: string;
  /** 온보딩에서 등록한 출금 계좌. 등록 전이면 null (처음 보는 카드 → 한 번 묻는다) */
  accountId: AccountRef | null;
}

/** 신용카드 — 이용 기간이 끝난 뒤 결제일에 결제계좌에서 출금 */
export interface CreditCard {
  id: string;
  kind: 'credit';
  name: string;
  /** 카드 대금이 빠지는 계좌 */
  accountId: AccountRef;
  /** 이용 기간 기준일: 매달 이 날까지 쓴 금액이 한 청구 주기로 묶인다 (31 = 말일) */
  cycleEndDay: number;
  /** 결제일: 청구 주기가 끝난 뒤 처음 오는 이 날에 출금 (31 = 말일) */
  payDay: number;
}

export type Card = DebitCard | CreditCard;

/** 결제 수단 */
export type Method = 'debit' | 'transfer' | 'credit' | 'cash';

/**
 * 사용자 기록(결제 문자·메모·입력)을 구조화한 확정 거래.
 * LLM 추출 → 사용자 확인 뒤 저장되는 모양.
 */
export type Txn =
  | {
      id: string;
      type: 'spend';
      occurredAt: Ms;
      amount: number;
      method: Method;
      /** debit/credit일 때 카드 id */
      cardId?: string;
      /** transfer일 때 출금 계좌 */
      accountId?: AccountRef;
      /** 신용카드 할부 개월 수 (2 이상) */
      installments?: number;
      category?: string;
      /** 필수(월세 등) / 선택 소비 */
      essential?: boolean;
      /** 이 거래가 실현한 고정 출금 일정 id (자동 대조로도 채워짐) */
      scheduleRef?: string;
      /** '살까 말까' 비교용 가정 거래. 잔고에는 넣고, 지출 예측·비중·오늘 기록에는 넣지 않는다 */
      planned?: boolean;
    }
  | { id: string; type: 'atm'; occurredAt: Ms; amount: number; accountId: AccountRef }
  | {
      id: string;
      type: 'card_bill';
      occurredAt: Ms;
      amount: number;
      cardId: string;
      accountId: AccountRef;
    }
  | { id: string; type: 'own_transfer'; occurredAt: Ms; amount: number; from: AccountRef; to: AccountRef }
  | { id: string; type: 'saving'; occurredAt: Ms; amount: number; accountId: AccountRef; name?: string; scheduleRef?: string }
  | { id: string; type: 'income'; occurredAt: Ms; amount: number; accountId: AccountRef; name?: string; scheduleRef?: string }
  | {
      id: string;
      type: 'refund';
      occurredAt: Ms;
      amount: number;
      /** 원거래와 연결되면 원거래 금액에서 빼고(0원 아래로 안 내려감), 아니면 입금으로만 */
      linkedTxnId?: string;
      accountId?: AccountRef;
    };

/** 결제계좌 잔액 관측 (거래 후 잔액이 찍힌 문자 또는 사용자 입력) */
export interface BalanceObservation {
  at: Ms;
  balance: number;
  source: 'sms' | 'user';
  accountId: AccountRef;
}

/** 날짜가 정해진 고정 출금 (월세·통신비·할부·적금·등록된 계좌 간 이체 출금) */
export interface FixedItem {
  id: string;
  name: string;
  amount: number;
  /** 이 항목이 빠지는 계좌. 결제계좌가 아니면 잔고 계산에서 제외 */
  accountId: AccountRef;
  recurrence: 'monthly' | 'once';
  /** monthly: 1~31 (31=말일) */
  day?: number;
  /** once: 날짜 */
  date?: ISODate;
  /** 필수결제 여부 (월세·통신비·할부 = true, 적금 = false) */
  essential: boolean;
  kind?: 'rent' | 'utility' | 'installment' | 'saving' | 'transfer' | 'other';
}

/** 미래 입금의 확실성 */
export type IncomeCertainty = 'scheduled' | 'uncertain';

/**
 * 입금 일정 (급여·용돈·알바비·가족 지원·등록된 계좌 간 이체 입금).
 * 이미 들어온 입금은 여기서 계산하지 않는다 — 잔액 관측(B₀)을 갱신하는 데만 쓴다.
 */
export interface IncomeSchedule {
  id: string;
  name: string;
  amount: number;
  accountId: AccountRef;
  recurrence: 'monthly' | 'once';
  day?: number;
  date?: ISODate;
  /** 예정: 기본 계산에 넣고 지연 시나리오로 따로 확인 / 불확실: 기본 계산에서 뺌 */
  certainty: IncomeCertainty;
  kind?: 'salary' | 'allowance' | 'parttime' | 'family' | 'freelance' | 'transfer' | 'other';
}

/** 그날 기록 상태 (학습·평가 정답에 쓸 수 있는지) */
export type DayStatus =
  /** 은행·카드사 내역과 대조해 다 기록됨 확인 (현금은 자기보고) */
  | 'reconciled'
  /** "오늘 기록 완료"를 누름 (지출 없으면 0원) */
  | 'self_reported'
  /** 기록은 있지만 완료 확인 없음 */
  | 'partial'
  /** 결제계좌 잔액만 그대로 — 신용·현금은 알 수 없음 */
  | 'balance_only'
  /** 기록 없음 또는 대조에서 누락 확인 */
  | 'missing';

export interface UserSetup {
  accounts: Account[];
  cards: Card[];
  fixed: FixedItem[];
  incomes: IncomeSchedule[];
  /** 기록이 부족할 때 한 번 물어본 주 결제 수단 */
  mainMethod?: Method;
  /** 입금 지연 시나리오 일수 (기본 3) */
  incomeDelayDays?: number;
}

export function paymentAccount(setup: Pick<UserSetup, 'accounts'>): Account {
  const list = setup.accounts.filter((a) => a.isPayment);
  if (list.length !== 1) throw new Error(`결제계좌는 정확히 1개여야 합니다 (현재 ${list.length}개)`);
  return list[0];
}
