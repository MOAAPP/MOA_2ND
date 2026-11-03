/**
 * 가계부 탭 (하단 메뉴) — 결제 후 기록. 모아의 기본 화면.
 * - 내역 / 달력 / 분석, 달 이동
 * - 빠른 쓰기(숫자패드 + AI 카테고리), 카드 문자 붙여넣기(AI가 읽기)
 * - AI 이번 달 요약
 */
import { useMemo, useState } from 'react';
import { addDays, addMonths, daysInMonth, parseISO, startOfMonth, todayKST, weekdayOf, type ISODate } from '../../shared/dates';
import { manShort } from '../../shared/format';
import { AiCard, AiMark } from '../components/Ai';
import { CategoryIcon, categoryColor } from '../components/CategoryIcon';
import { AmountText, Button, Chip, Chips, NumberPad, Won } from '../components/ds';
import { IconGear } from '../components/Icons';
import { Sheet, useToast } from '../components/ui';
import { useAi, exampleNow } from '../lib/ai';
import { METHOD_LABEL, setDayStatus, type PayMethod } from '../lib/moa';
import { useMoa } from '../state/moa';
import { PasteFlow } from './moa/PasteFlow';
import { ledgerSummaryInput, monthSlice } from '../lib/ai/context';
import { CATEGORIES } from '../lib/categories';
import { spendHistory } from '../lib/ml/provider';
import type { SpendEntry } from '../lib/ml/types';
import { useNav } from '../state/nav';
import { rememberCategory, useStore } from '../state/store';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const PAGE_DAYS = 7;
type View = 'list' | 'calendar' | 'report';

/** 으로/로 (받침 없거나 ㄹ 받침이면 '로') */
const euro = (w: string) => { const c = w.charCodeAt(w.length - 1) - 0xac00; const j = c >= 0 && c <= 11171 ? c % 28 : 0; return j === 0 || j === 8 ? '로' : '으로'; };
const fmt = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const sum = (xs: SpendEntry[]) => xs.reduce((s, e) => s + e.amount, 0);
const dayLabel = (d: ISODate, today: ISODate) => `${parseISO(d).m}월 ${parseISO(d).d}일 ${WD[weekdayOf(d)]}요일${d === today ? ' · 오늘' : d === addDays(today, -1) ? ' · 어제' : ''}`;

export function useSpending() {
  const { state } = useStore();
  const today = todayKST();
  const all = useMemo(
    () => spendHistory(state.records, state.spendLog, today).filter((e) => e.amount > 0).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.amount - a.amount)),
    [state.records, state.spendLog, today],
  );
  return { all, today };
}

export function Row({ e, showDate = false }: { e: SpendEntry; showDate?: boolean }) {
  return (
    <div className="lg-row">
      <CategoryIcon category={e.category} size={40} />
      <span className="lg-row-main"><b>{e.name || e.category}</b><small>{showDate ? `${parseISO(e.date).m}월 ${parseISO(e.date).d}일 · ` : ''}{e.category}</small></span>
      <strong className="num">−{fmt(e.amount)}</strong>
    </div>
  );
}

export function Ledger() {
  const nav = useNav();
  const { all, today } = useSpending();
  const [month, setMonth] = useState<ISODate>(startOfMonth(today));
  const [view, setView] = useState<View>('list');
  const [cat, setCat] = useState<string | null>(null);
  const [day, setDay] = useState<ISODate | null>(null);
  const [pages, setPages] = useState(1);
  const [sheet, setSheet] = useState<'add' | 'paste' | null>(null);

  const { items: inMonth, elapsed, prevTotal, total } = monthSlice(all, month, today);
  const { m } = parseISO(month);
  const canNext = month < startOfMonth(today);
  const canPrev = all.some((e) => e.date < month);
  const go = (n: number) => { setMonth(addMonths(month, n)); setDay(null); setPages(1); setCat(null); };
  const byCat = useMemo(() => Object.entries(inMonth.reduce<Record<string, number>>((acc, e) => ((acc[e.category] = (acc[e.category] ?? 0) + e.amount), acc), {})).sort((a, b) => b[1] - a[1]), [inMonth]);

  const aiIn = useMemo(() => ledgerSummaryInput(all, month, today), [all, month, today]);
  const ai = useAi('ledgerSummary', aiIn, JSON.stringify(aiIn));
  const diff = prevTotal === null ? null : total - prevTotal;

  return (
    <div className="page t-page lg-page">
      <header className="t-head">
        <h1>가계부</h1>
        <button className="t-head-icon" aria-label="설정" onClick={() => nav.push({ name: 'settings' })}><IconGear /></button>
      </header>

      <section className="t-card lg-hero">
        <div className="lg-month">
          <button aria-label="이전 달" disabled={!canPrev} onClick={() => go(-1)}>‹</button>
          <span>{m}월 지출</span>
          <button aria-label="다음 달" disabled={!canNext} onClick={() => go(1)}>›</button>
        </div>
        <strong className="lg-total"><Won n={total} /></strong>
        <p className="lg-compare">
          {diff === null ? `하루 평균 ${fmt(Math.round(total / elapsed))}` : diff === 0 ? '지난달 이맘때와 같아요' : <>지난달 이맘때보다 <b className={diff > 0 ? 'more' : 'less'}>{fmt(Math.abs(diff))} {diff > 0 ? '더' : '덜'}</b> 썼어요</>}
        </p>
        <div className="lg-actions">
          <button type="button" className="lg-act primary" onClick={() => setSheet('add')}><span aria-hidden="true">＋</span>지출 쓰기</button>
          <button type="button" className="lg-act" onClick={() => setSheet('paste')}><AiMark label="" />문자로 한 번에</button>
        </div>
      </section>

      <DayDone today={today} />

      {inMonth.length > 0 && (
        <AiCard title={ai.data?.title ?? '이번 달 정리'} loading={ai.loading} source={ai.source}>
          <ul className="ai-points">{ai.data?.points.map((p) => <li key={p}>{p}</li>)}</ul>
        </AiCard>
      )}

      <div className="t-seg lg-seg" role="tablist" aria-label="보기">
        {([['list', '내역'], ['calendar', '달력'], ['report', '분석']] as const).map(([k, l]) => (
          <button key={k} role="tab" aria-selected={view === k} onClick={() => setView(k)}>{l}</button>
        ))}
      </div>

      {inMonth.length === 0 ? (
        <section className="t-card lg-empty">
          <CategoryIcon category="기타" size={52} />
          <h2>{m}월 기록이 아직 없어요</h2>
          <p>쓴 돈을 적거나, 카드 승인 문자를 붙여넣으면 AI가 정리해 줘요.</p>
          <div className="lg-actions"><button className="lg-act primary" onClick={() => setSheet('add')}>지출 쓰기</button><button className="lg-act" onClick={() => setSheet('paste')}>문자로 한 번에</button></div>
        </section>
      ) : (
        <>
          {view === 'list' && <ListView items={inMonth} byCat={byCat} cat={cat} setCat={(c) => { setCat(c); setPages(1); }} pages={pages} more={() => setPages(pages + 1)} today={today} />}
          {view === 'calendar' && <CalendarView month={month} items={inMonth} today={today} day={day ?? (month === startOfMonth(today) ? today : inMonth[0]?.date ?? month)} setDay={setDay} />}
          {view === 'report' && <ReportView items={inMonth} byCat={byCat} total={total} openCat={(c) => { setCat(c); setView('list'); }} />}
        </>
      )}

      {sheet === 'add' && <AddSheet today={today} onClose={() => setSheet(null)} />}
      {sheet === 'paste' && <PasteFlow onClose={() => setSheet(null)} />}
    </div>
  );
}

function ListView({ items, byCat, cat, setCat, pages, more, today }: { items: SpendEntry[]; byCat: [string, number][]; cat: string | null; setCat: (c: string | null) => void; pages: number; more: () => void; today: ISODate }) {
  const shown = items.filter((e) => !cat || e.category === cat);
  const groups: [ISODate, SpendEntry[]][] = [];
  for (const e of shown) {
    const g = groups.at(-1);
    if (g && g[0] === e.date) g[1].push(e);
    else groups.push([e.date, [e]]);
  }
  const visible = groups.slice(0, pages * PAGE_DAYS);
  const left = groups.length - visible.length;
  return (
    <section className="t-card lg-list">
      <div className="t-chips" role="group" aria-label="카테고리">
        <button aria-pressed={!cat} onClick={() => setCat(null)}>전체</button>
        {byCat.map(([c]) => <button key={c} aria-pressed={cat === c} onClick={() => setCat(cat === c ? null : c)}>{c}</button>)}
      </div>
      {visible.map(([d, list]) => (
        <div key={d} className="lg-day">
          <div className="lg-day-head"><span>{dayLabel(d, today)}</span><span className="num">−{fmt(sum(list))}</span></div>
          {list.map((e, i) => <Row key={i} e={e} />)}
        </div>
      ))}
      {!groups.length && <p className="t-empty">이 카테고리 지출이 없어요.</p>}
      {left > 0 && <button className="lg-more" onClick={more}>이전 기록 더 보기</button>}
    </section>
  );
}

function CalendarView({ month, items, today, day, setDay }: { month: ISODate; items: SpendEntry[]; today: ISODate; day: ISODate; setDay: (d: ISODate) => void }) {
  const { y, m } = parseISO(month);
  const byDay = items.reduce<Record<string, number>>((acc, e) => ((acc[e.date] = (acc[e.date] ?? 0) + e.amount), acc), {});
  const max = Math.max(1, ...Object.values(byDay));
  const cells: (ISODate | null)[] = [...Array(weekdayOf(month)).fill(null), ...Array.from({ length: daysInMonth(y, m) }, (_, i) => addDays(month, i))];
  const list = items.filter((e) => e.date === day);
  return (
    <>
      <section className="t-card lg-cal" aria-label="달력">
        <div className="lg-cal-head">{WD.map((w, i) => <span key={w} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>{w}</span>)}</div>
        <div className="lg-cal-grid">
          {cells.map((d, i) => {
            if (!d) return <span key={`b${i}`} />;
            const v = byDay[d] ?? 0;
            return (
              <button key={d} disabled={d > today} className={`${day === d ? 'on' : ''}${d === today ? ' today' : ''}`} onClick={() => setDay(d)} aria-label={`${parseISO(d).d}일 ${v ? fmt(v) : '지출 없음'}`}>
                <i>{parseISO(d).d}</i>
                <small style={{ opacity: v ? 0.55 + 0.45 * (v / max) : 0 }}>{v ? manShort(v) : '·'}</small>
              </button>
            );
          })}
        </div>
      </section>
      <section className="t-card lg-list">
        <div className="lg-day">
          <div className="lg-day-head"><span>{dayLabel(day, today)}</span><span className="num">{list.length ? `−${fmt(sum(list))}` : ''}</span></div>
          {list.map((e, i) => <Row key={i} e={e} />)}
          {!list.length && <p className="t-empty">이날은 쓴 돈이 없어요.</p>}
        </div>
      </section>
    </>
  );
}

function ReportView({ items, byCat, total, openCat }: { items: SpendEntry[]; byCat: [string, number][]; total: number; openCat: (c: string) => void }) {
  const byWd = [0, 1, 2, 3, 4, 5, 6].map((w) => {
    const days = new Set(items.filter((e) => weekdayOf(e.date) === w).map((e) => e.date)).size;
    return { w, avg: days ? sum(items.filter((e) => weekdayOf(e.date) === w)) / days : 0 };
  });
  const maxWd = Math.max(1, ...byWd.map((x) => x.avg));
  const top = [...items].sort((a, b) => b.amount - a.amount).slice(0, 3);
  return (
    <>
      <section className="t-card">
        <div className="t-card-head"><h2>어디에 많이 썼을까</h2></div>
        <div className="lg-stack" role="img" aria-label={byCat.map(([c, v]) => `${c} ${fmt(v)}`).join(', ')}>{byCat.map(([c, v]) => <span key={c} style={{ width: `${(100 * v) / total}%`, background: categoryColor(c) }} />)}</div>
        <div className="t-list">
          {byCat.map(([c, v]) => (
            <button key={c} className="t-row" onClick={() => openCat(c)}>
              <CategoryIcon category={c} size={40} />
              <span className="t-row-main"><b>{c}</b><small>{Math.round((100 * v) / total)}%</small></span>
              <span className="t-row-amt num">{fmt(v)}</span>
            </button>
          ))}
        </div>
      </section>
      <section className="t-card">
        <div className="t-card-head"><h2>요일별 하루 평균</h2></div>
        <div className="lg-wd">
          {byWd.map(({ w, avg }) => (
            <span key={w}>
              <small>{avg ? manShort(avg) : ''}</small>
              <i style={{ height: `${Math.max(4, (100 * avg) / maxWd)}%` }} className={avg === maxWd ? 'top' : ''} />
              <b>{WD[w]}</b>
            </span>
          ))}
        </div>
      </section>
      <section className="t-card">
        <div className="t-card-head"><h2>가장 큰 지출</h2></div>
        {top.map((e, i) => <Row key={i} e={e} showDate />)}
      </section>
    </>
  );
}

/* ───────── 빠른 쓰기 ───────── */
function AddSheet({ today, onClose }: { today: ISODate; onClose: () => void }) {
  const { state, update } = useStore();
  const toast = useToast();
  const [amount, setAmount] = useState(0);
  const [name, setName] = useState('');
  const [picked, setPicked] = useState<string | null>(null);
  const [date, setDate] = useState<ISODate>(today);
  const guess = name.trim() ? exampleNow('categorize', { name: name.trim(), categories: [...CATEGORIES] }) : null;
  const remembered = name.trim() ? state.categoryMemory[name.trim().toLowerCase().replace(/\s+/g, '')] : undefined;
  const suggested = remembered ?? (guess && guess.confidence >= 0.5 ? guess.category : null);
  const category = picked ?? suggested ?? '기타';

  const { moa, saveTxns } = useMoa();
  const [method, setMethod] = useState<PayMethod>(moa.mainMethod && moa.mainMethod !== 'atm' ? moa.mainMethod : 'debit');
  const save = () => {
    const occurredAt = date === today ? Date.now() : Date.UTC(Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1, Number(date.slice(8, 10)), 3);
    saveTxns([{ occurredAt, date, amount, kind: 'spend', method, account: method === 'cash' ? 'cash' : method === 'credit' ? 'other' : 'pay', name: name.trim() || category, category, essential: false, source: 'manual' }]);
    if (picked && name.trim()) update((s) => rememberCategory(s, name.trim(), picked));
    toast(`${fmt(amount)} 적었어요`);
    onClose();
  };

  return (
    <Sheet title="지출 쓰기" onClose={onClose} footer={<Button disabled={amount <= 0} onClick={save}>{amount > 0 ? `${fmt(amount)} 저장` : '금액을 넣어 주세요'}</Button>}>
      <AmountText value={amount} placeholder="얼마 썼어요?" />
      <input className="lg-input" value={name} onChange={(e) => { setName(e.target.value.slice(0, 30)); setPicked(null); }} placeholder="어디에 썼어요? (예: 스타벅스 라떼)" autoComplete="off" />
      <div className="lg-cat">
        {suggested && !picked && <p className="lg-ai-guess"><AiMark label="AI" /><span><b>{suggested}</b>{euro(suggested)} 분류했어요{remembered ? ' · 전에 고친 대로' : ''}</span></p>}
        <Chips label="카테고리">
          {CATEGORIES.map((c) => <Chip key={c} on={category === c} onClick={() => setPicked(c)}>{c}</Chip>)}
        </Chips>
      </div>
      <Chips label="결제 수단">
        {(['debit', 'credit', 'transfer', 'cash'] as PayMethod[]).map((p) => <Chip key={p} on={method === p} onClick={() => setMethod(p)}>{METHOD_LABEL[p]}</Chip>)}
      </Chips>
      <Chips label="날짜">
        <Chip on={date === today} onClick={() => setDate(today)}>오늘</Chip>
        <Chip on={date === addDays(today, -1)} onClick={() => setDate(addDays(today, -1))}>어제</Chip>
        <Chip on={date === addDays(today, -2)} onClick={() => setDate(addDays(today, -2))}>그저께</Chip>
      </Chips>
      <div className="lg-pad"><NumberPad value={amount} onChange={setAmount} max={10_000_000} /></div>
    </Sheet>
  );
}

/* ───────── 오늘 기록 완료 ───────── */
/** '0원인 날'과 '기록 안 한 날', '일부만 적은 날'을 가르는 버튼. 지출 예측의 정답은 완료한 날만 쓴다. */
function DayDone({ today }: { today: ISODate }) {
  const { moa, set } = useMoa();
  const yesterday = addDays(today, -1);
  const st = moa.dayStatus[today];
  const yst = moa.dayStatus[yesterday];
  const labeled = Object.keys(moa.dayStatus).length;
  return (
    <section className="t-card lg-done">
      <div>
        <b>{st ? (st === 'reconciled' ? '오늘 은행 앱과 대조 완료' : '오늘 기록 완료') : '오늘 쓴 돈을 다 적었나요?'}</b>
        <small>지출이 없었던 날도 눌러 주세요. 다 적은 날만 예측 학습에 써요 · 완료한 날 {labeled}일</small>
      </div>
      <div className="lg-done-btns">
        {!st ? (
          <>
            <button className="lg-act primary" onClick={() => set((m) => setDayStatus(m, today, 'self'))}>오늘 기록 완료</button>
            <button className="lg-act" onClick={() => set((m) => setDayStatus(m, today, 'reconciled'))}>은행 앱과 대조함</button>
          </>
        ) : (
          <button className="lg-act" onClick={() => set((m) => setDayStatus(m, today, null))}>완료 취소</button>
        )}
        {!yst && <button className="lg-act" onClick={() => set((m) => setDayStatus(m, yesterday, 'self'))}>어제도 완료</button>}
      </div>
    </section>
  );
}
