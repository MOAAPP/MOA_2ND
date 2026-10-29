import { api } from './api';

/**
 * 사진(영수증·가격표·상품 페이지 캡처)에서 금액·상품명 읽기.
 * 1) 서버 AI 판독(/api/purchase/ocr, ANTHROPIC_API_KEY 있을 때) — 상품명까지 정확
 * 2) 안 되면 브라우저 안에서 Tesseract OCR(한국어) — 서버로 사진을 보내지 않음
 */
export interface OcrResult {
  amount?: number;
  name?: string;
  store?: string;
  kind?: 'receipt' | 'price_tag' | 'product_page' | 'other';
  /** 금액 후보 (사용자가 고를 수 있게) */
  candidates: number[];
  engine: 'ai' | 'browser';
}

const TOTAL_WORDS = ['합계', '총액', '총 금액', '총금액', '결제금액', '결제 금액', '받을금액', '청구금액', '판매금액', '최종', '할인가', '판매가', '총결제', '결제예정', 'total'];
const SKIP_WORDS = ['부가세', '과세', '면세', '거스름', '받은금액', '카드번호', '승인번호', '사업자', '전화', 'tel', '포인트', '적립', '할부'];

function numbersIn(line: string): number[] {
  const out: number[] = [];
  const re = /(\d{1,3}(?:[,.]\d{3})+|\d{3,8})\s*(원|₩)?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line))) {
    const n = Number(m[1].replace(/[,.]/g, ''));
    if (n >= 100 && n <= 50_000_000) out.push(n);
  }
  return out;
}

/** OCR 글자에서 금액·이름 고르기 (브라우저 OCR용, 테스트 가능하게 분리) */
export function parsePurchaseText(text: string): Omit<OcrResult, 'engine'> {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
  const lower = (s: string) => s.toLowerCase();
  const scored = new Map<number, number>();
  const add = (n: number, s: number) => scored.set(n, (scored.get(n) ?? 0) + s);

  lines.forEach((l) => {
    const ll = lower(l);
    if (SKIP_WORDS.some((w) => ll.includes(w))) return;
    const nums = numbersIn(l);
    if (!nums.length) return;
    const isTotal = TOTAL_WORDS.some((w) => ll.includes(w));
    for (const n of nums) {
      let s = 1;
      if (isTotal) s += 6;
      if (/원|₩/.test(l)) s += 1.5;
      if (/\d{1,3}(,\d{3})+/.test(l)) s += 1;
      if (n % 10 === 0) s += 0.5;
      add(n, s);
    }
  });
  // 합계 단어 다음 줄에 숫자가 따로 있는 영수증
  lines.forEach((l, i) => {
    if (TOTAL_WORDS.some((w) => lower(l).includes(w)) && !numbersIn(l).length && lines[i + 1]) for (const n of numbersIn(lines[i + 1])) add(n, 6);
  });

  const ranked = [...scored.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]).map(([n]) => n);
  // 이름: 돈처럼 생긴 숫자가 없고 배송·쿠폰 같은 안내 문구가 아닌 첫 줄
  const money = /\d{1,3}(,\d{3})+|\d+\s*원/;
  const NOISE = ['배송', '쿠폰', '리뷰', '적립', '혜택', '장바구니', '구매하기', '바로구매'];
  const name = lines.find((l) => /[가-힣a-zA-Z]{2,}/.test(l) && !money.test(l) && l.length <= 30 && ![...TOTAL_WORDS, ...SKIP_WORDS, ...NOISE].some((w) => lower(l).includes(w)));
  return { amount: ranked[0], name, candidates: ranked.slice(0, 4) };
}

/** 사진을 줄여 전송량을 줄인다 (긴 변 1400px, JPEG) */
async function downscale(file: File, maxSide = 1400): Promise<{ dataUrl: string; canvas: HTMLCanvasElement }> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = () => rej(new Error('사진을 열지 못했어요. 다른 사진으로 해볼까요?'));
      i.src = url;
    });
    const k = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * k);
    canvas.height = Math.round(img.naturalHeight * k);
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), canvas };
  } finally {
    URL.revokeObjectURL(url);
  }
}

type TesseractGlobal = { createWorker: (langs: string[]) => Promise<{ recognize: (img: HTMLCanvasElement) => Promise<{ data: { text: string } }>; terminate: () => Promise<void> }> };
const TESSERACT_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js';

function loadTesseract(): Promise<TesseractGlobal> {
  const w = window as unknown as { Tesseract?: TesseractGlobal };
  if (w.Tesseract) return Promise.resolve(w.Tesseract);
  return new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = TESSERACT_SRC;
    s.async = true;
    s.onload = () => (w.Tesseract ? res(w.Tesseract) : rej(new Error('OCR 엔진을 불러오지 못했어요')));
    s.onerror = () => rej(new Error('OCR 엔진을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.'));
    document.head.appendChild(s);
  });
}

export async function readPurchaseImage(file: File, onStage?: (s: string) => void): Promise<OcrResult> {
  if (!file.type.startsWith('image/')) throw new Error('사진 파일만 읽을 수 있어요.');
  if (file.size > 15_000_000) throw new Error('15MB보다 큰 사진은 읽지 않아요.');
  onStage?.('사진 정리하는 중…');
  const { dataUrl, canvas } = await downscale(file);

  onStage?.('금액 찾는 중…');
  try {
    const r = await api<{ result: Omit<OcrResult, 'engine'> }>('/api/purchase/ocr', { method: 'POST', body: { image: dataUrl.split(',')[1], mediaType: 'image/jpeg' } });
    if (r.result && (r.result.amount || r.result.name)) return { ...r.result, candidates: r.result.candidates ?? (r.result.amount ? [r.result.amount] : []), engine: 'ai' };
  } catch {
    // AI 미설정·서버 없음·한도 초과면 브라우저 OCR로 넘어간다
  }

  onStage?.('이 기기에서 글자 읽는 중… (처음엔 10초쯤 걸려요)');
  const T = await loadTesseract();
  const worker = await T.createWorker(['kor', 'eng']);
  try {
    const { data } = await worker.recognize(canvas);
    const parsed = parsePurchaseText(data.text);
    if (!parsed.amount) throw new Error('사진에서 금액을 찾지 못했어요. 금액이 잘 보이게 다시 찍어볼까요?');
    return { ...parsed, engine: 'browser' };
  } finally {
    void worker.terminate();
  }
}

/* ── 최저가 ── */
export interface PriceItem {
  title: string;
  price: number;
  mall: string;
  link: string;
  image?: string;
}
export interface PriceResult {
  configured: boolean;
  query: string;
  items: PriceItem[];
  lowest?: PriceItem;
  median?: number;
  links: { label: string; url: string }[];
}

export function searchLinks(q: string) {
  const e = encodeURIComponent(q);
  return [
    { label: '네이버쇼핑', url: `https://search.shopping.naver.com/search/all?query=${e}&sort=price_asc` },
    { label: '다나와', url: `https://search.danawa.com/dsearch.php?query=${e}&sort=priceASC` },
    { label: '쿠팡', url: `https://www.coupang.com/np/search?q=${e}&sorter=salePriceAsc` },
  ];
}

export async function findLowestPrice(q: string): Promise<PriceResult> {
  try {
    return await api<PriceResult>(`/api/purchase/price?q=${encodeURIComponent(q)}`);
  } catch {
    return { configured: false, query: q, items: [], links: searchLinks(q) };
  }
}
