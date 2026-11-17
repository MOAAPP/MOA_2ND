import { learningRequest } from '../../../shared/learningClient';
import type { DailyQuiz, LearningHistory, LearningTopic } from '../../../src/lib/v4AiApi';
export type { DailyQuiz, LearningHistory, LearningTopic };
export type LearningOverview={streak_days:number;attempt_count:number;correct_count:number;review_topic_count:number;topics:{topic:LearningTopic;attempt_count:number;correct_count:number;needs_review:boolean;next_review_date:string|null;guide:string}[]};
const request = <T>(path:string, body?:unknown) => learningRequest<T>('/api/v4',path,body===undefined?{}:{method:'POST',body:JSON.stringify(body)});
const path=(user:string,day:string,suffix:string)=>'/users/'+encodeURIComponent(user)+'/'+suffix+'?day='+encodeURIComponent(day);
export const learning={
  quiz:(user:string,day:string)=>request<DailyQuiz>(path(user,day,'daily-quiz')),
  answer:(user:string,day:string,id:string,choice:number)=>request<DailyQuiz>(path(user,day,'daily-quiz/answer'),{quiz_id:id,choice}),
  interests:(user:string,day:string)=>request<{topics:LearningTopic[]}>(path(user,day,'learning-interests')),
  save:(user:string,day:string,topics:LearningTopic[])=>request(path(user,day,'learning-interests'),{topics}),
  history:(user:string,day:string)=>request<LearningHistory>(path(user,day,'learning-history')),
  overview:(user:string,day:string)=>request<LearningOverview>(path(user,day,'learning-overview')),
};
