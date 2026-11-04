import { useState } from 'react';
import { won } from '../../shared/format';
import { analyzeSms, confirmSms, type ParsedTransaction, type ParsedKind, type PaymentMethod } from '../lib/stage2Api';
import { Sheet, Spinner } from './ui';

const kinds: ParsedKind[] = [
  'debit_approval', 'credit_approval', 'card_bill', 'installment_approval',
  'account_in', 'account_out', 'automatic_transfer', 'salary', 'allowance',
  'refund', 'cancellation', 'atm_withdrawal', 'unclassified',
];
const methods: PaymentMethod[] = ['debit', 'credit', 'transfer', 'cash', 'atm', 'unknown'];
const kindLabels: Record<ParsedKind, string> = {
  debit_approval: '체크카드 승인', credit_approval: '신용카드 승인',
  card_bill: '신용카드 청구 출금', installment_approval: '신용카드 할부 승인',
  account_in: '계좌 입금', account_out: '계좌 출금', automatic_transfer: '자동이체',
  salary: '급여', allowance: '용돈', refund: '환불', cancellation: '취소',
  atm_withdrawal: 'ATM 현금 인출', unclassified: '분류 확인 필요',
};
const methodLabels: Record<PaymentMethod, string> = {
  debit: '체크카드', credit: '신용카드', transfer: '계좌이체',
  cash: '현금', atm: 'ATM', unknown: '확인 필요',
};

export function Stage2Sms({ onClose }: { onClose: () => void }) {
  const [raw, setRaw] = useState('');
  const [items, setItems] = useState<ParsedTransaction[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [completed, setCompleted] = useState<Record<string, true>>({});
  const [info, setInfo] = useState('');

  async function analyze() {
    if (!raw.trim()) return;
    setBusy(true); setError('');
    setCompleted({});
    try {
      const response = await analyzeSms('S01', raw);
      setItems(response.transactions);
      setRaw(''); // Clear original SMS immediately after parsing.
      setInfo(response.skipped ? response.skipped + '건은 파싱하지 못했어요.' : '');
    } catch (e) {
      setError(e instanceof Error ? e.message : '문자 분석 실패');
    } finally { setBusy(false); }
  }
  function patch(index: number, changes: Partial<ParsedTransaction>) {
    setItems(old => old?.map((row, i) => i === index ? { ...row, ...changes } : row) ?? null);
    setError('');
  }
  async function save(index: number) {
    const row = items?.[index];
    if (!row) return;
    if (!row.amount || !row.occurred_at || row.payment_method === 'unknown' || row.kind === 'unclassified') {
      setError('금액·일시·거래 유형·결제 수단을 먼저 확인해주세요.');
      return;
    }
    setBusy(true); setError('');
    try {
      const result = await confirmSms('S01', row);
      setCompleted(prev => ({ ...prev, [row.source_id]: true }));
      setInfo(result.warnings.join(' ') || '확인된 거래로 저장했어요.');
    } catch (e) {
      setError(e instanceof Error ? e.message : '저장 실패');
    } finally { setBusy(false); }
  }
  return <Sheet title="결제 문자 가져오기" onClose={onClose}>
    <p className="sheet-note">합성 사용자 S01의 개발용 입력 화면이에요. 원본 문자는 저장하지 않고, 구조화된 거래만 별도 파일에 저장합니다.</p>
    {!items && <>
      <label className="field"><span className="lab">결제 문자 붙여넣기</span>
        <textarea className="lg-textarea" rows={6} placeholder="카드 승인·계좌 출금·입금 문자 등을 붙여넣으세요."
          value={raw} onChange={e => setRaw(e.target.value.slice(0, 12000))} /></label>
      <p className="sheet-note">규칙으로만 분석하며 금융 문자를 외부 AI에 보내지 않아요. 읽지 못한 항목은 직접 확인할 수 있어요.</p>
      <button className="btn primary block" disabled={busy || raw.trim().length < 4}
        onClick={() => void analyze()}>거래 내역 분석하기</button>
    </>}
    {busy && <Spinner label="거래 확인 중…" />}
    {error && <p className="sheet-note" style={{ color: 'var(--danger)' }} role="alert">{error}</p>}
    {info && <p className="sheet-note">{info}</p>}
    {items && <>
      <button className="btn ghost" onClick={() => { setItems(null); setError(''); }}>다른 문자 분석하기</button>
      <p className="sheet-note">{items.length}건 인식 · 모든 거래는 확인 후 개별 저장</p>
      {items.map((row, i) => {
        const done = !!completed[row.source_id];
        return <section className="nc-card" key={row.source_id + i} style={{ marginTop: 12 }}>
          <p><b>{row.merchant ?? row.issuer ?? '가맹점 확인 필요'}</b>
            {row.duplicate_possible && <small className="sheet-note"> · 중복 가능</small>}</p>
          <p><b>{row.amount == null ? '금액 확인 필요' : won(row.amount)}</b>
            <small className="sheet-note"> · {row.parsing_source === 'rules' ? '규칙 분석' : '직접 확인 필요'}</small></p>
          <label className="field"><span className="lab">거래 상대</span>
            <input className="input" value={row.merchant ?? ''} onChange={e => patch(i, { merchant: e.target.value })} /></label>
          <label className="field"><span className="lab">거래 유형</span>
            <select className="input" value={row.kind} onChange={e => patch(i, { kind: e.target.value as ParsedKind })}>
              {kinds.map(kind => <option key={kind} value={kind}>{kindLabels[kind]}</option>)}
            </select></label>
          <label className="field"><span className="lab">결제 수단</span>
            <select className="input" value={row.payment_method}
              onChange={e => patch(i, { payment_method: e.target.value as PaymentMethod })}>
              {methods.map(method => <option key={method} value={method}>{methodLabels[method]}</option>)}
            </select></label>
          <label className="field"><span className="lab">금액 (원)</span>
            <input className="input" inputMode="numeric" value={row.amount ?? ''}
              onChange={e => patch(i, { amount: e.target.value ? Number(e.target.value.replace(/\D/g, '')) : null })} /></label>
          <label className="field"><span className="lab">승인·발생 시각 (ISO8601)</span>
            <input className="input" value={row.occurred_at ?? ''} placeholder="2026-11-05T12:10:00+09:00"
              onChange={e => patch(i, { occurred_at: e.target.value || null })} /></label>
          <label className="field"><span className="lab">실제 출금 시각 (불확실하면 비워두기)</span>
            <input className="input" value={row.debit_at ?? ''} placeholder="신용카드 승인은 실제 출금일 확인 필요"
              onChange={e => patch(i, { debit_at: e.target.value || null })} /></label>
          {row.uncertainty.length > 0 && <p className="sheet-note">
            추출 불확실성: {row.uncertainty.join(', ')} · 직접 확인 후 저장해주세요.</p>}
          <button className="btn primary block" disabled={busy || done || row.duplicate_possible}
            onClick={() => void save(i)}>
            {done ? '저장 완료' : row.duplicate_possible ? '기존 거래 확인 필요' : '검토한 실제 거래 등록'}
          </button>
        </section>;
      })}
    </>}
  </Sheet>;
}
