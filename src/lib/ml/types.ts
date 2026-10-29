import type { ISODate } from '../../../shared/dates';

/**
 * ML 레이어 공통 타입.
 * 화면 코드는 이 타입만 알고, 실제 계산이 규칙 기반인지 모델(LightGBM 등)인지는 provider가 정한다.
 * 팀원 모델 API도 이 모양으로 응답하면 화면을 고치지 않고 바꿔 끼울 수 있다. (docs/ML_INTERFACE.md)
 */

/** 생활비(변동지출) 한 건. 고정지출(월세·통신비 등)은 일정에 있으므로 넣지 않는다. */
export interface SpendEntry {
  date: ISODate;
  amount: number;
  category: string;
  name?: string;
  /** 어디서 온 기록인지 */
  from: 'record' | 'csv' | 'demo';
}

/** 하루 생활비의 분위수 예측 (원) */
export interface DailyQuantile {
  date: ISODate;
  p10: number;
  p50: number;
  p90: number;
}

export type ForecastBasis =
  /** 기록도, 입력한 하루 평균도 없음 → 생활비를 0으로 봄 */
  | 'none'
  /** 온보딩에서 입력한 하루 평균만 사용 (콜드스타트) */
  | 'profile'
  /** 입력값 + 내 기록을 섞음 (기록이 쌓일수록 기록 비중↑) */
  | 'blend'
  /** 내 기록만으로 충분 */
  | 'history';

export interface SpendingForecast {
  engine: 'rule' | 'model' | 'local';
  /** 모델 이름/버전 (모델일 때) */
  modelName?: string;
  basis: ForecastBasis;
  /** 예측에 쓴 내 기록 일수 */
  historyDays: number;
  /** 기록 건수 */
  historyCount: number;
  /** 내 기록 비중 0~1 (개인화 정도) */
  personalWeight: number;
  days: DailyQuantile[];
  /** 데모/더미 데이터 기준인지 */
  dummy: boolean;
}

export interface Classification {
  category: string;
  /** 0~1 */
  confidence: number;
  engine: 'memory' | 'rule' | 'model';
  /** 후보 상위 3개 */
  candidates: { category: string; score: number }[];
}

/** 확신이 이 값보다 낮으면 사용자가 직접 고르게 한다 */
export const CONFIDENCE_ASK = 0.6;
/** 부족 확률이 이 값 이하인 가장 이른 날을 '사기 좋은 날'로 추천 */
export const SAFE_SHORTFALL_PROB = 0.2;
/** 기록이 이보다 적으면 개인화하지 않고 공통(입력값) 예측만 씀 */
export const MIN_PERSONAL_RECORDS = 3;
