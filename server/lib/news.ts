import type { NewsItem } from './types';
import { fetchWithTimeout } from './http';

const ENTITIES: Record<string, string> = { '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'", '&apos;': "'", '&nbsp;': ' ' };

function decode(s: string): string {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&(amp|lt|gt|quot|apos|nbsp|#39);/g, (m) => ENTITIES[m] ?? m)
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

function tag(xml: string, name: string): string | null {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? decode(m[1]) : null;
}

/** Google News RSS 응답을 파싱한다 (기사 제목·언론사·시각·링크만 사용, 본문은 가져오지 않음). */
export function parseNewsRss(xml: string, now: number, maxAgeDays = 7): NewsItem[] {
  const items = xml.split('<item>').slice(1).map((chunk) => chunk.split('</item>')[0]);
  const out: NewsItem[] = [];
  for (const it of items) {
    const rawTitle = tag(it, 'title');
    const link = tag(it, 'link');
    const pub = tag(it, 'pubDate');
    const source = tag(it, 'source');
    if (!rawTitle || !link || !pub) continue;
    const publishedAt = Date.parse(pub);
    if (!Number.isFinite(publishedAt) || now - publishedAt > maxAgeDays * 86400000) continue;
    // 제목 끝의 " - 언론사" 제거
    const title = source && rawTitle.endsWith(` - ${source}`) ? rawTitle.slice(0, -(source.length + 3)) : rawTitle;
    out.push({ title, source: source ?? '출처 미상', publishedAt, link });
  }
  out.sort((a, b) => b.publishedAt - a.publishedAt);
  return out;
}

export async function fetchNews(query: string): Promise<{ items: NewsItem[]; error: string | null }> {
  const url = `https://news.google.com/rss/search?q=${encodeURIComponent(`"${query}" when:3d`)}&hl=ko&gl=KR&ceid=KR:ko`;
  try {
    const res = await fetchWithTimeout(url, { headers: { 'User-Agent': 'Mozilla/5.0 (parallel-bank)' } }, 8000);
    if (!res.ok) return { items: [], error: `기사 검색 응답 오류(${res.status})` };
    const xml = await res.text();
    return { items: parseNewsRss(xml, Date.now(), 4).slice(0, 5), error: null };
  } catch {
    return { items: [], error: '기사 검색 서비스에 연결하지 못했어요.' };
  }
}
