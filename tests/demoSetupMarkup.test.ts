import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { QuickStart } from '../src/screens/moa/MoaSetup';
import { StoreProvider } from '../src/state/store';

describe('first setup screen rendered in the screenshot', () => {
  it('defaults to fully seeded demo preview, not a 0 KRW manual keypad', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-04T16:02:00+09:00'));
    try {
      const html = renderToStaticMarkup(createElement(
        StoreProvider,
        null,
        createElement(QuickStart, { onDemo: () => {} }),
      ));
      expect(html).toContain('예시 데이터 · 입력 없이 시작');
      expect(html).toContain('결제계좌 잔액');
      expect(html).toContain('27,800원');
      expect(html).toContain('350,000원');
      expect(html).toContain('950,000원');
      expect(html).toContain('347,000원');
      expect(html).toContain('이 예시 데이터로 바로 시작');
      expect(html).toContain('내 잔액과 결제일 직접 입력하기');
      expect(html).toContain('5건');
      expect(html).not.toContain('필수결제가 빠져나가는');
    } finally {
      vi.useRealTimers();
    }
  });
});
