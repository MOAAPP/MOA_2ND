import { useEffect, useMemo, useRef, useState } from 'react';
import { AiLines, AiMark, AiSourceNote } from '../components/Ai';
import { TopBar } from '../components/ui';
import { runAi, type AiSource } from '../lib/ai';
import { askContext } from '../lib/ai/context';
import { getAiStatus, askFinanceAgent } from '../lib/v4AiApi';
import { ASK_SUGGESTIONS } from '../lib/ai/example';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';
import { useSpending } from './Ledger';

type Msg = { id: number; who: 'me' | 'ai'; text: string; followUps?: string[]; source?: AiSource };

/** 모아 AI에게 물어보기 — 내 숫자를 근거로 답한다 */
export function AskAi({ initial }: { initial?: string }) {
  const nav = useNav();
  const { state } = useStore();
  const { all, today } = useSpending();
  const goal = state.profile?.goal ? { name: state.profile.goal.name, target: state.profile.goal.target, saved: state.profile.goal.saved } : null;
  const ctx = useMemo(() => askContext(state.worldWallet, all, today, goal), [state.worldWallet, all, today, goal]);
  const [msgs, setMsgs] = useState<Msg[]>([{ id: 0, who: 'ai', text: '안녕하세요, 모아예요. 이번 달 돈 쓰는 거, 모으는 거 뭐든 물어보세요. 앱에 있는 내 기록을 보고 답할게요.', followUps: ASK_SUGGESTIONS }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  const seq = useRef(1);

  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'end' }); }, [msgs, busy]);

  const ask = async (q: string) => {
    const question = q.trim();
    if (!question || busy) return;
    setMsgs((m) => [...m.map((x) => ({ ...x, followUps: undefined })), { id: seq.current++, who: 'me', text: question }]);
    setText('');
    setBusy(true);
    try {
      if (state.demo) {
        // Only canonical synthetic S01 data can be sent to this public demo
        // agent. Never send personal/private localStorage financial details.
        const status = await getAiStatus();
        if (!status.agent_configured) {
          setMsgs(m => [...m, { id: seq.current++, who: 'ai',
            text: '지금은 모아 AI 상담을 준비 중이에요. 홈의 결제일과 소비 여유 계산은 계속 확인할 수 있어요.' }]);
        } else {
          const answer = await askFinanceAgent('S01', '2026-11-04', question);
          const options = answer.search.routes.filter(route => route.hard_constraints_met).slice(0, 3);
          const explanation = options.length
            ? '입력한 조건을 금융 기록과 비교했어요.\\n' + options.map((route, i) =>
              `${i + 1}. ${route.label} — 구매액 ${route.purchase_amount.toLocaleString('ko-KR')}원, 예상 최저 잔액 ${route.minimum_balance.toLocaleString('ko-KR')}원`).join('\\n')
            : '입력한 조건을 모두 지킬 수 있는 선택을 찾지 못했어요. 구매 금액이나 날짜를 조정해 보세요.';
          const caveat = answer.search.confirmations_required.length
            ? '\\n확인할 점: ' + answer.search.confirmations_required.join(' · ')
            : '';
          setMsgs(m => [...m, { id: seq.current++, who: 'ai',
            text: explanation + caveat + '\\n가상 금융 분석이며 실제 거래나 투자 조언은 아니에요.',
            source: 'live' }]);
        }
      } else {
        const r = await runAi('ask', { question, context: ctx });
        setMsgs((m) => [...m, { id: seq.current++, who: 'ai', text: r.data.answer,
          followUps: r.data.followUps, source: r.source }]);
      }
    } catch {
      setMsgs(m => [...m, { id: seq.current++, who: 'ai',
        text: '지금은 금융 AI 상담에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.' }]);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { if (initial) void ask(initial); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  return (
    <div className="page no-nav ask-page">
      <TopBar onBack={nav.pop} title={<span className="ask-title"><AiMark label="" />모아 AI</span>} center />
      <div className="ask-log" aria-live="polite">
        {msgs.map((m) => (
          <div key={m.id} className={`ask-msg ${m.who}`}>
            <p>{m.text}</p>
            {m.source && <AiSourceNote source={m.source} />}
            {m.followUps && m.followUps.length > 0 && (
              <div className="ask-follow">{m.followUps.map((f) => <button key={f} type="button" onClick={() => void ask(f)}>{f}</button>)}</div>
            )}
          </div>
        ))}
        {busy && <div className="ask-msg ai"><AiLines n={2} /></div>}
        <div ref={end} />
      </div>
      <form className="ask-bar" onSubmit={(e) => { e.preventDefault(); void ask(text); }}>
        <input value={text} onChange={(e) => setText(e.target.value.slice(0, 200))} placeholder="돈 관련해서 물어보세요" aria-label="질문" enterKeyHint="send" />
        <button type="submit" disabled={!text.trim() || busy} aria-label="보내기">↑</button>
      </form>
    </div>
  );
}
