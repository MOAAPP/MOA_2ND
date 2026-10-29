import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';

process.env.VITEST = 'true';
process.env.QUOTE_PROVIDER = 'demo';
process.env.DATA_DIR = mkdtempSync(join(tmpdir(), 'pb-'));
process.env.PEXELS_API_KEY = 'test-key-invalid';
process.env.DISCORD_WEBHOOK_URL = 'https://discord.com/api/webhooks/123/test-token';

const realFetch = globalThis.fetch;
let discordCalls: { url: string; form: FormData }[] = [];
let discordResponse: () => Response = () => new Response(null, { status: 204 });

vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
  const url = String(input);
  if (url.startsWith('https://discord.com/')) {
    discordCalls.push({ url, form: init?.body as FormData });
    return discordResponse();
  }
  if (url.startsWith('https://news.google.com/')) return new Response('<rss></rss>', { status: 200 });
  if (url.startsWith('https://api.pexels.com/')) return new Response('{"error":"unauthorized"}', { status: 401 });
  return realFetch(input, init);
});

const { app } = await import('../server/index');
const { parseNewsRss } = await import('../server/lib/news');

let server: Server;
let base = '';
const DEVICE = '0f8b4c2e-1111-4222-8333-944455556666';
const H = { 'content-type': 'application/json', 'x-device-id': DEVICE };

beforeAll(async () => {
  server = app.listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server.close());

async function waitFor(id: string, pred: (j: { status: string }) => boolean) {
  for (let i = 0; i < 100; i++) {
    const r = await realFetch(`${base}/api/cardnews/${id}`, { headers: H });
    const j = (await r.json()).job;
    if (pred(j)) return j;
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('timeout');
}

describe('API 오류는 항상 JSON', () => {
  it('잘못된 메서드 → 405 JSON (Method not allowed 텍스트 아님)', async () => {
    const r = await realFetch(`${base}/api/discord/test`, { method: 'GET' });
    expect(r.status).toBe(405);
    expect(r.headers.get('content-type')).toContain('application/json');
    expect((await r.json()).error.code).toBe('method_not_allowed');
  });
  it('없는 주소 → 404 JSON', async () => {
    const r = await realFetch(`${base}/api/nope`);
    expect(r.status).toBe(404);
    expect((await r.json()).error.code).toBe('not_found');
  });
  it('깨진 JSON 본문 → 400 JSON', async () => {
    const r = await realFetch(`${base}/api/cardnews`, { method: 'POST', headers: H, body: '{bad' });
    expect(r.status).toBe(400);
    expect((await r.json()).error.code).toBe('invalid_json');
  });
  it('Discord 상태에는 Webhook 비밀값이 없다', async () => {
    const r = await realFetch(`${base}/api/discord/status`);
    const text = await r.text();
    expect(text).not.toContain('test-token');
    expect(JSON.parse(text).configured).toBe(true);
  });
});

describe('카드뉴스 생성·전송', () => {
  let tradePrice = 0;
  beforeAll(async () => {
    const q = await (await realFetch(`${base}/api/quotes/005930`)).json();
    tradePrice = q.quote.price;
    expect(q.quote.source).toBe('demo');
  });

  const body = (tradeId: string, autoSend = true) => ({
    trade: { tradeId, code: '005930', side: 'buy', qty: 3, price: tradePrice, filledAt: Date.now() - 1000, priceSource: 'demo' },
    level: 2,
    autoSend,
  });

  it('사진 검색이 실패하면 생성 단계 실패로 남고, 몰래 고정 배경으로 대체하지 않는다', async () => {
    const r = await realFetch(`${base}/api/cardnews`, { method: 'POST', headers: H, body: JSON.stringify(body('trade-a')) });
    expect(r.status).toBe(201);
    const { job } = await r.json();
    const j = await waitFor(job.id, (x) => x.status === 'failed');
    expect(j).toMatchObject({ stage: 'photo', retryable: true });
    expect(j.images).toHaveLength(0);
    expect(discordCalls).toHaveLength(0);
  });

  it('같은 거래 ID로 다시 요청하면 새 작업을 만들지 않는다', async () => {
    const r = await realFetch(`${base}/api/cardnews`, { method: 'POST', headers: H, body: JSON.stringify(body('trade-a')) });
    expect(r.status).toBe(200);
    expect((await r.json()).created).toBe(false);
  });

  it('사용자가 "사진 없이 만들기"를 고르면 PNG 4장 생성 후 자동 전송은 한 번만', async () => {
    const list = await (await realFetch(`${base}/api/cardnews`, { headers: H })).json();
    const id = list.jobs[0].id;
    discordCalls = [];
    await realFetch(`${base}/api/cardnews/${id}/regenerate`, { method: 'POST', headers: H, body: JSON.stringify({ noPhoto: true }) });
    const j = await waitFor(id, (x) => x.status === 'sent' || (x.status === 'failed' && (x as { stage?: string }).stage !== 'photo'));
    expect(j.status).toBe('sent');
    expect(j.images).toHaveLength(4);
    expect(j.noPhoto).toBe(true);
    expect(discordCalls).toHaveLength(1);
    expect(discordCalls[0].url).toContain('?wait=true');
    const files = [0, 1, 2, 3].map((i) => discordCalls[0].form.get(`files[${i}]`));
    expect(files.every((f) => f instanceof Blob && f.type === 'image/png')).toBe(true);
    const payload = JSON.parse(String(discordCalls[0].form.get('payload_json')));
    expect(payload.content).toContain('모의투자');
    // 이미지 URL은 토큰이 있어야 열린다
    const img = await realFetch(`${base}${j.images[0]}`);
    expect(img.headers.get('content-type')).toBe('image/png');
    const noTok = await realFetch(`${base}/api/cardnews/${id}/images/1.png`);
    expect(noTok.status).toBe(404);
    // 다시 생성해도 자동 전송은 재실행되지 않음
    await realFetch(`${base}/api/cardnews/${id}/regenerate`, { method: 'POST', headers: H, body: JSON.stringify({ noPhoto: true }) });
    await waitFor(id, (x) => x.status === 'generated');
    expect(discordCalls).toHaveLength(1);
  });

  it('자동 전송이 실패하면 전송 단계 실패로 남고, 거래와 별개로 다시 시도할 수 있다', async () => {
    const r0 = await realFetch(`${base}/api/cardnews`, { method: 'POST', headers: H, body: JSON.stringify(body('trade-c')) });
    const id = (await r0.json()).job.id;
    discordResponse = () => new Response(JSON.stringify({ message: 'oops' }), { status: 500, headers: { 'content-type': 'application/json' } });
    await waitFor(id, (x) => x.status === 'failed');
    await realFetch(`${base}/api/cardnews/${id}/regenerate`, { method: 'POST', headers: H, body: JSON.stringify({ noPhoto: true }) });
    let j = await waitFor(id, (x) => x.status === 'failed' && (x as { stage?: string }).stage === 'send');
    expect(j).toMatchObject({ status: 'failed', stage: 'send', retryable: true });
    discordResponse = () => new Response(null, { status: 204 }); // 본문 없는 성공
    const r = await realFetch(`${base}/api/cardnews/${id}/retry-send`, { method: 'POST', headers: H });
    j = (await r.json()).job;
    expect(j.status).toBe('sent');
    // 이미 보낸 카드는 다시 보내기 요청을 거절(중복 전송 방지)
    const again = await realFetch(`${base}/api/cardnews/${id}/retry-send`, { method: 'POST', headers: H });
    expect(again.status).toBe(409);
  });

  it('다른 기기는 남의 카드뉴스를 볼 수 없다', async () => {
    const list = await (await realFetch(`${base}/api/cardnews`, { headers: { ...H, 'x-device-id': 'aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee' } })).json();
    expect(list.jobs).toHaveLength(0);
  });

  it('최근 시세 범위를 벗어난 체결가는 거절', async () => {
    const b = body('trade-b');
    b.trade.price = tradePrice * 5;
    const r = await realFetch(`${base}/api/cardnews`, { method: 'POST', headers: H, body: JSON.stringify(b) });
    expect(r.status).toBe(400);
  });
});

describe('데일리 카드뉴스', () => {
  it('구독 저장 → 정해진 시각 실행 시 PNG 4장을 Discord로 한 번 보내고, 같은 날 다시 보내지 않는다', async () => {
    const q = await (await realFetch(`${base}/api/quotes/005930`)).json();
    const put = await realFetch(`${base}/api/daily/subscription`, {
      method: 'PUT', headers: H,
      body: JSON.stringify({ enabled: true, time: '00:00', nickname: '지현', includePhotos: false, level: 2, nextLessonId: 'u2l1', streak: 3, holdings: [{ code: '005930', qty: 10, avgPrice: q.quote.price }, { code: '000660', qty: 2, avgPrice: 200000 }], watchlist: ['069500'] }),
    });
    expect(put.status).toBe(200);
    const { store } = await import('../server/lib/store');
    const { runDaily, isDue } = await import('../server/lib/daily');
    const sub = Object.values(store.get().subscriptions)[0];
    expect(isDue(sub)).toBe(true);
    discordCalls = [];
    discordResponse = () => new Response(null, { status: 204 });
    const job = await runDaily(sub);
    expect(job.status).toBe('sent');
    expect(job.images).toHaveLength(4);
    expect(discordCalls).toHaveLength(1);
    const payload = JSON.parse(String(discordCalls[0].form.get('payload_json')));
    expect(payload.content).toContain('평행통장 데일리');
    expect(payload.content).toContain('3일 연속');
    expect(payload.attachments).toHaveLength(4);
    expect(isDue(store.get().subscriptions[sub.deviceHash])).toBe(false);
    const latest = await (await realFetch(`${base}/api/daily/latest`, { headers: H })).json();
    expect(latest.job.kind).toBe('daily');
    const st = await (await realFetch(`${base}/api/daily/subscription`, { headers: H })).json();
    expect(st.subscription.lastRun.status).toBe('ok');
  });
  it('구독 요청은 생활비 정보를 받지 않는다(알 수 없는 필드는 저장 안 함)', async () => {
    await realFetch(`${base}/api/daily/subscription`, { method: 'PUT', headers: H, body: JSON.stringify({ enabled: true, time: '08:30', includePhotos: false, level: 1, nextLessonId: null, streak: 0, holdings: [], watchlist: [], balance: 380000 }) });
    const { store } = await import('../server/lib/store');
    const sub = Object.values(store.get().subscriptions)[0] as unknown as Record<string, unknown>;
    expect(sub.balance).toBeUndefined();
  });
});

describe('기사 RSS 파싱', () => {
  it('7일 이내 기사만, 제목 끝 언론사 제거', () => {
    const now = Date.parse('2026-10-17T00:00:00Z');
    const xml = `<rss><channel>
      <item><title>삼성전자 신제품 공개 - 연합뉴스</title><link>https://n/1</link><pubDate>Thu, 15 Oct 2026 03:00:00 GMT</pubDate><source url="x">연합뉴스</source></item>
      <item><title><![CDATA[오래된 기사 &amp; 소식]]></title><link>https://n/2</link><pubDate>Thu, 01 Oct 2026 03:00:00 GMT</pubDate><source>A</source></item>
    </channel></rss>`;
    const items = parseNewsRss(xml, now);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ title: '삼성전자 신제품 공개', source: '연합뉴스' });
  });
});
