import { CATEGORIES } from '../categories';
import type { Classification } from './types';

/**
 * 상품명 → 카테고리 규칙 기반 분류 (모델이 없을 때의 기준선).
 * 팀원 TF-IDF + 로지스틱 회귀 모델이 붙으면 같은 Classification 모양으로 교체된다.
 * 1순위: 내가 전에 직접 고친 분류(memory) → 2순위: 키워드 사전
 */
const KEYWORDS: Record<string, string[]> = {
  식비: ['밥', '점심', '저녁', '아침', '배달', '치킨', '피자', '떡볶이', '마라탕', '국밥', '라면', '편의점', '도시락', '김밥', '버거', '햄버거', '초밥', '고기', '삼겹살', '술', '맥주', '회식', '식당', '배민', '쿠팡이츠', '요기요', '샐러드', '분식', '족발'],
  카페: ['커피', '카페', '아메리카노', '라떼', '스타벅스', '스벅', '메가커피', '빽다방', '투썸', '디저트', '케이크', '빵', '베이커리', '음료', '스무디', '버블티'],
  쇼핑: ['다이소', '올리브영', '쿠팡', '화장품', '향수', '선물', '키보드', '마우스', '이어폰', '에어팟', '아이패드', '노트북', '태블릿', '충전기', '케이스', '전자', '가전', '굿즈', '앨범', '문구', '인형'],
  패션: ['옷', '운동화', '신발', '스니커즈', '자켓', '재킷', '코트', '패딩', '니트', '셔츠', '바지', '청바지', '치마', '원피스', '가방', '모자', '양말', '무신사', '지그재그', '에이블리', '나이키', '아디다스', '뉴발란스', '후드', '맨투맨', '안경', '액세서리', '반지', '목걸이'],
  교통: ['택시', '버스', '지하철', '기차', 'ktx', 'srt', '주유', '기름', '따릉이', '킥보드', '카카오t', '교통', '톨비', '주차'],
  '문화·여가': ['영화', 'cgv', '메가박스', '롯데시네마', '콘서트', '공연', '뮤지컬', '전시', '티켓', '여행', '숙소', '호텔', '항공', '비행기', '노래방', 'pc방', '게임', '스팀', '책', '도서', '헬스', '필라테스', '요가', '클라이밍', '볼링', '방탈출'],
  구독: ['넷플릭스', '유튜브', '프리미엄', '멜론', '스포티파이', '디즈니', '티빙', '웨이브', '왓챠', '구독', '쿠팡와우', '네이버플러스', 'chatgpt', '클라우드', 'icloud'],
  생활: ['휴지', '세제', '샴푸', '생필품', '마트', '이마트', '홈플러스', '약국', '병원', '약', '미용실', '네일', '세탁', '수리', '청소', '관리비', '통신', '전기', '가스'],
  경조사: ['축의금', '조의금', '부조', '결혼', '돌잔치', '생일선물', '경조사', '화환'],
};

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, '');

export function memoryKey(name: string): string {
  return norm(name);
}

export function ruleClassify(name: string, memory: Record<string, string> = {}): Classification | null {
  const key = norm(name);
  if (!key) return null;
  const remembered = memory[key];
  if (remembered && (CATEGORIES as readonly string[]).includes(remembered)) {
    return { category: remembered, confidence: 1, engine: 'memory', candidates: [{ category: remembered, score: 1 }] };
  }
  const scores = new Map<string, number>();
  for (const [cat, words] of Object.entries(KEYWORDS)) {
    let s = 0;
    for (const w of words) {
      const nw = norm(w);
      if (key.includes(nw)) s += 1 + nw.length / 4; // 긴 키워드가 맞을수록 확신↑
    }
    if (s > 0) scores.set(cat, s);
  }
  // 이전에 고친 이름과 글자가 많이 겹치면 그 분류에도 점수
  for (const [k, cat] of Object.entries(memory)) {
    if (k.length >= 2 && (key.includes(k) || k.includes(key))) scores.set(cat, (scores.get(cat) ?? 0) + 1.5);
  }
  if (!scores.size) return { category: '기타', confidence: 0.2, engine: 'rule', candidates: [] };
  const ranked = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  const total = ranked.reduce((s, [, v]) => s + v, 0);
  const [top, topScore] = ranked[0];
  // 한 카테고리에 몰릴수록, 점수가 클수록 확신↑
  const share = topScore / total;
  const confidence = Math.min(0.95, share * (1 - Math.exp(-topScore / 1.2)));
  return {
    category: top,
    confidence: Number(confidence.toFixed(2)),
    engine: 'rule',
    candidates: ranked.slice(0, 3).map(([category, v]) => ({ category, score: Number((v / total).toFixed(2)) })),
  };
}
