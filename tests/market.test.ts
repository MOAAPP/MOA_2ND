import { describe, expect, it } from 'vitest';
import { explainMove, tagHeadline } from '../server/lib/explain';
import { parseNaverItem } from '../server/lib/providers/naver';
import { parseKisFrame, parseKisPrice } from '../server/lib/providers/kis';
import { isDue, nextRunAt } from '../server/lib/daily';
import { INSTRUMENT_BY_CODE } from '../shared/instruments';
import type { Quote, IndexQuote } from '../shared/market';
import type { Subscription } from '../server/lib/types';

function q(code: string, pct: number | null, over: Partial<Quote> = {}): Quote {
  return {
    code, name: INSTRUMENT_BY_CODE[code].name, price: 10000, time: 0, date: '2026-10-19', prevClose: 10000, prevCloseDate: '2026-10-16',
    change: pct === null ? null : pct * 100, changePct: pct, dayHigh: null, dayLow: null, volume: null,
    source: 'demo', live: false, delayed: false, delayNote: '', fetchedAt: 0, candles: [], ...over,
  };
}
const kospi = (pct: number): IndexQuote => ({ id: 'KOSPI', name: '코스피', value: 2900, change: null, changePct: pct, time: 0, source: 'demo', delayed: false, advancers: 250, decliners: 600 });

describe('왜 움직였을까 엔진', () => {
  it('시장 전체 하락 + 업종 동반 하락이면 두 요인을 강함·보통 순으로', () => {
    const e = explainMove({ inst: INSTRUMENT_BY_CODE['005930'], quote: q('005930', -2.0), kospi: kospi(-1.6), peers: [q('000660', -2.4)], global: [], news: [] });
    expect(e.direction).toBe('down');
    expect(e.reasons.map((r) => r.key)).toEqual(expect.arrayContaining(['market', 'sector']));
    expect(e.reasons[0].strength).toBe('강함');
    expect(e.facts.join(' ')).toContain('하락 600종목');
  });
  it('시장은 오르는데 혼자 크게 내리면 종목 요인 + 부정 기사', () => {
    const e = explainMove({
      inst: INSTRUMENT_BY_CODE['035720'], quote: q('035720', -4.5), kospi: kospi(0.8), peers: [q('035420', 0.5)], global: [],
      news: [{ title: '카카오, 3분기 실적 부진 우려', source: '연합', publishedAt: 0, link: 'x' }, { title: '카카오 신사옥 공개', source: 'A', publishedAt: 0, link: 'y' }],
    });
    expect(e.reasons.map((r) => r.key)).toEqual(expect.arrayContaining(['stock', 'news']));
    expect(e.reasons.find((r) => r.key === 'market')).toBeUndefined();
    expect(e.newsUsed).toHaveLength(1);
  });
  it('신호가 없으면 원인 불명이라고 솔직하게', () => {
    const e = explainMove({ inst: INSTRUMENT_BY_CODE['105560'], quote: q('105560', -1.0), kospi: kospi(0.1), peers: [], global: [], news: [] });
    expect(e.reasons).toHaveLength(0);
    expect(e.unknown).toBeTruthy();
  });
  it('미국 지수 ETF는 나스닥·환율을 요인으로', () => {
    const e = explainMove({
      inst: INSTRUMENT_BY_CODE['133690'], quote: q('133690', -1.8), kospi: kospi(-0.2), peers: [q('360750', -1.1)], news: [],
      global: [{ id: 'NDX', name: '나스닥', value: 1, changePct: -2.1, date: '2026-10-16', source: 'demo' }, { id: 'SPX', name: 'S&P500', value: 1, changePct: -1.2, date: '2026-10-16', source: 'demo' }, { id: 'USDKRW', name: '환율', value: 1390, changePct: -0.6, date: '2026-10-16', source: 'demo' }],
    });
    expect(e.reasons.map((r) => r.key)).toEqual(expect.arrayContaining(['us', 'fx']));
  });
  it('전 거래일 가격이 없으면 비교하지 않는다(0으로 채우지 않음)', () => {
    const e = explainMove({ inst: INSTRUMENT_BY_CODE['005930'], quote: q('005930', null), kospi: null, peers: [], global: [], news: [] });
    expect(e.direction).toBe('unknown');
  });
  it('기사 제목 태그', () => {
    expect(tagHeadline('목표가 하향, 실적 우려')).toBe('neg');
    expect(tagHeadline('대규모 수주 계약 체결')).toBe('pos');
  });
});

describe('시세 제공처 파서', () => {
  it('네이버: 하락이면 부호를 음수로', () => {
    const r = parseNaverItem({ closePrice: '71,800', compareToPreviousClosePrice: '500', compareToPreviousPrice: { code: '5', name: 'FALLING' }, fluctuationsRatio: '0.69', highPrice: '72,600', lowPrice: '71,500', accumulatedTradingVolume: '12,345,678', localTradedAt: '2026-10-19T10:01:02+09:00', marketStatus: 'OPEN' });
    expect(r).toMatchObject({ price: 71800, change: -500, changePct: -0.69, high: 72600, volume: 12345678, marketOpen: true });
    expect(r.timeMs).toBe(Date.parse('2026-10-19T01:01:02Z'));
  });
  it('KIS REST: 부호 코드 5 → 하락', () => {
    const r = parseKisPrice({ stck_prpr: '71800', prdy_vrss: '500', prdy_vrss_sign: '5', prdy_ctrt: '0.69', stck_sdpr: '72300', stck_hgpr: '72600', stck_lwpr: '71500', stck_oprc: '72000', acml_vol: '100' });
    expect(r).toMatchObject({ price: 71800, change: -500, changePct: -0.69, prevClose: 72300 });
  });
  it('KIS 웹소켓 프레임: 여러 틱 분리', () => {
    const tick = (price: string) => ['005930', '100102', price, '2', '300', '0.42', '71900', '71500', '72400', '71400', '0', '0', '10', '5000', ...Array(32).fill('0')].join('^');
    const frame = `0|H0STCNT0|002|${tick('71800')}^${tick('71900')}`;
    const ticks = parseKisFrame(frame);
    expect(ticks.map((t) => t.price)).toEqual([71800, 71900]);
    expect(ticks[0]).toMatchObject({ code: '005930', change: 300, high: 72400, volume: 5000 });
  });
});

describe('데일리 스케줄', () => {
  const at = (hh: number, mm = 0) => new Date(Date.UTC(2026, 9, 19, hh - 9, mm));
  const sub = (over: Partial<Subscription> = {}): Subscription => ({ deviceHash: 'h', enabled: true, time: '08:30', includePhotos: false, level: 1, nextLessonId: 'u1l1', streak: 0, holdings: [], watchlist: [], updatedAt: 0, createdAt: 0, ...over });
  it('설정 시각 전에는 보내지 않고, 지나면 오늘 한 번', () => {
    expect(isDue(sub(), at(8, 29))).toBe(false);
    expect(isDue(sub(), at(8, 30))).toBe(true);
    expect(isDue(sub({ lastRun: { date: '2026-10-19', jobId: 'j', status: 'ok', attempts: 1, lastAttemptAt: at(8, 30).getTime() } }), at(12))).toBe(false);
  });
  it('실패하면 10분 뒤 재시도, 하루 3번까지', () => {
    const failed = (attempts: number, mm: number) => sub({ lastRun: { date: '2026-10-19', jobId: 'j', status: 'failed', attempts, lastAttemptAt: at(8, mm).getTime() } });
    expect(isDue(failed(1, 30), at(8, 35))).toBe(false);
    expect(isDue(failed(1, 30), at(8, 41))).toBe(true);
    expect(isDue(failed(3, 30), at(9, 30))).toBe(false);
  });
  it('어제 보냈으면 오늘 다시 보낸다 / 꺼져 있으면 안 보냄', () => {
    expect(isDue(sub({ lastRun: { date: '2026-10-18', jobId: 'j', status: 'ok', attempts: 1, lastAttemptAt: 0 } }), at(9))).toBe(true);
    expect(isDue(sub({ enabled: false }), at(9))).toBe(false);
  });
  it('다음 전송 예정 시각', () => {
    expect(nextRunAt(sub(), at(7))).toBe(Date.UTC(2026, 9, 18, 23, 30));
    expect(nextRunAt(sub({ lastRun: { date: '2026-10-19', jobId: 'j', status: 'ok', attempts: 1, lastAttemptAt: 0 } }), at(9))).toBe(Date.UTC(2026, 9, 19, 23, 30));
  });
});
