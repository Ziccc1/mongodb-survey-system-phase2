import test from 'node:test';
import assert from 'node:assert/strict';
import {ObjectId,BSON,Long} from 'mongodb';
import {MongoClient,testMongoOptions} from './database-client.js';
import {writeFileSync,readFileSync,unlinkSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {createMigrationRun,openMigrationRun} from '../apps/api/src/database/phase2-migration.js';
import {initialize} from '../apps/api/src/database/initialize.js';
import {schemas,indexSpecs} from '../apps/api/src/database/schema.js';
import {assertOwnedDatabaseInstance,verifyConnectedDatabaseInstance} from '../apps/api/src/database/instance-ownership.js';
import {hashPassword} from '../apps/api/src/security.js';
import {hash} from '../apps/api/src/core/common.js';
import {toBson} from '../apps/api/src/question-codec.js';
import {storedAnswers} from '../apps/api/src/core/submission.js';
import {evaluateAnswers,normalizeQuestions} from '@survey/shared';
import type {Question} from '@survey/shared';
import {evidenceDirectory} from './runtime-environment.js';
const uri='mongodb://localhost:27019/?replicaSet=rs0';
const fingerprint=async(db:ReturnType<MongoClient['db']>)=>{
 const rows=[];for(const c of await db.listCollections({},{nameOnly:false}).toArray())rows.push({name:c.name,options:c.options,indexes:await db.collection(c.name).indexes(),docs:(await db.collection(c.name).find().sort({_id:1}).toArray()).map(d=>Buffer.from(BSON.serialize(d)).toString('base64'))});
 return hash(rows.sort((a,b)=>a.name.localeCompare(b.name)));
};
test('W02-C nonempty BSON backup / actual restore / fixed plan / interrupted apply and DB-fact recovery',async()=>{
 const directory=evidenceDirectory('migration'),manifest=createMigrationRun(),owned=assertOwnedDatabaseInstance(),client=new MongoClient(uri,{...testMongoOptions(),promoteLongs:false});
 await client.connect();await verifyConnectedDatabaseInstance(client,owned);
 const source=client.db(manifest.source),now=new Date(),owner=new ObjectId(),respondent=new ObjectId();
 const evidence:Record<string,unknown>={manifest,checks:[]};
 try{
  await initialize(source);const passwordHash=await hashPassword(randomUUID());
  await source.collection('users').insertMany([owner,respondent].map((id,i)=>({_id:id,schemaVersion:1,username:`migrate_${i}`,usernameKey:`migrate_${i}`,passwordHash,createdAt:now,updatedAt:now})));
  const questions:Question[]=[{id:'age',type:'number',title:'年龄😀',validation:{min:'-1e1',max:'120',integerOnly:false},required:true,jumpRules:[]},
   {id:'single',type:'single',title:'选择',options:[{id:'a',label:'是'},{id:'b',label:'否'}],required:false,jumpRules:[]},
   {id:'multi',type:'multiple',title:'多选',options:[{id:'a',label:'甲'},{id:'b',label:'乙'}],validation:{minChoices:0,maxChoices:2},required:false,jumpRules:[]},
   {id:'text',type:'text',title:'备注',validation:{maxLength:100},required:false,jumpRules:[]}];
  questions.push({...structuredClone(questions[3]),id:'text_copy'}); // Similar historical Content is retained, never merged by text.
  const surveys=[];
  for(let i=0;i<2;i++){
   const survey={_id:new ObjectId(),schemaVersion:2,ownerId:owner,publicId:randomUUID(),title:`历史卷${i}`,description:'有历史、答卷及未正式草稿',status:'paused',allowAnonymous:true,allowRepeat:true,expiresAt:null,definitionVersion:5,revision:7,structureLocked:true,submissionCount:3,currentPublishedVersion:3,currentVersionSubmissionCount:1,questions:toBson([...questions,{id:'local',type:'text',title:'未发布的新题',required:false,validation:{},jumpRules:[]}]),copiedFromId:null,firstPublishedAt:now,createdAt:now,updatedAt:now};
   surveys.push(survey);await source.collection('surveys').insertOne(survey);
   for(let v=1;v<=3;v++){
    const qs=normalizeQuestions(structuredClone(questions));if(v===2)qs[0].required=false;if(v===3)qs[0].title='更新后的年龄😀';
    const definition={title:survey.title,description:survey.description,questions:qs},policy={allowAnonymous:true,allowRepeat:true};
    await source.collection('survey_versions').insertOne({_id:new ObjectId(),schemaVersion:1,surveyId:survey._id,version:v,sourceDefinitionVersion:v,definition:{...definition,questions:toBson(qs)},policySnapshot:policy,definitionHash:hash({definition,policy}),publishedAt:now,publishedBy:owner,publicationRequestId:`old-publish-${v}`,publicationRequestHash:hash({expectedRevision:v,expectedDraftDefinitionVersion:v}),origin:{kind:'publication'}});
    const answers=evaluateAnswers(qs,[{questionId:'age',type:'number',number:v===1?'0':v===2?'-1.25':'1e1'}]).answers;
    await source.collection('responses').insertOne({_id:new ObjectId(),schemaVersion:2,surveyId:survey._id,surveyDefinitionVersion:v,respondentId:respondent,anonymous:true,repeatAllowed:true,payloadHashVersion:2,requestId:`old-submit-${v}`,payloadHash:hash({publishedVersion:v,anonymous:true,answers}),answers:storedAnswers(answers),submittedAt:now});
   }
  }
  // Actual safe BSON long preserved in a non-hash survey field.
  await source.collection('surveys').updateOne({_id:surveys[0]._id},{$set:{revision:Long.fromNumber(7)}});
  const before=await fingerprint(source),run=await openMigrationRun(manifest.runId);
  try{
   const inspected=await run.inspect();assert.deepEqual(inspected.blocked,[]);evidence.inspect=inspected;
   evidence.backup=await run.backup();evidence.restore=await run.restore(manifest.applicationTest);await run.restore(manifest.restore);
   const target=client.db(manifest.applicationTest),targetBefore=await fingerprint(target);
   const p=await run.dryRun(manifest.applicationTest),again=await run.dryRun(manifest.applicationTest);
   assert.equal(p.planId,again.planId);assert.deepEqual(p,again);assert.equal(await fingerprint(target),targetBefore);assert.equal(await fingerprint(source),before);
   assert.equal(p.batches.length,2);assert.equal(p.batches[0].items.length,5);assert.equal(p.batches[0].versions.length,6); // Config-only change does not create Content version.
   assert.ok(p.rows.every(r=>r.planId===p.planId&&r.sourceHash===p.sourceHash&&r.targetId instanceof ObjectId&&r.evidenceKey));
   assert.ok(p.batches.every(b=>b.audit.some(a=>a.startsWith('LEGACY_SIMILAR_CONTENT_MULTIPLICITY:'))));
   assert.notEqual(p.batches[0].items[0]._id.toHexString(),p.batches[1].items[0]._id.toHexString());
   assert.ok(p.batches.every(b=>b.versions.every(v=>v.parentVersionId===null&&v.distributionSource.kind==='unrecorded')));
   assert.ok(p.batches.every(b=>b.audit.includes('local:LOCAL_UNFORMALIZED_DRAFT')));
   await assert.rejects(run.apply(manifest.applicationTest,{afterSurveyCommit(n){if(n===1)throw Error('injected after actual commit before journal');}}),/injected/);
   const journal=resolve(run.directory,`journal-${manifest.applicationTest}.jsonl`);if(readFileSafe(journal))unlinkSync(journal);
   const recovered=await run.apply(manifest.applicationTest);assert.equal(recovered.skipped,1);assert.equal(recovered.committed,1);
   evidence.recovery=recovered;evidence.verify=await run.verify(manifest.applicationTest);
   const after=await fingerprint(target),repeat=await run.apply(manifest.applicationTest);assert.equal(repeat.skipped,2);assert.equal(repeat.committed,0);assert.equal(await fingerprint(target),after);assert.equal(await fingerprint(source),before);
   evidence.repeat=repeat;evidence.sourceBefore=before;evidence.sourceAfter=await fingerprint(source);evidence.targetAfter=after;
   // Independently exercise target collision blocking on the other actual restored copy.
   await run.dryRun(manifest.restore);await run.apply(manifest.restore);await run.verify(manifest.restore);
   const conflicting=client.db(manifest.restore),item=await conflicting.collection('question_items').findOne();
   await conflicting.collection('question_items').updateOne({_id:item!._id},{$inc:{revision:1}});
   const conflictBefore=await fingerprint(conflicting);
   await assert.rejects(run.apply(manifest.restore),/TARGET_ROW_CONFLICT/);
   assert.equal(await fingerprint(conflicting),conflictBefore);evidence.targetConflict={target:manifest.restore,blocked:true,unchanged:true};
   await assert.rejects(run.restore('project2_app_v1'),/TARGET_REJECTED/);
   await assert.rejects(run.apply('project2_app_v2'),/TARGET_REJECTED/);
   // Detect source drift, without overwriting a fixed plan or target.
   await source.collection('surveys').updateOne({_id:surveys[0]._id},{$set:{title:'合成源漂移负例'}});
   await assert.rejects(run.apply(manifest.applicationTest),/SOURCE_HASH_CONFLICT/);assert.equal(await fingerprint(target),after);
   // This is an explicitly retained bad fixture; no real source was touched.
   evidence.sourceDriftBlocked=true;
  }finally{await run.close();}
  const bad=createMigrationRun(),badDb=client.db(bad.source);await initialize(badDb);
  const broken={...surveys[0],_id:new ObjectId(),publicId:randomUUID(),currentPublishedVersion:1,submissionCount:0,currentVersionSubmissionCount:0};await badDb.collection('surveys').insertOne(broken);
  const badRun=await openMigrationRun(bad.runId);try{const b=await fingerprint(badDb),result=await badRun.inspect();assert.ok(result.blocked.some(x=>x.includes('CURRENT_SNAPSHOT_MISSING')));assert.equal(await fingerprint(badDb),b);evidence.badSource={database:bad.source,blocked:result.blocked,unchanged:true};}finally{await badRun.close();}
  const unknown=createMigrationRun(),unknownDb=client.db(unknown.source);
  // A fresh fixture has a precise unsupported format9 validator, never a weakened existing validator or arbitrary object.
  for(const [name,schema] of Object.entries(schemas)){
   const strict=name==='surveys'?{...schema,properties:{...schema.properties,schemaVersion:{bsonType:'int',enum:[9]}}}:schema;
   await unknownDb.createCollection(name,{validator:{$jsonSchema:strict},validationLevel:'strict',validationAction:'error'});
   for(const {key,...spec} of indexSpecs[name])await unknownDb.collection(name).createIndex(key,spec);
  }
  await unknownDb.collection('surveys').insertOne({...surveys[0],_id:new ObjectId(),publicId:randomUUID(),schemaVersion:9});
  const unknownRun=await openMigrationRun(unknown.runId);try{const before=await fingerprint(unknownDb),result=await unknownRun.inspect();assert.ok(result.blocked.includes('surveys:UNKNOWN_FIELDS_OR_FORMAT'));const plan=await unknownRun.dryRun(unknown.applicationTest);assert.ok(plan.blocked.length);await assert.rejects(unknownRun.apply(unknown.applicationTest),/PLAN_BLOCKED/);assert.equal(await fingerprint(unknownDb),before);assert.equal((await client.db(unknown.applicationTest).listCollections().toArray()).length,0);evidence.unknownSource={database:unknown.source,blocked:plan.blocked,sourceUnchanged:true,targetUntouched:true};}finally{await unknownRun.close();}
  writeFileSync(resolve(directory,'migration.json'),JSON.stringify(evidence,null,2));console.log(JSON.stringify({manifest,checks:'backup/restore/fixed plan/zero-write dry-run/interrupted commit/lost journal/repeat apply/byte invariants/source drift and bad source passed',directory}));
 }finally{await client.close();}
});
function readFileSafe(path:string){try{return readFileSync(path);}catch{return null;}}
