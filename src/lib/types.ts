import type { ISODate } from '../../shared/dates';

export type Recurrence = 'monthly' | 'once';

export interface ScheduleItem {
  id: string;
  kind: 'income' | 'expense';
  name: string;
  amount: number;
  recurrence: Recurrence;
  /** 매월 반복일 (1~31). 31은 '말일'로 표시하며 그 달의 마지막 날로 처리 */
  day?: number;
  /** 한 번만 있는 일정의 날짜 */
  date?: ISODate;
}

export interface Goal {
  name: string;
  target: number;
  saved: number;
  targetDate?: ISODate;
  /** 매달 목표에 넣을 수 있다고 가정한 금액 */
  monthlySaving?: number;
  /** 연 이자율(%) 가정. 기본 0 */
  annualRate?: number;
}

export interface Profile {
  baseBalance: number;
  baseDate: ISODate;
  /** 기준 잔고를 입력한 시각(ms) */
  baseSetAt: number;
  minBalance: number;
  /** 하루 평균 생활비(밥·카페·교통 등 변동지출). 생활비 예측의 콜드스타트 값 */
  dailySpend?: number;
  items: ScheduleItem[];
  /** 기준일 당일 일정 중 이미 잔고에 반영된 항목 id */
  reflectedOnBaseDate: string[];
  goal?: Goal;
}

export type Choice = 'buy' | 'skip' | 'delay' | 'alt';

export interface ChoiceParams {
  amount: number;
  date: ISODate;
  delayDate?: ISODate;
  altAmount?: number;
  altName?: string;
  /** 할부 개월 수(2 이상일 때만) */
  installments?: number;
}

export interface ScenarioSnapshot {
  computedAt: number;
  byChoice: Partial<Record<Choice, { monthEnd: number; low: number; lowDate: ISODate; afterChoice: number; shortfall: boolean; belowMin: boolean }>>;
}

export interface DecisionRecord {
  id: string;
  createdAt: number;
  /** decide: 사기 전 확인에서 온 기록, spent: 이미 쓴 돈 기록 */
  source: 'decide' | 'spent';
  category: string;
  name?: string;
  memo?: string;
  params: ChoiceParams;
  /** 실제로 한 선택. null이면 아직 정하지 않음(현실에 반영 안 됨) */
  choice: Choice | null;
  choiceAt?: number;
  /** 기준일 이전·당일 거래의 잔고 반영 여부. null이면 자동 판단 */
  reflectedOverride: boolean | null;
  /** 평행세계에 이 기록의 '다른 선택'을 넣을지 */
  inParallel: boolean;
  /** 평행세계에서 가정할 다른 선택 */
  parallelAs: Choice;
  satisfaction?: number;
  reason?: string;
  snapshot?: ScenarioSnapshot;
}
