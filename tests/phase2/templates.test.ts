import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Collection,ObjectId,MongoError} from 'mongodb';
import {phase2Harness} from './harness.js';
import {templateFixture,textContent} from './template-fixture.js';
import type {FaultHooks} from '../../apps/api/src/core/common.js';
import {openPhase2Context} from '../../apps/api/src/database/phase2-context.js';
test('W06 exact grants, fixed publications, adoption, retained rights, historical receipts and HTTP guards',async t=>{
 const faults:FaultHooks={},h=await phase2Harness('templates',faults),f=templateFixture(h);let root:Awaited<ReturnType<typeof f.formal>>,tid='',sid='',g:any,created:any,adopted:any,consumer='';
 try{
  await h.user();await h.user();await h.user();
  await t.test('private share is insufficient; grant is exact version and exact publisher; original self is implicit',async()=>{
   root=await f.formal(0,{type:'single',title:'固定题干',options:[{id:'a',label:'甲'},{id:'b',label:'乙'}]});await f.share(root.qid,1);sid=await f.source([root.vid],1);
   let x=await f.create(sid,1);assert.equal(x.r.statusCode,403,x.r.body);assert.equal(x.r.json().error.code,'PUBLIC_DISTRIBUTION_REQUIRED');
   g=await f.grant(root.qid,root.vid,1);created=await f.create(sid,1);assert.equal(created.r.statusCode,201,created.r.body);tid=created.r.json().data.resourceId;
   const self=await f.template([root.vid]);assert.ok(self.tid);
   const q=await h.getQuestion(root.qid);assert.equal((await h.request('PUT',`/questions/${root.qid}/draft`,{expectedRevision:q.revision,content:{...root.content,title:'未来第二版'},baseVersionId:root.vid})).statusCode,200);const v2=(await h.saveVersion(root.qid)).receipt.versionId!;
   const newer=await f.source([v2],1);x=await f.create(newer,1);assert.equal(x.r.statusCode,403,x.r.body);
   await f.share(root.qid,2);const other=await f.source([root.vid],2);assert.equal((await f.create(other,2)).r.statusCode,403);
   const preview=await h.request('GET',`/templates/${tid}`,undefined,2);assert.equal(preview.statusCode,200,preview.body);assert.equal(preview.json().data.questions[0].title,'固定题干');assert.deepEqual(Object.keys(preview.json().data).sort(),['id','title','description','revision','status','eligible','questions','sources'].sort());
   for(const field of ['sourceSurveyId','publisherId','distributionProof','grantId','answers','statistics','requestId','publicId'])assert.ok(!preview.body.includes('"'+field+'"'),field);
  });
  await t.test('new independent instances/defaults; same key concurrent one effect and management revision unchanged',async()=>{
   const key=randomUUID(),before=await h.db.collection('surveys').countDocuments(),pair=await Promise.all([f.adopt(tid,2,0,key),f.adopt(tid,2,0,key)]);assert.deepEqual(pair.map(x=>x.r.statusCode).sort(),[200,201]);assert.equal(pair[0].r.json().data.surveyId,pair[1].r.json().data.surveyId);assert.equal(await h.db.collection('surveys').countDocuments(),before+1);
   adopted=pair.find(x=>x.r.statusCode===201)!;consumer=adopted.r.json().data.surveyId;const e=await h.getSurvey(consumer,2),s=await h.db.collection('surveys').findOne({_id:new ObjectId(consumer)}),template=await h.db.collection('survey_templates').findOne({_id:new ObjectId(tid)});
   assert.equal(s!.schemaVersion,3);assert.equal(s!.allowAnonymous,false);assert.equal(s!.allowRepeat,false);assert.equal(s!.expiresAt,null);assert.equal(s!.currentPublishedVersion,null);assert.equal(s!.submissionCount,0);assert.equal(s!.revision,0);assert.notEqual(s!.publicId,(await h.getSurvey(sid,1)).publicId);assert.notEqual(e.draftDefinition.questions[0].id,template!.questions[0].id);assert.deepEqual((e.draftDefinition.questions[0] as any).options,[{id:'a',label:'甲'},{id:'b',label:'乙'}]);assert.equal(template!.revision,0);assert.equal(template!.accessFence,1);
   const pairs=await Promise.all([f.adopt(tid,2),f.adopt(tid,3)]);assert.deepEqual(pairs.map(x=>x.r.statusCode),[201,201]);const after=await h.db.collection('survey_templates').findOne({_id:template!._id});assert.equal(after!.revision,0);assert.equal(after!.accessFence,3);assert.deepEqual(after!.updatedAt,template!.updatedAt);assert.equal(after!.contentHash,template!.contentHash);
  });
  await t.test('config preserves identity; narrow right cannot expose history or attach/copy/general fork',async()=>{
   let e=await h.getSurvey(consumer,2);e.draftDefinition.questions[0].required=true;assert.equal((await h.request('PUT',`/surveys/${consumer}/questions`,{expectedRevision:e.revision,questions:e.draftDefinition.questions},2)).statusCode,200);const b=await h.db.collection('survey_question_bindings').findOne({surveyId:new ObjectId(consumer),scope:'draft'});assert.ok(b!.questionVersionId.equals(new ObjectId(root.vid)));assert.equal(b!.authorization.kind,'template');
   assert.equal((await h.request('GET',`/questions/${root.qid}/versions`,undefined,3)).statusCode,404);assert.equal((await f.fork(root.vid,3)).r.statusCode,404);
   const other=await f.draft(3);const r=await f.post(`/surveys/${other}/question-references`,{expectedRevision:0,position:0,questionVersionId:root.vid},3);assert.equal(r.r.statusCode,404);
   for(const sourceInstance of [{surveyId:consumer,instanceId:b!.instanceId},{surveyId:other,instanceId:b!.instanceId}])assert.equal((await f.fork(root.vid,3,textContent,sourceInstance)).r.statusCode,404);
   const copy=await h.request('POST',`/surveys/${consumer}/copy`,{expectedRevision:1},3);assert.equal(copy.statusCode,404,copy.body);assert.equal((await h.request('POST',`/surveys/${consumer}/copy`,{expectedRevision:1},2)).statusCode,501);
  });
  await t.test('both real template operations confirm labelled unknown commit from immutable receipts without repeating business',async()=>{
   const own=await f.formal(),sid=await f.source([own.vid]),editor=await h.getSurvey(sid),context=await openPhase2Context(h.config),actor=context.forActor(new ObjectId(h.userIds[0]));let calls=0;
   const labelled=()=>{const e=new MongoError('synthetic UnknownTransactionCommitResult after actual commit');e.addErrorLabel('UnknownTransactionCommitResult');throw e;};
   try{
    const created=await actor.execute({operation:'createTemplate',path:{},body:{surveyId:sid,publishedVersion:1,expectedSurveyRevision:editor.revision},requestKey:randomUUID()},async(s,p)=>{calls++;return actor.templates.create(p.body,s);},{afterCommit:labelled});assert.equal(created.data.replayed,true);assert.equal(calls,1);
    const tid=created.data.resourceId,adopt=await actor.execute({operation:'adoptTemplate',path:{templateId:tid},body:{expectedTemplateRevision:0},requestKey:randomUUID()},async(s,p)=>{calls++;return actor.templates.adopt(tid,p.body,s);},{afterCommit:labelled});assert.equal(adopt.data.replayed,true);assert.equal(calls,2);
    const before=await h.fingerprint();await assert.rejects(actor.execute({operation:'adoptTemplate',path:{templateId:tid},body:{expectedTemplateRevision:0},requestKey:randomUUID()},(s,p)=>actor.templates.adopt(tid,p.body,s),{afterReceipt:labelled}),(e:any)=>e.code==='OPERATION_OUTCOME_UNKNOWN');assert.equal(await h.fingerprint(),before);h.saveEvidence('unknown-template-commit',{syntheticErrorLabels:true,realNetworkFailure:false,actualCommittedOperations:2,businessCallbacks:2,receiptConfirmed:true,unconfirmedRolledBack:true});
   }finally{await context.close();}
  });
  await t.test('revoke/unlist stop future use; retained draft publishes, answers and forks; regrant same ID restores eligibility',async()=>{
   const revoked=await f.revoke(root.qid,g);let x=await f.adopt(tid,3);assert.equal(x.r.statusCode,403,x.r.body);assert.equal((await h.request('GET',`/templates/${tid}`,undefined,3)).statusCode,409);
   const mine=await h.request('GET','/templates?scope=mine',undefined,1);assert.equal(mine.json().data.items.find((x:any)=>x.id===tid).eligible,false);
   assert.equal((await f.state(tid,false,0,1)).statusCode,200);assert.equal((await f.state(tid,false,1,1)).json().data.revision,1);assert.equal((await f.state(tid,true,1,1)).statusCode,403);
   await f.publish(consumer,2);let e=await h.getSurvey(consumer,2);const answer=await f.post(`/public/surveys/${e.publicId}/responses`,{publishedVersion:1,anonymous:false,answers:[{questionId:e.draftDefinition.questions[0].id,type:'single',optionId:'a'}]},3);assert.equal(answer.r.statusCode,201,answer.r.body);
   const statistics=await h.request('GET',`/question-statistics/${root.qid}/versions/${root.vid}?surveyIds=${consumer}`,undefined,2);assert.equal(statistics.statusCode,200,statistics.body);assert.equal(statistics.json().data.answeredCount,1);assert.equal((await h.request('GET',`/surveys/${consumer}/statistics`,undefined,1)).statusCode,404);
   e=await h.getSurvey(consumer,2);assert.equal((await h.request('POST',`/surveys/${consumer}/pause`,{expectedRevision:e.revision},2)).statusCode,200);e=await h.getSurvey(consumer,2);
   x=await f.fork(root.vid,2,{...root.content,title:'接收者显式修改'}, {surveyId:consumer,instanceId:e.draftDefinition.questions[0].id});assert.equal(x.r.statusCode,201,x.r.body);const own=x.r.json().data;
   const replace=await f.post(`/surveys/${consumer}/questions/${e.draftDefinition.questions[0].id}/replacement`,{expectedRevision:e.revision,questionVersionId:own.versionId},2);assert.equal(replace.r.statusCode,200,replace.r.body);await f.publish(consumer,2);assert.equal((await f.create(consumer,2,2)).r.statusCode,403);
   const grantAgain=await f.grant(root.qid,root.vid,1,0,revoked.revision);assert.equal(grantAgain.id,g.id);assert.equal(grantAgain.revision,2);g=grantAgain;
   assert.equal((await f.state(tid,true,1,1)).statusCode,200);assert.equal((await f.state(tid,true,2,1)).json().data.revision,2);assert.equal((await f.adopt(tid,3,0)).r.statusCode,409);assert.equal((await f.adopt(tid,3,2)).r.statusCode,201);
   const original=await h.db.collection('survey_templates').findOne({_id:new ObjectId(tid)});assert.equal(original!.bindings[0].distributionProof.obligations[0].grantRevision,0);assert.equal(original!.contentHash,(await h.db.collection('survey_templates').findOne({_id:original!._id}))!.contentHash);
  });
  await t.test('both remaining full receipts replay with zero resource reads after state/content changes; mismatched body conflicts',async()=>{
   assert.equal((await f.state(tid,false,2,1)).statusCode,200);await f.revoke(root.qid,g);const fingerprint=await h.fingerprint(),old=Collection.prototype.findOne;
   Collection.prototype.findOne=function(...args:Parameters<typeof old>){if(!['users','operation_receipts'].includes(this.collectionName))throw Error('Replay touched current resource');return old.apply(this,args);};
   try{for(const row of [created,adopted]){const r=await h.request('POST',row.path,row.body,row.who,{'idempotency-key':row.key});assert.equal(r.statusCode,200,r.body);assert.deepEqual(r.json().data,{...row.r.json().data,replayed:true});}}finally{Collection.prototype.findOne=old;}
   assert.equal(await h.fingerprint(),fingerprint);assert.equal((await h.request('POST',adopted.path,{...adopted.body,title:'不同正文'},adopted.who,{'idempotency-key':adopted.key})).statusCode,409);
  });
  await t.test('strict HTTP/query/405/auth/CSRF and transactional rollback on intermediate faults',async()=>{
   assert.equal((await h.request('GET','/templates?scope=square&scope=mine')).statusCode,400);assert.equal((await h.request('GET','/templates?unknown=1')).statusCode,400);assert.equal((await h.request('DELETE',`/templates/${tid}`)).statusCode,405);assert.equal((await h.request('GET','/templates',undefined,-1)).statusCode,401);assert.equal((await h.request('POST',`/templates/${tid}/listing`,{expectedRevision:3},1,{'x-csrf-guard':''})).statusCode,403);
   assert.equal((await h.request('POST','/templates',{surveyId:sid,publishedVersion:1,expectedSurveyRevision:0,questions:[]},1,{'idempotency-key':randomUUID()})).statusCode,400);
   const own=await f.formal(),s=await f.source([own.vid]);let fingerprint=await h.fingerprint();faults.afterTemplateInsert=()=>{throw Error('synthetic after template insert');};assert.equal((await f.create(s)).r.statusCode,500);assert.equal(await h.fingerprint(),fingerprint);delete faults.afterTemplateInsert;
   const x=await f.create(s);assert.equal(x.r.statusCode,201,x.r.body);const id=x.r.json().data.resourceId;
   for(const hook of ['afterTemplateSurveyInsert','afterTemplateBindingsInsert'] as const){fingerprint=await h.fingerprint();faults[hook]=()=>{throw Error('synthetic '+hook);};assert.equal((await f.adopt(id,3)).r.statusCode,500);assert.equal(await h.fingerprint(),fingerprint);delete faults[hook];}
  });
  h.saveEvidence('w06-contracts',{exactVersionPublisher:true,historicalReceipts:2,retainedRights:true,grantsNonTransferable:true,concurrentAdoption:true,rollback:true});
 }finally{await h.close();}
});
