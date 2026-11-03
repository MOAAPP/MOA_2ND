import { useState } from 'react';

/**
 * 카드뉴스의 핵심 정보부터 보여주고, 네 장을 순서대로 읽는 모바일 뷰어.
 * 이미지는 기존 API의 공개 job.images를 그대로 사용한다.
 * AI가 숫자나 시장 사실을 새로 생성하는 로직은 여기 두지 않는다.
 */
export function CardNewsReader({
  images,
  titles,
  headline,
  summary,
}: {
  images: string[];
  titles: string[];
  headline: string | null;
  summary: string;
}) {
  const [selected, setSelected] = useState(0);
  const current = Math.min(selected, Math.max(0, images.length - 1));
  if (!images.length) return null;
  const count = images.length;
  const caption = titles[current]?.trim() || `${current + 1}번째 카드`;

  return (
    <section className="cn-reader" aria-label="카드뉴스 읽기">
      <div className="cn-reader-intro">
        <span className="cn-overline">이번 카드의 핵심</span>
        <h2>{headline || '오늘 알아둘 내용을 모았어요'}</h2>
        {summary.trim() && <p>{summary}</p>}
      </div>

      <div className="cn-reader-count" aria-live="polite">
        <span>{caption}</span>
        <span className="cn-reader-fraction">{current + 1} / {count}</span>
      </div>
      <div className="cn-reader-image-frame">
        <img src={images[current]} alt={`카드뉴스 ${current + 1}장: ${caption}`} loading={current === 0 ? 'eager' : 'lazy'} />
      </div>

      <div className="cn-reader-steps" role="group" aria-label="카드 선택">
        {images.map((_, index) => (
          <button
            key={`${index}-${images[index]}`}
            type="button"
            aria-current={current === index ? 'step' : undefined}
            aria-label={`${index + 1}번째 카드 보기: ${titles[index] || '카드뉴스'}`}
            onClick={() => setSelected(index)}
          >
            <span>{index + 1}</span>
          </button>
        ))}
      </div>
      <div className="cn-reader-actions">
        <button type="button" className="cn-reader-prev" disabled={current === 0} onClick={() => setSelected(current - 1)}>이전</button>
        <button type="button" className="cn-reader-next" disabled={current === count - 1} onClick={() => setSelected(current + 1)}>
          {current === count - 1 ? '마지막 장이에요' : '다음 카드 보기'}
        </button>
      </div>
      <a className="cn-reader-original" href={images[current]} target="_blank" rel="noopener noreferrer">
        현재 카드 크게 보기
      </a>
      <p className="cn-reader-note">가상 거래와 시장 정보를 구분해 보여줘요. 실제 매수·매도 권유가 아니에요.</p>
    </section>
  );
}
