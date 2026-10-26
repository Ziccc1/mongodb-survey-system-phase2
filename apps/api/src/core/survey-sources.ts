import {BSON,ObjectId} from 'mongodb';
import type {Db,ClientSession} from 'mongodb';
import {randomUUID} from 'node:crypto';
import {canonical,extractQuestionContent,materializeQuestion,parseQuestionInstanceConfig,normalizeQuestions,validateQuestions} from '@survey/shared';
import type {Question,PublishCommand,PublishReceipt,InstanceSource,UpdateNotice,SaveResult} from '@survey/shared';
import type {Phase2SurveyDocument,Phase2SnapshotDocument,SurveyQuestionBindingDocument,QuestionVersionDocument,QuestionItemDocument,AuthorizationProof} from '../database/phase2-models.js';
import type {InstanceResult} from '../database/operation-contract.js';
import {exact,oidString,safeInteger,stableString} from '../database/operation-contract.js';
import {readSourceSet,assertDistinctVersions} from '../database/source-read.js';
import {bindingHashOf,questionsFromStorage,contentOfVersion,mappingIncomplete} from '../database/binding-integrity.js';
import {jsonInteger} from '../database/receipt-codec.js';
import {contentToBson} from '../content-codec.js';
import {toBson} from '../question-codec.js';
import {ApiError,invalid} from '../errors.js';
import {hash} from './common.js';
import type {FaultHooks} from './common.js';
import {LibraryService,assertRevision,editConflict,incrementable,notFound} from './library.js';
import type {Config} from '../config.js';
const oid=(s:unknown)=>new ObjectId(oidString(s));
export class SurveySourcesService {
 constructor(private db:Db,private actor:ObjectId,private requireWrite:(s:ClientSession)=>void,private library:LibraryService,private faults:FaultHooks={}){}
 async owned(surveyId:string,session:ClientSession){const survey=await this.db.collection<Phase2SurveyDocument>('surveys').findOne({_id:oid(surveyId),ownerId:this.actor},{session});if(!survey)throw notFound();if(survey.schemaVersion!==3)throw mappingIncomplete();return survey;}
 private async editable(surveyId:string,expected:unknown,session:ClientSession){this.requireWrite(session);const s=await this.owned(surveyId,session);assertRevision(s.revision,expected);if(!['draft','paused'].includes(s.status))throw new ApiError(409,'SURVEY_STATE_CONFLICT','请先暂停收集后再编辑题目');return s;}
 private checkQuestions(questions:Question[]){const checked=validateQuestions(questions);if(checked.errors.length)throw new ApiError(422,'DEFINITION_INVALID',checked.errors[0].message,checked.errors.map(i=>({field:i.field,reason:i.code,questionId:i.questionId??undefined})));return checked;}
 private async cas(s:Phase2SurveyDocument,questions:Question[],sourceChanged:boolean,session:ClientSession){
  this.requireWrite(session);const normalized=normalizeQuestions(questions),checked=this.checkQuestions(normalized),stored=toBson(normalized),changed=sourceChanged||canonical(normalized)!==canonical(questionsFromStorage(s.questions));
  if(BSON.calculateObjectSize({...s,questions:stored})>2097152)throw new ApiError(422,'DEFINITION_INVALID','问卷定义超过2MiB');
  if(changed){incrementable(s.revision);incrementable(s.definitionVersion);const result=await this.db.collection('surveys').updateOne({_id:s._id,ownerId:this.actor,status:s.status,revision:s.revision},{$set:{questions:stored,updatedAt:new Date()},$inc:{revision:1,definitionVersion:1}},{session});if(result.modifiedCount!==1)throw editConflict();}
  return {revision:jsonInteger(s.revision)+(changed?1:0),draftDefinitionRevision:jsonInteger(s.definitionVersion,1)+(changed?1:0),validationIssues:checked.validationIssues};
 }
 private binding(s:Phase2SurveyDocument,instanceId:string,v:QuestionVersionDocument,authorization:AuthorizationProof):SurveyQuestionBindingDocument{const now=new Date();return {_id:new ObjectId(),schemaVersion:1,createdAt:now,surveyId:s._id,ownerId:this.actor,instanceId,questionId:v.questionId,questionVersionId:v._id,contentHash:v.contentHash,acquisitionId:new ObjectId(),acquiredAt:now,authorization,mappingKind:'native',evidenceKey:null,scope:'draft',publicationVersion:0,snapshotHash:null};}
 async attach(surveyId:string,body:Record<string,unknown>,session:ClientSession):Promise<InstanceResult>{
  const s=await this.editable(surveyId,body.expectedRevision,session),existing=await readSourceSet(this.db,s,undefined,session);
  const {version,proof}=await this.library.acquire(oid(body.questionVersionId),session,'attach');
  const questions=questionsFromStorage(s.questions),instanceId=body.instanceId===undefined?randomUUID():stableString(body.instanceId),position=safeInteger(body.position,0,100);
  if(position>questions.length||questions.some(q=>q.id===instanceId))throw new ApiError(422,'DEFINITION_INVALID','实例ID重复或插入位置无效');
  let q:Question;try{q=materializeQuestion(contentOfVersion(version),parseQuestionInstanceConfig({required:body.required??false,jumpRules:body.jumpRules??[]},version.content.type),instanceId);}catch{throw new ApiError(422,'DEFINITION_INVALID','配置不适用于此题型');}
  const binding=this.binding(s,instanceId,version,proof);assertDistinctVersions([...existing.bindings,binding]);questions.splice(position,0,q);
  const result=await this.cas(s,questions,true,session);await this.db.collection<SurveyQuestionBindingDocument>('survey_question_bindings').insertOne(binding,{session});return {...result,instanceId,questionVersionId:version._id.toHexString()};
 }
 async replace(surveyId:string,instanceId:string,body:Record<string,unknown>,session:ClientSession):Promise<InstanceResult>{
  stableString(instanceId);const s=await this.editable(surveyId,body.expectedRevision,session),checked=await readSourceSet(this.db,s,undefined,session,{requireComplete:false,requiredInstanceIds:[instanceId]}),old=checked.bindings.find(b=>b.instanceId===instanceId)!;
  const nextId=oid(body.questionVersionId);let version:QuestionVersionDocument,proof=old.authorization;
  if(nextId.equals(old.questionVersionId))version=checked.versions.find(v=>v._id.equals(nextId))!;
  else{const acquired=await this.library.acquire(nextId,session,'replace',[old.questionId]);version=acquired.version;proof=acquired.proof;}
  if(!version.questionId.equals(old.questionId)){
   const item=await this.library.item(version.questionId,session);
   if(!item.ownerId.equals(this.actor)||item.origin?.kind!=='fork'||!item.origin.sourceQuestionId.equals(old.questionId)||!item.origin.sourceVersionId.equals(old.questionVersionId)||jsonInteger(version.version,1)!==1)throw new ApiError(409,'QUESTION_IDENTITY_MISMATCH','仅可替换为同题版本或自己从原固定版直接派生的首版');
  }
  const questions=questionsFromStorage(s.questions),index=questions.findIndex(q=>q.id===instanceId),previous=questions[index];
  try{questions[index]=materializeQuestion(contentOfVersion(version),parseQuestionInstanceConfig({required:previous.required,jumpRules:body.reviewedJumpRules===undefined?previous.jumpRules:body.reviewedJumpRules},version.content.type),instanceId);}
  catch{throw new ApiError(422,body.reviewedJumpRules===undefined?'RULE_REVIEW_REQUIRED':'DEFINITION_INVALID','题型变化后的跳转规则需要明确审查，请选择并提交兼容的规则');}
  const sourceChanged=!nextId.equals(old.questionVersionId),replacement=sourceChanged?this.binding(s,instanceId,version,proof):old;
  assertDistinctVersions(checked.bindings.map(b=>b.instanceId===instanceId?replacement:b));const result=await this.cas(s,questions,sourceChanged,session);
  if(sourceChanged){const changed=await this.db.collection<SurveyQuestionBindingDocument>('survey_question_bindings').updateOne({_id:old._id,surveyId:s._id,ownerId:this.actor,scope:'draft',publicationVersion:0,acquisitionId:old.acquisitionId},{$set:{questionId:replacement.questionId,questionVersionId:nextId,contentHash:replacement.contentHash,acquisitionId:replacement.acquisitionId,acquiredAt:replacement.acquiredAt,authorization:proof,mappingKind:'native',evidenceKey:null}},{session});if(changed.modifiedCount!==1)throw mappingIncomplete();}
  return {...result,instanceId,questionVersionId:nextId.toHexString()};
 }
 async formalize(surveyId:string,instanceId:string,body:Record<string,unknown>,session:ClientSession):Promise<InstanceResult>{
  stableString(instanceId);const s=await this.editable(surveyId,body.expectedRevision,session),checked=await readSourceSet(this.db,s,undefined,session);
  if(checked.bindings.some(b=>b.instanceId===instanceId))throw new ApiError(409,'ALREADY_FORMALIZED','此实例已固定正式版，请在题目页编辑并保存新版');
  // A deleted acquired instance ID cannot be recycled through formalization to manufacture owner provenance.
  if(await this.db.collection('survey_question_bindings').findOne({surveyId:s._id,instanceId,scope:'publication'},{session})||await this.db.collection('operation_receipts').findOne({actorId:this.actor,resourceKey:surveyId,operation:{$in:['attachQuestion','replaceQuestion']},'result.data.instanceId':instanceId},{session}))throw new ApiError(409,'ALREADY_FORMALIZED','此实例ID曾使用正式题目，请通过明确版本选用流程添加');
  const questions=questionsFromStorage(s.questions),q=questions.find(q=>q.id===instanceId);if(!q)throw notFound();
  const content=extractQuestionContent(q),created=await this.library.create(content,session),itemId=created.resourceId;
  const saved=await this.library.saveVersion(itemId,{expectedRevision:0,expectedDraftRevision:0},session),version=await this.db.collection<QuestionVersionDocument>('question_versions').findOne({_id:oid(saved.versionId)},{session});if(!version)throw mappingIncomplete();
  const result=await this.cas(s,questions,true,session);await this.db.collection<SurveyQuestionBindingDocument>('survey_question_bindings').insertOne(this.binding(s,instanceId,version,{kind:'owner'}),{session});return {...result,instanceId,questionVersionId:version._id.toHexString()};
 }
 async saveQuestions(surveyId:string,expected:unknown,input:Question[],session:ClientSession):Promise<SaveResult>{
  const s=await this.editable(surveyId,expected,session);this.checkQuestions(input);const questions=normalizeQuestions(input),checked=await readSourceSet(this.db,s,undefined,session),ids=new Set(questions.map(q=>q.id));
  for(const b of checked.bindings){const q=questions.find(q=>q.id===b.instanceId);if(q&&hash(extractQuestionContent(q))!==b.contentHash)throw new ApiError(409,'QUESTION_CONTENT_REQUIRES_VERSION','正式题内容请在题目页保存新版本，或在有权时派生；此处只可改配置、顺序或删除',[{questionId:b.instanceId,field:'/questions'}]);}
  const remaining=checked.bindings.filter(b=>ids.has(b.instanceId));assertDistinctVersions(remaining);const result=await this.cas(s,questions,false,session);
  for(const b of checked.bindings.filter(b=>!ids.has(b.instanceId)))await this.db.collection('survey_question_bindings').deleteOne({_id:b._id,surveyId:s._id,ownerId:this.actor,scope:'draft',publicationVersion:0,acquisitionId:b.acquisitionId},{session});
  const current=await this.owned(surveyId,session);let hasUnpublishedChanges=true;
  if(current.currentPublishedVersion!==null){const snapshot=await this.db.collection<Phase2SnapshotDocument>('survey_versions').findOne({surveyId:s._id,version:current.currentPublishedVersion},{session});if(!snapshot)throw mappingIncomplete();const pub=await readSourceSet(this.db,current,snapshot,session);hasUnpublishedChanges=hash({definition:{title:current.title,description:current.description,questions},policy:{allowAnonymous:current.allowAnonymous,allowRepeat:current.allowRepeat}})!==snapshot.definitionHash||bindingHashOf(remaining)!==bindingHashOf(pub.bindings);}
  return {...result,hasUnpublishedChanges};
 }
 async sources(surveyId:string,updatesOnly:boolean,session:ClientSession){
  const s=await this.owned(surveyId,session),checked=await readSourceSet(this.db,s,undefined,session),items:(InstanceSource|UpdateNotice)[]=[];
  for(const b of checked.bindings){
   const v=checked.versions.find(v=>v._id.equals(b.questionVersionId))!,access=await this.library.access(b.questionId,session);let latest:QuestionVersionDocument|null=null;
   if(access?.item.latestVersionId)latest=await this.db.collection<QuestionVersionDocument>('question_versions').findOne({_id:access.item.latestVersionId,questionId:b.questionId},{session});
   if(latest)await this.library.validateVersion(latest,session);const hasUpdate=!!latest&&jsonInteger(latest.version,1)>jsonInteger(v.version,1);
   if(updatesOnly){if(hasUpdate)items.push({instanceId:b.instanceId,currentVersionId:b.questionVersionId.toHexString(),latestAccessibleVersionId:latest!._id.toHexString(),latestAccessibleVersion:jsonInteger(latest!.version,1)});}
   else items.push({instanceId:b.instanceId,questionId:b.questionId.toHexString(),questionVersionId:b.questionVersionId.toHexString(),questionVersion:jsonInteger(v.version,1),rights:access?.proof.kind==='owner'?'owner':access?.proof.kind==='share'?'share':b.authorization.kind==='template'?'template':'retained',hasAccessibleUpdate:hasUpdate});
  }
  return {revision:jsonInteger(s.revision),items};
 }
 async publish(surveyId:string,body:PublishCommand,operationKey:string,config:Config,session:ClientSession):Promise<{httpStatus:200|201;data:PublishReceipt}>{
  this.requireWrite(session);const s=await this.owned(surveyId,session),versions=this.db.collection<Phase2SnapshotDocument>('survey_versions'),requestHash=hash(body),old=await versions.findOne({surveyId:s._id,publicationRequestId:operationKey},{session});
  const receipt=(v:Phase2SnapshotDocument,replayed:boolean):PublishReceipt=>({surveyId,publishedVersion:jsonInteger(v.version,1),status:'published',revision:body.expectedRevision+1,publishedAt:v.publishedAt.toISOString(),firstPublishedAt:(s.firstPublishedAt??v.publishedAt).toISOString(),shareUrl:`${config.publicAppUrl??config.origin}/survey/${s.publicId}`,replayed});
  if(old){if(old.publicationRequestHash!==requestHash)throw new ApiError(409,'PUBLICATION_IDEMPOTENCY_CONFLICT','该发布key已用于不同前提');return {httpStatus:200,data:receipt(old,true)};}
  if(!['draft','paused'].includes(s.status))throw new ApiError(409,'SURVEY_STATE_CONFLICT','请先暂停收集后再发布');assertRevision(s.revision,body.expectedRevision);
  if(jsonInteger(s.definitionVersion,1)!==body.expectedDraftDefinitionVersion)throw new ApiError(409,'DRAFT_DEFINITION_CONFLICT','题目编辑修订已变化');
  if(s.expiresAt&&s.expiresAt.getTime()<=Date.now())throw new ApiError(409,'SURVEY_EXPIRED','截止时间已到，请先调整');
  const questions=questionsFromStorage(s.questions),checks=this.checkQuestions(questions);if(checks.validationIssues.length)throw new ApiError(422,'DEFINITION_INVALID','请先修复发布前检查问题',checks.validationIssues.map(i=>({field:i.field,reason:i.code,questionId:i.questionId??undefined})));
  const checked=await readSourceSet(this.db,s,undefined,session);
  if(checked.unformalizedInstanceIds.length)throw new ApiError(422,'UNSAVED_QUESTION_CONTENT','请先明确保存每道本地题的正式版本',checked.unformalizedInstanceIds.map(questionId=>({questionId,field:'/questions',reason:'FORMAL_VERSION_REQUIRED'})));
  assertDistinctVersions(checked.bindings);const latest=await versions.find({surveyId:s._id},{session}).sort({version:-1}).limit(1).next(),version=Math.max(latest?jsonInteger(latest.version,1):0,s.currentPublishedVersion===null?0:jsonInteger(s.currentPublishedVersion,1))+1;
  incrementable(s.revision);safeInteger(version,1);const now=new Date(),definition={title:s.title,description:s.description,questions},policy={allowAnonymous:s.allowAnonymous,allowRepeat:s.allowRepeat};
  const snapshot:Phase2SnapshotDocument={_id:new ObjectId(),schemaVersion:2,surveyId:s._id,version,sourceDefinitionVersion:s.definitionVersion,definition:{...definition,questions:toBson(questions) as Phase2SnapshotDocument['definition']['questions']},policySnapshot:policy,definitionHash:hash({definition,policy}),bindingHash:bindingHashOf(checked.bindings),publishedAt:now,publishedBy:this.actor,publicationRequestId:operationKey,publicationRequestHash:requestHash,origin:{kind:'publication'}};
  if(BSON.calculateObjectSize(snapshot)>2097152)throw new ApiError(422,'DEFINITION_INVALID','发布定义超过2MiB');
  const result=await this.db.collection('surveys').updateOne({_id:s._id,ownerId:this.actor,revision:s.revision,status:s.status},{$set:{status:'published',currentPublishedVersion:version,currentVersionSubmissionCount:0,firstPublishedAt:s.firstPublishedAt??now,updatedAt:now},$inc:{revision:1}},{session});if(result.modifiedCount!==1)throw editConflict();
  await versions.insertOne(snapshot,{session});this.faults.afterSnapshotInsert?.();
  const rows=checked.bindings.map(b=>({...b,_id:new ObjectId(),createdAt:now,scope:'publication' as const,publicationVersion:version,snapshotHash:snapshot.definitionHash}));
  if(rows.length)await this.db.collection<SurveyQuestionBindingDocument>('survey_question_bindings').insertMany(rows,{session});
  await readSourceSet(this.db,s,snapshot,session,{requireComplete:true});return {httpStatus:201,data:receipt(snapshot,false)};
 }
}
