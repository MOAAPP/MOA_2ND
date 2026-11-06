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
    const sections = [
      'aria-label="오늘의 금융 분석"',
      'aria-label="오늘의 가계부"',
      'aria-label="소비 선택 비교하기"',
      'aria-label="평행세계 비교 결과"',
    ];
    const positions = sections.map(x => html.indexOf(x));
    expect(positions.every(i => i >= 0)).toBe(true);
    expect(positions).toEqual([...positions].sort((a,b)=>a-b));
    expect(html).toContain('모아 AI');
    expect(html).toContain('30,000원 지금 써도 될까?');
    expect(html).toContain('금액만 입력해서 비교하기');
    expect(html).toContain('비교할 소비 금액');
    expect(html).toContain('직접 입력');
    expect(html).toContain('한 줄 지출 기록');
    expect(html).toContain('바로 지출 기록');
    expect(html).not.toContain('AI에게 원하는 소비 조건을 말해 주세요');
    expect(html).not.toContain('AI에게 내 소비 계획 물어보기');
    expect(html).not.toContain('예시 AI 응답');
    expect(html).not.toContain('PAYMENT_RISK'); // never mix local risk with S01 FastAPI
    expect(html).not.toContain('Python 계산');
    expect(html).not.toContain('FastAPI');
    expect(html).not.toContain('SANDBOX');
    expect(html).not.toContain('가상 자산 · 분석');
    expect(html).not.toContain('aria-expanded="false"');
    expect(html).toContain('31,000원');
    expect(html).toContain('기록 5건');
    expect(html).toContain('이번 달 기록된 지출');
    expect(html).toContain('지출 추가하기');
    expect(html).toContain('오늘 내역 보기');
    expect(html).toContain('상품 캡처로 입력하기');
    expect(html).toContain('움직이는 그래프로 비교하기');
    expect(html).not.toContain('자유 저축</');
    expect(html).toContain('11월 4일까지 관측된 합성 기록');
  });
});
