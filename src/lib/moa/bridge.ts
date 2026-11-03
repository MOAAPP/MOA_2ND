import { todayKST } from '../../../shared/dates';
import type { SpendEntry } from '../ml/types';
import type { Profile, ScheduleItem } from '../types';
import { emptyMoa, type MoaSchedule, type MoaState, type Txn } from './types';

/**
 * 기존 화면(평행세계 비교·가계부)과 모아 엔진을 잇는 다리.
 * 모아 엔진이 결제계좌의 기준(B₀·t₀·일정)을 갖고, 기존 Profile은 같은 값을 따라간다.
 */

export function moaFromProfile(p: Profile): MoaState {
  const m = emptyMoa();
  const schedule: MoaSchedule[] = p.items.map((i) => ({
    id: i.id,
    name: i.name,
    amount: i.amount,
    direction: i.kind === 'income' ? 'in' : 'out',
    recurrence: i.recurrence,
    day: i.day,
    date: i.date,
    essential: i.kind === 'expense',
    status: i.kind === 'income' ? 'scheduled' : undefined,
  }));
  return { ...m, anchor: { balance: p.baseBalance, at: p.baseSetAt, source: 'manual', reflected: p.reflectedOnBaseDate.map((id) => `${id}:${p.baseDate}`) }, schedule };
}

export function profileFromMoa(m: MoaState, prev: Profile | null): Profile {
  const items: ScheduleItem[] = m.schedule.map((s) => ({
    id: s.id,
    kind: s.direction === 'in' ? 'income' : 'expense',
    name: s.name,
    amount: s.amount,
    recurrence: s.recurrence,
    day: s.day,
    date: s.date,
  }));
  const at = m.anchor?.at ?? Date.now();
  return {
    baseBalance: m.anchor?.balance ?? 0,
    baseDate: todayKST(new Date(at)),
    baseSetAt: at,
    minBalance: prev?.minBalance ?? 0,
    dailySpend: prev?.dailySpend,
    items,
    reflectedOnBaseDate: (m.anchor?.reflected ?? []).map((k) => k.split(':')[0]),
    goal: prev?.goal,
  };
}

/** 가계부 목록에 보일 지출 (소비만) */
export function spendEntryOf(t: Txn): SpendEntry | null {
  if (t.kind !== 'spend') return null;
  return { date: t.date, amount: t.amount, category: t.category, name: t.name, from: 'record', txnId: t.id };
}

/**
 * 체험용 결제계좌 (시연 시나리오와 같은 모양).
 * 잔액 15만원, 26일 월세, 10일 알바비(예정), 신한 신용카드(말일 마감·14일 결제), 3주치 기록 완료 지출.
 */
export function demoMoa(nowMs: number): MoaState {
  const today = todayKST(new Date(nowMs));
  const [y, mo, d] = today.split('-').map(Number);
  const ms = (iso: string, h: number) => { const [a, b, c] = iso.split('-').map(Number); return Date.UTC(a, b - 1, c, h - 9); };
  const day = (n: number) => { const t = new Date(Date.UTC(y, mo - 1, d + n)); return t.toISOString().slice(0, 10); };
  const rentDay = Math.min(28, d + 6 > 28 ? 5 : d + 6);
  const m = emptyMoa();
  const txns: Txn[] = [];
  const dayStatus: MoaState['dayStatus'] = {};
  const menu: [string, string, number][] = [['메가커피', '카페', 2500], ['학식', '식비', 5500], ['배달의민족', '식비', 16800], ['지하철', '교통', 1450], ['편의점', '식비', 4200], ['올리브영', '쇼핑', 13900]];
  let k = 0;
  for (let i = 21; i >= 1; i--) {
    const date = day(-i);
    dayStatus[date] = i % 6 === 0 ? 'reconciled' : 'self';
    const n = (i * 7) % 3; // 0~2건
    for (let j = 0; j < n; j++) {
      const [name, category, amount] = menu[(k++) % menu.length];
      const credit = k % 4 === 0;
      txns.push({ id: `demo_${i}_${j}`, occurredAt: ms(date, 12 + j * 3), date, amount: amount + (i % 3) * 500, kind: 'spend', method: credit ? 'credit' : 'debit', account: credit ? 'other' : 'pay', cardId: credit ? 'demo_card' : 'demo_check', name, category, essential: false, source: 'demo', createdAt: nowMs });
    }
  }
  return {
    ...m,
    anchor: { balance: 150_000, at: nowMs - 3600_000, source: 'manual', reflected: [] },
    cards: [
      { id: 'demo_card', name: '신한', kind: 'credit', linked: false, cutoffDay: 31, payDay: 14 },
      { id: 'demo_check', name: '국민체크', kind: 'debit', linked: true },
    ],
    schedule: [
      { id: 'demo_rent', name: '월세', amount: 350_000, direction: 'out', recurrence: 'monthly', day: rentDay, essential: true },
      { id: 'demo_pay', name: '알바비', amount: 280_000, direction: 'in', recurrence: 'monthly', day: Math.max(1, rentDay - 2), essential: false, status: 'scheduled' },
      { id: 'demo_phone', name: '통신비', amount: 55_000, direction: 'out', recurrence: 'monthly', day: 25, essential: true },
    ],
    txns,
    dayStatus,
    mainMethod: 'debit',
    aiNoticeSeen: false,
  };
}
