import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {QuestionContent} from '@survey/shared';
import type {phase2Harness} from './harness.js';
export type TemplateHarness=Awaited<ReturnType<typeof phase2Harness>>;
export const textContent:QuestionContent={type:'text',title:'作者原创内容',validation:{}};
export function templateFixture(h:TemplateHarness){
 async function post(path:string,body:object,who=0,key=randomUUID()){return {r:await h.request('POST',path,body,who,{'idempotency-key':key}),path,body,key,who};}
 async function formal(who=0,content:QuestionContent=textContent){const q=await h.createQuestion(content,who),v=await h.saveVersion(q.resourceId,who);return {qid:q.resourceId,vid:v.receipt.versionId!,content,owner:who};}
 async function share(qid:string,publisher:number,owner=0){const q=await h.getQuestion(qid,owner),r=await h.request('PUT',`/questions/${qid}/shares`,{expectedRevision:q.revision,expectedGrantRevision:null,username:h.usernames[publisher]},owner);assert.equal(r.statusCode,200,r.body);return r.json().data;}
 async function grant(qid:string,vid:string,publisher:number,owner=0,expectedGrantRevision:number|null=null){const q=await h.getQuestion(qid,owner),r=await h.request('PUT',`/questions/${qid}/distribution-grants`,{expectedRevision:q.revision,expectedGrantRevision,questionVersionId:vid,username:h.usernames[publisher]},owner);assert.equal(r.statusCode,200,r.body);return r.json().data;}
 async function revoke(qid:string,g:{id:string;revision:number},owner=0){const q=await h.getQuestion(qid,owner),r=await h.request('POST',`/questions/${qid}/distribution-grants/${g.id}/revocation`,{expectedRevision:q.revision,expectedGrantRevision:g.revision},owner);assert.equal(r.statusCode,200,r.body);return r.json().data;}
 async function draft(who=0,title='固定模板源'){const r=await h.request('POST','/surveys',{title,allowAnonymous:true,allowRepeat:true},who);assert.equal(r.statusCode,201,r.body);return r.json().data.id as string;}
 async function attach(sid:string,vid:string,who=0){const s=await h.getSurvey(sid,who),x=await post(`/surveys/${sid}/question-references`,{expectedRevision:s.revision,position:s.draftDefinition.questions.length,questionVersionId:vid},who);assert.equal(x.r.statusCode,200,x.r.body);return x.r.json().data;}
 async function publish(sid:string,who=0){const e=await h.getSurvey(sid,who),r=await h.request('POST',`/surveys/${sid}/publish`,{expectedRevision:e.revision,expectedDraftDefinitionVersion:e.draftDefinitionRevision},who,{'publication-key':randomUUID()});assert.equal(r.statusCode,201,r.body);return r.json().data;}
 async function source(vids:string[],who=0){const sid=await draft(who);for(const v of vids)await attach(sid,v,who);await publish(sid,who);return sid;}
 async function create(sid:string,who=0,version=1){const s=await h.getSurvey(sid,who);return post('/templates',{surveyId:sid,publishedVersion:version,expectedSurveyRevision:s.revision},who);}
 async function template(vids:string[],who=0){const sid=await source(vids,who),x=await create(sid,who);assert.equal(x.r.statusCode,201,x.r.body);return {sid,tid:x.r.json().data.resourceId as string,created:x};}
 async function adopt(tid:string,who=0,revision=0,key=randomUUID()){return post(`/templates/${tid}/adoptions`,{expectedTemplateRevision:revision},who,key);}
 async function state(tid:string,listed:boolean,revision:number,who=0){return h.request('POST',`/templates/${tid}/${listed?'listing':'unlisting'}`,{expectedRevision:revision},who);}
 async function fork(vid:string,who=0,content:QuestionContent=textContent,sourceInstance?:{surveyId:string;instanceId:string}){return post(`/question-versions/${vid}/forks`,{content,...sourceInstance?{sourceInstance}:{}},who);}
 return {post,formal,share,grant,revoke,draft,attach,publish,source,create,template,adopt,state,fork};
}
