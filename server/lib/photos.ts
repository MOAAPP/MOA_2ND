import { fetchWithTimeout } from './http';
import { store } from './store';
import type { PhotoMeta } from './types';

/**
 * 카드뉴스 사진은 'AI 생성'이 아니라 자료 사진 사이트에서 검색·선정한다.
 * - 제공처: Pixabay(PIXABAY_API_KEY) 또는 Pexels(PEXELS_API_KEY). 둘 다 있으면 Pixabay 우선.
 * - 각 장 내용에 맞는 검색어로 따로 고른다(4장 모두 다른 사진), 최근 사용한 사진은 피한다.
 * - 카드에는 '자료 사진'과 촬영자·출처를 표시한다(당일 현장 사진으로 표현하지 않음).
 */
export class PhotoError extends Error {}

export interface PickedPhoto {
  meta: PhotoMeta;
  dataUri: string;
}

interface Candidate {
  id: number;
  photographer: string;
  pageUrl: string;
  imageUrl: string;
}

const RECENT_LIMIT = 60;

export type PhotoProvider = 'pixabay' | 'pexels';

export function photoProvider(): PhotoProvider | null {
  if (process.env.PIXABAY_API_KEY) return 'pixabay';
  if (process.env.PEXELS_API_KEY) return 'pexels';
  return null;
}

export function photosConfigured(): boolean {
  return photoProvider() !== null;
}

export const PHOTO_LABEL: Record<PhotoProvider, string> = { pixabay: 'Pixabay', pexels: 'Pexels' };

async function search(provider: PhotoProvider, query: string): Promise<Candidate[]> {
  let res;
  try {
    res =
      provider === 'pixabay'
        ? await fetchWithTimeout(`https://pixabay.com/api/?key=${encodeURIComponent(process.env.PIXABAY_API_KEY!)}&q=${encodeURIComponent(query)}&image_type=photo&orientation=vertical&safesearch=true&per_page=30`, {}, 10000)
        : await fetchWithTimeout(`https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=30&orientation=portrait`, { headers: { Authorization: process.env.PEXELS_API_KEY! } }, 10000);
  } catch {
    throw new PhotoError('사진 검색 서비스에 연결하지 못했어요.');
  }
  if (res.status === 400 && provider === 'pixabay') throw new PhotoError('사진 검색 키가 올바르지 않아요.');
  if (res.status === 401 || res.status === 403) throw new PhotoError('사진 검색 키가 올바르지 않아요.');
  if (res.status === 429) throw new PhotoError('사진 검색 한도를 넘었어요. 잠시 후 다시 시도해 주세요.');
  if (!res.ok) throw new PhotoError(`사진 검색 응답 오류(${res.status})`);
  if (provider === 'pixabay') {
    const data = (await res.json()) as { hits?: { id: number; user: string; pageURL: string; largeImageURL?: string; webformatURL?: string }[] };
    return (data.hits ?? []).filter((h) => h.largeImageURL || h.webformatURL).map((h) => ({ id: h.id, photographer: h.user, pageUrl: h.pageURL, imageUrl: (h.largeImageURL ?? h.webformatURL)! }));
  }
  const data = (await res.json()) as { photos?: { id: number; photographer: string; url: string; src: { portrait?: string; large?: string; original?: string } }[] };
  return (data.photos ?? []).filter((p) => p.src.portrait || p.src.large || p.src.original).map((p) => ({ id: p.id, photographer: p.photographer, pageUrl: p.url, imageUrl: (p.src.portrait ?? p.src.large ?? p.src.original)! }));
}

export async function pickPhotos(queries: string[]): Promise<PickedPhoto[]> {
  const provider = photoProvider();
  if (!provider) throw new PhotoError('사진 검색 키(PIXABAY_API_KEY 또는 PEXELS_API_KEY)가 서버에 설정되지 않았어요.');
  const recent = new Set(store.get().recentPhotoIds);
  const usedNow = new Set<number>();
  const out: PickedPhoto[] = [];
  for (const query of queries) {
    const list = (await search(provider, query)).filter((p) => !usedNow.has(p.id));
    if (!list.length) throw new PhotoError(`'${query}'에 맞는 사진을 찾지 못했어요.`);
    // 최근에 쓰지 않은 사진 중 검색 상위(관련도 높은) 사진 우선
    const fresh = list.filter((p) => !recent.has(p.id));
    const pick = (fresh.length ? fresh : list)[0];
    usedNow.add(pick.id);
    let img;
    try {
      img = await fetchWithTimeout(pick.imageUrl, {}, 15000);
    } catch {
      throw new PhotoError('사진을 내려받지 못했어요.');
    }
    if (!img.ok) throw new PhotoError(`사진 다운로드 오류(${img.status})`);
    const type = img.headers.get('content-type') ?? 'image/jpeg';
    const buf = Buffer.from(await img.arrayBuffer());
    out.push({
      meta: { id: pick.id, query, photographer: pick.photographer, sourceUrl: pick.pageUrl, provider },
      dataUri: `data:${type};base64,${buf.toString('base64')}`,
    });
  }
  store.update((s) => {
    s.recentPhotoIds = [...out.map((p) => p.meta.id as number), ...s.recentPhotoIds].slice(0, RECENT_LIMIT);
  });
  return out;
}
