import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { Level } from '../../shared/knowledge';
import type { LessonRecord, Streak } from '../../shared/curriculum';
import { emptyPortfolio, type PortfolioState } from '../lib/trading';
import { emptyInvestJournal, type InvestJournal } from '../lib/fundedInvest';
import { memoryKey } from '../lib/ml/classify';
import type { SpendEntry } from '../lib/ml/types';
import type { DecisionRecord, Goal, Profile, ScheduleItem } from '../lib/types';
import { emptyWorldWallet, migrateWorldWallet, type WorldWallet } from '../lib/worldWallet';
import { emptyBank, migrateLegacy, type BankState } from '../lib/bank/engine';
import { todayKST } from '../../shared/dates';
import { demoWorldWalletFromShared, isEmptyWorld } from '../lib/demoWorld';
import { demoData } from '../lib/demo';
import { DEMO_FIXTURE_VERSION, seedDemoState } from '../lib/demoSeed';
import { isSandboxDemo } from '../lib/demoSandbox';
import { DEMO_SNAPSHOT_DAY } from '../lib/appClock';
import { emptyMoa, type MoaState } from '../lib/moa/types';
import { demoMoa, moaFromProfile } from '../lib/moa/bridge';
import { appendEvent, emptyResearch, migrateResearch, type ResearchEventBody, type ResearchState } from '../lib/research/log';

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
  /** Ensures an old untouched sample can reload the latest daily fixture. */
  demoFixtureVersion?: number;
  /** Pinned S01 presentation date. Advance explicitly; never use future oracle balances. */
  demoDay?: string;
  portfolio: PortfolioState;
  /** 단일 가상 지갑 투자 주문·체결 장부. 구형 독립 1,000만 원 기록은 portfolio에 보존. */
  investJournal: InvestJournal;
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
  /** 연구 참여(동의한 경우에만 이벤트가 쌓임) — docs/RESEARCH.md */
  research: ResearchState;
  /** 결제계좌 현금흐름 (기획서 MVP 핵심) */
  moa: MoaState;
}

const KEY = 'pb.state.v3';
// Query ?demo=1 creates an independent in-memory S01 session without overwriting personal records.
const ISOLATED_DEMO = typeof window !== 'undefined' && isSandboxDemo(window.location.search);

/** 모아 상태 불러오기. 예전 사용자는 기존 프로필(기준 잔고·일정)로 결제계좌를 채운다. */
function loadMoa(parsed: Partial<AppState>): MoaState {
  const base = emptyMoa();
  if (parsed.moa && parsed.moa.version === 1) return { ...base, ...parsed.moa };
  return parsed.profile && !parsed.demo ? moaFromProfile(parsed.profile) : base;
}

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
    demoFixtureVersion: 0,
    demoDay: undefined,
    portfolio: emptyPortfolio(),
    investJournal: emptyInvestJournal(),
    level: null,
    learning: emptyLearning(),
    daily: { enabled: false, time: '08:30', nickname: '', includePhotos: true },
    settings: { reduceMotion: false, autoSendDiscord: true, discordConsent: false },
    cardJobIds: {},
    research: emptyResearch(),
    moa: emptyMoa(),
  };
}

function load(): { state: AppState; error: string | null } {
  if (ISOLATED_DEMO) return { state: seedDemoState(initialState()), error: null };
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { state: initialState(), error: null };
    const parsed = JSON.parse(raw) as Partial<AppState>;
    const base = initialState();
    const world = migrateWorldWallet(parsed.worldWallet);
    // Previous demo fixtures were persisted in localStorage and hid the new
    // current-day purchases. Update ONLY untouched sample data. Never replace
    // manually entered transactions, real financial data, or user investments.
    const sampleOnly = !!parsed.demo &&
      (parsed.demoFixtureVersion ?? 0) < DEMO_FIXTURE_VERSION &&
      (parsed.records ?? []).length === 0 &&
      (parsed.spendLog ?? []).every(e => e.from === 'demo') &&
      (parsed.moa?.txns ?? []).every(t => t.source === 'demo') &&
      (parsed.worldWallet?.decisions ?? []).every(d => d.id.startsWith('S01-')) &&
      (parsed.worldWallet?.movements ?? []).every(m => m.id.startsWith('S01-') ||
        m.id.startsWith('income-') || m.id.startsWith('bills-')) &&
      !(parsed.bank?.contracts?.length) && !(parsed.investJournal?.orders?.length);
    const snapshotAt = Date.parse(`${DEMO_SNAPSHOT_DAY}T23:59:00+09:00`);
    const refreshed = sampleOnly ? { ...demoData(snapshotAt), moa: demoMoa(snapshotAt),
      worldWallet: demoWorldWalletFromShared(snapshotAt), demoFixtureVersion: DEMO_FIXTURE_VERSION, demoDay: DEMO_SNAPSHOT_DAY } : null;
    const worldWallet = refreshed ? refreshed.worldWallet : parsed.demo && isEmptyWorld(world) &&
      !parsed.bank?.contracts?.length ? demoWorldWalletFromShared() : world;
    return {
      state: {
        ...base,
        ...parsed,
        ...(refreshed ?? {}),
        settings: { ...base.settings, ...(parsed.settings ?? {}) },
        portfolio: { ...base.portfolio, ...(parsed.portfolio ?? {}) },
        investJournal: { ...emptyInvestJournal(parsed.portfolio?.watchlist), ...(parsed.investJournal ?? {}) },
        worldWallet,
        bank: loadBank(parsed),
        learning: { ...base.learning, ...(parsed.learning ?? {}) },
        daily: { ...base.daily, ...(parsed.daily ?? {}) },
        research: migrateResearch(parsed.research),
        moa: refreshed?.moa ?? loadMoa(parsed),
        version: 3,
        demoDay: parsed.demo ? (refreshed?.demoDay ?? parsed.demoDay ?? DEMO_SNAPSHOT_DAY) : undefined,
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
    if (ISOLATED_DEMO) return;
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
    if (ISOLATED_DEMO) return;
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

/** 상태에 연구 이벤트 한 줄 추가(동의 안 했으면 그대로) */
export function withEvent(s: AppState, body: ResearchEventBody, now = Date.now()): AppState {
  const research = appendEvent(s.research, body, { now, demo: s.demo });
  return research === s.research ? s : { ...s, research };
}

export function resetScope(s: AppState, scope: 'finance' | 'invest' | 'all'): AppState {
  if (scope === 'all') return { ...initialState(), introSeen: true, research: { ...s.research, events: s.research.joined ? s.research.events : [] } };
  if (scope === 'finance') return { ...s, profile: null, records: [], spendLog: [], demo: false, demoDay: undefined, setupDraft: null, moa: emptyMoa() };
  // 투자 내역을 지워도 세계 지갑의 주식·현금은 보존한다.
  return { ...s, portfolio: emptyPortfolio(), investJournal: emptyInvestJournal(s.investJournal.watchlist), cardJobIds: {}, level: null, learning: emptyLearning() };
}

/** 사용자가 직접 고친 분류를 기억 (다음 자동 분류 1순위, 재학습 데이터) */
export function rememberCategory(s: AppState, name: string, category: string): AppState {
  const key = memoryKey(name);
  if (!key) return s;
  return { ...s, categoryMemory: { ...s.categoryMemory, [key]: category } };
}
