import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {createHash,randomUUID} from 'node:crypto';
import {BSON,ClientSession,Collection,Long,MongoServerError,ObjectId} from 'mongodb';
import {MongoClient,testMongoOptions} from './database-client.js';
import type {Db,Document} from 'mongodb';
import {normalizeQuestions} from '@survey/shared';
import {loadConfig} from '../apps/api/src/config.js';
import {assertOwnedDatabaseInstance,verifyConnectedDatabaseInstance} from '../apps/api/src/database/instance-ownership.js';
import {openPhase2Context,isReceiptUniqueConflict} from '../apps/api/src/database/phase2-context.js';
import {bindingHashOf,checkBindingSet} from '../apps/api/src/database/binding-integrity.js';
import {decodeOperationReceipt,assertReceiptSize} from '../apps/api/src/database/receipt-codec.js';
import {prepareOperation} from '../apps/api/src/database/operation-contract.js';
import type {Operation,OperationRequest,OperationResults} from '../apps/api/src/database/operation-contract.js';
import {contentToBson} from '../apps/api/src/content-codec.js';
import {toBson} from '../apps/api/src/question-codec.js';
import {hash} from '../apps/api/src/core/common.js';
import {isolatedTestConfig,evidenceDirectory} from './runtime-environment.js';

const copy=(value:Document):Document=>BSON.deserialize(BSON.serialize(value),{promoteLongs:false});
const code=(wanted:string)=>(error:{code?:string})=>error.code===wanted;
const labelled=(label:string)=>{const e=new MongoServerError({message:'synthetic labelled test hook',code:112});e.addErrorLabel(label);return e;};
async function fingerprint(db:Db){const result:Document={};for(const c of (await db.listCollections().toArray()).sort((a,b)=>a.name.localeCompare(b.name))){const docs=await db.collection(c.name).find().sort({_id:1}).toArray();result[c.name]={options:c.options,indexes:await db.collection(c.name).indexes(),count:docs.length,dataHash:createHash('sha256').update(BSON.EJSON.stringify(docs,{relaxed:false})).digest('hex')};}return result;}

test('W02-B actual receipts, binding consistency, CAS and replica-set rollback',async t=>{
 const directory=evidenceDirectory('bindings-receipts'),base=loadConfig(),owned=assertOwnedDatabaseInstance(),fixture=new MongoClient(base.uri,{...testMongoOptions(),promoteLongs:false});await fixture.connect();await verifyConnectedDatabaseInstance(fixture,owned);
 const before=await fingerprint(fixture.db(base.dbName));writeFileSync(`${directory}/application-before.json`,JSON.stringify(before,null,2));
 const target=isolatedTestConfig('w02b'),context=await openPhase2Context(target),db=fixture.db(target.dbName),evidence:Document={database:target.dbName,owned,checks:[],syntheticFixtures:true};
 const actorId=new ObjectId(),otherId=new ObjectId(),now=new Date();
 await db.collection('users').insertMany([actorId,otherId].map((_id,i)=>({_id,schemaVersion:1,createdAt:now,updatedAt:now,username:`w02b_${i}`,usernameKey:`w02b_${i}`,passwordHash:'synthetic-no-login'})));
 const actor=context.forActor(actorId),other=context.forActor(otherId);
 const questionId=new ObjectId(),versionId=new ObjectId(),content={type:'number' as const,title:'年龄😀',validation:{min:'0',max:'120',integerOnly:true}},contentHash=hash(content);
 await db.collection('question_items').insertOne({_id:questionId,schemaVersion:1,createdAt:now,updatedAt:now,ownerId:actorId,revision:0,accessFence:0,latestVersionId:versionId,nextVersion:2,draft:null,origin:null});
 await db.collection('question_versions').insertOne({_id:versionId,schemaVersion:1,createdAt:now,questionId,version:1,content:contentToBson(content),contentHash,parentVersionId:null,restoredFromVersionId:null,operation:'save',createdBy:actorId,evidenceKey:null,distributionSource:{kind:'original',sourceQuestionId:null,sourceVersionId:null}});
 const survey=async(owner=actorId)=>{const id=new ObjectId();await db.collection('surveys').insertOne({_id:id,schemaVersion:3,ownerId:owner,publicId:id.toHexString(),usageNumber:'u_'+id.toHexString(),originTemplate:null,title:'W02-B合成问卷',description:'not business API output',status:'draft',allowAnonymous:false,allowRepeat:false,expiresAt:null,definitionVersion:1,revision:0,structureLocked:false,submissionCount:0,currentPublishedVersion:null,currentVersionSubmissionCount:0,questions:[],copiedFromId:null,firstPublishedAt:null,createdAt:now,updatedAt:now});return id;};
 const attachRequest=(id:ObjectId,key=randomUUID(),revision=0):OperationRequest<'attachQuestion'>=>({operation:'attachQuestion',path:{surveyId:id.toHexString()},body:{expectedRevision:revision,questionVersionId:versionId.toHexString(),position:0,required:true,jumpRules:[{id:'rule',condition:{op:'gte',number:'0.00'},targetQuestionId:'missing'}]},requestKey:key});
 const attach=(id:ObjectId,request=attachRequest(id),hooks={})=>actor.execute(request,(session,fixed)=>actor.bindings.attachOwned(id,fixed.body,session),hooks);
 const sub=async(name:string,work:()=>Promise<void>)=>{await t.test(name,work);evidence.checks.push(name);};
 try{
  await sub('R01 ten operations strict storage/decode and first/replay status',async()=>{
   const oid=new ObjectId().toHexString(),instance={revision:2,draftDefinitionRevision:3,instanceId:'automatic_id',questionVersionId:versionId.toHexString(),validationIssues:[]};
   const inputs:OperationRequest[]=[
    {operation:'createQuestion',path:{},body:{content},requestKey:'ten'},
    {operation:'saveVersion',path:{questionId:oid},body:{expectedRevision:0,expectedDraftRevision:0},requestKey:'ten'},
    {operation:'restoreVersion',path:{questionId:oid},body:{expectedRevision:0,sourceVersionId:versionId.toHexString()},requestKey:'ten'},
    {operation:'forkQuestion',path:{versionId:oid},body:{content},requestKey:'ten'},
    attachRequest(new ObjectId(),'ten'),
    {operation:'replaceQuestion',path:{surveyId:oid,instanceId:'instance'},body:{expectedRevision:0,questionVersionId:versionId.toHexString()},requestKey:'ten'},
    {operation:'saveInlineQuestion',path:{surveyId:oid,instanceId:'instance'},body:{expectedRevision:0},requestKey:'ten'},
    {operation:'createBank',path:{},body:{name:'fixture bank'},requestKey:'ten'},
    {operation:'createTemplate',path:{},body:{surveyId:oid,publishedVersion:1,expectedSurveyRevision:0},requestKey:'ten'},
    {operation:'adoptTemplate',path:{templateId:oid},body:{expectedTemplateRevision:0},requestKey:'ten'},
   ];
   for(const input of inputs){const isInstance=['attachQuestion','replaceQuestion','saveInlineQuestion'].includes(input.operation);const data:OperationResults[Operation]=isInstance?instance:input.operation==='adoptTemplate'?{surveyId:oid,revision:0}:{resourceId:oid,versionId:null,revision:null};
    const first=await actor.execute(input,async()=>data);assert.equal(first.httpStatus,isInstance?200:201);assert.equal(first.data.replayed,false);
    const replay=await actor.execute(input,async()=>{throw Error('BUSINESS_MUST_NOT_RUN');});assert.deepEqual(replay.data,{...data,replayed:true});assert.equal(replay.httpStatus,200);
   }
   assert.equal(await db.collection('operation_receipts').countDocuments({requestKey:'ten'}),10);
  });
  await sub('R02 scopes, fixed request hash/Decimal normalization and invalid input before callback',async()=>{
   const request:OperationRequest<'saveVersion'>={operation:'saveVersion',path:{questionId:questionId.toHexString()},body:{expectedRevision:0,expectedDraftRevision:0},requestKey:'scope'};
   const result={resourceId:questionId.toHexString(),versionId:versionId.toHexString(),revision:1};
   for(const [who,r] of [[actor,request],[other,request],[actor,{...request,path:{questionId:new ObjectId().toHexString()}}],[actor,{...request,requestKey:'scope2'}],[actor,{...request,operation:'restoreVersion',body:{expectedRevision:0,sourceVersionId:versionId.toHexString()}}]] as const)assert.equal((await who.execute(r,async()=>result)).data.replayed,false);
   await assert.rejects(actor.execute({...request,body:{expectedRevision:1,expectedDraftRevision:0}},async()=>{throw Error('NOT_CALLED');}),code('OPERATION_IDEMPOTENCY_CONFLICT'));
   const one=prepareOperation(actorId,{operation:'createQuestion',path:{},body:{content:{...content,validation:{...content.validation,min:'0.00'}}},requestKey:'d'});
   const two=prepareOperation(actorId,{operation:'createQuestion',path:{},body:{content:{...content,validation:{...content.validation,min:'0e1'}}},requestKey:'d'});assert.equal(one.requestHash,two.requestHash);
   const persisted=(await db.collection('operation_receipts').findOne({operation:'saveVersion',requestKey:'scope',actorId}))!;const count=await db.collection('operation_receipts').countDocuments();let collision:unknown;
   await assert.rejects(db.collection('operation_receipts').insertOne({...copy(persisted),_id:new ObjectId()}),(e:{code?:number})=>{collision=e;return e.code===11000;});assert.equal(isReceiptUniqueConflict(collision,prepareOperation(actorId,request)),true);assert.equal(await db.collection('operation_receipts').countDocuments(),count);
   await assert.rejects(actor.execute({...request,body:{expectedRevision:0,expectedDraftRevision:0,ownerId:otherId.toHexString()}},async()=>result),code('INVALID_REQUEST'));
  });
  let mainId:ObjectId,firstData:Document,firstBinding:Document;
  await sub('R03/B14 owner attach commits full nonempty issues and replays without current-resource reads',async()=>{
   mainId=await survey();const request=attachRequest(mainId,'historical');const first=await attach(mainId,request);firstData=first.data;
   assert.equal(firstData.validationIssues.length,1);firstBinding=(await db.collection('survey_question_bindings').findOne({surveyId:mainId,scope:'draft'}))!;
   assert.ok(await actor.retainedDraft(mainId,firstBinding.instanceId,versionId,firstBinding.acquisitionId));
   assert.equal(await actor.retainedDraft(mainId,'another_instance',versionId,firstBinding.acquisitionId),null);
   assert.equal(await actor.retainedDraft(mainId,firstBinding.instanceId,new ObjectId(),firstBinding.acquisitionId),null);
   assert.equal(await actor.retainedDraft(mainId,firstBinding.instanceId,versionId,new ObjectId()),null);
   assert.equal((await db.collection('surveys').findOne({_id:mainId}))!.revision,1);
   await actor.transaction(session=>actor.bindings.removeDraft(mainId,firstData.instanceId,1,session));
   assert.equal(await db.collection('survey_question_bindings').countDocuments({surveyId:mainId,scope:'draft'}),0);
   assert.equal(await actor.retainedDraft(mainId,firstBinding.instanceId,versionId,firstBinding.acquisitionId),null);
   const findOne=Collection.prototype.findOne,readCollections:string[]=[];
   Collection.prototype.findOne=function(...args){readCollections.push(this.collectionName);if(!['users','operation_receipts'].includes(this.collectionName))throw Error('CURRENT_RESOURCE_READ_FORBIDDEN');return Reflect.apply(findOne,this,args);};
   let replay;try{replay=await actor.execute(request,async()=>{throw Error('CURRENT_SURVEY_VERSION_BINDING_GRANT_TEMPLATE_READ_MUST_NOT_RUN');});}finally{Collection.prototype.findOne=findOne;}
   assert.deepEqual(readCollections,['users','operation_receipts']);
   assert.deepEqual(replay.data,{...firstData,replayed:true});assert.equal((await db.collection('surveys').findOne({_id:mainId}))!.revision,2);
   evidence.historicalReplay={first:firstData,replayed:replay.data,currentRevision:2,draftBindings:0};
  });
  await sub('R05 runtime corruption decoder rejects unsupported/missing/mismatched fields and converts safe BSON integers',async()=>{
   const receipt=(await db.collection('operation_receipts').findOne({operation:'attachQuestion',requestKey:'historical'}))!;
   for(const bad of [{...copy(receipt),resultVersion:2},{...copy(receipt),result:{kind:'instanceSave',data:{revision:1}}},{...copy(receipt),operation:'adoptTemplate'},{...copy(receipt),extra:1},{...copy(receipt),result:{...copy(receipt).result,data:{...receipt.result.data,revision:Long.fromString('9007199254740992')}}}])assert.throws(()=>decodeOperationReceipt(bad),code('OPERATION_RECEIPT_UNAVAILABLE'));
   const safe=copy(receipt);safe.result.data.revision=Long.fromString('9007199254740991');safe.result.data.draftDefinitionRevision=Long.fromNumber(3);const dto=decodeOperationReceipt(safe);assert.equal(dto.result.kind,'instanceSave');assert.equal(dto.result.data.revision,Number.MAX_SAFE_INTEGER);assert.doesNotThrow(()=>JSON.stringify(dto.result.data));
   const raw=copy(receipt),detached=decodeOperationReceipt(raw);raw.result.data.validationIssues[0].message='mutated by original caller';assert.notEqual((detached.result.data as Document).validationIssues[0].message,raw.result.data.validationIssues[0].message);
  });
  await sub('R06/R09 result size and both precommit fault points roll back CAS/binding/receipt',async()=>{
   for(const point of ['resultSize','documentSize','afterBusiness','afterReceipt']){const id=await survey(),request=attachRequest(id,'rollback_'+point),initial=await fingerprint(db);
    if(point.endsWith('Size'))await assert.rejects(actor.execute(request,async(session,fixed)=>{const data=await actor.bindings.attachOwned(id,fixed.body,session);return {...data,validationIssues:Array.from({length:point==='resultSize'?100:400},()=>({code:'LIMIT',field:'/x',questionId:null,message:'汉'.repeat(1000)}))};}),code('RECEIPT_TOO_LARGE'));
    else await assert.rejects(attach(id,request,{[point]:()=>{throw Error('INJECTED_'+point);}}),/INJECTED/);
    assert.deepEqual(await fingerprint(db),initial);evidence.checks.push('rollback database fingerprint identical: '+point);
   }
   assert.throws(()=>assertReceiptSize({result:{kind:'resourceReceipt',data:{}},padding:'x'.repeat(1048576)}),code('RECEIPT_TOO_LARGE'));
  });
  await sub('R07 same-key race commits once; different-key same-revision CAS is one success/one EDIT_CONFLICT',async()=>{
   const id=await survey(),request=attachRequest(id,'same_race');let entered=0,release!:()=>void;const barrier=new Promise<void>(resolve=>release=resolve);
   const work=async(session:Parameters<typeof actor.bindings.attachOwned>[2],fixed:ReturnType<typeof prepareOperation>)=>{entered++;if(entered===2)release();if(entered<=2)await barrier;return actor.bindings.attachOwned(id,fixed.body,session);};
   const results=await Promise.all([actor.execute(request,work),actor.execute(request,work)]);assert.deepEqual({...results[0].data,replayed:false},{...results[1].data,replayed:false});assert.equal(results.filter(r=>!r.data.replayed).length,1);
   assert.equal(await db.collection('survey_question_bindings').countDocuments({surveyId:id}),1);assert.equal(await db.collection('operation_receipts').countDocuments({resourceKey:id.toHexString(),requestKey:'same_race'}),1);assert.equal((await db.collection('surveys').findOne({_id:id}))!.revision,1);
   const casId=await survey();const outcomes=await Promise.allSettled([attach(casId,attachRequest(casId,'cas_a')),attach(casId,attachRequest(casId,'cas_b'))]);assert.equal(outcomes.filter(o=>o.status==='fulfilled').length,1);assert.equal((outcomes.find(o=>o.status==='rejected') as PromiseRejectedResult).reason.code,'EDIT_CONFLICT');assert.equal((await db.collection('surveys').findOne({_id:casId}))!.revision,1);
   evidence.concurrency={sameKey:{callbacksEntered:entered,businessEffects:1,bindings:1,receipts:1,revision:1},differentKeys:{success:1,editConflict:1,revision:1}};
  });
  await sub('R10 committed response loss replays; labelled hooks bounded and unknown commit confirmation',async()=>{
   const id=await survey(),request=attachRequest(id,'lost');await assert.rejects(attach(id,request,{afterCommit:()=>{throw Error('SIMULATED_LOST_RESPONSE');}}),/SIMULATED_LOST_RESPONSE/);
   assert.equal((await attach(id,request)).data.replayed,true);assert.equal((await db.collection('surveys').findOne({_id:id}))!.revision,1);
   const retryId=await survey();let attempts=0;await attach(retryId,attachRequest(retryId,'transient'),{afterReceipt:()=>{if(++attempts===1)throw labelled('TransientTransactionError');}});assert.equal(attempts,2);assert.equal((await db.collection('surveys').findOne({_id:retryId}))!.revision,1);
   const exhaustedId=await survey();let exhausted=0;await assert.rejects(attach(exhaustedId,attachRequest(exhaustedId,'exhaust'),{afterReceipt:()=>{exhausted++;throw labelled('TransientTransactionError');}}),code('OPERATION_RETRY_LATER'));assert.equal(exhausted,3);assert.equal((await db.collection('surveys').findOne({_id:exhaustedId}))!.revision,0);
   const unknownId=await survey();const confirmed=await attach(unknownId,attachRequest(unknownId,'unknown_confirm'),{afterCommit:()=>{throw labelled('UnknownTransactionCommitResult');}});assert.equal(confirmed.data.replayed,true);assert.equal((await db.collection('surveys').findOne({_id:unknownId}))!.revision,1);
   const unconfirmedId=await survey(),unchanged=await fingerprint(db);await assert.rejects(attach(unconfirmedId,attachRequest(unconfirmedId,'unknown_unconfirmed'),{afterReceipt:()=>{throw labelled('UnknownTransactionCommitResult');}}),code('OPERATION_OUTCOME_UNKNOWN'));assert.deepEqual(await fingerprint(db),unchanged);
   const commit=ClientSession.prototype.commitTransaction;let commitAttempts=0,businessCalls=0;
   ClientSession.prototype.commitTransaction=async function(){if(++commitAttempts<3)throw labelled('UnknownTransactionCommitResult');return Reflect.apply(commit,this,[]);};
   try{const commitId=await survey();await attach(commitId,attachRequest(commitId,'commit_retry'),{afterBusiness:()=>{businessCalls++;}});assert.equal(commitAttempts,3);assert.equal(businessCalls,1);}finally{ClientSession.prototype.commitTransaction=commit;}
   // Hook labels are synthetic; all CAS/binding/receipt commits and rollbacks above are real.
   evidence.errorHooks={synthetic:true,realNetworkFailure:false,transientAttempts:2,boundedAttempts:3,unknownConfirmedByReceipt:true,unknownUnconfirmed:'OPERATION_OUTCOME_UNKNOWN',commitAttempts:3,businessCallsForCommitRetry:1};
  });
    await sub('S04 internal owner acquisition rejects the same formal version without partial writes',async()=>{
     const id=await survey();await attach(id,attachRequest(id,'s04_first'));
     const initial=await fingerprint(db);
     await assert.rejects(attach(id,attachRequest(id,'s04_duplicate',1)),code('DUPLICATE_QUESTION_VERSION'));
     assert.deepEqual(await fingerprint(db),initial);
    });
    let historyId:ObjectId,historyRows:Document[],snapshot1:Document;
  await sub('B11/B13/B15/B17 complete draft/publication, bindingHash, config retention and immutable history',async()=>{
   historyId=await survey();const attached=await attach(historyId,{...attachRequest(historyId,'history'),body:{expectedRevision:0,questionVersionId:versionId.toHexString(),position:0,required:false,jumpRules:[]}});
   const original=(await actor.readDraft(historyId)).bindings[0];await actor.transaction(session=>actor.bindings.updateConfig(historyId,attached.data.instanceId,1,{required:true,jumpRules:[]},session));
   const unchanged=(await actor.readDraft(historyId)).bindings[0];assert.ok(unchanged.acquisitionId.equals(original.acquisitionId));assert.deepEqual(unchanged.acquiredAt,original.acquiredAt);assert.deepEqual(unchanged.authorization,original.authorization);assert.equal(unchanged.contentHash,original.contentHash);
   const s=(await db.collection('surveys').findOne({_id:historyId}))!;const definition={title:s.title,description:s.description,questions:normalizeQuestions([{id:attached.data.instanceId,...content,required:true,jumpRules:[]}])};
   snapshot1={_id:new ObjectId(),schemaVersion:2,surveyId:historyId,version:1,sourceDefinitionVersion:3,definition:{...definition,questions:toBson(definition.questions)},policySnapshot:{allowAnonymous:false,allowRepeat:false},definitionHash:hash({definition,policy:{allowAnonymous:false,allowRepeat:false}}),bindingHash:bindingHashOf([original]),publishedAt:now,publishedBy:actorId,publicationRequestId:'history1',publicationRequestHash:'a'.repeat(64),origin:{kind:'publication'}};
   await db.collection('survey_versions').insertOne(snapshot1);await actor.transaction(session=>actor.bindings.insertOwnerPublication(historyId,1,session));
   const answers=[{questionId:attached.data.instanceId,type:'number',number:'0'}],response={_id:new ObjectId(),schemaVersion:2,surveyId:historyId,surveyDefinitionVersion:1,respondentId:otherId,anonymous:false,repeatAllowed:false,requestId:'synthetic_historical_response',payloadHashVersion:2,payloadHash:hash({publishedVersion:1,anonymous:false,answers}),answers:[{...answers[0],number:BSON.Decimal128.fromString('0')}],submittedAt:now};await db.collection('responses').insertOne(response);
   const second={...copy(snapshot1),_id:new ObjectId(),version:2,publicationRequestId:'history2'};await db.collection('survey_versions').insertOne(second);await actor.transaction(session=>actor.bindings.insertOwnerPublication(historyId,2,session));
   assert.equal((await actor.readPublication(historyId,1)).bindings.length,1);assert.equal((await actor.readPublication(historyId,2)).bindings.length,1);
   assert.equal((await actor.readPublicationInstance(historyId,1,attached.data.instanceId))!.instanceId,attached.data.instanceId);assert.equal(await actor.readPublicationInstance(historyId,2,'not-present'),null);
   historyRows=await db.collection('survey_question_bindings').find({surveyId:historyId,scope:'publication'}).sort({publicationVersion:1}).toArray();
   const pair=[original,{...original,instanceId:'z',questionVersionId:new ObjectId()}];assert.equal(bindingHashOf(pair),bindingHashOf([...pair].reverse()));assert.notEqual(bindingHashOf(pair),bindingHashOf([original,{...pair[1],acquisitionId:new ObjectId()}]));
   const newerId=new ObjectId(),newerContent={...content,title:'更新年龄'};await db.collection('question_versions').insertOne({...copy((await db.collection('question_versions').findOne({_id:versionId}))!),_id:newerId,version:2,content:contentToBson(newerContent),contentHash:hash(newerContent),parentVersionId:versionId});
   await actor.transaction(session=>actor.bindings.replaceOwned(historyId,attached.data.instanceId,{expectedRevision:2,questionVersionId:newerId.toHexString()},session));
   const replaced=(await actor.readDraft(historyId)).bindings[0];assert.ok(!replaced.acquisitionId.equals(original.acquisitionId));
   await actor.transaction(session=>actor.bindings.replaceOwned(historyId,attached.data.instanceId,{expectedRevision:3,questionVersionId:newerId.toHexString()},session));assert.ok((await actor.readDraft(historyId)).bindings[0].acquisitionId.equals(replaced.acquisitionId));
   await actor.transaction(session=>actor.bindings.removeDraft(historyId,attached.data.instanceId,4,session));assert.deepEqual(await db.collection('survey_question_bindings').find({surveyId:historyId,scope:'publication'}).sort({publicationVersion:1}).toArray(),historyRows);
   assert.deepEqual(await db.collection('survey_versions').findOne({_id:snapshot1._id}),snapshot1);assert.equal((await actor.readPublication(historyId,1)).bindings.length,1);
   assert.deepEqual(await db.collection('responses').findOne({_id:response._id}),response);assert.equal((await actor.readDraft(historyId)).bindings.length,0);
   await assert.rejects(actor.transaction(session=>actor.bindings.replaceOwned(historyId,attached.data.instanceId,{expectedRevision:5,questionVersionId:newerId.toHexString()},session)),code('QUESTION_MAPPING_INCOMPLETE'));
   assert.deepEqual(Object.keys(actor.bindings).sort(),['attachOwned','insertOwnerPublication','removeDraft','replaceOwned','updateConfig']);
   assert.equal(Object.keys(actor.bindings).some(k=>/updatePublication|deletePublication|upsert|replaceOne/.test(k)),false);
  });
  await sub('R08 nonreceipt unique conflict propagates and publication insert never overwrites',async()=>{
   const id=await survey();const a=await attach(id,{...attachRequest(id,'dup_source'),body:{expectedRevision:0,questionVersionId:versionId.toHexString(),position:0}});
   const binding=(await actor.readDraft(id)).bindings[0],s=(await db.collection('surveys').findOne({_id:id}))!;const def={title:s.title,description:s.description,questions:[{id:a.data.instanceId,...content,required:false,jumpRules:[]}]};
   await db.collection('survey_versions').insertOne({...copy(snapshot1),_id:new ObjectId(),surveyId:id,sourceDefinitionVersion:2,definition:{...def,questions:toBson(def.questions)},definitionHash:hash({definition:def,policy:{allowAnonymous:false,allowRepeat:false}}),bindingHash:bindingHashOf([binding])});
   await actor.transaction(session=>actor.bindings.insertOwnerPublication(id,1,session));const initial=await fingerprint(db);
   const request:OperationRequest<'createBank'>={operation:'createBank',path:{},body:{name:'unique-failure-fixture'},requestKey:'nonreceipt_duplicate'};
   let actual:unknown;await assert.rejects(actor.execute(request,async session=>{await actor.bindings.insertOwnerPublication(id,1,session);return {resourceId:id.toHexString(),versionId:null,revision:0};}),(e:{code?:number})=>{actual=e;return e.code===11000;});
   assert.equal(isReceiptUniqueConflict(actual,prepareOperation(actorId,request)),false);assert.deepEqual(await fingerprint(db),initial);
  });
  await sub('B12/B16 wrong owner, no transaction and forged unsupported sources rejected without writes',async()=>{
   const id=await survey(),foreign=await survey(otherId),initial=await fingerprint(db);
   await assert.rejects(actor.bindings.attachOwned(id,{expectedRevision:0,questionVersionId:versionId.toHexString(),position:0},undefined as never),/P2_TRANSACTION_REQUIRED/);
   const foreignSession=fixture.startSession();foreignSession.startTransaction();try{await assert.rejects(actor.bindings.attachOwned(id,{expectedRevision:0,questionVersionId:versionId.toHexString(),position:0},foreignSession),/P2_TRANSACTION_REQUIRED/);}finally{await foreignSession.abortTransaction();await foreignSession.endSession();}
   await assert.rejects(attach(foreign),code('NOT_FOUND'));
   for(const kind of ['share','template','legacyImport'])await assert.rejects(actor.transaction(session=>actor.bindings.attachOwned(id,{expectedRevision:0,questionVersionId:versionId.toHexString(),position:0,authorization:{kind},ownerId:actorId,acquisitionId:new ObjectId(),mappingKind:kind,evidenceKey:'fake'},session)),code('INVALID_REQUEST'));
   await assert.rejects(other.transaction(session=>other.bindings.attachOwned(foreign,{expectedRevision:0,questionVersionId:versionId.toHexString(),position:0},session)),code('NOT_FOUND'));
   assert.deepEqual(await fingerprint(db),initial);
   const connect=MongoClient.prototype.connect;let connections=0;MongoClient.prototype.connect=function(){connections++;throw Error('CONNECT_FORBIDDEN');};
   try{await assert.rejects(openPhase2Context({uri:base.uri,dbName:base.dbName}));assert.equal(connections,0);}finally{MongoClient.prototype.connect=connect;}
  });
  await sub('BSON Long content counts normalize without changing the Content hash',async()=>{
   const qid=new ObjectId(),vid=new ObjectId(),c={type:'multiple',title:'多选',options:[{id:'a',label:'A'},{id:'b',label:'B'}],validation:{minChoices:1,maxChoices:2}};
   await db.collection('question_items').insertOne({...copy((await db.collection('question_items').findOne({_id:questionId}))!),_id:qid,latestVersionId:vid});
   await db.collection('question_versions').insertOne({...copy((await db.collection('question_versions').findOne({_id:versionId}))!),_id:vid,questionId:qid,content:{...c,validation:{minChoices:Long.fromNumber(1),maxChoices:Long.fromNumber(2)}},contentHash:hash(c)});
   const id=await survey(),request={...attachRequest(id,'long_content'),body:{expectedRevision:0,questionVersionId:vid.toHexString(),position:0}};
   await attach(id,request);assert.equal((await actor.readDraft(id)).bindings[0].contentHash,hash(c));
  });
  await sub('B12 corrupted/missing/extra/version/hash/owner mappings and legacy unmapped snapshots fail closed',async()=>{
   const id=await survey();await attach(id,{...attachRequest(id,'corruption_seed'),body:{expectedRevision:0,questionVersionId:versionId.toHexString(),position:0}});
   const s=(await db.collection('surveys').findOne({_id:id}))!,b=(await db.collection('survey_question_bindings').findOne({surveyId:id}))!,v=(await db.collection('question_versions').findOne({_id:versionId}))!;
   const check=(rows:Document[],versions:Document[],surveyDoc=s,snapshot?:Document)=>()=>checkBindingSet(surveyDoc as never,rows as never,versions as never,snapshot as never);
   for(const [name,rows,versions] of [
    ['missing',[],[v]],['extra',[b,{...b,_id:new ObjectId(),instanceId:'not_in_survey'}],[v]],['duplicate',[b,b],[v]],['wrong owner',[{...b,ownerId:otherId}],[v]],
    ['missing version',[b],[]],['version belongs another question',[b],[{...v,questionId:new ObjectId()}]],['content hash mismatch',[{...b,contentHash:'a'.repeat(64)}],[v]],['stored content tampered',[b],[{...v,content:{...v.content,title:'tampered'}}]],['wrong draft version',[{...b,publicationVersion:1}],[v]],
   ] as [string,Document[],Document[]][]){assert.throws(check(rows,versions),code('QUESTION_MAPPING_INCOMPLETE'));evidence.checks.push('mapping rejection: '+name);}
   assert.throws(check([b],[v],{...s,questions:[{...s.questions[0],unexpected:true}]}),code('QUESTION_MAPPING_INCOMPLETE'));
   const missing=checkBindingSet(s as never,[],[v] as never,undefined,{requireComplete:false});assert.equal(missing.unformalizedInstanceIds.length,1);
   assert.throws(()=>checkBindingSet(s as never,[],[v] as never,undefined,{requireComplete:false,requiredInstanceIds:[b.instanceId]}),code('QUESTION_MAPPING_INCOMPLETE'));
   // Real schema-valid corrupt relationship; read rejection itself must leave DB untouched.
   await db.collection('survey_question_bindings').updateOne({_id:b._id},{$set:{questionId:new ObjectId()}});const initial=await fingerprint(db);await assert.rejects(actor.readDraft(id),code('QUESTION_MAPPING_INCOMPLETE'));assert.deepEqual(await fingerprint(db),initial);
   const legacy={...copy(snapshot1),_id:new ObjectId(),surveyId:id,schemaVersion:1,version:8,publicationRequestId:'unmapped_legacy'};delete legacy.bindingHash;await db.collection('survey_versions').insertOne(legacy);await assert.rejects(actor.readPublication(id,8),code('QUESTION_MAPPING_INCOMPLETE'));
   const hs=(await db.collection('surveys').findOne({_id:historyId}))!,pub=historyRows![0],hv=(await db.collection('question_versions').findOne({_id:versionId}))!;
   assert.throws(check([pub],[hv],hs,{...snapshot1,bindingHash:'0'.repeat(64)}),code('QUESTION_MAPPING_INCOMPLETE'));
   assert.throws(check([{...pub,snapshotHash:'0'.repeat(64)}],[hv],hs,snapshot1),code('QUESTION_MAPPING_INCOMPLETE'));
   const mappedLegacy={...snapshot1,schemaVersion:1};delete mappedLegacy.bindingHash;assert.doesNotThrow(check([pub],[hv],hs,mappedLegacy));
   for(const authorization of [{kind:'share',grantId:new ObjectId(),grantRevision:Long.fromNumber(7)},{kind:'template',templateId:new ObjectId(),templateHash:'b'.repeat(64)},{kind:'legacyImport',evidenceKey:'retained-fixture'}]){
    const retained={...b,authorization,mappingKind:authorization.kind==='legacyImport'?'legacyImport':'native',evidenceKey:authorization.kind==='legacyImport'?'retained-fixture':null};assert.doesNotThrow(check([retained],[v]));
   }
  });
  const after=await fingerprint(fixture.db(base.dbName));assert.deepEqual(after,before);writeFileSync(`${directory}/application-after.json`,JSON.stringify(after,null,2));evidence.applicationUnchanged=true;evidence.finalCounts=Object.fromEntries(await Promise.all(['surveys','question_versions','survey_question_bindings','operation_receipts'].map(async name=>[name,await db.collection(name).countDocuments()])));evidence.status='passed';
 }finally{writeFileSync(`${directory}/transactions.json`,JSON.stringify(evidence,null,2));await context.close();await fixture.close();}
});
