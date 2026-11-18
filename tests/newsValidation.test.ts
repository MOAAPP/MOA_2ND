import { describe, expect, it } from 'vitest';
import { parseNewsRss } from '../server/lib/news';

describe('news feed metadata validation', () => {
  it('rejects missing source, unsafe links, future dates and duplicates', () => {
    const item = (title: string, link: string, source: string, date = 'Thu, 15 Oct 2026 03:00:00 GMT') =>
      `<item><title>${title}</title><link>${link}</link><pubDate>${date}</pubDate>${source}</item>`;
    const source = '<source>신문</source>';
    const xml = `<rss><channel>${[
      item('경제 뉴스', 'https://news.example/1', source),
      item('경제 뉴스', 'https://news.example/1', source),
      item('출처 없는 뉴스', 'https://news.example/2', ''),
      item('안전하지 않은 링크', 'javascript:alert(1)', source),
      item('미래 기사', 'https://news.example/3', source, 'Thu, 20 Oct 2027 03:00:00 GMT'),
    ].join('')}</channel></rss>`;
    expect(parseNewsRss(xml, Date.parse('2026-10-16T03:00:00Z'))).toMatchObject([
      { title: '경제 뉴스', source: '신문', link: 'https://news.example/1' },
    ]);
  });
});
