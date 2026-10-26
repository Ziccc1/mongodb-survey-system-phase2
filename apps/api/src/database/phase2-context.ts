import {databaseClientOptions} from './credentials.js';
import {randomUUID} from 'node:crypto';
import {extractQuestionContent,materializeQuestion,normalizeQuestions,parseQuestionInstanceConfig,validateQuestions} from '@survey/shared';
import type {Question} from '@survey/shared';
import type {Phase2SurveyDocument,Phase2SnapshotDocument,QuestionItemDocument,QuestionVersionDocument,SurveyQuestionBindingDocument} from './phase2-models.js';
import type {InstanceResult} from './operation-contract.js';
import {exact,oidString,safeInteger,stableString} from './operation-contract.js';
import {bindingHashOf,checkBindingSet,contentHashOf,contentOfVersion,mappingIncomplete,questionsFromStorage} from './binding-integrity.js';
import {jsonInteger} from './receipt-codec.js';
import {toBson} from '../question-codec.js';
import {BSON,MongoClient,MongoError,MongoServerError,ObjectId} from 'mongodb';
import type {ClientSession,Db} from 'mongodb';
import type {OperationReceiptDocument} from './phase2-models.js';
import type {Operation,OperationRequest,OperationResults,PreparedOperation,OperationScope} from './operation-contract.js';
import {prepareOperation} from './operation-contract.js';
import {assertReceiptSize,decodeOperationReceipt,receiptData} from './receipt-codec.js';
import type {DraftMappingPolicy} from './binding-integrity.js';
import type {QuestionInstanceConfig} from '@survey/shared';
import {assertOwnedDatabaseInstance,verifyConnectedDatabaseInstance} from './instance-ownership.js';
import {initializePhase2Schema,validatePhase2SchemaTarget,verifyPhase2Schema} from './phase2-initialize.js';
import type {Phase2SchemaTarget} from './phase2-initialize.js';
import {ApiError} from '../errors.js';
import {LibraryService} from '../core/library.js';
import {SurveySourcesService} from '../core/survey-sources.js';
import {QuestionUsageService} from '../core/question-usage.js';
import {TemplateService} from '../core/templates.js';
import {DistributionGrantService} from '../core/distribution-grants.js';
import {assertDistinctVersions} from './source-read.js';
import type {FaultHooks} from '../core/common.js';
import {validatePhase2ApplicationTarget} from '../config.js';
import {verifyPhase2ApplicationSchema} from './phase2-initialize.js';

const options={readConcern:{level:'snapshot' as const},writeConcern:{w:'majority' as const},readPreference:'primary' as const,maxCommitTimeMS:5000};
const conflict=()=>new ApiError(409,'OPERATION_IDEMPOTENCY_CONFLICT','该操作key已用于不同的固定请求');
const retryLater=()=>new ApiError(503,'OPERATION_RETRY_LATER','操作竞争重试耗尽，请保留原key重试');
const unknown=()=>new ApiError(503,'OPERATION_OUTCOME_UNKNOWN','提交结果尚未确认，请使用原key确认');
const label=(error:unknown,name:string)=>error instanceof MongoError&&error.hasErrorLabel(name);
// Let the contending short transaction commit before reopening a fresh snapshot; still at most three attempts.
const contentionBackoff=(attempt:number)=>new Promise<void>(resolve=>setTimeout(resolve,50*3**attempt));
export interface TransactionHooks {afterBusiness?:()=>void|Promise<void>;afterReceipt?:()=>void|Promise<void>;afterCommit?:()=>void|Promise<void>}
export interface OperationResponse<O extends Operation> {httpStatus:200|201;data:OperationResults[O]&{replayed:boolean}}
export function isReceiptUniqueConflict(error:unknown,scope:OperationScope):boolean {
  if(!(error instanceof MongoServerError)||error.code!==11000)return false;
  const pattern=error.keyPattern as Record<string,unknown>|undefined,values=error.keyValue as Record<string,unknown>|undefined;
  return !!pattern&&Object.keys(pattern).sort().join(',')==='actorId,operation,requestKey,resourceKey'
    &&Object.values(pattern).every(v=>v===1)&&!!values&&values.actorId instanceof ObjectId&&values.actorId.equals(scope.actorId)
    &&values.operation===scope.operation&&values.resourceKey===scope.resourceKey&&values.requestKey===scope.requestKey
    &&error.message.includes('operation_receipts index: uq_operation ');
}

/** Implementation detail: constructed only by the owned context; no arbitrary-Db public factory. */
class BindingRepository {
  constructor(private readonly db:Db,private readonly requireWrite:(session:ClientSession)=>void){}
  private async survey(actorId:ObjectId,surveyId:ObjectId,session:ClientSession){
    const s=await this.db.collection<Phase2SurveyDocument>('surveys').findOne({_id:surveyId},{session});
    if(!s||!s.ownerId.equals(actorId))throw new ApiError(404,'NOT_FOUND','资源不存在或不可访问');return s;
  }
  async read(actorId:ObjectId,surveyId:ObjectId,session:ClientSession,publicationVersion?:number,policy:DraftMappingPolicy={requireComplete:true}) {
    try{
    const s=await this.survey(actorId,surveyId,session);
    const snapshot=publicationVersion===undefined?undefined:await this.db.collection<Phase2SnapshotDocument>('survey_versions').findOne({surveyId,version:publicationVersion},{session});
    if(publicationVersion!==undefined&&!snapshot)throw mappingIncomplete();
    const bindings=await this.db.collection<SurveyQuestionBindingDocument>('survey_question_bindings').find({surveyId,scope:snapshot?'publication':'draft',publicationVersion:publicationVersion??0},{session}).toArray();
    const versions:QuestionVersionDocument[]=[];
    for(const b of bindings){
      const v=await this.db.collection<QuestionVersionDocument>('question_versions').findOne({_id:b.questionVersionId},{session});if(v)versions.push(v);
      const item=await this.db.collection<QuestionItemDocument>('question_items').findOne({_id:b.questionId},{session});
      if(!item||(b.authorization.kind==='owner'&&!item.ownerId.equals(s.ownerId)))throw mappingIncomplete();
    }
    return checkBindingSet(s,bindings,versions,snapshot??undefined,policy);
    }catch(error){if(error instanceof MongoError||(error instanceof ApiError&&error.code==='NOT_FOUND'))throw error;throw mappingIncomplete();}
  }
  private async editable(actorId:ObjectId,surveyId:ObjectId,revision:number,session:ClientSession){
    this.requireWrite(session);const s=await this.survey(actorId,surveyId,session);
    if(!['draft','paused'].includes(s.status))throw new ApiError(409,'SURVEY_STATE_CONFLICT','仅草稿或暂停问卷可变更来源');
    if(jsonInteger(s.revision)!==revision)throw new ApiError(409,'EDIT_CONFLICT','问卷修订已变化');return s;
  }
  private async cas(s:Phase2SurveyDocument,questions:Question[],expectedRevision:number,session:ClientSession){
    const normalized=normalizeQuestions(questions),checked=validateQuestions(normalized);
    if(checked.errors.length)throw new ApiError(422,'DEFINITION_INVALID','题目定义不合法');
    if(expectedRevision>=Number.MAX_SAFE_INTEGER||jsonInteger(s.definitionVersion)>=Number.MAX_SAFE_INTEGER)throw new ApiError(422,'DEFINITION_INVALID','修订号超限');
    const stored=toBson(normalized);if(BSON.calculateObjectSize({...s,questions:stored})>2097152)throw new ApiError(422,'DEFINITION_INVALID','问卷超过容量限制');
    const result=await this.db.collection<Phase2SurveyDocument>('surveys').updateOne({_id:s._id,ownerId:s.ownerId,status:s.status,revision:expectedRevision},{$set:{questions:stored as Phase2SurveyDocument['questions'],updatedAt:new Date()},$inc:{revision:1,definitionVersion:1}},{session});
    if(result.modifiedCount!==1)throw new ApiError(409,'EDIT_CONFLICT','问卷修订已变化');
    return {revision:expectedRevision+1,draftDefinitionRevision:jsonInteger(s.definitionVersion)+1,validationIssues:checked.validationIssues};
  }
  /** Server-only owner acquisition. Strict input excludes authorization/owner/acquisition/evidence. */
  async attachOwned(actorId:ObjectId,surveyId:ObjectId,input:unknown,session:ClientSession):Promise<InstanceResult>{
    this.requireWrite(session);
    const b=exact(input,['expectedRevision','questionVersionId','position'],['required','jumpRules','instanceId']);
    const expected=safeInteger(b.expectedRevision),versionId=new ObjectId(oidString(b.questionVersionId)),position=safeInteger(b.position,0,100);
    const s=await this.editable(actorId,surveyId,expected,session),checked=await this.read(actorId,surveyId,session,undefined,{requireComplete:false});
    const version=await this.db.collection<QuestionVersionDocument>('question_versions').findOne({_id:versionId},{session});
    const item=version&&await this.db.collection<QuestionItemDocument>('question_items').findOne({_id:version.questionId},{session});
    if(!version||!item||!item.ownerId.equals(actorId))throw new ApiError(404,'NOT_FOUND','正式题版不存在或不属于本人');
    if(checked.bindings.some(row=>row.questionId.equals(version.questionId)&&row.questionVersionId.equals(versionId)))throw new ApiError(422,'DUPLICATE_QUESTION_VERSION','同一问卷中同一道题的同一正式版本只能使用一次');
    if(contentHashOf(version)!==version.contentHash)throw mappingIncomplete();
    const instanceId=b.instanceId===undefined?randomUUID():stableString(b.instanceId),questions=questionsFromStorage(s.questions);
    if(position>questions.length||questions.some(q=>q.id===instanceId))throw new ApiError(422,'DEFINITION_INVALID','实例ID或位置无效');
    try{const config=parseQuestionInstanceConfig({required:b.required===undefined?false:b.required,jumpRules:b.jumpRules===undefined?[]:b.jumpRules},version.content.type);
      questions.splice(position,0,materializeQuestion(contentOfVersion(version),config,instanceId));
    }catch{throw new ApiError(422,'DEFINITION_INVALID','实例配置不适用于所选题型');}
    const result=await this.cas(s,questions,expected,session);
    const now=new Date();await this.db.collection<SurveyQuestionBindingDocument>('survey_question_bindings').insertOne({_id:new ObjectId(),schemaVersion:1,createdAt:now,
      surveyId,ownerId:actorId,instanceId,scope:'draft',publicationVersion:0,snapshotHash:null,questionId:version.questionId,questionVersionId:versionId,
      contentHash:version.contentHash,acquisitionId:new ObjectId(),acquiredAt:now,authorization:{kind:'owner'},mappingKind:'native',evidenceKey:null},{session});
    return {...result,instanceId,questionVersionId:versionId.toHexString()};
  }
  async updateConfig(actorId:ObjectId,surveyId:ObjectId,instanceId:string,expected:number,config:QuestionInstanceConfig,session:ClientSession){
    const s=await this.editable(actorId,surveyId,expected,session);await this.read(actorId,surveyId,session,undefined,{requireComplete:false,requiredInstanceIds:[instanceId]});
    const questions=questionsFromStorage(s.questions),index=questions.findIndex(q=>q.id===instanceId);if(index<0)throw mappingIncomplete();
    questions[index]=materializeQuestion(extractQuestionContent(questions[index]),config,instanceId);
    return this.cas(s,questions,expected,session); // Does not regenerate any acquisition fact.
  }
  async replaceOwned(actorId:ObjectId,surveyId:ObjectId,instanceId:string,input:unknown,session:ClientSession):Promise<InstanceResult>{
    this.requireWrite(session);const b=exact(input,['expectedRevision','questionVersionId'],['reviewedJumpRules']);
    const expected=safeInteger(b.expectedRevision),nextId=new ObjectId(oidString(b.questionVersionId));
    const s=await this.editable(actorId,surveyId,expected,session),checked=await this.read(actorId,surveyId,session,undefined,{requireComplete:false,requiredInstanceIds:[instanceId]});
    const old=checked.bindings.find(row=>row.instanceId===instanceId)!;
    const version=await this.db.collection<QuestionVersionDocument>('question_versions').findOne({_id:nextId},{session});
    const item=version&&await this.db.collection<QuestionItemDocument>('question_items').findOne({_id:version.questionId},{session});
    if(!version||!item||!item.ownerId.equals(actorId))throw new ApiError(404,'NOT_FOUND','正式题版不存在或不属于本人');
    const directFork=item.origin?.kind==='fork'&&item.origin.sourceQuestionId.equals(old.questionId)&&item.origin.sourceVersionId.equals(old.questionVersionId)&&jsonInteger(version.version)===1;
    if(!version.questionId.equals(old.questionId)&&!directFork)throw new ApiError(409,'QUESTION_IDENTITY_MISMATCH','替换版本不属于原题或其直接派生');
    assertDistinctVersions(checked.bindings.map(row=>row.instanceId===instanceId?{...row,questionId:version.questionId,questionVersionId:nextId}:row));
    if(contentHashOf(version)!==version.contentHash)throw mappingIncomplete();
    const questions=questionsFromStorage(s.questions),index=questions.findIndex(q=>q.id===instanceId),previous=questions[index];
    try{questions[index]=materializeQuestion(contentOfVersion(version),parseQuestionInstanceConfig({required:previous.required,jumpRules:b.reviewedJumpRules===undefined?previous.jumpRules:b.reviewedJumpRules},version.content.type),instanceId);}
    catch{throw new ApiError(422,b.reviewedJumpRules===undefined?'RULE_REVIEW_REQUIRED':'DEFINITION_INVALID','替换后的规则需要明确检查');}
    const result=await this.cas(s,questions,expected,session);
    if(!nextId.equals(old.questionVersionId)){
      const changed=await this.db.collection<SurveyQuestionBindingDocument>('survey_question_bindings').updateOne({_id:old._id,surveyId,ownerId:actorId,scope:'draft',publicationVersion:0,questionVersionId:old.questionVersionId,acquisitionId:old.acquisitionId},
        {$set:{questionId:version.questionId,questionVersionId:nextId,contentHash:version.contentHash,acquisitionId:new ObjectId(),acquiredAt:new Date(),authorization:{kind:'owner'},mappingKind:'native',evidenceKey:null}},{session});
      if(changed.modifiedCount!==1)throw mappingIncomplete();
    }
    return {...result,instanceId,questionVersionId:nextId.toHexString()};
  }
  async removeDraft(actorId:ObjectId,surveyId:ObjectId,instanceId:string,expected:number,session:ClientSession){
    const s=await this.editable(actorId,surveyId,expected,session);await this.read(actorId,surveyId,session,undefined,{requireComplete:false,requiredInstanceIds:[instanceId]});
    const result=await this.cas(s,questionsFromStorage(s.questions).filter(q=>q.id!==instanceId),expected,session);
    const removed=await this.db.collection('survey_question_bindings').deleteOne({surveyId,ownerId:actorId,scope:'draft',publicationVersion:0,instanceId},{session});
    if(removed.deletedCount!==1)throw mappingIncomplete();return result;
  }
  /** Snapshot must already exist in the same transaction. Only owner acquisitions are supported. */
  async insertOwnerPublication(actorId:ObjectId,surveyId:ObjectId,version:number,session:ClientSession):Promise<void>{
    this.requireWrite(session);const s=await this.survey(actorId,surveyId,session);
    const draft=await this.read(actorId,surveyId,session);
    assertDistinctVersions(draft.bindings);
    if(draft.bindings.some(b=>b.authorization.kind!=='owner'||b.mappingKind!=='native'))throw new ApiError(409,'SOURCE_WRITE_NOT_IMPLEMENTED','本轮只支持owner来源发布绑定');
    const snapshot=await this.db.collection<Phase2SnapshotDocument>('survey_versions').findOne({surveyId,version},{session});if(!snapshot)throw mappingIncomplete();
    if(snapshot.schemaVersion!==2||!snapshot.publishedBy.equals(actorId)||jsonInteger(snapshot.sourceDefinitionVersion)!==jsonInteger(s.definitionVersion))throw mappingIncomplete();
    const rows=draft.bindings.map(b=>({...b,_id:new ObjectId(),createdAt:new Date(),scope:'publication' as const,publicationVersion:version,snapshotHash:snapshot.definitionHash}));
    const versions=await this.db.collection<QuestionVersionDocument>('question_versions').find({_id:{$in:rows.map(b=>b.questionVersionId)}},{session}).toArray();
    checkBindingSet(s,rows,versions,snapshot);
    if(snapshot.schemaVersion===2&&snapshot.bindingHash!==bindingHashOf(rows))throw mappingIncomplete();
    if(rows.length)await this.db.collection<SurveyQuestionBindingDocument>('survey_question_bindings').insertMany(rows,{session,ordered:true});
  }
}

/** Owned, synthetic-only server context. No arbitrary Db constructor or schema-mode switch. */
export async function openPhase2Context(target:Phase2SchemaTarget) {
  return openContext(target,false,{});
}
/** Application entry is verify-only; explicit initialization is a separate CLI. */
export async function openPhase2ApplicationContext(target:Phase2SchemaTarget,faults:FaultHooks={}) {
  return openContext(target,true,faults);
}
async function openContext(target:Phase2SchemaTarget,application:boolean,faults:FaultHooks) {
  if(application)validatePhase2ApplicationTarget(target.uri,target.dbName);else validatePhase2SchemaTarget(target);
  const owned=assertOwnedDatabaseInstance(),client=new MongoClient(target.uri,{...databaseClientOptions(target.databaseAuth),promoteLongs:false,serverSelectionTimeoutMS:5000});
  try {
    await client.connect();await verifyConnectedDatabaseInstance(client,owned);
    if(application)await verifyPhase2ApplicationSchema(target);
    else {await initializePhase2Schema(target);await verifyPhase2Schema(target);}
  }catch(error){await client.close();throw error;}
  const db=client.db(target.dbName),sessions=new WeakSet<ClientSession>();
  const requireWrite=(session:ClientSession)=>{
    if(!session||!sessions.has(session)||session.hasEnded||!session.inTransaction())throw new Error('P2_TRANSACTION_REQUIRED');
  };
  const repository=new BindingRepository(db,requireWrite);
  const collection=db.collection<OperationReceiptDocument>('operation_receipts');
  async function authenticated(actorId:ObjectId){
    if(!(actorId instanceof ObjectId)||!await db.collection('users').findOne({_id:actorId},{projection:{_id:1}}))throw new ApiError(401,'UNAUTHENTICATED','登录主体不存在');
  }
  async function find(scope:OperationScope,session?:ClientSession){
    const raw=await collection.findOne({actorId:scope.actorId,operation:scope.operation,resourceKey:scope.resourceKey,requestKey:scope.requestKey},session?{session}:{readConcern:{level:'majority'}});
    return raw?decodeOperationReceipt(raw):null;
  }
  function response<O extends Operation>(doc:OperationReceiptDocument,request:PreparedOperation,replayed:boolean):OperationResponse<O>{
    if(doc.requestHash!==request.requestHash)throw conflict();
    const data=receiptData<O>(doc,request.operation as O);
    return {httpStatus:replayed?200:doc.firstHttpStatus,data:Object.assign(data,{replayed})};
  }
  async function abort(session:ClientSession){if(session.inTransaction())await session.abortTransaction().catch(()=>{});}
  return Object.freeze({
    databaseName:db.databaseName,
    close:()=>client.close(),
    /** actorId MUST originate from trusted authentication; existence checking is not password authentication. */
    forActor(actorId:ObjectId){
      const actor=new ObjectId(actorId.toHexString());
      const library=new LibraryService(db,actor,requireWrite,faults);
      const surveys=new SurveySourcesService(db,actor,requireWrite,library,faults),usage=new QuestionUsageService(db,actor,library);
      const templates=new TemplateService(db,actor,requireWrite,library,faults),distributionGrants=new DistributionGrantService(db,actor,requireWrite,library);
      const bindings=Object.freeze({
        attachOwned:(surveyId:ObjectId,input:unknown,session:ClientSession)=>repository.attachOwned(actor,surveyId,input,session),
        replaceOwned:(surveyId:ObjectId,instanceId:string,input:unknown,session:ClientSession)=>repository.replaceOwned(actor,surveyId,instanceId,input,session),
        updateConfig:(surveyId:ObjectId,instanceId:string,expected:number,config:QuestionInstanceConfig,session:ClientSession)=>repository.updateConfig(actor,surveyId,instanceId,expected,config,session),
        removeDraft:(surveyId:ObjectId,instanceId:string,expected:number,session:ClientSession)=>repository.removeDraft(actor,surveyId,instanceId,expected,session),
        insertOwnerPublication:(surveyId:ObjectId,version:number,session:ClientSession)=>repository.insertOwnerPublication(actor,surveyId,version,session),
      });
      const transaction=async<T>(work:(session:ClientSession)=>Promise<T>)=>{
        await authenticated(actor);
        for(let attempt=0;attempt<3;attempt++){
          const session=client.startSession();sessions.add(session);
          try{session.startTransaction(options);const result=await work(session);await session.commitTransaction();return result;}
          catch(error){await abort(session);if(label(error,'UnknownTransactionCommitResult'))throw unknown();if(label(error,'TransientTransactionError')){if(attempt<2){await contentionBackoff(attempt);continue;}throw retryLater();}throw error;}
          finally{sessions.delete(session);await session.endSession();}
        }
        throw retryLater();
      };
      return Object.freeze({bindings,transaction,library,surveys,usage,templates,distributionGrants,
        readDraft:(surveyId:ObjectId,policy:DraftMappingPolicy={requireComplete:true})=>transaction(session=>repository.read(actor,surveyId,session,undefined,policy)),
        readPublication:(surveyId:ObjectId,version:number)=>transaction(session=>repository.read(actor,surveyId,session,safeInteger(version,1))),
        retainedDraft:(surveyId:ObjectId,instanceId:string,questionVersionId:ObjectId,acquisitionId:ObjectId)=>transaction(async session=>{
          const rows=await repository.read(actor,surveyId,session,undefined,{requireComplete:false});
          return rows.bindings.find(b=>b.instanceId===instanceId&&b.questionVersionId.equals(questionVersionId)&&b.acquisitionId.equals(acquisitionId))??null;
        }),
        readPublicationInstance:(surveyId:ObjectId,version:number,instanceId:string)=>transaction(async session=>{
          const rows=await repository.read(actor,surveyId,session,safeInteger(version,1));return rows.bindings.find(b=>b.instanceId===instanceId)??null;
        }),
        async execute<O extends Operation>(input:OperationRequest<O>,work:(session:ClientSession,request:PreparedOperation)=>Promise<OperationResults[O]>,hooks:TransactionHooks={}):Promise<OperationResponse<O>>{
          const request=prepareOperation(actor,input);await authenticated(actor);
          const old=await find(request);if(old)return response<O>(old,request,true);
          for(let attempt=0;attempt<3;attempt++){
            const session=client.startSession();sessions.add(session);
            try{
              session.startTransaction(options);
              const previous=await find(request,session);
              if(previous){await abort(session);return response<O>(previous,request,true);}
              const data=await work(session,request);await hooks.afterBusiness?.();
              const instance=['attachQuestion','replaceQuestion','saveInlineQuestion'].includes(request.operation),adoption=request.operation==='adoptTemplate';
              const candidate={_id:new ObjectId(),schemaVersion:1,createdAt:new Date(),actorId:actor,operation:request.operation,resourceKey:request.resourceKey,requestKey:request.requestKey,
                requestHash:request.requestHash,resultVersion:1,firstHttpStatus:instance?200:201,result:{kind:instance?'instanceSave':adoption?'templateAdoption':'resourceReceipt',data}};
              assertReceiptSize(candidate);const receipt=decodeOperationReceipt(candidate);
              requireWrite(session);await collection.insertOne(receipt,{session});await hooks.afterReceipt?.();
              for(let commitAttempt=0;;commitAttempt++)try{await session.commitTransaction();break;}catch(error){if(label(error,'UnknownTransactionCommitResult')&&commitAttempt<2)continue;throw error;}
              await hooks.afterCommit?.();
              return response<O>(receipt,request,false);
            }catch(error){
              if(label(error,'UnknownTransactionCommitResult')){
                let committed;try{committed=await find(request);}catch(readError){if(readError instanceof ApiError)throw readError;throw unknown();}
                if(committed)return response<O>(committed,request,true);throw unknown();
              }
              await abort(session);
              if(isReceiptUniqueConflict(error,request)){
                const committed=await find(request);if(committed)return response<O>(committed,request,true);
                if(attempt<2)continue;throw retryLater();
              }
              if(label(error,'TransientTransactionError')){if(attempt<2){await contentionBackoff(attempt);continue;}throw retryLater();}
              throw error;
            }finally{sessions.delete(session);await session.endSession();}
          }
          throw retryLater();
        },
      });
    },
  });
}
export type Phase2Context=Awaited<ReturnType<typeof openPhase2Context>>;
