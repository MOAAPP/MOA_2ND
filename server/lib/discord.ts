import { fetchWithTimeout } from './http';
import { store } from './store';

const WEBHOOK_RE = /^https:\/\/(?:discord|discordapp)\.com\/api\/webhooks\/\d+\/[\w-]+$/;

/** Webhook 주소는 서버 환경변수에서만 읽고, 로그·응답에 절대 포함하지 않는다. */
function webhookUrl(): string | null {
  const u = process.env.DISCORD_WEBHOOK_URL?.trim();
  return u && WEBHOOK_RE.test(u) ? u : null;
}

export function discordStatus() {
  const raw = process.env.DISCORD_WEBHOOK_URL?.trim();
  const d = store.get().discord;
  return {
    /** 서버에 주소가 설정됐는지 (전송 성공과는 별개) */
    configured: !!webhookUrl(),
    misconfigured: !!raw && !webhookUrl(),
    /** 실제 전송이 성공한 마지막 시각 */
    lastSuccessAt: d.lastSuccessAt,
    lastErrorAt: d.lastErrorAt,
    lastError: d.lastError,
    destination: '평행통장 Discord 서버의 카드뉴스 채널',
  };
}

export class DiscordError extends Error {
  constructor(message: string, public retryable = true) {
    super(message);
  }
}

export interface DiscordFile {
  name: string;
  data: Buffer;
  description?: string;
}

function record(ok: boolean, error?: string) {
  store.update((s) => {
    if (ok) s.discord.lastSuccessAt = Date.now();
    else {
      s.discord.lastErrorAt = Date.now();
      s.discord.lastError = error ?? '알 수 없는 오류';
    }
  });
}

/** 텍스트 + 첨부파일 전송. Discord는 성공 시 본문 없이 204를 주기도 하므로 본문을 강제로 파싱하지 않는다. */
export async function sendToDiscord(content: string, files: DiscordFile[] = []): Promise<void> {
  const url = webhookUrl();
  if (!url) throw new DiscordError('서버에 Discord 주소(DISCORD_WEBHOOK_URL)가 설정되지 않았거나 형식이 올바르지 않아요.', false);

  const build = () => {
    const form = new FormData();
    form.append(
      'payload_json',
      JSON.stringify({
        content,
        allowed_mentions: { parse: [] },
        attachments: files.map((f, i) => ({ id: i, filename: f.name, description: f.description?.slice(0, 1000) })),
      }),
    );
    files.forEach((f, i) => form.append(`files[${i}]`, new Blob([new Uint8Array(f.data)], { type: 'image/png' }), f.name));
    return form;
  };

  for (let attempt = 0; attempt < 2; attempt++) {
    let res;
    try {
      res = await fetchWithTimeout(`${url}?wait=true`, { method: 'POST', body: build() }, 30000);
    } catch {
      const msg = 'Discord에 연결하지 못했어요. 네트워크를 확인한 뒤 다시 보내 주세요.';
      record(false, msg);
      throw new DiscordError(msg);
    }
    if (res.ok) {
      record(true);
      return;
    }
    const text = await res.text().catch(() => '');
    let detail = '';
    let retryAfter = 0;
    if ((res.headers.get('content-type') ?? '').includes('json') && text) {
      try {
        const j = JSON.parse(text) as { message?: string; retry_after?: number };
        detail = j.message ?? '';
        retryAfter = j.retry_after ?? 0;
      } catch {
        /* 본문이 JSON이 아니면 무시 */
      }
    }
    if (res.status === 429 && attempt === 0 && retryAfter > 0 && retryAfter <= 5) {
      await new Promise((r) => setTimeout(r, retryAfter * 1000));
      continue;
    }
    const msg =
      res.status === 401 || res.status === 404
        ? 'Discord 주소가 더 이상 유효하지 않아요. 서버 관리자에게 새 Webhook을 요청하세요.'
        : res.status === 413
          ? '이미지 용량이 커서 Discord가 거절했어요.'
          : res.status === 429
            ? 'Discord 전송 한도에 걸렸어요. 잠시 후 다시 보내 주세요.'
            : `Discord 전송 실패(${res.status}${detail ? `: ${detail}` : ''})`;
    record(false, msg);
    throw new DiscordError(msg, res.status !== 401 && res.status !== 404);
  }
}
