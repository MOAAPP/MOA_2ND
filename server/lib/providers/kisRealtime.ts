import { kisApprovalKey, kisConfigured, kisWsUrl, parseKisFrame, type KisTick } from './kis';

/**
 * KIS 웹소켓 실시간 체결가 구독 관리.
 * - 화면에서 보고 있는 종목만 구독(최대 MAX_SUBS), 끊기면 지수 백오프로 재접속
 * - PINGPONG 프레임은 그대로 돌려보내야 연결이 유지된다
 * - 틱은 메모리에 저장하고, 시세 조회 시 1분 이내 틱이 있으면 '실시간'으로 사용
 */
const MAX_SUBS = 20;
const ticks = new Map<string, KisTick & { receivedAt: number }>();
const wanted = new Map<string, number>(); // code → 마지막 요청 시각
const subscribed = new Set<string>();
let ws: WebSocket | null = null;
let approvalKey: string | null = null;
let connecting = false;
let retry = 0;
let lastError: string | null = null;
let connectedAt: number | null = null;

export function realtimeStatus() {
  return { enabled: kisConfigured(), connected: !!ws && ws.readyState === 1, connectedAt, subscribed: [...subscribed], lastError };
}

export function latestTick(code: string, maxAgeMs = 60_000): (KisTick & { receivedAt: number }) | null {
  const t = ticks.get(code);
  return t && Date.now() - t.receivedAt <= maxAgeMs ? t : null;
}

function send(code: string, register: boolean) {
  if (!ws || ws.readyState !== 1 || !approvalKey) return;
  ws.send(JSON.stringify({ header: { approval_key: approvalKey, custtype: 'P', tr_type: register ? '1' : '2', 'content-type': 'utf-8' }, body: { input: { tr_id: 'H0STCNT0', tr_key: code } } }));
  if (register) subscribed.add(code);
  else subscribed.delete(code);
}

function sync() {
  const now = Date.now();
  // 2분 넘게 요청 없는 종목은 해제
  for (const [code, at] of wanted) if (now - at > 120_000) wanted.delete(code);
  const want = [...wanted.entries()].sort((a, b) => b[1] - a[1]).slice(0, MAX_SUBS).map(([c]) => c);
  for (const c of subscribed) if (!want.includes(c)) send(c, false);
  for (const c of want) if (!subscribed.has(c)) send(c, true);
}

async function connect() {
  if (connecting || (ws && ws.readyState <= 1) || typeof WebSocket === 'undefined') return;
  connecting = true;
  try {
    approvalKey = await kisApprovalKey();
    const sock = new WebSocket(kisWsUrl());
    ws = sock;
    sock.onopen = () => {
      retry = 0;
      connectedAt = Date.now();
      lastError = null;
      subscribed.clear();
      sync();
    };
    sock.onmessage = (ev) => {
      const raw = typeof ev.data === 'string' ? ev.data : '';
      if (!raw) return;
      if (raw.startsWith('{')) {
        try {
          const j = JSON.parse(raw) as { header?: { tr_id?: string } };
          if (j.header?.tr_id === 'PINGPONG') sock.send(raw);
        } catch {
          /* 무시 */
        }
        return;
      }
      for (const t of parseKisFrame(raw)) ticks.set(t.code, { ...t, receivedAt: Date.now() });
    };
    sock.onerror = () => {
      lastError = 'KIS 실시간 연결 오류';
    };
    sock.onclose = () => {
      ws = null;
      subscribed.clear();
      connectedAt = null;
      if (wanted.size) {
        const wait = Math.min(60_000, 2000 * 2 ** retry++);
        setTimeout(() => void connect(), wait);
      }
    };
  } catch (e) {
    lastError = (e as Error).message;
    setTimeout(() => void connect(), Math.min(60_000, 5000 * 2 ** retry++));
  } finally {
    connecting = false;
  }
}

/** 화면에서 보고 있는 종목을 알려주면 구독을 유지한다 */
export function wantRealtime(codes: string[]) {
  if (!kisConfigured() || process.env.KIS_REALTIME === 'off') return;
  const now = Date.now();
  for (const c of codes) wanted.set(c, now);
  if (!ws) void connect();
  else sync();
}
