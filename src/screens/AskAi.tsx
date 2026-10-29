import { useEffect, useMemo, useRef, useState } from 'react';
import { AiLines, AiMark, AiSourceNote } from '../components/Ai';
import { TopBar } from '../components/ui';
import { runAi, type AiSource } from '../lib/ai';
import { askContext } from '../lib/ai/context';
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
    const r = await runAi('ask', { question, context: ctx });
    setMsgs((m) => [...m, { id: seq.current++, who: 'ai', text: r.data.answer, followUps: r.data.followUps, source: r.source }]);
    setBusy(false);
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
