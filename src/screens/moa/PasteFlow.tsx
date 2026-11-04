import { useState } from 'react';
import { addDays, parseISO, todayKST, type ISODate } from '../../../shared/dates';
import type { ParsedSpend } from '../../../shared/aiPrompts';
import { CategoryIcon } from '../../components/CategoryIcon';
import { Button, Chip, Chips } from '../../components/ds';
import { Sheet, useToast } from '../../components/ui';
import { findCardByName, kstMs, METHOD_LABEL, upsertCard, type AccountRef, type MoaState, type NewTxn, type PayMethod, type TxnKind } from '../../lib/moa';
import { uid } from '../../lib/id';
import { useMoa } from '../../state/moa';
import { useStore } from '../../state/store';
import { Stage2Sms } from '../../components/Stage2Sms';
import { fmt } from './parts';

/** 금융 문자는 규칙 기반만 사용. 원문은 모델이나 별도 외부 서비스로 보내지 않는다. */

const SAMPLE = (today: ISODate) => {
  const d = (n: number) => { const p = parseISO(addDays(today, -n)); return `${String(p.m).padStart(2, '0')}/${String(p.d).padStart(2, '0')}`; };
  return [
    `[Web발신]\nKB국민체크(5678)승인\n김*현님\n18,500원\n${d(0)} 12:10\n배달의민족\n잔액 132,000원`,
    `[Web발신]\nKB국민체크(5678)승인\n4,800원\n${d(0)} 15:42\n메가커피 서울여대점\n잔액 127,200원`,
    `[Web발신]\n신한카드(1234)승인\n김*현님\n32,000원 일시불\n${d(0)} 19:02\n무신사스토어\n누적 412,300원`,
  ].join('\n\n');
};


/** Non-demo offline path. Demo financial SMS uses the canonical FastAPI rule parser. */
function parseLocalRules(text: string, today: ISODate): { items: ParsedSpend[]; skipped: number } {
  const messages = text.replace(/(?<!^)(?=\[Web발신\])/g, '\n\n').split(/\n\s*\n/g).filter(x => x.trim());
  const items: ParsedSpend[] = [];
  let skipped = 0;
  for (const message of messages) {
    const lines = message.split('\n').map(x => x.trim()).filter(Boolean);
    const body = lines.filter(x => !/(잔액|누적|한도|가용|포인트)/.test(x)).join('\n');
    const amountText = body.match(/(\d{1,3}(?:,\d{3})+|\d{3,10})\s*원/);
    if (!amountText) { skipped++; continue; }
    const amount = Number(amountText[1].replace(/,/g, ''));
    if (!Number.isSafeInteger(amount) || amount <= 0) { skipped++; continue; }
    const dm = message.match(/(?:(20\d{2})[./-])?(\d{1,2})[./-](\d{1,2})/);
    let date: string | null = null;
    if (dm) {
      let year = Number(dm[1] || today.slice(0, 4));
      const month = Number(dm[2]);
      const day = Number(dm[3]);
      let candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      if (!dm[1] && candidate > today) {
        year -= 1;
        candidate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      const verified = new Date(Date.UTC(year, month - 1, day));
      if (!Number.isNaN(verified.valueOf()) && verified.toISOString().slice(0, 10) === candidate) date = candidate;
    }
    const time = message.match(/(?:^|\s)([01]?\d|2[0-3]):([0-5]\d)(?:\s|$)/)?.slice(1).join(':') ?? null;
    const issuer = message.match(/(KB국민|국민|신한|삼성|현대|롯데|하나|우리|농협|NH|카카오뱅크|토스뱅크|IBK기업)/)?.[1] ?? null;
    const isCredit = /신용|할부|일시불/.test(message) || (/카드/.test(message) && !/체크/.test(message));
    const isDebit = /체크/.test(message);
    const isRefund = /취소|환불/.test(message);
    const isIncome = /급여|월급|입금|용돈/.test(message) && !isRefund;
    const isCardBill = /카드(?:이용)?대금|카드값|청구.*출금/.test(message);
    const kind: ParsedSpend['kind'] = isCardBill ? 'card_payment' : isRefund ? 'refund' : isIncome ? 'income' : 'spend';
    const method: ParsedSpend['method'] = isCardBill ? 'transfer' : isCredit ? 'credit' : isDebit ? 'debit'
      : /이체|송금|출금|입금/.test(message) ? 'transfer' : null;
    const name = [...lines].reverse().find(l => !/(Web발신|승인|누적|잔액|한도|\d{2}[:/.-]\d|\d[\d,]*\s*원|\d{4}|님)/.test(l))
      ?? issuer ?? '거래 상대 확인 필요';
    const category = /커피|카페|메가|스타벅스/.test(name) ? '카페'
      : /배달|식당|분식|편의점/.test(name) ? '식비'
      : /무신사|의류|패션/.test(name) ? '패션' : '기타';
    const installment = message.match(/할부\s*(\d{1,2})\s*개?월?/);
    const balanceAfter = message.match(/잔액\s*([\d,]+)\s*원?/)?.[1];
    items.push({
      amount, date, time, method, kind, issuer, name,
      category, confidence: 0.8,
      essential: /월세|관리비|통신비|보험료|전기|수도/.test(name),
      installments: installment ? Number(installment[1]) : null,
      balanceAfter: balanceAfter ? Number(balanceAfter.replace(/,/g, '')) : null,
    });
  }
  return { items, skipped };
}

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
  const { state } = useStore();
  const toast = useToast();
  const today = todayKST();
  const [step, setStep] = useState<'input' | 'confirm'>('input');
  const [raw, setRaw] = useState('');
  const [rows, setRows] = useState<Row[]>([]);
  const [skipped, setSkipped] = useState(0);

  const next = () => {
    const result = parseLocalRules(raw, today);
    setRows(result.items.map(item => guessRow(item, moa)));
    setSkipped(result.skipped);
    setRaw('');
    setStep('confirm');
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
    const { saved, skipped } = saveTxns(list);
    const newCards = [...cardIds.keys()];
    toast(`${saved}건 저장했어요${skipped ? ` · ${skipped}건은 이미 있어서 건너뛰었어요` : ''}${newCards.length ? ` · ${newCards.join(', ')} 카드 결제일을 확인해 주세요` : ''}`);
    onClose();
  };

  if (state.demo) return <Stage2Sms onClose={onClose} />;

  if (step === 'confirm') {
    return (
      <Sheet title={`${rows.length}건을 찾았어요`} onClose={onClose}
        footer={<Button disabled={!chosen.length || missing.length > 0} onClick={save}>{missing.length ? `빈칸 ${missing.length}건을 채워 주세요` : `${chosen.length}건 저장`}</Button>}>
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
      </Sheet>
    );
  }

  return (
    <Sheet title="결제 문자 붙여넣기" onClose={onClose} footer={<Button disabled={!raw.trim()} onClick={next}>규칙으로 거래 읽기</Button>}>
      <div className="mo-notice">
        <b>결제 문자는 AI로 전송하지 않아요</b>
        <p>문자 내용은 이 기기에서 규칙으로만 분석해요. 추출된 금액과 날짜, 결제 수단을 직접 확인한 뒤 저장하며 문자 원문은 보관하지 않아요.</p>
      </div>
      <textarea className="lg-textarea" value={raw} onChange={(e) => setRaw(e.target.value.slice(0, 4000))} placeholder="[Web발신] 국민체크 승인 18,500원 …" rows={7} />
      <button type="button" className="lg-sample" onClick={() => setRaw(SAMPLE(today))}>예시 문자 넣어보기</button>
      <p className="mo-fine">체크카드는 결제계좌에서 바로, 신용카드는 카드대금 출금일에 반영하는 것이 원칙이에요. 실제 출금일은 확인이 필요해요.</p>
    </Sheet>
  );
}
