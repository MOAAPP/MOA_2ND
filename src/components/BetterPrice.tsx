import { useEffect, useRef, useState } from 'react';
import { won } from '../../shared/format';
import { ruleClassify } from '../lib/ml/classify';
import { findLowestPrice, type PriceResult } from '../lib/ocr';

/** 카테고리별로 돈을 덜 쓰는 현실적인 방법 (가격을 단정하지 않는 일반 팁) */
const TIPS: Record<string, string[]> = {
  패션: ['시즌이 지난 상품이나 아울렛은 정가보다 싸게 파는 경우가 많아요.', '중고 거래에서 새 상품에 가까운 물건을 찾아보세요.', '장바구니에 담아두고 쿠폰·할인 알림을 기다려 보세요.'],
  쇼핑: ['같은 모델을 가격 비교 사이트에서 먼저 찾아보세요.', '리퍼·전시 상품은 성능은 같고 값은 더 낮아요.', '학생 인증 할인(교육 할인)이 있는지 확인해 보세요.'],
  카페: ['텀블러를 가져가면 할인해 주는 매장이 많아요.', '앱 쿠폰·스탬프를 모으면 한 잔은 공짜가 돼요.', '저가 커피로 바꾸면 한 잔에 2~3천 원을 아껴요.'],
  식비: ['배달 대신 포장하면 배달비만큼 아껴요.', '친구와 같이 주문하면 배달비를 나눌 수 있어요.', '학식이나 마감 할인 도시락도 좋은 대안이에요.'],
  '문화·여가': ['영화는 조조 시간이나 통신사·카드 할인을 확인해 보세요.', '공연은 학생 할인이나 취소표를 노려 보세요.', '같이 가는 사람과 묶음 할인을 찾아보세요.'],
  교통: ['늦은 밤엔 택시 전에 심야버스 노선을 확인해 보세요.', '대중교통 환급 카드를 쓰면 일부를 돌려받을 수 있어요.'],
  구독: ['한 달 동안 안 쓴 구독은 이번 달에 해지해 보세요.', '여럿이 함께 쓰는 요금제가 있는지 확인해 보세요.'],
  생활: ['묶음 상품은 개당 가격으로 비교해 보세요.', '균일가 매장에서 비슷한 물건을 먼저 찾아보세요.'],
  경조사: ['친구들과 함께 모아 선물하면 부담은 줄고 선물은 커져요.'],
  기타: ['하루만 장바구니에 두고 다시 생각해 보세요.', '같은 물건을 중고로 먼저 찾아보세요.'],
};
/** 가격 검색이 의미 있는 물건 종류 */
const SEARCHABLE = new Set(['쇼핑', '패션', '생활', '기타']);

function extraLinks(q: string) {
  const e = encodeURIComponent(q);
  return [{ label: '번개장터 중고', url: `https://m.bunjang.co.kr/search/products?q=${e}&order=price_asc` }];
}

export function BetterPrice({ query, price, forceSearch = false, onUse }: { query: string; price: number; forceSearch?: boolean; onUse: (p: { price: number; label: string }) => void }) {
  const q = query.trim();
  const category = ruleClassify(q)?.category ?? '기타';
  const searchable = q.length >= 2 && (forceSearch || SEARCHABLE.has(category));
  const [res, setRes] = useState<PriceResult | null>(null);
  const [loading, setLoading] = useState(false);
  const last = useRef('');

  useEffect(() => {
    if (!searchable) { setRes(null); return; }
    const t = window.setTimeout(async () => {
      last.current = q;
      setLoading(true);
      const r = await findLowestPrice(q);
      if (last.current === q) { setRes(r); setLoading(false); }
    }, 700);
    return () => window.clearTimeout(t);
  }, [q, searchable]);

  const tips = TIPS[category] ?? TIPS['기타'];
  const cheaper = (res?.items ?? []).filter((i) => i.price < price).slice(0, 3);
  const lowest = cheaper[0];
  const links = res ? [...res.links, ...extraLinks(q)] : searchable ? [] : [];

  return (
    <section className="better-price" aria-live="polite">
      <div className="bp-head">
        <span className="bp-kicker">더 싸게, 덜 쓰는 방법</span>
        <h3>{lowest ? <>같은 물건, <em>{won(price - lowest.price)}</em> 싸게 파는 곳이 있어요</> : searchable ? (res && !res.configured ? `‘${q}’ 낮은 가격순으로 비교해 보세요` : `‘${q}’ 더 싸게 살 수 있는지 찾아봤어요`) : `‘${q}’에 돈을 덜 쓰는 방법`}</h3>
      </div>

      {searchable && loading && <p className="bp-muted">최저가를 찾는 중이에요…</p>}

      {searchable && !loading && res && (
        cheaper.length ? (
          <>
            <ul className="bp-list">
              {cheaper.map((it) => (
                <li key={it.link}>
                  <a href={it.link} target="_blank" rel="noreferrer">
                    {it.image ? <img src={it.image} alt="" loading="lazy" /> : <span className="bp-thumb" aria-hidden="true">₩</span>}
                    <span className="bp-item"><b>{it.title}</b><small>{it.mall} · 지금 가격보다 {won(price - it.price)} 저렴</small></span>
                    <strong>{won(it.price)}</strong>
                  </a>
                </li>
              ))}
            </ul>
            <button className="bp-use" onClick={() => onUse({ price: lowest.price, label: `${lowest.mall} 최저가` })}>최저가 {won(lowest.price)}로 ‘다른 방법’ 비교하기</button>
            <p className="bp-muted">검색 결과는 상품명이 비슷한 것도 섞여 있어요. 모델명·옵션이 같은지 눌러서 확인해 주세요.</p>
          </>
        ) : (
          <p className="bp-muted">{res.configured ? '지금 가격보다 싼 곳을 찾지 못했어요. 이미 괜찮은 가격일 수 있어요.' : '아래 쇼핑몰에서 낮은 가격순으로 바로 확인해 볼 수 있어요.'}</p>
        )
      )}

      {links.length > 0 && (
        <div className="bp-links">
          {links.map((l) => <a key={l.url} href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>)}
        </div>
      )}

      <ul className="bp-tips">
        {tips.map((t) => <li key={t}>{t}</li>)}
      </ul>
    </section>
  );
}
