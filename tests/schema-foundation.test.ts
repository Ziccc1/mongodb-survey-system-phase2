import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {ObjectId,BSON,Long,Double} from 'mongodb';
import {MongoClient,testMongoOptions} from './database-client.js';
import type {Db,Document} from 'mongodb';
import {loadConfig} from '../apps/api/src/config.js';
import {initialize,verifySchema} from '../apps/api/src/database/initialize.js';
import {initializePhase2Schema,verifyPhase2Schema} from '../apps/api/src/database/phase2-initialize.js';
import {phase2Registry} from '../apps/api/src/database/schema-registry.js';
import {assertOwnedDatabaseInstance,verifyConnectedDatabaseInstance} from '../apps/api/src/database/instance-ownership.js';
import {isolatedTestConfig,evidenceDirectory} from './runtime-environment.js';
import {buildApp} from '../apps/api/src/app.js';
const clone=(doc:Document):Document=>BSON.deserialize(BSON.serialize(doc),{promoteLongs:false});
async function fingerprint(db:Db){
 const collections=await db.listCollections().toArray(),result:Document={};
 for(const c of collections.sort((a,b)=>a.name.localeCompare(b.name))){const docs=await db.collection(c.name).find().sort({_id:1}).toArray();result[c.name]={options:c.options,indexes:await db.collection(c.name).indexes(),count:docs.length,dataHash:createHash('sha256').update(BSON.EJSON.stringify(docs,{relaxed:false})).digest('hex')};}
 return result;
}
test('real thirteen collection schema, negative inserts, indexes, nonmigration and baseline compatibility',async()=>{
 const owned=assertOwnedDatabaseInstance(),base=loadConfig(),client=new MongoClient(base.uri,testMongoOptions());await client.connect();await verifyConnectedDatabaseInstance(client,owned);
 const directory=evidenceDirectory('schema-foundation'),report:Document={owned,databases:[],accepted:[],rejected:[],indexes:[],preflight:[]};
 const appBefore=await fingerprint(client.db(base.dbName));report.applicationBefore=appBefore;
 const target=isolatedTestConfig('schema_foundation'),db=client.db(target.dbName);report.databases.push(target.dbName);
 const source=JSON.parse(readFileSync('docs/phase2/collection-examples.json','utf8'));
 const examples:Record<string,Document>=BSON.EJSON.deserialize(source.examples);
 const accept=async(name:string,doc:Document,label:string)=>{await db.collection(name).insertOne(doc);report.accepted.push({name,label});};
 const reject=async(name:string,doc:Document,label:string,code=121)=>{const before=await db.collection(name).countDocuments();await assert.rejects(db.collection(name).insertOne(doc),(error:{code?:number})=>error.code===code);assert.equal(await db.collection(name).countDocuments(),before);report.rejected.push({name,label,code,unchangedCount:true});};
 const variant=(name:string,changes:Document={})=>({...clone(examples[name]),_id:new ObjectId(),...changes});
 try{
  await initializePhase2Schema(target);await initializePhase2Schema(target);await verifyPhase2Schema(target);
  assert.equal((await db.listCollections().toArray()).length,13);
  for(const name of Object.keys(examples))await accept(name,examples[name],'design primary');
  for(const [name,docs] of Object.entries(source.supportingDocuments) as [string,Document[]][])for(const doc of docs)await accept(name,BSON.EJSON.deserialize(doc),'design supporting');
  for(const name of Object.keys(examples)){
   await reject(name,variant(name,{unexpected:true}),'extra top field');const missing=variant(name);delete missing.schemaVersion;await reject(name,missing,'missing schemaVersion');
   await reject(name,variant(name,{_id:'not BSON ObjectId'}),'wrong OID type');
  }
  const survey2=variant('surveys',{schemaVersion:2,publicId:'old2'});delete survey2.originTemplate;delete survey2.usageNumber;await accept('surveys',survey2,'legacy format2');
  await reject('surveys',{...survey2,_id:new ObjectId(),originTemplate:null},'old format cannot mix new field');
  const missingOrigin=variant('surveys');delete missingOrigin.originTemplate;await reject('surveys',missingOrigin,'new format origin required nullable');
  const snapshot1=variant('survey_versions',{schemaVersion:1,version:9,publicationRequestId:'legacy1'});delete snapshot1.bindingHash;await accept('survey_versions',snapshot1,'legacy snapshot1');
  await reject('survey_versions',{...snapshot1,_id:new ObjectId(),bindingHash:'a'.repeat(64)},'legacy snapshot cannot mix bindingHash');
  for(const kind of ['original','unrecorded','derived'])await accept('question_versions',variant('question_versions',{questionId:new ObjectId(),distributionSource:{kind,sourceQuestionId:kind==='derived'?new ObjectId():null,sourceVersionId:kind==='derived'?new ObjectId():null}}),`source ${kind}`);
  for(const operation of ['save','restore','fork','legacyImport'])await accept('question_versions',variant('question_versions',{questionId:new ObjectId(),operation,evidenceKey:operation==='legacyImport'?'audit':null}),`operation ${operation}`);
  for(const kind of ['fork','legacyImport'])await accept('question_items',variant('question_items',{draft:null,origin:{kind,sourceQuestionId:kind==='fork'?new ObjectId():null,sourceVersionId:kind==='fork'?new ObjectId():null,evidenceKey:null}}),`origin ${kind}`);
  const contents=[{type:'single',title:'s',options:[{id:'a',label:'A'},{id:'b',label:'B'}]},{type:'multiple',title:'m',options:[{id:'a',label:'A'},{id:'b',label:'B'}],validation:{}},{type:'text',title:'t',validation:{}},examples.question_versions.content];
  for(const content of contents)await accept('question_versions',variant('question_versions',{questionId:new ObjectId(),content}),`content ${content.type}`);
  for(const [i,content] of contents.entries()){
   const condition=i===0?{op:'eq',optionId:'a'}:i===1?{op:'containsAll',optionIds:['a']}:i===3?{op:'gte',number:BSON.Decimal128.fromString('0')}:null;
   const q={...content,id:`q${i}`,required:false,jumpRules:condition?[{id:`r${i}`,condition,targetQuestionId:'later'}]:[]};
   await accept('surveys',variant('surveys',{publicId:new ObjectId().toHexString(),usageNumber:new ObjectId().toHexString(),questions:[q]}),`materialized ${content.type} rule`);
   const answer=i===0?{optionId:'a'}:i===1?{optionIds:['a']}:i===2?{text:'😀汉'}:{number:BSON.Decimal128.fromString('0')};
   await accept('responses',variant('responses',{respondentId:new ObjectId(),answers:[{questionId:`q${i}`,type:content.type,...answer}]}),`answer ${content.type}`);
  }
  const originated=variant('surveys',{publicId:'originated',usageNumber:'originated_usage',originTemplate:{templateId:new ObjectId(),contentHash:'a'.repeat(64),acquiredAt:new Date()}});await accept('surveys',originated,'originTemplate object');
  const grantedProof=variant('survey_templates');grantedProof.bindings[0].distributionProof.obligations[0].grantId=new ObjectId();grantedProof.bindings[0].distributionProof.obligations[0].grantRevision=2;await accept('survey_templates',grantedProof,'paired external grant proof');
  for(const authorization of [{kind:'owner'},{kind:'share',grantId:new ObjectId(),grantRevision:0},{kind:'template',templateId:new ObjectId(),templateHash:'a'.repeat(64)},{kind:'legacyImport',evidenceKey:'audit'}])await accept('survey_question_bindings',variant('survey_question_bindings',{surveyId:new ObjectId(),scope:'draft',publicationVersion:0,snapshotHash:null,authorization}),`draft/auth ${authorization.kind}`);
  for(const operation of ['createQuestion','saveVersion','restoreVersion','forkQuestion','createBank','createTemplate'])await accept('operation_receipts',variant('operation_receipts',{operation,requestKey:new ObjectId().toHexString()}),`receipt ${operation}`);
  const instance=BSON.EJSON.deserialize(source.supportingDocuments.operation_receipts[0]);
  for(const operation of ['attachQuestion','replaceQuestion','saveInlineQuestion'])await accept('operation_receipts',{...clone(instance),_id:new ObjectId(),operation,requestKey:new ObjectId().toHexString()},`receipt ${operation}`);
  const negatives:[string,Document,string][]=[
   ['question_versions',variant('question_versions',{distributionSource:{kind:'derived',sourceQuestionId:null,sourceVersionId:null}}),'derived without source'],
   ['question_versions',variant('question_versions',{distributionSource:{kind:'original',sourceQuestionId:new ObjectId(),sourceVersionId:null}}),'original with source'],
   ['question_versions',variant('question_versions',{content:{...contents[3],id:'illegal'}}),'content instance leakage'],
   ['question_versions',variant('question_versions',{content:{type:'number',title:'n',validation:{min:'0',integerOnly:true}}}),'Decimal string instead of BSON'],
   ['question_versions',variant('question_versions',{content:{type:'text',title:'t',validation:{extra:1}}}),'unknown nested field'],
   ['survey_question_bindings',variant('survey_question_bindings',{scope:'draft',publicationVersion:1,snapshotHash:null}),'draft publication conflict'],
   ['survey_question_bindings',variant('survey_question_bindings',{snapshotHash:null}),'publication null hash'],
   ['question_items',variant('question_items',{revision:Long.fromString('9007199254740992')}),'unsafe integer'],
   ['question_items',variant('question_items',{revision:new Double(1)}),'double not int/long'],
   ['question_banks',variant('question_banks',{createdAt:'2026-10-23',name:'x'.repeat(101)}),'date/string bound'],
   ['question_grants',variant('question_grants',{state:'unknown'}),'state enum'],
   ['operation_receipts',variant('operation_receipts',{resultVersion:2}),'unknown result version'],
   ['operation_receipts',variant('operation_receipts',{operation:'attachQuestion'}),'operation result mismatch'],
   ['operation_receipts',{...clone(instance),_id:new ObjectId(),result:{...instance.result,data:{...instance.result.data,extra:1}}},'receipt nested unknown'],
  ];for(const [name,doc,label] of negatives)await reject(name,doc,label);
  const badProof=variant('survey_templates');badProof.bindings[0].distributionProof.obligations[0].grantRevision=1;await reject('survey_templates',badProof,'grant pair mismatch');
  const oldProof=variant('survey_templates');oldProof.bindings[0].publicGrantId=null;await reject('survey_templates',oldProof,'obsolete single grant');
  for(const name of ['question_grants','template_grants'])await accept(name,variant(name,{...(name==='question_grants'?{recipientId:new ObjectId()}:{publisherId:new ObjectId()}),state:'revoked',revokedAt:new Date()}),'revoked branch');
  await accept('question_banks',variant('question_banks',{deletedAt:new Date()}),'tombstone');
  await accept('question_items',variant('question_items',{revision:Long.fromString('9007199254740991')}),'safe Long max');
  for(const [name,specs] of Object.entries(phase2Registry.indexSpecs)){
   const indexes=await db.collection(name).indexes();assert.equal(indexes.length,specs.length+1);
   for(const spec of specs){const found=indexes.find(i=>i.name===spec.name)!;assert.deepEqual(found.key,spec.key);assert.equal(!!found.unique,!!spec.unique);assert.deepEqual(found.partialFilterExpression,spec.partialFilterExpression);report.indexes.push({collection:name,name:spec.name,unique:!!spec.unique});
    if(spec.unique){const duplicate=variant(name);
     if(name==='responses')duplicate.repeatAllowed=spec.name!=='uq_one_response_per_user';
     for(const other of specs.filter(s=>s.unique&&s.name!==spec.name)){
      const field=Object.keys(other.key).find(k=>!Object.hasOwn(spec.key,k));
      if(field)duplicate[field]=field==='version'?777:new ObjectId().toHexString();
     }
     await reject(name,duplicate,`duplicate ${spec.name}`,11000);
    }
   }
  }
  // Same question/version across publication history is deliberately nonunique (S04 deferred).
  await accept('survey_question_bindings',variant('survey_question_bindings',{publicationVersion:2}),'normal history same question/version');
  const phase2Before=await fingerprint(db);await assert.rejects(verifySchema(db));assert.deepEqual(await fingerprint(db),phase2Before);
  const baseline=isolatedTestConfig('schema_baseline');report.databases.push(baseline.dbName);const old=client.db(baseline.dbName);await initialize(old);await initialize(old);await verifySchema(old);
  const before=await fingerprint(old);await assert.rejects(initializePhase2Schema(baseline),/VALIDATOR_MISMATCH/);assert.deepEqual(await fingerprint(old),before);report.preflight.push('baseline rejected before any new DDL');
  const app=await buildApp(baseline,{logger:false});try{assert.equal((await app.inject('/api/v1/health/ready')).statusCode,200);}finally{await app.close();}
  for(const mode of ['unknown','missingindex','wrongindex','partial']){
   const cfg=isolatedTestConfig(`schema_${mode}`);report.databases.push(cfg.dbName);const other=client.db(cfg.dbName);
   if(mode==='unknown'){await other.createCollection('unknown');await assert.rejects(verifySchema(other));}
   else {await other.createCollection('question_banks',{validator:{$jsonSchema:phase2Registry.schemas.question_banks},validationLevel:'strict',validationAction:'error'});
    if(mode==='partial')for(const {key,...opts} of phase2Registry.indexSpecs.question_banks)await other.collection('question_banks').createIndex(key,opts);
    if(mode==='wrongindex')await other.collection('question_banks').createIndex({ownerId:-1},{name:'ix_bank_owner'});
   }
   const initial=await fingerprint(other);
   if(mode==='partial'){await initializePhase2Schema(cfg);await verifyPhase2Schema(cfg);report.preflight.push('exact complete subset resumed');}
   else {await assert.rejects(initializePhase2Schema(cfg));assert.deepEqual(await fingerprint(other),initial);report.preflight.push(`${mode} rejected with unchanged objects`);}
  }
  // Connection sentinel proves target rejection precedes even MongoClient.connect; never writes app DB.
  const connect=MongoClient.prototype.connect;let calls=0;MongoClient.prototype.connect=function(){calls++;throw Error('CONNECT_SENTINEL');};
  try {for(const name of ['project2_app_v1','project1_app_v2','arbitrary']){const uri=new URL(base.uri);uri.pathname='/'+name;await assert.rejects(initializePhase2Schema({uri:uri.toString(),dbName:name}));}assert.equal(calls,0);}finally{MongoClient.prototype.connect=connect;}
  report.applicationAfter=await fingerprint(client.db(base.dbName));assert.deepEqual(report.applicationAfter,appBefore);report.status='passed';
 } finally {writeFileSync(`${directory}/matrix.json`,JSON.stringify(report,null,2));await client.close();}
});
