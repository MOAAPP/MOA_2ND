import { useState } from 'react';
import { formatKDate, formatKDateTime, todayKST } from '../../shared/dates';
import { won } from '../../shared/format';
import { LEVEL_LABEL } from '../../shared/knowledge';
import { DiscordPanel } from '../components/DiscordPanel';
import { IconChevron } from '../components/Icons';
import { ScheduleList } from '../components/ScheduleEditor';
import { SpendDataPanel } from '../components/SpendDataPanel';
import { AmountInput, ConfirmSheet, CtaBar, Notice, Switch, TopBar, useToast } from '../components/ui';
import { occurrences } from '../lib/cashflow';
import type { Profile } from '../lib/types';
import { useNav } from '../state/nav';
import { resetScope, useStore } from '../state/store';

const SCOPES = {
  finance: { title: '생활비 정보와 소비 기록', body: '잔고·수입·지출·지켜둘 금액·목표와 갈림길의 모든 기록이 지워지고 초기 설정부터 다시 시작해요. 모의투자는 그대로예요.' },
  invest: { title: '모의투자와 진단 결과', body: '모의 자금이 10,000,000원으로 돌아가고 보유 종목·주문·거래 내역·지식 진단 결과가 지워져요. 서버의 카드뉴스 이미지는 남아 있을 수 있어요.' },
  all: { title: '전체 데이터', body: '이 기기에 저장된 평행통장 데이터가 모두 지워져요. 되돌릴 수 없어요.' },
} as const;

export function Settings({ onReplayIntro }: { onReplayIntro: () => void }) {
  const { state, update, storageError } = useStore();
  const nav = useNav();
  const toast = useToast();
  const [reset, setReset] = useState<keyof typeof SCOPES | null>(null);
  const p = state.profile;

  return (
    <div className="page no-nav">
      <TopBar onBack={nav.pop} title="설정" center />
      {storageError && <Notice kind="danger">{storageError}</Notice>}

      <section className="card" style={{ padding: '4px 18px' }}>
        <button className="list-item" onClick={() => nav.push({ name: 'finance' })}>
          <div className="grow"><div className="t">재무 정보 수정</div><div className="s">{p ? `잔고 ${won(p.baseBalance)} · ${formatKDate(p.baseDate)} 기준` : '설정 전'}</div></div>
          <IconChevron width={18} height={18} color="var(--ink-3)" />
        </button>
        <button className="list-item" onClick={() => nav.push({ name: 'placement' })}>
          <div className="grow"><div className="t">레벨테스트 다시 보기</div><div className="s">현재 수준: {state.level ? LEVEL_LABEL[state.level] : '진단 전'}</div></div>
          <IconChevron width={18} height={18} color="var(--ink-3)" />
        </button>
        <button className="list-item" onClick={onReplayIntro}>
          <div className="grow"><div className="t">서비스 소개 다시 보기</div></div>
          <IconChevron width={18} height={18} color="var(--ink-3)" />
        </button>
        <div className="list-item">
          <div className="grow"><div className="t">움직임 줄이기</div><div className="s">그래프가 갈라지는 애니메이션을 끄고 바로 보여줘요.</div></div>
          <Switch label="움직임 줄이기" checked={state.settings.reduceMotion} onChange={(v) => update((s) => ({ ...s, settings: { ...s.settings, reduceMotion: v } }))} />
        </div>
      </section>

      <section className="section"><DiscordPanel /></section>

      <section className="section">
        <div className="section-head"><h2>데이터</h2></div>
        <div className="card">
          <p className="small ink2" style={{ marginTop: 0 }}>로그인 없이 이 기기 브라우저에만 저장돼요. 서버에는 카드뉴스 생성에 필요한 모의 거래 정보(종목·수량·가격)만 보내요.</p>
          <div className="stack">
            {(Object.keys(SCOPES) as (keyof typeof SCOPES)[]).map((k) => (
              <button key={k} className="btn ghost block sm" style={{ color: k === 'all' ? 'var(--danger)' : undefined }} onClick={() => setReset(k)}>{SCOPES[k].title} 초기화</button>
            ))}
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>생활비 예측 데이터</h2></div>
        <SpendDataPanel />
      </section>

      <section className="section">
        <div className="section-head"><h2>계산·데이터 기준</h2></div>
        <div className="card small ink2">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>날짜별 잔고 = 전날 잔고 − 그날 지출 + 그날 수입. 같은 날은 지출을 먼저 빼요.</li>
            <li>매월 반복 날짜가 그 달에 없으면 말일로 계산해요.</li>
            <li>평행세계는 내가 고른 기록만, 기록마다 한 번씩 차이를 반영해요.</li>
            <li>생활비 범위·확률: 하루 생활비를 10%·50%·90% 값으로 예측하고, 생활비 경로 1,000개를 만들어 날짜별 잔고 범위와 잔고가 바닥날 확률을 계산해요. 기록이 3건 미만이면 입력한 하루 평균만 쓰고, 기록이 쌓일수록(30일이면 100%) 내 기록 비중이 커져요.</li>
            <li>사기 좋은 날: 바닥날 확률이 20% 이하가 되는 가장 이른 날을 추천해요.</li>
            <li>시세: 한국투자증권 Open API(키 설정 시 실시간 체결) → 네이버 금융 → Yahoo 지연 시세 순으로 자동 선택. 화면에 실제 출처와 기준 시각을 표시해요. 장 운영 09:00~15:30, KRX 휴장일 반영.</li>
            <li>모의투자는 수수료·세금을 반영하지 않아요.</li>
          </ul>
        </div>
      </section>

      {reset && (
        <ConfirmSheet
          title={`${SCOPES[reset].title}를 초기화할까요?`}
          body={SCOPES[reset].body}
          confirm="초기화"
          danger
          onClose={() => setReset(null)}
          onConfirm={() => {
            const scope = reset;
            setReset(null);
            update((s) => resetScope(s, scope));
            toast('초기화했어요');
            nav.reset();
          }}
        />
      )}
    </div>
  );
}

/** 재무 정보 수정: 잔고 새로 입력·일정·지켜둘 금액 */
export function FinanceEdit() {
  const { state, update } = useStore();
  const nav = useNav();
  const toast = useToast();
  const p = state.profile!;
  const today = todayKST();
  const [draft, setDraft] = useState<Profile>(p);
  const [newBalance, setNewBalance] = useState<number | undefined>(undefined);
  const [reflected, setReflected] = useState<string[]>([]);
  const incomes = draft.items.filter((i) => i.kind === 'income');
  const expenses = draft.items.filter((i) => i.kind === 'expense');
  const todayItems = draft.items.filter((i) => occurrences(i, today, today).length > 0);

  const save = () => {
    let next = { ...draft };
    let resetRecords = false;
    if (newBalance !== undefined) {
      next = { ...next, baseBalance: newBalance, baseDate: today, baseSetAt: Date.now(), reflectedOnBaseDate: reflected };
      resetRecords = true;
    }
    update((s) => ({
      ...s,
      profile: next,
      // 새 잔고에는 지금까지의 소비가 이미 들어 있으므로 수동 반영 설정을 자동 판단으로 되돌린다
      records: resetRecords ? s.records.map((r) => ({ ...r, reflectedOverride: null })) : s.records,
    }));
    toast('재무 정보를 저장했어요');
    nav.pop();
  };

  return (
    <div className="page no-nav has-cta">
      <TopBar onBack={nav.pop} title="재무 정보" center />
      <section className="card">
        <div className="small ink2">입력한 잔고</div>
        <div className="num bold" style={{ fontSize: 24 }}>{won(p.baseBalance)}</div>
        <div className="xs muted">{formatKDateTime(p.baseSetAt)} 입력</div>
        <div className="field">
          <span className="lab">지금 잔고 새로 입력</span>
          <AmountInput value={newBalance} onChange={setNewBalance} label="새 잔고" quick={[]} />
          <div className="hint">새로 입력하면 오늘이 기준일이 되고, 지금까지 기록한 소비는 새 잔고에 이미 포함된 것으로 봐요.</div>
        </div>
        {newBalance !== undefined && todayItems.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <div className="small bold">오늘 예정된 항목 중 이미 반영된 것</div>
            {todayItems.map((it) => (
              <div key={it.id} className="list-item">
                <div className="grow"><div className="t" style={{ fontSize: 15 }}>{it.name}</div><div className="s">{it.kind === 'income' ? '+' : '−'}{won(it.amount)}</div></div>
                <Switch label={`${it.name} 반영됨`} checked={reflected.includes(it.id)} onChange={(v) => setReflected(v ? [...reflected, it.id] : reflected.filter((x) => x !== it.id))} />
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="section">
        <div className="section-head"><h2>지켜둘 금액</h2></div>
        <div className="card"><AmountInput value={draft.minBalance} onChange={(v) => setDraft({ ...draft, minBalance: v ?? 0 })} label="지켜둘 금액" quick={[]} /></div>
      </section>

      <section className="section">
        <div className="section-head"><h2>하루 평균 생활비</h2></div>
        <div className="card">
          <AmountInput value={draft.dailySpend} onChange={(v) => setDraft({ ...draft, dailySpend: v || undefined })} label="하루 평균 생활비" quick={[10000, 15000, 20000]} />
          <div className="hint">밥·카페·교통처럼 그때그때 쓰는 돈. 월말 잔고를 범위와 확률로 볼 때 써요. 오늘 쓴 돈을 기록할수록 내 기록 비중이 커져요.</div>
        </div>
      </section>

      <section className="section">
        <div className="section-head"><h2>들어올 돈</h2></div>
        <ScheduleList kind="income" items={incomes} onChange={(items) => setDraft({ ...draft, items: [...items, ...expenses] })} />
        {incomes.length === 0 && <p className="small muted">등록된 수입이 없어요. 정해진 수입이 없다면 비워두세요.</p>}
      </section>

      <section className="section">
        <div className="section-head"><h2>나갈 돈</h2></div>
        <ScheduleList kind="expense" items={expenses} onChange={(items) => setDraft({ ...draft, items: [...incomes, ...items] })} />
      </section>

      <CtaBar><button className="btn primary block" onClick={save}>저장</button></CtaBar>
    </div>
  );
}
