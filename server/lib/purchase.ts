import express from 'express';
import { z } from 'zod';
import { aiConfigured } from './ai';
import { ApiError, methodNotAllowed, route } from './http';
import { fetchWithTimeout } from './http';
import { rateLimit } from './rateLimit';

/**
 * 구매 보조 API
 *  POST /api/purchase/ocr    사진 → 금액·상품명 (ANTHROPIC_API_KEY 필요, 없으면 503 → 앱이 브라우저 OCR로 대체)
 *  GET  /api/purchase/price  상품명 → 최저가 (NAVER_CLIENT_ID/SECRET 필요, 없으면 검색 링크만)
 * 사진은 판독에만 쓰고 저장하지 않는다.
 */

const OcrBody = z.object({
  image: z.string().min(100).max(4_000_000),
  mediaType: z.enum(['image/jpeg', 'image/png', 'image/webp']).default('image/jpeg'),
});

const OcrOut = z.object({
  kind: z.enum(['receipt', 'price_tag', 'product_page', 'other']).catch('other'),
  name: z.string().max(60).nullable().optional(),
  store: z.string().max(60).nullable().optional(),
  amount: z.number().int().positive().max(100_000_000).nullable().optional(),
  candidates: z.array(z.number().int().positive()).max(6).optional(),
});

export async function ocrWithClaude(image: string, mediaType: string) {
  const system = [
    '사진 속 구매 정보를 읽어 JSON 하나만 답하세요. 설명·마크다운 금지.',
    '형식: {"kind":"receipt|price_tag|product_page|other","name":string|null,"store":string|null,"amount":number|null,"candidates":number[]}',
    'amount: 영수증이면 최종 결제(합계) 금액, 가격표·상품 페이지면 실제로 낼 판매가(할인가). 원 단위 정수.',
    'name: 상품이 하나면 그 상품명(브랜드+모델, 30자 이내). 영수증에 여러 품목이면 가게 이름 또는 대표 품목.',
    'candidates: 사진에 보이는 다른 금액 후보 최대 4개(큰 순).',
    '읽을 수 없으면 null. 사진에 없는 숫자를 만들지 마세요.',
  ].join('\n');
  const res = await fetchWithTimeout(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY!, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.ANTHROPIC_MODEL ?? 'claude-haiku-5-5',
        max_tokens: 300,
        system,
        messages: [{ role: 'user', content: [{ type: 'image', source: { type: 'base64', media_type: mediaType, data: image } }, { type: 'text', text: '이 사진의 구매 금액과 상품명을 읽어주세요.' }] }],
      }),
    },
    20000,
  );
  if (!res.ok) throw new ApiError(502, 'ocr_failed', '사진을 읽지 못했어요. 잠시 후 다시 시도해 주세요.', true);
  const j = (await res.json()) as { content?: { type: string; text?: string }[] };
  const text = j.content?.find((c) => c.type === 'text')?.text ?? '';
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new ApiError(502, 'ocr_failed', '사진에서 금액을 찾지 못했어요.', true);
  const out = OcrOut.parse(JSON.parse(m[0]));
  const candidates = [...new Set([...(out.amount ? [out.amount] : []), ...(out.candidates ?? [])])].slice(0, 4);
  return { kind: out.kind, name: out.name ?? undefined, store: out.store ?? undefined, amount: out.amount ?? undefined, candidates };
}

/* ── 최저가 ── */
export interface PriceItem {
  title: string;
  price: number;
  mall: string;
  link: string;
  image?: string;
}

export function searchLinks(q: string) {
  const e = encodeURIComponent(q);
  return [
    { label: '네이버쇼핑', url: `https://search.shopping.naver.com/search/all?query=${e}&sort=price_asc` },
    { label: '다나와', url: `https://search.danawa.com/dsearch.php?query=${e}&sort=priceASC` },
    { label: '쿠팡', url: `https://www.coupang.com/np/search?q=${e}&sorter=salePriceAsc` },
  ];
}

export function naverConfigured() {
  return !!(process.env.NAVER_CLIENT_ID && process.env.NAVER_CLIENT_SECRET);
}

/** 액세서리·부품처럼 너무 싼 결과를 빼고 가격순 정렬 (중앙값의 35% 미만 제외) */
export function pickLowest(items: PriceItem[]): { items: PriceItem[]; median?: number } {
  const valid = items.filter((i) => i.price > 0);
  if (!valid.length) return { items: [] };
  const sorted = [...valid].sort((a, b) => a.price - b.price);
  const median = sorted[Math.floor(sorted.length / 2)].price;
  const kept = sorted.filter((i) => i.price >= median * 0.35);
  return { items: kept.slice(0, 5), median };
}

const cache = new Map<string, { at: number; data: unknown }>();

async function naverShop(q: string): Promise<PriceItem[]> {
  const url = `https://openapi.naver.com/v1/search/shop.json?query=${encodeURIComponent(q)}&display=30&sort=sim&exclude=used:rental`;
  const res = await fetchWithTimeout(url, { headers: { 'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID!, 'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET! } }, 8000);
  if (!res.ok) throw new ApiError(502, 'price_failed', '가격을 불러오지 못했어요.', true);
  const j = (await res.json()) as { items?: { title: string; lprice: string; mallName: string; link: string; image?: string }[] };
  const strip = (s: string) => s.replace(/<[^>]+>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').trim();
  return (j.items ?? []).map((i) => ({ title: strip(i.title), price: Number(i.lprice), mall: i.mallName || '네이버쇼핑', link: i.link, image: i.image }));
}

export function purchaseRouter() {
  const r = express.Router();
  r.use(express.json({ limit: '4mb' }));

  r.route('/ocr')
    .post(
      rateLimit('purchase-ocr', 20, 10 * 60_000),
      route(async (req, res) => {
        if (!aiConfigured()) throw new ApiError(503, 'ai_not_configured', 'AI 판독이 설정되지 않았어요. 기기에서 직접 읽을게요.');
        const body = OcrBody.parse(req.body);
        res.json({ result: await ocrWithClaude(body.image, body.mediaType) });
      }),
    )
    .all(methodNotAllowed(['POST']));

  r.route('/price')
    .get(
      rateLimit('purchase-price', 60, 10 * 60_000),
      route(async (req, res) => {
        const q = z.string().trim().min(2).max(60).parse(req.query.q);
        const links = searchLinks(q);
        if (!naverConfigured()) return res.json({ configured: false, query: q, items: [], links });
        const hit = cache.get(q);
        if (hit && Date.now() - hit.at < 30 * 60_000) return res.json(hit.data);
        const { items, median } = pickLowest(await naverShop(q));
        const data = { configured: true, query: q, items, lowest: items[0], median, links };
        cache.set(q, { at: Date.now(), data });
        if (cache.size > 500) cache.delete(cache.keys().next().value!);
        res.json(data);
      }),
    )
    .all(methodNotAllowed(['GET']));

  return r;
}
