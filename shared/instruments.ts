/**
 * 지원 종목 목록 (KRX 유가증권시장 상장 종목코드 — 2026년 기준 확인된 매핑).
 * 사용자가 직접 코드를 입력하지 않고 이 목록에서만 고른다.
 */
export interface Instrument {
  code: string;
  name: string;
  type: 'stock' | 'etf';
  market: 'KOSPI';
  sector: string;
  /** 같이 움직이기 쉬운 묶음(업종 비교용) */
  group: string;
  aliases: string[];
  /** 카드뉴스 사진 검색어(영문, 자료 사진용) */
  photoTopics: string[];
  /** 한 줄 설명 */
  summary: string;
}

export const INSTRUMENTS: Instrument[] = [
  {
    code: '005930', group: 'semis', name: '삼성전자', type: 'stock', market: 'KOSPI', sector: '반도체·전자',
    aliases: ['삼전', 'samsung', '삼성'],
    photoTopics: ['semiconductor wafer', 'microchip circuit board', 'smartphone electronics'],
    summary: '메모리 반도체와 스마트폰·가전을 만드는 회사',
  },
  {
    code: '000660', group: 'semis', name: 'SK하이닉스', type: 'stock', market: 'KOSPI', sector: '반도체',
    aliases: ['하이닉스', 'hynix', 'sk'],
    photoTopics: ['memory chip', 'semiconductor cleanroom', 'data center servers'],
    summary: 'D램·낸드 등 메모리 반도체 전문 회사',
  },
  {
    code: '005380', group: 'auto', name: '현대차', type: 'stock', market: 'KOSPI', sector: '자동차',
    aliases: ['현대자동차', 'hyundai', '현대'],
    photoTopics: ['car factory assembly line', 'electric car charging', 'cars highway'],
    summary: '완성차와 전기차를 만드는 회사',
  },
  {
    code: '000270', group: 'auto', name: '기아', type: 'stock', market: 'KOSPI', sector: '자동차',
    aliases: ['kia', '기아차'],
    photoTopics: ['car factory assembly line', 'electric vehicle', 'car dealership'],
    summary: '완성차와 전기차를 만드는 회사',
  },
  {
    code: '035420', group: 'platform', name: 'NAVER', type: 'stock', market: 'KOSPI', sector: '인터넷·플랫폼',
    aliases: ['네이버', 'naver'],
    photoTopics: ['search engine laptop', 'online shopping smartphone', 'data center'],
    summary: '검색·커머스·콘텐츠 플랫폼 회사',
  },
  {
    code: '035720', group: 'platform', name: '카카오', type: 'stock', market: 'KOSPI', sector: '인터넷·플랫폼',
    aliases: ['kakao', '카톡'],
    photoTopics: ['messaging app smartphone', 'mobile payment', 'people using phones'],
    summary: '메신저·결제·콘텐츠 플랫폼 회사',
  },
  {
    code: '373220', group: 'battery', name: 'LG에너지솔루션', type: 'stock', market: 'KOSPI', sector: '2차전지',
    aliases: ['엘지에너지솔루션', 'lg엔솔', '엔솔', 'lg'],
    photoTopics: ['lithium battery cells', 'electric car battery', 'battery factory'],
    summary: '전기차용 배터리를 만드는 회사',
  },
  {
    code: '207940', group: 'bio', name: '삼성바이오로직스', type: 'stock', market: 'KOSPI', sector: '바이오',
    aliases: ['삼바', '삼성바이오'],
    photoTopics: ['biotech laboratory', 'pharmaceutical production', 'scientist microscope'],
    summary: '바이오 의약품 위탁생산(CDMO) 회사',
  },
  {
    code: '068270', group: 'bio', name: '셀트리온', type: 'stock', market: 'KOSPI', sector: '바이오',
    aliases: ['celltrion'],
    photoTopics: ['biotech laboratory', 'medicine vials', 'pharmaceutical research'],
    summary: '바이오시밀러 의약품 회사',
  },
  {
    code: '105560', group: 'finance', name: 'KB금융', type: 'stock', market: 'KOSPI', sector: '금융',
    aliases: ['국민은행', 'kb'],
    photoTopics: ['bank building', 'banking finance', 'city financial district'],
    summary: '은행·카드·증권을 가진 금융지주',
  },
  {
    code: '005490', group: 'steel', name: 'POSCO홀딩스', type: 'stock', market: 'KOSPI', sector: '철강·소재',
    aliases: ['포스코', 'posco', '포스코홀딩스'],
    photoTopics: ['steel mill', 'molten steel', 'industrial factory'],
    summary: '철강과 2차전지 소재 사업 지주회사',
  },
  {
    code: '069500', group: 'etf-kr', name: 'KODEX 200', type: 'etf', market: 'KOSPI', sector: '국내 지수 ETF',
    aliases: ['코덱스200', 'kodex', '코스피200'],
    photoTopics: ['seoul skyline', 'stock market board', 'korea business district'],
    summary: '코스피200 지수를 따라가는 ETF',
  },
  {
    code: '360750', group: 'etf-us', name: 'TIGER 미국S&P500', type: 'etf', market: 'KOSPI', sector: '해외 지수 ETF',
    aliases: ['타이거 s&p500', 's&p500', 'sp500', '미국'],
    photoTopics: ['new york stock exchange', 'wall street', 'manhattan skyline'],
    summary: '미국 S&P500 지수를 따라가는 ETF',
  },
  {
    code: '133690', group: 'etf-us', name: 'TIGER 미국나스닥100', type: 'etf', market: 'KOSPI', sector: '해외 지수 ETF',
    aliases: ['타이거 나스닥', '나스닥100', 'nasdaq', '나스닥'],
    photoTopics: ['technology office', 'silicon valley', 'computer code screen'],
    summary: '미국 나스닥100 지수를 따라가는 ETF',
  },
];

export const INSTRUMENT_BY_CODE: Record<string, Instrument> = Object.fromEntries(INSTRUMENTS.map((i) => [i.code, i]));

export function searchInstruments(q: string): Instrument[] {
  const s = q.trim().toLowerCase().replace(/\s+/g, '');
  if (!s) return INSTRUMENTS;
  return INSTRUMENTS.filter((i) => {
    const hay = [i.name, i.code, i.sector, ...i.aliases].map((x) => x.toLowerCase().replace(/\s+/g, ''));
    return hay.some((h) => h.includes(s));
  });
}

export function yahooSymbol(code: string): string {
  return `${code}.KS`;
}

export function peersOf(code: string): Instrument[] {
  const me = INSTRUMENT_BY_CODE[code];
  if (!me) return [];
  return INSTRUMENTS.filter((i) => i.group === me.group && i.code !== code);
}

export const GROUP_LABEL: Record<string, string> = {
  semis: '반도체', auto: '자동차', platform: '인터넷 플랫폼', battery: '2차전지', bio: '바이오', finance: '금융', steel: '철강·소재', 'etf-kr': '국내 지수', 'etf-us': '미국 지수',
};
