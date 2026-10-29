import { useMemo, useState } from 'react';
import { addDays, addMonths, daysInMonth, endOfMonth, parseISO, startOfMonth, todayKST, weekdayOf, type ISODate } from '../../shared/dates';
import { manShort, won } from '../../shared/format';
import { CategoryIcon, categoryColor } from '../components/CategoryIcon';
import { TopBar } from '../components/ui';
import { spendHistory } from '../lib/ml/provider';
import type { SpendEntry } from '../lib/ml/types';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';

const WD = ['일', '월', '화', '수', '목', '금', '토'];
const SOURCE: Record<SpendEntry['from'], string> = { csv: 'CSV', demo: '예시', record: '직접 기록' };
const PAGE_DAYS = 5;
type View = 'list' | 'calendar' | 'report';

export function useSpending() {
  const { state } = useStore();
  const today = todayKST();
  const all = useMemo(
    () => spendHistory(state.records, state.spendLog, today).filter((e) => e.amount > 0).sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : b.amount - a.amount)),
    [state.records, state.spendLog, today],
  );
  return { all, today };
}
const sum = (xs: SpendEntry[]) => xs.reduce((s, e) => s + e.amount, 0);
const dayLabel = (d: ISODate, today: ISODate) => `${parseISO(d).m}월 ${parseISO(d).d}일 ${WD[weekdayOf(d)]}요일${d === today ? ' · 오늘' : d === addDays(today, -1) ? ' · 어제' : ''}`;

export function Row({ e, showDate = false }: { e: SpendEntry; showDate?: boolean }) {
  return (
    <div className="ll-row">
      <CategoryIcon category={e.category} size={38} />
      <span className="ll-main"><b>{e.name || e.category}</b><small>{showDate ? `${parseISO(e.date).m}/${parseISO(e.date).d} · ` : ''}{e.category} · {SOURCE[e.from]}</small></span>
      <strong>−{won(e.amount)}</strong>
    </div>
  );
}

/** 날짜별 가계부 · 내역 / 달력 / 분석 */
export function Ledger() {
  const nav = useNav();
  const { all, today } = useSpending();
  const latest = all[0]?.date ?? today;
  const [month, setMonth] = useState<ISODate>(startOfMonth(latest));
  const [view, setView] = useState<View>('list');
  const [cat, setCat] = useState<string | null>(null);
  const [day, setDay] = useState<ISODate | null>(null);
  const [pages, setPages] = useState(1);

  const mEnd = endOfMonth(month);
  const inMonth = all.filter((e) => e.date >= month && e.date <= mEnd);
  const total = sum(inMonth);
  const { y, m } = parseISO(month);
  const elapsed = mEnd < today ? daysInMonth(y, m) : Math.max(1, parseISO(today).d);
  const prevStart = addMonths(month, -1);
  const prevEnd = addDays(prevStart, Math.min(elapsed, daysInMonth(parseISO(prevStart).y, parseISO(prevStart).m)) - 1);
  const prevTotal = sum(all.filter((e) => e.date >= prevStart && e.date <= prevEnd));
  const hasPrev = all.some((e) => e.date >= prevStart && e.date < month);
  const diff = total - prevTotal;
  const canNext = month < startOfMonth(today);
  const canPrev = all.some((e) => e.date < month);
  const go = (n: number) => { setMonth(addMonths(month, n)); setDay(null); setPages(1); };

  const byCat = Object.entries(inMonth.reduce<Record<string, number>>((acc, e) => ((acc[e.category] = (acc[e.category] ?? 0) + e.amount), acc), {})).sort((a, b) => b[1] - a[1]);

  if (!all.length) {
    return (
      <div className="page ledger-page">
        <TopBar title="가계부" onBack={nav.pop} />
        <section className="ledger-empty">
          <CategoryIcon category="기타" size={56} />
          <h2>아직 지출 기록이 없어요</h2>
          <p>카드·은행 앱에서 받은 지출 CSV를 넣거나, 산 물건을 사진으로 기록하면 날짜별로 정리해 드려요.</p>
          <div className="stack">
            <button className="v8-solid" onClick={() => nav.push({ name: 'newChoice' })}>사진으로 소비 기록하기</button>
            <button className="v8-soft" onClick={() => nav.push({ name: 'settings' })}>지출 CSV 불러오기</button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page ledger-page">
      <TopBar title="가계부" onBack={nav.pop} right={<button className="ledger-add" onClick={() => nav.push({ name: 'newChoice' })}>+ 기록</button>} />

      <div className="ledger-sticky">
        <div className="ledger-month">
          <button aria-label="이전 달" disabled={!canPrev} onClick={() => go(-1)}>‹</button>
          <b>{y}년 {m}월</b>
          <button aria-label="다음 달" disabled={!canNext} onClick={() => go(1)}>›</button>
        </div>
        <div className="ledger-tabs" role="tablist">
          {([['list', '내역'], ['calendar', '달력'], ['report', '분석']] as const).map(([k, l]) => (
            <button key={k} role="tab" aria-selected={view === k} className={view === k ? 'on' : ''} onClick={() => setView(k)}>{l}</button>
          ))}
        </div>
      </div>

      <section className="ledger-summary">
        <span>{m}월 지출</span>
        <strong>{won(total)}</strong>
        <div className="ledger-sub">
          {hasPrev ? <span className={diff > 0 ? 'more' : 'less'}>지난달 같은 기간보다 {won(Math.abs(diff))} {diff > 0 ? '더 썼어요' : '덜 썼어요'}</span> : <span>지난달 기록이 없어 비교하지 않았어요</span>}
          <span>하루 평균 {won(Math.round(total / elapsed))} · {inMonth.length}건</span>
        </div>
      </section>

      {view === 'list' && <ListView items={inMonth} byCat={byCat} cat={cat} setCat={(c) => { setCat(c); setPages(1); }} pages={pages} more={() => setPages(pages + 1)} today={today} />}
      {view === 'calendar' && <CalendarView month={month} items={inMonth} today={today} day={day ?? (month === startOfMonth(today) ? today : inMonth[0]?.date ?? month)} setDay={setDay} />}
      {view === 'report' && <ReportView items={inMonth} byCat={byCat} total={total} openCat={(c) => { setCat(c); setView('list'); }} />}

      <p className="v8-footer-disclaimer">월세·통신비처럼 매달 나가는 고정지출은 CSV에서 빼고 보여줘요. 기록은 이 기기에만 저장돼요.</p>
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
    <>
      <div className="ledger-chips" role="group" aria-label="카테고리">
        <button className={!cat ? 'on' : ''} onClick={() => setCat(null)}>전체</button>
        {byCat.map(([c]) => <button key={c} className={cat === c ? 'on' : ''} onClick={() => setCat(cat === c ? null : c)}>{c}</button>)}
      </div>
      <section className="ledger-list">
        {visible.map(([d, list]) => (
          <div key={d} className="ll-day">
            <div className="ll-day-head"><b>{dayLabel(d, today)}</b><span>−{won(sum(list))}</span></div>
            {list.map((e, i) => <Row key={i} e={e} />)}
          </div>
        ))}
        {!groups.length && <p className="ledger-none">이 조건에 맞는 지출이 없어요.</p>}
      </section>
      {left > 0 && <button className="ledger-more" onClick={more}>이전 {Math.min(left, PAGE_DAYS)}일 더 보기 <small>남은 {left}일</small></button>}
    </>
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
      <section className="ledger-cal" aria-label="달력">
        <div className="lc-head">{WD.map((w, i) => <span key={w} className={i === 0 ? 'sun' : i === 6 ? 'sat' : ''}>{w}</span>)}</div>
        <div className="lc-grid">
          {cells.map((d, i) => {
            if (!d) return <span key={`b${i}`} />;
            const v = byDay[d] ?? 0;
            return (
              <button key={d} disabled={d > today} className={`${day === d ? 'on' : ''}${d === today ? ' today' : ''}`} onClick={() => setDay(d)}>
                <i>{parseISO(d).d}</i>
                {v > 0 ? <small style={{ opacity: 0.55 + 0.45 * (v / max) }}>{manShort(v)}</small> : <small className="zero"> </small>}
              </button>
            );
          })}
        </div>
      </section>
      <section className="ledger-list">
        <div className="ll-day">
          <div className="ll-day-head"><b>{dayLabel(day, today)}</b><span>{list.length ? `−${won(sum(list))}` : '지출 없음'}</span></div>
          {list.map((e, i) => <Row key={i} e={e} />)}
          {!list.length && <p className="ledger-none">이날은 쓴 돈이 없어요.</p>}
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
      <section className="ledger-card">
        <h3>어디에 많이 썼을까</h3>
        {total > 0 && <div className="ledger-bar" role="img" aria-label={byCat.map(([c, v]) => `${c} ${won(v)}`).join(', ')}>{byCat.map(([c, v]) => <span key={c} style={{ width: `${(100 * v) / total}%`, background: categoryColor(c) }} />)}</div>}
        <div className="ledger-cats">
          {byCat.map(([c, v]) => (
            <button key={c} onClick={() => openCat(c)}>
              <CategoryIcon category={c} size={30} />
              <span>{c}</span>
              <b>{won(v)}</b>
              <small>{Math.round((100 * v) / total)}%</small>
            </button>
          ))}
        </div>
      </section>
      <section className="ledger-card">
        <h3>요일별 하루 평균</h3>
        <div className="wd-bars">
          {byWd.map(({ w, avg }) => (
            <span key={w}>
              <small>{avg ? manShort(avg) : ''}</small>
              <i style={{ height: `${Math.max(3, (100 * avg) / maxWd)}%` }} className={avg === maxWd ? 'top' : ''} />
              <b>{WD[w]}</b>
            </span>
          ))}
        </div>
      </section>
      <section className="ledger-card">
        <h3>이번 달 가장 큰 지출</h3>
        {top.map((e, i) => <Row key={i} e={e} showDate />)}
      </section>
    </>
  );
}

/** 홈 카드: 이번 달 지출 요약 + 최근 내역 */
export function SpendCard() {
  const nav = useNav();
  const { all, today } = useSpending();
  const month = startOfMonth(today);
  const total = sum(all.filter((e) => e.date >= month));
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const perDay = week.map((d) => sum(all.filter((e) => e.date === d)));
  const max = Math.max(1, ...perDay);
  const recent = all.slice(0, 3);
  return (
    <section className="v8-white spend-card">
      <button className="sc-headline" onClick={() => nav.push({ name: 'ledger' })}>
        <span className="sc-title">가계부</span>
        <span className="sc-go">전체 보기 ›</span>
      </button>
      {all.length ? (
        <>
          <button className="sc-top" onClick={() => nav.push({ name: 'ledger' })}>
            <div><span>{parseISO(today).m}월에 쓴 돈</span><strong>{won(total)}</strong></div>
            <div className="sc-bars" aria-label="최근 7일 지출">
              {perDay.map((v, i) => (
                <span key={week[i]}>
                  <i style={{ height: `${Math.max(6, (100 * v) / max)}%` }} className={i === 6 ? 'today' : ''} />
                  <small>{WD[weekdayOf(week[i])]}</small>
                </span>
              ))}
            </div>
          </button>
          {recent.map((e, i) => <Row key={i} e={e} showDate />)}
          <div className="sc-actions">
            <button className="v8-soft" onClick={() => nav.push({ name: 'ledger' })}>날짜별 내역</button>
            <button className="v8-soft" onClick={() => nav.push({ name: 'newChoice' })}>+ 사진으로 기록</button>
          </div>
        </>
      ) : (
        <div className="sc-empty">
          <p>산 물건을 사진으로 기록하거나 카드·은행 앱 지출 CSV를 넣으면 날짜별로 정리해 드려요.</p>
          <div className="sc-actions">
            <button className="v8-soft" onClick={() => nav.push({ name: 'newChoice' })}>+ 사진으로 기록</button>
            <button className="v8-soft" onClick={() => nav.push({ name: 'settings' })}>CSV 불러오기</button>
          </div>
        </div>
      )}
    </section>
  );
}
