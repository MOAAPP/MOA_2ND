import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { APP_TODAY } from '../lib/store';
import { learning, type DailyQuiz, type LearningHistory, type LearningTopic, type LearningOverview } from '../lib/persistentLearning';
import './PersonalizedLearning.css';
const labels:Record<LearningTopic,string>={cashflow:'결제일·현금흐름',credit:'카드 청구',saving:'저축',investing:'투자',forecast:'지출 예측'};

export default function PersonalizedLearning({user='S01',day=APP_TODAY,expectedId,compact=false}:{user?:string;day?:string;expectedId?:string;compact?:boolean}){
  const [quiz,setQuiz]=useState<DailyQuiz|null>(null);
  const [history,setHistory]=useState<LearningHistory|null>(null);
  const [overview,setOverview]=useState<LearningOverview|null>(null);
  const [topics,setTopics]=useState<LearningTopic[]>([]);
  const [error,setError]=useState('');const [busy,setBusy]=useState(false);const [attempt,setAttempt]=useState(0);const [saved,setSaved]=useState(false);
  useEffect(()=>{let active=true;setQuiz(null);setError('');setSaved(false);
    setOverview(null);
    void Promise.all([learning.quiz(user,day),learning.interests(user,day),learning.history(user,day),learning.overview(user,day)])
      .then(([q,p,h,o])=>{if(!active)return;if(expectedId&&q.id!==expectedId)throw new Error('카드에 연결된 문제를 다시 확인해 주세요.');setQuiz(q);setTopics(p.topics);setHistory(h);setOverview(o);})
      .catch(e=>{if(active)setError(e instanceof Error?e.message:'학습 정보를 불러오지 못했어요.');});
    return()=>{active=false;};
  },[user,day,expectedId,attempt]);
  const answer=async(choice:number)=>{if(!quiz||quiz.answer_record||busy)return;setBusy(true);setError('');
    try{const result=await learning.answer(user,day,quiz.id,choice);setQuiz(result);const [h,o]=await Promise.all([learning.history(user,day),learning.overview(user,day)]);setHistory(h);setOverview(o);}
    catch(e){setError(e instanceof Error?e.message:'답안 저장에 실패했어요.');}finally{setBusy(false);}
  };
  return <section className="pl-card" aria-label="맞춤 금융 학습">
    <div className="pl-heading"><h2>오늘의 맞춤 금융 퀴즈</h2><small>{day}</small></div>
    <p className="pl-meta">합성 체험 {user} · 금융 관측 기준 2026-11-04</p>
    {error&&<div role="alert"><p>{error}</p><button onClick={()=>setAttempt(n=>n+1)}>다시 불러오기</button></div>}
    {!quiz&&!error&&<p role="status">관심사와 오답을 확인하고 있어요…</p>}
    {quiz&&<><small className="pl-meta">{quiz.source==='llm'?'실제 AI 문항 · '+quiz.model:'학습 이력 기반 문제 선택 · 규칙 기반'}{quiz.selection_reason==='recent_wrong_answer'?' · 미해결 오답 복습':''}</small>
      <p className="pl-meta">{quiz.selection_reason==='recent_wrong_answer'?'이전에 틀린 개념을 다시 확인하는 문제예요.':quiz.selection_reason==='user_interest'?'저장한 관심 분야에서 골랐어요.':'오늘의 금융 개념을 확인해 보세요.'}</p>
      <p className="pl-question">{quiz.question}</p>
      {!quiz.answer_record&&quiz.hint&&<details key={quiz.id}><summary>개념 힌트 보기</summary><p>{quiz.hint}</p></details>}
      <div className="pl-options" role="group" aria-label="금융 퀴즈 답변">
        {quiz.options.map((text,i)=><button key={i} disabled={busy||!!quiz.answer_record} aria-pressed={quiz.answer_record?.choice===i} onClick={()=>void answer(i)}>{String.fromCharCode(65+i)}. {text}</button>)}
      </div>
      {quiz.answer_record&&<div className="pl-feedback" role="status"><b>{quiz.answer_record.correct?'정답이에요':'오답을 다음 복습에 반영했어요'}</b><p>내 선택: {quiz.options[quiz.answer_record.choice]}</p>{quiz.correct_answer!==null&&<p>정답: {quiz.options[quiz.correct_answer]}</p>}<p>{quiz.answer_feedback?.text||quiz.explanation}</p>{!quiz.answer_record.correct&&<p>다음 새 문제부터 이 주제를 우선 복습해요. 오늘 문제와 답안은 그대로 보관해요.</p>}<small>{quiz.answer_feedback?.source==='llm'?'AI 해설 · '+quiz.answer_feedback.model:'기준 해설 · 실제 AI 응답 미사용'}</small></div>}
    </>}
    <details open={!compact}><summary>관심사·학습 기록</summary>
      {overview&&<><p>연속 학습 {overview.streak_days}일 · 복습할 주제 {overview.review_topic_count}개</p><ul>{overview.topics.filter(t=>t.attempt_count>0).map(t=><li key={t.topic}>{labels[t.topic]} · {t.correct_count}/{t.attempt_count} 정답{t.needs_review?' · 복습 필요 (다음 날부터)':''}</li>)}</ul><small>저장된 최근 퀴즈 90개 기준이에요. 정답 수는 개념 숙달을 보장하지 않아요.</small></>}
      <div className="pl-topics">{(Object.keys(labels) as LearningTopic[]).map(t=><button key={t} disabled={busy} aria-pressed={topics.includes(t)} onClick={()=>{setSaved(false);setTopics(old=>old.includes(t)?old.filter(x=>x!==t):[...old,t]);}}>{labels[t]}</button>)}</div>
      <button disabled={busy} onClick={async()=>{setBusy(true);try{await learning.save(user,day,topics);setSaved(true);}catch(e){setError(e instanceof Error?e.message:'저장하지 못했어요.');}finally{setBusy(false);}}}>관심사 저장</button>
      {saved&&<p role="status">저장했어요. 다음 새 문제부터 반영해요.</p>}
      {history&&<><p>풀이 {history.attempt_count}개 · 정답 {history.correct_count}개 · 오답 {history.wrong_count}개</p>{history.items.slice(0,5).map(item=><details key={item.id}><summary>{item.date} · {item.answer_record?.correct?'정답':'오답'}</summary><p>{item.question}</p><p>{item.answer_feedback?.text||item.explanation}</p></details>)}</>}
    </details>
    <Link className="pl-link" to="/cardnews">카드뉴스 4장 보기 →</Link>
  </section>;
}
