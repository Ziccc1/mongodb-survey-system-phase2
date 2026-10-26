import test from 'node:test';
import assert from 'node:assert/strict';
import {ObjectId} from 'mongodb';
import {randomUUID} from 'node:crypto';
import {phase2Harness} from './harness.js';
import {crossFixture} from './cross-fixture.js';
import {hash,readCursor} from '../../apps/api/src/core/common.js';
import {questionsFromStorage} from '../../apps/api/src/database/binding-integrity.js';
import {toBson} from '../../apps/api/src/question-codec.js';

test('W05 exact decimal, long-text/100-survey compact cursor, reauthorization and legacy corruption boundaries',async t=>{
 const h=await phase2Harness('cross_boundaries');
 try{
  const f=await crossFixture(h),age=f.formal[1],base=`/question-statistics/${age.questionId}/versions/${age.versionId}`;
  await t.test('hundred selected survey IDs and 10000-character text never enter cursor; scope order canonicalized',async()=>{
   const sample=(await h.db.collection('surveys').findOne({_id:new ObjectId(f.a)}))!,extra=[];
   for(let i=0;i<98;i++){const survey={...sample,_id:new ObjectId(),publicId:randomUUID(),usageNumber:randomUUID(),status:'draft',currentPublishedVersion:null,submissionCount:0,currentVersionSubmissionCount:0,questions:[]};extra.push(survey);}
   await h.db.collection('surveys').insertMany(extra);const ids=[f.a,f.b,...extra.map(x=>x._id.toHexString())],filter=ids.join(',');
   const first=await h.request('GET',base+'/answers?limit=1&surveyIds='+filter);assert.equal(first.statusCode,200,first.body);const cursor=first.json().data.nextCursor;assert.ok(cursor.length<2048);const next=await h.request('GET',base+'/answers?limit=1&surveyIds='+[...ids].reverse().join(',')+'&cursor='+encodeURIComponent(cursor));assert.equal(next.statusCode,200,next.body);
   const survey=await h.getSurvey(f.b),qs=survey.draftDefinition.questions;for(let i=0;i<2;i++){const r=await h.request('POST',`/public/surveys/${survey.publicId}/responses`,{publishedVersion:1,anonymous:true,answers:[{questionId:qs[0].id,type:'single',optionId:'go'},{questionId:qs[4].id,type:'text',text:'汉'.repeat(10000-i)}]},0,{'idempotency-key':randomUUID()});assert.equal(r.statusCode,201,r.body);}
   const text=f.formal[4],path=`/question-statistics/${text.questionId}/versions/${text.versionId}/answers?limit=1`,tx=await h.request('GET',path);assert.equal(tx.statusCode,200,tx.body);const c=tx.json().data.nextCursor;assert.ok(c.length<2048);assert.equal((await h.request('GET',path+'&cursor='+encodeURIComponent(c))).statusCode,200);
   await h.user();await h.db.collection('surveys').updateOne({_id:new ObjectId(f.a)},{$set:{ownerId:new ObjectId(h.userIds[1])}});assert.equal((await h.request('GET',base+'/answers?limit=1&surveyIds='+filter+'&cursor='+encodeURIComponent(cursor))).statusCode,404);await h.db.collection('surveys').updateOne({_id:new ObjectId(f.a)},{$set:{ownerId:new ObjectId(h.userIds[0])}});
   h.saveEvidence('cursor-capacity',{surveyScope:100,longTextCharacters:10000,numericCursorLength:cursor.length,textCursorLength:c.length,scopeOrderEquivalent:true,currentPermissionRechecked:true});
  });
  await t.test('Decimal128 mean exceeds JS integer precision, exact fractions and inclusive outer bins; invalid boundaries reject',async()=>{
   const q=await h.createQuestion({type:'number',title:'精确大数',validation:{integerOnly:false}}),v=await h.saveVersion(q.resourceId),s=await f.survey('大数精度',0,[{...age,questionId:q.resourceId,versionId:v.receipt.versionId!}]);await f.submit(s,'9007199254740993');await f.submit(s,'9007199254740995');const path=`/question-statistics/${q.resourceId}/versions/${v.receipt.versionId}`,r=await h.request('GET',path);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().data.average,'9007199254740994');
   const q2=await h.createQuestion({type:'number',title:'精确小数',validation:{integerOnly:false}}),v2=await h.saveVersion(q2.resourceId),s2=await f.survey('小数精度',0,[{...age,questionId:q2.resourceId,versionId:v2.receipt.versionId!}]);for(const value of ['-1','0','0.1','0.2','1','2'])await f.submit(s2,value);const p2=`/question-statistics/${q2.resourceId}/versions/${v2.receipt.versionId}`,out=await h.request('GET',p2+'?boundaries=0,1');assert.equal(out.statusCode,200,out.body);assert.deepEqual(out.json().data.bins.map((x:{count:number})=>x.count),[1,4,1]);
   for(const b of ['0','1,0','0,0','NaN,1',Array.from({length:22},(_,i)=>i).join(',')])assert.equal((await h.request('GET',p2+'?boundaries='+b)).statusCode,400);
   const zero=await h.createQuestion({type:'number',title:'无数值',validation:{integerOnly:false}}),zv=await h.saveVersion(zero.resourceId),zr=await h.request('GET',`/question-statistics/${zero.resourceId}/versions/${zv.receipt.versionId}`);assert.equal(zr.statusCode,200,zr.body);assert.deepEqual([zr.json().data.average,zr.json().data.min,zr.json().data.max],[null,null,null]);
   h.saveEvidence('decimal-boundaries',{largeMean:r.json().data.average,bins:out.json().data.bins});
  });
  await t.test('known legacy same-version multiplicity blocked without deleting snapshots; corrupt historical answers do not become unanswered',async()=>{
   const original=(await h.db.collection('surveys').findOne({_id:new ObjectId(f.a)}))!,snapshot=(await h.db.collection('survey_versions').findOne({surveyId:original._id,version:1}))!,version=(await h.db.collection('question_versions').findOne({_id:new ObjectId(age.versionId)}))!,item=(await h.db.collection('question_items').findOne({_id:new ObjectId(age.questionId)}))!;
   const qid=new ObjectId(),vid=new ObjectId(),sid=new ObjectId(),evidenceKey='P2-009/legacy-multiplicity';
   await h.db.collection('question_items').insertOne({...item,_id:qid,latestVersionId:vid,nextVersion:2,origin:{kind:'legacyImport',sourceQuestionId:null,sourceVersionId:null,evidenceKey},draft:{...item.draft,baseVersionId:vid}});
   await h.db.collection('question_versions').insertOne({...version,_id:vid,questionId:qid,operation:'legacyImport',evidenceKey,distributionSource:{kind:'unrecorded',sourceQuestionId:null,sourceVersionId:null},parentVersionId:null});
   const ageQuestion=questionsFromStorage(snapshot.definition.questions).find(x=>x.type==='number')!,questions=[{...ageQuestion,id:'legacy_a',jumpRules:[]},{...ageQuestion,id:'legacy_b',jumpRules:[]}],definition={title:'已证历史重复',description:'合成负例',questions},policy=snapshot.policySnapshot,definitionHash=hash({definition,policy});
   await h.db.collection('surveys').insertOne({...original,_id:sid,publicId:randomUUID(),usageNumber:randomUUID(),currentPublishedVersion:1,submissionCount:0,currentVersionSubmissionCount:0,questions:[]});
   const {_id,_bindingHash,...rest}=snapshot;delete rest.bindingHash;await h.db.collection('survey_versions').insertOne({...rest,_id:new ObjectId(),schemaVersion:1,surveyId:sid,definition:{...definition,questions:toBson(questions)},definitionHash});
   const old=(await h.db.collection('survey_question_bindings').findOne({surveyId:original._id,scope:'publication',questionVersionId:new ObjectId(age.versionId)}))!;
   for(const q of questions)await h.db.collection('survey_question_bindings').insertOne({...old,_id:new ObjectId(),surveyId:sid,instanceId:q.id,publicationVersion:1,snapshotHash:definitionHash,questionId:qid,questionVersionId:vid,mappingKind:'legacyImport',evidenceKey,authorization:{kind:'legacyImport',evidenceKey}});
   const before=await h.fingerprint(),bad=await h.request('GET',`/question-statistics/${qid}/versions/${vid}?surveyIds=${sid}`);assert.equal(bad.statusCode,503,bad.body);assert.match(bad.json().error.message,/legacyMultiplicity/);assert.equal(await h.fingerprint(),before);
   const response=(await h.db.collection('responses').findOne({surveyId:new ObjectId(f.b)}))!;await h.db.collection('responses').insertOne({...response,_id:new ObjectId(),requestId:randomUUID(),answers:[{questionId:'unknown',type:'text',text:'corrupt'}]});const corrupt=await h.request('GET',base+'?surveyIds='+f.b);assert.equal(corrupt.statusCode,503,corrupt.body);assert.equal(corrupt.json().error.code,'REPORT_DATA_INVALID');h.saveEvidence('bad-history',{multiplicityError:bad.json(),legacyUnchanged:true,corruptResponseError:corrupt.json()});
  });
 }finally{await h.close();}
});
