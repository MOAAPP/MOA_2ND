import { useMemo, useState } from 'react';
import { addDays, parseISO, todayKST, type ISODate } from '../../../shared/dates';
import type { ParsedSpend } from '../../../shared/aiPrompts';
import { formatKey, maskText } from '../../../shared/mask';
import { AiSourceNote } from '../../components/Ai';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Button, Chip, Chips } from '../../components/ds';
import { Sheet, useToast } from '../../components/ui';
import { runAi, type AiSource } from '../../lib/ai';
import { findCardByName, kstMs, METHOD_LABEL, upsertCard, type AccountRef, type MoaState, type NewTxn, type PayMethod, type TxnKind } from '../../lib/moa';
import { uid } from '../../lib/id';
import { useMoa } from '../../state/moa';
import { AiLabel, fmt } from './parts';

/**
 * 결제 문자 붙여넣기 (기획서 「결제 문자 개인정보 처리」 1~5단계)
 * 1. 원문 입력 (어디에도 저장하지 않음)
 * 2. 규칙 기반 자동 마스킹
 * 3. 'AI에게 보낼 문장' 확인·수정 — 처음 보는 형식만. 승인한 형식은 자동 마스킹 후 바로 보냄
 * 4. 승인한 문자열만 AI로
 * 5. 금액·날짜·결제 수단 확인 후 구조화 값만 저장
 */

const SAMPLE = (today: ISODate) => {
  const d = (n: number) => { const p = parseISO(addDays(today, -n)); return `${String(p.m).padStart(2, '0')}/${String(p.d).padStart(2, '0')}`; };
  return [
    `[Web발신]\nKB국민체크(5678)승인\n김*현님\n18,500원\n${d(0)} 12:10\n배달의민족\n잔액 132,000원`,
    `[Web발신]\nKB국민체크(5678)승인\n4,800원\n${d(0)} 15:42\n메가커피 서울여대점\n잔액 127,200원`,
    `[Web발신]\n신한카드(1234)승인\n김*현님\n32,000원 일시불\n${d(0)} 19:02\n무신사스토어\n누적 412,300원`,
  ].join('\n\n');
};

const KIND_LABEL: Record<TxnKind, string> = { spend: '소비', income: '입금', card_payment: '카드 대금', transfer_self: '내 계좌 이체', saving: '저축', refund: '취소·환불' };

interface Row extends ParsedSpend {
  on: boolean;
  account?: AccountRef;
  cardId?: string;
  /** 처음 보는 카드 이름 */
  newCard?: string;
}

function guessRow(p: ParsedSpend, moa: MoaState): Row {
  const kind = (p.kind ?? 'spend') as TxnKind;
  const card = p.issuer ? findCardByName(moa, p.issuer, p.method === 'credit' ? 'credit' : p.method === 'debit' ? 'debit' : undefined) : undefined;
  let method: PayMethod | null = p.method ?? null;
  if (!method && card) method = card.kind === 'credit' ? 'credit' : 'debit';
  if (!method && kind !== 'spend' && kind !== 'refund') method = 'transfer';
  const account: AccountRef | undefined = method === 'cash' ? 'cash' : method === 'debit' && card ? (card.linked ? 'pay' : 'other') : method === 'debit' ? undefined : 'pay';
  const needCard = (method === 'credit' || method === 'debit' || kind === 'card_payment') && !card && p.issuer;
  return { ...p, on: true, method, account, cardId: card?.id, newCard: needCard ? p.issuer! : undefined };
}

export function PasteFlow({ onClose }: { onClose: () => void }) {
  const { moa, set, saveTxns } = useMoa();
  const toast = useToast();
  const today = todayKST();
  const [step, setStep] = useState<'input' | 'review' | 'confirm'>('input');
  const [raw, setRaw] = useState('');
  const [masked, setMasked] = useState('');
  const [hide, setHide] = useState('');
  const [busy, setBusy] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [source, setSource] = useState<AiSource>('example');
  const [skipped, setSkipped] = useState(0);

  const blocks = useMemo(() => raw.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean), [raw]);
  const keys = useMemo(() => [...new Set(blocks.map(formatKey))], [blocks]);
  const trusted = !moa.confirmEveryTime && keys.length > 0 && keys.every((k) => moa.trustedFormats.includes(k));

  const send = async (text: string) => {
    setBusy(true);
    const r = await runAi('parseSpend', { text, today });
    setRows(r.data.items.map((p) => guessRow(p, moa)));
    setSkipped(r.data.skipped);
    setSource(r.source);
    set((m) => ({ ...m, aiNoticeSeen: true, trustedFormats: [...new Set([...m.trustedFormats, ...keys])] }));
    setRaw(''); // 원문은 화면 상태에서도 바로 지운다
    setBusy(false);
    setStep('confirm');
  };

  const next = () => {
    const m = maskText(raw).text;
    if (trusted) { void send(m); return; }
    setMasked(m);
    setStep('review');
  };

  const patch = (i: number, p: Partial<Row>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...p } : r)));
  const chosen = rows.filter((r) => r.on);
  const missing = chosen.filter((r) => !r.date || !r.method || ((r.method === 'debit') && !r.account));

  const save = () => {
    let m = moa;
    const cardIds = new Map<string, string>();
    const list: NewTxn[] = [];
    for (const r of chosen) {
      let cardId = r.cardId;
      if (!cardId && r.newCard) {
        cardId = cardIds.get(r.newCard);
        if (!cardId) {
          cardId = uid('cd');
          cardIds.set(r.newCard, cardId);
          m = upsertCard(m, r.method === 'credit' ? { id: cardId, name: r.newCard, kind: 'credit', linked: false, cutoffDay: 31, payDay: 14 } : { id: cardId, name: r.newCard, kind: 'debit', linked: r.account === 'pay' });
        }
      }
      const time = r.time && /^\d{2}:\d{2}$/.test(r.time) ? r.time : null;
      const occurredAt = time ? kstMs(r.date!, Number(time.slice(0, 2)), Number(time.slice(3))) : r.date === today ? Date.now() : kstMs(r.date!, 12);
      const kind = (r.kind ?? 'spend') as TxnKind;
      list.push({
        occurredAt,
        date: r.date!,
        amount: r.amount,
        kind,
        method: r.method as PayMethod,
        account: r.method === 'cash' ? 'cash' : r.method === 'credit' ? 'other' : r.account ?? 'pay',
        cardId,
        name: r.name,
        category: r.category,
        essential: !!r.essential,
        installments: r.installments && r.installments >= 2 ? r.installments : undefined,
        balanceAfter: r.balanceAfter ?? undefined,
        source: 'sms',
      });
    }
    if (m !== moa) set(() => m);
    saveTxns(list);
    const newCards = [...cardIds.keys()];
    toast(`${list.length}건 저장했어요${newCards.length ? ` · ${newCards.join(', ')} 카드 결제일을 확인해 주세요` : ''}`);
    onClose();
  };

  if (step === 'review') {
    return (
      <Sheet title="AI에게 보낼 문장" onClose={onClose} footer={<Button disabled={busy || !masked.trim()} onClick={() => void send(maskText(masked, hide.split(/[,\s]+/)).text)}>{busy ? 'AI가 읽는 중…' : '가린 문장 보내기'}</Button>}>
        <p className="mo-fine">계좌·카드 번호, 전화번호, 이름으로 보이는 부분을 가렸어요. 더 가릴 부분이 있으면 지우거나 아래에 적어 주세요. 이 문장만 외부 AI로 가고, 원문은 저장하지 않아요.</p>
        <textarea className="lg-textarea mo-masked" rows={8} value={masked} onChange={(e) => setMasked(e.target.value)} />
        <label className="mo-field wide">더 가릴 말 <input value={hide} onChange={(e) => setHide(e.target.value)} placeholder="쉼표로 구분 (예: 민지네)" /></label>
        <p className="mo-fine">이 형식({keys.join(', ')})은 다음부터 자동으로 가린 뒤 바로 보내요. 설정에서 매번 확인으로 바꿀 수 있어요.</p>
      </Sheet>
    );
  }

  if (step === 'confirm') {
    return (
      <Sheet title={`${rows.length}건을 찾았어요`} onClose={onClose}
        footer={<Button disabled={!chosen.length || missing.length > 0} onClick={save}>{missing.length ? `빈칸 ${missing.length}건을 채워 주세요` : `${chosen.length}건 저장`}</Button>}>
        <AiLabel />
        <ul className="mo-confirm">
          {rows.map((r, i) => (
            <li key={i} className={r.on ? '' : 'off'}>
              <div className="mo-confirm-top">
                <input type="checkbox" checked={r.on} onChange={() => patch(i, { on: !r.on })} aria-label="저장" />
                <CategoryIcon category={r.category} size={32} />
                <span><b>{r.name}</b><small>{KIND_LABEL[(r.kind ?? 'spend') as TxnKind]}{r.installments ? ` · 할부 ${r.installments}개월` : ''}{r.balanceAfter != null ? ` · 거래 후 잔액 ${fmt(r.balanceAfter)}` : ''}</small></span>
                <strong className="num">{r.kind === 'income' || r.kind === 'refund' ? '+' : '−'}{fmt(r.amount)}</strong>
              </div>
              {r.on && (
                <div className="mo-confirm-edit">
                  <label className={`mo-field ${r.date ? '' : 'need'}`}>날짜 <input type="date" value={r.date ?? ''} onChange={(e) => patch(i, { date: e.target.value || null })} />{r.time && <small>{r.time}</small>}</label>
                  <Chips label="결제 수단">
                    {(['debit', 'credit', 'transfer', 'cash', 'atm'] as PayMethod[]).map((p) => (
                      <Chip key={p} on={r.method === p} onClick={() => patch(i, { method: p, account: p === 'cash' ? 'cash' : p === 'debit' ? r.account : 'pay' })}>{METHOD_LABEL[p]}</Chip>
                    ))}
                  </Chips>
                  {!r.method && <small className="mo-need">결제 수단을 골라 주세요 (문자로는 알 수 없었어요)</small>}
                  {r.method === 'debit' && !r.cardId && (
                    <Chips label="어느 계좌에서 빠져요?">
                      <Chip on={r.account === 'pay'} onClick={() => patch(i, { account: 'pay' })}>결제계좌</Chip>
                      <Chip on={r.account === 'other'} onClick={() => patch(i, { account: 'other' })}>다른 계좌</Chip>
                    </Chips>
                  )}
                  {r.newCard && <small className="mo-fine">처음 보는 카드 '{r.newCard}' — 저장하면 카드로 등록돼요{r.method === 'credit' ? ' (결제일 14일로 임시 설정)' : ''}.</small>}
                </div>
              )}
            </li>
          ))}
          {!rows.length && <li className="t-empty">거래를 찾지 못했어요. 금액이 들어 있는지 확인해 주세요.</li>}
        </ul>
        {skipped > 0 && <p className="mo-fine">읽지 못한 {skipped}건은 뺐어요.</p>}
        <AiSourceNote source={source} />
      </Sheet>
    );
  }

  return (
    <Sheet title="결제 문자 붙여넣기" onClose={onClose} footer={<Button disabled={!raw.trim() || busy} onClick={next}>{busy ? 'AI가 읽는 중…' : trusted ? '가린 뒤 바로 읽기' : '다음'}</Button>}>
      {!moa.aiNoticeSeen && (
        <div className="mo-notice">
          <b>AI로 읽기 전에 알려드려요</b>
          <p>문자는 계좌·카드 번호, 전화번호, 이름을 가린 뒤 외부 AI(Anthropic API, 입력을 학습에 쓰지 않는 조건)로 보내요. 처음 보는 형식은 보낼 문장을 먼저 보여드려요. 원문은 어디에도 저장하지 않아요.</p>
        </div>
      )}
      <textarea className="lg-textarea" value={raw} onChange={(e) => setRaw(e.target.value.slice(0, 4000))} placeholder="[Web발신] 국민체크 승인 18,500원 …" rows={7} />
      <button type="button" className="lg-sample" onClick={() => setRaw(SAMPLE(today))}>예시 문자 넣어보기</button>
      <p className="mo-fine">체크카드는 결제계좌에서 바로, 신용카드는 다음 카드값 출금일에 빠지는 것으로 계산해요. 지갑 현금은 소비 집계에만 넣어요.</p>
    </Sheet>
  );
}
