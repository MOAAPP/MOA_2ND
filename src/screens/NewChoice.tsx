import { useEffect, useRef, useState } from 'react';
import { addDays, formatKDate, todayKST, type ISODate } from '../../shared/dates';
import { won } from '../../shared/format';
import { BetterPrice } from '../components/BetterPrice';
import { CategoryIcon } from '../components/CategoryIcon';
import { usePhotoReader } from '../components/PhotoReader';
import { TopBar } from '../components/ui';
import { CATEGORIES } from '../lib/categories';
import { ruleClassify } from '../lib/ml/classify';
import { transactWorldWallet, type WorldDecision } from '../lib/worldWallet';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';
import { useWallet } from '../state/wallet';

type Choice = 'buy' | 'wait' | 'alternative';
const CHOICES: { id: Choice; title: string; desc: string }[] = [
  { id: 'buy', title: '샀어요', desc: '지금 결제' },
  { id: 'alternative', title: '더 싸게 샀어요', desc: '대안 · 최저가' },
  { id: 'wait', title: '미뤘어요', desc: '이번엔 안 사기' },
];
const digits = (s: string) => s.replace(/\D/g, '').slice(0, 9);

/** 새로운 선택: 사진·캡처로 상품과 가격을 넣고, 최저가를 찾아본 뒤 선택을 기록 */
export function NewChoice() {
  const nav = useNav();
  const { state, update } = useStore();
  const { summary } = useWallet();
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [alt, setAlt] = useState('');
  const [altNote, setAltNote] = useState('');
  const [choice, setChoice] = useState<Choice>('wait');
  const today = todayKST();
  const [date, setDate] = useState<ISODate>(today);
  const [category, setCategory] = useState<string | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const photo = usePhotoReader(({ amount, name: n }) => {
    if (amount) setPrice(String(amount));
    if (n) setName(n.slice(0, 40));
  });
  const take = (f?: File | null) => {
    if (!f || !f.type.startsWith('image/')) return;
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return URL.createObjectURL(f); });
    void photo.read(f);
  };
  // 캡처 후 Cmd/Ctrl+V 로 붙여넣기
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const f = [...(e.clipboardData?.files ?? [])].find((x) => x.type.startsWith('image/'));
      if (f) { e.preventDefault(); take(f); }
    };
    window.addEventListener('paste', onPaste);
    return () => window.removeEventListener('paste', onPaste);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const p = Number(price) || 0;
  const a = Number(alt) || 0;
  const paid = choice === 'buy' ? p : choice === 'alternative' ? a : 0;
  const guessed = name.trim() ? ruleClassify(name.trim(), state.categoryMemory)?.category ?? '기타' : '기타';
  const cat = category ?? guessed;
  const after = summary.monthlyUsable - paid;
  const valid = name.trim().length > 0 && p > 0 && (choice !== 'alternative' || (a > 0 && a <= p)) && paid <= state.worldWallet.cash;

  const save = () => {
    if (!valid) { setError(choice === 'alternative' && a > p ? '대안 가격은 원래 가격보다 낮아야 해요.' : '상품 이름과 가격을 확인해 주세요.'); return; }
    const title = name.trim();
    const decision: WorldDecision = { id: `choice-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, title, price: p, paid, choice, at: date === today ? Date.now() : Date.parse(`${date}T12:00:00+09:00`), note: choice === 'alternative' && altNote ? altNote : '새로운 선택에서 기록' };
    if (!transactWorldWallet(state.worldWallet, { type: 'spend', decision })) { setError('이번 달 가상 현금이 부족해서 기록하지 못했어요.'); return; }
    update((s) => ({
      ...s,
      worldWallet: transactWorldWallet(s.worldWallet, { type: 'spend', decision }) ?? s.worldWallet,
      spendLog: paid > 0 ? [...s.spendLog, { date, amount: paid, category: cat, name: choice === 'alternative' && altNote ? `${title} (${altNote})` : title, from: 'record' as const }] : s.spendLog,
      categoryMemory: category ? { ...s.categoryMemory, [title.toLowerCase().replace(/\s+/g, '')]: category } : s.categoryMemory,
    }));
    nav.pop();
  };

  return (
    <div className="page nc-page">
      <TopBar title="새로운 선택" onBack={nav.pop} />
      <div className="nc-body">
        <header className="nc-head">
          <h1>사고 싶은 게 생겼나요?</h1>
          <p>상품 캡처나 가격표 사진을 올리면 이름과 가격을 읽고, 더 싸게 파는 곳도 찾아봐요.</p>
        </header>

        <div
          className={`nc-drop${drag ? ' over' : ''}${preview ? ' has' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => fileRef.current?.click()}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileRef.current?.click(); } }}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); take(e.dataTransfer.files?.[0]); }}
        >
          {preview ? (
            <>
              <img src={preview} alt="올린 사진" />
              <span className="nc-drop-again">다른 사진으로 바꾸기</span>
            </>
          ) : (
            <>
              <span className="nc-cam" aria-hidden="true"><i /></span>
              <b>사진·캡처로 추가하기</b>
              <small>쇼핑몰 화면 캡처, 가격표, 영수증 모두 괜찮아요<br />PC에서는 캡처 후 붙여넣기(⌘V)도 돼요</small>
            </>
          )}
          <input ref={fileRef} type="file" accept="image/*" className="sr-only" onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} />
        </div>

        <section className="nc-card">
          <label className="nc-field">
            <span>상품 이름</span>
            <input value={name} onChange={(e) => setName(e.target.value.slice(0, 40))} placeholder="예: 에어팟 프로 2, 나이키 운동화" />
          </label>
          <label className="nc-field">
            <span>가격</span>
            <div className="nc-money"><input value={price ? Number(price).toLocaleString('ko-KR') : ''} onChange={(e) => setPrice(digits(e.target.value))} inputMode="numeric" placeholder="0" /><em>원</em></div>
          </label>
          <div className="nc-field">
            <span>언제였나요?</span>
            <div className="nc-dates" role="group" aria-label="날짜">
              {[0, 1, 2].map((n) => { const d = addDays(today, -n); return <button key={n} className={date === d ? 'on' : ''} aria-pressed={date === d} onClick={() => setDate(d)}>{n === 0 ? '오늘' : n === 1 ? '어제' : '그저께'}</button>; })}
              <label className={`nc-date-pick${date < addDays(today, -2) ? ' on' : ''}`}>
                {date < addDays(today, -2) ? formatKDate(date) : '다른 날'}
                <input type="date" value={date} min={addDays(today, -90)} max={today} onChange={(e) => e.target.value && e.target.value <= today && setDate(e.target.value)} />
              </label>
            </div>
          </div>
          {name.trim() && (
            <div className="nc-cat">
              <span>분류</span>
              <div className="nc-cat-row">
                {[cat, ...CATEGORIES.filter((c) => c !== cat)].map((c) => (
                  <button key={c} className={cat === c ? 'on' : ''} aria-pressed={cat === c} onClick={() => setCategory(c)}>
                    <CategoryIcon category={c} size={22} />{c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </section>

        {name.trim().length >= 2 && p > 0 && (
          <BetterPrice query={name.trim()} price={p} forceSearch onUse={({ price: lp, label }) => { setAlt(String(lp)); setAltNote(label); setChoice('alternative'); }} />
        )}

        <section className="nc-card">
          <h2>어떻게 하기로 했나요?</h2>
          <div className="nc-choices" role="group" aria-label="선택">
            {CHOICES.map((o) => (
              <button key={o.id} className={choice === o.id ? 'on' : ''} aria-pressed={choice === o.id} onClick={() => setChoice(o.id)}>
                <b>{o.title}</b><small>{o.desc}</small>
              </button>
            ))}
          </div>
          {choice === 'alternative' && (
            <label className="nc-field">
              <span>실제로 쓴 금액</span>
              <div className="nc-money"><input value={alt ? Number(alt).toLocaleString('ko-KR') : ''} onChange={(e) => { setAlt(digits(e.target.value)); setAltNote(''); }} inputMode="numeric" placeholder="0" /><em>원</em></div>
              {altNote && <small className="nc-note">{altNote} 가격으로 넣었어요</small>}
            </label>
          )}
          <div className="nc-result">
            <div><span>현금에서 나가는 돈</span><b>{won(paid)}</b></div>
            <div><span>기록 후 이번 달 쓸 수 있는 돈</span><b className={after < 0 ? 'neg' : ''}>{after < 0 ? '−' : ''}{won(Math.abs(after))}</b></div>
            {choice !== 'buy' && p > 0 && <div className="nc-saved"><span>정가로 샀을 때보다 남긴 돈</span><b>+{won(p - paid)}</b></div>}
          </div>
          {after < 0 && <p className="nc-warn">이번 달 지켜두기로 한 생활비에서 {won(-after)}을 쓰게 돼요.</p>}
        </section>

        {error && <p className="nc-error" role="alert">{error}</p>}
        <button className="nc-save" disabled={!name.trim() || p <= 0} onClick={save}>기록하고 평행세계에 반영하기</button>
        <p className="v8-footer-disclaimer">산 금액은 가계부에도 함께 기록돼요. 사진은 금액을 읽는 데만 쓰고 저장하지 않아요.</p>
      </div>
      {photo.sheet}
    </div>
  );
}
