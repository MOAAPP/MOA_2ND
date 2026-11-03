import { useState } from 'react';
import { addDays, formatKDate, todayKST } from '../../../shared/dates';
import type { ParsedSchedule } from '../../../shared/aiPrompts';
import { AiSourceNote } from '../../components/Ai';
import { Button, Chip, Chips, NumberPad } from '../../components/ds';
import { ConfirmSheet, Sheet, Switch, TopBar } from '../../components/ui';
import { runAi, type AiSource } from '../../lib/ai';
import {
  emptyMoa,
  METHOD_LABEL,
  nextPaymentDate,
  quickStart,
  removeCard,
  removeSchedule,
  setAnchor,
  upsertCard,
  upsertSchedule,
  type MoaCard,
  type MoaSchedule,
  type MoaState,
  type PayMethod,
} from '../../lib/moa';
import { useNav } from '../../state/nav';
import { useMoa } from '../../state/moa';
import { useStore } from '../../state/store';
import { BalanceSheet } from './Shortfall';
import { AiLabel, fmt } from './parts';

/** 오늘 이후 처음 오는 매달 day일 */
function nextMonthly(day: number, today: string): string {
  const [y, m] = today.split('-').map(Number);
  const last = (yy: number, mm: number) => new Date(Date.UTC(yy, mm, 0)).getUTCDate();
  const mk = (yy: number, mm: number) => `${yy}-${String(mm).padStart(2, '0')}-${String(Math.min(day, last(yy, mm))).padStart(2, '0')}`;
  const here = mk(y, m);
  return here >= today ? here : m === 12 ? mk(y + 1, 1) : mk(y, m + 1);
}

/** 백테스트용 내보내기: 구조화 값만 (원문 없음). 가맹점 이름은 카테고리로 바꾼다. */
function exportForEval(m: MoaState) {
  const id = `real_${Math.random().toString(36).slice(2, 7)}`;
  const data = {
    id,
    exportedAt: new Date().toISOString(),
    anchor: m.anchor,
    cards: m.cards.map((c) => ({ ...c, name: c.kind === 'credit' ? '신용' : '체크' })),
    schedule: m.schedule.map((x) => ({ ...x, name: x.direction === 'in' ? '입금' : x.essential ? '필수결제' : '출금' })),
    txns: m.txns.map(({ name: _n, ...t }) => ({ ...t, name: t.category })),
    dayStatus: m.dayStatus,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `moa-eval-${id}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const dayLabel = (d?: number) => (d === 31 ? '말일' : `${d}일`);

/** 1분 설정: 결제계좌 잔액 + 가장 가까운 필수결제 1건 → 바로 결과 */
export function QuickStart({ onDone }: { onDone?: () => void }) {
  const { set } = useMoa();
  const [step, setStep] = useState<0 | 1>(0);
  const [balance, setBalance] = useState(0);
  const [name, setName] = useState('월세');
  const [amount, setAmount] = useState(0);
  const [day, setDay] = useState(() => Number(addDays(todayKST(), 5).slice(8)));
  return (
    <div className="mo-qs">
      {step === 0 ? (
        <>
          <span className="mo-qs-step">1/2 · 1분이면 돼요</span>
          <h1>필수결제가 빠져나가는<br />결제계좌에 지금 얼마 있어요?</h1>
          <p>월세·카드값이 실제로 빠지는 통장 하나만요. 계좌 연결 없이 숫자만 받아요.</p>
          <p className="mo-amount num">{fmt(balance)}</p>
          <NumberPad value={balance} onChange={setBalance} max={100_000_000} />
          <Button onClick={() => setStep(1)}>다음</Button>
        </>
      ) : (
        <>
          <span className="mo-qs-step">2/2</span>
          <h1>가장 가까운 필수결제<br />하나만 알려주세요</h1>
          <Chips label="항목">
            {['월세', '카드값', '통신비', '관리비', '학원비'].map((n) => <Chip key={n} on={name === n} onClick={() => setName(n)}>{n}</Chip>)}
          </Chips>
          <label className="mo-field">매달 <input type="number" min={1} max={31} value={day} onChange={(e) => setDay(Math.max(1, Math.min(31, Number(e.target.value) || 1)))} />일 <small>다음 출금 {formatKDate(nextMonthly(day, todayKST()))}</small></label>
          <p className="mo-amount num">{fmt(amount)}</p>
          <NumberPad value={amount} onChange={setAmount} max={10_000_000} />
          <Button disabled={!amount} onClick={() => { set((m) => quickStart(m, balance, { name, amount, day })); onDone?.(); }}>결과 보기</Button>
          <button className="mo-link" onClick={() => setStep(0)}>잔액 다시 입력</button>
        </>
      )}
    </div>
  );
}

export function MoaSetup() {
  const nav = useNav();
  const { moa, set, today } = useMoa();
  const { update } = useStore();
  const [sheet, setSheet] = useState<'balance' | 'card' | 'schedule' | 'sentence' | 'wipe' | null>(null);
  const [editCard, setEditCard] = useState<MoaCard | null>(null);
  const [editItem, setEditItem] = useState<MoaSchedule | null>(null);

  if (!moa.anchor) {
    return (
      <div className="page t-page mo-page">
        <TopBar onBack={nav.pop} title="" />
        <QuickStart onDone={() => nav.replace({ name: 'shortfall' })} />
      </div>
    );
  }
  return (
    <div className="page t-page mo-page">
      <TopBar onBack={nav.pop} title="결제계좌 설정" />

      <section className="t-card">
        <div className="t-card-head"><h2>결제계좌 잔액</h2><button className="mo-link" onClick={() => setSheet('balance')}>수정</button></div>
        <p className="mo-big num">{fmt(moa.anchor.balance)}</p>
        <p className="mo-fine">{formatKDate(todayKST(new Date(moa.anchor.at)))} 확인 · {moa.anchor.source === 'sms' ? '문자 속 거래 후 잔액' : '직접 입력'}. 잔액이 찍힌 체크카드·입출금 문자를 붙여넣으면 자동으로 바뀌어요.</p>
      </section>

      <section className="t-card">
        <div className="t-card-head"><h2>카드</h2><button className="mo-link" onClick={() => { setEditCard(null); setSheet('card'); }}>추가</button></div>
        <ul className="mo-list">
          {moa.cards.map((c) => (
            <li key={c.id}>
              <button onClick={() => { setEditCard(c); setSheet('card'); }}>
                <b>{c.name}</b>
                <small>{c.kind === 'credit' ? `신용 · 이용기간 ${dayLabel(c.cutoffDay)} 마감 · 결제일 ${dayLabel(c.payDay)} · 다음 출금 ${formatKDate(nextPaymentDate(c, today))}` : `체크 · ${c.linked ? '결제계좌 연결' : '다른 계좌'}`}</small>
              </button>
            </li>
          ))}
          {!moa.cards.length && <li className="t-empty">카드를 등록하면 신용카드 사용분을 실제 출금일에 넣어 계산해요.</li>}
        </ul>
      </section>

      <section className="t-card">
        <div className="t-card-head"><h2>일정</h2><span className="mo-row-sm"><button className="mo-link" onClick={() => setSheet('sentence')}>문장으로</button><button className="mo-link" onClick={() => { setEditItem(null); setSheet('schedule'); }}>추가</button></span></div>
        <ul className="mo-list">
          {moa.schedule.map((s) => (
            <li key={s.id}>
              <button onClick={() => { setEditItem(s); setSheet('schedule'); }}>
                <b>{s.name} <span className={s.direction === 'in' ? 'in' : 'out'}>{s.direction === 'in' ? '+' : '−'}{fmt(s.amount)}</span></b>
                <small>{s.recurrence === 'monthly' ? `매달 ${dayLabel(s.day)}` : s.date ? formatKDate(s.date) : ''}{s.direction === 'in' ? ` · ${s.status === 'uncertain' ? '불확실(계산에서 뺌)' : '예정'}${s.fromOtherAccount ? ' · 내 다른 계좌에서' : ''}` : s.essential ? ' · 필수결제' : ''}</small>
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section className="t-card">
        <div className="t-card-head"><h2>계산 기준</h2></div>
        <p className="t-label">입금 지연 시나리오</p>
        <Chips label="지연 일수">{[1, 3, 5, 7].map((d) => <Chip key={d} on={moa.delayDays === d} onClick={() => set((m) => ({ ...m, delayDays: d }))}>{d}일</Chip>)}</Chips>
        <p className="t-label">주로 쓰는 결제 수단 <small className="mo-fine">기록이 적을 때 씀</small></p>
        <Chips label="주 결제 수단">{(['debit', 'credit', 'transfer', 'cash'] as PayMethod[]).map((p) => <Chip key={p} on={moa.mainMethod === p} onClick={() => set((m) => ({ ...m, mainMethod: p }))}>{METHOD_LABEL[p]}</Chip>)}</Chips>
      </section>

      <section className="t-card">
        <div className="t-card-head"><h2>개인정보</h2></div>
        <Switch checked={moa.confirmEveryTime} onChange={(v) => set((m) => ({ ...m, confirmEveryTime: v }))} label="AI에 보내기 전 매번 확인" />
        <p className="mo-fine">결제 문자는 계좌·카드 번호, 전화번호, 이름을 가린 뒤에만 외부 AI로 보내요. 처음 보는 문자 형식은 보낼 문장을 먼저 보여드려요(승인한 형식 {moa.trustedFormats.length}개). 원문과 가리기 전 문장은 서버·로그 어디에도 저장하지 않아요. 기록은 이 기기에만 저장돼요.</p>
        {moa.trustedFormats.length > 0 && <button className="mo-link" onClick={() => set((m) => ({ ...m, trustedFormats: [] }))}>승인한 형식 모두 지우기</button>}
        <button className="mo-link" onClick={() => exportForEval(moa)}>평가용 기록 내보내기 (JSON)</button>
        <p className="mo-fine">팀 백테스트(scripts/eval)에 쓰는 파일이에요. 구조화된 금액·날짜·결제 수단만 들어가고 문자 원문은 없어요.</p>
        <button className="mo-link danger" onClick={() => setSheet('wipe')}>내 기록 전체 지우기</button>
      </section>

      {sheet === 'balance' && <BalanceSheet initial={moa.anchor.balance} onClose={() => setSheet(null)} onDone={(b) => { set((m) => setAnchor(m, b, Date.now())); setSheet(null); }} />}
      {sheet === 'card' && <CardSheet card={editCard} onClose={() => setSheet(null)} onSave={(c) => { set((m) => upsertCard(m, c)); setSheet(null); }} onDelete={editCard ? () => { set((m) => removeCard(m, editCard.id)); setSheet(null); } : undefined} />}
      {sheet === 'schedule' && <ScheduleSheet item={editItem} onClose={() => setSheet(null)} onSave={(s) => { set((m) => upsertSchedule(m, s)); setSheet(null); }} onDelete={editItem ? () => { set((m) => removeSchedule(m, editItem.id)); setSheet(null); } : undefined} />}
      {sheet === 'sentence' && <SentenceSheet today={today} onClose={() => setSheet(null)} onSave={(items) => { set((m) => items.reduce((acc, it) => upsertSchedule(acc, it), m)); setSheet(null); }} />}
      {sheet === 'wipe' && (
        <ConfirmSheet title="내 기록을 모두 지울까요?" body="결제계좌 잔액, 카드, 일정, 거래 기록, 알림이 이 기기에서 지워져요. 되돌릴 수 없어요." confirm="모두 지우기" danger
          onConfirm={() => { update((s) => ({ ...s, moa: emptyMoa(), spendLog: s.spendLog.filter((e) => !e.txnId) })); setSheet(null); nav.reset(); }} onClose={() => setSheet(null)} />
      )}
    </div>
  );
}

function DayInput({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return <label className="mo-field">{label} <input type="number" min={1} max={31} value={value} onChange={(e) => onChange(Math.max(1, Math.min(31, Number(e.target.value) || 1)))} />일 <small>(31 = 말일)</small></label>;
}

function CardSheet({ card, onClose, onSave, onDelete }: { card: MoaCard | null; onClose: () => void; onSave: (c: Omit<MoaCard, 'id'> & { id?: string }) => void; onDelete?: () => void }) {
  const [name, setName] = useState(card?.name ?? '');
  const [kind, setKind] = useState<MoaCard['kind']>(card?.kind ?? 'credit');
  const [linked, setLinked] = useState(card?.linked ?? true);
  const [cutoff, setCutoff] = useState(card?.cutoffDay ?? 31);
  const [payDay, setPayDay] = useState(card?.payDay ?? 14);
  return (
    <Sheet title={card ? '카드 수정' : '카드 추가'} onClose={onClose} footer={<Button disabled={!name.trim()} onClick={() => onSave({ id: card?.id, name: name.trim(), kind, linked: kind === 'debit' ? linked : false, cutoffDay: kind === 'credit' ? cutoff : undefined, payDay: kind === 'credit' ? payDay : undefined })}>저장</Button>}>
      <label className="mo-field wide">카드 이름 <input value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} placeholder="예: 신한, 국민체크" /></label>
      <Chips label="종류"><Chip on={kind === 'credit'} onClick={() => setKind('credit')}>신용카드</Chip><Chip on={kind === 'debit'} onClick={() => setKind('debit')}>체크카드</Chip></Chips>
      {kind === 'credit' ? (
        <>
          <DayInput label="이용기간 마감" value={cutoff} onChange={setCutoff} />
          <DayInput label="결제일" value={payDay} onChange={setPayDay} />
          <p className="mo-fine">카드사 앱의 '결제일·이용기간'에 나와 있어요. 예) 14일 결제 → 전월 1일~말일 사용분(마감 31).</p>
        </>
      ) : (
        <Switch checked={linked} onChange={setLinked} label="결제계좌에서 빠지는 체크카드" />
      )}
      {onDelete && <button className="mo-link danger" onClick={onDelete}>카드 삭제</button>}
    </Sheet>
  );
}

function ScheduleSheet({ item, onClose, onSave, onDelete }: { item: MoaSchedule | null; onClose: () => void; onSave: (s: Omit<MoaSchedule, 'id'> & { id?: string }) => void; onDelete?: () => void }) {
  const [direction, setDirection] = useState<MoaSchedule['direction']>(item?.direction ?? 'out');
  const [name, setName] = useState(item?.name ?? '');
  const [amount, setAmount] = useState(item?.amount ?? 0);
  const [recurrence, setRecurrence] = useState<MoaSchedule['recurrence']>(item?.recurrence ?? 'monthly');
  const [day, setDay] = useState(item?.day ?? 10);
  const [date, setDate] = useState(item?.date ?? todayKST());
  const [status, setStatus] = useState<'scheduled' | 'uncertain'>(item?.status ?? 'scheduled');
  const [essential, setEssential] = useState(item?.essential ?? true);
  const [fromOther, setFromOther] = useState(item?.fromOtherAccount ?? false);
  return (
    <Sheet title={item ? '일정 수정' : '일정 추가'} onClose={onClose}
      footer={<Button disabled={!name.trim() || !amount} onClick={() => onSave({ id: item?.id, name: name.trim(), amount, direction, recurrence, day: recurrence === 'monthly' ? day : undefined, date: recurrence === 'once' ? date : undefined, essential: direction === 'out' ? essential : false, status: direction === 'in' ? status : undefined, fromOtherAccount: direction === 'in' ? fromOther : undefined })}>저장</Button>}>
      <Chips label="방향"><Chip on={direction === 'out'} onClick={() => setDirection('out')}>나가는 돈</Chip><Chip on={direction === 'in'} onClick={() => setDirection('in')}>들어오는 돈</Chip></Chips>
      <label className="mo-field wide">이름 <input value={name} onChange={(e) => setName(e.target.value.slice(0, 20))} placeholder={direction === 'in' ? '알바비, 용돈' : '월세, 통신비'} /></label>
      <Chips label="반복"><Chip on={recurrence === 'monthly'} onClick={() => setRecurrence('monthly')}>매달</Chip><Chip on={recurrence === 'once'} onClick={() => setRecurrence('once')}>한 번</Chip></Chips>
      {recurrence === 'monthly' ? <DayInput label="매달" value={day} onChange={setDay} /> : <label className="mo-field">날짜 <input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></label>}
      {direction === 'in' ? (
        <>
          <Chips label="입금 확실성"><Chip on={status === 'scheduled'} onClick={() => setStatus('scheduled')}>예정 (매달 거의 확실)</Chip><Chip on={status === 'uncertain'} onClick={() => setStatus('uncertain')}>불확실</Chip></Chips>
          <p className="mo-fine">{status === 'scheduled' ? '기본 계산에 넣고, 늦어지는 경우도 따로 계산해요.' : '계산에는 넣지 않고, 들어올 때의 결과만 참고로 보여드려요.'}</p>
          <Switch checked={fromOther} onChange={setFromOther} label="내 다른 계좌에서 옮기는 돈" />
        </>
      ) : (
        <Switch checked={essential} onChange={setEssential} label="꼭 내야 하는 필수결제" />
      )}
      <p className="mo-amount num">{fmt(amount)}</p>
      <NumberPad value={amount} onChange={setAmount} max={50_000_000} />
      {onDelete && <button className="mo-link danger" onClick={onDelete}>일정 삭제</button>}
    </Sheet>
  );
}

/** "다음 달 5일 월세 35만원, 10일에 알바비 48만원 들어오고" → 일정표. 빈칸은 비워두고 사용자가 채운다. */
function SentenceSheet({ today, onClose, onSave }: { today: string; onClose: () => void; onSave: (items: (Omit<MoaSchedule, 'id'>)[]) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [found, setFound] = useState<{ items: ParsedSchedule[]; source: AiSource } | null>(null);
  const read = async () => {
    setBusy(true);
    const r = await runAi('parseSchedule', { text, today });
    setFound({ items: r.data.items, source: r.source });
    setBusy(false);
  };
  const patch = (i: number, p: Partial<ParsedSchedule>) => setFound((f) => (f ? { ...f, items: f.items.map((x, k) => (k === i ? { ...x, ...p } : x)) } : f));
  const ok = found?.items.filter((x) => x.amount && x.direction && (x.date || x.day)) ?? [];
  return (
    <Sheet title="문장으로 일정 넣기" onClose={onClose}
      footer={found ? <Button disabled={!ok.length} onClick={() => onSave(ok.map((x) => ({ name: x.name, amount: x.amount!, direction: x.direction!, recurrence: x.day ? 'monthly' : 'once', day: x.day ?? undefined, date: x.day ? undefined : x.date ?? undefined, essential: x.direction === 'out', status: x.direction === 'in' ? 'scheduled' : undefined })))}>{ok.length}개 저장</Button>
        : <Button disabled={!text.trim() || busy} onClick={() => void read()}>{busy ? '읽는 중…' : 'AI로 읽기'}</Button>}>
      {!found ? (
        <>
          <textarea className="lg-textarea" rows={4} value={text} onChange={(e) => setText(e.target.value.slice(0, 500))} placeholder="다음 달 5일 월세 35만원, 10일에 알바비 48만원 들어오고, 8일에 카드값 12만원 나가" />
          <p className="mo-fine">금액이나 날짜가 문장에 없으면 빈칸으로 둬요. 저장 전에 확인해 주세요.</p>
        </>
      ) : (
        <>
          <AiLabel />
          <ul className="mo-list">
            {found.items.map((x, i) => (
              <li key={i} className="mo-parsed">
                <b>{x.name}</b>
                <Chips label="방향"><Chip on={x.direction === 'out'} onClick={() => patch(i, { direction: 'out' })}>나감</Chip><Chip on={x.direction === 'in'} onClick={() => patch(i, { direction: 'in' })}>들어옴</Chip></Chips>
                <label className="mo-field">금액 <input type="number" value={x.amount ?? ''} placeholder="빈칸" onChange={(e) => patch(i, { amount: Number(e.target.value) || null })} />원</label>
                <small>{x.day ? `매달 ${x.day}일` : x.date ? formatKDate(x.date) : '날짜 빈칸'}</small>
                {!x.date && !x.day && <label className="mo-field">날짜 <input type="date" onChange={(e) => patch(i, { date: e.target.value || null })} /></label>}
              </li>
            ))}
          </ul>
          <AiSourceNote source={found.source} />
        </>
      )}
    </Sheet>
  );
}
