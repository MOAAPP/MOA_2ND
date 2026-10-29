import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;
const base = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.9, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };

export const IconWallet = (p: P) => (
  <svg {...base} {...p}><rect x="3" y="6" width="18" height="13" rx="3" /><path d="M3 10h18" /><circle cx="16.5" cy="14.5" r="1.2" fill="currentColor" stroke="none" /></svg>
);
export const IconFork = (p: P) => (
  <svg {...base} {...p}><path d="M6 3v6a6 6 0 0 0 6 6h0a6 6 0 0 1 6 6" /><path d="M6 9a6 6 0 0 0 0 0" /><path d="M18 3v6a6 6 0 0 1-3 5.2" strokeDasharray="2.5 2.5" /><circle cx="6" cy="3" r="1" fill="currentColor" /><circle cx="18" cy="3" r="1" fill="currentColor" /></svg>
);
export const IconFlag = (p: P) => (
  <svg {...base} {...p}><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" /></svg>
);
export const IconBook = (p: P) => (
  <svg {...base} {...p}><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2V5Z" /><path d="M4 19a2 2 0 0 1 2-2h13" /><path d="M9 7h6" /></svg>
);
export const IconGear = (p: P) => (
  <svg {...base} {...p}><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></svg>
);
export const IconBack = (p: P) => (<svg {...base} {...p}><path d="M15 5l-7 7 7 7" /></svg>);
export const IconClose = (p: P) => (<svg {...base} {...p}><path d="M6 6l12 12M18 6 6 18" /></svg>);
export const IconPlus = (p: P) => (<svg {...base} {...p}><path d="M12 5v14M5 12h14" /></svg>);
export const IconChevron = (p: P) => (<svg {...base} {...p}><path d="M9 6l6 6-6 6" /></svg>);
export const IconAlert = (p: P) => (<svg {...base} {...p}><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>);
export const IconInfo = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="9" /><path d="M12 11v5M12 8h.01" /></svg>);
export const IconCheck = (p: P) => (<svg {...base} {...p}><path d="M5 12.5 10 17l9-10" /></svg>);
export const IconSearch = (p: P) => (<svg {...base} {...p}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>);
export const IconStar = ({ filled, ...p }: P & { filled?: boolean }) => (
  <svg {...base} {...p}><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3Z" fill={filled ? 'currentColor' : 'none'} /></svg>
);
export const IconSend = (p: P) => (<svg {...base} {...p}><path d="M21 3 10 14" /><path d="m21 3-7 18-4-7-7-4 18-7Z" /></svg>);
export const IconRefresh = (p: P) => (<svg {...base} {...p}><path d="M20 11a8 8 0 0 0-14.8-4M4 13a8 8 0 0 0 14.8 4" /><path d="M5 3v4h4M19 21v-4h-4" /></svg>);
export const IconCalendar = (p: P) => (<svg {...base} {...p}><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M3 10h18M8 3v4M16 3v4" /></svg>);
export const IconTrash = (p: P) => (<svg {...base} {...p}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>);
export const IconEdit = (p: P) => (<svg {...base} {...p}><path d="M4 20h4L19 9l-4-4L4 16v4Z" /></svg>);
export const IconImage = (p: P) => (<svg {...base} {...p}><rect x="3" y="4" width="18" height="16" rx="3" /><circle cx="9" cy="10" r="2" /><path d="m21 16-5-5-9 9" /></svg>);
export const IconFlame = (p: P) => (<svg {...base} {...p}><path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.6 2.4-4.8.3 1.8 1.1 2.8 2.1 3.3C11 9 11.2 5.8 12 3Z" fill="currentColor" stroke="none" /></svg>);
export const IconLock = (p: P) => (<svg {...base} {...p}><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>);
export const IconBolt = (p: P) => (<svg {...base} {...p}><path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z" fill="currentColor" stroke="none" /></svg>);
export const IconPlay = (p: P) => (<svg {...base} {...p}><path d="M8 5v14l11-7L8 5Z" fill="currentColor" stroke="none" /></svg>);

/* ── 입력·카테고리용 선 아이콘 ── */
export const IconCamera = (p: P) => (<svg {...base} {...p}><path d="M4 8h3l1.6-2.4A1.5 1.5 0 0 1 9.8 5h4.4a1.5 1.5 0 0 1 1.2.6L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z" /><circle cx="12" cy="13" r="3.4" /></svg>);
export const IconReceipt = (p: P) => (<svg {...base} {...p}><path d="M6 3h12v18l-3-1.6L12 21l-3-1.6L6 21V3Z" /><path d="M9 8h6M9 12h6M9 16h3" /></svg>);
export const IconTag = (p: P) => (<svg {...base} {...p}><path d="M3.5 12.6V4.5a1 1 0 0 1 1-1h8.1a1 1 0 0 1 .7.3l7.4 7.4a1 1 0 0 1 0 1.4l-8.1 8.1a1 1 0 0 1-1.4 0l-7.4-7.4a1 1 0 0 1-.3-.7Z" /><circle cx="8.3" cy="8.3" r="1.4" /></svg>);
export const IconBowl = (p: P) => (<svg {...base} {...p}><path d="M3.5 11h17a8.5 8.5 0 0 1-17 0Z" /><path d="M9 7c0-1.2 1-1.6 1-2.8M13 7c0-1.2 1-1.6 1-2.8" /></svg>);
export const IconCup = (p: P) => (<svg {...base} {...p}><path d="M5 9h11v6a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4V9Z" /><path d="M16 11h1.5a2.5 2.5 0 0 1 0 5H16" /><path d="M8 3.5v2.5M12 3.5v2.5" /></svg>);
export const IconBag = (p: P) => (<svg {...base} {...p}><path d="M5 8h14l-1 12H6L5 8Z" /><path d="M9 10V7a3 3 0 0 1 6 0v3" /></svg>);
export const IconShirt = (p: P) => (<svg {...base} {...p}><path d="M8.5 3.5 4 6l1.8 4L8 9v11.5h8V9l2.2 1L20 6l-4.5-2.5a3.5 3.5 0 0 1-7 0Z" /></svg>);
export const IconBus = (p: P) => (<svg {...base} {...p}><rect x="5" y="3.5" width="14" height="14" rx="3" /><path d="M5 11h14M8 17.5V20M16 17.5V20" /><circle cx="8.5" cy="14.3" r=".9" fill="currentColor" stroke="none" /><circle cx="15.5" cy="14.3" r=".9" fill="currentColor" stroke="none" /></svg>);
export const IconTicket = (p: P) => (<svg {...base} {...p}><path d="M3.5 8a2 2 0 0 0 0 4v4.5h17V12a2 2 0 0 1 0-4V5.5h-17V8Z" transform="translate(0 1)" /><path d="M14 7v10" strokeDasharray="1.6 2.2" /></svg>);
export const IconPlayBox = (p: P) => (<svg {...base} {...p}><rect x="3" y="5" width="18" height="13" rx="3" /><path d="m10.5 9 4 2.5-4 2.5V9Z" fill="currentColor" stroke="none" /><path d="M8 21h8" /></svg>);
export const IconHome = (p: P) => (<svg {...base} {...p}><path d="M4 11 12 4l8 7v9H4v-9Z" /><path d="M10 20v-5h4v5" /></svg>);
export const IconGift = (p: P) => (<svg {...base} {...p}><rect x="4" y="9" width="16" height="11" rx="1.5" /><path d="M3 9h18M12 9v11" /><path d="M12 9c-1.5-3.5-5-3.7-5-1.5S10 9 12 9Zm0 0c1.5-3.5 5-3.7 5-1.5S14 9 12 9Z" /></svg>);
export const IconDots = (p: P) => (<svg {...base} {...p}><circle cx="6" cy="12" r="1.3" fill="currentColor" /><circle cx="12" cy="12" r="1.3" fill="currentColor" /><circle cx="18" cy="12" r="1.3" fill="currentColor" /></svg>);
export const IconCoin = (p: P) => (<svg {...base} {...p}><circle cx="12" cy="12" r="8.5" /><path d="M9 9.5 10.5 15l1.5-4 1.5 4L15 9.5M8.5 12h7" /></svg>);
export const IconBriefcase = (p: P) => (<svg {...base} {...p}><rect x="3" y="7" width="18" height="12" rx="2" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12h18" /></svg>);
export const IconSchool = (p: P) => (<svg {...base} {...p}><path d="m2.5 9 9.5-5 9.5 5-9.5 5-9.5-5Z" /><path d="M6.5 11v5c3 2.4 8 2.4 11 0v-5" /></svg>);
export const IconPhone = (p: P) => (<svg {...base} {...p}><rect x="6.5" y="2.5" width="11" height="19" rx="2.5" /><path d="M11 18.5h2" /></svg>);
export const IconCard = (p: P) => (<svg {...base} {...p}><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="M3 10h18M7 15h4" /></svg>);
export const IconShield = (p: P) => (<svg {...base} {...p}><path d="M12 3.5 5 6v5.5c0 4.3 3 7.6 7 9 4-1.4 7-4.7 7-9V6l-7-2.5Z" /></svg>);
export const IconPlane = (p: P) => (<svg {...base} {...p}><path d="m3 13.5 7-1.5 4-7.5a1.4 1.4 0 0 1 2.5 1.2L14.5 12l5.5 1.5a1.5 1.5 0 0 1 0 2.9L14.5 18l-2 4-1.5-.4.5-4.5-6-1.6L3 13.5Z" /></svg>);
export const IconLaptop = (p: P) => (<svg {...base} {...p}><rect x="4.5" y="5" width="15" height="10" rx="1.5" /><path d="M2.5 19h19" /></svg>);
export const IconKey = (p: P) => (<svg {...base} {...p}><circle cx="8" cy="15" r="4" /><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2" /></svg>);

/** 심플한 금융 차트 아이콘: 모의투자 하단 메뉴에 사용 */
export const IconChartBars = (p: P) => (
  <svg {...base} {...p}><path d="M4 20V12M9.5 20V8M15 20V14M20 20V4" /><path d="M2 21.5h20" /></svg>
);

/** 예·적금 탭: 동전이 쌓이는 저금통 */
export const IconPiggy = (p: P) => (
  <svg {...base} {...p}><path d="M5 11.5a6.5 5.5 0 0 1 11.8-3.2L19.5 8l-.8 3a5 5 0 0 1 .3 1.5c0 2-1.2 3.7-3 4.6V20h-2.5v-2h-3v2H8v-3.1A5.4 5.4 0 0 1 5 11.5Z" /><circle cx="15" cy="11" r=".9" fill="currentColor" stroke="none" /><path d="M10 6.5h3" /></svg>
);
