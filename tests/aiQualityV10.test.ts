import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AI_PROMPTS, FINANCIAL_REVIEW_V10, numbersGrounded } from '../shared/aiPrompts';
import { aiStats, politeOutput, resetAiStats, runAiTask } from '../server/lib/ai';
import type { CoachIn } from '../shared/aiPrompts';

const coachInput: CoachIn = {
  item: '운동화', category: '패션', price: 50000, frequency: 'once',
  usableNow: 100000, usableAfter: 50000, afterBills: 120000,
  yearGap: 50000, categorySpentThisMonth: 20000, categoryCount30: 2,
};

describe('금융 AI v10 품질 게이트 (실제 API 호출 없는 합성 테스트)', () => {
  beforeEach(() => resetAiStats());
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('10단계 금융 검토의 모든 기준을 포함한다', () => {
    for (let n = 1; n <= 10; n++) expect(FINANCIAL_REVIEW_V10).toContain(n + '. ');
    for (const task of ['brief', 'coach', 'ledgerSummary', 'ask'] as const) {
      expect(AI_PROMPTS[task].system).toContain('존댓말');
      expect(AI_PROMPTS[task].system).toContain('10단계');
    }
  });

  it.each([
    ['brief', { headline: '지출 점검', body: '예정된 지출을 확인해 보세요.', action: null }, true],
    ['brief', { headline: '지출 점검', body: '돈 나갈 거야.', action: null }, false],
    ['coach', { tone: 'careful', message: '생활비 안전선을 확인해 주세요.', tip: '결제일을 확인해 보세요.' }, true],
    ['coach', { tone: 'careful', message: '그냥 사도 돼.', tip: null }, false],
    ['coach', { tone: 'warn', message: '현재는 부족합니다.', tip: '네가 알아서 해.' }, false],
    ['ledgerSummary', { title: '소비 패턴', points: ['카페 지출이 가장 높습니다.', '다음 결제를 확인해 보세요.'] }, true],
    ['ledgerSummary', { title: '소비 패턴', points: ['커피 너무 많이 마셔.', '다음 결제를 확인해 보세요.'] }, false],
    ['ask', { answer: '현재 이용 가능한 금액은 확인된 기록을 기준으로 계산합니다.', followUps: ['다른 선택도 비교해 볼까요?', '어떤 기록이 더 필요할까요?'] }, true],
    ['ask', { answer: '그냥 믿어.', followUps: ['왜?'] }, false],
  ] as const)('작업 %s의 응답 문체를 검증한다', (task, output, expected) => {
    expect(politeOutput(task, output)).toBe(expected);
  });

  it('금융 액수를 새로 만들어 낸 답변은 거부한다', () => {
    expect(numbersGrounded('coach', coachInput, { tone: 'ok', message: '999,999원 남아요.', tip: null })).toBe(false);
    expect(numbersGrounded('coach', coachInput, { tone: 'ok', message: '50,000원 남아요.', tip: null })).toBe(true);
  });

  it('반말 응답은 한 번 다시 생성하고, 존댓말이 검증되어야 성공한다', async () => {
    vi.stubEnv('FACTCHAT_API_KEY', 'synthetic-test-key');
    const responses = [
      { tone: 'ok', message: '그냥 사도 돼.', tip: null },
      { tone: 'ok', message: '필수지출을 확인해 보세요.', tip: '구매 전 잔액을 비교해 보세요.' },
    ];
    const mockFetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify(responses.shift()) }, finish_reason: 'stop' }],
    }), { status: 200, headers: { 'content-type': 'application/json' } }));
    const log = vi.spyOn(console, 'info').mockImplementation(() => {});
    const result = await runAiTask('coach', coachInput, mockFetcher as never);
    expect(result.ok).toBe(true);
    expect(mockFetcher).toHaveBeenCalledTimes(2);
    expect(aiStats().coach.ok).toBe(1);
    expect(aiStats().coach.p95Ms).not.toBeNull();
    expect(aiStats().coach.sampleCount).toBe(1);
    expect(log.mock.calls[0]?.[0]).not.toContain('운동화');
  });

  it('반말을 반복하거나 근거 없는 숫자를 내면 성공으로 보고하지 않는다', async () => {
    vi.stubEnv('FACTCHAT_API_KEY', 'synthetic-test-key');
    const mockFetcher = vi.fn(async () => new Response(JSON.stringify({
      choices: [{ message: { content: JSON.stringify({ tone: 'warn', message: '안 돼.', tip: null }) } }],
    }), { status: 200 }));
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const result = await runAiTask('coach', coachInput, mockFetcher as never);
    expect(result).toMatchObject({ ok: false, reason: 'impolite' });
    expect(aiStats().coach.fail.impolite).toBe(1);
    expect(mockFetcher).toHaveBeenCalledTimes(2);
  });
});
