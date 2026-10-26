import {databaseClientOptions,readMaintenanceDatabaseAuth} from './credentials.js';
import {MongoClient,BSON,ObjectId} from 'mongodb';
import type {Db,Document,ClientSession} from 'mongodb';
import {mkdirSync,existsSync,readFileSync,writeFileSync,appendFileSync,lstatSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {randomUUID,randomBytes,createHash} from 'node:crypto';
import {canonical,extractQuestionContent,evaluateAnswers} from '@survey/shared';
import {assertOwnedDatabaseInstance,verifyConnectedDatabaseInstance} from './instance-ownership.js';
import {baselineRegistry,phase2Registry} from './schema-registry.js';
import {verifySchema} from './initialize.js';
import {jsonInteger} from './receipt-codec.js';
import {questionsFromStorage,checkBindingSet} from './binding-integrity.js';
import type {Phase2SurveyDocument,Phase2SnapshotDocument,SurveyQuestionBindingDocument,QuestionVersionDocument} from './phase2-models.js';
import {contentToBson} from '../content-codec.js';
import {definitionOf} from '../core/versions.js';
import type {VersionDocument} from '../core/versions.js';
import {hash} from '../core/common.js';
import {verifyPhase2Database} from './phase2-initialize.js';

const collections=['users','surveys','survey_versions','responses'] as const;
const sha=(value:Uint8Array|string)=>createHash('sha256').update(value).digest('hex');
const same=(a:unknown,b:unknown)=>canonical(BSON.EJSON.serialize(a,{relaxed:false}))===canonical(BSON.EJSON.serialize(b,{relaxed:false}));
const opts={readConcern:{level:'snapshot' as const},writeConcern:{w:'majority' as const},readPreference:'primary' as const};
interface DumpCollection {name:string;options:Document;indexes:Document[];documents:string[]}
interface Dump {format:1;source:string;sourceHash:string;collections:DumpCollection[]}
interface Manifest {format:1;task:'P2-008';runId:string;source:string;restore:string;applicationTest:string;instanceHash:string}
interface Batch {sourceKey:string;sourceHash:string;evidenceKey:string;action:'upgradeSurvey';before:Document;after:Document;items:Document[];versions:Document[];bindings:Document[];audit:string[]}
interface PlanRow {planId:string;sourceKey:string;sourceHash:string;targetCollection:string;targetId:ObjectId;contentHash:string|null;evidenceKey:string;action:'insert'|'upgradeSurvey'}
interface Plan {format:1;planId:string;source:string;sourceHash:string;target:string;batches:Batch[];rows:PlanRow[];blocked:string[]}
const pack=(doc:Document)=>Buffer.from(BSON.serialize(doc)).toString('base64');
const unpack=(s:string)=>BSON.deserialize(Buffer.from(s,'base64'),{promoteLongs:false});
function privateRoot(runId:string){
 if(!/^[0-9]{13}_[a-f0-9]{8}$/.test(runId))throw Error('P2_MIGRATION_RUN_ID_REQUIRED');
 const parent=resolve('.local/p2-008/migrations'),path=resolve(parent,runId),rel=relative(parent,path);
 if(!rel||rel.startsWith('..')||isAbsolute(rel))throw Error('P2_MIGRATION_PATH_REJECTED');
 for(const p of [resolve('.local'),resolve('.local/p2-008'),parent,path])if(existsSync(p)&&lstatSync(p).isSymbolicLink())throw Error('P2_MIGRATION_SYMLINK_REJECTED');
 return path;
}
export function createMigrationRun(runId=`${Date.now()}_${randomBytes(4).toString('hex')}`){
 const directory=privateRoot(runId);mkdirSync(directory,{recursive:true});const path=resolve(directory,'manifest.json');
 if(existsSync(path))throw Error('P2_MIGRATION_RUN_ALREADY_EXISTS');
 const marker=readFileSync('.local/mongodb-phase2-rs0/project2-instance.json');
 const manifest:Manifest={format:1,task:'P2-008',runId,source:`project2_test_p2008_source_${runId}`,restore:`project2_restore_${runId}`,applicationTest:`project2_test_p2008_migrated_${runId}`,instanceHash:sha(marker)};
 writeFileSync(path,JSON.stringify(manifest,null,2),{flag:'wx'});return manifest;
}
export async function openMigrationRun(runId:string){
 const directory=privateRoot(runId),manifest=JSON.parse(readFileSync(resolve(directory,'manifest.json'),'utf8')) as Manifest;
 const expected={source:`project2_test_p2008_source_${runId}`,restore:`project2_restore_${runId}`,applicationTest:`project2_test_p2008_migrated_${runId}`};
 if(manifest.format!==1||manifest.task!=='P2-008'||manifest.runId!==runId||Object.entries(expected).some(([k,v])=>manifest[k as keyof Manifest]!==v)
  ||manifest.instanceHash!==sha(readFileSync('.local/mongodb-phase2-rs0/project2-instance.json')))throw Error('P2_MIGRATION_ALLOWLIST_OR_GENERATION_MISMATCH');
 const owned=assertOwnedDatabaseInstance(),client=new MongoClient('mongodb://localhost:27019/?replicaSet=rs0',{...databaseClientOptions(readMaintenanceDatabaseAuth()),promoteLongs:false,serverSelectionTimeoutMS:5000});
 try{await client.connect();await verifyConnectedDatabaseInstance(client,owned);}catch(e){await client.close();throw e;}
 const source=client.db(manifest.source);
 function target(name:string){if(![manifest.restore,manifest.applicationTest].includes(name)||name===manifest.source)throw Error('P2_MIGRATION_TARGET_REJECTED');return client.db(name);}
 async function capture(db:Db):Promise<Dump>{
  const metadata=await db.listCollections({},{nameOnly:false}).toArray();
  if(metadata.length!==4||metadata.some(c=>!collections.includes(c.name as typeof collections[number])))throw Error('P2_MIGRATION_FOUR_COLLECTIONS_REQUIRED');
  const result:DumpCollection[]=[];
  await client.withSession(s=>s.withTransaction(async()=>{
   for(const name of collections){
    const row=metadata.find(m=>m.name===name)!;
    const documents=(await db.collection(name).find({},{session:s}).sort({_id:1}).toArray()).map(pack);
    if(documents.reduce((n,x)=>n+x.length,0)>128*1024*1024)throw Error('P2_MIGRATION_BACKUP_CAPACITY_REVIEW_REQUIRED');
    result.push({name,options:row.options??{},indexes:await db.collection(name).indexes(),documents});
   }
  },opts));
  const after=await db.listCollections({},{nameOnly:false}).toArray();
  if(!same(metadata,after))throw Error('P2_MIGRATION_METADATA_CHANGED');
  for(const row of result)if(!same(await db.collection(row.name).indexes(),row.indexes))throw Error('P2_MIGRATION_METADATA_CHANGED');
  return {format:1,source:db.databaseName,sourceHash:hash(result),collections:result};
 }
 async function audit(dump:Dump,db:Db){
  const blocked:string[]=[],rows=Object.fromEntries(dump.collections.map(c=>[c.name,c.documents.map(unpack)]));
  try{await verifySchema(db);}catch{blocked.push('BASELINE_SCHEMA_OR_INDEX_MISMATCH');}
  for(const c of collections){
   const schema=phase2Registry.schemas[c];
   if(await db.collection(c).countDocuments({$nor:[{$jsonSchema:schema}]}))blocked.push(`${c}:UNKNOWN_FIELDS_OR_FORMAT`);
  }
  const users=rows.users,surveys=rows.surveys,versions=rows.survey_versions,responses=rows.responses;
  for(const s of surveys){
   const sid=s._id.toHexString(),snapshots=versions.filter(v=>v.surveyId.equals(s._id)),answers=responses.filter(r=>r.surveyId.equals(s._id));
   if(s.schemaVersion!==2||!users.some(u=>u._id.equals(s.ownerId)))blocked.push(`${sid}:SURVEY_FORMAT_OR_OWNER`);
   try{questionsFromStorage(s.questions);}catch{blocked.push(`${sid}:DRAFT_INVALID`);}
   if(jsonInteger(s.submissionCount)!==answers.length||jsonInteger(s.currentVersionSubmissionCount)!==answers.filter(r=>same(r.surveyDefinitionVersion,s.currentPublishedVersion)).length)blocked.push(`${sid}:COUNTERS`);
   if(s.currentPublishedVersion===null?snapshots.length>0:!snapshots.some(v=>same(v.version,s.currentPublishedVersion)))blocked.push(`${sid}:CURRENT_SNAPSHOT_MISSING`);
   const highest=Math.max(0,...snapshots.map(v=>jsonInteger(v.version,1)));
   if(snapshots.length!==highest)blocked.push(`${sid}:HISTORICAL_SNAPSHOT_GAP`);
  }
  for(const v of versions){
   if(v.schemaVersion!==1||!surveys.some(s=>s._id.equals(v.surveyId))||!users.some(u=>u._id.equals(v.publishedBy)))blocked.push(`${v._id}:SNAPSHOT_REFERENCE_OR_FORMAT`);
   try{definitionOf(v as VersionDocument);}catch{blocked.push(`${v._id}:DEFINITION_HASH_OR_CONTENT`);}
  }
  for(const r of responses){
   const s=surveys.find(s=>s._id.equals(r.surveyId)),v=versions.find(v=>v.surveyId.equals(r.surveyId)&&same(v.version,r.surveyDefinitionVersion));
   if(!s||!v||!users.some(u=>u._id.equals(r.respondentId))){blocked.push(`${r._id}:RESPONSE_REFERENCE`);continue;}
   try{
    const answers=r.answers.map((a:Document)=>a.type==='number'?{...a,number:a.number.toString()}:a);
    const checked=evaluateAnswers(definitionOf(v as VersionDocument).questions,answers);
    if(checked.errors.length||r.payloadHashVersion!==2||r.schemaVersion!==2||hash({publishedVersion:jsonInteger(r.surveyDefinitionVersion,1),anonymous:r.anonymous,answers:checked.answers})!==r.payloadHash
     ||r.repeatAllowed!==v.policySnapshot.allowRepeat||(r.anonymous&&!v.policySnapshot.allowAnonymous))throw Error();
   }catch{blocked.push(`${r._id}:RESPONSE_HASH_OR_ANSWERS`);}
  }
  return {blocked,rows};
 }
 async function inspect(){const dump=await capture(source),checked=await audit(dump,source);return {source:manifest.source,sourceHash:dump.sourceHash,counts:Object.fromEntries(dump.collections.map(c=>[c.name,c.documents.length])),blocked:checked.blocked,formats:Object.fromEntries(collections.map(n=>[n,[...new Set(checked.rows[n].map(d=>d.schemaVersion))]]))};}
 async function backup(){
  const dump=await capture(source),checked=await audit(dump,source);if(checked.blocked.length)throw Error('P2_MIGRATION_SOURCE_BLOCKED: '+checked.blocked.join(','));
  const path=resolve(directory,'backup.bson.json');
  if(existsSync(path)){const old=JSON.parse(readFileSync(path,'utf8')) as Dump;if(old.sourceHash!==dump.sourceHash)throw Error('P2_MIGRATION_SOURCE_HASH_CONFLICT');}
  else writeFileSync(path,JSON.stringify(dump),{flag:'wx'});
  return {sourceHash:dump.sourceHash,method:'BSON logical backup; snapshot transaction plus stable metadata; not mongodump',bytes:readFileSync(path).length,sha256:sha(readFileSync(path))};
 }
 async function restore(name:string){
  const db=target(name),dump=JSON.parse(readFileSync(resolve(directory,'backup.bson.json'),'utf8')) as Dump;
  if(hash(dump.collections)!==dump.sourceHash||dump.source!==manifest.source)throw Error('P2_MIGRATION_BACKUP_CORRUPT');
  const existing=await db.listCollections({},{nameOnly:false}).toArray();
  if(existing.some(c=>!collections.includes(c.name as typeof collections[number])))throw Error('P2_MIGRATION_RESTORE_NOT_BASELINE');
  for(const current of existing){
   const expected=dump.collections.find(c=>c.name===current.name)!;
   if(!same(current.options,expected.options))throw Error('P2_MIGRATION_RESTORE_METADATA_CONFLICT');
   if((await db.collection(current.name).indexes()).some(i=>!expected.indexes.some(x=>same(x,i))))throw Error('P2_MIGRATION_RESTORE_INDEX_CONFLICT');
   const docs=expected.documents.map(unpack);
   for(const actual of await db.collection(current.name).find().toArray())if(!docs.some(d=>same(d,actual)))throw Error('P2_MIGRATION_RESTORE_DATA_CONFLICT');
  }
  for(const c of dump.collections){
   const current=existing.find(x=>x.name===c.name);
   if(current&&!same(current.options,c.options))throw Error('P2_MIGRATION_RESTORE_METADATA_CONFLICT');
   if(!current)await db.createCollection(c.name,c.options);
   const actual=await db.collection(c.name).indexes();
   if(actual.some(i=>!c.indexes.some(x=>x.name===i.name&&same(x.key,i.key))))throw Error('P2_MIGRATION_RESTORE_INDEX_CONFLICT');
   for(const index of c.indexes)if(index.name!=='_id_'&&!actual.some(i=>i.name===index.name)){
    const {key,name,unique,partialFilterExpression}=index;await db.collection(c.name).createIndex(key,{name,...(unique?{unique}:{}),...(partialFilterExpression?{partialFilterExpression}:{})});
   }
  }
  await client.withSession(s=>s.withTransaction(async()=>{
   for(const c of dump.collections){
    const actual=await db.collection(c.name).find({},{session:s}).toArray();
    const docs=c.documents.map(unpack);
    if(actual.some(a=>!docs.some(d=>same(d,a))))throw Error('P2_MIGRATION_RESTORE_DATA_CONFLICT');
    for(const d of docs)if(!actual.some(a=>a._id.equals(d._id)))await db.collection(c.name).insertOne(d,{session:s});
   }
  },opts));
  const restored=await capture(db);if(restored.sourceHash!==dump.sourceHash)throw Error('P2_MIGRATION_RESTORE_FINGERPRINT_MISMATCH');
  return {target:name,sourceHash:restored.sourceHash,restored:true};
 }
 async function dryRun(name:string):Promise<Plan>{
  const db=target(name),dump=await capture(source),{blocked,rows}=await audit(dump,source);
  const path=resolve(directory,`plan-${name}.bson`);
  if(existsSync(path)){
   const old=BSON.deserialize(readFileSync(path),{promoteLongs:false}) as Plan;
   if(old.sourceHash!==dump.sourceHash||old.target!==name)throw Error('P2_MIGRATION_SOURCE_HASH_CONFLICT');return old;
  }
  if(!blocked.length){const restored=await capture(db);if(restored.sourceHash!==dump.sourceHash)blocked.push('RESTORE_NOT_IDENTICAL');}
  const plan:Plan={format:1,planId:randomUUID(),source:manifest.source,sourceHash:dump.sourceHash,target:name,batches:[],rows:[],blocked};
  if(blocked.length){writeFileSync(path,BSON.serialize(plan),{flag:'wx'});return plan;}
  for(const survey of rows.surveys){
   const sourceKey=survey._id.toHexString(),evidenceKey=`P2-008/${runId}/${sourceKey}/${dump.sourceHash}`;
   const batch:Batch={sourceKey,sourceHash:dump.sourceHash,evidenceKey,action:'upgradeSurvey',before:survey,after:{...survey,schemaVersion:3,usageNumber:randomBytes(18).toString('base64url'),originTemplate:null},items:[],versions:[],bindings:[],audit:[]};
   const byInstance=new Map<string,{item:Document;byHash:Map<string,Document>;lastType:string;lastPublication:number}>();
   const snaps=rows.survey_versions.filter(v=>v.surveyId.equals(survey._id)).sort((a,b)=>jsonInteger(a.version)-jsonInteger(b.version));
   for(const snapshot of snaps){const seen=new Map<string,string[]>();for(const q of questionsFromStorage(snapshot.definition.questions)){const digest=hash(extractQuestionContent(q));seen.set(digest,[...(seen.get(digest)??[]),q.id]);}for(const instances of seen.values())if(instances.length>1)batch.audit.push(`LEGACY_SIMILAR_CONTENT_MULTIPLICITY:${jsonInteger(snapshot.version,1)}:${instances.join(',')}:KEPT_SEPARATE_UNPROVEN_IDENTITIES`);}
   for(const snapshot of snaps)for(const q of questionsFromStorage(snapshot.definition.questions)){
    const content=extractQuestionContent(q),contentHash=hash(content),publication=jsonInteger(snapshot.version,1);
    let identity=byInstance.get(q.id);
    if(!identity||identity.lastType!==q.type||identity.lastPublication<publication-1){
     if(identity)batch.audit.push(`${q.id}:SUSPECT_RECREATION_OR_TYPE_CHANGE_NEW_IDENTITY`);
     const now=new Date(),item={_id:new ObjectId(),schemaVersion:1,ownerId:survey.ownerId,revision:0,accessFence:0,latestVersionId:null,nextVersion:1,draft:null,origin:{kind:'legacyImport',sourceQuestionId:null,sourceVersionId:null,evidenceKey},createdAt:now,updatedAt:now};
     identity={item,byHash:new Map(),lastType:q.type,lastPublication:publication};byInstance.set(q.id,identity);batch.items.push(item);
    }
    let version=identity.byHash.get(contentHash);
    if(!version){version={_id:new ObjectId(),schemaVersion:1,questionId:identity.item._id,version:identity.byHash.size+1,content:contentToBson(content),contentHash,
     distributionSource:{kind:'unrecorded',sourceQuestionId:null,sourceVersionId:null},parentVersionId:null,restoredFromVersionId:null,operation:'legacyImport',createdBy:survey.ownerId,evidenceKey,createdAt:new Date()};
     identity.byHash.set(contentHash,version);batch.versions.push(version);identity.item.latestVersionId=version._id;identity.item.nextVersion=identity.byHash.size+1;
    }
    identity.lastPublication=publication;
    batch.bindings.push({_id:new ObjectId(),schemaVersion:1,createdAt:new Date(),surveyId:survey._id,ownerId:survey.ownerId,instanceId:q.id,questionId:identity.item._id,questionVersionId:version._id,contentHash,
     scope:'publication',publicationVersion:publication,snapshotHash:snapshot.definitionHash,acquisitionId:new ObjectId(),acquiredAt:new Date(),authorization:{kind:'legacyImport',evidenceKey},mappingKind:'legacyImport',evidenceKey});
   }
   for(const q of questionsFromStorage(survey.questions)){
    const identity=byInstance.get(q.id),version=identity?.byHash.get(hash(extractQuestionContent(q)));
    if(version){batch.bindings.push({...batch.bindings.find(b=>b.questionVersionId.equals(version._id))!,_id:new ObjectId(),createdAt:new Date(),scope:'draft',publicationVersion:0,snapshotHash:null});}
    else batch.audit.push(`${q.id}:LOCAL_UNFORMALIZED_DRAFT`);
   }
   plan.batches.push(batch);
   plan.rows.push({planId:plan.planId,sourceKey:`survey:${sourceKey}`,sourceHash:plan.sourceHash,targetCollection:'surveys',targetId:survey._id,contentHash:null,evidenceKey,action:'upgradeSurvey'});
   for(const [collection,documents] of [['question_items',batch.items],['question_versions',batch.versions],['survey_question_bindings',batch.bindings]] as const)for(const d of documents){
    const instance=collection==='survey_question_bindings'?d.instanceId:batch.bindings.find(b=>b.questionId.equals(collection==='question_items'?d._id:d.questionId))?.instanceId;
    plan.rows.push({planId:plan.planId,sourceKey:`survey:${sourceKey}/instance:${instance}/${collection==='survey_question_bindings'?`scope:${d.scope}/publication:${d.publicationVersion}`:collection==='question_versions'?`content:${d.contentHash}/segment:${d.questionId}`:`identity:${d._id}`}`,sourceHash:plan.sourceHash,targetCollection:collection,targetId:d._id,contentHash:d.contentHash??null,evidenceKey,action:'insert'});
   }
  }
  writeFileSync(path,BSON.serialize(plan),{flag:'wx'});return plan;
 }
 function readPlan(name:string){target(name);const p=BSON.deserialize(readFileSync(resolve(directory,`plan-${name}.bson`)),{promoteLongs:false}) as Plan;if(p.format!==1||p.source!==manifest.source||p.target!==name||p.blocked.length)throw Error('P2_MIGRATION_PLAN_BLOCKED');return p;}
 async function ddl(db:Db){
  const existing=await db.listCollections({},{nameOnly:false}).toArray();
  // Review every existing object and index BEFORE any DDL. Partial DDL can be resumed only when exact.
  for(const c of existing){
   if(!Object.hasOwn(phase2Registry.schemas,c.name))throw Error('P2_MIGRATION_UNKNOWN_COLLECTION');
   const name=c.name as keyof typeof phase2Registry.schemas,old=baselineRegistry.schemas[name as keyof typeof baselineRegistry.schemas];
   if(!same(c.options?.validator,{$jsonSchema:phase2Registry.schemas[name]})&&(!old||!same(c.options?.validator,{$jsonSchema:old})))throw Error('P2_MIGRATION_VALIDATOR_CONFLICT');
   if(c.options?.validationLevel!=='strict'||c.options?.validationAction!=='error'||Object.keys(c.options).some(k=>!['validator','validationLevel','validationAction'].includes(k)))throw Error('P2_MIGRATION_OPTIONS_CONFLICT');
   for(const i of await db.collection(name).indexes()){
    if(i.name==='_id_')continue;const spec=phase2Registry.indexSpecs[name].find(s=>s.name===i.name);
    if(!spec||!same(i.key,spec.key)||!!i.unique!==!!spec.unique||!same(i.partialFilterExpression,spec.partialFilterExpression)||i.sparse||i.hidden||i.collation||i.expireAfterSeconds!==undefined)throw Error('P2_MIGRATION_INDEX_CONFLICT');
   }
  }
  for(const [name,schema] of Object.entries(phase2Registry.schemas)){
   const old=existing.find(c=>c.name===name);
   if(!old)await db.createCollection(name,{validator:{$jsonSchema:schema},validationLevel:'strict',validationAction:'error'});
   else if(!same(old.options?.validator,{$jsonSchema:schema}))await db.command({collMod:name,validator:{$jsonSchema:schema},validationLevel:'strict',validationAction:'error'});
   for(const {key,...spec} of phase2Registry.indexSpecs[name as keyof typeof phase2Registry.schemas])await db.collection(name).createIndex(key,spec);
  }
 }
 async function unchanged(db:Db,plan:Plan){
  const dump=await capture(source);if(dump.sourceHash!==plan.sourceHash)throw Error('P2_MIGRATION_SOURCE_HASH_CONFLICT');
  for(const c of dump.collections.filter(c=>c.name!=='surveys')){
   const targetDocs=(await db.collection(c.name).find().sort({_id:1}).toArray()).map(pack);
   if(!same(targetDocs,c.documents))throw Error('P2_MIGRATION_IMMUTABLE_DATA_CONFLICT');
  }
 }
 async function apply(name:string,hooks:{afterSurveyCommit?:(completed:number)=>Promise<void>|void}={}){
  const db=target(name),plan=readPlan(name);await unchanged(db,plan);
  // Validate restored rows and all planned insert semantics before DDL; never overwrite collisions.
  for(const batch of plan.batches){
   const s=await db.collection('surveys').findOne({_id:batch.before._id});if(!same(s,batch.before)&&!same(s,batch.after))throw Error('P2_MIGRATION_SURVEY_SOURCE_CONFLICT');
   for(const [name,docs] of [['question_items',batch.items],['question_versions',batch.versions],['survey_question_bindings',batch.bindings]] as const){
    if(!await db.listCollections({name},{nameOnly:true}).hasNext())continue;
    for(const d of docs){const old=await db.collection(name).findOne({_id:d._id});if(old&&!same(old,d))throw Error('P2_MIGRATION_TARGET_ROW_CONFLICT');}
   }
  }
  await ddl(db);let committed=0,skipped=0;
  for(const batch of plan.batches){
   let wasSkip=false;
   await client.withSession(s=>s.withTransaction(async()=>{
    const current=await db.collection('surveys').findOne({_id:batch.before._id},{session:s});
    if(!same(current,batch.before)&&!same(current,batch.after))throw Error('P2_MIGRATION_SURVEY_SOURCE_CONFLICT');
    const upgraded=same(current,batch.after);
    for(const [name,docs] of [['question_items',batch.items],['question_versions',batch.versions],['survey_question_bindings',batch.bindings]] as const)for(const d of docs){
     const old=await db.collection(name).findOne({_id:d._id},{session:s});
     if(old){if(!same(old,d))throw Error('P2_MIGRATION_TARGET_ROW_CONFLICT');}
     else{if(upgraded)throw Error('P2_MIGRATION_COMMITTED_BATCH_INCOMPLETE');await db.collection(name).insertOne(d,{session:s});}
    }
    if(!upgraded){const result=await db.collection('surveys').updateOne({_id:batch.before._id,schemaVersion:2,revision:batch.before.revision},{$set:{schemaVersion:3,usageNumber:batch.after.usageNumber,originTemplate:null}},{session:s});if(result.modifiedCount!==1)throw Error('P2_MIGRATION_SURVEY_CAS_CONFLICT');}
    wasSkip=upgraded;
   },opts));
   if(wasSkip)skipped++;else committed++;
   // Journal is audit only. A lost journal is recovered by comparing every persisted row above.
   await hooks.afterSurveyCommit?.(committed+skipped);
   appendFileSync(resolve(directory,`journal-${name}.jsonl`),JSON.stringify({planId:plan.planId,sourceHash:plan.sourceHash,sourceKey:batch.sourceKey,action:wasSkip?'skip':'commit',at:new Date().toISOString()})+'\n');
  }
  return {planId:plan.planId,target:name,committed,skipped};
 }
 async function verify(name:string){
  const db=target(name),plan=readPlan(name);await unchanged(db,plan);
  await verifyPhase2Database(db);
  for(const batch of plan.batches){
   if(!same(await db.collection('surveys').findOne({_id:batch.after._id}),batch.after))throw Error('P2_MIGRATION_SURVEY_VERIFY_FAILED');
   for(const [n,docs] of [['question_items',batch.items],['question_versions',batch.versions],['survey_question_bindings',batch.bindings]] as const)for(const d of docs)if(!same(await db.collection(n).findOne({_id:d._id}),d))throw Error('P2_MIGRATION_ROW_VERIFY_FAILED');
   const s=batch.after as Phase2SurveyDocument,versions=batch.versions as QuestionVersionDocument[],bindings=batch.bindings as SurveyQuestionBindingDocument[];
   checkBindingSet(s,bindings.filter(b=>b.scope==='draft'),versions,undefined,{requireComplete:false});
   for(const v of await db.collection('survey_versions').find({surveyId:s._id}).toArray())checkBindingSet(s,bindings.filter(b=>b.scope==='publication'&&jsonInteger(b.publicationVersion)===jsonInteger(v.version)),versions,v as Phase2SnapshotDocument);
  }
  for(const [n,count] of [['surveys',plan.batches.length],['question_items',plan.batches.reduce((a,b)=>a+b.items.length,0)],['question_versions',plan.batches.reduce((a,b)=>a+b.versions.length,0)],['survey_question_bindings',plan.batches.reduce((a,b)=>a+b.bindings.length,0)]] as const)if(await db.collection(n).countDocuments()!==count)throw Error('P2_MIGRATION_EXTRA_OR_MISSING_ROWS');
  for(const [n,schema] of Object.entries(phase2Registry.schemas))if(await db.collection(n).countDocuments({$nor:[{$jsonSchema:schema}]}))throw Error('P2_MIGRATION_STORED_SCHEMA_INVALID');
  return {planId:plan.planId,target:name,sourceHash:plan.sourceHash,verified:true,surveys:plan.batches.length,versions:plan.batches.reduce((a,b)=>a+b.versions.length,0),bindings:plan.batches.reduce((a,b)=>a+b.bindings.length,0),audit:plan.batches.flatMap(b=>b.audit)};
 }
 return {manifest,directory,inspect,backup,restore,dryRun,apply,verify,close:()=>client.close()};
}
