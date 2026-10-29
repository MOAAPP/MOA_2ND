/**
 * 평행세계 리포트 (N13 · PRODUCT_SPEC §4 F6)
 * 결정 기록(WorldDecision)만으로 계산한다. 저축·투자 이동은 두 세계에 똑같이 들어가서 차이에 영향이 없다.
 */
import type { ISODate } from '../../shared/dates';
import { bestYearPlan } from './futureCost';
import { koreaDay } from './worldHistory';
import type { WorldDecision } from './worldWallet';

export interface MonthRow {
  /** 'YYYY-MM' */
  month: string;
  label: string;
  decisions: number;
  held: number;
  /** 정가로 다 샀다면 쓴 돈 */
  fullPrice: number;
  /** 실제로 쓴 돈 */
  paid: number;
  saved: number;
}

export interface ChoiceRow {
  id: string;
  title: string;
  day: ISODate;
  choice: WorldDecision['choice'];
  saved: number;
  /** 아낀 돈을 12개월 가상 예금에 넣었다면 세후 수령액 */
  yearNet: number;
  productName: string;
}

export interface WorldReport {
  decisions: number;
  held: number;
  holdRate: number | null;
  savedTotal: number;
  spentTotal: number;
  fullTotal: number;
  /** 지킨 돈 전체를 오늘 12개월 예금에 넣으면 */
  year: { net: number; interest: number; productName: string };
  months: MonthRow[];
  top: ChoiceRow[];
  /** 가장 많이 지킨 달 */
  bestMonth: MonthRow | null;
}

const monthLabel = (m: string) => `${Number(m.slice(5, 7))}월`;

export function worldReport(decisions: WorldDecision[], today: ISODate, topN = 5): WorldReport {
  const byMonth = new Map<string, MonthRow>();
  for (const d of decisions) {
    const month = koreaDay(d.at).slice(0, 7);
    const row = byMonth.get(month) ?? { month, label: monthLabel(month), decisions: 0, held: 0, fullPrice: 0, paid: 0, saved: 0 };
    row.decisions += 1;
    if (d.choice !== 'buy') row.held += 1;
    row.fullPrice += d.price;
    row.paid += d.paid;
    row.saved += d.price - d.paid;
    byMonth.set(month, row);
  }
  const months = [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
  const held = decisions.filter((d) => d.choice !== 'buy').length;
  const savedTotal = decisions.reduce((s, d) => s + d.price - d.paid, 0);
  const plan = bestYearPlan(savedTotal, 'once', today);
  const top = decisions
    .filter((d) => d.price > d.paid)
    .sort((a, b) => b.price - b.paid - (a.price - a.paid) || b.at - a.at)
    .slice(0, topN)
    .map((d) => {
      const saved = d.price - d.paid;
      const p = bestYearPlan(saved, 'once', today);
      return { id: d.id, title: d.title, day: koreaDay(d.at), choice: d.choice, saved, yearNet: p.net, productName: p.productName };
    });
  const bestMonth = months.reduce<MonthRow | null>((b, m) => (!b || m.saved > b.saved ? m : b), null);
  return {
    decisions: decisions.length,
    held,
    holdRate: decisions.length ? held / decisions.length : null,
    savedTotal,
    spentTotal: decisions.reduce((s, d) => s + d.paid, 0),
    fullTotal: decisions.reduce((s, d) => s + d.price, 0),
    year: { net: plan.net, interest: plan.net - plan.principal, productName: plan.productName },
    months,
    top,
    bestMonth: bestMonth && bestMonth.saved > 0 ? bestMonth : null,
  };
}
