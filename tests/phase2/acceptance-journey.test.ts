import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {BSON,ObjectId} from 'mongodb';
import {phase2Harness} from './harness.js';
import {templateFixture} from './template-fixture.js';
import {assertPortsFree,assertListenersOwned} from '../runtime-listeners.js';

test('acceptance: four actors traverse versions, sharing, replacement, templates, revocation and isolated statistics',async t=>{
 const port=3233,origin=`http://localhost:${port}`,h=await phase2Harness('accept_journey',{},origin),f=templateFixture(h),http:unknown[]=[];
 const freeze=(d:object)=>Buffer.from(BSON.serialize(d)).toString('base64');
 async function wire(method:string,path:string,body?:object,who=0,key=randomUUID()){
  const r=await fetch(`http://127.0.0.1:${port}/api/v1${path}`,{method,headers:{cookie:h.cookies[who],origin,'x-csrf-guard':'1','content-type':'application/json','idempotency-key':key},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)}),data=await r.json();
  http.push({method,path,who,status:r.status,response:data});return {status:r.status,data:data.data,error:data.error};
 }
 async function ok(method:string,path:string,body?:object,who=0,status=200){const r=await wire(method,path,body,who);assert.equal(r.status,status,JSON.stringify(r));return r.data;}
 async function pause(sid:string,who:number){const e=await h.getSurvey(sid,who);await ok('POST',`/surveys/${sid}/pause`,{expectedRevision:e.revision},who);}
 async function answer(sid:string,who:number,value:string,anonymous=true,owner=who){const editor=await h.getSurvey(sid,owner),definition=await ok('GET',`/public/surveys/${editor.publicId}`,undefined,who),key=randomUUID(),body={publishedVersion:definition.publishedVersion,anonymous,answers:[{questionId:definition.questions[0].id,type:'number',number:value}]};const r=await wire('POST',`/public/surveys/${editor.publicId}/responses`,body,who,key);assert.equal(r.status,201,JSON.stringify(r));return {path:`/public/surveys/${editor.publicId}/responses`,body,key,data:r.data};}
 let root:Awaited<ReturnType<typeof f.formal>>,share:any,source='',other='',v2='',v3='',tid='',consumer='',firstAnswer:any,oldSnapshot='',oldResponse='',distribution:any;
 try{
  assertPortsFree([port]);for(let i=0;i<3;i++)await h.user();await h.app.listen({host:'127.0.0.1',port});assertListenersOwned([{port,pid:process.pid}]);
  await t.test('formal question enters a bank and two shared surveys; answers retain exact source',async()=>{
   root=await f.formal(0,{type:'number',title:'旅程数字v1',validation:{min:'0',max:'100',integerOnly:true}});
   const bank=await ok('POST','/question-banks',{name:'验收旅程题库'},0,201);await ok('PUT',`/question-banks/${bank.resourceId}/members/${root.qid}`,{expectedRevision:0,present:true});
   share=await f.share(root.qid,1);source=await f.source([root.vid],1);other=await f.source([root.vid],1);
   firstAnswer=await answer(source,1,'10');await answer(other,1,'30');
   oldSnapshot=freeze((await h.db.collection('survey_versions').findOne({surveyId:new ObjectId(source),version:1}))!);oldResponse=freeze((await h.db.collection('responses').findOne({_id:new ObjectId(firstAnswer.data.receiptId)}))!);
   const s=await ok('GET',`/question-statistics/${root.qid}/versions/${root.vid}`,undefined,1);assert.deepEqual([s.surveyCount,s.answeredCount,s.average],[2,2,'20']);
  });
  await t.test('new version only prompts; explicit paused replacement separates old/new statistics',async()=>{
   const q=await h.getQuestion(root.qid);await ok('PUT',`/questions/${root.qid}/draft`,{expectedRevision:q.revision,baseVersionId:root.vid,content:{...root.content,title:'旅程数字v2'}});v2=(await h.saveVersion(root.qid)).receipt.versionId!;
   assert.equal((await h.getSurvey(source,1)).draftDefinition.questions[0].title,'旅程数字v1');
   const notices=await ok('GET',`/surveys/${source}/question-updates`,undefined,1);assert.ok(JSON.stringify(notices).includes(v2));
   await pause(source,1);const e=await h.getSurvey(source,1);await ok('POST',`/surveys/${source}/questions/${e.draftDefinition.questions[0].id}/replacement`,{expectedRevision:e.revision,questionVersionId:v2},1);await f.publish(source,1);await answer(source,1,'90');
   const v1Stats=await ok('GET',`/question-statistics/${root.qid}/versions/${root.vid}`,undefined,1),v2Stats=await ok('GET',`/question-statistics/${root.qid}/versions/${v2}`,undefined,1);assert.deepEqual([v1Stats.answeredCount,v1Stats.average,v2Stats.answeredCount,v2Stats.average],[2,'20',1,'90']);
   const old=await ok('GET',`/surveys/${source}/statistics?version=1`,undefined,1);assert.equal(old.questionSummaries[0].average,'10');
  });
  await t.test('template fixes v2; new adopter has narrow rights and independent answers',async()=>{
   distribution=await f.grant(root.qid,v2,1);const made=await f.create(source,1,2);assert.equal(made.r.statusCode,201,made.r.body);tid=made.r.json().data.resourceId;
   const adopted=await ok('POST',`/templates/${tid}/adoptions`,{expectedTemplateRevision:0},2,201);consumer=adopted.surveyId;await f.publish(consumer,2);await answer(consumer,2,'50',false);
   assert.equal((await wire('GET',`/questions/${root.qid}/versions`,undefined,2)).status,404);
   const stats=await ok('GET',`/question-statistics/${root.qid}/versions/${v2}`,undefined,2);assert.deepEqual([stats.surveyCount,stats.answeredCount,stats.average],[1,1,'50']);
   assert.equal((await wire('GET',`/surveys/${consumer}/statistics`,undefined,0)).status,404);
   const usage=await ok('GET',`/questions/${root.qid}/usage`),row=usage.items.find((x:any)=>x.username===h.usernames[2]);assert.ok(row);assert.deepEqual(Object.keys(row).sort(),['surveyNumber','versions','isDraft','isCurrent','onlyHistorical','username'].sort());
  });
  await t.test('both revocations block new rights while old publications, data and original receipts survive',async()=>{
   const q=await h.getQuestion(root.qid);await ok('POST',`/questions/${root.qid}/shares/${share.id}/revocation`,{expectedRevision:q.revision,expectedGrantRevision:share.revision});await f.revoke(root.qid,distribution);
   assert.equal((await wire('POST',`/templates/${tid}/adoptions`,{expectedTemplateRevision:0},3)).status,403);
   const fresh=await f.draft(1);const attach=await wire('POST',`/surveys/${fresh}/question-references`,{expectedRevision:0,position:0,questionVersionId:v2},1);assert.equal(attach.status,409);assert.equal(attach.error.code,'SOURCE_ACCESS_REVOKED');
   await answer(consumer,3,'70',false,2);const stats=await ok('GET',`/question-statistics/${root.qid}/versions/${v2}?boundaries=0,60,100`,undefined,2);assert.deepEqual([stats.answeredCount,stats.average],[2,'60']);assert.deepEqual(stats.bins.map((x:any)=>x.count),[0,1,1,0]);
   const before=await h.fingerprint(),replay=await wire('POST',firstAnswer.path,firstAnswer.body,1,firstAnswer.key);assert.equal(replay.status,200);assert.deepEqual(replay.data,{...firstAnswer.data,replayed:true});assert.equal(await h.fingerprint(),before);
  });
  await t.test('restoration creates v3 without rewriting pending draft, history or retained access',async()=>{
   const q=await h.getQuestion(root.qid);await ok('PUT',`/questions/${root.qid}/draft`,{expectedRevision:q.revision,baseVersionId:v2,content:{...root.content,title:'待保存草稿'}});const pending=await h.getQuestion(root.qid);
   const restored=await ok('POST',`/questions/${root.qid}/restorations`,{expectedRevision:pending.revision,sourceVersionId:root.vid},0,201);v3=restored.versionId;assert.deepEqual((await h.getQuestion(root.qid)).draft,pending.draft);
   const restoredVersion=await ok('GET',`/questions/${root.qid}/versions/${v3}`);assert.deepEqual([restoredVersion.version,restoredVersion.restoredFromVersionId],[3,root.vid]);assert.equal((await wire('GET',`/question-statistics/${root.qid}/versions/${v3}`,undefined,1)).status,404);
   assert.equal(freeze((await h.db.collection('survey_versions').findOne({surveyId:new ObjectId(source),version:1}))!),oldSnapshot);assert.equal(freeze((await h.db.collection('responses').findOne({_id:new ObjectId(firstAnswer.data.receiptId)}))!),oldResponse);
   const own=await ok('GET',`/question-statistics/${root.qid}/versions/${v2}`,undefined,1);assert.deepEqual([own.surveyCount,own.answeredCount,own.average],[1,1,'90']);
   h.saveEvidence('journey-result',{actors:4,root,versions:[root.vid,v2,v3],source,other,template:tid,consumer,originalSnapshotUnchanged:true,originalAnswerUnchanged:true,pendingDraftPreserved:true,authorCannotReadOthersAnswers:true});
  });
 }finally{h.saveEvidence('real-http',http);await h.close();}
});
