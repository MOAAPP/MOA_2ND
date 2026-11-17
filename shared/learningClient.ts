export async function learningRequest<T>(root: string, path: string, options: RequestInit = {}): Promise<T> {
  let response: Response;
  try {
    response = await fetch(root + path, {
      ...options, headers: {
        Accept: 'application/json',
        ...(options.body ? { 'Content-Type': 'application/json' } : {}),
        ...options.headers,
      },
    });
  } catch {
    throw new Error('금융 AI 서버에 연결하지 못했어요. FastAPI 실행 상태를 확인해주세요.');
  }
  const data = await response.json().catch(() => null) as {
    detail?: { message?: string; code?: string } | string; [key: string]: unknown
  } | null;
  if (!response.ok) {
    const message = typeof data?.detail === 'string' ? data.detail :
      typeof data?.detail === 'object' ? data.detail.message : undefined;
    throw new Error(message ?? `요청 실패 (HTTP ${response.status}). API 키와 모델 설정을 확인해 주세요.`);
  }
  return data as T;
}
