/**
 * 결제 문자 개인정보 마스킹 (기획서 「결제 문자 개인정보 처리」 2단계).
 * 외부 LLM을 부르기 전에 계좌·카드 번호, 전화번호, 주민번호 형식, 사람 이름으로 보이는 거래 상대방을 가린다.
 * 금액, 날짜, 시각, 가맹점, 거래 후 잔액은 남긴다.
 *
 * 클라이언트에서 먼저 가리고 사용자가 'AI에게 보낼 문장'을 확인·수정한 뒤 보낸다.
 * 서버(/api/ai/parseSpend)는 받은 문자열을 한 번 더 가린 다음에만 모델을 부른다.
 */

export type MaskKind = 'rrn' | 'phone' | 'card' | 'account' | 'digits' | 'name' | 'email';

export const MASK_TOKEN: Record<MaskKind, string> = {
  rrn: '[주민번호]',
  phone: '[전화번호]',
  card: '[카드번호]',
  account: '[계좌번호]',
  digits: '[번호]',
  name: '[이름]',
  email: '[이메일]',
};

export interface MaskHit {
  kind: MaskKind;
  /** 가린 원래 글자 수 (원문 자체는 남기지 않는다) */
  length: number;
}

export interface MaskResult {
  text: string;
  hits: MaskHit[];
}

/** 이름 자리 바로 앞뒤에 오는 말 */
const NAME_BEFORE = /(보낸\s?분|받는\s?분|예금주|입금자|송금인|수취인|성명|고객|님께서)\s*[:：]?\s*/;
const NAME_AFTER = /(님|씨|입금|출금|송금|이체|보냄|받음|잔액)/;
/** 이름처럼 보이지만 이름이 아닌 말 */
const NOT_NAME = new Set([
  '급여', '월급', '용돈', '이자', '체크', '신용', '카드', '자동', '타행', '대체', '출금', '입금', '이체', '송금', '월세', '관리비', '통신비', '적금', '예금',
  '결제', '승인', '취소', '잔액', '누적', '일시불', '할부', '해외', '국내', '현금', '인출', '환불', '알바비', '상여', '정산', '대금', '카드대금', '납부',
  '모바일', '인터넷', '스마트', '오픈', '뱅킹', '펌뱅킹', '창구', '무통장', '본인', '가족', '부모', '엄마', '아빠', '학원비', '등록금', '보험료', '공과금',
  '신한', '국민', '우리', '하나', '농협', '기업', '카카오', '토스', '케이', '삼성', '현대', '롯데', '비씨', '씨티', '새마을', '우체국', '수협', '신협',
]);

const RULES: { kind: MaskKind; re: RegExp }[] = [
  { kind: 'email', re: /[^\s@()<>\[\]]+@[\w-]+\.[\w.-]+/g },
  { kind: 'rrn', re: /(?<!\d)\d{6}\s?[-–]\s?[1-4*][\d*]{6}(?!\d)/g },
  { kind: 'phone', re: /(?<![\d*])(?:\+82[-\s]?)?0(?:1[016789]|2|[3-6]\d|70)[-.\s]?[\d*]{3,4}[-.\s]?[\d*]{4}(?![\d*])/g },
  // 카드번호: 4-4-4-(1~4) 묶음, 일부가 *로 가려져 있어도
  { kind: 'card', re: /(?<![\d*])[\d*]{4}[-\s][\d*]{4}[-\s][\d*]{4}[-\s]?[\d*]{1,4}(?![\d*])/g },
  // 계좌번호: 하이픈으로 이은 숫자 묶음 3개 이상(일부 * 포함)
  { kind: 'account', re: /(?<![\d*,])[\d*]{2,6}-[\d*]{2,6}-[\d*]{2,8}(?:-[\d*]{1,3})?(?![\d*])/g },
  // 금액이 아닌 긴 숫자열(10자리 이상, 콤마 없음)
  { kind: 'account', re: /(?<![\d,.*])\d{10,16}(?![\d,]|\s?원)/g },
  // 괄호 안 카드·계좌 끝자리: (1234) (12*4) (끝자리 5678)
  { kind: 'digits', re: /\((?:끝자리\s?)?[\d*]{3,4}\)/g },
  // 별표가 섞인 번호 조각: 1234**** / ***-**-1234 / 51**
  { kind: 'digits', re: /(?<![\d,])(?:\d{2,}\*{2,}[\d*]*|\*{2,}[\d*-]*\d{2,}[\d*]*)(?![\d,]|\s?원)/g },
];

/** 흔한 성 (입출금 문자의 거래 상대방 이름 찾기) */
const SURNAMES = '김|이|박|최|정|강|조|윤|장|임|한|오|서|신|권|황|안|송|류|유|전|홍|고|문|양|손|배|백|허|남|심|노|하|곽|성|차|주|우|구|민|진|나|엄|채|원|천|방|공|현|함|변|염|여|추|도|석|선|설|마|길|연|위|표|명|기|반|왕|금|옥|육|인|맹|제|모|탁|국|어|은|편|용|예|봉|경|남궁|황보|제갈|선우|독고';

/** 김*현님, 홍*동, 이** 처럼 가운데를 가린 이름 */
const PARTIAL_NAME = /(?<![가-힣])[가-힣][*＊○●][가-힣*＊○●]?(?:님|씨)?(?![가-힣])/g;

function maskNames(text: string, hits: MaskHit[]): string {
  let out = text.replace(PARTIAL_NAME, (m) => {
    hits.push({ kind: 'name', length: m.length });
    return MASK_TOKEN.name;
  });
  // 보낸분 홍길동 / 예금주: 홍길동
  out = out.replace(new RegExp(NAME_BEFORE.source + '([가-힣]{2,4})(?![가-힣])', 'g'), (m, _lead: string, name: string) => {
    if (NOT_NAME.has(name)) return m;
    hits.push({ kind: 'name', length: name.length });
    return m.replace(name, MASK_TOKEN.name);
  });
  // 홍길동님 / 홍길동 입금 / 홍길동 이체 (줄 안에서 앞이 공백·줄 시작·구분자)
  out = out.replace(new RegExp('(^|[\\s/|:,\\]\\)])([가-힣]{2,4})(\\s?)' + NAME_AFTER.source, 'gm'), (m, pre: string, name: string, sp: string, post: string) => {
    if (NOT_NAME.has(name) || /(카드|은행|뱅크|페이|마트|점|센터)$/.test(name)) return m;
    // 입금·출금 앞 단어가 가게 이름일 수 있어 '님/씨'가 아닌 경우엔 2~3글자만 이름으로 본다
    if (post !== '님' && post !== '씨' && name.length > 3) return m;
    hits.push({ kind: 'name', length: name.length });
    return `${pre}${MASK_TOKEN.name}${sp}${post}`;
  });
  // 계좌 입출금 문자에서 줄·공백으로 홀로 떨어진 성+이름 (홍길동, 남궁민)
  if (/(입금|출금|이체|송금|보냈|받았)/.test(out)) {
    out = out.replace(new RegExp(`(^|[\\s/|])((?:${SURNAMES})[가-힣]{1,2})(?=$|[\\s/|])`, 'gm'), (m, pre: string, name: string) => {
      if (NOT_NAME.has(name) || /(카드|은행|뱅크|페이|마트|점|비|료|금)$/.test(name)) return m;
      hits.push({ kind: 'name', length: name.length });
      return `${pre}${MASK_TOKEN.name}`;
    });
  }
  return out;
}

export function maskText(input: string, extra: string[] = []): MaskResult {
  const hits: MaskHit[] = [];
  let text = input;
  for (const r of RULES) {
    text = text.replace(r.re, (m) => {
      if (r.kind === 'account' && /^\d{4}-\d{2}-\d{2}$/.test(m)) return m; // 날짜
      hits.push({ kind: r.kind, length: m.length });
      return MASK_TOKEN[r.kind];
    });
  }
  text = maskNames(text, hits);
  // 사용자가 직접 더 가린 말
  for (const w of extra.map((x) => x.trim()).filter((x) => x.length >= 2)) {
    if (!text.includes(w)) continue;
    hits.push({ kind: 'name', length: w.length });
    text = text.split(w).join(MASK_TOKEN.name);
  }
  return { text, hits };
}

/** 마스킹 뒤에도 남은 개인정보 흔적이 있는지 (서버 최종 점검·테스트용) */
export function looksSensitive(text: string): boolean {
  return RULES.some((r) => new RegExp(r.re.source, r.re.flags.replace('g', '')).test(text)) || new RegExp(PARTIAL_NAME.source).test(text);
}

/**
 * 문자 형식 키. 같은 은행·카드사의 같은 종류 문자는 한 번 승인하면 다음부터 자동 마스킹 후 바로 보낸다.
 * 예) "신한카드|승인", "KB국민|입금"
 */
export function formatKey(text: string): string {
  const issuer = text.match(/(카카오뱅크|토스뱅크|케이뱅크|신한|KB국민|국민|KB|삼성|현대|롯데|하나|우리|농협|NH|비씨|BC|카카오페이|토스|씨티|IBK|기업|새마을|우체국|SC제일)/i)?.[1] ?? '기타';
  const kind = text.match(/(승인취소|취소|승인|입금|출금|이체|결제|대금)/)?.[1] ?? '기타';
  const card = /카드|체크/.test(text) ? '카드' : /은행|뱅크|입금|출금/.test(text) ? '계좌' : '';
  return `${issuer.toUpperCase()}|${card}|${kind}`;
}
