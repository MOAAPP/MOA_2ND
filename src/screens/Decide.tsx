import { useCallback, useMemo, useState, type ReactElement } from 'react';
import { addDays, addMonths, formatKDate, formatShort, maxDate, startOfMonth, todayKST, type ISODate } from '../../shared/dates';
import { manShort, won } from '../../shared/format';
import { CategoryPill, OptionList, PhotoButton, QuickDate, StepHead } from '../components/flow';
import { IconTile } from '../components/Glyph';
import { ParallelChart } from '../components/ParallelChart';
import { DecisionTrend } from '../components/DecisionTrend';
import { usePhotoReader } from '../components/PhotoReader';
import { AmountInput, CtaBar, Sheet, Switch, TopBar, useToast } from '../components/ui';
import { balanceOn, nextOccurrence } from '../lib/cashflow';
import { WORLD_NAME } from '../lib/categories';
import { projectGoal } from '../lib/goals';
import { uid } from '../lib/id';
import { PaymentGradeCompare } from './moa/GradeCompare';
import { findLowestPrice, type PriceResult } from '../lib/ocr';
import { compareChoices, toSnapshot, type ScenarioResult } from '../lib/scenarios';
import type { Choice, ChoiceParams, DecisionRecord } from '../lib/types';
import { useNav } from '../state/nav';
import { rememberCategory, useStore } from '../state/store';

export function defaultParallelAs(choice: Choice): Choice {
  return choice === 'skip' ? 'buy' : choice === 'buy' ? 'skip' : 'buy';
}

type Phase = 'amount' | 'compare';

export function Decide({ recordId }: { recordId?: string }) {
  const { state, update } = useStore();
  const nav = useNav();
  const toast = useToast();
  const profile = state.profile!;
  const today = todayKST();
  const editing = recordId ? state.records.find((r) => r.id === recordId) : undefined;

  const [phase, setPhase] = useState<Phase>(editing ? 'compare' : 'amount');
  const [dateExpanded, setDateExpanded] = useState(false);
  const [amount, setAmount] = useState<number | undefined>(editing?.params.amount);
  const [name, setName] = useState(editing?.name ?? '');
  const [category, setCategory] = useState(editing?.category ?? '쇼핑');
  const [userPicked, setUserPicked] = useState(!!editing);
  const [date, setDate] = useState<ISODate>(editing?.params.date ?? today);
  const [delayDate, setDelayDate] = useState<ISODate | undefined>(editing?.params.delayDate);
  const [alt, setAlt] = useState<{ amount: number; name?: string } | undefined>(editing?.params.altAmount ? { amount: editing.params.altAmount, name: editing.params.altName } : undefined);
  const [inst, setInst] = useState<number>(editing?.params.installments ?? 1);
  const [partner, setPartner] = useState<Exclude<Choice, 'buy'>>('skip');
  const [cursor, setCursor] = useState<ISODate | null>(null);
  const [sheet, setSheet] = useState<null | 'delay' | 'alt' | 'record' | Choice>(null);

  const onCategory = useCallback((c: string, by: 'auto' | 'user') => {
    setCategory(c);
    if (by === 'user') setUserPicked(true);
  }, []);
  const photo = usePhotoReader((r) => {
    setAmount(r.amount);
    if (r.name) setName(r.name);
  });

  const nextIncome = useMemo(() => {
    let best: { date: ISODate; name: string } | null = null;
    for (const it of profile.items) {
      if (it.kind !== 'income') continue;
      const d = nextOccurrence(it, addDays(today, 1));
      if (d && (!best || d < best.date)) best = { date: d, name: it.name };
    }
    return best;
  }, [profile.items, today]);

  const label = name.trim() || category;
  const params: ChoiceParams | null = amount
    ? {
        amount,
        date,
        delayDate: delayDate && delayDate > date ? delayDate : undefined,
        altAmount: alt && alt.amount < amount ? alt.amount : undefined,
        altName: alt?.name,
        installments: inst >= 2 ? inst : undefined,
      }
    : null;
  const choices: Choice[] = ['buy', 'skip', ...(params?.delayDate ? (['delay'] as Choice[]) : []), ...(params?.altAmount ? (['alt'] as Choice[]) : [])];
  const partnerChoice: Choice = choices.includes(partner) ? partner : 'skip';

  const cmp = useMemo(
    () => (params && phase === 'compare' ? compareChoices({ profile, records: state.records, params, label, choices, today, excludeRecordId: recordId }) : null),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [phase, profile, state.records, JSON.stringify(params), label, choices.join(), today, recordId],
  );
  const A = cmp?.results.buy;
  const B = cmp?.results[partnerChoice];
  const cur = cursor && cmp && cursor >= cmp.from && cursor <= cmp.horizon ? cursor : A?.monthEnd.date ?? today;


  const goalInfo = useMemo(() => {
    const g = profile.goal;
    if (!g?.monthlySaving || !A || !B) return null;
    const diff = B.monthEnd.balance - A.monthEnd.balance;
    const opts = { target: g.target, saved: g.saved, monthlySaving: g.monthlySaving, annualRate: g.annualRate ?? 0, today };
    return { name: g.name, base: projectGoal(opts), alt: projectGoal({ ...opts, extra: { amount: diff, frequency: 'once', months: 0 } }) };
  }, [profile.goal, A, B, today]);

  const save = (choice: Choice | null, inParallel: boolean) => {
    if (!params || !cmp) return;
    const id = editing?.id ?? uid('rec');
    const rec: DecisionRecord = {
      id,
      createdAt: editing?.createdAt ?? Date.now(),
      source: 'decide',
      category,
      name: name.trim() || undefined,
      memo: editing?.memo,
      params,
      choice,
      choiceAt: choice ? Date.now() : undefined,
      reflectedOverride: editing?.reflectedOverride ?? null,
      inParallel: choice ? inParallel : false,
      parallelAs: choice ? (choice === 'buy' ? partnerChoice : 'buy') : 'skip',
      satisfaction: editing?.satisfaction,
      reason: editing?.reason,
      snapshot: toSnapshot(cmp),
    };
    update((s) => {
      const next = { ...s, records: editing ? s.records.map((r) => (r.id === id ? rec : r)) : [rec, ...s.records] };
      return userPicked && name.trim() ? rememberCategory(next, name, category) : next;
    });
    toast(choice ? '기록했어요' : '고민 중으로 남겨뒀어요');
    setSheet(null);
    nav.replace({ name: 'record', id });
  };

  const back = () => {
    if (phase === 'compare' && !editing) setPhase('amount');
    else nav.pop();
  };

  /* 빠른 비교: 구매 이름·금액·날짜를 한 화면에서 입력합니다. 날짜와 카테고리는 선택 사항. */
  if (phase === 'amount') {
    return (
      <div className="page no-nav has-cta decision-input-page">
        <TopBar onBack={back} title="소비 미리보기" />
        <div className="decision-step-indicator"><span className="active"/><span/> <span>1 / 2</span></div>
        <header className="decision-input-heading">
          <span className="decision-eyebrow">사기 전에, 10초만</span>
          <h1>지금 사면,<br />얼마가 남을까?</h1>
          <p>금액을 입력하고 두 선택을 비교해 보세요.</p>
        </header>
        <div className="decision-input-art" aria-hidden>
          <span className="decision-art-glow" />
          <img src="/illustrations/latte.png" alt="" />
          <div className="decision-art-bubble"><span>지금의 선택</span><b>다른 내일을 만들어요</b></div>
        </div>
        <div className="decision-input-form">
          <label className="decision-field-title" htmlFor="decision-name">어떤 걸 고민하고 있어요? <span>선택</span></label>
          <input id="decision-name" className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="예: 커피, 운동화, 노트북" maxLength={30} />
          <label className="decision-field-title" style={{ marginTop: 20 }}>얼마예요? <span className="required">필수</span></label>
          <div className="decision-amount-wrap"><AmountInput value={amount} onChange={setAmount} label="금액" allowZero={false} quick={[]} /></div>
          <PhotoButton label="사진에서 금액 가져오기" onFile={photo.read} />
          <div className="decision-option-block">
            <button className="decision-option-toggle" type="button" aria-expanded={dateExpanded} onClick={() => setDateExpanded((v) => !v)}>
              <span><b>구매 예정일</b><small>{formatKDate(date, { weekday: true })}</small></span>
              <span aria-hidden>{dateExpanded ? '−' : '변경 +'}</span>
            </button>
            {dateExpanded && <input aria-label="구매 예정일" className="input" type="date" min={today} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} />}
          </div>
          {name.trim() && <div className="decision-category"><span>지출 분류</span><CategoryPill name={name} value={category} onChange={onCategory} memory={state.categoryMemory} userPicked={userPicked} /></div>}
        </div>
        <CtaBar><button className="btn primary block decision-primary" disabled={!amount || amount <= 0} onClick={() => { setCursor(null); setPhase('compare'); }}>두 가지 미래 비교하기 <span aria-hidden>→</span></button></CtaBar>
        {photo.sheet}
      </div>
    );
  }

  if (!cmp || !A || !B || !params) {
    return (
      <div className="page no-nav">
        <TopBar onBack={nav.pop} title="" />
        <StepHead title="금액을 다시 넣어주세요" />
        <button className="btn primary block" style={{ marginTop: 24 }} onClick={() => setPhase('amount')}>금액 입력하기</button>
      </div>
    );
  }

  const diff = B.monthEnd.balance - A.monthEnd.balance;

  const altChips: { c: Exclude<Choice, 'buy'>; title: string; sub: string; ready: boolean }[] = [
    { c: 'skip', title: '안 산 나', sub: '이번엔 참기', ready: true },
    { c: 'delay', title: '미룬 나', sub: params.delayDate ? `${formatShort(params.delayDate)}에 사기` : '날짜 정하기', ready: !!params.delayDate },
    { c: 'alt', title: '더 싼 걸 산 나', sub: params.altAmount ? `${manShort(params.altAmount)}원에 사기` : '가격 정하기', ready: !!params.altAmount },
  ];

  return (
    <div className="page no-nav has-cta decision-result-page">
      <TopBar onBack={editing ? nav.pop : back} title="비교 결과" />

      <div className="decision-result-shell">
        <div className="decision-step-indicator decision-result-indicator"><span className="active"/><span className="active"/><span>2 / 2</span></div>
        <header className="decision-result-head">
          <span className="decision-eyebrow">내 소비의 평행세계</span>
          <h1>한 달 뒤,<br /><em>얼마가 달라질까요?</em></h1>
          <div className="decision-product">
            <div className="decision-product-picture"><IconTile name={category === '식비' || /커피|라떼|카페/.test(label) ? 'cup' : 'bag'} tone="blue" size={46} /></div>
            <div><b>{label}</b><span>{formatKDate(params.date)} · {won(params.amount)}{params.installments ? ` · ${params.installments}개월 할부` : ''}</span></div>
            <button onClick={() => setPhase('amount')} aria-label="소비 정보 수정">수정</button>
          </div>
        </header>
        <div className="decision-comparison">
          <div className="decision-section-kicker">{formatKDate(A.monthEnd.date)} 예상 잔고</div>
          <div className="decision-choice-grid">
            <div className="decision-choice-card buying">
              <div className="decision-choice-caption"><span className="decision-dot red"/>지금 구매</div>
              <strong className="num">{won(A.monthEnd.balance)}</strong>
              <p>지금 결제한다면</p>
            </div>
            <div className="decision-choice-card alternative">
              <div className="decision-choice-caption"><span className="decision-dot blue"/>{partnerChoice === 'skip' ? '이번엔 보류' : WORLD_NAME[partnerChoice]} <b>다른 선택</b></div>
              <strong className="num">{won(B.monthEnd.balance)}</strong>
              <p>{partnerChoice === 'skip' ? '지금은 사지 않는다면' : partnerChoice === 'delay' ? '나중에 결제한다면' : '대체 상품을 고른다면'}</p>
            </div>
          </div>
          <div className="decision-difference">
            <div className="decision-difference-icon"><IconTile name="trend" tone="blue" size={48} /></div>
            <div>
              <span>선택 하나가 만드는 차이</span>
              <strong className="num">{diff === 0 ? '예상 잔고가 같아요' : `${won(Math.abs(diff))} ${diff > 0 ? '더 남아요' : '덜 남아요'}`}</strong>
              <p>{partnerChoice === 'skip' ? '이번 소비를 미루거나 참았을 때의 월말 예상 차이예요.' : '선택한 대안과 지금 구매할 때를 비교했어요.'}</p>
            </div>
          </div>
        </div>
        <div className="decision-alternatives">
          <div className="decision-section-kicker">다른 선택도 확인해 볼까요?</div>
          <div className="decision-alt-row" role="radiogroup" aria-label="비교할 다른 선택">
            {altChips.map((ch) => (
              <button key={ch.c} type="button" role="radio" aria-checked={partnerChoice === ch.c}
                className={`decision-alt-pill${partnerChoice === ch.c ? ' selected' : ''}`}
                onClick={() => {
                  if (!ch.ready) setSheet(ch.c === 'delay' ? 'delay' : 'alt');
                  else { setPartner(ch.c); setCursor(null); }
                }}>
                {ch.c === 'skip' ? '안 사기' : ch.c === 'delay' ? '다음에 사기' : '더 저렴하게'}{!ch.ready && <span aria-hidden> +</span>}
              </button>
            ))}
          </div>
        </div>
        <button className="decision-ml-context" onClick={() => nav.push({name:'insights'})}>
          <span className="decision-ml-symbol">✦</span>
          <span><b>내 생활비까지 고려한 분석</b><small>최근 지출 기록으로 앞으로의 생활비를 예측해요 · 자세히 보기 →</small></span>
        </button>

        <div className="decision-disclaimer">입력한 잔고와 예정된 수입·지출을 바탕으로 한 추정치예요. 실제 잔고와는 차이가 날 수 있어요.</div>
      </div>

      <details className="decision-advanced">
        <summary><span><b>더 자세하게 분석하기</b><small>생활비 위험, 구매 추천일, 날짜별 잔고</small></span><span className="decision-advanced-arrow" aria-hidden>⌄</span></summary>
        <div className="decision-advanced-content">
          <DecisionTrend buy={A.sim} alternative={B.sim} from={cmp.from} to={A.monthEnd.date} alternativeLabel={partnerChoice === 'skip' ? '이번엔 보류' : WORLD_NAME[partnerChoice]} />
        <section className="blk" style={{ paddingTop: 6 }}>
          <div className="block-head"><h2>날짜별 잔고 확인하기</h2></div>
          <p className="muted-note">그래프를 움직이면 그날의 예상 잔고를 볼 수 있어요.</p>
          <ParallelChart
            real={{ days: A.sim.days, label: WORLD_NAME.buy }}
            para={{ days: B.sim.days, label: WORLD_NAME[partnerChoice] }}
            from={cmp.from}
            minBalance={profile.minBalance}
            cursor={cur}
            onCursor={setCursor}
            forkDate={maxDate(params.date, cmp.from)}
            animKey={partnerChoice + params.amount + params.date}
          />
          <div className="decision-exact-totals">
            <span>{formatKDate(cur)}</span>
            <b>{WORLD_NAME.buy}: {won(balanceOn(A.sim, cur) ?? A.monthEnd.balance)}</b>
            <b>{WORLD_NAME[partnerChoice]}: {won(balanceOn(B.sim, cur) ?? B.monthEnd.balance)}</b>
          </div>
        </section>

      {/* 결제일 기준 (확률 대신 네 시나리오 등급) */}
      <PaymentGradeCompare amount={params.amount} date={params.date} installments={params.installments} />

      {/* 최저가 */}
      {name.trim().length >= 2 && <PriceBlock query={name.trim()} amount={params.amount} onUse={(p) => { setAlt(p); setPartner('alt'); setCursor(null); }} />}

      {/* 자세히 */}
      <section className="blk">
        <div className="block-head"><h2>자세히</h2></div>
        <dl className="kv-rows">
          <div className="head"><dt /><dd>{WORLD_NAME.buy}</dd><dd className="para">{WORLD_NAME[partnerChoice]}</dd></div>
          <div><dt>산 직후</dt><dd className="num">{won(A.afterChoice)}</dd><dd className="num">{won(B.afterChoice)}</dd></div>
          <div>
            <dt>가장 적을 때</dt>
            <dd className="num">{won(A.low.amount)}<small>{formatShort(A.low.date)}</small></dd>
            <dd className="num">{won(B.low.amount)}<small>{formatShort(B.low.date)}</small></dd>
          </div>
          {A.laterMonthEnd && B.laterMonthEnd && (
            <div><dt>{formatShort(A.laterMonthEnd.date)}</dt><dd className="num">{won(A.laterMonthEnd.balance)}</dd><dd className="num">{won(B.laterMonthEnd.balance)}</dd></div>
          )}
          {goalInfo && (
            <div>
              <dt>{goalInfo.name} 모으는 날</dt>
              <dd>{goalInfo.base.arrival ? formatKDate(goalInfo.base.arrival, { year: true }) : '-'}</dd>
              <dd>{goalInfo.alt.arrival ? formatKDate(goalInfo.alt.arrival, { year: true }) : '-'}</dd>
            </div>
          )}
        </dl>
        <div className="field" style={{ marginTop: 18 }}>
          <span className="lab">산 나는 어떻게 결제해요?</span>
          <div className="day-chips">
            {[1, 3, 6, 12].map((n) => (
              <button key={n} type="button" aria-pressed={inst === n} onClick={() => setInst(n)}>{n === 1 ? '일시불' : `${n}개월`}</button>
            ))}
          </div>
          {cmp.outsideHorizon.length > 0 && <p className="muted-note">할부 {cmp.outsideHorizon.length}번은 {formatShort(cmp.horizon)} 뒤에도 이어져요.</p>}
        </div>
        {cmp.uncertain.map((u) => <p key={u} className="muted-note">{u}</p>)}
      </section>

        </div>
      </details>

      <CtaBar>
        <button className="btn primary block decision-primary" onClick={() => setSheet('record')}>내 선택 기록하기 <span aria-hidden>→</span></button>
      </CtaBar>

      {sheet === 'delay' && (
        <DelaySheet
          from={addDays(params.date, 1)}
          value={params.delayDate}
          nextIncome={nextIncome}
          onClose={() => setSheet(null)}
          onSave={(d) => { setDelayDate(d); setPartner('delay'); setCursor(null); setSheet(null); }}
        />
      )}
      {sheet === 'alt' && (
        <AltSheet
          max={params.amount - 1}
          value={alt}
          onClose={() => setSheet(null)}
          onSave={(a) => { setAlt(a); setPartner('alt'); setCursor(null); setSheet(null); }}
        />
      )}
      {sheet && sheet !== 'delay' && sheet !== 'alt' && sheet !== 'record' && cmp.results[sheet] && (
        <WorldSheet result={cmp.results[sheet]!} title={WORLD_NAME[sheet]} from={cmp.from} onClose={() => setSheet(null)} />
      )}
      {sheet === 'record' && <RecordSheet choices={choices} partner={partnerChoice} onClose={() => setSheet(null)} onSave={save} />}
    </div>
  );
}

function DelaySheet({ from, value, nextIncome, onClose, onSave }: { from: ISODate; value?: ISODate; nextIncome: { date: ISODate; name: string } | null; onClose: () => void; onSave: (d: ISODate) => void }) {
  const opts = [
    ...(nextIncome && nextIncome.date >= from ? [{ label: `${nextIncome.name} 들어온 뒤`, date: addDays(nextIncome.date, 1) }] : []),
    { label: '다음 달 초', date: maxDate(from, startOfMonth(addMonths(from, 1))) },
    { label: '한 달 뒤', date: addMonths(addDays(from, -1), 1) },
  ].filter((o, i, a) => a.findIndex((x) => x.date === o.date) === i);
  const [d, setD] = useState<ISODate>(value ?? opts[0].date);
  return (
    <Sheet title="언제로 미룰까요?" onClose={onClose} footer={<button className="btn primary block" onClick={() => onSave(d)}>이 날로 미룬 나 보기</button>}>
      <QuickDate value={d} min={from} onChange={setD} options={opts} />
    </Sheet>
  );
}

function AltSheet({ max, value, onClose, onSave }: { max: number; value?: { amount: number; name?: string }; onClose: () => void; onSave: (a: { amount: number; name?: string }) => void }) {
  const [amount, setAmount] = useState<number | undefined>(value?.amount);
  const [name, setName] = useState(value?.name ?? '');
  return (
    <Sheet title="얼마짜리로 바꿔볼까요?" onClose={onClose} footer={<button className="btn primary block" disabled={!amount || amount > max} onClick={() => amount && onSave({ amount, name: name.trim() || undefined })}>이 가격으로 비교하기</button>}>
      <AmountInput value={amount} onChange={setAmount} label="더 싼 가격" autoFocus allowZero={false} quick={[]} max={max} />
      <label className="field">
        <span className="lab">어떤 걸로요? (선택)</span>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="작년 모델, 중고" maxLength={20} />
      </label>
    </Sheet>
  );
}

function PriceBlock({ query, amount, onUse }: { query: string; amount: number; onUse: (a: { amount: number; name?: string }) => void }) {
  const [res, setRes] = useState<PriceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const run = async () => {
    setLoading(true);
    setRes(await findLowestPrice(query));
    setLoading(false);
  };
  const lowest = res?.items[0];
  return (
    <section className="blk">
      <div className="block-head"><h2>더 싸게 파는 곳</h2></div>
      {!res ? (
        <button className="btn ghost block sm" disabled={loading} onClick={run}>{loading ? '찾는 중…' : `‘${query}’ 최저가 찾아보기`}</button>
      ) : res.configured && lowest ? (
        <>
          <p className="sheet-text">
            {lowest.price < amount ? <>최저 <b>{won(lowest.price)}</b>, 지금 가격보다 {won(amount - lowest.price)} 싸요.</> : <>지금 가격이 이미 최저가 수준이에요.</>}
          </p>
          <div style={{ marginTop: 8 }}>
            {res.items.slice(0, 3).map((it) => (
              <a key={it.link} className="price-row" href={it.link} target="_blank" rel="noreferrer">
                {it.image && <img src={it.image} alt="" loading="lazy" />}
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span className="pr-t" style={{ display: 'block' }}>{it.title}</span>
                  <span className="pr-m">{it.mall}</span>
                </span>
                <b className="num">{won(it.price)}</b>
              </a>
            ))}
          </div>
          {lowest.price < amount && (
            <button className="btn secondary block sm" style={{ marginTop: 10 }} onClick={() => onUse({ amount: lowest.price, name: lowest.mall })}>
              {manShort(lowest.price)}원에 산 나와 비교하기
            </button>
          )}
        </>
      ) : (
        <>
          <p className="sheet-text">쇼핑몰에서 가격을 확인해 보세요. 더 싼 가격을 찾으면 ‘더 싼 걸 산 나’로 비교할 수 있어요.</p>
          <div className="link-row" style={{ marginTop: 12 }}>
            {res.links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.label}</a>)}
          </div>
        </>
      )}
    </section>
  );
}

function WorldSheet({ result, title, from, onClose }: { result: ScenarioResult; title: string; from: ISODate; onClose: () => void }) {
  const events = result.sim.days.filter((d) => d.date >= from && d.flows.length > 0);
  return (
    <Sheet title={`${title}의 한 달`} onClose={onClose}>
      <ul className="rows">
        {events.flatMap((d) =>
          d.flows.map((f, i) => (
            <li key={d.date + i} className="row-item">
              <span className={`day-dot${f.amount > 0 ? ' in' : ''}`}>{formatShort(d.date)}</span>
              <span className="ri-main"><span className="ri-t" style={{ display: 'block' }}>{f.label}</span></span>
              <span className="ri-r">
                <b className="num">{f.amount > 0 ? '+' : '−'}{won(Math.abs(f.amount))}</b>
                <span className={d.close < 0 ? 'up' : ''}>남은 돈 {won(d.close)}</span>
              </span>
            </li>
          )),
        )}
        {!events.length && <li className="muted-note">이 기간엔 들어오거나 나가는 돈이 없어요.</li>}
      </ul>
    </Sheet>
  );
}

function RecordSheet({ choices, partner, onClose, onSave }: { choices: Choice[]; partner: Choice; onClose: () => void; onSave: (c: Choice | null, inParallel: boolean) => void }) {
  const [c, setC] = useState<Choice | null>(null);
  const [inParallel, setInParallel] = useState(true);
  const [busy, setBusy] = useState(false);
  const opts: Record<Choice, { label: string; sub: string }> = {
    buy: { label: '살래요', sub: '산 걸로 기록해요' },
    skip: { label: '안 살래요', sub: '아낀 돈에 쌓여요' },
    delay: { label: '미룰래요', sub: '미룬 날에 나가는 걸로 계산해요' },
    alt: { label: '더 싼 걸로 살래요', sub: '차액만큼 아낀 걸로 쳐요' },
  };
  const icons: Record<Choice, ReactElement> = {
    buy: <IconTile name="bag" tone="red" size={40} />,
    skip: <IconTile name="piggy" tone="blue" size={40} />,
    delay: <IconTile name="calendar" tone="amber" size={40} />,
    alt: <IconTile name="spark" tone="violet" size={40} />,
  };
  const other = c ? (c === 'buy' ? partner : 'buy') : null;
  return (
    <Sheet
      title="그래서 어떻게 할래요?"
      onClose={onClose}
      footer={
        <>
          <button className="btn ghost" disabled={busy} onClick={() => { setBusy(true); onSave(null, false); }}>아직 모르겠어요</button>
          <button className="btn primary flex" disabled={!c || busy} onClick={() => { setBusy(true); onSave(c, inParallel); }}>기록하기</button>
        </>
      }
    >
      <OptionList label="내 선택" value={c} onPick={setC} options={choices.map((k) => ({ value: k, label: opts[k].label, sub: opts[k].sub, icon: icons[k] }))} />
      {c && other && other !== c && (
        <div className="row between" style={{ marginTop: 16, gap: 12 }}>
          <div>
            <div className="bold" style={{ fontSize: 15 }}>홈에서 {WORLD_NAME[other]}도 그리기</div>
            <div className="small muted">다르게 선택했을 때의 잔고도 홈에서 확인할 수 있어요.</div>
          </div>
          <Switch label={`홈에서 ${WORLD_NAME[other]}도 그리기`} checked={inParallel} onChange={setInParallel} />
        </div>
      )}
      <p className="sheet-note">실제 결제는 일어나지 않아요. 나중에 바꿀 수 있어요.</p>
    </Sheet>
  );
}
