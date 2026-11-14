/**
 * Same-origin Vercel -> EC2 FastAPI proxy.
 * The gateway key exists only in Vercel's SERVER environment, never VITE_*.
 * Vercel rewrites /api/v4/:path* to /api/moa-gateway?path=:path*.
 */
const MAX_BYTES = 4 * 1024 * 1024;
const ALLOWED_METHODS = new Set(['GET', 'POST']);

export function safeApiPath(value) {
  const path = Array.isArray(value) ? value.join('/') : String(value ?? '');
  if (!path || !/^[a-zA-Z0-9/_-]+$/.test(path) || path.split('/').includes('..')) {
    return null;
  }
  return path.replace(/^\/+/, '');
}

async function rawBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > MAX_BYTES) {
      const err = new Error('request_too_large');
      err.status = 413;
      throw err;
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const origin = (process.env.MOA_FASTAPI_ORIGIN ?? '').replace(/\/+$/, '');
  const gatewayKey = process.env.MOA_PROXY_SHARED_KEY ?? '';
  if (!origin.startsWith('https://') || !gatewayKey) {
    return res.status(503).json({ detail: {
      code: 'proxy_not_configured',
      message: 'MOA 서버 연결 설정을 확인해 주세요.',
    }});
  }
  const path = safeApiPath(req.query?.path);
  if (!path) {
    return res.status(400).json({ detail: { code: 'invalid_api_path' } });
  }
  const method = (req.method || 'GET').toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ detail: { code: 'method_not_allowed' } });
  }
  const incoming = new URL(req.url || '/', 'https://frontend.invalid');
  incoming.searchParams.delete('path');
  const upstream = new URL('/api/v4/' + path, origin);
  upstream.search = incoming.searchParams.toString();
  const headers = {
    'Accept': 'application/json',
    'X-MOA-Gateway-Key': gatewayKey,
    // Used for a per-client courtesy quota, not trusted for billing limits.
    'X-MOA-Client-IP': String(req.headers['x-forwarded-for'] || req.headers['x-real-ip'] || 'unknown')
      .split(',')[0].trim().slice(0, 128),
  };
  const contentType = req.headers['content-type'];
  if (typeof contentType === 'string') headers['Content-Type'] = contentType;
  try {
    const body = method === 'POST' ? await rawBody(req) : undefined;
    const response = await fetch(upstream, {
      method,
      headers,
      body,
      redirect: 'manual',
      signal: AbortSignal.timeout(45000),
    });
    const type = response.headers.get('content-type') || 'application/json; charset=utf-8';
    res.setHeader('Content-Type', type);
    const retryAfter = response.headers.get('retry-after');
    if (retryAfter) res.setHeader('Retry-After', retryAfter);
    return res.status(response.status).send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    const tooLarge = error?.status === 413;
    return res.status(tooLarge ? 413 : 502).json({
      detail: {
        code: tooLarge ? 'request_too_large' : 'fastapi_unavailable',
        message: tooLarge ? '이미지 크기가 허용 범위를 초과했어요.' : '금융 분석 서버에 연결하지 못했어요.',
      },
    });
  }
}
