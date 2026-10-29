/**
 * 가상 예금·적금 엔진. 모든 함수는 순수 함수이고 금액은 원 단위 정수다.
 * 계산 규칙: docs/PRODUCT_SPEC.md §6
 */
import { addDays, addMonths, diffDays, parseISO, type ISODate } from '../../../shared/dates';
import { floorWon, payout, rate, type Payout } from './money';
import { baseRateFor, getProduct, type Product, type ProductKind } from './products';

export interface Payment {
  on: ISODate;
  amount: number;
  auto: boolean;
  /** 정액적립식 회차(1부터) */
  round?: number;
}

export interface Settlement extends Payout {
  reason: 'maturity' | 'early';
  on: ISODate;
  /** 실제 적용된 연 금리(%) */
  appliedRate: number;
}

export interface Contract {
  id: string;
  productId: string;
  kind: ProductKind;
  installmentType?: 'fixed' | 'free';
  openedOn: ISODate;
  maturityOn: ISODate;
  termMonths: number;
  /** 가입 시 확정된 기본금리(연 %) */
  baseRate: number;
  /** 예금: 가입 때 확정 / 적금: 만기 때 확정. 그 전에는 가입 시점 달성분 */
  preferentialIds: string[];
  payments: Payment[];
  /** 정액적립식 월 납입액 */
  monthlyAmount?: number;
  /** 정액적립식 자동이체일(1~31, 그 달에 없으면 말일) */
  autoDay?: number;
  missedRounds: number[];
  status: 'active' | 'matured' | 'closed';
  settlement?: Settlement;
  nickname?: string;
}

export interface BankEvent {
  id: string;
  on: ISODate;
  contractId: string;
  type: 'open' | 'pay' | 'autoPay' | 'missed' | 'mature' | 'close';
  /** 현금 기준 증감(납입은 음수, 수령은 양수) */
  cash: number;
  memo: string;
}

export interface BankState {
  contracts: Contract[];
  /** 데모용 시간 이동(일) */
  clockOffsetDays: number;
  /** 자동이체·만기를 마지막으로 처리한 날 */
  lastProcessed: ISODate | null;
  log: BankEvent[];
}

/** 우대조건 판정에 쓰는 앱 데이터 */
export interface BankContext {
  /** 참기·대안을 고른 날짜들 */
  skipDates: ISODate[];
  /** 가계부에 지출을 기록한 날짜들 */
  ledgerDates: ISODate[];
  /** 완료한 학습 레슨 수 */
  lessons: number;
}

export const emptyBank = (): BankState => ({ contracts: [], clockOffsetDays: 0, lastProcessed: null, log: [] });
export const emptyContext = (): BankContext => ({ skipDates: [], ledgerDates: [], lessons: 0 });

/* ───────── 날짜 ───────── */

export function maturityOf(openedOn: ISODate, months: number): ISODate {
  return addMonths(openedOn, months);
}

/** openedOn부터 on까지 꽉 채운 개월 수 */
export function elapsedMonths(openedOn: ISODate, on: ISODate): number {
  const a = parseISO(openedOn);
  const b = parseISO(on);
  let m = (b.y - a.y) * 12 + (b.m - a.m);
  if (addMonths(openedOn, m) > on) m -= 1;
  return Math.max(0, m);
}

/** 정액적립식 k회차 납입 예정일 */
export function roundDue(c: Pick<Contract, 'openedOn' | 'autoDay'>, k: number): ISODate {
  return addMonths(c.openedOn, k - 1, c.autoDay ?? parseISO(c.openedOn).d);
}

export function principalOf(c: Contract): number {
  return c.payments.reduce((s, p) => s + p.amount, 0);
}

/* ───────── 우대금리 ───────── */

export interface PrefStatus {
  id: string;
  label: string;
  bonus: number;
  achieved: boolean;
  /** 진행도 (예: 참기 4/10) */
  progress?: { now: number; goal: number };
}

const countBetween = (dates: ISODate[], from: ISODate, to: ISODate, unique = false) => {
  const hit = dates.filter((d) => d >= from && d <= to);
  return unique ? new Set(hit).size : hit.length;
};

export function prefStatus(
  p: Product,
  ctx: BankContext,
  opts: { openedOn: ISODate; asOf: ISODate; maturityOn: ISODate; bankHistory?: Contract[]; contract?: Contract },
): PrefStatus[] {
  return p.preferential.map((pr) => {
    const r = pr.rule;
    const end = opts.asOf < opts.maturityOn ? opts.asOf : opts.maturityOn;
    let achieved = false;
    let progress: PrefStatus['progress'];
    if (r.type === 'skipCount') {
      const now = r.scope === 'beforeOpen30' ? countBetween(ctx.skipDates, addDays(opts.openedOn, -30), opts.openedOn) : countBetween(ctx.skipDates, opts.openedOn, end);
      progress = { now: Math.min(now, r.count), goal: r.count };
      achieved = now >= r.count;
    } else if (r.type === 'ledgerDays') {
      const now = countBetween(ctx.ledgerDates, opts.openedOn, end, true);
      progress = { now: Math.min(now, r.days), goal: r.days };
      achieved = now >= r.days;
    } else if (r.type === 'lessons') {
      progress = { now: Math.min(ctx.lessons, r.count), goal: r.count };
      achieved = ctx.lessons >= r.count;
    } else if (r.type === 'firstAtBank') {
      const others = (opts.bankHistory ?? []).filter((c) => c.id !== opts.contract?.id && getProduct(c.productId)?.bank === p.bank && c.openedOn <= opts.openedOn);
      achieved = others.length === 0;
    } else if (r.type === 'autoDebitNoMiss') {
      const c = opts.contract;
      achieved = c ? c.autoDay !== undefined && c.missedRounds.length === 0 && c.payments.every((x) => x.round === 1 || x.auto) : true;
    }
    return { id: pr.id, label: pr.label, bonus: pr.bonus, achieved, progress };
  });
}

export function preferentialRate(p: Product, ids: string[]): number {
  const sum = p.preferential.filter((x) => ids.includes(x.id)).reduce((s, x) => s + x.bonus, 0);
  return Math.min(p.maxPreferential, Math.round(sum * 100) / 100);
}

/* ───────── 이자 ───────── */

/** 만기 이자 (적용 금리 ratePct) */
export function maturityInterest(c: Contract, p: Product, ratePct: number): number {
  const r = rate(ratePct);
  if (c.kind === 'deposit') {
    const P = principalOf(c);
    if (p.compounding === 'monthly') return floorWon(P * (Math.pow(1 + r / 12, c.termMonths) - 1));
    return floorWon((P * r * diffDays(c.openedOn, c.maturityOn)) / 365);
  }
  if (c.installmentType === 'fixed') {
    let sum = 0;
    for (const pay of c.payments) {
      const k = pay.round ?? 1;
      const monthsLeft = c.termMonths - k + 1;
      const late = Math.max(0, diffDays(roundDue(c, k), pay.on));
      sum += pay.amount * ((r / 12) * monthsLeft - (r * late) / 365);
    }
    return floorWon(Math.max(0, sum));
  }
  return floorWon(c.payments.reduce((s, pay) => s + (pay.amount * r * Math.max(0, diffDays(pay.on, c.maturityOn))) / 365, 0));
}

/** 중도해지 금리(연 %) */
export function earlyRatePct(c: Contract, p: Product, on: ISODate): number {
  const m = elapsedMonths(c.openedOn, on);
  const row = p.earlyRates.find((e) => m < e.underMonths) ?? p.earlyRates[p.earlyRates.length - 1];
  if (row.fixed !== undefined) return row.fixed;
  return Math.round(c.baseRate * (row.ratio ?? 0) * 1000) / 1000;
}

/** 해지일까지 일할 단리 이자 */
export function accruedSimple(c: Contract, ratePct: number, on: ISODate): number {
  const r = rate(ratePct);
  return floorWon(c.payments.reduce((s, pay) => s + (pay.amount * r * Math.max(0, diffDays(pay.on, on))) / 365, 0));
}

export function earlyQuote(c: Contract, on: ISODate): Settlement {
  const p = getProduct(c.productId)!;
  const ratePct = earlyRatePct(c, p, on);
  return { ...payout(principalOf(c), accruedSimple(c, ratePct, on)), reason: 'early', on, appliedRate: ratePct };
}

/** 지금까지 쌓인 이자(약정 금리 기준, 표시용) */
export function accruedToDate(c: Contract, on: ISODate): number {
  const p = getProduct(c.productId)!;
  return accruedSimple(c, c.baseRate + preferentialRate(p, c.preferentialIds), on < c.maturityOn ? on : c.maturityOn);
}

/**
 * 만기 예상: 남은 정액 회차를 제날짜에 낸다고 가정하고, 우대조건은 asOf 시점 달성분으로 계산.
 * (자유적립식은 지금까지 넣은 돈만)
 */
export function maturityQuote(c: Contract, ctx: BankContext, asOf: ISODate, history: Contract[] = []): Settlement & { prefs: PrefStatus[] } {
  const p = getProduct(c.productId)!;
  const projected: Contract = { ...c, payments: [...c.payments] };
  if (c.installmentType === 'fixed' && c.monthlyAmount) {
    const paidRounds = new Set(c.payments.map((x) => x.round));
    for (let k = 1; k <= c.termMonths; k++) {
      const due = roundDue(c, k);
      if (!paidRounds.has(k) && !c.missedRounds.includes(k) && due >= asOf && due < c.maturityOn) projected.payments.push({ on: due, amount: c.monthlyAmount, auto: true, round: k });
    }
  }
  const prefs = prefStatus(p, ctx, { openedOn: c.openedOn, asOf: c.kind === 'deposit' ? c.openedOn : c.maturityOn, maturityOn: c.maturityOn, bankHistory: history, contract: c });
  const ids = c.kind === 'deposit' ? c.preferentialIds : prefs.filter((x) => x.achieved).map((x) => x.id);
  const appliedRate = Math.round((c.baseRate + preferentialRate(p, ids)) * 100) / 100;
  const out = payout(principalOf(projected), maturityInterest(projected, p, appliedRate));
  return { ...out, reason: 'maturity', on: c.maturityOn, appliedRate, prefs };
}

/* ───────── 가입 미리보기 ───────── */

export interface JoinQuote {
  ok: boolean;
  error?: string;
  maturityOn: ISODate;
  baseRate: number;
  prefRate: number;
  appliedRate: number;
  principal: number;
  interest: number;
  tax: number;
  net: number;
  prefs: PrefStatus[];
}

export function quoteJoin(
  p: Product,
  input: { amount: number; months: number; openedOn: ISODate; autoDay?: number },
  ctx: BankContext,
  history: Contract[] = [],
): JoinQuote {
  const baseRate = baseRateFor(p, input.months);
  const maturityOn = maturityOf(input.openedOn, input.months);
  const blank: JoinQuote = { ok: false, maturityOn, baseRate: baseRate ?? 0, prefRate: 0, appliedRate: 0, principal: 0, interest: 0, tax: 0, net: 0, prefs: [] };
  if (baseRate === undefined) return { ...blank, error: '선택할 수 없는 기간이에요.' };
  const amt = Math.floor(input.amount);
  if (!Number.isSafeInteger(amt) || amt < p.minAmount) return { ...blank, error: `${p.minAmount.toLocaleString('ko-KR')}원부터 넣을 수 있어요.` };
  if (amt > p.maxAmount) return { ...blank, error: `${p.kind === 'installment' ? '한 달 ' : ''}${p.maxAmount.toLocaleString('ko-KR')}원까지 넣을 수 있어요.` };

  const draft = draftContract(p, { ...input, amount: amt }, baseRate, 'draft');
  const prefs = prefStatus(p, ctx, { openedOn: input.openedOn, asOf: input.openedOn, maturityOn, bankHistory: history, contract: draft });
  // 예금은 가입 시 확정, 적금은 만기에 확정 → 미리보기는 '지금 달성분'으로
  const ids = prefs.filter((x) => x.achieved || p.preferential.find((y) => y.id === x.id)?.rule.type === 'autoDebitNoMiss').map((x) => x.id);
  draft.preferentialIds = ids;
  const q = maturityQuote(draft, ctx, input.openedOn, history);
  const prefRate = Math.round((q.appliedRate - baseRate) * 100) / 100;
  return { ok: true, maturityOn, baseRate, prefRate, appliedRate: q.appliedRate, principal: q.principal, interest: q.interest, tax: q.tax, net: q.net, prefs };
}

function draftContract(p: Product, input: { amount: number; months: number; openedOn: ISODate; autoDay?: number }, baseRate: number, id: string): Contract {
  const fixed = p.kind === 'installment' && p.installmentType === 'fixed';
  const free = p.kind === 'installment' && p.installmentType === 'free';
  const autoDay = fixed ? input.autoDay ?? parseISO(input.openedOn).d : undefined;
  const c: Contract = {
    id,
    productId: p.id,
    kind: p.kind,
    installmentType: p.installmentType,
    openedOn: input.openedOn,
    maturityOn: maturityOf(input.openedOn, input.months),
    termMonths: input.months,
    baseRate,
    preferentialIds: [],
    payments: [{ on: input.openedOn, amount: input.amount, auto: false, round: fixed ? 1 : undefined }],
    monthlyAmount: fixed ? input.amount : undefined,
    autoDay,
    missedRounds: [],
    status: 'active',
  };
  if (free) {
    // 미리보기: 자유적립식은 매달 같은 금액을 넣는다고 가정
    for (let k = 2; k <= input.months; k++) c.payments.push({ on: addMonths(input.openedOn, k - 1), amount: input.amount, auto: false });
  }
  return c;
}

/* ───────── 상태 변경 ───────── */

let seq = 0;
const eid = (on: ISODate, t: string) => `${t}-${on}-${Date.now().toString(36)}-${(seq++).toString(36)}`;

export interface BankResult {
  bank: BankState;
  /** 현금 증감 합계 */
  cash: number;
  events: BankEvent[];
}

export function openContract(
  bank: BankState,
  p: Product,
  input: { amount: number; months: number; openedOn: ISODate; autoDay?: number; nickname?: string },
  ctx: BankContext,
  usable: number,
): BankResult | { error: string } {
  const q = quoteJoin(p, input, ctx, bank.contracts);
  if (!q.ok) return { error: q.error ?? '가입할 수 없어요.' };
  const first = Math.floor(input.amount);
  if (first > usable) return { error: `이번 달 쓸 수 있는 돈이 ${(first - Math.max(0, usable)).toLocaleString('ko-KR')}원 부족해요.` };
  const id = `c-${input.openedOn}-${Date.now().toString(36)}-${(seq++).toString(36)}`;
  const c = draftContract(p, { ...input, amount: first }, q.baseRate, id);
  c.payments = c.payments.slice(0, 1);
  c.nickname = input.nickname?.trim() || undefined;
  const prefs = prefStatus(p, ctx, { openedOn: c.openedOn, asOf: c.openedOn, maturityOn: c.maturityOn, bankHistory: bank.contracts, contract: c });
  c.preferentialIds = prefs.filter((x) => x.achieved).map((x) => x.id);
  const ev: BankEvent = { id: eid(input.openedOn, 'open'), on: input.openedOn, contractId: id, type: 'open', cash: -first, memo: `${p.name} 가입` };
  return { bank: { ...bank, contracts: [...bank.contracts, c], log: [...bank.log, ev] }, cash: -first, events: [ev] };
}

/** 자유적립식 추가 납입 */
export function payInto(bank: BankState, id: string, amount: number, on: ISODate, usable: number): BankResult | { error: string } {
  const c = bank.contracts.find((x) => x.id === id);
  if (!c || c.status !== 'active') return { error: '납입할 수 없는 계좌예요.' };
  const p = getProduct(c.productId)!;
  if (c.installmentType !== 'free') return { error: '정액 적금은 자동이체로만 납입돼요.' };
  if (on >= c.maturityOn) return { error: '만기일이 지나서 넣을 수 없어요.' };
  const amt = Math.floor(amount);
  if (!Number.isSafeInteger(amt) || amt < p.minAmount) return { error: `${p.minAmount.toLocaleString('ko-KR')}원부터 넣을 수 있어요.` };
  if (amt > usable) return { error: '이번 달 쓸 수 있는 돈이 부족해요.' };
  const { y, m } = parseISO(on);
  const monthSum = c.payments.filter((x) => { const d = parseISO(x.on); return d.y === y && d.m === m; }).reduce((s, x) => s + x.amount, 0);
  const limit = p.monthlyLimit ?? p.maxAmount;
  if (monthSum + amt > limit) return { error: `이번 달에는 ${(limit - monthSum).toLocaleString('ko-KR')}원까지 더 넣을 수 있어요.` };
  const next: Contract = { ...c, payments: [...c.payments, { on, amount: amt, auto: false }] };
  const ev: BankEvent = { id: eid(on, 'pay'), on, contractId: id, type: 'pay', cash: -amt, memo: `${p.name} 납입` };
  return { bank: { ...bank, contracts: bank.contracts.map((x) => (x.id === id ? next : x)), log: [...bank.log, ev] }, cash: -amt, events: [ev] };
}

export function closeEarly(bank: BankState, id: string, on: ISODate): BankResult | { error: string } {
  const c = bank.contracts.find((x) => x.id === id);
  if (!c || c.status !== 'active') return { error: '해지할 수 없는 계좌예요.' };
  if (on >= c.maturityOn) return { error: '만기일이 지났어요. 만기 처리를 기다려 주세요.' };
  const s = earlyQuote(c, on);
  const next: Contract = { ...c, status: 'closed', settlement: s };
  const ev: BankEvent = { id: eid(on, 'close'), on, contractId: id, type: 'close', cash: s.net, memo: `${getProduct(c.productId)?.name ?? '계좌'} 중도해지` };
  return { bank: { ...bank, contracts: bank.contracts.map((x) => (x.id === id ? next : x)), log: [...bank.log, ev] }, cash: s.net, events: [ev] };
}

/**
 * from 다음 날부터 to까지 하루씩 자동이체·만기를 처리한다.
 * usable: 시작 시점 '이번 달 쓸 수 있는 돈'. 자동이체가 빠질 때마다 줄고, 만기 수령액만큼 는다.
 */
export function advance(bank: BankState, to: ISODate, ctx: BankContext, usable: number): BankResult {
  const start = bank.lastProcessed ?? to;
  let contracts = bank.contracts;
  const events: BankEvent[] = [];
  let cash = 0;
  let avail = usable;
  if (start >= to) return { bank: { ...bank, lastProcessed: bank.lastProcessed ?? to }, cash: 0, events };
  for (let d = addDays(start, 1); d <= to; d = addDays(d, 1)) {
    contracts = contracts.map((c) => {
      if (c.status !== 'active') return c;
      const p = getProduct(c.productId);
      if (!p) return c;
      let next = c;
      // 정액 자동이체
      if (c.installmentType === 'fixed' && c.monthlyAmount && d < c.maturityOn) {
        for (let k = 2; k <= c.termMonths; k++) {
          if (roundDue(c, k) !== d) continue;
          if (next.payments.some((x) => x.round === k) || next.missedRounds.includes(k)) continue;
          if (avail >= c.monthlyAmount) {
            avail -= c.monthlyAmount;
            cash -= c.monthlyAmount;
            next = { ...next, payments: [...next.payments, { on: d, amount: c.monthlyAmount, auto: true, round: k }] };
            events.push({ id: eid(d, 'auto'), on: d, contractId: c.id, type: 'autoPay', cash: -c.monthlyAmount, memo: `${p.name} ${k}회차 자동이체` });
          } else {
            next = { ...next, missedRounds: [...next.missedRounds, k] };
            events.push({ id: eid(d, 'miss'), on: d, contractId: c.id, type: 'missed', cash: 0, memo: `${p.name} ${k}회차 미납 (잔액 부족)` });
          }
        }
      }
      // 만기
      if (d >= c.maturityOn) {
        const q = maturityQuote(next, ctx, d, contracts);
        const ids = next.kind === 'deposit' ? next.preferentialIds : q.prefs.filter((x) => x.achieved).map((x) => x.id);
        const s: Settlement = { principal: q.principal, interest: q.interest, tax: q.tax, net: q.net, reason: 'maturity', on: d, appliedRate: q.appliedRate };
        avail += s.net;
        cash += s.net;
        events.push({ id: eid(d, 'mature'), on: d, contractId: c.id, type: 'mature', cash: s.net, memo: `${p.name} 만기 수령` });
        next = { ...next, status: 'matured', preferentialIds: ids, settlement: s };
      }
      return next;
    });
  }
  return { bank: { ...bank, contracts, lastProcessed: to, log: [...bank.log, ...events] }, cash, events };
}

/* ───────── 요약 ───────── */

export function bankTotals(bank: BankState, on: ISODate) {
  const active = bank.contracts.filter((c) => c.status === 'active');
  const deposit = active.filter((c) => c.kind === 'deposit').reduce((s, c) => s + principalOf(c), 0);
  const installment = active.filter((c) => c.kind === 'installment').reduce((s, c) => s + principalOf(c), 0);
  const accrued = active.reduce((s, c) => s + accruedToDate(c, on), 0);
  const earned = bank.contracts.filter((c) => c.settlement).reduce((s, c) => s + (c.settlement!.interest - c.settlement!.tax), 0);
  const nextMaturity = active.map((c) => c.maturityOn).sort()[0];
  return { deposit, installment, principal: deposit + installment, accrued, earned, active: active.length, nextMaturity };
}

/** 예전 버전의 단순 잔액을 계약으로 옮긴다 */
export function migrateLegacy(bank: BankState, legacy: { deposit: number; installment: number }, on: ISODate): BankState {
  const add: Contract[] = [];
  (['deposit', 'installment'] as const).forEach((kind) => {
    const amount = Math.floor(legacy[kind] || 0);
    if (amount <= 0 || bank.contracts.some((c) => c.productId === `legacy-${kind}`)) return;
    add.push({
      id: `legacy-${kind}`,
      productId: `legacy-${kind}`,
      kind,
      installmentType: kind === 'installment' ? 'free' : undefined,
      openedOn: on,
      maturityOn: maturityOf(on, 12),
      termMonths: 12,
      baseRate: 3.0,
      preferentialIds: [],
      payments: [{ on, amount, auto: false }],
      missedRounds: [],
      status: 'active',
    });
  });
  return add.length ? { ...bank, contracts: [...bank.contracts, ...add] } : bank;
}
