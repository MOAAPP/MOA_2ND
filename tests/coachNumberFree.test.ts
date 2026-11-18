import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coachSignals, coachSummary, coachTone, composeCoach, hasNumericContent, type CoachIn } from '../shared/aiPrompts';
import { aiStats, checkCoachAdvice, resetAiStats, runAiTask } from '../server/lib/ai';

const base: CoachIn = {
  item: '에어팟 프로2', category: '쇼핑', price: 359000, frequency: 'once',
  usableNow: 412300, usableAfter: 53300, afterBills: 180000,
  yearGap: 359000, categorySpentThisMonth: 42000, categoryCount30: 1,
};

const reply = (content: unknown) => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(content) }, finish_reason: 'stop' }],
}), { status: 200, headers: { 'content-type': 'application/json' } });

describe('구매 전 코치: 모델에는 금액을 넘기지 않는다', () => {
  beforeEach(() => resetAiStats());
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it('모델 입력에는 숫자가 하나도 없다', () => {
    const s = JSON.stringify(coachSignals(base));
    expect(s).not.toMatch(/[0-9]/);
    expect(coachSignals(base).signals.largeShareOfUsable).toBe(true);
  });

  it('위험 등급은 코드가 정한다', () => {
    expect(coachTone(base)).toBe('careful');
    expect(coachTone({ ...base, afterBills: -150000, usableAfter: -200000 })).toBe('warn');
    expect(coachTone({ ...base, price: 4800, usableAfter: 407500 })).toBe('ok');
  });

  it('요약 문장의 금액은 계산값에서만 나온다', () => {
    expect(coachSummary({ ...base, afterBills: -150000, usableAfter: -200000 })).toContain('150,000원 모자라요');
    expect(coachSummary({ ...base, usableAfter: -20000 })).toContain('지켜둘 돈을 20,000원');
    expect(coachSummary(base)).toContain('359,000원');
  });

  it.each([
    ['3만 원을 아끼면 좋아요.', true],
    ['삼만원을 아끼면 좋아요.', true],
    ['１０％ 줄여 보세요.', true],
    ['-5 정도면 괜찮아요.', true],
    ['이번 달 결제 일정을 먼저 확인해 보세요.', false],
    ['한 번 더 생각해 보세요.', false],
    ['이만큼이면 충분해요.', false],
  ])('숫자 표현 검사: %s → %s', (text, expected) => {
    expect(hasNumericContent(text)).toBe(expected);
  });

  it('조언 검사: 숫자·반말·형식 오류를 각각 사유 코드로 돌려준다', () => {
    expect(checkCoachAdvice({ message: '3만 원 아껴요.', tip: null })).toEqual({ ok: false, reason: 'numeric_content' });
    expect(checkCoachAdvice({ message: '그냥 사.', tip: null })).toEqual({ ok: false, reason: 'impolite' });
    expect(checkCoachAdvice({ text: '필수 결제를 확인해 보세요.' })).toEqual({ ok: false, reason: 'invalid_output' });
    expect(checkCoachAdvice({ message: '필수 결제를 먼저 확인해 보세요.', tip: null })).toMatchObject({ ok: true });
  });

  it('성공하면 요약(코드) + 조언(모델)을 합치고, 모델 요청에는 금액이 없다', async () => {
    vi.stubEnv('FACTCHAT_API_KEY', 'synthetic-test-key');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetcher = vi.fn(async () => reply({ message: '꼭 지금 필요한지 한 번 더 생각해 보세요.', tip: '장바구니에 담아 두고 하루 뒤에 다시 보세요.' }));
    const r = await runAiTask('coach', base, fetcher as never);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const out = r.data as { tone: string; message: string };
    expect(out.tone).toBe('careful');
    expect(out.message.startsWith(coachSummary(base))).toBe(true);
    const sent = JSON.stringify((fetcher.mock.calls[0] as unknown[])[1] ?? fetcher.mock.calls[0]);
    expect(sent).not.toContain('359000');
    expect(sent).not.toContain('412300');
  });

  it('숫자를 계속 쓰면 성공으로 보고하지 않고 numeric_content로 센다', async () => {
    vi.stubEnv('FACTCHAT_API_KEY', 'synthetic-test-key');
    vi.spyOn(console, 'info').mockImplementation(() => {});
    const fetcher = vi.fn(async () => reply({ message: '하루 6,625원으로 생활하면 괜찮아요.', tip: null }));
    const r = await runAiTask('coach', base, fetcher as never);
    expect(r).toMatchObject({ ok: false, reason: 'numeric_content' });
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(aiStats().coach.fail.numeric_content).toBe(1);
  });

  it('규칙 문장으로 합쳐도 출력 형식을 지킨다', () => {
    const out = composeCoach(base, null);
    expect(out.tone).toBe('careful');
    expect(out.message).toContain('359,000원');
    expect(hasNumericContent(out.message.replace(coachSummary(base), ''))).toBe(false);
  });
});
