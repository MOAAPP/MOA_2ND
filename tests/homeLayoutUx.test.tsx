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

import { V8Home } from '../src/screens/V8Finance';

describe('active V8Home design hierarchy', () => {
  it('shows one coherent financial journey with observed 5-spend daily summary', () => {
    const html = renderToStaticMarkup(createElement(V8Home));
    const sections = [
      'PAYMENT_RISK',
      '오늘의 가계부',
      '소비 선택 비교하기',
      '나의 평행세계',
      '가상 자산 · 분석',
    ];
    const positions = sections.map(x => html.indexOf(x));
    expect(positions.every(i => i >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a,b)=>a-b));
    expect(html).toContain('31,000원');
    expect(html).toContain('기록 5건');
    expect(html).toContain('이번 달 기록된 지출');
    expect(html).toContain('지출 추가하기');
    expect(html).toContain('오늘 내역 보기');
    expect(html).toContain('결제계좌에 부족 위험이 있어요');
    expect(html).toContain('aria-expanded="false"');
    expect(html.match(/소비 선택 비교하기/g) ?? []).toHaveLength(2); // section aria and ONE button
    expect(html).not.toContain('자유 저축</');
    expect(html).not.toContain('사고 싶은 게 있어요');
    expect(html).not.toContain('사기 전에 비교하기');
    expect(html).toContain('11월 4일까지 관측된 합성 기록');
  });
});
