import { addDays, startOfMonth, todayKST } from '../../shared/dates';
import { WORLD_FIXED_BILLS, WORLD_MONTHLY_INCOME, WORLD_START_CASH, type WorldDecision, type WorldMovement, type WorldWallet } from './worldWallet';

/**
 * 체험용 평행세계 기록 (최근 90일).
 * 로그인·입력 없이 평행세계 탭에 들어오자마자 두 세계가 갈라지는 걸 보여주기 위한 예시 데이터.
 * - 소비 선택: 참기 / 더 싸게 / 사기 가 섞여 있어 '지킨 돈'이 계단처럼 늘어난다
 * - 매달 1일 고정지출·월급, 중간중간 자유 저축과 ETF 매수
 * - cash 는 기록을 처음부터 다시 더한 값과 정확히 같다(그래프 보정값 0)
 */

type D = [daysAgo: number, hour: number, title: string, price: number, paid: number, choice: WorldDecision['choice'], note: string];
const DECISIONS: D[] = [
  [86, 22, '배달 야식', 23_000, 0, 'wait', '냉장고에 있던 걸로 해결'],
  [82, 9, '카페 라떼', 5_500, 5_500, 'buy', ''],
  [78, 20, '무선 이어폰', 159_000, 0, 'wait', '쓰던 거 아직 멀쩡함'],
  [74, 23, '택시', 14_800, 1_500, 'alternative', '막차 버스 탐'],
  [69, 15, '겨울 패딩', 189_000, 129_000, 'alternative', '아울렛 작년 모델'],
  [63, 12, '콘서트 티켓', 132_000, 132_000, 'buy', '꼭 가고 싶었던 공연'],
  [58, 21, '편의점 간식', 8_900, 0, 'wait', ''],
  [53, 14, '러닝 스니커즈', 129_000, 69_000, 'alternative', '작년 모델'],
  [47, 19, '배달 치킨', 24_000, 24_000, 'buy', '친구랑 나눠 먹음'],
  [41, 11, 'OTT 연간 이용권', 99_000, 0, 'wait', '한 달만 보고 해지'],
  [36, 16, '향수', 98_000, 98_000, 'buy', '생일 선물로 나한테'],
  [30, 15, '카페 디저트', 12_800, 4_500, 'alternative', '아메리카노만'],
  [24, 13, '원데이 클래스', 55_000, 55_000, 'buy', ''],
  [19, 22, '게임 아이템', 33_000, 0, 'wait', ''],
  [14, 17, '니트 가디건', 69_000, 39_000, 'alternative', '중고 거래'],
  [9, 21, '배달 마라탕', 19_500, 0, 'wait', '집밥'],
  [5, 18, '블루투스 스피커', 89_000, 0, 'wait', '세일 기다리는 중'],
  [2, 9, '카페 라떼', 5_500, 5_500, 'buy', ''],
  [1, 20, '배달 떡볶이', 18_000, 0, 'wait', ''],
];

type M = [daysAgo: number, hour: number, kind: WorldMovement['kind'], amount: number, memo: string, extra?: Partial<WorldMovement>];
const MOVES: M[] = [
  [77, 10, 'save', 60_000, '자유 저축'],
  [40, 10, 'save', 50_000, '자유 저축'],
  [29, 10, 'buyStock', 47_000, 'TIGER 미국S&P500 2주 매수', { code: '360750', qty: 2 }],
  [8, 10, 'save', 40_000, '자유 저축'],
];

const at = (day: string, hour: number) => Date.parse(`${day}T${String(hour).padStart(2, '0')}:00:00+09:00`);

export function demoWorldWallet(now = Date.now()): WorldWallet {
  const today = todayKST(new Date(now));
  const clamp = (t: number) => Math.min(t, now - 60_000);

  const decisions: WorldDecision[] = DECISIONS.map(([ago, h, title, price, paid, choice, note], i) => ({
    id: `demo-w-${i}`, title, price, paid, choice, note, at: clamp(at(addDays(today, -ago), h)),
  }));

  const movements: WorldMovement[] = MOVES.map(([ago, h, kind, amount, memo, extra], i) => ({
    id: `demo-m-${i}`, kind, amount, memo, at: clamp(at(addDays(today, -ago), h)), ...extra,
  }));

  // 매달 1일: 고정지출 → 월급 (BankClock 의 payday 와 같은 id 라 중복되지 않는다)
  for (let first = startOfMonth(addDays(today, -89)); first <= today; first = startOfMonth(addDays(first, 32))) {
    if (first <= addDays(today, -90)) continue;
    const t = at(first, 0), m = Number(first.slice(5, 7));
    movements.push(
      { id: `bills-${first}`, kind: 'bills', amount: WORLD_FIXED_BILLS, at: t, memo: `${m}월 고정지출 결제` },
      { id: `income-${first}`, kind: 'income', amount: WORLD_MONTHLY_INCOME, at: t + 1, memo: `${m}월 월급 입금` },
    );
  }
  movements.sort((a, b) => a.at - b.at);

  const outKinds = ['withdraw', 'redeemDeposit', 'cancelInstallment', 'sellStock', 'income'];
  const moveCash = movements.reduce((s, m) => s + (outKinds.includes(m.kind) ? m.amount : -m.amount), 0);
  const spent = decisions.reduce((s, d) => s + d.paid, 0);
  const savings = movements.filter((m) => m.kind === 'save').reduce((s, m) => s + m.amount, 0);
  const etf = MOVES.filter(([, , k]) => k === 'buyStock').reduce((s, [, , , amount, , extra]) => {
    const code = extra!.code!;
    s[code] = { qty: (s[code]?.qty ?? 0) + extra!.qty!, cost: (s[code]?.cost ?? 0) + amount };
    return s;
  }, {} as WorldWallet['etfs']);

  return {
    cash: WORLD_START_CASH + moveCash - spent,
    savings,
    deposit: 0,
    installment: 0,
    etfs: etf,
    decisions,
    movements,
  };
}

/** 사용자가 직접 남긴 평행세계 기록이 하나도 없는지 */
export const isEmptyWorld = (w: WorldWallet) => (w.decisions?.length ?? 0) === 0 && !(w.movements ?? []).some((m) => m.kind !== 'income' && m.kind !== 'bills');
