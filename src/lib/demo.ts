import { addDays, todayKST } from '../../shared/dates';
import { mulberry32 } from './ml/montecarlo';
import type { SpendEntry } from './ml/types';
import type { DecisionRecord, Profile } from './types';

/** 발표·시연용 예시 데이터 (더미). 날짜는 오늘 기준으로 만든다. */
export function demoData(now = Date.now()): { profile: Profile; records: DecisionRecord[]; spendLog: SpendEntry[] } {
  const today = todayKST(new Date(now));
  const profile: Profile = {
    baseBalance: 900000,
    baseDate: today,
    baseSetAt: now,
    minBalance: 100000,
    dailySpend: 11000,
    items: [
      { id: 'demo-inc', kind: 'income', name: '알바비', amount: 950000, recurrence: 'monthly', day: 10 },
      { id: 'demo-rent', kind: 'expense', name: '월세', amount: 350000, recurrence: 'monthly', day: 25 },
      { id: 'demo-phone', kind: 'expense', name: '통신비', amount: 55000, recurrence: 'monthly', day: 15 },
      { id: 'demo-sub', kind: 'expense', name: '구독료', amount: 17000, recurrence: 'monthly', day: 5 },
    ],
    reflectedOnBaseDate: [],
    goal: { name: '겨울 여행', target: 800000, saved: 150000, monthlySaving: 100000, annualRate: 0 },
  };

  const rec = (i: number, p: Partial<DecisionRecord> & Pick<DecisionRecord, 'category' | 'params' | 'choice'>): DecisionRecord => ({
    id: `demo-rec-${i}`,
    createdAt: now - (20 - i) * 3600_000,
    source: 'decide',
    reflectedOverride: true,
    inParallel: true,
    parallelAs: p.choice === 'skip' ? 'buy' : 'skip',
    choiceAt: now - (20 - i) * 3600_000,
    ...p,
  });
  const records: DecisionRecord[] = [
    rec(1, { category: '패션', name: '겨울 패딩', params: { amount: 189000, date: addDays(today, -6), installments: 3 }, choice: 'buy', satisfaction: 4, reason: '작년 거 낡아서' }),
    rec(2, { category: '쇼핑', name: '무선 이어폰', params: { amount: 159000, date: addDays(today, -3) }, choice: 'skip', inParallel: false }),
    rec(3, { category: '문화·여가', name: '콘서트 티켓', params: { amount: 132000, date: addDays(today, 2) }, choice: 'buy' }),
    rec(4, { category: '패션', name: '러닝 스니커즈', params: { amount: 129000, date: today, altAmount: 69000, altName: '작년 모델' }, choice: 'alt', inParallel: false }),
  ];

  // 지난 45일 생활비 (평일 적게, 주말 많게)
  const rand = mulberry32(99);
  const cats: [string, string, number][] = [
    ['식비', '점심', 9000],
    ['카페', '아메리카노', 4500],
    ['식비', '배달 치킨', 21000],
    ['교통', '택시', 9800],
    ['생활', '다이소', 7000],
    ['카페', '디저트', 6500],
  ];
  const spendLog: SpendEntry[] = [];
  for (let i = 45; i >= 1; i--) {
    const date = addDays(today, -i);
    const [y, m, d] = date.split('-').map(Number);
    const wd = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const k = wd === 0 || wd === 6 ? 2 : 1;
    const count = Math.floor(rand() * 1.3 * k);
    for (let j = 0; j < count; j++) {
      const [category, name, base] = cats[Math.floor(rand() * cats.length)];
      spendLog.push({ date, category, name, amount: Math.round((base * (0.6 + rand() * 0.9)) / 100) * 100, from: 'demo' });
    }
  }
  return { profile, records, spendLog };
}
