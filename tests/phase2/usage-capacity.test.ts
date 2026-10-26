import test from 'node:test';
import assert from 'node:assert/strict';
import {ObjectId} from 'mongodb';
import {randomUUID} from 'node:crypto';
import {phase2Harness} from './harness.js';
import {hash} from '../../apps/api/src/core/common.js';
import {bindingHashOf} from '../../apps/api/src/database/binding-integrity.js';
import type {SurveyQuestionBindingDocument} from '../../apps/api/src/database/phase2-models.js';
test('actual schema-valid 1001-version usage fixture rejects overflow and allows a version-limited query',async()=>{
 const h=await phase2Harness('usage_capacity');
 try{
  const created=await h.createQuestion({type:'text',title:'使用容量夹具',validation:{}}),saved=await h.saveVersion(created.resourceId),qid=new ObjectId(created.resourceId),v1=await h.db.collection('question_versions').findOne({_id:new ObjectId(saved.receipt.versionId!)});
  const r=await h.request('POST','/surveys',{title:'容量边界问卷'});assert.equal(r.statusCode,201,r.body);const sid=new ObjectId(r.json().data.id),survey=await h.db.collection('surveys').findOne({_id:sid}),question={id:'instance',type:'text',title:'使用容量夹具',validation:{},required:false,jumpRules:[]},now=new Date();
  const versions=[],snapshots=[],bindings:SurveyQuestionBindingDocument[]=[];
  for(let n=1;n<=1001;n++){
   const vid=n===1?v1!._id:new ObjectId();if(n>1)versions.push({...v1!,_id:vid,version:n,parentVersionId:v1!._id});
   const definition={title:survey!.title,description:survey!.description,questions:[question]},policy={allowAnonymous:false,allowRepeat:false},definitionHash=hash({definition,policy});
   const b:SurveyQuestionBindingDocument={_id:new ObjectId(),schemaVersion:1,createdAt:now,surveyId:sid,ownerId:survey!.ownerId,instanceId:question.id,questionId:qid,questionVersionId:vid,contentHash:v1!.contentHash,scope:'publication',publicationVersion:n,snapshotHash:definitionHash,acquisitionId:new ObjectId(),acquiredAt:now,authorization:{kind:'owner'},mappingKind:'native',evidenceKey:null};bindings.push(b);
   snapshots.push({_id:new ObjectId(),schemaVersion:2,surveyId:sid,version:n,sourceDefinitionVersion:1,definition,policySnapshot:policy,definitionHash,bindingHash:bindingHashOf([b]),publishedAt:now,publishedBy:survey!.ownerId,publicationRequestId:`capacity-${n}`,publicationRequestHash:hash({expectedRevision:n,expectedDraftDefinitionVersion:1}),origin:{kind:'publication'}});
  }
  await h.db.collection('question_versions').insertMany(versions);await h.db.collection('survey_versions').insertMany(snapshots);await h.db.collection('survey_question_bindings').insertMany(bindings);
  await h.db.collection('question_items').updateOne({_id:qid},{$set:{latestVersionId:bindings.at(-1)!.questionVersionId,nextVersion:1002}});
  await h.db.collection('surveys').updateOne({_id:sid},{$set:{status:'paused',currentPublishedVersion:1001,firstPublishedAt:now,questions:[question]}});
  const before=await h.fingerprint(),tooLarge=await h.request('GET',`/questions/${qid}/usage`);assert.equal(tooLarge.statusCode,422,tooLarge.body);assert.equal(tooLarge.json().error.code,'USAGE_SCOPE_TOO_LARGE');
  const narrowed=await h.request('GET',`/questions/${qid}/usage?versionId=${saved.receipt.versionId}`);assert.equal(narrowed.statusCode,200,narrowed.body);assert.equal(narrowed.json().data.items.length,1);assert.equal(narrowed.json().data.items[0].versions.length,1);assert.equal(narrowed.json().data.items[0].onlyHistorical,true);assert.equal(await h.fingerprint(),before);
  h.saveEvidence('usage-capacity',{fixture:'explicit synthetic storage fixture, not 1001 claimed UI operations',versions:1001,overflow:{status:tooLarge.statusCode,response:tooLarge.json()},limited:{status:narrowed.statusCode,response:narrowed.json()},fingerprintBefore:before,fingerprintAfter:await h.fingerprint()});
 }finally{await h.close();}
});
