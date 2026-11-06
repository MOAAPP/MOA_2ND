import { useState, type FormEvent } from 'react';
import { useToast } from './ui';
import { appDay, appNow } from '../lib/appClock';
import { ruleClassify } from '../lib/ml/classify';
import { METHOD_LABEL, type PayMethod } from '../lib/moa';
import { parseQuickExpense } from '../lib/quickExpense';
import { useMoa } from '../state/moa';
import { useStore } from '../state/store';

/** A single line, one confirmation, and no mandatory category/date wizard. */
export function QuickExpense({ compact = false }: { compact?: boolean }) {
  const { state } = useStore();
  const { moa, saveTxns } = useMoa();
  const toast = useToast();
  const [text, setText] = useState('');
  const [method, setMethod] = useState<PayMethod>(
    moa.mainMethod === 'credit' || moa.mainMethod === 'transfer' || moa.mainMethod === 'cash'
      ? moa.mainMethod : 'debit',
  );
  const [error, setError] = useState('');
  const save = (event: FormEvent) => {
    event.preventDefault();
    const parsed = parseQuickExpense(text);
    if (!parsed) {
      setError('내역과 금액을 함께 적어주세요. 예: 커피 4,500원');
      return;
    }
    const guess = ruleClassify(parsed.name, state.categoryMemory);
    const category = guess && guess.confidence >= 0.5 ? guess.category : '기타';
    const date = appDay(state);
    const outcome = saveTxns([{
      occurredAt: appNow(state),
      date,
      amount: parsed.amount,
      kind: 'spend',
      method,
      account: method === 'cash' ? 'cash' : method === 'credit' ? 'other' : 'pay',
      name: parsed.name,
      category,
      essential: false,
      source: 'manual',
    }]);
    if (!outcome.saved) {
      setError('이미 저장된 기록이거나 저장하지 못했어요. 가계부에서 확인해 주세요.');
      return;
    }
    toast(`${parsed.name} · ${parsed.amount.toLocaleString('ko-KR')}원 기록했어요`);
    setText('');
    setError('');
  };

  return (
    <form className={`quick-expense ${compact ? 'quick-expense-compact' : ''}`} onSubmit={save} aria-label="한 줄 지출 기록">
      <label htmlFor={compact ? 'quick-expense-home' : 'quick-expense-ledger'}>빠르게 지출 기록</label>
      <div className="quick-expense-field">
        <input
          id={compact ? 'quick-expense-home' : 'quick-expense-ledger'}
          aria-label="지출 한 줄 입력"
          value={text}
          maxLength={80}
          placeholder="예: 커피 4,500원"
          autoComplete="off"
          enterKeyHint="done"
          onChange={event => { setText(event.target.value); setError(''); }}
        />
        <button type="submit" disabled={!text.trim()}>기록</button>
      </div>
      <div className="quick-expense-bottom">
        <label>결제수단
          <select value={method} aria-label="빠른 기록 결제수단" onChange={event => setMethod(event.target.value as PayMethod)}>
            {(['debit', 'credit', 'transfer', 'cash'] as const).map(key =>
              <option key={key} value={key}>{METHOD_LABEL[key]}</option>)}
          </select>
        </label>
        <small>내역과 금액만 적으면 바로 저장돼요</small>
      </div>
      {error && <p className="quick-expense-error" role="alert">{error}</p>}
      {state.demo && <small className="quick-expense-demo-note">체험 기록에 추가돼요 · 상단 AI 브리핑은 기존 체험 기준일의 분석이에요</small>}
    </form>
  );
}
