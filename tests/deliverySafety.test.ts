import { afterEach, describe, expect, it } from 'vitest';
import { unsentNews } from '../server/lib/jobs';
import { store } from '../server/lib/store';
import type { CardJob, NewsItem } from '../server/lib/types';

describe('delivery safeguards', () => {
  afterEach(() => store.reset());
  it('excludes previously sent articles for the same device, but not other devices', () => {
    const article: NewsItem = { title: '금리 뉴스', source: '신문', link: 'https://news.example/1', publishedAt: 1 };
    const prior = { id: 'old', deviceHash: 'one', news: [article], sends: [{ ok: true, at: 1, auto: true }] } as CardJob;
    const current = { id: 'new', deviceHash: 'one' } as CardJob;
    store.update((s) => { s.jobs.old = prior; });
    expect(unsentNews(current, [article])).toEqual([]);
    expect(unsentNews({ ...current, deviceHash: 'two' }, [article])).toEqual([article]);
  });
});
