import { LESSON_BY_ID, stepsFor } from '../../shared/curriculum';
import { IconCheck } from '../components/Icons';
import { IconTile } from '../components/Glyph';
import { LessonVisual } from '../components/LessonVisual';
import { CtaBar, Empty, TopBar } from '../components/ui';
import { useNav } from '../state/nav';
import { useStore } from '../state/store';

/** 잠금·XP 없이 원하는 주제만 골라 읽는 금융 콘텐츠. */
export function GuideArticle({ id }: { id: string }) {
  const nav=useNav();
  const {state,update}=useStore();
  const lesson=LESSON_BY_ID[id];
  if(!lesson)return <div className="page no-nav"><TopBar title="금융 가이드" onBack={nav.pop}/><Empty title="콘텐츠를 찾지 못했어요"/></div>;
  const concepts=stepsFor(lesson,state.level??1).filter((v)=>v.kind==='concept');
  const read=state.learning.guideReads?.includes(id) || Boolean(state.learning.completed[id]);
  const finish=()=>{
    update(s=>({...s, learning:{...s.learning,guideReads:[...new Set([...(s.learning.guideReads??[]),id])]}}));
    nav.pop();
  };
  return <div className="page no-nav has-cta guide-article-page">
    <TopBar title="금융 가이드" onBack={nav.pop}/>
    <div className="article-kicker">{lesson.unit}번째 주제 · 약 {lesson.minutes}분 {read?'· 읽은 콘텐츠':''}</div>
    <h1 className="article-title">{lesson.title}</h1>
    <p className="article-intro">{lesson.goal}</p>
    <div className="article-art" aria-hidden><IconTile name="chart" tone="blue" size={75}/><span>알아두면 좋은 금융 상식</span></div>
    {concepts.map((step,i)=>step.kind==='concept' && <section className="article-section" key={i}>
      <div className="article-step">{String(i+1).padStart(2,'0')}</div>
      <h2>{step.title}</h2>
      {step.visual && <div className="article-visual"><LessonVisual k={step.visual}/></div>}
      {step.body.map((line,k)=><p key={k}>{line}</p>)}
      {step.example && <div className="article-example"><b>이렇게 생각하면 쉬워요</b><p>{step.example}</p></div>}
    </section>)}
    <div className="article-footer-tip"><IconCheck width={18}/>이 콘텐츠는 정보 제공 및 금융 학습을 위한 자료예요.</div>
    <CtaBar><button className="btn primary block" onClick={finish}>읽었어요 <span aria-hidden>✓</span></button></CtaBar>
  </div>;
}
