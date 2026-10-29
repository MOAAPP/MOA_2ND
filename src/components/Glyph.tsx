import { useId, type ReactNode } from 'react';

/**
 * 채운 입체 아이콘. 위는 밝고 아래로 진해지는 그라데이션 + 살짝 비치는 하이라이트.
 * 선 아이콘(Icons.tsx)은 버튼·내비 같은 작은 조작용으로만 쓴다.
 */
export type GlyphName =
  | 'chart' | 'target' | 'trend' | 'plane' | 'shield' | 'palette' | 'bag' | 'cup' | 'bowl' | 'shirt' | 'bus' | 'ticket'
  | 'play' | 'home' | 'gift' | 'dots' | 'wallet' | 'coin' | 'briefcase' | 'school' | 'phone' | 'card' | 'laptop' | 'key'
  | 'camera' | 'calendar' | 'receipt' | 'piggy' | 'bell' | 'spark';

export const TONE = {
  blue: ['#7d9cff', '#3554e8'],
  violet: ['#ad97ff', '#6c48ea'],
  teal: ['#6fd8c6', '#0f9a84'],
  orange: ['#ffb07a', '#ec6c1f'],
  pink: ['#ff9dba', '#db3a72'],
  amber: ['#ffd06b', '#dc9010'],
  slate: ['#aab3c6', '#56617a'],
  red: ['#ff969f', '#e44051'],
  brown: ['#ddb08e', '#9a6140'],
  green: ['#86dbab', '#1c9c5c'],
} as const;
export type Tone = keyof typeof TONE;

const SHAPES: Record<GlyphName, ReactNode> = {
  chart: <><rect x="3" y="12" width="4.6" height="9" rx="1.6" /><rect x="9.7" y="7" width="4.6" height="14" rx="1.6" /><rect x="16.4" y="3" width="4.6" height="18" rx="1.6" /></>,
  target: <><path fillRule="evenodd" d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19Zm0 4a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11Z" /><circle cx="12" cy="12" r="2.6" /></>,
  trend: <path d="M3 18.5 9 12l3.6 3.4L19 8.7V12a1.3 1.3 0 0 0 2.6 0V5.6c0-.7-.6-1.3-1.3-1.3H14a1.3 1.3 0 0 0 0 2.6h3.2l-4.6 4.8-3.6-3.4-7.9 8.4a1.3 1.3 0 1 0 1.9 1.8Z" />,
  plane: <path d="M21 4.2c.6.6.4 1.8-.4 2.6l-3.6 3.6 2 8.6c.1.4 0 .8-.3 1.1l-.8.8c-.4.4-1 .3-1.3-.2l-3.6-6.5-3.5 3.5.4 2.6c0 .3-.1.6-.3.8l-.6.6c-.3.3-.9.2-1.1-.2l-1.6-3.2-3.2-1.6c-.4-.2-.5-.8-.2-1.1l.6-.6c.2-.2.5-.3.8-.3l2.6.4 3.5-3.5-6.5-3.6c-.5-.3-.6-.9-.2-1.3l.8-.8c.3-.3.7-.4 1.1-.3l8.6 2 3.6-3.6c.8-.8 2-1 2.6-.4Z" />,
  shield: <path d="M12 2.4 4.5 5.2v6.3c0 4.7 3.2 8.6 7.5 10.1 4.3-1.5 7.5-5.4 7.5-10.1V5.2L12 2.4Z" />,
  palette: <path fillRule="evenodd" d="M12 2.5c5.4 0 9.5 3.7 9.5 8.3 0 2.9-2.3 4.6-4.9 4.6h-1.5c-.9 0-1.4 1-.9 1.7.4.6.6 1.1.6 1.6 0 1.6-1.3 2.8-2.8 2.8-5.3 0-9.5-4.2-9.5-9.5S6.7 2.5 12 2.5ZM7.5 12a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Zm4-3.5a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Zm4.6 1.4a1.6 1.6 0 1 0 0-3.2 1.6 1.6 0 0 0 0 3.2Z" />,
  bag: <path fillRule="evenodd" d="M8 7.5V7a4 4 0 1 1 8 0v.5h2.4c.7 0 1.2.5 1.3 1.2l.9 11a1.7 1.7 0 0 1-1.7 1.8H5.1a1.7 1.7 0 0 1-1.7-1.8l.9-11c.1-.7.6-1.2 1.3-1.2H8Zm2 0h4V7a2 2 0 1 0-4 0v.5Z" />,
  cup: <path fillRule="evenodd" d="M4 8.2c0-.6.5-1.1 1.1-1.1h11.6c.6 0 1.1.5 1.1 1.1v.5h.7a3.3 3.3 0 0 1 0 6.6h-1.1a6.3 6.3 0 0 1-5.6 4.2H9.6A5.6 5.6 0 0 1 4 13.9V8.2Zm13.8 2.7v2.2h.7a1.1 1.1 0 0 0 0-2.2h-.7ZM8 2.8c.6 0 1 .4 1 1v1.6a1 1 0 1 1-2 0V3.8c0-.6.4-1 1-1Zm4 0c.6 0 1 .4 1 1v1.6a1 1 0 1 1-2 0V3.8c0-.6.4-1 1-1Z" />,
  bowl: <><path d="M2.8 11.2c-.1-.6.4-1.2 1-1.2h16.4c.6 0 1.1.6 1 1.2-.6 4.6-4.4 8.3-9.2 8.3s-8.6-3.7-9.2-8.3Z" /><path d="M8.6 3.6c.5.4.6 1 .2 1.5-.6.8-.6 1.1-.1 1.9.4.5.3 1.1-.2 1.5s-1.1.3-1.5-.2c-1-1.3-1-2.6-.1-3.9.4-.5 1.1-.6 1.7-.8Zm4.4 0c.5.4.6 1 .2 1.5-.6.8-.6 1.1-.1 1.9.4.5.3 1.1-.2 1.5s-1.1.3-1.5-.2c-1-1.3-1-2.6-.1-3.9.4-.5 1.1-.6 1.7-.8Z" /></>,
  shirt: <path d="M8.3 3.2c.3-.2.7-.1 1 .1.7.8 1.6 1.2 2.7 1.2s2-.4 2.7-1.2c.3-.2.7-.3 1-.1l4.8 2.4c.5.3.7.9.5 1.4l-1.4 3c-.2.5-.8.7-1.3.5l-.8-.4v9.6c0 .6-.5 1.1-1.1 1.1H7.6c-.6 0-1.1-.5-1.1-1.1V10.1l-.8.4c-.5.2-1.1 0-1.3-.5l-1.4-3c-.2-.5 0-1.1.5-1.4l4.8-2.4Z" />,
  bus: <path fillRule="evenodd" d="M6.5 2.8h11c1.8 0 3.2 1.4 3.2 3.2v10.2c0 1-.6 1.9-1.4 2.4v1.6a1 1 0 0 1-2 0v-1H6.7v1a1 1 0 0 1-2 0v-1.6c-.8-.5-1.4-1.4-1.4-2.4V6c0-1.8 1.4-3.2 3.2-3.2ZM5.4 7v4.4h13.2V7H5.4Zm2.4 9.2a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Zm8.4 0a1.3 1.3 0 1 0 0-2.6 1.3 1.3 0 0 0 0 2.6Z" />,
  ticket: <path fillRule="evenodd" d="M3.5 6.2c0-.8.7-1.5 1.5-1.5h14c.8 0 1.5.7 1.5 1.5v2.4a.6.6 0 0 1-.5.6 2.8 2.8 0 0 0 0 5.6c.3 0 .5.3.5.6v2.4c0 .8-.7 1.5-1.5 1.5H5c-.8 0-1.5-.7-1.5-1.5v-2.4c0-.3.2-.6.5-.6a2.8 2.8 0 0 0 0-5.6.6.6 0 0 1-.5-.6V6.2Zm11 1a.8.8 0 0 0-1.6 0v1a.8.8 0 0 0 1.6 0v-1Zm0 4.3a.8.8 0 0 0-1.6 0v1a.8.8 0 0 0 1.6 0v-1Zm0 4.3a.8.8 0 0 0-1.6 0v1a.8.8 0 0 0 1.6 0v-1Z" />,
  play: <path fillRule="evenodd" d="M5.5 4h13c1.7 0 3 1.3 3 3v8c0 1.7-1.3 3-3 3h-13c-1.7 0-3-1.3-3-3V7c0-1.7 1.3-3 3-3Zm4.5 4.3v5.4c0 .6.7 1 1.2.7l4.3-2.7c.5-.3.5-1 0-1.3l-4.3-2.7c-.5-.4-1.2 0-1.2.6ZM8 19.5h8a1 1 0 0 1 0 2H8a1 1 0 0 1 0-2Z" />,
  home: <path d="M10.9 3.1c.6-.5 1.6-.5 2.2 0l7.4 6.3c.4.3.6.8.6 1.3v8.6c0 1-.8 1.7-1.7 1.7h-4v-5.2c0-.6-.5-1.1-1.1-1.1h-2.6c-.6 0-1.1.5-1.1 1.1V21h-4c-1 0-1.7-.8-1.7-1.7v-8.6c0-.5.2-1 .6-1.3l7.4-6.3Z" />,
  gift: <path fillRule="evenodd" d="M7.3 3.2c1.5-.8 3.4.1 4.7 2.4 1.3-2.3 3.2-3.2 4.7-2.4 1.1.6 1.4 2 .7 3.3h2.1c.8 0 1.5.7 1.5 1.5v2.2c0 .6-.4 1.1-1 1.3V19c0 1.1-.9 2-2 2H6c-1.1 0-2-.9-2-2v-7.5c-.6-.2-1-.7-1-1.3V8c0-.8.7-1.5 1.5-1.5h2.1c-.7-1.3-.4-2.7.7-3.3Zm2.9 3.3c-.8-1.4-1.8-1.9-2.2-1.6-.3.2-.2.9.6 1.6h1.6Zm3.6 0h1.6c.8-.7.9-1.4.6-1.6-.4-.3-1.4.2-2.2 1.6ZM11 8.5v12.5h2V8.5h-2Z" />,
  dots: <><circle cx="5.5" cy="12" r="2.4" /><circle cx="12" cy="12" r="2.4" /><circle cx="18.5" cy="12" r="2.4" /></>,
  wallet: <path fillRule="evenodd" d="M4.8 4.5h12.4c.6 0 1 .4 1 1v1.3H5.3a.8.8 0 0 0 0 1.6h14.2c1 0 1.8.8 1.8 1.8v9c0 1-.8 1.8-1.8 1.8H4.8c-1.2 0-2.3-1-2.3-2.3V6.8c0-1.3 1-2.3 2.3-2.3Zm12 10.7a1.4 1.4 0 1 0 0-2.8 1.4 1.4 0 0 0 0 2.8Z" />,
  coin: <path fillRule="evenodd" d="M12 2.5a9.5 9.5 0 1 1 0 19 9.5 9.5 0 0 1 0-19ZM8.7 8a.9.9 0 0 0-.9 1.1l1.4 6.3c.2.9 1.5 1 1.8.1l1-2.9 1 2.9c.3.9 1.6.8 1.8-.1l1.4-6.3a.9.9 0 0 0-1.8-.4l-.6 2.9-1-2.8a.9.9 0 0 0-1.7 0l-1 2.8-.6-2.9A.9.9 0 0 0 8.7 8Z" />,
  briefcase: <path fillRule="evenodd" d="M9 6V5c0-1.1.9-2 2-2h2c1.1 0 2 .9 2 2v1h3.5c1.4 0 2.5 1.1 2.5 2.5V12H3V8.5C3 7.1 4.1 6 5.5 6H9Zm2 0h2V5h-2v1ZM3 13.6h7.5v.9c0 .6.4 1 1 1h1c.6 0 1-.4 1-1v-.9H21v4.9c0 1.4-1.1 2.5-2.5 2.5h-13C4.1 21 3 19.9 3 18.5v-4.9Z" />,
  school: <><path d="M11.4 3.2c.4-.2.8-.2 1.2 0l9 4.7c.7.4.7 1.4 0 1.8l-9 4.7c-.4.2-.8.2-1.2 0l-9-4.7c-.7-.4-.7-1.4 0-1.8l9-4.7Z" /><path d="M6 13.3v3.5c0 .4.2.7.5.9 3.3 2.3 7.7 2.3 11 0 .3-.2.5-.5.5-.9v-3.5l-4.5 2.4c-.9.5-2.1.5-3 0L6 13.3Z" /></>,
  phone: <path fillRule="evenodd" d="M8.5 2h7c1.4 0 2.5 1.1 2.5 2.5v15c0 1.4-1.1 2.5-2.5 2.5h-7A2.5 2.5 0 0 1 6 19.5v-15C6 3.1 7.1 2 8.5 2Zm2 16.5a1 1 0 0 0 0 2h3a1 1 0 0 0 0-2h-3Z" />,
  card: <path fillRule="evenodd" d="M5 5h14c1.7 0 3 1.3 3 3v.8H2V8c0-1.7 1.3-3 3-3ZM2 10.8h20V16c0 1.7-1.3 3-3 3H5a3 3 0 0 1-3-3v-5.2Zm4 3.7a1 1 0 0 0 0 2h4a1 1 0 0 0 0-2H6Z" />,
  laptop: <><rect x="4" y="4.5" width="16" height="11" rx="2" /><path d="M2 17.5h20a1 1 0 0 1-1 1.8H3a1 1 0 0 1-1-1.8Z" /></>,
  key: <path fillRule="evenodd" d="M15.5 2.5a6 6 0 1 1-2.6 11.4l-1.6 1.6H9.5v1.8H7.7v1.8L6 20.8a1 1 0 0 1-.7.3H3.5a1 1 0 0 1-1-1v-1.8c0-.3.1-.5.3-.7l6.8-6.8A6 6 0 0 1 15.5 2.5Zm1.3 3.2a1.6 1.6 0 1 0 0 3.2 1.6 1.6 0 0 0 0-3.2Z" />,
  camera: <path fillRule="evenodd" d="M8.6 4.3c.3-.5.8-.8 1.4-.8h4c.6 0 1.1.3 1.4.8l1 1.7h2.6c1.7 0 3 1.3 3 3v8.5c0 1.7-1.3 3-3 3H5a3 3 0 0 1-3-3V9c0-1.7 1.3-3 3-3h2.6l1-1.7ZM12 17.5a4.3 4.3 0 1 0 0-8.6 4.3 4.3 0 0 0 0 8.6Zm0-2.2a2.1 2.1 0 1 1 0-4.2 2.1 2.1 0 0 1 0 4.2Z" />,
  calendar: <path fillRule="evenodd" d="M8 2.5c.6 0 1 .4 1 1V4h6v-.5a1 1 0 1 1 2 0V4h1c1.7 0 3 1.3 3 3v1.5H3V7c0-1.7 1.3-3 3-3h1v-.5c0-.6.4-1 1-1ZM3 10.5h18V18c0 1.7-1.3 3-3 3H6a3 3 0 0 1-3-3v-7.5Zm4.5 2.5a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Zm4.5 0a1.2 1.2 0 1 0 0 2.4 1.2 1.2 0 0 0 0-2.4Z" />,
  receipt: <path fillRule="evenodd" d="M6 2.5h12c.6 0 1 .4 1 1v17.3c0 .7-.8 1.2-1.4.8L15 20l-2.4 1.6a1 1 0 0 1-1.2 0L9 20l-2.6 1.6c-.6.4-1.4-.1-1.4-.8V3.5c0-.6.4-1 1-1Zm3 5a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2H9Zm0 4a1 1 0 0 0 0 2h6a1 1 0 0 0 0-2H9Z" />,
  piggy: <path fillRule="evenodd" d="M10.5 4.5c2.3 0 4.4.8 5.8 2.1l2.5-1.1c.5-.2 1 .2.9.7l-.5 2.6c.6.8 1 1.6 1.2 2.6h.6c.6 0 1 .4 1 1v2.2c0 .6-.4 1-1 1h-1.2a7 7 0 0 1-2.3 2.6v1.8c0 .6-.4 1-1 1h-1.8c-.5 0-.9-.4-1-.9l-.1-.6c-.4 0-.7.1-1.1.1h-2l-.1.5c-.1.5-.5.9-1 .9H6.6c-.6 0-1-.4-1-1v-2.2A6.5 6.5 0 0 1 3 12.4c0-4.4 3.4-7.9 7.5-7.9Zm5 6.3a1.1 1.1 0 1 0 0 2.2 1.1 1.1 0 0 0 0-2.2ZM9 6.8a1 1 0 0 0 0 2h3a1 1 0 0 0 0-2H9Z" />,
  bell: <path d="M12 2.5c3.6 0 6.5 2.9 6.5 6.5v3.9l1.6 2.6c.5.8-.1 1.8-1 1.8H4.9c-.9 0-1.5-1-1-1.8l1.6-2.6V9c0-3.6 2.9-6.5 6.5-6.5Zm-2.8 16.6h5.6a2.9 2.9 0 0 1-5.6 0Z" />,
  spark: <path d="M12 2.5c.4 0 .8.3.9.7l1.4 4.4c.2.6.7 1.1 1.3 1.3l4.4 1.4c.9.3.9 1.5 0 1.8l-4.4 1.4c-.6.2-1.1.7-1.3 1.3l-1.4 4.4c-.3.9-1.5.9-1.8 0l-1.4-4.4c-.2-.6-.7-1.1-1.3-1.3l-4.4-1.4c-.9-.3-.9-1.5 0-1.8l4.4-1.4c.6-.2 1.1-.7 1.3-1.3l1.4-4.4c.1-.4.5-.7.9-.7Z" />,
};

export function Glyph({ name, tone = 'blue', size = 24 }: { name: GlyphName; tone?: Tone; size?: number }) {
  const id = useId().replace(/:/g, '');
  const [a, b] = TONE[tone];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <defs>
        <linearGradient id={`g${id}`} x1="0.15" y1="0" x2="0.85" y2="1">
          <stop offset="0" stopColor={a} />
          <stop offset="1" stopColor={b} />
        </linearGradient>
        <linearGradient id={`h${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="0.55" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`c${id}`}>{SHAPES[name]}</clipPath>
      </defs>
      <g fill={`url(#g${id})`}>{SHAPES[name]}</g>
      <rect x="0" y="0" width="24" height="12" fill={`url(#h${id})`} clipPath={`url(#c${id})`} />
    </svg>
  );
}

/** 연한 색 타일 위의 입체 아이콘 */
export function IconTile({ name, tone = 'blue', size = 44, radius }: { name: GlyphName; tone?: Tone; size?: number; radius?: number }) {
  const [a, b] = TONE[tone];
  return (
    <span
      className="icon-tile"
      style={{ width: size, height: size, borderRadius: radius ?? Math.round(size * 0.32), background: `linear-gradient(145deg, ${a}2e, ${b}1f)` }}
      aria-hidden
    >
      <Glyph name={name} tone={tone} size={Math.round(size * 0.56)} />
    </span>
  );
}

/** 평행통장 로고: 나란히 선 두 개의 둥근 기둥 (두 세계) */
export function Logo({ size = 72 }: { size?: number }) {
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size * 0.82} viewBox="0 0 88 72" aria-hidden>
      <defs>
        <linearGradient id={`la${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#b9d0ff" />
          <stop offset="1" stopColor="#6e8dff" />
        </linearGradient>
        <linearGradient id={`lb${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#8aa6ff" />
          <stop offset="1" stopColor="#4a5ff0" />
        </linearGradient>
      </defs>
      <rect x="4" y="10" width="40" height="58" rx="20" fill={`url(#la${id})`} />
      <rect x="40" y="4" width="44" height="64" rx="22" fill={`url(#lb${id})`} opacity="0.94" />
      <ellipse cx="56" cy="16" rx="11" ry="5" fill="#fff" opacity="0.28" />
    </svg>
  );
}
