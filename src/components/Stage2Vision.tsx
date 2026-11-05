import { useEffect, useState } from 'react';
import { won } from '../../shared/format';
import {
  analyzeShopScreenshot, confirmProduct, simulateCandidate,
  type VisionAnalysis, type VisionProduct, type PurchaseCandidate, type SimulationResult,
} from '../lib/stage2Api';
import { Sheet, Spinner } from './ui';

interface Props {
  file: File;
  userId?: string;
  onClose: () => void;
  onApply: (item: { amount: number; name?: string }) => void;
}
const numeric = (s: string): number | null => s.trim() ? Number(s.replace(/[^\d]/g, '')) : null;

function MoneyField({ title, value, change, hint }: {
  title: string; value: number | null; change: (n: number | null) => void; hint?: string;
}) {
  return <label className="field"><span className="lab">{title}</span>
    <input className="input" inputMode="numeric" value={value ?? ''}
      onChange={e => change(numeric(e.target.value))} placeholder="확인되지 않음" />
    {hint && <small className="sheet-note">{hint}</small>}
  </label>;
}

/** New purchase intent lives only in Python candidate overlay until user explicitly records a choice. */
export function Stage2Vision({ file, onClose, onApply, userId = 'S01' }: Props) {
  const [analysis, setAnalysis] = useState<VisionAnalysis | null>(null);
  const [product, setProduct] = useState<VisionProduct | null>(null);
  const [candidate, setCandidate] = useState<PurchaseCandidate | null>(null);
  const [simulation, setSimulation] = useState<SimulationResult | null>(null);
  const [simDate, setSimDate] = useState('2026-11-06');
  const [discount, setDiscount] = useState(false);
  const [shippingOk, setShippingOk] = useState(false);
  const [discountOk, setDiscountOk] = useState(false);
  const [totalOk, setTotalOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview] = useState(() => URL.createObjectURL(file));

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    setError(null);
    void analyzeShopScreenshot(userId, file).then(result => {
      if (cancelled) return;
      if (result.source !== 'multimodal_llm' || result.analysis_status !== 'succeeded') {
        setError('실제 비전 AI 결과가 아닙니다.');
        return;
      }
      setProduct(result.product);
      setAnalysis(result);
    }).catch(e => {
      if (!cancelled) setError(e instanceof Error ? e.message : '이미지 분석 실패');
    }).finally(() => { if (!cancelled) setBusy(false); });
    return () => { cancelled = true; URL.revokeObjectURL(preview); };
  }, [file, preview, userId]);

  const patch = <K extends keyof VisionProduct>(key: K, value: VisionProduct[K]) => {
    setProduct(p => p ? { ...p, [key]: value } : p);
    setError(null);
  };
  const unit = discount ? product?.conditional_discount_price : product?.selling_price;
  const total = unit != null && product?.option_extra_cost != null &&
    product.quantity != null && product.shipping_fee != null
    ? (unit + product.option_extra_cost) * product.quantity + product.shipping_fee : null;
  const verified = Boolean(product?.product_name?.trim()) && product?.selling_price != null &&
    product?.quantity != null && product?.option_extra_cost != null &&
    product?.shipping_fee != null && total != null && total > 0 &&
    shippingOk && totalOk && (!discount || discountOk);

  async function save() {
    if (!analysis || !product || !verified) return;
    setBusy(true); setError(null);
    try {
      const saved = await confirmProduct(userId, analysis.analysis_id, product, discount);
      setCandidate(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : '구매 후보 저장에 실패했습니다.');
    } finally { setBusy(false); }
  }
  async function simulate() {
    if (!candidate) return;
    setBusy(true); setError(null);
    try {
      // The exact next calendar day relative to the dataset snapshot; not a physical purchase.
      const when = new Date(simDate + 'T12:00:00+09:00').toISOString();
      const result = await simulateCandidate(userId, candidate.id, when);
      setSimulation(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : '가상 구매 비교에 실패했습니다.');
    } finally { setBusy(false); }
  }

  return <Sheet title={candidate ? '구매 후보 저장 완료' : '상품 인식 결과 확인'} onClose={onClose}
    footer={candidate ?
      <button type="button" className="btn primary block" onClick={() => {
        if (candidate.estimated_checkout_total != null) onApply({
          amount: candidate.estimated_checkout_total,
          name: candidate.product.product_name ?? undefined,
        });
        onClose();
      }}>기존 선택 화면에도 상품 정보 입력</button>
      : <button type="button" className="btn primary block" disabled={!verified || busy}
        onClick={() => void save()}>{busy ? '처리 중…' : '확인한 구매 후보 저장'}</button>}>
    <div className="s2-preview">
      <img src={preview} alt="업로드한 쇼핑몰 화면" style={{ width: '100%', maxHeight: 200, objectFit: 'contain' }} />
    </div>
    {busy && <Spinner label={analysis ? '저장 또는 비교 중…' : '레이아웃과 상품 가격을 분석하고 있어요'} />}
    {error && <p role="alert" className="sheet-note" style={{ color: 'var(--danger)' }}>{error}</p>}
    {analysis && <p className="sheet-note">실제 비전 AI: {analysis.model} · {analysis.latency_ms}ms
      {analysis.cached ? ' · 동일 이미지 캐시' : ''}</p>}
    {candidate && <>
      <p className="sheet-note">실제 잔액이나 ML 예측에는 반영하지 않았어요.</p>
      <p><b>{candidate.product.product_name}</b> · {won(candidate.estimated_checkout_total ?? 0)}</p>
      <label className="field"><span className="lab">가상 구매 날짜</span>
        <input className="input" type="date" min="2026-11-05" max="2026-11-18" value={simDate}
          onChange={e => setSimDate(e.target.value)} /></label>
      <button type="button" className="btn ghost block" disabled={busy}
        onClick={() => void simulate()}>선택한 날짜에 구매했을 때 계산</button>
      {simulation && <div className="nc-result">
        <div><span>현금흐름 엔진 기준 잔액</span><b>{won(simulation.available_cash)}</b></div>
        <div><span>14일 후 가상 잔액</span><b>{won(simulation.future_balances['14'])}</b></div>
      </div>}
    </>}
    {product && !candidate && <>
      <label className="field"><span className="lab">메인 상품명</span>
        <input className="input" value={product.product_name ?? ''}
          onChange={e => patch('product_name', e.target.value)} placeholder="상품명 직접 확인" /></label>
      {product.alternative_candidates.length > 0 &&
        <p className="sheet-note">추천·광고 후보 {product.alternative_candidates.length}건을 메인 상품과 구분했어요.</p>}
      <MoneyField title="판매가" value={product.selling_price} change={v => patch('selling_price', v)} />
      <MoneyField title="조건부 할인가" value={product.conditional_discount_price}
        change={v => patch('conditional_discount_price', v)} hint="쿠폰·카드 등 조건은 적용 여부를 확인해주세요." />
      <label className="field"><span className="lab">선택한 옵션 (쉼표 구분)</span>
        <input className="input" value={product.selected_options.join(', ')}
          onChange={e => patch('selected_options', e.target.value.split(',').map(v => v.trim()).filter(Boolean))} /></label>
      <MoneyField title="수량" value={product.quantity}
        change={v => patch('quantity', v == null ? null : Math.max(1, Math.round(v)))} />
      <MoneyField title="옵션 추가금 (없다면 0)" value={product.option_extra_cost}
        change={v => patch('option_extra_cost', v)} />
      <MoneyField title="배송비 (무료라면 0)" value={product.shipping_fee}
        change={v => patch('shipping_fee', v)} />
      {product.conditional_discount_price != null && <label className="s2-check">
        <input type="checkbox" checked={discount} onChange={e => setDiscount(e.target.checked)} />
        조건부 할인가 적용</label>}
      {discount && <label className="s2-check"><input type="checkbox" checked={discountOk}
        onChange={e => setDiscountOk(e.target.checked)} /> 할인 조건을 직접 확인했어요</label>}
      {product.uncertain_fields.length > 0 &&
        <p className="sheet-note">확인 필요: {product.uncertain_fields.join(', ')}</p>}
      <p className="photo-amount num">{total === null ? '최종 금액 확인 필요' : won(total)}</p>
      <label className="s2-check"><input type="checkbox" checked={shippingOk}
        onChange={e => setShippingOk(e.target.checked)} /> 배송비·옵션 추가금 확인</label>
      <label className="s2-check"><input type="checkbox" checked={totalOk}
        onChange={e => setTotalOk(e.target.checked)} /> 상품·수량·최종 결제 예상액 확인</label>
      <p className="sheet-note">상품 인식은 실제 결제가 아니에요. 저장은 구매 의도만 기록합니다.</p>
    </>}
  </Sheet>;
}
