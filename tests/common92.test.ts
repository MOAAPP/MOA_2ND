import { describe, expect, it } from 'vitest';
import fixture from '../src/data/moa92.json';
import { demoCashBalance, demoData, demoInvestmentJournal, demoMoa, demoWorldWallet, COMMON_DEMO_PERIOD } from '../src/lib/commonDemo';
import { spendHistory } from '../src/lib/ml/provider';
import { fundedPortfolio } from '../src/lib/fundedInvest';
import { historyEvents } from '../src/lib/worldHistory';
import { WORLD_START_CASH, walletSummary } from '../src/lib/worldWallet';

const asOf = Date.parse('2026-11-04T01:12:00+09:00');
const nextDay = Date.parse('2026-11-05T09:00:00+09:00');
const inRange = (a: string) => Date.parse(a) <= asOf;

describe('공통 92일 합성 데이터 — DB 없이 모든 화면이 공유', () => {
  it('9월 11일~12월 11일을 하루도 빠짐없이 포함한다', () => {
    expect(COMMON_DEMO_PERIOD.synthetic).toBe(true);
    expect(COMMON_DEMO_PERIOD.start).toBe('2026-09-11');
    expect(COMMON_DEMO_PERIOD.end).toBe('2026-12-11');
    expect(fixture.daily).toHaveLength(92);
    expect(new Set(fixture.daily.map((x) => x.date)).size).toBe(92);
    expect(fixture.daily[0].date).toBe('2026-09-11');
    expect(fixture.daily.at(-1)?.date).toBe('2026-12-11');
  });

  it('오늘 이후 시뮬레이션 거래는 과거 가계부·주문 기록에 미리 나오지 않는다', () => {
    const ledger = demoData(asOf);
    const account = demoMoa(asOf);
    const world = demoWorldWallet(asOf);
    const journal = demoInvestmentJournal(asOf);
    expect(ledger.spendLog.length).toBeGreaterThan(20);
    expect(ledger.spendLog.every((x) => x.date <= '2026-11-04')).toBe(true);
    expect(account.txns.every((x) => x.occurredAt <= asOf)).toBe(true);
    expect(world.decisions.every((x) => x.at <= asOf)).toBe(true);
    expect(world.movements.every((x) => x.at <= asOf)).toBe(true);
    expect(journal.fills.every((x) => x.time <= asOf)).toBe(true);
    expect(fixture.transactions.some((x) => x.date > '2026-11-04')).toBe(true);
    expect(fixture.choices.some((x) => x.date > '2026-11-04')).toBe(true);
    expect(fixture.investments.some((x) => x.date > '2026-11-04')).toBe(true);
  });

  it('은행 잔액은 전체 합성 계좌 흐름으로 맞추고 가계부에는 기록된 소비만 보여준다', () => {
    const expectedBalance = fixture.start_cash_krw + fixture.transactions
      .filter((x) => inRange(x.at_kst))
      .reduce((sum, x) => sum + x.bank_delta_krw, 0);
    const account = demoMoa(asOf);
    const ledger = demoData(asOf);
    expect(demoCashBalance(asOf)).toBe(expectedBalance);
    expect(account.anchor?.balance).toBe(expectedBalance);
    expect(ledger.profile.baseBalance).toBe(expectedBalance);
    const recorded = fixture.transactions.filter((x) => x.kind === 'spend' && x.recorded === 1 && inRange(x.at_kst));
    expect(ledger.spendLog).toHaveLength(recorded.length);
    expect(account.txns.filter((t) => t.kind === 'spend' && !t.essential)).toHaveLength(recorded.length);
    expect(spendHistory(ledger.records, ledger.spendLog, '2026-11-04')).toHaveLength(recorded.length);
    expect(account.dayStatus).toEqual({}); // no user-facing completion checklist
  });

  it('ETF 매수·매도는 하나의 평행세계 자산 장부로 집계한다', () => {
    const wallet = demoWorldWallet(asOf);
    const journal = demoInvestmentJournal(asOf);
    const positions = fundedPortfolio(wallet, journal).positions;
    const byCode = new Map<string, number>();
    for (const trade of fixture.investments.filter((t) => inRange(t.at_kst))) {
      byCode.set(trade.code, (byCode.get(trade.code) ?? 0) + trade.qty * (trade.side === 'buy' ? 1 : -1));
    }
    for (const [code, qty] of byCode) {
      expect(positions[code]?.qty ?? 0).toBe(qty);
    }
    expect(journal.fills.length).toBe(fixture.investments.filter((t) => inRange(t.at_kst)).length);
    expect(wallet.cash).toBe(WORLD_START_CASH + historyEvents(wallet).reduce((sum, e) => sum + e.cashDelta, 0));
    const summary = walletSummary(wallet);
    expect(summary.totalAssets).toBe(summary.cash + summary.savings + summary.stockValue);
    // Shares count towards assets, not the cash that can fund purchases before a sell.
    expect(summary.monthlyUsable).toBe(wallet.cash - 530_000 - 150_000);
    expect(fundedPortfolio(wallet, journal).cash).toBe(Math.max(0, Math.floor(summary.monthlyUsable)));
  });

  it('미래 날짜가 지나야 예시 내역이 늘어나고, 같은 시각이면 결과가 일정하다', () => {
    const before = demoData(asOf).spendLog;
    const after = demoData(nextDay).spendLog;
    expect(after.length).toBeGreaterThanOrEqual(before.length);
    expect(demoWorldWallet(asOf)).toEqual(demoWorldWallet(asOf));
    expect(demoInvestmentJournal(asOf)).toEqual(demoInvestmentJournal(asOf));
  });
});
