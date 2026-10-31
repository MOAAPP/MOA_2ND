import type { ISODate } from '../../../shared/dates';

/**
 * 모아 현금흐름 엔진 타입 (기획서 「예측 설계」).
 * 예측 대상은 '결제계좌 하나의 잔액'이다. 전체 자산이 아니라 필수결제가 실제로 빠져나가는 계좌만 본다.
 */

/** 결제 수단. 결제계좌 잔고에 반영되는 시점이 다르다. */
export type PayMethod =
  /** 체크카드: 결제 즉시 연결 계좌에서 출금 */
  | 'debit'
  /** 계좌이체·자동이체: 즉시 출금 */
  | 'transfer'
  /** 신용카드(일시불·할부): 카드 대금 출금일에 출금 */
  | 'credit'
  /** 지갑 현금: 결제계좌와 무관 (소비 집계만) */
  | 'cash'
  /** ATM 인출: 인출 순간 출금 */
  | 'atm';

export const METHOD_LABEL: Record<PayMethod, string> = {
  debit: '체크카드',
  transfer: '계좌이체',
  credit: '신용카드',
  cash: '현금',
  atm: 'ATM 인출',
};

/** 거래가 어느 계좌에서 일어났는지 */
export type AccountRef = 'pay' | 'other' | 'cash';

export type TxnKind =
  /** 소비 */
  | 'spend'
  /** 급여·용돈·알바비 등 입금 */
  | 'income'
  /** 카드 대금 출금 (쌓인 청구 예정과 맞춘다) */
  | 'card_payment'
  /** 본인 계좌 간 이체 */
  | 'transfer_self'
  /** 적금·청년미래적금 납입 (저축으로 따로 집계) */
  | 'saving'
  /** 취소·환불 */
  | 'refund';

export interface MoaCard {
  id: string;
  name: string;
  kind: 'credit' | 'debit';
  /** 체크카드가 결제계좌에 연결돼 있는지. 연결 안 된 체크카드 결제는 소비 집계에만 들어간다. */
  linked: boolean;
  /** 신용카드 이용기간 마감일(1~31, 31=말일). 이 날까지 쓴 금액이 다음 결제일에 청구된다. */
  cutoffDay?: number;
  /** 신용카드 결제일(1~31) */
  payDay?: number;
}

export interface Txn {
  id: string;
  /** 소비·입금이 일어난 시각 (epoch ms) */
  occurredAt: number;
  /** occurredAt의 한국 날짜 */
  date: ISODate;
  /** 항상 양수 */
  amount: number;
  kind: TxnKind;
  method: PayMethod;
  account: AccountRef;
  cardId?: string;
  name: string;
  category: string;
  /** 필수 소비(월세·통신비 등) — 변동 지출 예측 학습에서 뺀다 */
  essential: boolean;
  /** 신용카드 할부 개월 수(2 이상) */
  installments?: number;
  /** transfer_self 방향 */
  direction?: 'in' | 'out';
  /** 환불이 연결된 원거래 */
  refundOf?: string;
  /** 문자에 찍힌 거래 후 잔액 */
  balanceAfter?: number;
  /** 등록 일정 한 회차와 같은 거래면 그 회차 키(`일정id:날짜`) — 중복 차감 방지 */
  scheduleRef?: string;
  source: 'sms' | 'memo' | 'manual' | 'photo' | 'demo' | 'import';
  createdAt: number;
}

export type IncomeStatus = 'scheduled' | 'uncertain';

export interface MoaSchedule {
  id: string;
  name: string;
  direction: 'in' | 'out';
  amount: number;
  recurrence: 'monthly' | 'once';
  /** 매월 반복일(1~31, 31=말일) */
  day?: number;
  date?: ISODate;
  /** out: 필수결제 여부. 등급 판단은 필수결제일 기준 */
  essential: boolean;
  /** in: 예정(기본 계산에 반영) / 불확실(참고로만) */
  status?: IncomeStatus;
  /** 다른 계좌에서 결제계좌로 옮기는 이체 일정 */
  fromOtherAccount?: boolean;
  /** 적금 납입 */
  saving?: boolean;
}

export interface Anchor {
  /** 결제계좌 잔액 B₀ */
  balance: number;
  /** 확인 시각 t₀ (epoch ms) */
  at: number;
  source: 'manual' | 'sms';
  /** t₀ 날짜에 있는 일정·청구 중 이미 잔액에 들어간 것의 키 */
  reflected: string[];
}

/** 하루 기록 상태. 정답으로 쓸 수 있는 날은 self/reconciled 뿐이다. */
export type DayStatus = 'self' | 'reconciled';

export interface Mismatch {
  at: number;
  expected: number;
  actual: number;
}

export interface AlertLog {
  /** `${refId}:${date}` */
  key: string;
  grade: Grade;
  trigger: 'registered' | 'D7' | 'D3' | 'upgrade';
  at: number;
  text: string;
  read?: boolean;
}

export interface MoaState {
  version: 1;
  payAccountName: string;
  anchor: Anchor | null;
  cards: MoaCard[];
  schedule: MoaSchedule[];
  txns: Txn[];
  dayStatus: Record<ISODate, DayStatus>;
  /** 지연 시나리오 일수 (기본 3) */
  delayDays: number;
  /** 기록이 적을 때 쓸 주 결제 수단 */
  mainMethod: PayMethod | null;
  mismatches: Mismatch[];
  alerts: AlertLog[];
  /** 사용자가 한 번 승인한 문자 형식(자동 마스킹 후 바로 보냄) */
  trustedFormats: string[];
  /** 매번 전송 전 확인 */
  confirmEveryTime: boolean;
  /** 외부 AI 전송 안내를 봤는지 */
  aiNoticeSeen: boolean;
}

export function emptyMoa(): MoaState {
  return {
    version: 1,
    payAccountName: '결제계좌',
    anchor: null,
    cards: [],
    schedule: [],
    txns: [],
    dayStatus: {},
    delayDays: 3,
    mainMethod: null,
    mismatches: [],
    alerts: [],
    trustedFormats: [],
    confirmEveryTime: false,
    aiNoticeSeen: false,
  };
}

/* ───────── 계산 결과 ───────── */

export type Certainty = 'confirmed' | 'scheduled' | 'uncertain' | 'forecast';

/** 결제계좌에 들어오거나 나가는 한 줄 (signed: 입금 +, 출금 −) */
export interface Line {
  date: ISODate;
  amount: number;
  label: string;
  source: 'txn' | 'fixed' | 'income' | 'card_bill' | 'forecast' | 'forecast_card';
  certainty: Certainty;
  /** 필수결제 (등급 판단 대상) */
  essential: boolean;
  refId?: string;
  cardId?: string;
}

export type Grade = 'registered' | 'high' | 'caution' | 'combo' | 'ok';

export const GRADE_RANK: Record<Grade, number> = { ok: 0, combo: 1, caution: 2, high: 3, registered: 4 };

export const GRADE_LABEL: Record<Grade, string> = {
  registered: '등록 일정 기준 부족',
  high: '부족 가능성 높음',
  caution: '주의',
  combo: '복합 상황 주의',
  ok: '여유',
};

export type ScenarioKey = 'registered' | 'base' | 'high' | 'delay' | 'combo';

export const SCENARIO_LABEL: Record<ScenarioKey, string> = {
  registered: '등록 일정만',
  base: '기본',
  high: '평소보다 많이 쓰는 경우',
  delay: '입금이 늦어지는 경우',
  combo: '많이 쓰고 입금도 늦는 경우',
};
