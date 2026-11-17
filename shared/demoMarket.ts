// 가상 거래소 종목과 가상 시세.
// 실제 시세 API 대신, 시간에 따라 조금씩 움직이는 가상 가격을 만들어요(같은 시각이면 어느 화면에서 봐도 같은 값).
// 시세 API가 붙으면 livePrice만 API 값으로 바꾸면 돼요.
export const STOCKS = [
  { code: 'SP500', name: 'TIGER 미국S&P500', price: 62100, prevClose: 61000, phase: 0.3 },
  { code: 'QQQ', name: 'ACE 미국나스닥100', price: 34500, prevClose: 33690, phase: 1.7 },
  { code: 'SPACE', name: 'MOA 평행 우주·AI', price: 13800, prevClose: 13120, phase: 2.9 },
  { code: 'DIVIDEND', name: 'SOL 한국고배당', price: 27600, prevClose: 27770, phase: 4.1 },
];
export const stockByName = (name: string) => STOCKS.find((s) => s.name === name);

/** 호가 단위 — 국내 ETF 기준 5원 */
export const TICK = 5;
const roundTick = (v: number) => Math.round(v / TICK) * TICK;

/** 가상 현재가: 기준가에서 ±1.5% 안팎으로 몇 분 주기로 오르내림 */
export function livePrice(name: string, t = Date.now()) {
  const s = stockByName(name);
  if (!s) return 0;
  const m = t / 60000;
  const wave = 0.011 * Math.sin((2 * Math.PI * m) / 7 + s.phase) + 0.005 * Math.sin((2 * Math.PI * m) / 1.3 + s.phase * 2);
  return roundTick(s.price * (1 + wave));
}
export const changeRate = (name: string, t = Date.now()) => {
  const s = stockByName(name);
  return s ? livePrice(name, t) / s.prevClose - 1 : 0;
};
