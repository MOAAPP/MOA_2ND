import { signedPct } from '../../shared/format';
import type { Instrument } from '../../shared/instruments';
import { averageVolume, type IndexQuote, type Quote } from '../../shared/market';
import type { GlobalIndicator } from './quotes';
import type { NewsItem } from './types';

/**
 * '왜 움직였을까' 분석 엔진 — 숫자 비교는 코드로, 원인은 단정하지 않는다.
 * 1) 시장 전체(코스피)와 같은 방향인가
 * 2) 같은 업종 종목도 함께 움직였나
 * 3) 시장·업종으로 설명 안 되는 종목만의 움직임인가 → 관련 기사 제목 확인
 * 4) 전날 미국 증시·환율, 거래량
 */
export const PEER_GROUPS: Record<string, string[]> = {
  semis: ['005930', '000660'],
  autos: ['005380', '000270'],
  platform: ['035420', '035720'],
  bio: ['207940', '068270'],
  battery: ['373220', '005490'],
  us: ['360750', '133690'],
};

export function peersOf(code: string): string[] {
  for (const g of Object.values(PEER_GROUPS)) if (g.includes(code)) return g.filter((c) => c !== code);
  return [];
}

const US_SENSITIVE = new Set(['005930', '000660', '035420', '035720', '373220', '360750', '133690']);
const US_ETF = new Set(['360750', '133690']);

const NEG = ['부진', '하회', '감소', '적자', '하향', '우려', '급락', '약세', '매도', '규제', '소송', '리콜', '파업', '유상증자', '블록딜', '공매도', '쇼크', '둔화', '손실', '하락'];
const POS = ['상회', '호실적', '최대', '흑자', '수주', '계약', '상향', '자사주', '배당', '신제품', '승인', '급등', '강세', '매수', '돌파', '증가', '개선', '상승'];

export function tagHeadline(title: string): 'neg' | 'pos' | 'neutral' {
  const neg = NEG.filter((k) => title.includes(k)).length;
  const pos = POS.filter((k) => title.includes(k)).length;
  return neg > pos ? 'neg' : pos > neg ? 'pos' : 'neutral';
}

export type Strength = '강함' | '보통' | '약함';

export interface Reason {
  key: 'market' | 'sector' | 'stock' | 'us' | 'fx' | 'news' | 'volume';
  label: string;
  /** 제목·요약용 짧은 이름 */
  tag: string;
  detail: string;
  strength: Strength;
}

export interface Explanation {
  direction: 'up' | 'down' | 'flat' | 'unknown';
  pct: number | null;
  headline: string;
  facts: string[];
  reasons: Reason[];
  unknown: string | null;
  newsUsed: NewsItem[];
  summary: string;
}

export interface ExplainInput {
  inst: Instrument;
  quote: Quote;
  kospi: IndexQuote | null;
  peers: Quote[];
  global: GlobalIndicator[];
  news: NewsItem[];
}

const strength = (share: number): Strength => (share >= 0.6 ? '강함' : share >= 0.3 ? '보통' : '약함');
const sameSign = (a: number, b: number) => (a > 0 && b > 0) || (a < 0 && b < 0);

export function explainMove(input: ExplainInput): Explanation {
  const { inst, quote, kospi, peers, global, news } = input;
  const pct = quote.changePct;
  const facts: string[] = [];
  const reasons: Reason[] = [];
  if (pct === null) {
    return { direction: 'unknown', pct: null, headline: '전 거래일 가격을 확인하지 못해 비교할 수 없어요.', facts, reasons, unknown: '비교 기준이 없어요.', newsUsed: [], summary: '전 거래일 가격이 없어 원인을 분석하지 않았어요.' };
  }
  const dir: Explanation['direction'] = Math.abs(pct) < 0.3 ? 'flat' : pct > 0 ? 'up' : 'down';
  facts.push(`${inst.name} ${signedPct(pct)} (전 거래일 대비)`);

  // 1) 시장
  const m = kospi?.changePct ?? null;
  if (m !== null) {
    facts.push(`코스피 ${signedPct(m)}${kospi?.advancers != null && kospi?.decliners != null ? ` · 상승 ${kospi.advancers}종목 / 하락 ${kospi.decliners}종목` : ''}`);
    if (dir !== 'flat' && sameSign(m, pct) && Math.abs(m) >= 0.5) {
      const share = Math.min(1, Math.abs(m) / Math.abs(pct));
      reasons.push({ key: 'market', tag: dir === 'down' ? '시장 전체 약세' : '시장 전체 강세', label: dir === 'down' ? '시장 전체가 약했어요' : '시장 전체가 강했어요', detail: `코스피가 ${signedPct(m)} 움직여 많은 종목이 같은 방향이었어요.`, strength: strength(share) });
    }
  }

  // 2) 업종
  const peerPcts = peers.map((p) => ({ name: p.name, pct: p.changePct })).filter((p): p is { name: string; pct: number } => p.pct !== null);
  if (peerPcts.length) {
    const avg = peerPcts.reduce((s, p) => s + p.pct, 0) / peerPcts.length;
    facts.push(`같은 업종: ${peerPcts.map((p) => `${p.name} ${signedPct(p.pct)}`).join(', ')}`);
    if (dir !== 'flat' && sameSign(avg, pct) && Math.abs(avg) >= 0.8) {
      reasons.push({ key: 'sector', tag: `${inst.sector} 동반 ${dir === 'down' ? '하락' : '상승'}`, label: `${inst.sector} 업종이 함께 움직였어요`, detail: `비슷한 사업을 하는 종목도 평균 ${signedPct(avg)} 움직였어요. 업종 전체에 영향을 주는 소식이 있었을 수 있어요.`, strength: strength(Math.min(1, Math.abs(avg) / Math.abs(pct))) });
    }
  }

  // 3) 종목만의 움직임
  const rel = m !== null ? pct - m : null;
  const sectorExplains = reasons.some((r) => r.key === 'sector' && r.strength !== '약함');
  if (dir !== 'flat' && rel !== null && Math.abs(rel) >= 1.5 && !sectorExplains) {
    reasons.push({ key: 'stock', tag: '종목만의 움직임', label: '시장보다 훨씬 크게 움직였어요', detail: `시장 대비 ${signedPct(rel)} 차이예요. 시장·업종보다 이 회사만의 소식이 영향을 줬을 가능성이 커요.`, strength: Math.abs(rel) >= 3 ? '강함' : '보통' });
  }

  // 4) 미국 증시·환율 (직전 미국 마감)
  const ndx = global.find((g) => g.id === 'NDX');
  const spx = global.find((g) => g.id === 'SPX');
  const fx = global.find((g) => g.id === 'USDKRW');
  if (spx?.changePct != null && ndx?.changePct != null) facts.push(`직전 미국 마감: S&P500 ${signedPct(spx.changePct)}, 나스닥 ${signedPct(ndx.changePct)}`);
  if (fx?.changePct != null) facts.push(`원/달러 환율 ${Math.round(fx.value).toLocaleString('ko-KR')}원 (${signedPct(fx.changePct)})`);
  if (dir !== 'flat' && ndx?.changePct != null && US_SENSITIVE.has(inst.code) && sameSign(ndx.changePct, pct) && Math.abs(ndx.changePct) >= 1) {
    reasons.push({ key: 'us', tag: '미국 기술주 흐름', label: '전날 미국 기술주 흐름', detail: `나스닥이 ${signedPct(ndx.changePct)} 마감했어요. 기술주·반도체는 미국 증시 흐름을 따라가는 경우가 많아요.`, strength: US_ETF.has(inst.code) ? '강함' : '보통' });
  }
  if (dir !== 'flat' && fx?.changePct != null && Math.abs(fx.changePct) >= 0.4) {
    if (US_ETF.has(inst.code) && sameSign(fx.changePct, pct)) {
      reasons.push({ key: 'fx', tag: '환율', label: '환율 영향', detail: `달러가 ${fx.changePct > 0 ? '올라' : '내려'} 달러 자산을 담은 ETF 가격에 ${fx.changePct > 0 ? '플러스' : '마이너스'}로 작용했어요.`, strength: '보통' });
    } else if (!US_ETF.has(inst.code) && fx.changePct > 0 && dir === 'down') {
      reasons.push({ key: 'fx', tag: '원화 약세', label: '원화 약세', detail: '환율이 오르면(원화 약세) 외국인 투자자의 매도 부담이 커진다고 해석되기도 해요. 직접 원인인지는 확인되지 않아요.', strength: '약함' });
    }
  }

  // 거래량
  const avgVol = averageVolume(quote.candles, quote.date);
  if (quote.volume !== null && avgVol) {
    const ratio = quote.volume / avgVol;
    facts.push(`거래량 ${quote.volume.toLocaleString('ko-KR')}주 · 20일 평균의 ${ratio.toFixed(1)}배`);
    if (ratio >= 1.8 && dir !== 'flat') reasons.push({ key: 'volume', tag: '거래량 급증', label: '거래가 평소보다 많았어요', detail: `평소의 ${ratio.toFixed(1)}배가 거래돼 이번 움직임에 많은 투자자가 참여했어요.`, strength: ratio >= 3 ? '보통' : '약함' });
  }

  // 기사
  const matching = news.filter((n) => {
    const t = tagHeadline(n.title);
    return dir === 'down' ? t === 'neg' : dir === 'up' ? t === 'pos' : false;
  });
  if (matching.length && dir !== 'flat') {
    reasons.push({ key: 'news', tag: dir === 'down' ? '부정적 소식' : '긍정적 소식', label: dir === 'down' ? '부정적인 소식이 있었어요' : '긍정적인 소식이 있었어요', detail: `최근 기사 ${matching.length}건의 제목에 ${dir === 'down' ? '우려·하락' : '호재·상승'} 관련 표현이 있어요. 기사 제목 기준이며 원인으로 확정된 건 아니에요.`, strength: matching.length >= 2 ? '보통' : '약함' });
  }

  const order: Record<Strength, number> = { 강함: 0, 보통: 1, 약함: 2 };
  reasons.sort((a, b) => order[a.strength] - order[b.strength]);

  let headline: string;
  let unknown: string | null = null;
  if (dir === 'flat') {
    headline = `${inst.name} 주가는 큰 변화 없이 ${signedPct(pct)} 움직였어요.`;
  } else if (!reasons.length) {
    headline = `${inst.name} ${signedPct(pct)} — 뚜렷한 원인을 확인하지 못했어요.`;
    unknown = '시장·업종·기사에서 같은 방향의 신호를 찾지 못했어요. 특별한 소식 없이 사고팔려는 힘(수급)만으로 움직이는 날도 있어요.';
  } else {
    const top = reasons.filter((r) => r.key !== 'volume').slice(0, 2).map((r) => r.tag);
    headline = `${inst.name} ${signedPct(pct)}: ${(top.length ? top : [reasons[0].tag]).join('·')} 영향으로 보여요`;
  }
  return { direction: dir, pct, headline, facts, reasons, unknown, newsUsed: matching.length ? matching : news.slice(0, 3), summary: ruleSummary(dir, reasons, unknown) };
}

/** AI 없이 쓰는 한 줄 정리 */
export function ruleSummary(dir: Explanation['direction'], reasons: Reason[], unknown: string | null): string {
  if (dir === 'flat') return '큰 움직임이 없는 하루였어요. 이런 날은 내가 왜 이 종목을 갖고 있는지 다시 점검하기 좋아요.';
  if (!reasons.length) return unknown ?? '원인을 확인하지 못했어요.';
  const main = reasons.filter((r) => r.strength !== '약함').map((r) => r.tag);
  const minor = reasons.filter((r) => r.strength === '약함').map((r) => r.tag);
  const move = dir === 'down' ? '하락' : '상승';
  const parts = [main.length ? `${main.join('·')}의 영향이 이번 ${move}에 크게 작용한 것으로 보여요.` : `뚜렷하게 큰 요인은 없고 여러 작은 요인이 겹친 ${move}으로 보여요.`];
  if (minor.length) parts.push(`${minor.join('·')} 쪽도 일부 영향을 줬을 수 있어요.`);
  if (reasons.some((r) => r.key === 'stock')) parts.push('회사 공시나 실적 발표를 직접 확인해 보는 걸 추천해요.');
  return parts.join(' ');
}
