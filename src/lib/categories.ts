export const CATEGORIES = ['식비', '카페', '쇼핑', '패션', '교통', '문화·여가', '구독', '생활', '경조사', '기타'] as const;

export const CHOICE_LABEL = {
  buy: '샀다',
  skip: '안 샀다',
  delay: '미뤘다',
  alt: '더 싼 걸 샀다',
} as const;

/** 평행세계에서 '다른 선택을 한 나'를 부르는 이름 */
export const WORLD_NAME = {
  buy: '산 나',
  skip: '안 산 나',
  delay: '미룬 나',
  alt: '더 싼 걸 산 나',
} as const;

export const IF_NAME = {
  buy: '샀다면',
  skip: '안 샀다면',
  delay: '미뤘다면',
  alt: '더 싼 걸 샀다면',
} as const;
