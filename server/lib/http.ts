import type { NextFunction, Request, Response, RequestHandler } from 'express';

type FetchResponse = globalThis.Response;
import { ZodError } from 'zod';

/** 모든 API 오류는 { error: { code, message } } JSON으로 응답한다. */
export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public retryable = false) {
    super(message);
  }
}

export function sendError(res: Response, status: number, code: string, message: string, retryable = false) {
  res.status(status).type('application/json').json({ error: { code, message, retryable } });
}

export const route =
  (fn: (req: Request, res: Response) => Promise<unknown> | unknown): RequestHandler =>
  (req, res, next) => {
    Promise.resolve(fn(req, res)).catch(next);
  };

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (res.headersSent) return;
  if (err instanceof ApiError) return sendError(res, err.status, err.code, err.message, err.retryable);
  if (err instanceof ZodError) {
    return sendError(res, 400, 'invalid_request', '요청 형식이 올바르지 않아요: ' + err.issues.map((i) => `${i.path.join('.')} ${i.message}`).join(', '));
  }
  if (err && typeof err === 'object' && 'type' in err && (err as { type: string }).type === 'entity.parse.failed') {
    return sendError(res, 400, 'invalid_json', '요청 본문이 올바른 JSON이 아니에요.');
  }
  console.error('[api] 처리되지 않은 오류:', err instanceof Error ? err.message : err);
  sendError(res, 500, 'internal', '서버에서 문제가 생겼어요. 잠시 후 다시 시도해 주세요.', true);
}

/** 라우트는 있지만 메서드가 다를 때 405 JSON */
export function methodNotAllowed(allowed: string[]): RequestHandler {
  return (_req, res) => {
    res.setHeader('Allow', allowed.join(', '));
    sendError(res, 405, 'method_not_allowed', `이 주소는 ${allowed.join(', ')} 요청만 받아요.`);
  };
}

export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 10000): Promise<FetchResponse> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}
