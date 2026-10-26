import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ObjectId,Timestamp} from 'mongodb';
import {MongoClient,testMongoOptions} from '../database-client.js';
import {phase2Harness} from './harness.js';
import {crossFixture} from './cross-fixture.js';
import {readCursor,signCursor,hash} from '../../apps/api/src/core/common.js';
import type {FaultHooks} from '../../apps/api/src/core/common.js';

test('W05 real four-type cross statistics, retained permissions, exact snapshot pages and zero-write reads',async t=>{
 const commands:unknown[]=[];const faults:FaultHooks={reportCommand:p=>{if(p.readConcern)commands.push(p);}},h=await phase2Harness('cross_statistics',faults);let f:Awaited<ReturnType<typeof crossFixture>>;
 try{
  await h.user();f=await crossFixture(h);const age=f.formal[1],base=`/question-statistics/${age.questionId}/versions/${age.versionId}`;
  const get=async(path:string,who=0)=>{const r=await h.request('GET',path,undefined,who);assert.equal(r.statusCode,200,r.body);return r.json().data;};
  await t.test('T20 hand oracle, four types, exact bins/zero options and old per-release coexist',async()=>{
   const fork=await h.request('POST',`/question-versions/${age.versionId}/forks`,{content:age.content},0,{'idempotency-key':randomUUID()});assert.equal(fork.statusCode,201,fork.body);
   const derived={...age,questionId:fork.json().data.resourceId,versionId:fork.json().data.versionId},derivedSurvey=await f.survey('派生排除C',0,[derived]);await f.submit(derivedSurvey,'99');
   const newer=await h.saveVersion(age.questionId),newerSurvey=await f.survey('其他版本排除',0,[{...age,versionId:newer.receipt.versionId!}]);await f.submit(newerSurvey,'88');
   const before=await h.fingerprint(),r=await get(base+'?boundaries=0,18,30,121');assert.deepEqual([r.surveyCount,r.eligibleResponseCount,r.answeredCount,r.skippedCount,r.unansweredCount],[2,5,4,1,0]);assert.deepEqual([r.average,r.min,r.max],['15','0','30']);assert.deepEqual(r.bins.map((b:{count:number})=>b.count),[0,2,1,1,0]);
   for(const [i,counts] of [[2,[2,1,0]],[3,[2,2,0]]] as const){const q=f.formal[i],s=await get(`/question-statistics/${q.questionId}/versions/${q.versionId}`);assert.equal(s.answeredCount,3);assert.deepEqual(s.optionCounts.map((o:{count:number})=>o.count),counts);if(i===3)assert.ok(s.optionCounts.slice(0,2).every((o:{percentage:string})=>o.percentage.startsWith('66.666')));}
   const text=f.formal[4],tx=await get(`/question-statistics/${text.questionId}/versions/${text.versionId}`);assert.equal(tx.answeredCount,2);const old=await get(`/surveys/${f.a}/statistics?version=1`);assert.equal(old.questionSummaries.find((q:{type:string})=>q.type==='number').average,'5');assert.equal(await h.fingerprint(),before);
   h.saveEvidence('hand-oracle',{actual:r,expected:{mean:'15',eligible:5,answered:4,skipped:1,bins:[0,2,1,1,0]},zeroWriteFingerprint:before});
  });
  await t.test('real atClusterTime pages exclude writes accepted earlier but committed after page1; numeric order and scope',async()=>{
   const accepted=new Date(0),e=await h.getSurvey(f.b),existing=await h.db.collection('responses').findOne({surveyId:new ObjectId(f.b),'answers.type':'number'});assert.ok(existing);
   const client=new MongoClient(h.config.uri,testMongoOptions());await client.connect();const session=client.startSession();session.startTransaction({readConcern:{level:'snapshot'},writeConcern:{w:'majority'}});
   const late={...existing!,_id:new ObjectId(),requestId:randomUUID(),submittedAt:accepted};await client.db(h.config.dbName).collection('responses').insertOne(late,{session});await client.db(h.config.dbName).collection('surveys').updateOne({_id:new ObjectId(f.b)},{$inc:{submissionCount:1,currentVersionSubmissionCount:1}},{session});
   try{
    const first=await get(base+'/answers?limit=1');assert.ok(first.nextCursor);await session.commitTransaction();let cursor=first.nextCursor,items=[...first.items];while(cursor){const next=await get(base+'/answers?limit=1&cursor='+encodeURIComponent(cursor));items.push(...next.items);cursor=next.nextCursor;}
    assert.equal(items.length,4);assert.equal(new Set(items.map(x=>x.responseId+':'+x.instanceId)).size,4);assert.ok(!items.some(x=>x.responseId===late._id.toHexString()));assert.ok(items.every(x=>Object.keys(x).sort().join(',')==='instanceId,publishedVersion,responseId,submittedAt,surveyId,value'));
    const fresh=await get(base+'/answers?limit=100');assert.equal(fresh.items.length,5);
    const scope={actorId:h.userIds[0],endpoint:'crossStatistics/answers',questionId:age.questionId,versionId:age.versionId,surveyIdsHash:hash(null),sort:'submittedAt_desc_responseId_desc_instanceId_desc'};
    const state=readCursor(first.nextCursor,scope,h.config.cursorSecret) as Record<string,unknown>;assert.ok((state.at as {t:number}).t>0);
    const chosen=new Timestamp(state.at as {t:number;i:number}),actual=commands as {readConcern:{atClusterTime?:Timestamp};transaction:boolean}[];
    assert.ok(actual.filter(c=>!c.transaction&&c.readConcern.atClusterTime?.equals(chosen)).length>4,'actual nontransactional commands pin the selected Timestamp');
    h.saveEvidence('snapshot-pages',{first,items,freshCount:fresh.items.length,lateAcceptedAt:accepted.toISOString(),lateResponseId:late._id.toHexString(),state,actualReadCommands:commands});
    const expired=signCursor(scope,{...state,expires:Date.now()-1},h.config.cursorSecret);const ex=await h.request('GET',base+'/answers?cursor='+encodeURIComponent(expired));assert.equal(ex.statusCode,409);assert.equal(ex.json().error.code,'REPORT_SNAPSHOT_EXPIRED');assert.equal(ex.json().error.details[0].reloadRequired,true);
    const tooOld=signCursor(scope,{...state,at:{t:1,i:1},expires:Date.now()+300000},h.config.cursorSecret);const old=await h.request('GET',base+'/answers?cursor='+encodeURIComponent(tooOld));assert.equal(old.statusCode,409,old.body);assert.equal(old.json().error.code,'REPORT_SNAPSHOT_EXPIRED');
    assert.equal((await h.request('GET',base+'/distribution?cursor='+encodeURIComponent(first.nextCursor))).statusCode,400);assert.equal((await h.request('GET',base+'/answers?surveyIds='+f.a+'&cursor='+encodeURIComponent(first.nextCursor))).statusCode,400);assert.equal((await h.request('GET',base+'/answers?cursor='+encodeURIComponent(first.nextCursor),undefined,1)).statusCode,400);
   }finally{if(session.inTransaction())await session.abortTransaction();await session.endSession();await client.close();}
  });
  await t.test('unanswered, actual repeats vs key replay, no data and exact Decimal numeric frequency 0/2/10',async()=>{
   const submission=await f.submit(f.b,null);const again=await h.request('POST',`/public/surveys/${submission.publicId}/responses`,submission.body,0,{'idempotency-key':submission.key});assert.equal(again.statusCode,200,again.body);
   await f.submit(f.b,'10');for(const value of ['2','1','1.0','1e0'])await f.submit(f.b,value);
   const r=await get(base);assert.equal(r.eligibleResponseCount,r.answeredCount+r.skippedCount+r.unansweredCount);assert.equal(r.unansweredCount,1);assert.equal(r.skippedCount,1);
   const frequencies=[];let cursor:string|null=null;do{const r=await get(base+'/distribution?limit=1'+(cursor?'&cursor='+encodeURIComponent(cursor):''));frequencies.push(...r.items);cursor=r.nextCursor;}while(cursor);assert.deepEqual(frequencies.map(x=>x.value),['0','1','2','10','20','30']);assert.equal(frequencies.find(x=>x.value==='1').count,3);
   const q=await h.createQuestion({type:'single',title:'无数据',options:[{id:'a',label:'甲'},{id:'b',label:'乙'}]}),v=await h.saveVersion(q.resourceId);const zero=await get(`/question-statistics/${q.resourceId}/versions/${v.receipt.versionId}`);assert.equal(zero.eligibleResponseCount,0);assert.deepEqual(zero.optionCounts.map((x:{percentage:null;count:number})=>[x.count,x.percentage]),[[0,null],[0,null]]);
   h.saveEvidence('frequency',{actual:frequencies,summary:r});
  });
  await t.test('owner-only scope; share revocation retains own published statistics; unrelated corruption excluded; relevant mappings fail',async()=>{
   const ownQ=await h.getQuestion(age.questionId),grant=await h.request('PUT',`/questions/${age.questionId}/shares`,{username:h.usernames[1],expectedRevision:ownQ.revision,expectedGrantRevision:null});assert.equal(grant.statusCode,200,grant.body);
   const other=await f.survey('他人D',1,[age]);await f.submit(other,'100',false,1);
   // Establish a second publication while the share is active; it remains an independent access fact.
   await f.survey('另一份完整的存量授权证据',1,[age]);
   assert.equal((await h.request('GET',base+'?surveyIds='+other)).statusCode,404);
   let item=await h.getQuestion(age.questionId);assert.equal((await h.request('POST',`/questions/${age.questionId}/shares/${grant.json().data.id}/revocation`,{expectedRevision:item.revision,expectedGrantRevision:0})).statusCode,200);
   const retained=await get(base+'?surveyIds='+other,1);assert.equal(retained.average,'100');assert.equal(retained.surveyCount,1);assert.equal((await h.request('GET',base+'?surveyIds='+f.a,undefined,1)).statusCode,404);
   const scopeBefore=await get(base+'?surveyIds='+f.a);const otherBinding=await h.db.collection('survey_question_bindings').findOne({surveyId:new ObjectId(other),scope:'publication'});await h.db.collection('survey_question_bindings').deleteMany({surveyId:new ObjectId(other),scope:'publication'});
   assert.deepEqual((await get(base+'?surveyIds='+f.a)).average,scopeBefore.average);assert.equal((await h.request('GET',base,undefined,1)).statusCode,503);
   const before=await h.fingerprint();const p=await h.request('GET',base+'?surveyIds='+f.a+'&surveyIds='+f.b);assert.equal(p.statusCode,400);assert.equal((await h.request('POST',base,{})).statusCode,405);assert.equal(await h.fingerprint(),before);
   await h.db.collection('survey_question_bindings').deleteMany({surveyId:new ObjectId(f.a),scope:'publication',publicationVersion:1});const bad=await h.request('GET',base+'?surveyIds='+f.a);assert.equal(bad.statusCode,503,bad.body);assert.equal(bad.json().error.code,'QUESTION_MAPPING_INCOMPLETE');
   h.saveEvidence('permissions',{revokedRetained:retained,otherScopeDenied:true,unrelatedBrokenSurveyExcluded:true,relevantMissingWholeGroupBlocked:true,retainedOtherBinding:!!otherBinding});
  });
 }finally{await h.close();}
});
