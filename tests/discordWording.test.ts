import {expect,it} from 'vitest';
import {discordSummary} from '../server/lib/cardContent';
import type {Explanation} from '../server/lib/explain';

it('preserves the original four-line trade summary and dynamic fields',()=>{
  const headline='SK하이닉스 +5.72%: 시장 전체 강세·반도체 동반 상승 영향으로 보여요';
  const result=discordSummary({tradeId:'wording-test',code:'000660',side:'buy',qty:1,price:1294000,filledAt:1,priceSource:'naver'},'SK하이닉스',
    {source:'naver',time:Date.parse('2026-10-21T12:13:00+09:00')},{headline} as Explanation);
  expect(result).toBe('**[평행통장 · 모의투자]** SK하이닉스 1주 매수 (체결가 1,294,000원)\n'+headline+'\n카드뉴스 4장 · 네이버 금융 시세 10월 21일 12:13 기준\n실제 거래가 아닌 모의투자 기록이에요. 투자 권유가 아닙니다.');
  const other=discordSummary({tradeId:'another-test',code:'005930',side:'buy',qty:2,price:70000,filledAt:1,priceSource:'demo'},'삼성전자',{source:'demo',time:Date.parse('2026-11-15T08:00:00+09:00')});
  expect(other).toContain('삼성전자 2주 매수 (체결가 70,000원)');
  expect(other).toContain('예시 시세');
  expect(other).not.toContain('네이버 금융 시세');
});
