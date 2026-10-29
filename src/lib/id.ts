export function uid(prefix = ''): string {
  const r = typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
  return prefix ? `${prefix}_${r.replace(/-/g, '').slice(0, 16)}` : r;
}

const DEVICE_KEY = 'pb.device';

/** 로그인 없이 이 기기를 구분하는 무작위 ID (재무 정보와 무관, 카드뉴스 목록 구분용) */
export function getDeviceId(): string {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id || !/^[0-9a-f-]{20,64}$/i.test(id)) {
      id = uid();
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch {
    return '00000000-0000-4000-8000-000000000000';
  }
}
