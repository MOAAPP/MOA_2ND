import { useEffect, useMemo, useState } from 'react';
import type { DecisionRecord } from '../types';
import { ruleClassify } from './classify';
import { ruleForecast, type ForecastInput } from './forecast';
import { analyzePersonalSpending } from './personalModel';
import type { Classification, SpendEntry, SpendingForecast } from './types';

/**
 * ML provider 연결부.
 * VITE_ML_API_URL 이 없으면 규칙 기반만 쓰고, 있으면 모델 API를 먼저 부른 뒤
 * 실패·지연(2.5초) 시 규칙 기반으로 자동으로 돌아간다. 발표 중 서버가 죽어도 화면은 그대로 동작.
 *
 *   POST {ML}/forecast  body: ForecastRequest  → SpendingForecast
 *   POST {ML}/classify  body: { name }         → Classification
 */
const ML_URL: string | undefined = (import.meta as unknown as { env?: Record<string, string> }).env?.VITE_ML_API_URL || undefined;
const TIMEOUT_MS = 2500;

export const mlConfigured = !!ML_URL;

async function post<T>(path: string, body: unknown): Promise<T | null> {
  if (!ML_URL) return null;
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${ML_URL.replace(/\/$/, '')}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  } finally {
    window.clearTimeout(t);
  }
}

/** 기록 → 생활비 기록. 사기 전 확인에서 '샀다/대안'으로 남긴 것과 이미 쓴 돈 기록을 쓴다. */
export function spendHistory(records: DecisionRecord[], log: SpendEntry[], today: string): SpendEntry[] {
  const fromRecords: SpendEntry[] = [];
  for (const r of records) {
    if (r.params.date > today) continue;
    if (r.choice === 'buy') fromRecords.push({ date: r.params.date, amount: r.params.amount, category: r.category, name: r.name, from: 'record' });
    else if (r.choice === 'alt' && r.params.altAmount) fromRecords.push({ date: r.params.date, amount: r.params.altAmount, category: r.category, name: r.params.altName ?? r.name, from: 'record' });
  }
  return [...fromRecords, ...log];
}

/** 생활비 예측 훅: 규칙 기반 결과를 바로 쓰고, 모델 응답이 오면 교체 */
export function useSpendingForecast(input: ForecastInput): SpendingForecast {
  const key = JSON.stringify([input.from, input.to, input.today, input.dailySpend, input.history.map((h) => [h.date,h.amount,h.category,h.from])]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const rule = useMemo(() => analyzePersonalSpending(input).forecast ?? ruleForecast(input), [key]);
  const [model, setModel] = useState<{ key: string; f: SpendingForecast } | null>(null);
  useEffect(() => {
    if (!ML_URL) return;
    let alive = true;
    post<SpendingForecast>('/forecast', { from: input.from, to: input.to, today: input.today, dailySpend: input.dailySpend, history: input.history }).then((f) => {
      if (alive && f && Array.isArray(f.days) && f.days.length) setModel({ key, f: { ...f, engine: 'model' } });
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return model && model.key === key ? model.f : rule;
}

/** 상품명 자동 분류 훅 (입력 멈춘 뒤 0.3초) */
export function useClassifier(name: string, memory: Record<string, string>): { result: Classification | null; pending: boolean } {
  const [state, setState] = useState<{ name: string; result: Classification | null }>({ name: '', result: null });
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const n = name.trim();
    if (n.length < 2) {
      setState({ name: n, result: null });
      setPending(false);
      return;
    }
    setPending(true);
    let alive = true;
    const t = window.setTimeout(async () => {
      const rule = ruleClassify(n, memory);
      let result = rule;
      if (ML_URL && rule?.engine !== 'memory') {
        const m = await post<Classification>('/classify', { name: n });
        if (m && m.category) result = { ...m, engine: 'model' };
      }
      if (alive) {
        setState({ name: n, result });
        setPending(false);
      }
    }, 300);
    return () => {
      alive = false;
      window.clearTimeout(t);
    };
  }, [name, memory]);
  return { result: state.name === name.trim() ? state.result : null, pending };
}

export function forecastBasisText(f: SpendingForecast): string {
  const eng = f.engine === 'model' ? `서버 모델(${f.modelName ?? 'ML'})` : f.engine === 'local' ? '기기 내 학습 모델' : '규칙 기반';
  switch (f.basis) {
    case 'none':
      return '생활비 정보가 없어 일정만으로 계산했어요';
    case 'profile':
      return `입력한 하루 평균 생활비로 예측 · ${eng}`;
    case 'blend':
      return `입력값 + 내 기록 ${f.historyDays}일(${Math.round(f.personalWeight * 100)}% 반영) · ${eng}`;
    case 'history':
      return `내 기록 ${f.historyDays}일·${f.historyCount}건으로 예측 · ${eng}`;
  }
}
