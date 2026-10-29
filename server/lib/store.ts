import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import type { CardJob, Subscription } from './types';

/**
 * 서버 저장소(JSON 파일). 사용자 생활비 정보는 저장하지 않는다.
 * 카드뉴스 작업, 데일리 구독(모의 보유 종목·학습 진행), 최근 사용 사진 ID, Discord 전송 상태만 보관.
 */
export const DATA_DIR = process.env.DATA_DIR ?? join(process.cwd(), 'data');

interface StoreShape {
  jobs: Record<string, CardJob>;
  /** 기기해시:거래ID(또는 daily-날짜) → 작업 ID (자동 중복 생성 방지) */
  jobByTrade: Record<string, string>;
  subscriptions: Record<string, Subscription>;
  recentPhotoIds: number[];
  discord: { lastSuccessAt: number | null; lastErrorAt: number | null; lastError: string | null };
}

const FILE = () => join(DATA_DIR, 'store.json');

const empty = (): StoreShape => ({ jobs: {}, jobByTrade: {}, subscriptions: {}, recentPhotoIds: [], discord: { lastSuccessAt: null, lastErrorAt: null, lastError: null } });

function load(): StoreShape {
  try {
    if (existsSync(FILE())) return { ...empty(), ...(JSON.parse(readFileSync(FILE(), 'utf8')) as Partial<StoreShape>) };
  } catch (e) {
    console.error('[store] 저장소를 읽지 못해 새로 시작합니다:', (e as Error).message);
  }
  return empty();
}

let state = load();
let timer: NodeJS.Timeout | null = null;

function persist() {
  if (timer) return;
  timer = setTimeout(() => {
    timer = null;
    mkdirSync(dirname(FILE()), { recursive: true });
    const tmp = FILE() + '.tmp';
    writeFileSync(tmp, JSON.stringify(state));
    renameSync(tmp, FILE());
  }, 50);
}

export const store = {
  get: () => state,
  update(fn: (s: StoreShape) => void) {
    fn(state);
    persist();
  },
  reset() {
    state = empty();
  },
};

export function jobDir(id: string) {
  return join(DATA_DIR, 'cards', id);
}
