/**
 * 가상 금융상품 카탈로그. 실제 금융사·상품과 무관한 학습용 데이터.
 * 우대금리 조건은 모두 '앱 안의 행동'으로 확인할 수 있게 정했다(연구용 개입 변수).
 */

export type ProductKind = 'deposit' | 'installment';

export interface Bank {
  id: string;
  name: string;
  short: string;
  color: string;
}

export const BANKS: Record<string, Bank> = {
  moa: { id: 'moa', name: '모아뱅크', short: '모아', color: '#3182F6' },
  haneul: { id: 'haneul', name: '하늘저축은행', short: '하늘', color: '#0EA5E9' },
  saessak: { id: 'saessak', name: '새싹은행', short: '새싹', color: '#16A34A' },
  byeol: { id: 'byeol', name: '별빛은행', short: '별빛', color: '#7C3AED' },
};

/** 우대조건 판정 규칙. BankContext로 판정한다(engine.ts). */
export type PrefRule =
  | { type: 'skipCount'; count: number; scope: 'beforeOpen30' | 'duringTerm' }
  | { type: 'ledgerDays'; days: number; scope: 'duringTerm' }
  | { type: 'lessons'; count: number }
  | { type: 'firstAtBank' }
  | { type: 'autoDebitNoMiss' };

export interface Preferential {
  id: string;
  label: string;
  /** 짧은 설명(조건 확인 방법) */
  how: string;
  bonus: number;
  rule: PrefRule;
}

export interface EarlyRate {
  /** 경과 개월이 이 값 미만이면 적용 */
  underMonths: number;
  /** 기본금리 대비 비율 (0.3 = 30%) */
  ratio?: number;
  /** 고정 금리(연 %) */
  fixed?: number;
}

export interface Product {
  id: string;
  bank: string;
  name: string;
  kind: ProductKind;
  installmentType?: 'fixed' | 'free';
  compounding: 'simple' | 'monthly';
  rates: { months: number; base: number }[];
  preferential: Preferential[];
  maxPreferential: number;
  /** 예금: 가입 금액 / 적금: 월 납입액(자유적립은 1회 최소) */
  minAmount: number;
  maxAmount: number;
  /** 자유적립식: 한 달 합계 한도 */
  monthlyLimit?: number;
  earlyRates: EarlyRate[];
  tags: string[];
  summary: string;
  terms: string[];
}

export const DEFAULT_EARLY: EarlyRate[] = [
  { underMonths: 1, fixed: 0.1 },
  { underMonths: 3, ratio: 0.1 },
  { underMonths: 6, ratio: 0.3 },
  { underMonths: 9, ratio: 0.5 },
  { underMonths: Infinity, ratio: 0.6 },
];

export const PRODUCTS: Product[] = [
  {
    id: 'moa-held-deposit',
    bank: 'moa',
    name: '참은 돈 정기예금',
    kind: 'deposit',
    compounding: 'simple',
    rates: [
      { months: 3, base: 2.8 },
      { months: 6, base: 3.0 },
      { months: 12, base: 3.2 },
    ],
    preferential: [
      { id: 'skip3', label: '가입 전 30일 동안 3번 참기', how: '사기 전 비교에서 "참기"나 "대안"을 고른 기록', bonus: 0.2, rule: { type: 'skipCount', count: 3, scope: 'beforeOpen30' } },
      { id: 'first', label: '모아뱅크 첫 가입', how: '모아뱅크 예금·적금을 처음 가입할 때', bonus: 0.1, rule: { type: 'firstAtBank' } },
    ],
    maxPreferential: 0.3,
    minAmount: 10_000,
    maxAmount: 10_000_000,
    earlyRates: DEFAULT_EARLY,
    tags: ['참기 연동', '1만 원부터'],
    summary: '참아서 아낀 돈을 묶어두는 기본 예금이에요.',
    terms: ['가입 기간 3·6·12개월, 만기일에 원금과 세후 이자를 한 번에 받아요.', '우대금리는 가입할 때 조건을 확인해서 확정돼요.', '중도해지하면 기본금리의 일부만 받아요(우대금리 없음).', '이자에는 15.4% 세금이 붙어요.'],
  },
  {
    id: 'haneul-compound',
    bank: 'haneul',
    name: '하늘 월복리 정기예금',
    kind: 'deposit',
    compounding: 'monthly',
    rates: [
      { months: 6, base: 3.3 },
      { months: 12, base: 3.55 },
      { months: 24, base: 3.4 },
    ],
    preferential: [],
    maxPreferential: 0,
    minAmount: 100_000,
    maxAmount: 30_000_000,
    earlyRates: DEFAULT_EARLY,
    tags: ['월복리', '조건 없음'],
    summary: '조건 없이 금리가 높은 대신 10만 원부터 가입할 수 있어요.',
    terms: ['이자가 매달 원금에 붙어서 다시 이자를 받아요(월복리).', '우대조건이 없어서 가입하는 순간 금리가 정해져요.', '중도해지하면 단리로 다시 계산하고 기본금리의 일부만 받아요.', '저축은행 상품이라는 설정이에요. 실제 예금자보호와는 관계없어요.'],
  },
  {
    id: 'saessak-short',
    bank: 'saessak',
    name: '새싹 짧은 예금',
    kind: 'deposit',
    compounding: 'simple',
    rates: [
      { months: 1, base: 2.2 },
      { months: 3, base: 2.6 },
    ],
    preferential: [{ id: 'lesson3', label: '금융 학습 레슨 3개 완료', how: '학습 탭에서 레슨을 끝까지 들은 횟수', bonus: 0.3, rule: { type: 'lessons', count: 3 } }],
    maxPreferential: 0.3,
    minAmount: 10_000,
    maxAmount: 3_000_000,
    earlyRates: [{ underMonths: Infinity, fixed: 0.1 }],
    tags: ['1개월부터', '학습 연동'],
    summary: '한 달만 묶어두고 싶을 때 쓰는 짧은 예금이에요.',
    terms: ['가입 기간 1·3개월.', '학습 레슨 3개를 끝냈으면 가입할 때 우대금리를 받아요.', '중도해지하면 연 0.1%만 받아요.'],
  },
  {
    id: 'moa-challenge',
    bank: 'moa',
    name: '참기 챌린지 적금',
    kind: 'installment',
    installmentType: 'free',
    compounding: 'simple',
    rates: [
      { months: 6, base: 3.0 },
      { months: 12, base: 3.3 },
    ],
    preferential: [
      { id: 'skip10', label: '기간 중 10번 참기', how: '가입일부터 만기일까지 참기·대안 선택 횟수', bonus: 1.5, rule: { type: 'skipCount', count: 10, scope: 'duringTerm' } },
      { id: 'ledger20', label: '가계부 20일 기록', how: '기간 중 지출을 기록한 날 수', bonus: 0.5, rule: { type: 'ledgerDays', days: 20, scope: 'duringTerm' } },
    ],
    maxPreferential: 2.0,
    minAmount: 1_000,
    maxAmount: 300_000,
    monthlyLimit: 300_000,
    earlyRates: DEFAULT_EARLY,
    tags: ['최고 연 5.3%', '자유적립', '참기 연동'],
    summary: '참을 때마다 아낀 돈을 넣는 적금이에요. 많이 참을수록 금리가 올라가요.',
    terms: ['1천 원부터 원할 때마다 넣을 수 있어요(한 달 30만 원까지).', '우대금리는 만기일에 기간 중 기록을 보고 정해요.', '넣은 날부터 만기일까지 일수만큼 이자가 붙어요.', '중도해지하면 기본금리의 일부만 받아요(우대금리 없음).'],
  },
  {
    id: 'byeol-fixed',
    bank: 'byeol',
    name: '별빛 정액 적금',
    kind: 'installment',
    installmentType: 'fixed',
    compounding: 'simple',
    rates: [
      { months: 6, base: 3.5 },
      { months: 12, base: 3.8 },
      { months: 24, base: 4.0 },
    ],
    preferential: [{ id: 'auto', label: '자동이체 · 미납 없이 만기', how: '매달 자동이체로 빠짐없이 납입', bonus: 0.4, rule: { type: 'autoDebitNoMiss' } }],
    maxPreferential: 0.4,
    minAmount: 10_000,
    maxAmount: 500_000,
    earlyRates: DEFAULT_EARLY,
    tags: ['매달 같은 금액', '자동이체'],
    summary: '매달 정해진 날 같은 금액을 모으는 정석 적금이에요.',
    terms: ['가입하는 날 1회차를 납입하고, 이후 매달 같은 날 자동이체돼요.', '자동이체일에 이번 달 쓸 수 있는 돈이 부족하면 그 회차는 미납이에요.', '미납·지연 회차는 그만큼 이자가 줄어요.', '중도해지하면 기본금리의 일부만 받아요.'],
  },
  {
    id: 'saessak-youth',
    bank: 'saessak',
    name: '새싹 청년 적금',
    kind: 'installment',
    installmentType: 'fixed',
    compounding: 'simple',
    rates: [{ months: 12, base: 4.2 }],
    preferential: [{ id: 'lesson5', label: '금융 학습 레슨 5개 완료', how: '만기일까지 학습 탭 레슨 완료 수', bonus: 0.3, rule: { type: 'lessons', count: 5 } }],
    maxPreferential: 0.3,
    minAmount: 10_000,
    maxAmount: 200_000,
    earlyRates: DEFAULT_EARLY,
    tags: ['기본금리 최고', '12개월'],
    summary: '기본금리가 가장 높은 대신 한 달 20만 원까지만 넣을 수 있어요.',
    terms: ['12개월 정액적립식이에요.', '가입하는 날 1회차를 납입하고 매달 같은 날 자동이체돼요.', '학습 레슨 5개를 끝내면 만기에 우대금리를 받아요.'],
  },
];

export const PRODUCT_BY_ID: Record<string, Product> = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));

/** 레거시(예전 버전) 예금·적금 잔액을 옮길 때 쓰는 상품 */
export const LEGACY_PRODUCTS: Record<'deposit' | 'installment', Product> = {
  deposit: { ...PRODUCTS[0], id: 'legacy-deposit', name: '기존 가상 예금', rates: [{ months: 12, base: 3.0 }], preferential: [], maxPreferential: 0, tags: ['예전 버전'], summary: '예전 버전에서 넣어둔 예금이에요.' },
  installment: { ...PRODUCTS[3], id: 'legacy-installment', name: '기존 가상 적금', rates: [{ months: 12, base: 3.0 }], preferential: [], maxPreferential: 0, tags: ['예전 버전'], summary: '예전 버전에서 모은 적금이에요.' },
};

export function getProduct(id: string): Product | undefined {
  return PRODUCT_BY_ID[id] ?? (id === 'legacy-deposit' ? LEGACY_PRODUCTS.deposit : id === 'legacy-installment' ? LEGACY_PRODUCTS.installment : undefined);
}

export function baseRateFor(p: Product, months: number): number | undefined {
  return p.rates.find((r) => r.months === months)?.base;
}

/** 이 상품으로 받을 수 있는 최고 금리 */
export function maxRate(p: Product): number {
  return Math.max(...p.rates.map((r) => r.base)) + p.maxPreferential;
}
