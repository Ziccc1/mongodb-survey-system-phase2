import {ObjectId,BSON} from 'mongodb';
import type {ClientSession,Db} from 'mongodb';
import {randomBytes,randomUUID} from 'node:crypto';
import {validateQuestions} from '@survey/shared';
import type {Phase2SurveyDocument,Phase2SnapshotDocument,SurveyTemplateDocument,SurveyQuestionBindingDocument,TemplateBinding} from '../database/phase2-models.js';
import type {ResourceResult,AdoptionResult} from '../database/operation-contract.js';
import {oidString,safeInteger} from '../database/operation-contract.js';
import {checkTemplate,templateContentHash,lineageInvalid} from '../database/template-integrity.js';
import {readSourceSet} from '../database/source-read.js';
import {questionsFromStorage} from '../database/binding-integrity.js';
import {jsonInteger} from '../database/receipt-codec.js';
import {toBson} from '../question-codec.js';
import {ApiError,invalid} from '../errors.js';
import {LibraryService,assertRevision,editConflict,incrementable,notFound} from './library.js';
import {DistributionLineageService} from './distribution-lineage.js';
import {pageParams,readCursor,signCursor,timePoint} from './common.js';
import type {FaultHooks} from './common.js';
import {definitionOf} from './versions.js';
import type {VersionDocument} from './versions.js';
const unavailable=()=>new ApiError(409,'TEMPLATE_UNAVAILABLE','模板当前不可选用，请刷新广场');
const oid=(v:unknown)=>new ObjectId(oidString(v));
const eligibilityCodes=new Set(['PUBLIC_DISTRIBUTION_REQUIRED','DISTRIBUTION_PROVENANCE_UNVERIFIED','DISTRIBUTION_LINEAGE_INVALID','DISTRIBUTION_LINEAGE_LIMIT_EXCEEDED','DEFINITION_INVALID']);
export class TemplateService {
 private lineage:DistributionLineageService;
 constructor(private db:Db,private actor:ObjectId,private requireWrite:(s:ClientSession)=>void,private library:LibraryService,private faults:FaultHooks={}){this.lineage=new DistributionLineageService(db,library);}
 private templates(){return this.db.collection<SurveyTemplateDocument>('survey_templates');}
 private async get(templateId:string,session:ClientSession){const t=await this.templates().findOne({_id:oid(templateId)},{session});if(!t)throw notFound();return t;}
 private async fence(t:SurveyTemplateDocument,session:ClientSession,action:string){
  this.requireWrite(session);incrementable(t.accessFence);await this.faults.beforeTemplateFence?.({action,templateId:t._id.toHexString()});
  const r=await this.templates().updateOne({_id:t._id,status:t.status,revision:t.revision,accessFence:{$lt:Number.MAX_SAFE_INTEGER}},{$inc:{accessFence:1}},{session});if(r.modifiedCount!==1)throw editConflict();await this.faults.afterTemplateFence?.({action,templateId:t._id.toHexString()});
 }
 private async eligible(t:SurveyTemplateDocument,session:ClientSession){try{checkTemplate(t);await this.lineage.proofs(t.bindings,t.publisherId,session,t.bindings);return true;}catch(e){if(e instanceof ApiError&&eligibilityCodes.has(e.code))return false;throw e;}}
 private summary(t:SurveyTemplateDocument,eligible:boolean){return {id:t._id.toHexString(),title:t.title,description:t.description,revision:jsonInteger(t.revision),status:t.status,eligible};}
 async list(url:string,secret:string,session:ClientSession){
  const params=new URL(url,'http://localhost').searchParams,scopeName=params.get('scope')??'square';if(!['square','mine'].includes(scopeName))throw invalid();const p=pageParams(url),scope={actorId:this.actor.toHexString(),endpoint:'templates',scope:scopeName,sort:'createdAt_desc_id_desc'},point=p.cursor?timePoint(readCursor(p.cursor,scope,secret)):null;
  const rows=await this.templates().find({...scopeName==='mine'?{publisherId:this.actor}:{status:'listed'},...(point?{$or:[{createdAt:{$lt:point.time}},{createdAt:point.time,_id:{$lt:point._id}}]}:{})},{session}).sort({createdAt:-1,_id:-1}).limit(p.limit+1).toArray(),items=[];
  for(const t of rows.slice(0,p.limit)){const eligible=await this.eligible(t,session);if(scopeName==='mine'||eligible)items.push(this.summary(t,eligible));}
  const last=rows.slice(0,p.limit).at(-1);return {items,nextCursor:rows.length>p.limit&&last?signCursor(scope,{time:last.createdAt.toISOString(),id:last._id.toHexString()},secret):null};
 }
 async preview(templateId:string,session:ClientSession){
  const t=await this.get(templateId,session),eligible=await this.eligible(t,session);if(!t.publisherId.equals(this.actor)&&(t.status!=='listed'||!eligible))throw unavailable();const questions=checkTemplate(t);
  return {...this.summary(t,eligible),questions,sources:t.bindings.map(b=>({instanceId:b.instanceId,questionId:b.questionId.toHexString(),questionVersionId:b.questionVersionId.toHexString()}))};
 }
 async create(body:Record<string,unknown>,session:ClientSession):Promise<ResourceResult>{
  this.requireWrite(session);const survey=await this.db.collection<Phase2SurveyDocument>('surveys').findOne({_id:oid(body.surveyId),ownerId:this.actor},{session});if(!survey)throw notFound();assertRevision(survey.revision,body.expectedSurveyRevision);
  const snapshot=await this.db.collection<Phase2SnapshotDocument>('survey_versions').findOne({surveyId:survey._id,version:safeInteger(body.publishedVersion,1)},{session});if(!snapshot)throw notFound();if(!snapshot.publishedBy.equals(this.actor))throw lineageInvalid();
  const definition=definitionOf(snapshot as unknown as VersionDocument),source=await readSourceSet(this.db,survey,snapshot,session,{requireComplete:true});
  const inputs=source.bindings.map(b=>({instanceId:b.instanceId,questionId:b.questionId,questionVersionId:b.questionVersionId,contentHash:b.contentHash}));
  const proofs=await this.lineage.lockedProofs(inputs,this.actor,session,'createTemplate');const bindings:TemplateBinding[]=inputs.map((b,i)=>({...b,distributionProof:proofs[i]}));
  const now=new Date(),t:SurveyTemplateDocument={_id:new ObjectId(),schemaVersion:1,createdAt:now,updatedAt:now,publisherId:this.actor,sourceSurveyId:survey._id,sourcePublishedVersion:snapshot.version,status:'listed',revision:0,accessFence:0,title:definition.title,description:definition.description,questions:toBson(definition.questions) as SurveyTemplateDocument['questions'],bindings,contentHash:''};t.contentHash=templateContentHash(t);checkTemplate(t);await this.templates().insertOne(t,{session});await this.faults.afterTemplateInsert?.();return {resourceId:t._id.toHexString(),versionId:null,revision:0};
 }
 async state(templateId:string,body:Record<string,unknown>,listed:boolean,session:ClientSession){
  this.requireWrite(session);const t=await this.get(templateId,session);if(!t.publisherId.equals(this.actor))throw notFound();assertRevision(t.revision,body.expectedRevision);const status=listed?'listed':'unlisted';
  if(t.status===status){if(listed){checkTemplate(t);await this.lineage.proofs(t.bindings,t.publisherId,session,t.bindings);}return {id:templateId,revision:jsonInteger(t.revision),state:status};}
  await this.fence(t,session,listed?'listing':'unlisting');if(listed){checkTemplate(t);await this.lineage.lockedProofs(t.bindings,t.publisherId,session,'listing',t.bindings);}incrementable(t.revision);
  if((await this.templates().updateOne({_id:t._id,publisherId:this.actor,revision:t.revision,status:t.status},{$set:{status,updatedAt:new Date()},$inc:{revision:1}},{session})).modifiedCount!==1)throw editConflict();return {id:templateId,revision:jsonInteger(t.revision)+1,state:status};
 }
 async adopt(templateId:string,body:Record<string,unknown>,session:ClientSession):Promise<AdoptionResult>{
  this.requireWrite(session);const t=await this.get(templateId,session);assertRevision(t.revision,body.expectedTemplateRevision);if(t.status!=='listed')throw unavailable();
  await this.fence(t,session,'adoptTemplate');const original=checkTemplate(t);await this.lineage.lockedProofs(t.bindings,t.publisherId,session,'adoptTemplate',t.bindings);
  const ids=new Map(original.map(q=>[q.id,randomUUID()])),questions=original.map(q=>({...q,id:ids.get(q.id)!,jumpRules:q.jumpRules.map(rule=>({...rule,id:randomUUID(),condition:{...rule.condition},targetQuestionId:ids.get(rule.targetQuestionId)!}))}));if(validateQuestions(questions).errors.length||validateQuestions(questions).validationIssues.length)throw lineageInvalid();
  const now=new Date(),survey:Phase2SurveyDocument={_id:new ObjectId(),schemaVersion:3,ownerId:this.actor,publicId:randomBytes(16).toString('base64url'),usageNumber:randomBytes(18).toString('base64url'),originTemplate:{templateId:t._id,contentHash:t.contentHash,acquiredAt:now},title:typeof body.title==='string'?body.title:t.title,description:t.description,status:'draft',allowAnonymous:false,allowRepeat:false,expiresAt:null,definitionVersion:1,revision:0,structureLocked:false,submissionCount:0,currentVersionSubmissionCount:0,currentPublishedVersion:null,questions:toBson(questions) as Phase2SurveyDocument['questions'],copiedFromId:null,firstPublishedAt:null,createdAt:now,updatedAt:now};
  if(BSON.calculateObjectSize(survey)>2*1024*1024)throw new ApiError(422,'DEFINITION_INVALID','生成的问卷超过2MiB容量限制');
  await this.db.collection<Phase2SurveyDocument>('surveys').insertOne(survey,{session});await this.faults.afterTemplateSurveyInsert?.();
  const rows:SurveyQuestionBindingDocument[]=t.bindings.map(b=>({_id:new ObjectId(),schemaVersion:1,createdAt:now,surveyId:survey._id,ownerId:this.actor,instanceId:ids.get(b.instanceId)!,questionId:b.questionId,questionVersionId:b.questionVersionId,contentHash:b.contentHash,acquisitionId:new ObjectId(),acquiredAt:now,authorization:{kind:'template',templateId:t._id,templateHash:t.contentHash},mappingKind:'native',evidenceKey:null,scope:'draft',publicationVersion:0,snapshotHash:null}));
  await this.db.collection<SurveyQuestionBindingDocument>('survey_question_bindings').insertMany(rows,{session});await this.faults.afterTemplateBindingsInsert?.();await readSourceSet(this.db,survey,undefined,session,{requireComplete:true});return {surveyId:survey._id.toHexString(),revision:0};
 }
}
