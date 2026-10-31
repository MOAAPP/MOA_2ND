/**
 * 결제 문자 개인정보 마스킹 (기획서 '결제 문자 개인정보 처리' 2단계).
 *
 * 외부 LLM을 부르기 전에 정규식으로 계좌·카드 번호, 전화번호, 주민번호 형식, 사람 이름으로 보이는
 * 거래 상대방을 가린다. 금액, 날짜·시각, 가맹점, 거래 후 잔액만 남긴다.
 * 정규식이 다 찾지 못하므로, 처음 보는 문자 형식이면 사용자가 '보낼 문장'을 확인·수정한 뒤에만 보낸다.
 * 원문은 저장하지 않는다 — 이 함수도 원문을 어디에도 남기지 않는다.
 */

export interface MaskResult {
  text: string;
  /** 가린 종류별 개수 (원문 값은 담지 않는다) */
  counts: Record<MaskKind, number>;
  /** 문자 형식 서명 — 사용자가 한 번 승인한 형식이면 확인 없이 자동 전송 */
  signature: string;
}

export type MaskKind = 'rrn' | 'card' | 'account' | 'phone' | 'name' | 'email';

const TOKEN: Record<MaskKind, string> = {
  rrn: '[주민번호]',
  card: '[카드번호]',
  account: '[계좌번호]',
  phone: '[전화번호]',
  name: '[이름]',
  email: '[이메일]',
};

// 금액(원 붙은 숫자), 날짜(10/29, 2026.10.29), 시각(13:20)은 숫자 마스킹 대상이 아니다.
const RRN = /(?<!\d)\d{6}\s?-\s?[1-8][\d*]{6}(?!\d)/g;
const EMAIL = /[^\s@\[\]()]+@[\w-]+(?:\.[\w-]+)+/g;
const PHONE = /(?<![\d-])(?:\+82[\s-]?)?0(?:1[016789]|2|[3-6][1-5]|70)[\s.-]?[\d*]{3,4}[\s.-]?[\d*]{4}(?![\d])/g;
/** 카드 번호: 4자리 묶음 3~4개, 일부가 *로 가려진 형식 포함 (1234-56**-****-7890, 5310*1**) */
const CARD = /(?<![\d*])(?:[\d*]{4}[\s-]){2,3}[\d*]{2,4}(?![\d*])|(?<![\d*])\d{4}\*[\d*]{3,}(?![\d*])/g;
/** 계좌 번호: 하이픈으로 나뉜 숫자 3~4묶음, 또는 10~16자리 연속 숫자 ('원'이 바로 붙지 않음) */
const ACCOUNT = /(?<![\d*,])(?:[\d*]{2,6}-){2,3}[\d*]{1,8}(?![\d*원])|(?<![\d,])\d{10,16}(?![\d,원])/g;
/** 이름을 가린 형식: 홍*동, 김**, 이*  */
const MASKED_NAME = /(?<![가-힣])[가-힣][*＊]{1,3}[가-힣]?(?=님|[^가-힣]|$)/g;
/** '홍길동님', '홍길동 님' */
const HONORIFIC = /(?<![가-힣])[가-힣]{2,4}(?=\s?님)/g;

const SURNAMES = '김이박최정강조윤장임한오서신권황안송류전홍고문양손배백허유남심노하곽성차주우구민진지엄채원천방공현함변염여추도소석선설마길연위표명기반왕금옥육인맹제모탁국어은편용예봉경사부황보남궁제갈선우독고';
const TRANSFER_KW = '(?:입금|출금|이체|송금|받음|보냄|자동이체)';
/** 입출금 문자에서 키워드 바로 앞·뒤의 2~4글자 한글 = 거래 상대방 이름일 가능성이 높다 */
const NAME_NEAR_KW = new RegExp(`(?<![가-힣])([${SURNAMES}][가-힣]{1,3})(?=\\s*${TRANSFER_KW})|(?<=${TRANSFER_KW}\\s{0,2})([${SURNAMES}][가-힣]{1,3})(?![가-힣])`, 'g');
/** 입출금 문자(승인 문자가 아닌 것)에서는 키워드와 떨어져 있어도 성씨로 시작하는 2~4글자 한글을 이름으로 본다 */
const TRANSFER_MSG = /(?:입금|출금|이체|송금)/;
const CARD_APPROVAL = /(?:승인|일시불|할부|취소)/;
const LOOSE_NAME = new RegExp(`(?<![가-힣A-Za-z0-9])[${SURNAMES}][가-힣]{1,3}(?![가-힣A-Za-z0-9])`, 'g');
/** 이름처럼 생겼어도 가리면 안 되는 금융 용어 */
const KEEP = new Set(['잔액', '누적', '승인', '취소', '일시불', '할부', '체크', '신용', '결제', '입금', '출금', '이체', '송금', '자동이체', '해외', '국내', '이용', '금액', '합계', '대금', '카드', '은행', '저축', '적금', '예금', '급여', '용돈', '월세', '관리비', '통신비', '현금', '인출', '수수료', '이자', '환불', '체크카드', '신용카드', '우리', '국민', '신한', '하나', '농협', '기업', '카카오', '토스', '케이', '새마을', '우체국', '수협', '부산', '대구', '경남', '광주', '전북', '제주', '씨티', '스탠다드', '우리은행', '국민은행', '신한은행', '하나은행', '농협은행', '기업은행', '카카오뱅크', '토스뱅크', '케이뱅크', '우체국', '새마을금고', '고객센터', '본인확인', '본인', '문의', '안내', '담당', '거래', '정상', '처리', '완료', '계좌', '받은', '보낸', '내역', '오늘', '내일', '어제', '자동', '정기', '전자', '금융', '해지', '만기', '대출', '상환', '연체', '청구', '예정', '납부', '공과금', '보험', '보험료', '관리', '편의점', '배달', '교통', '주유', '병원', '약국']);

export function maskPayment(raw: string): MaskResult {
  const counts: Record<MaskKind, number> = { rrn: 0, card: 0, account: 0, phone: 0, name: 0, email: 0 };
  const rep = (kind: MaskKind) => () => {
    counts[kind]++;
    return TOKEN[kind];
  };
  let text = raw;
  text = text.replace(EMAIL, rep('email'));
  text = text.replace(RRN, rep('rrn'));
  text = text.replace(PHONE, rep('phone'));
  text = text.replace(CARD, rep('card'));
  text = text.replace(ACCOUNT, rep('account'));
  text = text.replace(MASKED_NAME, rep('name'));
  text = text.replace(HONORIFIC, (m) => (KEEP.has(m) ? m : rep('name')()));
  text = text.replace(NAME_NEAR_KW, (m) => (KEEP.has(m) ? m : rep('name')()));
  if (TRANSFER_MSG.test(text) && !CARD_APPROVAL.test(text)) text = text.replace(LOOSE_NAME, (m) => (KEEP.has(m) ? m : rep('name')()));
  return { text, counts, signature: formatSignature(raw) };
}

/** 사용자가 직접 더 가린 부분을 적용한다 (보낼 문장 확인 단계) */
export function maskRanges(text: string, ranges: { start: number; end: number }[]): string {
  let out = text;
  for (const r of [...ranges].sort((a, b) => b.start - a.start)) out = out.slice(0, r.start) + '[가림]' + out.slice(r.end);
  return out;
}

/**
 * 문자 형식 서명: 숫자·한글 덩어리를 자리표시로 바꾸고 기관명(대괄호·앞부분)과 구조만 남긴다.
 * 같은 은행·카드사의 같은 문자 형식이면 같은 값이 나온다.
 */
export function formatSignature(raw: string): string {
  const lines = raw.replace(/\[Web발신\]/g, '').trim().split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const head = (lines[0] ?? '').replace(/[\d*,]+/g, '#').replace(/\s+/g, ' ').slice(0, 12);
  const shape = lines.map((l) => l.replace(/[가-힣A-Za-z0-9*]+/g, 'w').replace(/\s+/g, ' ')).join('/');
  return `${head}|${shape}`;
}

/** 사용자가 이 형식을 승인했으면 확인 없이 자동 마스킹 후 전송 (설정에서 '매번 확인' 가능) */
export function needsConfirm(signature: string, approved: Set<string>, alwaysConfirm = false): boolean {
  return alwaysConfirm || !approved.has(signature);
}
