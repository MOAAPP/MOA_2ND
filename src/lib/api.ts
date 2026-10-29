import { getDeviceId } from './id';

export class ApiFailure extends Error {
  constructor(message: string, public status: number, public code: string, public retryable: boolean) {
    super(message);
  }
}

/**
 * 서버 호출. 응답이 비어 있거나 JSON이 아니어도 JSON.parse로 터지지 않게 처리한다.
 * (예전 오류: Unexpected token 'M', "Method not allowed" is not valid JSON)
 */
export async function api<T>(path: string, init: { method?: 'GET' | 'POST' | 'PUT' | 'DELETE'; body?: unknown } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method: init.method ?? 'GET',
      headers: {
        Accept: 'application/json',
        'x-device-id': getDeviceId(),
        ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    throw new ApiFailure('서버에 연결하지 못했어요. 인터넷 연결이나 서버 실행 상태를 확인해 주세요.', 0, 'network', true);
  }
  const text = await res.text();
  const isJson = (res.headers.get('content-type') ?? '').includes('application/json');
  let data: unknown = null;
  if (text && isJson) {
    try {
      data = JSON.parse(text);
    } catch {
      data = null;
    }
  }
  if (!res.ok) {
    const err = (data as { error?: { message?: string; code?: string; retryable?: boolean } } | null)?.error;
    const fallback =
      res.status === 405 ? '요청 방식이 서버와 맞지 않아요.' : res.status === 404 ? '요청한 주소를 찾지 못했어요.' : res.status >= 500 ? '서버에서 문제가 생겼어요.' : `요청을 처리하지 못했어요 (${res.status}).`;
    throw new ApiFailure(err?.message ?? (text && !isJson ? `${fallback} (${text.slice(0, 60)})` : fallback), res.status, err?.code ?? 'http_error', err?.retryable ?? res.status >= 500);
  }
  if (!text) return {} as T;
  if (!isJson || data === null) throw new ApiFailure('서버 응답 형식이 올바르지 않아요.', res.status, 'bad_format', true);
  return data as T;
}

export function errorMessage(e: unknown): string {
  return e instanceof Error ? e.message : '알 수 없는 오류가 생겼어요.';
}
