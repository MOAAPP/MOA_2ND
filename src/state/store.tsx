import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Level } from '../../shared/knowledge';
import type { LessonRecord, Streak } from '../../shared/curriculum';
import { emptyPortfolio, type PortfolioState } from '../lib/trading';
import { memoryKey } from '../lib/ml/classify';
import type { SpendEntry } from '../lib/ml/types';
import type { DecisionRecord, Goal, Profile, ScheduleItem } from '../lib/types';
import { emptyWorldWallet, migrateWorldWallet, type WorldWallet } from '../lib/worldWallet';
import { emptyBank, migrateLegacy, type BankState } from '../lib/bank/engine';
import { todayKST } from '../../shared/dates';
import { demoWorldWallet, isEmptyWorld } from '../lib/demoWorld';

export interface SetupDraft {
  step: number;
  balance?: number;
  incomes: ScheduleItem[];
  noIncome: boolean;
  expenses: ScheduleItem[];
  minBalance?: number;
  dailySpend?: number;
  goal?: Partial<Goal>;
  skipGoal?: boolean;
  reflected: string[];
}

export interface LessonSession {
  lessonId: string;
  /** 진행할 스텝 인덱스 목록(틀린 퀴즈는 끝에 한 번 더) */
  queue: number[];
  pos: number;
  startedAt: number;
  wrong: number;
  practiceDone: boolean;
}

export interface Learning {
  /** 레벨테스트로 정한 시작 단원 (null이면 아직 안 함) */
  startUnit: number | null;
  placedAt?: number;
  placementCorrect?: number;
  completed: Record<string, LessonRecord>;
  guideReads?: string[];
  xp: number;
  streak: Streak;
  dailyQuiz?: { date: string; picked: number; correct: boolean };
  session?: LessonSession;
  seen: { stockAt?: number; portfolioAt?: number };
}

export interface DailySettings {
  enabled: boolean;
  time: string;
  nickname: string;
  includePhotos: boolean;
}

export interface AppState {
  version: 3;
  worldWallet: WorldWallet;
  /** 가상 예금·적금 계약 (src/lib/bank) */
  bank: BankState;
  introSeen: boolean;
  setupDraft: SetupDraft | null;
  profile: Profile | null;
  records: DecisionRecord[];
  /** CSV·예시 데이터로 불러온 생활비 기록 (생활비 예측 입력) */
  spendLog: SpendEntry[];
  /** 상품명 → 내가 직접 고른 카테고리 (재학습용으로 내보낼 수 있음) */
  categoryMemory: Record<string, string>;
  /** 예시 데이터로 보는 중 */
  demo: boolean;
  portfolio: PortfolioState;
  level: Level | null;
  learning: Learning;
  daily: DailySettings;
  settings: {
    reduceMotion: boolean;
    /** 모의 체결 카드뉴스도 Discord로 자동 전송 */
    autoSendDiscord: boolean;
    /** 공용 채널로 보낼 정보에 동의했는지 */
    discordConsent: boolean;
  };
  cardJobIds: Record<string, string>; // tradeId(fillId) → jobId
}

const KEY = 'pb.state.v3';

/** 은행 상태 불러오기. 예전 버전의 예금·적금 잔액은 계약으로 옮긴다. */
function loadBank(parsed: Partial<AppState>): BankState {
  const b = parsed.bank;
  if (b && Array.isArray(b.contracts)) return { ...emptyBank(), ...b, log: Array.isArray(b.log) ? b.log : [] };
  const w = parsed.worldWallet;
  return migrateLegacy(emptyBank(), { deposit: w?.deposit ?? 0, installment: w?.installment ?? 0 }, todayKST());
}

export function emptyLearning(): Learning {
  return { startUnit: null, completed: {}, xp: 0, streak: { count: 0, lastDate: null, best: 0 }, seen: {} };
}

export function initialState(): AppState {
  return {
    version: 3,
    worldWallet: emptyWorldWallet(),
    bank: emptyBank(),
    introSeen: false,
    setupDraft: null,
    profile: null,
    records: [],
    spendLog: [],
    categoryMemory: {},
    demo: false,
    portfolio: emptyPortfolio(),
    level: null,
    learning: emptyLearning(),
    daily: { enabled: false, time: '08:30', nickname: '', includePhotos: true },
    settings: { reduceMotion: false, autoSendDiscord: true, discordConsent: false },
    cardJobIds: {},
  };
}

function load(): { state: AppState; error: string | null } {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { state: initialState(), error: null };
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const base = initialState();
    const world = migrateWorldWallet(parsed.worldWallet);
    // 예전 체험 저장본은 평행세계가 비어 있었다 → 예시 기록을 채워 바로 보이게
    const worldWallet = parsed.demo && isEmptyWorld(world) && !parsed.bank?.contracts?.length ? demoWorldWallet() : world;
    return {
      state: {
        ...base,
        ...parsed,
        settings: { ...base.settings, ...(parsed.settings ?? {}) },
        portfolio: { ...base.portfolio, ...(parsed.portfolio ?? {}) },
        worldWallet,
        bank: loadBank(parsed),
        learning: { ...base.learning, ...(parsed.learning ?? {}) },
        daily: { ...base.daily, ...(parsed.daily ?? {}) },
        version: 3,
      },
      error: null,
    };
  } catch {
    return { state: initialState(), error: '저장된 데이터를 읽지 못했어요. 새로 시작합니다.' };
  }
}

interface Ctx {
  state: AppState;
  update: (fn: (s: AppState) => AppState) => void;
  storageError: string | null;
}

const StoreCtx = createContext<Ctx | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [{ state: initial, error }] = useState(load);
  const [state, setState] = useState<AppState>(initial);
  const [storageError, setStorageError] = useState<string | null>(error);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
        setStorageError(null);
      } catch {
        setStorageError('이 기기에 저장하지 못했어요. 브라우저 저장 공간이나 사생활 보호 모드를 확인해 주세요.');
      }
    }, 150);
  }, [state]);

  // 창을 닫기 직전 즉시 저장
  useEffect(() => {
    const flush = () => {
      try {
        localStorage.setItem(KEY, JSON.stringify(stateRef.current));
      } catch {
        /* noop */
      }
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, []);
  const stateRef = useRef(state);
  stateRef.current = state;

  const update = useCallback((fn: (s: AppState) => AppState) => setState((s) => fn(s)), []);
  const value = useMemo(() => ({ state, update, storageError }), [state, update, storageError]);
  return <StoreCtx.Provider value={value}>{children}</StoreCtx.Provider>;
}

export function useStore() {
  const c = useContext(StoreCtx);
  if (!c) throw new Error('StoreProvider 필요');
  return c;
}

export function resetScope(s: AppState, scope: 'finance' | 'invest' | 'all'): AppState {
  if (scope === 'all') return { ...initialState(), introSeen: true };
  if (scope === 'finance') return { ...s, profile: null, records: [], spendLog: [], demo: false, setupDraft: null };
  return { ...s, portfolio: emptyPortfolio(), cardJobIds: {}, level: null, learning: emptyLearning() };
}

/** 사용자가 직접 고친 분류를 기억 (다음 자동 분류 1순위, 재학습 데이터) */
export function rememberCategory(s: AppState, name: string, category: string): AppState {
  const key = memoryKey(name);
  if (!key) return s;
  return { ...s, categoryMemory: { ...s.categoryMemory, [key]: category } };
}
