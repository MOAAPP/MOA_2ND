import type { QuoteSource } from './market';

export function formatSourceLabel(source: QuoteSource, live = false): string {
  switch (source) {
    case 'kis':
      return live ? '한국투자증권 실시간 체결' : '한국투자증권 시세';
    case 'naver':
      return '네이버 금융 시세';
    case 'yahoo':
      return 'Yahoo Finance 지연 시세';
    case 'demo':
      return '예시 시세';
  }
}

export function sourceShort(source: QuoteSource, live = false): string {
  switch (source) {
    case 'kis':
      return live ? '실시간' : 'KIS';
    case 'naver':
      return '네이버';
    case 'yahoo':
      return '지연 시세';
    case 'demo':
      return '예시 시세';
  }
}
