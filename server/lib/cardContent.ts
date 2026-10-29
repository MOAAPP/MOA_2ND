import { formatKDate, formatKDateTime, formatShort } from '../../shared/dates';
import { formatSourceLabel } from '../../shared/sources';
import { won, signedWon, signedPct, pct, shares } from '../../shared/format';
import type { Instrument } from '../../shared/instruments';
import { CONCEPTS, LEVEL_LABEL, type Level } from '../../shared/knowledge';
import { changeFrom, dayRange, volatility, type IndexQuote, type Quote } from '../../shared/market';
import type { DailyQuiz } from '../../shared/curriculum';
import type { Explanation } from './explain';
import type { GlobalIndicator } from './quotes';
import type { TradeInput } from './types';

export interface CardStat {
  label: string;
  value: string;
  sub?: string;
  tone?: 'up' | 'down' | 'flat';
}

export interface CardSection {
  heading: string;
  lines: string[];
}

export interface CardSpec {
  index: 1 | 2 | 3 | 4;
  eyebrow: string;
  title: string;
  stats: CardStat[];
  sections: CardSection[];
  photoQuery: string;
  footer: string;
}

const tone = (n: number | null | undefined): CardStat['tone'] => (n == null ? 'flat' : n > 0 ? 'up' : n < 0 ? 'down' : 'flat');

function pickBy(seed: string, list: string[]): string {
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return list[h % list.length];
}

function clip(s: string, n: number) {
  return s.length > n ? s.slice(0, n - 1) + '…' : s;
}

function isoKST(ms: number): string {
  return new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
}

/** '왜 움직였을까' 섹션 (거래 카드 3장·데일리 카드 3장 공용) */
export function whySections(e: Explanation, ai: string | null): CardSection[] {
  const sections: CardSection[] = [{ heading: '확인된 사실', lines: e.facts.slice(0, 4) }];
  if (e.reasons.length) {
    sections.push({ heading: '가능한 요인 (영향 크기 추정)', lines: e.reasons.slice(0, 3).map((r) => `[${r.strength}] ${r.label} — ${r.detail}`) });
  }
  if (e.newsUsed.length) sections.push({ heading: '관련 기사 제목', lines: e.newsUsed.slice(0, 2).map((n) => `${n.source} ${formatShort(isoKST(n.publishedAt))} · ${clip(n.title, 30)}`) });
  sections.push({ heading: ai ? '한 줄 정리 (AI 요약 · 위 사실 기반)' : '한 줄 정리', lines: [ai ?? e.summary] });
  return sections;
}

/* ───────────── 거래 직후 카드 4장 ───────────── */
export interface TradeCardInput {
  trade: TradeInput;
  inst: Instrument;
  quote: Quote;
  explanation: Explanation;
  ai: string | null;
  level: Level;
}

export function buildCards(input: TradeCardInput): CardSpec[] {
  const { trade, inst, quote, explanation, ai, level } = input;
  const verb = trade.side === 'buy' ? '샀어요' : '팔았어요';
  const action = trade.side === 'buy' ? '매수' : '매도';
  const quoteAt = `${formatKDateTime(quote.time)} 기준`;
  const footer = `${formatSourceLabel(quote.source, quote.live)} · ${quoteAt} · 모의투자(실제 거래 아님)`;
  const vsTrade = changeFrom(trade.price, quote.price);

  const card1: CardSpec = {
    index: 1,
    eyebrow: `모의투자 · ${action} 체결 · ${formatKDateTime(trade.filledAt)}`,
    title: `${inst.name} ${shares(trade.qty)}를\n${won(trade.price)}에 ${verb}`,
    stats: [
      { label: '최신 가격', value: won(quote.price), sub: quoteAt },
      quote.prevClose !== null ? { label: '전 거래일 종가', value: won(quote.prevClose), sub: quote.prevCloseDate ? formatKDate(quote.prevCloseDate) : undefined } : { label: '전 거래일 종가', value: '확인 불가', sub: '데이터 없음' },
      quote.change !== null && quote.changePct !== null ? { label: '전 거래일 대비', value: signedWon(quote.change), sub: signedPct(quote.changePct), tone: tone(quote.change) } : { label: '전 거래일 대비', value: '계산 불가', sub: '비교 기준 없음' },
    ],
    sections: [
      {
        heading: trade.side === 'buy' ? '내 매수가와 비교' : '판 가격과 비교',
        lines: vsTrade
          ? [`체결가 ${won(trade.price)} → 최신 ${won(quote.price)}`, trade.side === 'buy' ? `${shares(trade.qty)} 기준 ${signedWon(vsTrade.change * trade.qty)} (${signedPct(vsTrade.pct)})` : `판 뒤 가격 변화 주당 ${signedWon(vsTrade.change)} (${signedPct(vsTrade.pct)})`]
          : ['비교할 가격이 없어요.'],
      },
    ],
    photoQuery: inst.photoTopics[0],
    footer,
  };

  const range = dayRange(quote.dayHigh, quote.dayLow, quote.prevClose);
  const vol = volatility(quote.candles, 20);
  const volLines: string[] = [];
  if (vol) {
    if (level === 1) volLines.push(`최근 20거래일 동안 하루에 보통 ±${pct(vol.dailyPct)} 안팎 움직였어요.`);
    else volLines.push(`일간 변동성 ${pct(vol.dailyPct, 2)} · 연환산 ${pct(vol.annualPct)}`, `기간 ${formatShort(vol.from)}~${formatShort(vol.to)} (20거래일), 일간 로그수익률 표준편차`);
  } else volLines.push('최근 20거래일 데이터가 부족해 변동성은 계산하지 않았어요.');
  const card2: CardSpec = {
    index: 2,
    eyebrow: `변동폭과 변동성 · ${formatKDate(quote.date)}`,
    title: '오늘 가격은\n얼마나 흔들렸을까요',
    stats: range
      ? [{ label: '당일 고가', value: won(quote.dayHigh!) }, { label: '당일 저가', value: won(quote.dayLow!) }, { label: '하루 변동폭', value: won(range.width), sub: range.pct !== null ? `전 거래일 종가의 ${pct(range.pct)}` : undefined }]
      : [{ label: '당일 고가·저가', value: '데이터 없음', sub: '제공처가 값을 주지 않았어요' }],
    sections: [{ heading: '최근 흐름', lines: volLines }, { heading: CONCEPTS.volatility[level].title, lines: [CONCEPTS.volatility[level].body] }],
    photoQuery: pickBy(trade.tradeId + 'c2', ['stock market chart screen', 'trading charts monitor', 'financial graph screen']),
    footer,
  };

  const card3: CardSpec = {
    index: 3,
    eyebrow: `왜 움직였을까 · ${inst.sector}`,
    title: explanation.direction === 'down' ? `${inst.name},\n왜 내렸을까요` : explanation.direction === 'up' ? `${inst.name},\n왜 올랐을까요` : `${inst.name},\n오늘의 흐름`,
    stats: [],
    sections: whySections(explanation, ai),
    photoQuery: inst.photoTopics[1] ?? inst.photoTopics[0],
    footer: `기사: Google 뉴스(최근 3일, 제목만) · ${footer}`,
  };

  let card4: CardSpec;
  if (trade.side === 'buy') {
    const conceptKey = trade.weightPct !== undefined && trade.weightPct >= 30 ? 'diversification' : 'avgPrice';
    const c = CONCEPTS[conceptKey][level];
    const next = level === 1 ? ['왜 샀는지 한 문장으로 적어두기', '얼마나 내려가면 다시 볼지 정해두기'] : level === 2 ? ['다음 실적 발표 날짜 확인하기', '같은 업종 종목과 등락 비교하기'] : ['변동성 대비 내 비중이 적절한지 점검', '매수 근거가 바뀌는 조건을 미리 정의'];
    card4 = {
      index: 4,
      eyebrow: `내 행동 복기 · 수준: ${LEVEL_LABEL[level]}`,
      title: '산 뒤의 나에게\n남기는 메모',
      stats: [
        vsTrade ? { label: '평가손익(산 나 vs 현금으로 둔 나)', value: signedWon(vsTrade.change * trade.qty), sub: signedPct(vsTrade.pct), tone: tone(vsTrade.change) } : { label: '평가손익', value: '계산 불가' },
        ...(trade.weightPct !== undefined ? [{ label: '모의 자산 중 비중', value: pct(trade.weightPct) }] : []),
      ],
      sections: [{ heading: '다음에 살펴볼 점', lines: next }, { heading: c.title, lines: [c.body] }, { heading: '질문 하나', lines: ['이 종목을 산 이유가 바뀐다면, 그때 무엇을 할 건가요?'] }],
      photoQuery: pickBy(trade.tradeId + 'c4', ['notebook planning desk', 'writing notes coffee', 'person thinking window']),
      footer: `수수료·세금 미반영 · ${footer}`,
    };
  } else {
    const c = CONCEPTS.realized[level];
    const realized = trade.avgPriceBefore !== undefined ? (trade.price - trade.avgPriceBefore) * trade.qty : null;
    const holdDiff = (quote.price - trade.price) * trade.qty;
    card4 = {
      index: 4,
      eyebrow: `내 행동 복기 · 수준: ${LEVEL_LABEL[level]}`,
      title: '판 나와\n계속 보유한 나',
      stats: [
        realized !== null ? { label: '실현손익(확정)', value: signedWon(realized), sub: `평균단가 ${won(trade.avgPriceBefore!)}`, tone: tone(realized) } : { label: '실현손익', value: '계산 불가' },
        { label: '계속 보유했다면(평가)', value: signedWon(holdDiff), sub: '판 뒤 가격 변화 × 수량', tone: tone(holdDiff) },
      ],
      sections: [{ heading: '당시 판단 복기', lines: ['팔기로 한 이유가 가격이었나요, 미리 정한 계획이었나요?', '결과보다 그때의 근거를 기준으로 돌아봐요.'] }, { heading: c.title, lines: [c.body] }],
      photoQuery: pickBy(trade.tradeId + 'c4', ['calculator finance review', 'reviewing documents desk', 'notebook pen reflection']),
      footer: `수수료·세금 미반영 · ${footer}`,
    };
  }
  return [card1, card2, card3, card4];
}

/* ───────────── 매일 오는 데일리 카드 4장 ───────────── */
export interface Holding {
  inst: Instrument;
  qty: number;
  avgPrice: number;
  quote: Quote | null;
}

export interface DailyCardInput {
  date: string;
  tradingDay: boolean;
  session: 'pre' | 'open' | 'closed' | 'holiday';
  kospi: IndexQuote | null;
  kosdaq: IndexQuote | null;
  global: GlobalIndicator[];
  holdings: Holding[];
  watch: { inst: Instrument; quote: Quote | null }[];
  focus: { inst: Instrument; quote: Quote; explanation: Explanation; ai: string | null } | null;
  level: Level;
  streak: number;
  nextLesson: { title: string; unitTitle: string; minutes: number } | null;
  quiz: DailyQuiz;
  nickname?: string;
  appUrl?: string;
}

function idxStat(q: IndexQuote | null, label: string): CardStat {
  if (!q) return { label, value: '확인 불가' };
  return { label, value: q.value.toLocaleString('ko-KR', { maximumFractionDigits: 2 }), sub: q.changePct !== null ? signedPct(q.changePct) : undefined, tone: tone(q.changePct) };
}

export function buildDailyCards(d: DailyCardInput): CardSpec[] {
  const when = formatKDate(d.date, { weekday: true });
  const timing = d.session === 'pre' ? '장 시작 전 · 전 거래일 마감 기준' : d.session === 'open' ? '장중' : d.session === 'closed' ? '장 마감 후' : '휴장일 · 마지막 거래일 기준';
  const srcs = new Set<string>();
  for (const q of [d.kospi, d.kosdaq]) if (q) srcs.add(formatSourceLabel(q.source));
  for (const h of d.holdings) if (h.quote) srcs.add(formatSourceLabel(h.quote.source, h.quote.live));
  const footer = `${[...srcs].join(' · ') || '시세 확인 불가'} · ${when} 생성 · 모의투자 정보는 실제 거래 아님`;

  /* 1장: 오늘의 시장 */
  const k = d.kospi;
  const spx = d.global.find((g) => g.id === 'SPX');
  const ndx = d.global.find((g) => g.id === 'NDX');
  const fx = d.global.find((g) => g.id === 'USDKRW');
  const breadth = k?.advancers != null && k?.decliners != null ? [`코스피 상승 ${k.advancers}종목 · 하락 ${k.decliners}종목 → ${k.decliners > k.advancers ? '내린 종목이 더 많았어요' : '오른 종목이 더 많았어요'}`] : [];
  const marketMood = k?.changePct == null ? '코스피 값을 확인하지 못했어요.' : Math.abs(k.changePct) < 0.3 ? '시장은 큰 변화 없이 보합권이었어요.' : k.changePct > 0 ? `코스피가 ${signedPct(k.changePct)} 올랐어요.` : `코스피가 ${signedPct(k.changePct)} 내렸어요.`;
  const card1: CardSpec = {
    index: 1,
    eyebrow: `데일리 브리핑 · ${when} · ${timing}`,
    title: k?.changePct != null ? `코스피 ${signedPct(k.changePct)}\n${k.value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })}` : '오늘의 시장',
    stats: [idxStat(d.kospi, '코스피'), idxStat(d.kosdaq, '코스닥'), fx ? { label: '원/달러', value: `${Math.round(fx.value).toLocaleString('ko-KR')}원`, sub: fx.changePct != null ? signedPct(fx.changePct) : undefined, tone: tone(fx.changePct) } : { label: '원/달러', value: '확인 불가' }],
    sections: [
      { heading: '한눈에', lines: [marketMood, ...breadth] },
      { heading: '밤사이 미국 (직전 마감)', lines: spx && ndx ? [`S&P500 ${signedPct(spx.changePct ?? 0)} · 나스닥 ${signedPct(ndx.changePct ?? 0)} (${formatShort(ndx.date)} 마감)`, Math.abs(ndx.changePct ?? 0) >= 1 ? '미국 기술주 흐름은 국내 반도체·플랫폼 종목에 영향을 주는 경우가 많아요.' : '미국 증시는 큰 움직임이 없었어요.'] : ['미국 지수를 확인하지 못했어요.'] },
      ...(!d.tradingDay ? [{ heading: '오늘은 휴장일', lines: ['숫자는 마지막 거래일 마감 기준이에요. 쉬는 날엔 레슨으로 실력을 쌓아봐요.'] }] : []),
    ],
    photoQuery: pickBy(d.date + 'm', ['seoul skyline morning', 'stock market board', 'financial district city']),
    footer,
  };

  /* 2장: 내 보유 종목 */
  const priced = d.holdings.filter((h) => h.quote && h.quote.changePct !== null);
  let card2: CardSpec;
  if (d.holdings.length) {
    const todayPnl = priced.reduce((s, h) => s + (h.quote!.change ?? 0) * h.qty, 0);
    const totalPnl = priced.reduce((s, h) => s + (h.quote!.price - h.avgPrice) * h.qty, 0);
    const downs = priced.filter((h) => (h.quote!.changePct ?? 0) < 0).length;
    card2 = {
      index: 2,
      eyebrow: `내 모의투자 · 보유 ${d.holdings.length}종목`,
      title: priced.length ? `보유 ${d.holdings.length}종목 중\n${downs ? `${downs}개 하락` : '모두 상승·보합'}` : '내 보유 종목',
      stats: [
        { label: '오늘 평가 변화', value: priced.length ? signedWon(todayPnl) : '확인 불가', tone: tone(todayPnl) },
        { label: '누적 평가손익', value: priced.length ? signedWon(totalPnl) : '확인 불가', tone: tone(totalPnl) },
      ],
      sections: [
        {
          heading: '종목별',
          lines: d.holdings.slice(0, 4).map((h) => (h.quote && h.quote.changePct !== null ? `${h.inst.name} ${won(h.quote.price)} ${signedPct(h.quote.changePct)} · ${shares(h.qty)} 평가 ${signedWon((h.quote.price - h.avgPrice) * h.qty)}` : `${h.inst.name} · 시세 확인 불가`)),
        },
        ...(d.holdings.length > 4 ? [{ heading: '', lines: [`외 ${d.holdings.length - 4}종목은 앱에서 볼 수 있어요.`] }] : []),
      ],
      photoQuery: d.holdings[0].inst.photoTopics[0],
      footer: `수수료·세금 미반영 · ${footer}`,
    };
  } else {
    card2 = {
      index: 2,
      eyebrow: '관심 종목',
      title: '아직 보유 종목이\n없어요',
      stats: [],
      sections: [
        { heading: '관심 종목', lines: d.watch.slice(0, 4).map((w) => (w.quote && w.quote.changePct !== null ? `${w.inst.name} ${won(w.quote.price)} ${signedPct(w.quote.changePct)}` : `${w.inst.name} · 시세 확인 불가`)) },
        { heading: '해볼까요', lines: ['연습장에서 1주만 모의 매수해 보면, 내 종목 소식이 매일 여기로 와요.'] },
      ],
      photoQuery: d.watch[0]?.inst.photoTopics[0] ?? 'stock market chart screen',
      footer,
    };
  }

  /* 3장: 왜 움직였을까 */
  const f = d.focus;
  const card3: CardSpec = f
    ? {
        index: 3,
        eyebrow: `왜 움직였을까 · ${f.inst.name}`,
        title: f.explanation.direction === 'down' ? `${f.inst.name} ${signedPct(f.explanation.pct ?? 0)},\n왜 내렸을까요` : f.explanation.direction === 'up' ? `${f.inst.name} ${signedPct(f.explanation.pct ?? 0)},\n왜 올랐을까요` : `${f.inst.name},\n조용한 하루`,
        stats: [],
        sections: whySections(f.explanation, f.ai),
        photoQuery: f.inst.photoTopics[1] ?? f.inst.photoTopics[0],
        footer: `기사: Google 뉴스(최근 3일, 제목만) · ${footer}`,
      }
    : {
        index: 3,
        eyebrow: '왜 움직였을까',
        title: '분석할 종목의\n시세를 받지 못했어요',
        stats: [],
        sections: [{ heading: '안내', lines: ['시세 제공처 오류로 원인 분석을 건너뛰었어요. 앱에서 다시 확인해 주세요.'] }],
        photoQuery: 'newspaper coffee morning',
        footer,
      };

  /* 4장: 오늘의 한 걸음 */
  const letters = ['A', 'B', 'C', 'D'];
  const card4: CardSpec = {
    index: 4,
    eyebrow: `오늘의 한 걸음 · ${LEVEL_LABEL[d.level]}`,
    title: d.streak > 0 ? `${d.streak}일 연속 학습 중\n오늘도 이어갈까요` : '오늘 첫 걸음을\n시작해볼까요',
    stats: [],
    sections: [
      { heading: '오늘의 퀴즈', lines: [d.quiz.q, ...d.quiz.options.map((o, i) => `${letters[i]}. ${o}`)] },
      ...(d.nextLesson ? [{ heading: '다음 레슨', lines: [`${d.nextLesson.unitTitle} › ${d.nextLesson.title} (약 ${d.nextLesson.minutes}분)`] }] : [{ heading: '학습 경로', lines: ['모든 레슨을 마쳤어요. 복습으로 실력을 다져봐요.'] }]),
      { heading: '정답은 앱에서', lines: [`평행통장 배움 탭에서 풀면 스트릭이 이어져요.${d.appUrl ? ` ${d.appUrl}` : ''}`] },
    ],
    photoQuery: pickBy(d.date + 's', ['student studying notebook', 'study desk morning light', 'open book coffee']),
    footer: `${d.nickname ? `${d.nickname}님을 위한 ` : ''}평행통장 데일리 · 투자 권유가 아닌 학습 자료예요`,
  };
  return [card1, card2, card3, card4];
}

/** Discord 텍스트(보조 설명). 생활비 잔고 등 재무 정보는 포함하지 않는다. */
export function discordSummary(trade: TradeInput, name: string, quote: { source: Quote['source']; time: number; live?: boolean }, e?: Explanation): string {
  const action = trade.side === 'buy' ? '매수' : '매도';
  return [
    `**[평행통장 · 모의투자]** ${name} ${shares(trade.qty)} ${action} (체결가 ${won(trade.price)})`,
    e ? e.headline : '',
    `카드뉴스 4장 · ${formatSourceLabel(quote.source, quote.live)} ${formatKDateTime(quote.time)} 기준`,
    '실제 거래가 아닌 모의투자 기록이에요. 투자 권유가 아닙니다.',
  ].filter(Boolean).join('\n');
}

export function dailySummary(d: DailyCardInput): string {
  const k = d.kospi;
  return [
    `**[평행통장 데일리]** ${formatKDate(d.date, { weekday: true })}${d.nickname ? ` · ${d.nickname}님` : ''}`,
    k?.changePct != null ? `코스피 ${k.value.toLocaleString('ko-KR', { maximumFractionDigits: 2 })} (${signedPct(k.changePct)})` : '',
    d.focus ? d.focus.explanation.headline : '',
    d.streak > 0 ? `${d.streak}일 연속 학습 중 — 오늘의 퀴즈로 이어가요!` : '오늘의 퀴즈를 풀고 스트릭을 시작해요!',
    d.appUrl ? `앱 열기: ${d.appUrl}` : '',
  ].filter(Boolean).join('\n');
}
