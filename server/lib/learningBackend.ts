import { getVercelOidcToken } from '@vercel/oidc';
import { fetchWithTimeout } from './http';

export async function learningBackend(path: string, method = 'GET', body?: unknown): Promise<Response> {
  const base = (process.env.MOA_FINANCE_API_BASE || process.env.MOA_FASTAPI_ORIGIN || (process.env.VERCEL ? 'https://moa-finance-api.vercel.app' : 'http://127.0.0.1:8000')).replace(/\/$/, '');
  const headers: Record<string,string> = { Accept:'application/json', 'Content-Type':'application/json' };
  if (process.env.MOA_INTERNAL_SECRET) headers['X-MOA-Internal-Secret'] = process.env.MOA_INTERNAL_SECRET;
  if (process.env.MOA_PROXY_SHARED_KEY) headers['X-MOA-Gateway-Key']=process.env.MOA_PROXY_SHARED_KEY;
  if (process.env.VERCEL) headers['x-vercel-trusted-oidc-idp-token'] = await getVercelOidcToken();
  return fetchWithTimeout(`${base}/api/v4${path}`, { method, headers,
    ...(body === undefined ? {} : {body:JSON.stringify(body)}) }, 25000);
}

export async function learningJson<T>(path: string, method = 'GET', body?: unknown): Promise<T> {
  const response = await learningBackend(path, method, body);
  if (!response.ok) throw new Error(`learning_backend_${response.status}`);
  return response.json() as Promise<T>;
}
