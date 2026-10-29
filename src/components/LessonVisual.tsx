import type { VisualKey } from '../../shared/curriculum';

/** 레슨 개념 카드의 절제된 설명용 그림 */
export function LessonVisual({ k }: { k: VisualKey }) {
  const box = (children: React.ReactNode, label: string) => (
    <svg viewBox="0 0 320 150" width="100%" style={{ maxWidth: 360, display: 'block', margin: '0 auto' }} role="img" aria-label={label}>
      <rect x="0" y="0" width="320" height="150" rx="16" fill="#f7f8fa" />
      {children}
    </svg>
  );
  const t = (x: number, y: number, s: string, o: { size?: number; fill?: string; anchor?: 'start' | 'middle' | 'end'; weight?: number } = {}) => (
    <text x={x} y={y} fontSize={o.size ?? 12} fill={o.fill ?? '#4e5968'} textAnchor={o.anchor ?? 'middle'} fontWeight={o.weight ?? 600}>{s}</text>
  );
  switch (k) {
    case 'slices':
      return box(
        <>
          {Array.from({ length: 12 }, (_, i) => {
            const a0 = (i / 12) * Math.PI * 2, a1 = ((i + 1) / 12) * Math.PI * 2;
            const p = (a: number) => `${100 + 50 * Math.cos(a)},${75 + 50 * Math.sin(a)}`;
            return <path key={i} d={`M100,75 L${p(a0)} A50,50 0 0 1 ${p(a1)} Z`} fill={i === 0 ? '#2563eb' : '#dbe3ee'} stroke="#fff" strokeWidth={2} />;
          })}
          {t(230, 62, '회사 전체', { fill: '#151a22', size: 14 })}
          {t(230, 88, '파란 조각 = 내 주식 1주', { fill: '#2563eb' })}
        </>,
        '회사를 여러 조각으로 나눈 원 그림',
      );
    case 'supplyDemand':
      return box(
        <>
          {t(80, 30, '사려는 사람', { fill: '#d9363e' })}
          {t(240, 30, '팔려는 사람', { fill: '#2563eb' })}
          {[0, 1, 2, 3].map((i) => <circle key={i} cx={50 + i * 20} cy={60} r={8} fill="#f3c2c4" />)}
          {[0, 1].map((i) => <circle key={i} cx={230 + i * 20} cy={60} r={8} fill="#c7d6f7" />)}
          <path d="M140 100 L180 100" stroke="#151a22" strokeWidth={2} markerEnd="url(#arr)" />
          <defs><marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="#151a22" /></marker></defs>
          {t(160, 128, '사려는 사람이 많으면 → 가격 ▲', { fill: '#151a22' })}
        </>,
        '사려는 사람과 팔려는 사람 비교',
      );
    case 'quoteBoard':
      return box(
        <>
          {t(24, 40, '삼성전자', { anchor: 'start', fill: '#151a22', size: 14 })}
          {t(24, 78, '51,000원', { anchor: 'start', fill: '#151a22', size: 26, weight: 800 })}
          {t(24, 106, '▲ +1,000원 (+2.00%)', { anchor: 'start', fill: '#d9363e', size: 13 })}
          {t(24, 130, '기준: 전 거래일 종가 50,000원', { anchor: 'start', size: 11, fill: '#8b95a1' })}
          {t(250, 78, '현재가', { size: 11 })}
          {t(250, 106, '전일 대비·등락률', { size: 11 })}
        </>,
        '시세표 예시',
      );
    case 'clock':
      return box(
        <>
          <rect x="30" y="60" width="260" height="22" rx="11" fill="#e5e8ec" />
          <rect x="80" y="60" width="170" height="22" rx="11" fill="#2563eb" />
          {t(80, 104, '09:00')}
          {t(250, 104, '15:30')}
          {t(165, 50, '정규장 (평일)', { fill: '#2563eb' })}
          {t(165, 130, '주말·공휴일·연말 마지막 날은 휴장', { size: 11, fill: '#8b95a1' })}
        </>,
        '장 운영 시간 막대',
      );
    case 'orderTypes':
      return box(
        <>
          <rect x="20" y="24" width="130" height="102" rx="12" fill="#fff" stroke="#e5e8ec" />
          <rect x="170" y="24" width="130" height="102" rx="12" fill="#fff" stroke="#e5e8ec" />
          {t(85, 50, '시장가', { fill: '#151a22', size: 15 })}
          {t(85, 78, '지금 가격에 바로', { size: 11 })}
          {t(85, 100, '빠름 · 가격 못 정함', { size: 11, fill: '#8b95a1' })}
          {t(235, 50, '지정가', { fill: '#151a22', size: 15 })}
          {t(235, 78, '정한 가격에서만', { size: 11 })}
          {t(235, 100, '가격 지킴 · 체결 보장 X', { size: 11, fill: '#8b95a1' })}
        </>,
        '시장가와 지정가 비교',
      );
    case 'avgPrice':
      return box(
        <>
          <rect x="40" y="40" width="40" height="70" fill="#c7d6f7" />
          <rect x="85" y="40" width="40" height="70" fill="#c7d6f7" />
          <rect x="130" y="19" width="40" height="91" fill="#f3c2c4" />
          <line x1="30" x2="180" y1="33" y2="33" stroke="#151a22" strokeDasharray="5 4" />
          {t(105, 130, '10,000원 ×2 + 13,000원 ×1', { size: 11 })}
          {t(250, 60, '평균단가', { size: 12 })}
          {t(250, 88, '11,000원', { size: 20, fill: '#151a22', weight: 800 })}
        </>,
        '평균단가 막대 그림',
      );
    case 'pnl':
      return box(
        <>
          {t(80, 46, '평가손익', { fill: '#151a22', size: 15 })}
          {t(80, 74, '팔기 전 · 계속 바뀜', { size: 11 })}
          <path d="M30 110 Q60 90 80 104 T130 96" fill="none" stroke="#8b95a1" strokeWidth={2} strokeDasharray="5 4" />
          {t(240, 46, '실현손익', { fill: '#151a22', size: 15 })}
          {t(240, 74, '판 순간 확정', { size: 11 })}
          <path d="M190 104 L290 104" stroke="#2563eb" strokeWidth={3} />
          <circle cx="240" cy="104" r="6" fill="#2563eb" />
        </>,
        '평가손익과 실현손익',
      );
    case 'basket':
      return box(
        <>
          <path d="M90 70 L230 70 L210 125 L110 125 Z" fill="#eaf1fe" stroke="#2563eb" strokeWidth={2} />
          {['A', 'B', 'C', 'D', 'E'].map((s, i) => (
            <g key={s}><circle cx={115 + i * 22} cy={58} r={13} fill="#fff" stroke="#c7d6f7" strokeWidth={2} />{t(115 + i * 22, 62, s, { size: 11 })}</g>
          ))}
          {t(160, 104, 'ETF 1주', { fill: '#2563eb', size: 14 })}
          {t(160, 24, '여러 회사를 한 바구니에', { size: 12 })}
        </>,
        'ETF 바구니 그림',
      );
    case 'range':
      return box(
        <>
          <line x1="160" x2="160" y1="24" y2="126" stroke="#151a22" strokeWidth={2} />
          <rect x="146" y="50" width="28" height="48" fill="#f3c2c4" stroke="#d9363e" />
          {t(200, 30, '고가', { anchor: 'start' })}
          {t(200, 128, '저가', { anchor: 'start' })}
          {t(90, 80, '하루 변동폭', { fill: '#151a22' })}
          {t(90, 98, '= 고가 − 저가', { size: 11 })}
        </>,
        '하루 고가와 저가',
      );
    case 'factOpinion':
      return box(
        <>
          <rect x="20" y="28" width="130" height="94" rx="12" fill="#e8f6ef" />
          <rect x="170" y="28" width="130" height="94" rx="12" fill="#fff6e8" />
          {t(85, 54, '사실', { fill: '#0f8a5f', size: 15 })}
          {t(85, 82, '코스피 −1.2%', { size: 11 })}
          {t(85, 100, '영업이익 증가 발표', { size: 11 })}
          {t(235, 54, '해석', { fill: '#b45309', size: 15 })}
          {t(235, 82, '"그래서 올랐다"', { size: 11 })}
          {t(235, 100, '가능성일 뿐', { size: 11 })}
        </>,
        '사실과 해석 구분',
      );
    case 'recovery':
      return box(
        <>
          {[
            ['−10%', '+11%', 22],
            ['−30%', '+43%', 64],
            ['−50%', '+100%', 120],
          ].map(([a, b, w], i) => (
            <g key={i}>
              {t(40, 46 + i * 34, a as string, { anchor: 'start', fill: '#2563eb' })}
              <rect x="90" y={36 + i * 34} width={w as number} height="14" rx="7" fill="#f3c2c4" />
              {t(100 + (w as number), 47 + i * 34, `회복에 ${b}`, { anchor: 'start', fill: '#d9363e', size: 11 })}
            </g>
          ))}
        </>,
        '손실과 회복에 필요한 상승률',
      );
    case 'safetyFirst':
      return box(
        <>
          {[
            ['① 필수지출', '#151a22'],
            ['② 지켜둘 금액·비상금', '#151a22'],
            ['③ 남는 돈으로 투자', '#2563eb'],
          ].map(([s, c], i) => (
            <g key={i}>
              <rect x={40 + i * 12} y={26 + i * 36} width={240 - i * 24} height="28" rx="10" fill={i === 2 ? '#eaf1fe' : '#fff'} stroke="#e5e8ec" />
              {t(160, 45 + i * 36, s, { fill: c })}
            </g>
          ))}
        </>,
        '돈을 쓰는 순서',
      );
  }
}
