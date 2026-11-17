import { addDays, iso, seeded, today, type ScheduleItem } from './lib'

export type Category = 'food' | 'cafe' | 'transport' | 'shopping' | 'life' | 'culture' | 'subscription' | 'income' | 'etc'
export type Dest = 'saving' | 'invest' | 'challenge'

export type Tx = {
  id: string
  date: string
  title: string
  amount: number
  category: Category
  kind: 'spend' | 'income' | 'skip'
  dest?: Dest
}

export type Trade = { id: string; date: string; code: string; side: 'buy' | 'sell'; qty: number; price: number; pl?: number }
export type Holding = { code: string; qty: number; avg: number }
export type Deposit = { id: string; name: string; principal: number; rate: number; months: number; start: string }
export type Challenge = { start: string; base: number; filled: number }

export type State = {
  mode: 'demo' | 'fresh'
  onboarded: boolean
  profile: { name: string; payday: number; salary: number; keep: number; daily: number }
  balance: number
  schedule: ScheduleItem[]
  txs: Tx[]
  saving: { balance: number; rate: number; since: string }
  deposits: Deposit[]
  challenge: Challenge | null
  invest: { cash: number; holdings: Holding[] }
  xp: number
  streak: number
  lessonsDone: string[]
  discord: boolean
  later: { id: string; title: string; amount: number; until: string; monthlySaving?: number; savingsDay?: number }[]
  trades?: Trade[]
  levelTested?: boolean
  /** demo holdings re-based onto the first live quotes */
  rebased?: boolean
}

export const CATS: Record<Category, { label: string; color: string }> = {
  food: { label: '식비', color: '#FF8A4C' },
  cafe: { label: '카페', color: '#B07A4F' },
  transport: { label: '교통', color: '#3B82F6' },
  shopping: { label: '쇼핑', color: '#EC4899' },
  life: { label: '생활', color: '#10B981' },
  culture: { label: '문화', color: '#8B5CF6' },
  subscription: { label: '구독', color: '#64748B' },
  income: { label: '수입', color: '#2563EB' },
  etc: { label: '기타', color: '#94A3B8' },
}

export const QUICK: { title: string; amount: number; category: Category }[] = [
  { title: '아이스 아메리카노', amount: 4800, category: 'cafe' },
  { title: '배달 음식', amount: 22000, category: 'food' },
  { title: '택시', amount: 13500, category: 'transport' },
  { title: '편의점 간식', amount: 7800, category: 'food' },
  { title: '새 옷', amount: 59000, category: 'shopping' },
  { title: '무선 이어폰', amount: 249000, category: 'shopping' },
]

export const guessCategory = (title: string): Category => {
  const t = title.toLowerCase()
  if (/커피|카페|라떼|아메리카노|스타벅스|디저트|빵/.test(t)) return 'cafe'
  if (/배달|치킨|피자|마라|떡볶이|밥|식|편의점|야식|버거|초밥|이마트24|gs25|cu/.test(t)) return 'food'
  if (/택시|버스|지하철|교통|기차|ktx/.test(t)) return 'transport'
  if (/옷|신발|운동화|가방|이어폰|에어팟|폰|케이스|향수|화장품|니트|쇼핑|아이패드|올리브영|쿠팡|무신사|지그재그/.test(t)) return 'shopping'
  if (/다이소|생활|세제|휴지/.test(t)) return 'life'
  if (/영화|콘서트|공연|게임|책|전시|cgv|메가박스|교보/.test(t)) return 'culture'
  if (/구독|넷플릭스|유튜브|멜론/.test(t)) return 'subscription'
  return 'etc'
}

export const PRODUCTS = {
  saving: { name: '평행 자유적금', rate: 0.035, desc: '참은 돈이 바로 들어가는 기본 통장' },
  deposit: { name: '평행 정기예금', rates: { 6: 0.031, 12: 0.034 } as Record<number, number> },
  challenge: { name: '26주 적금', rate: 0.05, desc: '매주 조금씩 늘려 넣는 습관 적금' },
}

export type Stock = {
  code: string
  name: string
  short: string
  type: 'ETF' | '주식'
  price: number
  color: string
  about: string
  why: string
}

export const STOCKS: Stock[] = [
  {
    code: '360750',
    name: 'TIGER 미국S&P500',
    short: 'S&P',
    type: 'ETF',
    price: 22150,
    color: '#1E40AF',
    about: '미국 대표 기업 500개에 한 번에 나눠 투자해요.',
    why: '미국 대형 기술주가 오르면서 같이 올랐어요. 한 기업이 아니라 500개 기업 평균이라 움직임이 비교적 완만해요.',
  },
  {
    code: '069500',
    name: 'KODEX 200',
    short: 'K200',
    type: 'ETF',
    price: 34800,
    color: '#0EA5E9',
    about: '코스피 상위 200개 기업을 묶어 따라가요.',
    why: '반도체 비중이 큰 지수라 반도체 업황 뉴스에 많이 흔들려요.',
  },
  {
    code: '133690',
    name: 'TIGER 미국나스닥100',
    short: 'NDQ',
    type: 'ETF',
    price: 118600,
    color: '#7C3AED',
    about: '미국 나스닥 상위 100개 기술 기업에 투자해요.',
    why: 'AI·빅테크 실적 기대가 반영됐어요. 성장주 중심이라 오르내림이 S&P500보다 커요.',
  },
  {
    code: '005930',
    name: '삼성전자',
    short: '삼성',
    type: '주식',
    price: 63400,
    color: '#1428A0',
    about: '메모리 반도체와 스마트폰을 만드는 국내 최대 기업이에요.',
    why: '메모리 가격 회복 기대가 커지면서 외국인 매수가 이어졌어요.',
  },
  {
    code: '000660',
    name: 'SK하이닉스',
    short: 'SK',
    type: '주식',
    price: 198500,
    color: '#EA0029',
    about: 'AI 서버용 고대역폭 메모리(HBM)를 만드는 기업이에요.',
    why: 'AI 서버 수요 전망에 따라 크게 움직여요. 하루 변동이 큰 편이에요.',
  },
  {
    code: '035720',
    name: '카카오',
    short: '카카오',
    type: '주식',
    price: 41250,
    color: '#F7C600',
    about: '카카오톡을 중심으로 플랫폼 사업을 하는 기업이에요.',
    why: '광고 경기와 신사업 소식에 영향을 받아요.',
  },
]

/** deterministic 90-day history ending at current price */
export function history(stock: Stock, days = 90) {
  const r = seeded(Number(stock.code) || 7)
  const out: number[] = []
  let p = stock.price
  for (let i = 0; i < days; i++) {
    out.unshift(p)
    const vol = stock.type === 'ETF' ? 0.009 : 0.017
    p = p / (1 + (r() - 0.44) * vol * 2)
  }
  return out
}

export const LEVELS = [
  { min: 0, name: '작은 소행성', hue: 220 },
  { min: 100000, name: '새싹 위성', hue: 190 },
  { min: 300000, name: '푸른 행성', hue: 225 },
  { min: 600000, name: '고리 행성', hue: 250 },
  { min: 1000000, name: '빛나는 행성', hue: 270 },
  { min: 1600000, name: '쌍성계', hue: 295 },
  { min: 2500000, name: '작은 은하', hue: 320 },
]

export const levelOf = (total: number) => {
  let i = 0
  LEVELS.forEach((l, idx) => {
    if (total >= l.min) i = idx
  })
  const cur = LEVELS[i]
  const next = LEVELS[i + 1]
  const progress = next ? (total - cur.min) / (next.min - cur.min) : 1
  return { lv: i + 1, ...cur, next, progress, remain: next ? next.min - total : 0 }
}

export type Lesson = {
  id: string
  unit: string
  title: string
  minutes: number
  cards: { title: string; body: string; visual?: string }[]
  quiz: { q: string; options: string[]; answer: number; explain: string }
  practice?: string
}

export const LESSONS: Lesson[] = [
  {
    id: 'l1',
    unit: '기초',
    title: '이자는 어떻게 붙을까',
    minutes: 3,
    cards: [
      { title: '이자 = 돈을 맡긴 대가', body: '은행에 돈을 맡기면 은행은 그 돈을 빌려주고, 그 대가 일부를 이자로 돌려줘요.', visual: '🏦' },
      { title: '연 3.5%의 뜻', body: '100만 원을 1년 맡기면 3만 5천 원이 붙는다는 뜻이에요. 한 달만 맡기면 약 2,900원이에요.', visual: '📅' },
      { title: '세금 15.4%', body: '이자에는 세금이 붙어요. 3만 5천 원 이자라면 실제로는 약 2만 9,600원을 받아요.', visual: '🧾' },
    ],
    quiz: {
      q: '50만 원을 연 4%로 1년 맡기면 세전 이자는?',
      options: ['4,000원', '20,000원', '40,000원'],
      answer: 1,
      explain: '50만 × 4% = 2만 원. 여기서 세금을 빼면 약 16,900원이에요.',
    },
    practice: 'saving',
  },
  {
    id: 'l2',
    unit: '기초',
    title: '예금과 적금의 차이',
    minutes: 3,
    cards: [
      { title: '예금은 한 번에', body: '목돈을 한 번에 넣고 정해진 기간 동안 묶어둬요. 금리가 가장 단순하게 적용돼요.', visual: '💰' },
      { title: '적금은 나눠서', body: '매달·매주 조금씩 넣어요. 늦게 넣은 돈은 이자가 붙는 기간이 짧아서, 표시 금리보다 실제 이자가 적어요.', visual: '🪙' },
      { title: '모아에서는', body: '참은 돈은 자유적금에 바로 쌓이고, 어느 정도 모이면 예금으로 옮겨 묶어둘 수 있어요.', visual: '🪐' },
    ],
    quiz: {
      q: '같은 연 5%라도 실제 이자가 더 적은 쪽은?',
      options: ['정기예금', '적금', '둘 다 같다'],
      answer: 1,
      explain: '적금은 나중에 넣은 돈일수록 이자 기간이 짧아서 실제로는 약 절반 정도의 이자가 붙어요.',
    },
    practice: 'deposit',
  },
  {
    id: 'l3',
    unit: '투자 첫걸음',
    title: 'ETF, 여러 기업을 한 번에',
    minutes: 4,
    cards: [
      { title: '주식 한 개 = 한 회사', body: '삼성전자 주식을 사면 삼성전자 한 회사의 결과에 내 돈이 달려 있어요.', visual: '🏢' },
      { title: 'ETF = 바구니', body: 'ETF는 여러 회사 주식을 바구니에 담아 한 번에 사는 상품이에요. S&P500 ETF는 미국 500개 기업이 들어 있어요.', visual: '🧺' },
      { title: '그래서 덜 흔들려요', body: '한 회사가 크게 떨어져도 나머지가 버텨줘서 움직임이 완만해요. 처음 투자를 연습하기 좋아요.', visual: '📉' },
    ],
    quiz: {
      q: 'ETF의 가장 큰 장점은?',
      options: ['무조건 오른다', '여러 기업에 나눠 투자된다', '이자가 붙는다'],
      answer: 1,
      explain: 'ETF는 분산 투자 상품이에요. 오를 수도 떨어질 수도 있지만 한 회사에 몰빵하는 것보다 위험이 나뉘어요.',
    },
    practice: '360750',
  },
  {
    id: 'l4',
    unit: '투자 첫걸음',
    title: '수익률 읽는 법',
    minutes: 3,
    cards: [
      { title: '평균 단가', body: '여러 번 나눠 사면 산 가격의 평균이 내 평균 단가가 돼요.', visual: '➗' },
      { title: '수익률', body: '(지금 가격 − 평균 단가) ÷ 평균 단가. 2만 원에 사서 2만 2천 원이면 +10%예요.', visual: '📈' },
      { title: '팔기 전엔 숫자일 뿐', body: '평가 수익은 팔기 전까지 계속 바뀌어요. 하루 숫자에 흔들리지 않는 연습이 필요해요.', visual: '🧘' },
    ],
    quiz: {
      q: '평균 단가 40,000원, 현재가 38,000원이면 수익률은?',
      options: ['-5%', '-2%', '+5%'],
      answer: 0,
      explain: '(38,000 − 40,000) ÷ 40,000 = -5%예요.',
    },
    practice: '069500',
  },
  {
    id: 'l5',
    unit: '내 돈 지키기',
    title: '결제일 전 잔액 관리',
    minutes: 3,
    cards: [
      { title: '카드값은 미래의 지출', body: '오늘 긁은 카드는 다음 달 결제일에 한꺼번에 빠져나가요.', visual: '💳' },
      { title: '쓸 수 있는 돈', body: '지금 잔액에서 예정된 결제와 지켜둘 돈을 빼야 진짜 쓸 수 있는 돈이에요.', visual: '🧮' },
      { title: '모아 홈 숫자', body: '홈의 "월급날까지 쓸 수 있는 돈"이 바로 이 계산이에요.', visual: '🏠' },
    ],
    quiz: {
      q: '잔액 100만, 예정 결제 60만, 지켜둘 돈 30만이면 쓸 수 있는 돈은?',
      options: ['10만 원', '40만 원', '70만 원'],
      answer: 0,
      explain: '100 − 60 − 30 = 10만 원이에요.',
    },
  },
]

const d = (offset: number) => iso(addDays(today(), offset))

/** dates expressed relative to today so the demo always looks fresh */
export function demoState(): State {
  const t = today()
  const base = (m: number, day: number) => {
    const x = new Date(t.getFullYear(), t.getMonth() - m, day)
    return iso(x > t ? addDays(t, -1) : x)
  }
  const skips: [number, number, string, number, Category, Dest][] = [
    [2, 3, '아이스 아메리카노', 4500, 'cafe', 'saving'],
    [2, 7, '배달 치킨', 23000, 'food', 'saving'],
    [2, 12, '운동화', 129000, 'shopping', 'saving'],
    [2, 18, '택시 대신 버스', 11800, 'transport', 'saving'],
    [2, 24, '콘서트 굿즈', 85000, 'culture', 'invest'],
    [1, 2, '에어팟 프로', 249000, 'shopping', 'saving'],
    [1, 8, '배달 떡볶이', 18900, 'food', 'saving'],
    [1, 13, '편의점 야식', 8700, 'food', 'saving'],
    [1, 19, '니트 가디건', 59000, 'shopping', 'invest'],
    [1, 26, '아이패드 케이스', 49000, 'shopping', 'invest'],
    [0, 2, '브런치 카페', 26000, 'cafe', 'saving'],
    [0, 6, '택시', 14200, 'transport', 'saving'],
    [0, 10, '향수', 98000, 'shopping', 'invest'],
    [0, 14, '배달 마라탕', 21500, 'food', 'saving'],
  ]
  const spends: [number, string, number, Category][] = [
    [0, '스타벅스', 5900, 'cafe'],
    [-1, '학식', 6500, 'food'],
    [-1, '지하철', 1550, 'transport'],
    [-2, '올리브영', 23800, 'shopping'],
    [-3, '배달의민족', 18900, 'food'],
    [-4, 'CGV', 14000, 'culture'],
    [-5, '이마트24', 4300, 'food'],
    [-6, '유튜브 프리미엄', 14900, 'subscription'],
    [-7, '다이소', 8000, 'life'],
    [-8, '버스', 1550, 'transport'],
    [-9, '메가커피', 2000, 'cafe'],
    [-10, '쿠팡', 32400, 'shopping'],
    [-12, '김밥천국', 8500, 'food'],
    [-14, '교보문고', 16200, 'culture'],
    [-20, '과외비', 400000, 'income'],
  ]
  const txs: Tx[] = [
    ...skips.map(([m, day, title, amount, category, dest], i) => ({
      id: 's' + i,
      date: base(m, day),
      title,
      amount,
      category,
      kind: 'skip' as const,
      dest,
    })),
    ...spends.map(([off, title, amount, category], i) => ({
      id: 'p' + i,
      date: d(off),
      title,
      amount,
      category,
      kind: category === 'income' ? ('income' as const) : ('spend' as const),
    })),
  ]
  // past months so the calendar and list look lived-in
  const pool: [string, number, Category][] = [
    ['스타벅스', 5900, 'cafe'], ['메가커피', 2000, 'cafe'], ['학식', 6500, 'food'], ['배달의민족', 21000, 'food'],
    ['김밥천국', 8500, 'food'], ['지하철', 1550, 'transport'], ['버스', 1550, 'transport'], ['카카오T 택시', 11200, 'transport'],
    ['올리브영', 18900, 'shopping'], ['무신사', 49000, 'shopping'], ['쿠팡', 27400, 'shopping'], ['다이소', 6000, 'life'],
    ['CGV', 14000, 'culture'], ['교보문고', 15800, 'culture'], ['GS25', 4700, 'food'], ['마라탕', 13500, 'food'],
  ]
  const rnd = seeded(20261117)
  const past: Tx[] = []
  for (const m of [1, 2]) {
    const last = new Date(t.getFullYear(), t.getMonth() - m + 1, 0).getDate()
    for (let day = 1; day <= last; day++) {
      const n = rnd() < 0.25 ? 0 : rnd() < 0.7 ? 1 : 2
      for (let k = 0; k < n; k++) {
        const [title, amount, category] = pool[Math.floor(rnd() * pool.length)]
        past.push({ id: `h${m}-${day}-${k}`, date: iso(new Date(t.getFullYear(), t.getMonth() - m, day)), title, amount, category, kind: 'spend' })
      }
    }
    past.push({ id: `sal${m}`, date: iso(new Date(t.getFullYear(), t.getMonth() - m, 25)), title: '월급', amount: 2100000, category: 'income', kind: 'income' })
  }
  txs.push(...past)
  return {
    mode: 'demo',
    onboarded: true,
    profile: { name: '지현', payday: 25, salary: 2100000, keep: 300000, daily: 12000 },
    balance: 1100000,
    schedule: [
      { id: 'b1', day: 20, title: '카드 결제', amount: 626000 },
      { id: 'b2', day: 22, title: '통신비 · 구독', amount: 62000 },
    ],
    txs,
    saving: { balance: 206600, rate: PRODUCTS.saving.rate, since: base(2, 3) },
    deposits: [{ id: 'dp1', name: '평행 정기예금', principal: 300000, rate: 0.034, months: 12, start: base(1, 5) }],
    challenge: { start: base(1, 6), base: 1000, filled: 6 },
    invest: {
      cash: 113600,
      holdings: [
        { code: '360750', qty: 5, avg: 21400 },
        { code: '069500', qty: 2, avg: 35200 },
      ],
    },
    xp: 580,
    streak: 6,
    lessonsDone: ['l1', 'l2'],
    levelTested: true,
    trades: [
      { id: 't1', date: d(-21), code: '360750', side: 'buy', qty: 5, price: 21400 },
      { id: 't2', date: d(-15), code: '069500', side: 'buy', qty: 2, price: 35200 },
    ],
    discord: true,
    later: [],
  }
}

export function freshState(): State {
  return {
    mode: 'fresh',
    onboarded: false,
    profile: { name: '', payday: 25, salary: 2000000, keep: 300000, daily: 12000 },
    balance: 800000,
    schedule: [{ id: 'b1', day: 20, title: '카드 결제', amount: 350000 }],
    txs: [],
    saving: { balance: 0, rate: PRODUCTS.saving.rate, since: d(0) },
    deposits: [],
    challenge: null,
    invest: { cash: 0, holdings: [] },
    xp: 0,
    streak: 0,
    lessonsDone: [],
    discord: false,
    later: [],
  }
}
