/**
 * 변동 지출 예측 (기획서 'ML 모델 설계', '실제 기록과 예측의 경계', '데이터 양에 따른 예측 방식').
 *
 * - 예측 목표는 '하루 전체 변동 지출 합계' 하나. 결제 수단별 금액은 최근 4주 결제 수단 비중으로 나눈다.
 * - 기준선 두 개: 최근 7일 평균, 요일별 평균. ML은 채택 조건을 넘을 때만 같은 인터페이스로 끼운다.
 * - 정답(라벨)으로 쓰는 날은 대조 완료일·자기보고 완료일뿐이다. 나머지 날은 결측.
 * - 예측 시각 r까지 기록된 지출은 확정값, r 이후만 예측값. 오늘 남은 예측 = max(0, 오늘 예측 − 오늘 기록).
 */
import { addDays, diffDays, type ISODate } from '../../shared/dates';
import { creditPayDate, dailyVariableSpend, methodGroup, type MethodGroup, type Posting } from './ledger';
import { kstDate, kstStart, weekday } from './time';
import type { Card, CreditCard, DayStatus, Method, Ms, Txn } from './types';

export interface LabeledDay {
  date: ISODate;
  amount: number;
  status: Extract<DayStatus, 'reconciled' | 'self_reported'>;
}

export const USABLE: DayStatus[] = ['reconciled', 'self_reported'];

/** 학습·예측에 쓸 수 있는 날만 골라 정답 값을 붙인다. 정답은 0원 이상. */
export function labeledDays(txns: Txn[], statuses: Map<ISODate, DayStatus>): LabeledDay[] {
  const spend = dailyVariableSpend(txns);
  const out: LabeledDay[] = [];
  for (const [date, st] of [...statuses.entries()].sort(([a], [b]) => (a < b ? -1 : 1))) {
    if (st !== 'reconciled' && st !== 'self_reported') continue;
    out.push({ date, amount: Math.max(0, spend.get(date) ?? 0), status: st });
  }
  return out;
}

/**
 * 하루 변동 지출 예측기. origin 날짜까지의 라벨만 보고 targets 날짜를 예측한다.
 * 누수 방지: 구현은 history에서 origin 이후 날짜를 쓰면 안 되며, 호출부(predictFrom)가 미리 잘라서 넘긴다.
 */
export interface DailyPredictor {
  name: string;
  predict(history: LabeledDay[], origin: ISODate, targets: ISODate[]): number[];
}

/** 누수 차단: origin 이후 라벨은 예측기에 절대 넘기지 않는다 */
export function predictFrom(model: DailyPredictor, history: LabeledDay[], origin: ISODate, targets: ISODate[]): number[] {
  const safe = history.filter((d) => d.date <= origin);
  return model.predict(safe, origin, targets).map((v) => Math.max(0, Number.isFinite(v) ? v : 0));
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : NaN);

/** 기준선 1: 최근 7일(origin 포함) 라벨 평균을 그대로 미래에 적용 */
export const last7Mean: DailyPredictor = {
  name: 'last7',
  predict(history, origin, targets) {
    const since = addDays(origin, -6);
    const v = mean(history.filter((d) => d.date >= since && d.date <= origin).map((d) => d.amount));
    return targets.map(() => v);
  },
};

/** 기준선 2: 요일별 평균 (그 요일 라벨이 없으면 전체 평균) */
export const weekdayMean: DailyPredictor = {
  name: 'weekday',
  predict(history, _origin, targets) {
    const all = mean(history.map((d) => d.amount));
    const byW = new Map<number, number[]>();
    for (const d of history) {
      const w = weekday(d.date);
      byW.set(w, [...(byW.get(w) ?? []), d.amount]);
    }
    return targets.map((t) => {
      const xs = byW.get(weekday(t));
      return xs && xs.length ? mean(xs) : all;
    });
  },
};

export const BASELINES = [last7Mean, weekdayMean] as const;

/** 2주 미만이면 지출 예측 없이 등록 일정 기준 부족만 */
export const MIN_FORECAST_DAYS = 14;

export type ForecastStage = 'none' | 'baseline' | 'ml';

/** 첫 기록일부터 오늘까지의 기록 기간(일) */
export function recordPeriodDays(txns: Txn[], statuses: Map<ISODate, DayStatus>, today: ISODate): number {
  let first: ISODate | null = null;
  for (const t of txns) {
    const d = kstDate(t.occurredAt);
    if (!first || d < first) first = d;
  }
  for (const [d, st] of statuses) if (st !== 'missing' && (!first || d < first)) first = d;
  return first ? diffDays(first, today) + 1 : 0;
}

export function chooseStage(periodDays: number, labeledCount: number, mlAdopted: boolean): ForecastStage {
  if (periodDays < MIN_FORECAST_DAYS || labeledCount === 0) return 'none';
  return mlAdopted ? 'ml' : 'baseline';
}

// ─── 결제 수단 비중 ───

export type Shares = Record<MethodGroup, number>;
export const SHARE_LOOKBACK_DAYS = 28;
/** 최근 4주 변동 지출 기록이 이보다 적으면 주 결제 수단을 한 번 묻는다 */
export const MIN_SHARE_TXNS = 5;

export interface ShareResult {
  shares: Shares;
  basis: 'history' | 'asked' | 'default';
  /** 신용카드 예측분을 배치할 카드 */
  creditCard: CreditCard | null;
}

export function methodShares(txns: Txn[], cards: Card[], paymentAccountId: string, today: ISODate, mainMethod?: Method): ShareResult {
  const since = addDays(today, -(SHARE_LOOKBACK_DAYS - 1));
  const recent = txns.filter((t): t is Extract<Txn, { type: 'spend' }> => t.type === 'spend' && !t.essential && !t.planned && kstDate(t.occurredAt) >= since && kstDate(t.occurredAt) <= today);
  const credits = cards.filter((c): c is CreditCard => c.kind === 'credit');
  const usage = new Map<string, number>();
  for (const t of recent) if (t.method === 'credit' && t.cardId) usage.set(t.cardId, (usage.get(t.cardId) ?? 0) + t.amount);
  const creditCard = credits.slice().sort((a, b) => (usage.get(b.id) ?? 0) - (usage.get(a.id) ?? 0))[0] ?? null;

  const zero: Shares = { account: 0, credit: 0, cash: 0, other: 0 };
  let result: ShareResult;
  if (recent.length >= MIN_SHARE_TXNS) {
    const sums = { ...zero };
    for (const t of recent) sums[methodGroup(t, cards, paymentAccountId)] += t.amount;
    const total = Object.values(sums).reduce((s, v) => s + v, 0);
    result = total > 0 ? { shares: mapValues(sums, (v) => v / total), basis: 'history', creditCard } : { shares: { ...zero, account: 1 }, basis: 'default', creditCard };
  } else if (mainMethod) {
    const g: MethodGroup = mainMethod === 'credit' ? 'credit' : mainMethod === 'cash' ? 'cash' : 'account';
    result = { shares: { ...zero, [g]: 1 }, basis: 'asked', creditCard };
  } else {
    // 모르면 결제계좌에서 바로 빠진다고 본다 (보수적)
    result = { shares: { ...zero, account: 1 }, basis: 'default', creditCard };
  }
  // 신용 비중이 있는데 등록된 신용카드가 없으면 결제계좌로 옮긴다 (보수적)
  if (!result.creditCard && result.shares.credit > 0) {
    result.shares = { ...result.shares, account: result.shares.account + result.shares.credit, credit: 0 };
  }
  return result;
}

function mapValues<T extends Record<string, number>>(o: T, f: (v: number) => number): T {
  return Object.fromEntries(Object.entries(o).map(([k, v]) => [k, f(v)])) as T;
}

// ─── 예측값을 결제계좌 Posting으로 배치 ───

export interface ForecastPlacement {
  postings: Posting[];
  /** 날짜별 예측 총액 (오늘은 남은 몫) — 상단 폭의 결제계좌 영향 비율 계산용 */
  totals: { date: ISODate; total: number; byGroup: Shares }[];
}

/**
 * 예측 실행 시각 r 기준으로 [오늘, until] 변동 지출 예측을 결제 수단별로 나눠 실제 출금 시점에 배치.
 * - 체크·이체(결제계좌): 그날 출금 (D̂ 예측분)
 * - 신용카드: 그 날짜가 속한 청구 주기의 결제일에 출금. 결제일이 until 뒤면 이번 계산에 영향 없음 (Ĉ 예측분)
 * - 현금·다른 계좌: 결제계좌 잔고에 반영하지 않음
 */
export function placeForecast(opts: {
  runId: string;
  r: Ms;
  until: ISODate;
  /** 날짜별 하루 전체 예측 (원). 오늘 포함 */
  daily: { date: ISODate; amount: number }[];
  shares: ShareResult;
  /** 오늘 r까지 이미 기록된 결제 수단 그룹별 변동 지출 */
  todayRecorded: Shares;
  paymentAccountId: string;
}): ForecastPlacement {
  const today = kstDate(opts.r);
  const postings: Posting[] = [];
  const totals: ForecastPlacement['totals'] = [];
  for (const { date, amount } of opts.daily) {
    if (date < today || date > opts.until) continue;
    const by: Shares = { account: 0, credit: 0, cash: 0, other: 0 };
    for (const g of Object.keys(by) as MethodGroup[]) {
      let v = amount * opts.shares.shares[g];
      if (date === today) v = Math.max(0, v - opts.todayRecorded[g]);
      by[g] = Math.round(v);
    }
    totals.push({ date, total: by.account + by.credit + by.cash + by.other, byGroup: by });
    const at = date === today ? opts.r + 1 : kstStart(date) + 12 * 3600_000;
    if (by.account > 0) {
      postings.push({ id: `fc:${opts.runId}:${date}:account`, sourceId: 'forecast', role: 'variable', occurredAt: at, debitAt: at, accountId: opts.paymentAccountId, amount: -by.account, status: 'forecast', forecastRunId: opts.runId });
    }
    const card = opts.shares.creditCard;
    if (by.credit > 0 && card) {
      const payDate = creditPayDate(card, date);
      if (payDate <= opts.until) {
        postings.push({ id: `fc:${opts.runId}:${date}:credit`, sourceId: 'forecast', role: 'card_charge', occurredAt: at, debitAt: kstStart(payDate), accountId: card.accountId, amount: -by.credit, status: 'forecast', forecastRunId: opts.runId, cardId: card.id, payDate, method: 'credit' });
      }
    }
  }
  return { postings, totals };
}

/** 오늘 r까지 기록된 결제 수단 그룹별 변동 지출 */
export function recordedToday(txns: Txn[], cards: Card[], paymentAccountId: string, r: Ms): Shares {
  const today = kstDate(r);
  const out: Shares = { account: 0, credit: 0, cash: 0, other: 0 };
  for (const t of txns) {
    if (t.type !== 'spend' || t.essential || t.planned || t.occurredAt > r || kstDate(t.occurredAt) !== today) continue;
    out[methodGroup(t, cards, paymentAccountId)] += t.amount;
  }
  return out;
}

