import { useState } from 'react';
import { won } from '../../shared/format';
import { readPurchaseImage, type OcrResult } from '../lib/ocr';
import { OptionList } from './flow';
import { Sheet, Spinner } from './ui';

/**
 * 사진 → 금액·이름. 읽는 동안 시트로 진행 상황을 보여주고,
 * 결과는 바로 넣지 않고 한 번 확인받는다 (OCR은 틀릴 수 있으니까).
 */
export function usePhotoReader(onApply: (r: { amount: number; name?: string }) => void) {
  const [state, setState] = useState<{ stage: string } | { result: OcrResult } | { error: string } | null>(null);

  const read = async (file: File) => {
    setState({ stage: '사진을 읽고 있어요' });
    try {
      const result = await readPurchaseImage(file, (stage) => setState({ stage }));
      setState({ result });
    } catch (e) {
      setState({ error: e instanceof Error ? e.message : '사진을 읽지 못했어요.' });
    }
  };

  const sheet = state ? <PhotoSheet key={'result' in state ? 'result' : 'other'} state={state} onClose={() => setState(null)} onApply={(r) => { setState(null); onApply(r); }} /> : null;
  return { read, sheet };
}

function PhotoSheet({
  state,
  onClose,
  onApply,
}: {
  state: { stage: string } | { result: OcrResult } | { error: string };
  onClose: () => void;
  onApply: (r: { amount: number; name?: string }) => void;
}) {
  const result = 'result' in state ? state.result : null;
  const [amount, setAmount] = useState<number | undefined>(result?.amount);
  const [name, setName] = useState(result?.name ?? '');
  const picked = amount ?? result?.amount;

  if ('stage' in state) {
    return (
      <Sheet title="사진 읽는 중" onClose={onClose}>
        <div className="photo-wait">
          <Spinner label={state.stage} />
        </div>
      </Sheet>
    );
  }
  if ('error' in state) {
    return (
      <Sheet title="금액을 못 찾았어요" onClose={onClose} footer={<button className="btn primary block" onClick={onClose}>직접 입력할게요</button>}>
        <p className="sheet-text">{state.error}</p>
        <p className="sheet-note">가격이나 합계가 화면 가운데 크게 보이게 찍으면 잘 읽혀요.</p>
      </Sheet>
    );
  }
  const r = state.result;
  const cands = r.candidates.length ? r.candidates : r.amount ? [r.amount] : [];
  return (
    <Sheet
      title="이 금액이 맞나요?"
      onClose={onClose}
      footer={
        <button className="btn primary block" disabled={!picked} onClick={() => picked && onApply({ amount: picked, name: name.trim() || undefined })}>
          이대로 입력하기
        </button>
      }
    >
      {cands.length > 1 ? (
        <OptionList
          label="금액 고르기"
          value={picked}
          onPick={setAmount}
          options={cands.map((c, i) => ({ value: c, label: won(c), sub: i === 0 ? (r.kind === 'receipt' ? '영수증 합계로 보여요' : '가격으로 보여요') : undefined }))}
        />
      ) : (
        <div className="photo-amount num">{picked ? won(picked) : '-'}</div>
      )}
      <label className="field">
        <span className="lab">무엇인가요</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder={r.store ?? '상품 이름'} maxLength={30} />
      </label>
      {r.engine === 'browser' && <p className="sheet-note">사진은 이 기기 안에서만 읽었어요.</p>}
    </Sheet>
  );
}
