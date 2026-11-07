import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  setTab: vi.fn(),
}));

vi.mock('../src/state/store', () => ({
  useStore: () => ({
    state: {
      demo: true, demoDay: '2026-11-04',
      moa: { dayStatus: {'2026-11-04':'self'} },
      worldWallet: {
        cash:27800, openingCash:900000, fixedBills:486000,
        savings:0, deposit:0, installment:0,
        etfs:{},
        decisions:[{
          id:'user-choice-1', title:'가상 무선 이어폰', price:150000,
          paid:0, choice:'wait', note:'비교용',
          at:Date.parse('2026-11-03T12:00:00+09:00'),
          simulatedOnly:true,
        }],
        movements:[],
      },
    },
  }),
}));
vi.mock('../src/state/nav', () => ({
  useNav: () => ({push:mocks.push,setTab:mocks.setTab}),
}));
vi.mock('../src/state/wallet', () => ({
  useWallet: () => ({
    summary:{
      cash:27800, freeSavings:0, deposit:0, installment:0,
      stockValue:0, totalAssets:27800, monthlyUsable:-608200,
      protectedBills:486000, protectedBuffer:150000,
    },
    wallet:{
      cash:27800, openingCash:900000, fixedBills:486000,
      decisions:[{
        id:'test-1', title:'가상 이어폰', price:150000, paid:0,
        choice:'wait', note:'demo', at:Date.parse('2026-11-03T12:00:00+09:00'),
        simulatedOnly:true,
      }],
      movements:[],etfs:{},savings:0,deposit:0,installment:0,
    },
  }),
}));
vi.mock('../src/state/moa', () => ({
  useMoa: () => ({ report:{ worst:{shortBy:8200} } }),
}));
vi.mock('../src/screens/moa/parts', () => ({
  ShortfallCard: () => createElement('section', {'data-testid':'payment-risk'}, 'PAYMENT_RISK'),
}));
vi.mock('../src/screens/Ledger', () => ({
  useSpending: () => ({
    today:'2026-11-04',
    all:[
      {date:'2026-11-04',amount:1500,name:'지하철',category:'교통',txnId:'a'},
      {date:'2026-11-04',amount:3000,name:'간식',category:'식비',txnId:'b'},
      {date:'2026-11-04',amount:9200,name:'점심 국밥',category:'식비',txnId:'c'},
      {date:'2026-11-04',amount:7600,name:'필기구',category:'학업',txnId:'d'},
      {date:'2026-11-04',amount:9700,name:'생활용품',category:'생활',txnId:'e'},
    ],
  }),
  Row: ({e}:{e:{name:string}}) => createElement('div',null,e.name),
}));

vi.mock('../src/components/QuickExpense', () => ({
  QuickExpense: () => createElement('form', {'aria-label':'한 줄 지출 기록'}, '빠르게 지출 기록'),
}));

import { V8Home } from '../src/screens/V8Finance';

describe('active V8Home design hierarchy', () => {
  it('shows one coherent financial journey with observed 5-spend daily summary', () => {
    const html = renderToStaticMarkup(createElement(V8Home));
    // V23 order: 결제계좌 상태 → 오늘 쓴 돈(한 줄 기록) → 사기 전 비교 → 평행세계
    const sections = [
      'aria-label="결제계좌 상태"',
      'id="v23-spend-title"',
      'id="v23-compare-title"',
      'id="v23-world-title"',
    ];
    const positions = sections.map(x => html.indexOf(x));
    expect(positions.every(i => i >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a,b)=>a-b));
    // Money block starts in an explicit loading state, never with guessed numbers.
    expect(html).toContain('aria-busy="true"');
    expect(html).not.toContain('27,800원');
    // No AI branding on numbers when AI is not used; comparison is deterministic.
    expect(html).not.toContain('모아 AI');
    // Compare waits for the API balance instead of guessing an allocation cap.
    expect(html).toContain('disabled="">잔액을 불러오는 중이에요');
    expect(html).toContain('비교할 금액');
    expect(html).toContain('직접 입력');
    expect(html).toContain('한 줄 지출 기록');
    expect(html).toContain('바로 지출 기록');
    expect(html).not.toContain('AI에게 원하는 소비 조건을 말해 주세요');
    expect(html).not.toContain('예시 AI 응답');
    expect(html).not.toContain('PAYMENT_RISK'); // never mix local risk with S01 FastAPI
    expect(html).not.toContain('Python 계산');
    expect(html).not.toContain('FastAPI');
    expect(html).not.toContain('SANDBOX');
    expect(html).toContain('31,000원');
    expect(html).toContain('5건');
    expect(html).toContain('이번 달');
    expect(html).toContain('오늘 내역 5건 모두 보기');
    expect(html).toContain('상품 캡처로 가격 불러오기');
    expect(html).toContain('정가로 샀을 때와의 차이');
    expect(html).not.toContain('자유 저축</');
    // Presenter date control stays available but compact.
    expect(html).toContain('체험 기준일 (시연용)');
  });
});
