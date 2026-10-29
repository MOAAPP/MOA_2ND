import { useMemo, useState } from 'react';
import { formatKDateTime } from '../../shared/dates';
import { Button, ButtonRow, Card } from '../components/ds';
import { ConfirmSheet, TopBar, useToast } from '../components/ui';
import { ARM_LABEL, join, leave, metrics, toCSV, toJSON, type Arm } from '../lib/research/log';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';

const pct = (v: number | null) => (v === null ? '—' : `${Math.round(v * 100)}%`);
const fmt = (n: number) => `${Math.round(n).toLocaleString('ko-KR')}원`;

function download(name: string, body: string, type: string) {
  const url = URL.createObjectURL(new Blob([body], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** 연구자가 배포 링크에 ?arm=preview|control 을 붙이면 그 조건으로 참여한다. */
function armFromUrl(): Arm | undefined {
  const v = new URLSearchParams(window.location.search).get('arm');
  return v === 'preview' || v === 'control' ? v : undefined;
}
const researcherView = () => new URLSearchParams(window.location.search).has('researcher');

const COLLECT = [
  '사기 전 비교에서 고른 것(참기·더 싸게·사기), 금액, 카테고리, 고민한 시간',
  '예금·적금 가입·중도해지·만기, 자동이체 성공·미납 횟수',
  '앱을 연 날짜와 횟수, 끝낸 레슨',
];
const NOT_COLLECT = ['이름, 연락처, 계좌번호', '품목 이름이나 메모처럼 직접 쓴 글', '사진, 위치'];

export function Research() {
  const { state, update } = useStore();
  const nav = useNav();
  const toast = useToast();
  const r = state.research;
  const [agree, setAgree] = useState(false);
  const [confirm, setConfirm] = useState<'leave' | 'wipe' | null>(null);
  const m = useMemo(() => metrics(r.events), [r.events]);
  const real = r.events.filter((e) => !e.demo).length;
  const ctx = () => ({ now: Date.now(), demo: state.demo });

  return (
    <div className="page t-page no-nav rs-page">
      <TopBar onBack={nav.pop} title="연구 참여" center />

      <header className="rs-head">
        <span className="rs-badge">{r.joined ? '참여 중' : '선택 사항'}</span>
        <h1>{r.joined ? <>함께해 주셔서<br />고마워요</> : <>소비 결정 연구에<br />참여할래요?</>}</h1>
        <p>20대가 사기 전에 미래 비용을 보면 결정이 달라지는지 알아보는 연구예요. 안 해도 앱은 똑같이 쓸 수 있어요.</p>
      </header>

      {r.joined ? (
        <>
          <Card title="내 참여 정보">
            <dl className="rs-kv">
              <div><dt>참여 번호</dt><dd className="num">{r.pid}</dd></div>
              <div><dt>참여 시작</dt><dd>{r.joinedAt ? formatKDateTime(r.joinedAt) : '—'}</dd></div>
              <div><dt>쌓인 기록</dt><dd className="num">{r.events.length}건{real !== r.events.length ? ` (체험 ${r.events.length - real}건 포함)` : ''}</dd></div>
              {researcherView() && <div><dt>조건</dt><dd>{ARM_LABEL[r.arm]}</dd></div>}
            </dl>
          </Card>

          <Card title="지금까지">
            <div className="rs-stats">
              <div><small>사기 전 비교</small><b className="num">{m.decisions}번</b></div>
              <div><small>참거나 더 싸게</small><b className="num">{pct(m.holdRate)}</b></div>
              <div><small>지킨 돈</small><b className="num">{fmt(m.savedTotal)}</b></div>
              <div><small>앱 연 날</small><b className="num">{m.activeDays}일</b></div>
            </div>
          </Card>

          <Card title="기록 보내기">
            <p className="rs-p">연구 기간이 끝나면 파일을 내려받아 안내받은 곳으로 보내 주세요. 파일에는 참여 번호와 위 항목만 들어 있어요.</p>
            <ButtonRow>
              <Button tone="ghost" disabled={!r.events.length} onClick={() => { download(`moa-${r.pid}.csv`, toCSV(r.events), 'text/csv;charset=utf-8'); toast('CSV를 내려받았어요'); }}>CSV</Button>
              <Button disabled={!r.events.length} onClick={() => { download(`moa-${r.pid}.json`, toJSON(r, Date.now()), 'application/json'); toast('JSON을 내려받았어요'); }}>JSON 내려받기</Button>
            </ButtonRow>
          </Card>

          <div className="rs-quiet">
            <button type="button" onClick={() => setConfirm('leave')}>참여 그만두기</button>
            <button type="button" className="danger" onClick={() => setConfirm('wipe')}>그만두고 기록 지우기</button>
          </div>
        </>
      ) : (
        <>
          <Card title="모으는 것">
            <ul className="rs-list yes">{COLLECT.map((t) => <li key={t}>{t}</li>)}</ul>
          </Card>
          <Card title="모으지 않는 것">
            <ul className="rs-list no">{NOT_COLLECT.map((t) => <li key={t}>{t}</li>)}</ul>
          </Card>
          <Card title="알아둘 것">
            <ul className="rs-list">
              <li>기록은 이 기기에만 쌓이고, 내가 파일로 보낼 때만 연구팀에 전달돼요.</li>
              <li>참여자마다 화면 구성이 조금 다를 수 있어요. 공정하게 비교하려고 무작위로 정해요.</li>
              <li>언제든 그만둘 수 있고, 그만둘 때 기록을 지울 수 있어요.</li>
              <li>결과는 개인을 알아볼 수 없게 합쳐서만 발표해요.</li>
            </ul>
          </Card>
          {r.events.length > 0 && (
            <Card title={`전에 쌓인 기록 ${r.events.length}건`}>
              <ButtonRow>
                <Button tone="ghost" onClick={() => download(`moa-${r.pid}.json`, toJSON(r, Date.now()), 'application/json')}>내려받기</Button>
                <Button tone="ghost" onClick={() => setConfirm('wipe')}>지우기</Button>
              </ButtonRow>
            </Card>
          )}
          <label className="rs-agree">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>위 내용을 읽었고, 만 19세 이상이며 참여에 동의해요.</span>
          </label>
          <div className="rs-cta">
            <Button disabled={!agree} onClick={() => { update((s) => ({ ...s, research: join(s.research, ctx(), armFromUrl()) })); toast('참여를 시작했어요'); }}>동의하고 참여하기</Button>
          </div>
        </>
      )}

      {confirm && (
        <ConfirmSheet
          title={confirm === 'wipe' ? '기록까지 지울까요?' : '참여를 그만둘까요?'}
          body={confirm === 'wipe' ? '이 기기에 쌓인 연구 기록이 모두 지워져요. 이미 보낸 파일은 연구팀에 삭제를 요청해 주세요.' : '지금부터는 기록이 쌓이지 않아요. 쌓인 기록은 남아 있어서 나중에 내려받을 수 있어요.'}
          confirm={confirm === 'wipe' ? '지우기' : '그만두기'}
          danger={confirm === 'wipe'}
          onClose={() => setConfirm(null)}
          onConfirm={() => { const wipe = confirm === 'wipe'; setConfirm(null); update((s) => ({ ...s, research: leave(s.research, ctx(), wipe) })); toast(wipe ? '기록을 지웠어요' : '참여를 그만뒀어요'); }}
        />
      )}
    </div>
  );
}
