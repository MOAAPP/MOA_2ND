import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { Onboarding } from '../src/screens/Onboarding';

describe('onboarding: an immediate, visible and safe example entry', () => {
  it('lets a new visitor start the populated S01 sample on the first screen', () => {
    const markup = renderToStaticMarkup(createElement(Onboarding, { onDemo: () => {}, onDone: () => {} }));
    expect(markup).toContain('일단 예시 데이터로 시작하기');
    expect(markup).toContain('기능 설명 먼저 보기');
    expect(markup).toContain('결제일에 돈이 모자랄까?');
    expect(markup).toContain('ob-secondary');
    expect(markup).not.toContain('잔액과 가장 가까운 필수결제');
  });

  it('when replaying onboarding, returns to existing records rather than resetting the example', () => {
    const markup = renderToStaticMarkup(createElement(Onboarding, {
      onDemo: () => {}, onDone: () => {}, existingData: true,
    }));
    expect(markup).toContain('기존 기록으로 돌아가기');
    expect(markup).not.toContain('일단 예시 데이터로 시작하기');
  });
});
