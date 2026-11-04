import { describe, expect, it } from 'vitest';
import { checkAiInput, checkAiOutput } from '../shared/aiSchemas';
import { AI_PROMPTS, numbersGrounded } from '../shared/aiPrompts';
import { cashflowInputOf, cashflowMethodLabel } from '../src/lib/ai/cashflow';
import { exampleCashflow } from '../src/lib/ai/example';
import { seedDemoState } from '../src/lib/demoSeed';
import { initialState } from '../src/state/store';
import { assessRisk } from '../src/lib/moa/risk';
import { appNow, appDay } from '../src/lib/appClock';

describe('기획서 AI 현금흐름 코치 (LLM 문장 / 기준선·ML / 정확한 계산 분리)', () => {
  const demo = () => seedDemoState(initialState());
  const input = () => {
    const s = demo();
    return cashflowInputOf(assessRisk(s.moa, appNow(s), appDay(s)));
  };

  it('S01 위험 계산을 재계산하지 않고 실제 계산 결과만 AI에 전달', () => {
    const s = demo();
    const r = assessRisk(s.moa, appNow(s), appDay(s));
    const i = cashflowInputOf(r);
    expect(i.payment?.shortBy).toBe(r.worst?.shortBy);
    expect(i.payment?.grade).toBe(r.worst?.grade);
    expect(i.accountBalance).toBe(27800);
    expect(i.forecastMethod).toBe(r.forecast.ready.ready ? 'weekday' : 'none');
    expect(checkAiInput('cashflow', i).ok).toBe(true);
    expect(cashflowMethodLabel(i)).not.toContain('채택된 ML');
  });

  it('오프라인 예시 응답도 스키마를 통과하고 AI 연결로 오인되지 않는 별도 출처를 유지', () => {
    const i = input();
    const out = exampleCashflow(i);
    expect(checkAiOutput('cashflow', out).ok).toBe(true);
    expect(out.insight.length).toBeGreaterThan(5);
    expect(numbersGrounded('cashflow', i, out)).toBe(true);
    expect(out.nextStep).not.toMatch(/대출|투자 권유/);
  });

  it('ML 연결 상태와 결제일 계산 결과를 혼동하지 않는다', () => {
    const i = input();
    expect(cashflowMethodLabel({ ...i, forecastMethod: 'ml' })).toBe('채택된 ML 변동지출 예측');
    expect(cashflowMethodLabel({ ...i, forecastMethod: 'none' })).toBe('등록된 입출금 일정 기준');
    expect(AI_PROMPTS.cashflow.system).toContain('위험 등급');
    expect(AI_PROMPTS.cashflow.system).toContain('재판단');
    expect(checkAiInput('cashflow', { ...i, forecastMethod: 'unknown' }).ok).toBe(false);
    expect(checkAiOutput('cashflow', { insight: '대충', nextStep: '확인', invented: 123 }).ok).toBe(false);
  });
});
