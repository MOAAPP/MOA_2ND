import type { RequestHandler } from 'express';
import { sendError } from './http';

/** 로그인 없는 API의 무제한 호출을 막는 간단한 메모리 기반 호출 제한 (IP + 기기 ID 기준) */
export function rateLimit(_name: string, max: number, windowMs: number): RequestHandler {
  const hits = new Map<string, number[]>();
  return (req, res, next) => {
    const device = String(req.header('x-device-id') ?? '').slice(0, 64);
    const key = `${req.ip}|${device}`;
    const now = Date.now();
    const list = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (list.length >= max) {
      const retry = Math.ceil((windowMs - (now - list[0])) / 1000);
      res.setHeader('Retry-After', String(retry));
      return sendError(res, 429, 'rate_limited', `요청이 너무 많아요. ${retry}초 후에 다시 시도해 주세요.`, true);
    }
    list.push(now);
    hits.set(key, list);
    if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < windowMs)) hits.delete(k);
    next();
  };
}
