import { useCallback, useEffect, useState } from 'react';
import { currentStreak, dailyQuizFor, nextLesson } from '../../shared/curriculum';
import { formatKDate, formatKDateTime, todayKST } from '../../shared/dates';
import { won, shares } from '../../shared/format';
import { LEVEL_LABEL, type Level } from '../../shared/knowledge';
import type { QuoteSource } from '../../shared/market';
import { DiscordPanel } from '../components/DiscordPanel';
import { IconRefresh, IconImage, IconChevron, IconSend } from '../components/Icons';
import { Empty, Notice, Spinner, TopBar, useToast } from '../components/ui';
import { api, errorMessage } from '../lib/api';
import { progressOf } from '../lib/learning';
import { useMarket } from '../state/market';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';
import { DailyQuizCard } from './Learn';

export interface PublicJob {
  id: string;
  kind: 'trade' | 'daily';
  tradeId: string;
  dailyDate: string | null;
  createdAt: number;
  updatedAt: number;
  status: 'generating' | 'generated' | 'sending' | 'sent' | 'failed';
  stage: 'data' | 'photo' | 'render' | 'send' | null;
  error: string | null;
  retryable: boolean;
  code: string | null;
  name: string;
  side: 'buy' | 'sell' | null;
  qty: number | null;
  price: number | null;
  level: Level;
  autoSend: boolean;
  noPhoto: boolean;
  images: string[];
  titles: string[];
  photos: { id: number | null; query: string; photographer: string | null; sourceUrl: string | null; provider: string }[];
  news: { title: string; source: string; publishedAt: number; link: string }[];
  quoteMeta: { source: QuoteSource; time: number; delayed: boolean; live: boolean; delayNote: string } | null;
  summary: string;
  headline: string | null;
  notice: string | null;
  sends: { at: number; auto: boolean; ok: boolean; error?: string }[];
}

const STAGE_LABEL: Record<string, string> = { data: '시세·지수·기사를 모으고 원인을 분석하는 중', photo: '내용에 맞는 사진 고르는 중', render: '카드 이미지 만드는 중', send: 'Discord로 보내는 중' };

export function statusPill(j: PublicJob) {
  switch (j.status) {
    case 'generating': return <span className="pill blue">생성 중</span>;
    case 'generated': return <span className="pill">{j.autoSend ? '생성 완료' : '앱에서만 보기'}</span>;
    case 'sending': return <span className="pill blue">전송 중</span>;
    case 'sent': return <span className="pill ok">Discord 전송 완료</span>;
    case 'failed': return <span className="pill danger">{j.stage === 'send' ? '전송 실패' : '생성 실패'}{j.retryable ? ' · 재시도 가능' : ''}</span>;
  }
}

function useJob(jobId: string | undefined) {
  const [job, setJob] = useState<PublicJob | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!jobId) return;
    try {
      setJob((await api<{ job: PublicJob }>(`/api/cardnews/${jobId}`)).job);
      setErr(null);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }, [jobId]);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    if (!job || (job.status !== 'generating' && job.status !== 'sending')) return;
    const t = window.setTimeout(load, 1500);
    return () => window.clearTimeout(t);
  }, [job, load]);
  return { job, setJob, err, setErr, load };
}

/** 카드뉴스 4장 보기 + 상태 + 실패 시 재시도 (보내기 버튼 없음: 전송은 자동) */
export function JobView({ job, setJob, reload, onError }: { job: PublicJob; setJob: (j: PublicJob) => void; reload: () => void; onError: (m: string) => void }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const act = async (path: 'retry-send' | 'regenerate', body?: unknown) => {
    if (busy) return;
    setBusy(true);
    try {
      const r = await api<{ job: PublicJob }>(`/api/cardnews/${job.id}/${path}`, { method: 'POST', body: body ?? {} });
      setJob(r.job);
      if (path === 'retry-send') toast(r.job.status === 'sent' ? 'Discord로 다시 보냈어요' : '다시 보내지 못했어요');
      else window.setTimeout(reload, 800);
    } catch (e) {
      onError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      {job.notice && <p className="xs muted" style={{ margin: '8px 4px 0' }}>{job.notice}</p>}
      {job.headline && <p className="bold" style={{ fontSize: 16, margin: '10px 4px 0' }}>{job.headline}</p>}
      {(job.status === 'generating' || job.status === 'sending') && <div className="card" style={{ marginTop: 12 }}><Spinner label={STAGE_LABEL[job.stage ?? 'data']} /></div>}
      {job.status === 'failed' && (
        <div style={{ marginTop: 12 }}>
          <Notice kind="danger">
            <b>{job.stage === 'send' ? 'Discord 전송에 실패했어요.' : '카드뉴스를 만들지 못했어요.'}</b> {job.error}
            {job.stage === 'send' && job.kind === 'trade' && <div className="small">모의 거래는 그대로 유지돼요. 알림만 실패했어요.</div>}
            {job.kind === 'daily' && <div className="small">잠시 뒤 다시 만들어 볼게요.</div>}
          </Notice>
          <div className="row" style={{ gap: 8, marginTop: 10 }}>
            {job.stage === 'send' ? (
              <button className="btn primary flex" disabled={busy || !job.retryable} onClick={() => act('retry-send')}><IconSend /> 지금 다시 시도</button>
            ) : (
              <>
                <button className="btn primary flex" disabled={busy} onClick={() => act('regenerate', {})}><IconRefresh /> 다시 만들기</button>
                {job.stage === 'photo' && <button className="btn ghost flex" disabled={busy} onClick={() => act('regenerate', { noPhoto: true })}><IconImage /> 사진 없이</button>}
              </>
            )}
          </div>
        </div>
      )}
      {job.images.length > 0 && (
        <>
          <div className="cardnews-viewer" style={{ marginTop: 14 }} aria-label="카드뉴스 4장">
            {job.images.map((src, i) => (
              <a key={src} href={src} target="_blank" rel="noopener noreferrer" style={{ width: '78%', flex: 'none' }}>
                <img src={src} alt={`${i + 1}/4 ${job.titles[i] ?? ''}`} style={{ width: '100%' }} loading="lazy" />
              </a>
            ))}
          </div>
          <p className="xs muted" style={{ margin: '4px 4px 0' }}>옆으로 넘겨 4장을 볼 수 있어요. 누르면 원본 PNG가 열려요.</p>
        </>
      )}
      <section className="section">
        <div className="section-head"><h2>출처와 기준</h2></div>
        <div className="card small">
          {job.quoteMeta && <p style={{ marginTop: 0 }}>{formatKDateTime(job.quoteMeta.time)} 기준 시세</p>}
          <div className="bold">사진</div>
          {job.noPhoto ? <p className="ink2" style={{ marginTop: 2 }}>사진 없이 만들었어요.</p> : job.photos.length ? (
            <ul style={{ margin: '4px 0 10px', paddingLeft: 18 }} className="ink2">
              {job.photos.map((p, i) => <li key={i}>{i + 1}장: 자료 사진 · {p.photographer ?? '—'} / {p.provider === 'pixabay' ? 'Pixabay' : 'Pexels'}{p.sourceUrl ? <> · <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer">원본</a></> : null}</li>)}
            </ul>
          ) : <p className="muted" style={{ marginTop: 2 }}>아직 없음</p>}
          <p className="xs muted">사진은 AI로 만들지 않고 Pixabay·Pexels 자료 사진을 골라요. 당일 현장 사진이 아니에요.</p>
          <div className="bold">기사 (원인 분석에 참고한 제목)</div>
          {job.news.length ? (
            <ul style={{ margin: '4px 0 0', paddingLeft: 18 }} className="ink2">
              {job.news.slice(0, 3).map((n) => <li key={n.link}><a href={n.link} target="_blank" rel="noopener noreferrer">{n.title}</a> · {n.source}</li>)}
            </ul>
          ) : <p className="muted" style={{ marginTop: 2 }}>관련 기사를 찾지 못했어요.</p>}
          <p className="xs muted">'왜 움직였을까'는 코스피·같은 업종·미국 증시·환율·거래량·기사 제목을 코드로 비교한 추정이에요. 원인을 단정하지 않아요.</p>
        </div>
      </section>
      {job.sends.length > 0 && (
        <section className="section">
          <div className="section-head"><h2>전송 기록</h2></div>
          <div className="card" style={{ padding: '4px 18px' }}>
            {job.sends.slice().reverse().map((s, i) => (
              <div key={i} className="list-item">
                <div className="grow"><div className="t" style={{ fontSize: 15 }}>{s.ok ? '전송 완료' : '전송 실패'}</div><div className="s">{formatKDateTime(s.at)} · {s.auto ? '자동' : '다시 시도'}{s.error ? ` · ${s.error}` : ''}</div></div>
                <span className={`pill ${s.ok ? 'ok' : 'danger'}`}>{s.ok ? '성공' : '실패'}</span>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/** 모의 체결 카드뉴스 */
export function CardNews({ tradeId, jobId: givenJobId }: { tradeId: string; jobId?: string }) {
  const { state } = useStore();
  const nav = useNav();
  const m = useMarket();
  const jobId = givenJobId ?? state.cardJobIds[tradeId];
  const fill = state.portfolio.fills.find((f) => f.id === tradeId);
  const { job, setJob, err, setErr, load } = useJob(jobId);
  const [creating, setCreating] = useState(false);

  if (!jobId) {
    return (
      <div className="page no-nav">
        <TopBar onBack={nav.pop} title="카드뉴스" center />
        <div className="card">
          {fill ? (
            <>
              <div className="bold">{fill.name} {shares(fill.qty)} {fill.side === 'buy' ? '매수' : '매도'} · {won(fill.price)}</div>
              <p className="small muted">{formatKDateTime(fill.time)} 모의 체결</p>
              {m.cardErrors[tradeId] ? <Notice kind="danger">카드뉴스 요청에 실패했어요. {m.cardErrors[tradeId]}</Notice> : <Notice kind="info">체결 직후 자동으로 만들어요. 아직 요청 전이라면 아래에서 다시 시도할 수 있어요.</Notice>}
              <button className="btn primary block" style={{ marginTop: 12 }} disabled={creating} onClick={async () => { setCreating(true); await m.requestCard(fill); setCreating(false); }}>{creating ? '요청 중…' : '카드뉴스 다시 요청'}</button>
            </>
          ) : <Empty title="거래를 찾지 못했어요" />}
        </div>
      </div>
    );
  }

  return (
    <div className="page no-nav">
      <TopBar onBack={nav.pop} title={job?.kind === 'daily' ? '데일리 카드뉴스' : '체결 카드뉴스'} center />
      {err && <Notice kind="danger">{err} <button className="link-btn" onClick={load}>다시 불러오기</button></Notice>}
      {!job && !err && <div className="card"><Spinner label="불러오는 중" /></div>}
      {job && (
        <>
          <div className="row between" style={{ padding: '0 4px' }}>
            <div>
              <div className="bold" style={{ fontSize: 18 }}>{job.name} {job.qty ? shares(job.qty) : ''} {job.side === 'buy' ? '매수' : '매도'}</div>
              <div className="small muted">체결가 {job.price ? won(job.price) : '—'} · 설명 수준 {LEVEL_LABEL[job.level]}</div>
            </div>
            {statusPill(job)}
          </div>
          {!job.autoSend && job.status === 'generated' && <p className="xs muted" style={{ margin: '6px 4px 0' }}>Discord 자동 전송이 꺼져 있어 앱에서만 볼 수 있어요. 배움 → 데일리 설정에서 켤 수 있어요.</p>}
          <JobView job={job} setJob={setJob} reload={load} onError={setErr} />
        </>
      )}
    </div>
  );
}

/** 데일리 카드뉴스: 오늘 카드 + 지난 카드 + 오늘의 퀴즈 + 설정 */
export function DailyScreen() {
  const { state } = useStore();
  const nav = useNav();
  const [latest, setLatest] = useState<{ job: PublicJob | null; history: PublicJob[] } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [making, setMaking] = useState(false);
  const today = todayKST();
  const load = useCallback(async () => {
    try {
      setLatest(await api<{ job: PublicJob | null; history: PublicJob[] }>('/api/daily/latest'));
      setErr(null);
    } catch (e) {
      setErr(errorMessage(e));
    }
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  const todayJob = latest?.job?.dailyDate === today ? latest.job : null;
  useEffect(() => {
    if (!todayJob || (todayJob.status !== 'generating' && todayJob.status !== 'sending')) return;
    const t = window.setTimeout(load, 1500);
    return () => window.clearTimeout(t);
  }, [todayJob, load]);
  const on = state.daily.enabled && state.settings.discordConsent;
  const quiz = dailyQuizFor(today, nextLesson(progressOf(state))?.id ?? 'u1l1');

  return (
    <div className="page no-nav">
      <TopBar onBack={nav.pop} title="데일리 카드뉴스" center />
      <p className="small ink2" style={{ margin: '0 4px 12px' }}>매일 정해진 시각, 시장·내 종목·움직인 이유·오늘의 퀴즈를 4장 카드로 Discord에 보내드려요. 앱에서도 같은 카드를 볼 수 있어요.</p>
      {err && <Notice kind="danger">{err}</Notice>}
      <section className="card">
        <div className="row between">
          <div>
            <div className="bold">{formatKDate(today, { weekday: true })} 카드</div>
            <div className="small muted">{todayJob ? (todayJob.sends.some((s) => s.ok) ? 'Discord로 보냈어요' : todayJob.autoSend ? '전송 대기·진행 중' : '앱 미리보기 (Discord 전송은 정해진 시각에)') : on ? `오늘 ${state.daily.time}에 보내요` : '데일리 카드뉴스가 꺼져 있어요'}</div>
          </div>
          {todayJob && statusPill(todayJob)}
        </div>
        {!todayJob && on && (
          <button className="btn secondary block" style={{ marginTop: 12 }} disabled={making} onClick={async () => {
            setMaking(true);
            try {
              await api('/api/daily/preview', { method: 'POST' });
              window.setTimeout(load, 600);
            } catch (e) {
              setErr(errorMessage(e));
            } finally {
              setMaking(false);
            }
          }}>{making ? '만드는 중…' : '오늘 카드 미리 보기'}</button>
        )}
        {todayJob && <JobView job={todayJob} setJob={(j) => setLatest((l) => (l ? { ...l, job: j } : l))} reload={load} onError={setErr} />}
      </section>

      <section className="section">
        <div className="section-head"><h2>오늘의 퀴즈</h2><span className="xs muted">카드 4장째 문제</span></div>
        <DailyQuizCard quiz={quiz} />
        <p className="xs muted" style={{ margin: '6px 4px 0' }}>연속 학습 {currentStreak(state.learning.streak, today)}일</p>
      </section>

      <section className="section"><DiscordPanel /></section>

      {latest && latest.history.filter((h) => h.dailyDate !== today).length > 0 && (
        <section className="section">
          <div className="section-head"><h2>지난 카드</h2></div>
          <div className="card" style={{ padding: '4px 18px' }}>
            {latest.history.filter((h) => h.dailyDate !== today).map((j) => (
              <button key={j.id} className="list-item" onClick={() => nav.push({ name: 'cardnews', tradeId: j.tradeId, jobId: j.id })}>
                {j.images[0] ? <img src={j.images[0]} alt="" style={{ width: 48, height: 60, objectFit: 'cover', borderRadius: 8 }} /> : <div className="avatar"><IconImage width={20} height={20} /></div>}
                <div className="grow">
                  <div className="t">{j.dailyDate ? formatKDate(j.dailyDate, { weekday: true }) : ''}</div>
                  <div className="s">{j.headline || '데일리 브리핑'}</div>
                  <div style={{ marginTop: 4 }}>{statusPill(j)}</div>
                </div>
                <IconChevron width={18} height={18} color="var(--ink-3)" />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

export function CardsList() {
  const nav = useNav();
  const [jobs, setJobs] = useState<PublicJob[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    api<{ jobs: PublicJob[] }>('/api/cardnews').then((r) => setJobs(r.jobs)).catch((e) => setErr(errorMessage(e)));
  }, []);
  return (
    <div className="page no-nav">
      <TopBar onBack={nav.pop} title="카드뉴스 기록" center />
      {err && <Notice kind="danger">목록을 불러오지 못했어요. {err}</Notice>}
      {!jobs && !err && <div className="card"><Spinner /></div>}
      {jobs && (
        <div className="card" style={{ padding: '4px 18px' }}>
          {jobs.length === 0 && <Empty title="아직 카드뉴스가 없어요">데일리 카드뉴스를 켜거나 모의 매수·매도를 하면 만들어져요.</Empty>}
          {jobs.map((j) => (
            <button key={j.id} className="list-item" onClick={() => nav.push({ name: 'cardnews', tradeId: j.tradeId, jobId: j.id })}>
              {j.images[0] ? <img src={j.images[0]} alt="" style={{ width: 48, height: 60, objectFit: 'cover', borderRadius: 8 }} /> : <div className="avatar"><IconImage width={20} height={20} /></div>}
              <div className="grow">
                <div className="t">{j.kind === 'daily' ? `데일리 · ${j.dailyDate ? formatKDate(j.dailyDate) : ''}` : `${j.name} ${j.side === 'buy' ? '매수' : '매도'} ${j.qty ? shares(j.qty) : ''}`}</div>
                <div className="s">{j.headline || formatKDateTime(j.createdAt)}</div>
                <div style={{ marginTop: 4 }}>{statusPill(j)}</div>
              </div>
              <IconChevron width={18} height={18} color="var(--ink-3)" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
