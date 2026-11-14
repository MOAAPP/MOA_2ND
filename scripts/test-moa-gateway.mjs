import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import handler, { safeApiPath } from '../api/moa-gateway.mjs';

function request(method, url, path, body = null) {
  const req = Readable.from(body === null ? [] : [Buffer.from(body)]);
  req.method = method;
  req.url = url;
  req.query = { path };
  req.headers = { 'x-forwarded-for': '203.0.113.7', 'content-type': 'application/json' };
  return req;
}

function response() {
  return {
    code: 200, headers: {}, payload: null,
    setHeader(key, value) { this.headers[key.toLowerCase()] = value; return this; },
    status(code) { this.code = code; return this; },
    json(data) { this.payload = data; return this; },
    send(data) { this.payload = data; return this; },
  };
}

test('path safety excludes open proxies and traversals', () => {
  assert.equal(safeApiPath('users/S01/home'), 'users/S01/home');
  assert.equal(safeApiPath(['users', 'S01', 'home']), 'users/S01/home');
  assert.equal(safeApiPath('../private'), null);
  assert.equal(safeApiPath('https://example.net'), null);
  assert.equal(safeApiPath(''), null);
});

test('missing server-only configuration fails closed', async () => {
  delete process.env.MOA_FASTAPI_ORIGIN;
  delete process.env.MOA_PROXY_SHARED_KEY;
  const res = response();
  await handler(request('GET', '/api/moa-gateway?path=health', 'health'), res);
  assert.equal(res.code, 503);
  assert.equal(res.payload.detail.code, 'proxy_not_configured');
});

test('GET forwards the secret privately and preserves query string', async () => {
  process.env.MOA_FASTAPI_ORIGIN = 'https://3-107-190-215.sslip.io';
  process.env.MOA_PROXY_SHARED_KEY = 'test-only-random-token';
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://3-107-190-215.sslip.io/api/v4/users/S01/home?as_of=2026-11-04');
    assert.equal(init.headers['X-MOA-Gateway-Key'], 'test-only-random-token');
    assert.equal(init.headers['X-MOA-Client-IP'], '203.0.113.7');
    assert.equal(init.method, 'GET');
    return new Response(JSON.stringify({ user_id: 'S01' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const req = request('GET', '/api/moa-gateway?path=users%2FS01%2Fhome&as_of=2026-11-04', 'users/S01/home');
    const res = response();
    await handler(req, res);
    assert.equal(res.code, 200);
    assert.deepEqual(JSON.parse(res.payload.toString()), { user_id: 'S01' });
    assert.ok(!res.payload.toString().includes('test-only-random-token'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('POST preserves JSON body and does not expose the gateway token', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, init) => {
    assert.equal(String(url), 'https://3-107-190-215.sslip.io/api/v4/scenarios/compare');
    assert.equal(init.headers['Content-Type'], 'application/json');
    assert.deepEqual(JSON.parse(init.body.toString()), { user_id: 'S01' });
    return new Response('{"ok":true}', {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  };
  try {
    const res = response();
    await handler(request('POST', '/api/moa-gateway?path=scenarios%2Fcompare',
                          'scenarios/compare', '{"user_id":"S01"}'), res);
    assert.equal(res.code, 200);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
