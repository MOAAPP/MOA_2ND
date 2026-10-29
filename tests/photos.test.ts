import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'pb-photo-'));
const { pickPhotos, photoProvider } = await import('../server/lib/photos');

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.PIXABAY_API_KEY;
  delete process.env.PEXELS_API_KEY;
});

describe('자료 사진 (Pixabay)', () => {
  it('Pixabay 키가 있으면 Pixabay로 장마다 다른 사진을 고르고 출처를 남긴다', async () => {
    process.env.PIXABAY_API_KEY = 'k';
    process.env.PEXELS_API_KEY = 'p';
    expect(photoProvider()).toBe('pixabay');
    const calls: string[] = [];
    vi.stubGlobal('fetch', async (u: string) => {
      calls.push(String(u));
      if (String(u).startsWith('https://pixabay.com/api/')) {
        return new Response(JSON.stringify({ hits: [1, 2, 3].map((id) => ({ id, user: `작가${id}`, pageURL: `https://pixabay.com/photos/${id}`, largeImageURL: `https://cdn.pixabay.com/${id}.jpg` })) }), { status: 200, headers: { 'content-type': 'application/json' } });
      }
      return new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'content-type': 'image/jpeg' } });
    });
    const r = await pickPhotos(['semiconductor', 'semiconductor']);
    expect(r.map((p) => p.meta.id)).toEqual([1, 2]);
    expect(r[0].meta).toMatchObject({ provider: 'pixabay', photographer: '작가1', sourceUrl: 'https://pixabay.com/photos/1' });
    expect(calls.some((c) => c.includes('api.pexels.com'))).toBe(false);
  });

  it('키가 틀리면 실패로 알린다(대체 이미지로 몰래 바꾸지 않음)', async () => {
    process.env.PIXABAY_API_KEY = 'bad';
    vi.stubGlobal('fetch', async () => new Response('[ERROR 400] "key" is invalid', { status: 400 }));
    await expect(pickPhotos(['x'])).rejects.toThrow('키가 올바르지 않아요');
  });
});
