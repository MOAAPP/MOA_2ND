import { useState, type ReactNode } from 'react';
import { IconTile, Logo } from '../components/Glyph';
import { IconCheck, IconChevron } from '../components/Icons';

/* 소개 화면. 실제 앱 카드 모양을 그대로 보여주는 4장 */

function Spark({ up }: { up: boolean }) {
  const pts = up ? [30, 27, 22, 18, 11, 5] : [6, 10, 15, 19, 24, 30];
  const color = up ? '#3f63f0' : '#ef5b6b';
  const d = pts.map((y, i) => `${i ? 'L' : 'M'}${6 + i * 22},${y}`).join('');
  return (
    <svg viewBox="0 0 122 36" width="100%" aria-hidden style={{ display: 'block', marginTop: 8 }}>
      <path d={`${d}L116,36L6,36Z`} fill={color} opacity="0.1" />
      <path d={d} fill="none" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      {pts.map((y, i) => (i % 2 === 0 || i === pts.length - 1 ? <circle key={i} cx={6 + i * 22} cy={y} r="2.6" fill={color} /> : null))}
    </svg>
  );
}

function CompareMock() {
  return (
    <div style={{ textAlign: 'left' }}>
      <div className="mock-card mock-item">
        <IconTile name="cup" tone="brown" size={42} />
        <div>
          <div className="t">카페 라떼</div>
          <div className="v num">4,500원</div>
        </div>
        <IconChevron className="chev" width={18} height={18} />
      </div>
      <div className="mock-row">
        <div className="vs-cell">
          <div className="vs-k">매일 사면</div>
          <div className="vs-sub">오늘은 기분이 좋아요</div>
          <div className="vs-label">한 달 뒤</div>
          <div className="vs-v num">−135,000원</div>
          <div className="vs-label">1년 뒤</div>
          <div className="vs-v num">−1,642,500원</div>
          <Spark up={false} />
        </div>
        <div className="vs-cell para">
          <div className="vs-k">참으면</div>
          <div className="vs-sub">작지만 분명한 차이</div>
          <div className="vs-label">한 달 뒤</div>
          <div className="vs-v num">+135,000원</div>
          <div className="vs-label">1년 뒤</div>
          <div className="vs-v num">+1,642,500원</div>
          <Spark up />
        </div>
      </div>
      <div className="insight" style={{ background: '#fff', boxShadow: '0 6px 18px rgba(48,72,140,0.07)' }}>
        <IconTile name="chart" tone="blue" size={38} />
        <span>하루 한 잔을 참으면<br />1년 뒤 약 <b>164만 원</b>이 남아요.</span>
      </div>
    </div>
  );
}

function Features({ agreed, onAgree }: { agreed: boolean; onAgree: (v: boolean) => void }) {
  const items: [Parameters<typeof IconTile>[0]['name'], Parameters<typeof IconTile>[0]['tone'], string, string][] = [
    ['chart', 'violet', '돈 없이 평행세계 체험', '가상의 생활비 80만 원으로 먼저 선택해 볼 수 있어요.'],
    ['target', 'blue', '다른 선택이 만든 월말', '지금 소비와 대안 선택의 결과를 비교해요.'],
    ['school', 'teal', '금융 지식도 실습으로', '지켜둘 돈을 계산하고 퀴즈로 확인해요.'],
  ];
  return (
    <div>
      <div className="feature-list">
        {items.map(([g, t, title, desc]) => (
          <div key={title} className="feature">
            <IconTile name={g} tone={t} size={48} />
            <div>
              <b>{title}</b>
              <span>{desc}</span>
            </div>
          </div>
        ))}
      </div>
      <label className="consent">
        <input type="checkbox" checked={agreed} onChange={(e) => onAgree(e.target.checked)} />
        <span className="box"><IconCheck /></span>
        <span>입력한 금액과 기록은 이 기기에만 저장돼요. 은행 계좌와 연결하지 않아요.</span>
      </label>
    </div>
  );
}


function PastMock() {
  return <div className="intro-past-preview" aria-label="과거 선택 회고 예시">
    <div className="intro-past-kicker">지난 선택 · 예시</div>
    <div className="intro-past-product"><span className="intro-past-emoji" aria-hidden="true">🎧</span><span><b>무선 이어폰</b><small>3일 전 · 159,000원</small></span></div>
    <div className="intro-past-choices"><div><small>실제로 한 선택</small><b>사지 않았어요</b><strong>지출 0원</strong></div><div><small>다르게 했다면</small><b>구매했어요</b><strong>지출 159,000원</strong></div></div>
    <div className="intro-past-conclusion"><span>오늘까지 남는 돈 차이</span><b>−159,000원</b></div>
    <p>실제 잔고가 아닌 가상의 지출 비교예요.</p>
  </div>;
}

export function Intro({ onDone, onDemo }: { onDone: () => void; onDemo: () => void }) {
  const [i, setI] = useState(0);
  const [agreed, setAgreed] = useState(true);
  const slides: { head: ReactNode; visual: ReactNode }[] = [
    {
      head: (
        <div className="logo-hero">
          <Logo size={84} />
          <div className="name">평행통장</div>
          <p>내 돈의 흐름을 알고, 다른 선택까지 미리 비교해요</p>
        </div>
      ),
      visual: <div className="v7-onboarding-overview"><div className="v7-onb-top"><span>이번 달 · 가상 예시</span><span>80만 원 생활비</span></div><div className="v7-onb-title">이번 달 쓸 수 있는 돈</div><strong className="v7-onb-main">120,000원</strong><div className="v7-onb-split"><div><small>지금 구매한다면</small><b>−9,000원</b><span>월세·비상금 부족</span></div><div><small>다른 방법을 선택하면</small><b>61,000원</b><span>안전선 유지</span></div></div><p>같은 생활비라도 선택에 따라 월말이 달라져요.</p></div>,
    },
    {
      head: (
        <>
          <h1>소비 전에,<br />다른 미래를 미리 비교해요</h1>
          <p>지금 사거나 미루거나 다른 방법을 선택할 때,<br />월세를 내고 남는 돈이 어떻게 달라질까요?</p>
        </>
      ),
      visual: <CompareMock />,
    },
    {
      head: (
        <>
          <h1>그때 다른 선택을 했다면,<br />오늘은 어땠을까요?</h1>
          <p>지난 소비도 돌아보세요.<br />실제로 한 선택과 다른 선택의 지출 차이를 보여줘요.</p>
        </>
      ),
      visual: <PastMock />,
    },
    {
      head: (
        <>
          <h1>돈이 없어도,<br />먼저 연습할 수 있어요</h1>
          <p>가상 생활비에서 저축하거나 주식을 사면 쓸 돈이 줄어요.<br/>저축·주식 자산은 남아 있는 것도 직접 확인해요.</p>
        </>
      ),
      visual: <div className="pb6-intro-practice"><div className="pb6-intro-kicker">MONEY LAB · 가상 체험</div><h3>월세를 낸 뒤에도<br/>투자할 돈이 있을까?</h3><div className="pb6-intro-line"><span>가상 생활비</span><b>800,000원</b></div><div className="pb6-intro-line"><span>필수지출 + 지켜둘 돈</span><b>−680,000원</b></div><div className="pb6-intro-line focus"><span>연습에 쓸 수 있는 돈</span><b>120,000원</b></div><span className="pb6-intro-foot">기초 개념 · 중간 퀴즈 · 모의투자까지</span></div>,
    },
    {
      head: (
        <>
          <h1>먼저 다른 세계를<br/>경험해 볼까요?</h1>
          <p>진짜 돈이나 계좌 없이 바로 시작하거나,<br/>내 생활비로 비교해 볼 수 있어요.</p>
        </>
      ),
      visual: <Features agreed={agreed} onAgree={setAgreed} />,
    },
  ];
  const s = slides[i];
  const last = i === slides.length - 1;

  return (
    <div className="intro" aria-roledescription="소개" aria-label={`${slides.length}장 중 ${i + 1}번째`}>
      <div className="intro-body" key={i}>
        <div className="intro-head">{s.head}</div>
        <div className="intro-visual">{s.visual}</div>
      </div>
      <div className="dots" aria-hidden>
        {slides.map((_, k) => (
          <span key={k} className={k === i ? 'on' : ''} />
        ))}
      </div>
      <div className="intro-actions">
        {!last ? <>
          {i > 0 && <button className="btn text" onClick={() => setI(slides.length - 1)}>건너뛰기</button>}
          <button className="btn primary" onClick={() => setI(i + 1)}>다음 <span aria-hidden>→</span></button>
        </> : <>
          <button className="btn soft" disabled={!agreed} onClick={onDone}>내 생활비로 시작</button>
          <button className="btn primary" onClick={onDemo}>0원으로 체험하기 →</button>
        </>}
      
      </div>
    </div>
  );
}
