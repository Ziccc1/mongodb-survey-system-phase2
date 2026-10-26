import test from 'node:test';
import assert from 'node:assert/strict';
import {ObjectId} from 'mongodb';
import {randomUUID} from 'node:crypto';
import type {QuestionContent} from '@survey/shared';
import {phase2Harness} from './harness.js';
import {templateFixture} from './template-fixture.js';
import {assertPortsFree,assertListenersOwned} from '../runtime-listeners.js';

test('R1 real HTTP access gate precedes type/boundary/version/history errors; retained publication stays authorized',async t=>{
 const port=3231,origin=`http://localhost:${port}`,snapshots:unknown[]=[],h=await phase2Harness('access_review',{afterReportSnapshot:p=>{snapshots.push(p);}},origin),f=templateFixture(h),rows:unknown[]=[];
 const path=(q:{qid:string;vid:string},suffix='')=>`/question-statistics/${q.qid}/versions/${q.vid}${suffix}`;
 async function get(url:string,who=1){const r=await fetch(`http://127.0.0.1:${port}/api/v1${url}`,{headers:{cookie:h.cookies[who]}}),body=await r.json();rows.push({url,who,status:r.status,body});return {status:r.status,body};}
 try{
  assertPortsFree([port]);await h.user();await h.user();await h.user();await h.app.listen({host:'127.0.0.1',port});const listener=assertListenersOwned([{port,pid:process.pid}]);
  const contents:QuestionContent[]=[{type:'single',title:'私有单选',options:[{id:'a',label:'甲'},{id:'b',label:'乙'}]},{type:'multiple',title:'私有多选',options:[{id:'a',label:'甲'},{id:'b',label:'乙'}],validation:{}},{type:'text',title:'私有文本',validation:{}},{type:'number',title:'私有数字',validation:{integerOnly:false}}],formal=[];
  for(const c of contents)formal.push(await f.formal(0,c));
  await t.test('four types × three endpoints: private/nonexistent resources all404, no snapshot/detail read',async()=>{
   const start=snapshots.length,matrix=[];
   for(const q of formal)for(const suffix of ['','/answers','/distribution'])for(const resource of [q,{...q,vid:new ObjectId().toHexString()},{qid:new ObjectId().toHexString(),vid:new ObjectId().toHexString()}]){const out=await get(path(resource,suffix));matrix.push({type:q.content.type,suffix,existing:resource===q,status:out.status,code:out.body.error?.code});}
   for(const q of formal){const out=await get(path(q)+'?boundaries=10,0');matrix.push({type:q.content.type,suffix:'invalid-boundaries',status:out.status,code:out.body.error?.code});}
   h.saveEvidence('private-type-matrix',matrix);assert.ok(matrix.every(x=>x.status===404&&x.code==='NOT_FOUND'),JSON.stringify(matrix));assert.equal(snapshots.length,start);
  });
  await t.test('unrelated broken own publication and corrupt private version cannot precede denial',async()=>{
   const own=await f.formal(1),sid=await f.source([own.vid],1),snapshot=await h.db.collection('survey_versions').findOne({surveyId:new ObjectId(sid)});assert.ok(snapshot);
   // Fresh isolated negative snapshot, preserving the original immutable publication.
   await h.db.collection('survey_versions').insertOne({...snapshot!,_id:new ObjectId(),version:2,publicationRequestId:randomUUID(),definitionHash:'0'.repeat(64)});
   const item=await h.db.collection('question_items').findOne({_id:new ObjectId(formal[3].qid)}),version=await h.db.collection('question_versions').findOne({_id:new ObjectId(formal[3].vid)}),qid=new ObjectId(),vid=new ObjectId();
   await h.db.collection('question_items').insertOne({...item!,_id:qid,latestVersionId:vid,draft:null});await h.db.collection('question_versions').insertOne({...version!,_id:vid,questionId:qid,contentHash:'0'.repeat(64)});
   const before=await h.fingerprint(),start=snapshots.length,results=[];for(const q of [...formal,{qid:String(qid),vid:String(vid)}])for(const suffix of ['','/answers','/distribution'])results.push(await get(path(q,suffix)));
   h.saveEvidence('unrelated-corruption',results);assert.ok(results.every(r=>r.status===404&&r.body.error.code==='NOT_FOUND'),JSON.stringify(results));assert.equal(snapshots.length,start);assert.equal(await h.fingerprint(),before);
  });
  await t.test('authorized callers still receive supported business errors; no answers leak to source author',async()=>{
   const results=[];for(const q of formal){await f.share(q.qid,2);for(const suffix of ['','/answers','/distribution']){const r=await get(path(q,suffix),2),unsupported=suffix==='/answers'&&!['number','text'].includes(q.content.type)||suffix==='/distribution'&&q.content.type!=='number';assert.equal(r.status,unsupported?422:200,JSON.stringify(r));results.push(r);}}
   assert.equal((await get(path(formal[3])+'?boundaries=10,0',2)).status,400);h.saveEvidence('authorized-types',results);
  });
  await t.test('revocation keeps fixed publication summary/answers/distribution and rejects unreadable future versions',async()=>{
   const q=formal[3],sid=await f.source([q.vid],2),editor=await h.getSurvey(sid,2),sent=await f.post(`/public/surveys/${editor.publicId}/responses`,{publishedVersion:1,anonymous:true,answers:[{questionId:editor.draftDefinition.questions[0].id,type:'number',number:'5'}]},2);assert.equal(sent.r.statusCode,201,sent.r.body);
   const future=(await h.saveVersion(q.qid)).receipt.versionId!,grant=await h.db.collection('question_grants').findOne({questionId:new ObjectId(q.qid),recipientId:new ObjectId(h.userIds[2])}),item=await h.getQuestion(q.qid);
   assert.equal((await h.request('POST',`/questions/${q.qid}/shares/${grant!._id}/revocation`,{expectedRevision:item.revision,expectedGrantRevision:grant!.revision})).statusCode,200);
   const summary=await get(path(q)+'?boundaries=0,10',2),answers=await get(path(q,'/answers'),2),distribution=await get(path(q,'/distribution'),2);assert.equal(summary.status,200,JSON.stringify(summary));assert.equal(summary.body.data.average,'5');assert.deepEqual(summary.body.data.bins.map((b:any)=>b.count),[0,1,0]);assert.equal(answers.status,200);assert.equal(answers.body.data.items[0].value,'5');assert.equal(distribution.status,200);assert.deepEqual(distribution.body.data.items,[{value:'5',count:1}]);
   for(const suffix of ['','/answers','/distribution'])assert.equal((await get(path({...q,vid:future},suffix),2)).status,404);assert.equal((await h.request('GET',`/questions/${q.qid}/versions`,undefined,2)).statusCode,404);
   assert.equal((await get(path(q)+'?surveyIds='+sid,0)).status,404);
   // Destroying all publication acquisition facts is not permission to inspect unknown historical data.
   await h.db.collection('survey_question_bindings').deleteMany({surveyId:new ObjectId(sid),scope:'publication'});for(const suffix of ['','/answers','/distribution'])assert.equal((await get(path(q,suffix),2)).status,404);
   h.saveEvidence('retained-access',{summary,answers,distribution,unknownFutureDenied:true,allAcquisitionFactsMissing:'NOT_FOUND before history',listener});
  });
 }finally{h.saveEvidence('real-http',rows);await h.close();}
});
