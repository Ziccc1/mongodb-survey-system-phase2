import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import type {Answer,QuestionContent} from '@survey/shared';
import type {phase2Harness} from './harness.js';
export async function crossFixture(h:Awaited<ReturnType<typeof phase2Harness>>){
 const contents:QuestionContent[]=[{type:'single',title:'路线',options:[{id:'go',label:'回答年龄'},{id:'skip',label:'跳过年龄'}]},{type:'number',title:'年龄',validation:{integerOnly:false}},{type:'single',title:'单选统计',options:[{id:'a',label:'甲'},{id:'b',label:'乙'},{id:'c',label:'丙'}]},{type:'multiple',title:'多选统计',options:[{id:'a',label:'甲'},{id:'b',label:'乙'},{id:'c',label:'丙'}],validation:{}},{type:'text',title:'文本统计',validation:{}}];
 const formal=[];for(const content of contents){const q=await h.createQuestion(content),v=await h.saveVersion(q.resourceId);formal.push({questionId:q.resourceId,versionId:v.receipt.versionId!,content});}
 async function survey(title:string,who=0,versions=formal){const r=await h.request('POST','/surveys',{title,allowAnonymous:true,allowRepeat:true},who);assert.equal(r.statusCode,201,r.body);const sid=r.json().data.id;
  for(const v of versions){const e=await h.getSurvey(sid,who),x=await h.request('POST',`/surveys/${sid}/question-references`,{expectedRevision:e.revision,questionVersionId:v.versionId,position:e.draftDefinition.questions.length},who,{'idempotency-key':randomUUID()});assert.equal(x.statusCode,200,x.body);}
  let e=await h.getSurvey(sid,who);const qs=e.draftDefinition.questions;if(qs.length===5){qs[0].jumpRules=[{id:'skip_age',condition:{op:'eq',optionId:'skip'},targetQuestionId:qs[2].id}];assert.equal((await h.request('PUT',`/surveys/${sid}/questions`,{expectedRevision:e.revision,questions:qs},who)).statusCode,200);}
  await publish(sid,who);return sid;
 }
 async function publish(sid:string,who=0){const e=await h.getSurvey(sid,who),r=await h.request('POST',`/surveys/${sid}/publish`,{expectedRevision:e.revision,expectedDraftDefinitionVersion:e.draftDefinitionRevision},who,{'publication-key':randomUUID()});assert.equal(r.statusCode,201,r.body);}
 async function submit(sid:string,age:string|null,extra=false,who=0,key=randomUUID(),skip=false){const e=await h.getSurvey(sid,who),qs=e.draftDefinition.questions,answers:Answer[]=[];
  if(qs.length===5){answers.push({questionId:qs[0].id,type:'single',optionId:skip?'skip':'go'});if(age!==null)answers.push({questionId:qs[1].id,type:'number',number:age});if(extra){const n=age==='20'?1:0;answers.push({questionId:qs[2].id,type:'single',optionId:n?'b':'a'},{questionId:qs[3].id,type:'multiple',optionIds:age==='0'?['a','b']:age==='10'?['b']:['a']});if(age!=='20')answers.push({questionId:qs[4].id,type:'text',text:age==='0'?'😀汉':'第二条'});}}
  else if(age!==null)answers.push({questionId:qs[0].id,type:'number',number:age});
  const body={publishedVersion:e.currentPublishedVersion,anonymous:true,answers},r=await h.request('POST',`/public/surveys/${e.publicId}/responses`,body,who,{'idempotency-key':key});assert.equal(r.statusCode,201,r.body);return {body,key,publicId:e.publicId,data:r.json().data};
 }
 const a=await survey('本人A'),b=await survey('本人B');await submit(a,'0',true);await submit(a,'10',true);
 let e=await h.getSurvey(a);assert.equal((await h.request('POST',`/surveys/${a}/pause`,{expectedRevision:e.revision})).statusCode,200);e=await h.getSurvey(a);const qs=e.draftDefinition.questions;qs[1].required=false;qs[4].required=false;assert.equal((await h.request('PUT',`/surveys/${a}/questions`,{expectedRevision:e.revision,questions:qs})).statusCode,200);await publish(a);await submit(a,'20',true);await submit(b,'30');await submit(b,null,false,0,randomUUID(),true);
 return {formal,a,b,survey,publish,submit};
}
