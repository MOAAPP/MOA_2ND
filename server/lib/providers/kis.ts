import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { addDays, todayKST, type ISODate } from '../../../shared/dates';
import type { Candle } from '../../../shared/market';
import { ApiError, fetchWithTimeout } from '../http';
import { DATA_DIR } from '../store';

/**
 * 한국투자증권 KIS Open API
 * - REST: 토큰(/oauth2/tokenP), 주식 현재가(FHKST01010100), 지수 현재가(FHPUP02100000), 일봉(FHKST03010100)
 * - WebSocket: 실시간 체결가(H0STCNT0)
 * 환경변수: KIS_APP_KEY, KIS_APP_SECRET, KIS_ENV=real|mock
 */
export function kisConfigured(): boolean {
  return !!process.env.KIS_APP_KEY && !!process.env.KIS_APP_SECRET;
}

function base() {
  return process.env.KIS_ENV === 'mock' ? 'https://openapivts.koreainvestment.com:29443' : 'https://openapi.koreainvestment.com:9443';
}

export function kisWsUrl() {
  return process.env.KIS_ENV === 'mock' ? 'ws://ops.koreainvestment.com:31000' : 'ws://ops.koreainvestment.com:21000';
}

/* ── 토큰: 발급 횟수 제한이 있어 파일로 캐시하고 만료 전까지 재사용 ── */
interface TokenCache {
  token: string;
  expiresAt: number;
}
let tokenCache: TokenCache | null = null;
let tokenPromise: Promise<string> | null = null;
const TOKEN_FILE = () => join(DATA_DIR, 'kis-token.json');

async function accessToken(): Promise<string> {
  if (tokenCache && tokenCache.expiresAt - Date.now() > 10 * 60_000) return tokenCache.token;
  if (!tokenCache && existsSync(TOKEN_FILE())) {
    try {
      const t = JSON.parse(readFileSync(TOKEN_FILE(), 'utf8')) as TokenCache & { env?: string };
      if (t.env === (process.env.KIS_ENV ?? 'real') && t.expiresAt - Date.now() > 10 * 60_000) {
        tokenCache = t;
        return t.token;
      }
    } catch {
      /* 무시 */
    }
  }
  if (tokenPromise) return tokenPromise;
  tokenPromise = (async () => {
    const res = await fetchWithTimeout(`${base()}/oauth2/tokenP`, {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ grant_type: 'client_credentials', appkey: process.env.KIS_APP_KEY, appsecret: process.env.KIS_APP_SECRET }),
    }, 10000);
    const text = await res.text();
    let j: { access_token?: string; expires_in?: number; error_description?: string } = {};
    try {
      j = JSON.parse(text);
    } catch {
      /* 무시 */
    }
    if (!res.ok || !j.access_token) throw new ApiError(502, 'kis_token', `KIS 토큰 발급 실패${j.error_description ? `: ${j.error_description}` : ` (${res.status})`}`, true);
    tokenCache = { token: j.access_token, expiresAt: Date.now() + (j.expires_in ?? 86400) * 1000 };
    try {
      mkdirSync(DATA_DIR, { recursive: true });
      writeFileSync(TOKEN_FILE(), JSON.stringify({ ...tokenCache, env: process.env.KIS_ENV ?? 'real' }), { mode: 0o600 });
    } catch {
      /* 무시 */
    }
    return tokenCache.token;
  })().finally(() => {
    tokenPromise = null;
  });
  return tokenPromise;
}

async function kisGet<T>(path: string, trId: string, params: Record<string, string>): Promise<T> {
  const token = await accessToken();
  const qs = new URLSearchParams(params).toString();
  let res;
  try {
    res = await fetchWithTimeout(`${base()}${path}?${qs}`, {
      headers: {
        'content-type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: process.env.KIS_APP_KEY!,
        appsecret: process.env.KIS_APP_SECRET!,
        tr_id: trId,
        custtype: 'P',
      },
    }, 6000);
  } catch {
    throw new ApiError(502, 'kis_unreachable', 'KIS 시세 서버에 연결하지 못했어요.', true);
  }
  const text = await res.text();
  let j: { rt_cd?: string; msg1?: string; msg_cd?: string } & T;
  try {
    j = JSON.parse(text);
  } catch {
    throw new ApiError(502, 'kis_bad_format', `KIS 응답 형식 오류(${res.status})`, true);
  }
  if (!res.ok || j.rt_cd !== '0') {
    if (j.msg_cd === 'EGW00123' || j.msg_cd === 'EGW00121') tokenCache = null; // 토큰 만료·무효
    throw new ApiError(502, 'kis_failed', `KIS 시세 오류: ${j.msg1 ?? res.status}`, true);
  }
  return j;
}

const n = (v: unknown): number | null => {
  if (v === undefined || v === null || v === '') return null;
  const x = Number(String(v).replace(/,/g, ''));
  return Number.isFinite(x) ? x : null;
};

/** 전일 대비 부호 코드: 1 상한, 2 상승, 3 보합, 4 하한, 5 하락 */
export function signed(value: number | null, signCode: string | undefined): number | null {
  if (value === null) return null;
  const neg = signCode === '4' || signCode === '5';
  return (neg ? -1 : 1) * Math.abs(value);
}

export interface KisPrice {
  price: number;
  change: number | null;
  changePct: number | null;
  prevClose: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
}

export function parseKisPrice(o: Record<string, string>): KisPrice {
  const price = n(o.stck_prpr);
  if (price === null) throw new ApiError(502, 'kis_empty', 'KIS 시세에 가격이 없어요.', true);
  return {
    price,
    change: signed(n(o.prdy_vrss), o.prdy_vrss_sign),
    changePct: signed(n(o.prdy_ctrt), o.prdy_vrss_sign),
    prevClose: n(o.stck_sdpr),
    open: n(o.stck_oprc),
    high: n(o.stck_hgpr),
    low: n(o.stck_lwpr),
    volume: n(o.acml_vol),
  };
}

export async function kisPrice(code: string): Promise<KisPrice> {
  const j = await kisGet<{ output: Record<string, string> }>('/uapi/domestic-stock/v1/quotations/inquire-price', 'FHKST01010100', { FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code });
  return parseKisPrice(j.output);
}

export async function kisIndex(id: 'KOSPI' | 'KOSDAQ'): Promise<{ value: number; change: number | null; changePct: number | null; advancers: number | null; decliners: number | null }> {
  const j = await kisGet<{ output: Record<string, string> }>('/uapi/domestic-stock/v1/quotations/inquire-index-price', 'FHPUP02100000', { FID_COND_MRKT_DIV_CODE: 'U', FID_INPUT_ISCD: id === 'KOSPI' ? '0001' : '1001' });
  const o = j.output;
  const value = n(o.bstp_nmix_prpr);
  if (value === null) throw new ApiError(502, 'kis_empty', 'KIS 지수 값이 없어요.', true);
  return {
    value,
    change: signed(n(o.bstp_nmix_prdy_vrss), o.prdy_vrss_sign),
    changePct: signed(n(o.bstp_nmix_prdy_ctrt), o.prdy_vrss_sign),
    advancers: n(o.ascn_issu_cnt),
    decliners: n(o.down_issu_cnt),
  };
}

const ymd = (d: ISODate) => d.replace(/-/g, '');

export async function kisDaily(code: string, days = 100): Promise<Candle[]> {
  const end = todayKST();
  const start = addDays(end, -Math.round(days * 1.5));
  const j = await kisGet<{ output2: Record<string, string>[] }>('/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice', 'FHKST03010100', {
    FID_COND_MRKT_DIV_CODE: 'J', FID_INPUT_ISCD: code, FID_INPUT_DATE_1: ymd(start), FID_INPUT_DATE_2: ymd(end), FID_PERIOD_DIV_CODE: 'D', FID_ORG_ADJ_PRC: '0',
  });
  return (j.output2 ?? [])
    .filter((r) => r.stck_bsop_date && n(r.stck_clpr))
    .map((r) => ({
      date: `${r.stck_bsop_date.slice(0, 4)}-${r.stck_bsop_date.slice(4, 6)}-${r.stck_bsop_date.slice(6, 8)}`,
      open: n(r.stck_oprc)!, high: n(r.stck_hgpr)!, low: n(r.stck_lwpr)!, close: n(r.stck_clpr)!, volume: n(r.acml_vol),
    }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
}

/** 웹소켓 접속키 */
export async function kisApprovalKey(): Promise<string> {
  const res = await fetchWithTimeout(`${base()}/oauth2/Approval`, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ grant_type: 'client_credentials', appkey: process.env.KIS_APP_KEY, secretkey: process.env.KIS_APP_SECRET }),
  }, 10000);
  const j = (await res.json().catch(() => ({}))) as { approval_key?: string };
  if (!j.approval_key) throw new ApiError(502, 'kis_ws_key', 'KIS 실시간 접속키 발급 실패', true);
  return j.approval_key;
}

export interface KisTick {
  code: string;
  price: number;
  change: number | null;
  changePct: number | null;
  open: number | null;
  high: number | null;
  low: number | null;
  volume: number | null;
  timeMs: number;
}

/** H0STCNT0 본문 한 틱: ^ 구분 필드 (0 종목코드, 1 체결시각 HHMMSS, 2 현재가, 3 부호, 4 전일대비, 5 등락률, 7 시가, 8 고가, 9 저가, 13 누적거래량) */
export function parseKisTick(fields: string[], today = todayKST()): KisTick | null {
  const price = n(fields[2]);
  if (!fields[0] || price === null) return null;
  const hh = fields[1] ?? '000000';
  const [y, m, d] = today.split('-').map(Number);
  const timeMs = Date.UTC(y, m - 1, d, Number(hh.slice(0, 2)) - 9, Number(hh.slice(2, 4)), Number(hh.slice(4, 6)));
  return {
    code: fields[0],
    price,
    change: signed(n(fields[4]), fields[3]),
    changePct: signed(n(fields[5]), fields[3]),
    open: n(fields[7]),
    high: n(fields[8]),
    low: n(fields[9]),
    volume: n(fields[13]),
    timeMs,
  };
}

/** 'flag|tr_id|count|body' 프레임 → 틱 목록 (한 메시지에 여러 틱이 올 수 있음) */
export function parseKisFrame(raw: string, fieldsPerTick = 46): KisTick[] {
  const parts = raw.split('|');
  if (parts.length < 4 || parts[0] !== '0' || parts[1] !== 'H0STCNT0') return [];
  const count = Number(parts[2]) || 1;
  const all = parts.slice(3).join('|').split('^');
  const per = count > 1 ? Math.floor(all.length / count) : all.length;
  const out: KisTick[] = [];
  for (let i = 0; i < count; i++) {
    const t = parseKisTick(all.slice(i * (per || fieldsPerTick), (i + 1) * (per || fieldsPerTick)));
    if (t) out.push(t);
  }
  return out;
}
