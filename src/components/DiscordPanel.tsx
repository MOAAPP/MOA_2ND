import { useCallback, useEffect, useState } from 'react';
import { formatKDateTime } from '../../shared/dates';
import { api, errorMessage } from '../lib/api';
import { useMarket } from '../state/market';
import { useStore } from '../state/store';
import { Notice, Sheet, Switch, useToast } from './ui';

export const DISCORD_INVITE = 'https://discord.gg/NSCE4wxsD';

export interface DiscordStatus {
  configured: boolean;
  misconfigured: boolean;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  lastError: string | null;
  destination: string;
}

export interface DailySubStatus {
  enabled: boolean;
  time: string;
  nickname: string;
  includePhotos: boolean;
  lastRun: { date: string; status: 'ok' | 'failed' | 'running'; error?: string; attempts: number; lastAttemptAt: number; jobId: string | null } | null;
  nextRunAt: number | null;
}

export function useDiscordStatus() {
  const [status, setStatus] = useState<DiscordStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      setStatus(await api<DiscordStatus>('/api/discord/status'));
      setError(null);
    } catch (e) {
      setError(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  return { status, error, reload: load, setStatus };
}

/** 공용 채널로 무엇이 가는지 알리고 동의를 받는 시트 */
export function ConsentSheet({ onClose, onAgree }: { onClose: () => void; onAgree: () => void }) {
  return (
    <Sheet title="Discord로 보내는 정보" onClose={onClose} footer={<><button className="btn ghost" onClick={onClose}>취소</button><button className="btn primary flex" onClick={onAgree}>동의하고 켜기</button></>}>
      <p className="ink2" style={{ marginTop: 0, fontSize: 15 }}>카드뉴스는 <b>평행통장 Discord 서버의 공용 채널</b>로 전송돼요. 서버에 참여한 사람은 누구나 볼 수 있어요.</p>
      <div className="card" style={{ boxShadow: 'none', background: 'var(--surface-2)' }}>
        <div className="bold small">보내는 것</div>
        <ul className="small ink2" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          <li>매일: 코스피·코스닥·미국 지수, 내 모의 보유 종목의 등락과 모의 평가손익, 움직임 분석, 연속 학습일·다음 레슨·오늘의 퀴즈</li>
          <li>모의 체결 시(선택): 종목, 매수·매도, 수량, 체결가</li>
          <li>입력한 경우 닉네임</li>
        </ul>
        <div className="bold small" style={{ marginTop: 12 }}>보내지 않는 것</div>
        <ul className="small ink2" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          <li>생활비 잔고, 수입·지출 일정, 소비 기록, 목표 금액</li>
          <li>모의 총자산 금액, 실명 등 개인 정보</li>
        </ul>
      </div>
      <p className="xs muted">데일리 카드뉴스를 위해 서버에 모의 보유 종목·관심 종목·학습 진행만 저장돼요. 끄면 서버에서도 지워요.</p>
    </Sheet>
  );
}

const TIMES = [
  { v: '07:30', l: '오전 7:30' },
  { v: '08:30', l: '오전 8:30 · 장 시작 전 (추천)' },
  { v: '12:30', l: '오후 12:30 · 점심' },
  { v: '15:45', l: '오후 3:45 · 장 마감 직후' },
  { v: '21:00', l: '오후 9:00 · 저녁 복습' },
];

/** 매일 Discord로 오는 데일리 카드뉴스 설정 + Discord 연결 상태 */
export function DiscordPanel({ compact }: { compact?: boolean }) {
  const { state, update } = useStore();
  const m = useMarket();
  const toast = useToast();
  const { reload, setStatus } = useDiscordStatus();
  const [sub, setSub] = useState<DailySubStatus | null>(null);
  const [serverPhotos, setServerPhotos] = useState<boolean | null>(null);
  const [, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [consent, setConsent] = useState<null | 'daily' | 'trade' | 'test'>(null);
  const d = state.daily;

  const loadSub = useCallback(async () => {
    try {
      const r = await api<{ subscription: DailySubStatus | null; photos: boolean }>('/api/daily/subscription');
      setSub(r.subscription);
      setServerPhotos(r.photos);
    } catch {
      /* 상태 표시만 생략 */
    }
  }, []);
  useEffect(() => {
    void loadSub();
  }, [loadSub, m.dailySync.at]);

  // 서버에 사진 키가 없으면 사진 없이 보내도록(실패 반복 방지)
  useEffect(() => {
    if (serverPhotos === false && d.includePhotos) update((s) => ({ ...s, daily: { ...s.daily, includePhotos: false } }));
  }, [serverPhotos, d.includePhotos, update]);

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    try {
      const r = await api<{ ok: boolean; status: DiscordStatus }>('/api/discord/test', { method: 'POST' });
      setStatus(r.status);
      setTestResult({ ok: true, msg: 'Discord 채널에 확인 메시지를 보냈어요. 채널에서 메시지가 왔는지 봐주세요.' });
    } catch (e) {
      setTestResult({ ok: false, msg: errorMessage(e) });
      void reload();
    } finally {
      setTesting(false);
    }
  };

  const setDaily = (p: Partial<typeof d>) => update((s) => ({ ...s, daily: { ...s.daily, ...p } }));
  const on = d.enabled && state.settings.discordConsent;

  return (
    <div className="card">
      <div className="row between">
        <div>
          <div className="bold" style={{ fontSize: 17 }}>매일 카드뉴스 받기</div>
          <div className="small muted">정해진 시각에 Discord로 4장이 와요</div>
        </div>
        <Switch
          label="데일리 카드뉴스"
          checked={on}
          onChange={(v) => {
            if (v && !state.settings.discordConsent) return setConsent('daily');
            setDaily({ enabled: v });
            toast(v ? '데일리 카드뉴스를 켰어요' : '데일리 카드뉴스를 껐어요');
          }}
        />
      </div>

      {on && (
        <>
          <label className="field" style={{ marginTop: 14 }}>
            <span className="lab">받는 시각</span>
            <select className="select" value={d.time} onChange={(e) => setDaily({ time: e.target.value })}>
              {TIMES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
          </label>
          {!compact && (
            <label className="field">
              <span className="lab">카드에 표시할 닉네임 (선택)</span>
              <input className="input" value={d.nickname} maxLength={12} onChange={(e) => setDaily({ nickname: e.target.value })} placeholder="예: 지현" />
              <div className="hint">여러 사람이 보는 채널이라 실명은 피하세요.</div>
            </label>
          )}
          {sub?.nextRunAt && <p className="small muted" style={{ margin: '10px 0 0' }}>다음 카드 {formatKDateTime(sub.nextRunAt)}</p>}
          <div className="row between" style={{ marginTop: 14 }}>
            <div>
              <div className="bold" style={{ fontSize: 15 }}>모의투자 체결 카드도 받기</div>
              <div className="small muted">사고팔면 그 거래 카드도 바로 와요.</div>
            </div>
            <Switch label="체결 카드 자동 전송" checked={state.settings.autoSendDiscord} onChange={(v) => update((s) => ({ ...s, settings: { ...s.settings, autoSendDiscord: v } }))} />
          </div>
        </>
      )}
      {testResult && !testResult.ok && <div style={{ marginTop: 10 }}><Notice kind="danger">{testResult.msg}</Notice></div>}
      <div className="row" style={{ gap: 8, marginTop: 14 }}>
        <a className="btn secondary flex sm" href={DISCORD_INVITE} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'none' }}>Discord 채널 들어가기</a>
      </div>
      {consent && (
        <ConsentSheet
          onClose={() => setConsent(null)}
          onAgree={() => {
            const was = consent;
            update((s) => ({ ...s, settings: { ...s.settings, discordConsent: true }, daily: { ...s.daily, enabled: was === 'daily' ? true : s.daily.enabled } }));
            setConsent(null);
            if (was === 'test') void test();
            else toast('데일리 카드뉴스를 켰어요');
          }}
        />
      )}
    </div>
  );
}
