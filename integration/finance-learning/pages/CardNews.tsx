import { useCallback, useEffect, useState } from 'react';
import { PageHeader } from '../components/ui';
import PersonalizedLearning from '../components/PersonalizedLearning';
import { callDevice } from '../lib/api';
import { APP_TODAY } from '../lib/store';
type Job={id:string;kind:string;name:string;status:string;notice?:string;stage?:string;retryable?:boolean;error?:string;images:string[];titles:string[];summary:string;aiStatus:string;aiModel:string|null;learningUserId?:string;learningQuizId?:string;learningDate?:string;news:{title:string;source:string;link:string}[]};
export default function CardNews(){
  const [jobs,setJobs]=useState<Job[]>([]);const [busy,setBusy]=useState(false);const [error,setError]=useState('');
  const load=useCallback(async()=>{const r=await callDevice<{jobs:Job[]}>('/api/cardnews','GET');if(r.ok){setJobs(r.data.jobs);setError('');}else setError(r.error);},[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(!jobs.some(j=>j.status==='generating'||j.status==='sending'))return;const timer=setTimeout(()=>void load(),1500);return()=>clearTimeout(timer);},[jobs,load]);
  const generate=async()=>{setBusy(true);setError('');try{const r=await callDevice('/api/daily/preview','POST',{learningUserId:'S01',level:1});if(!r.ok)throw new Error(r.error);await load();}catch(e){setError(e instanceof Error?e.message:'생성에 실패했어요.');}finally{setBusy(false);}};
  return <div className="min-h-full"><PageHeader title="금융 카드뉴스" back/><main className="p-5 pb-28 max-w-xl mx-auto">
    <section className="pl-card"><h1 className="text-xl font-bold">오늘의 금융 카드뉴스</h1><p className="text-sm text-slate-500 my-3">요약과 PNG 4장으로 읽고 연결된 퀴즈로 복습해요. 앱 미리보기는 Discord로 전송하지 않아요.</p><button className="bg-[#5b5bf0] text-white rounded-xl px-4 py-3" disabled={busy} onClick={()=>void generate()}>{busy?'카드 4장을 만들고 있어요…':'오늘 카드 4장 만들기'}</button></section>
    {error&&<p role="alert">{error} <button onClick={()=>void load()}>다시 불러오기</button></p>}
    {jobs.map(job=><section className="pl-card" key={job.id}><h2 className="font-bold">{job.name}</h2>{job.notice&&<p className="text-xs text-slate-500">{job.notice}</p>}<p className="text-sm whitespace-pre-line my-3">{job.summary}</p><small>{job.aiStatus==='live'?'AI 설명 · '+job.aiModel:'기록·시세 기반 설명 · 실제 AI 응답 미사용'}</small>
      {job.error&&<div role="alert"><p>{job.error}</p><button disabled={busy||(job.stage==='send'&&!job.retryable)} onClick={async()=>{setBusy(true);const r=await callDevice('/api/cardnews/'+job.id+(job.stage==='send'?'/retry-send':'/regenerate'),'POST',{noPhoto:true});if(!r.ok)setError(r.error);await load();setBusy(false);}}>{job.stage==='send'?'전송 다시 시도':'사진 없이 다시 만들기'}</button></div>}
      <div className="flex overflow-x-auto gap-3 my-4 snap-x" aria-label="카드뉴스 4장">{job.images.map((src,i)=><a key={src} href={src} target="_blank" rel="noreferrer" className="w-[88%] shrink-0 snap-center"><img src={src} alt={(i+1)+'/4 '+(job.titles[i]||'금융 학습 카드')} className="rounded-2xl w-full"/></a>)}</div>
      {job.news.length>0&&<details><summary>뉴스 출처</summary>{job.news.map(n=><p key={n.link}><a href={n.link} target="_blank" rel="noreferrer">{n.source} · {n.title}</a></p>)}</details>}
      {job.learningQuizId&&<PersonalizedLearning user={job.learningUserId||'S01'} day={job.learningDate||APP_TODAY} expectedId={job.learningQuizId} compact/>}
    </section>)}
  </main></div>;
}
