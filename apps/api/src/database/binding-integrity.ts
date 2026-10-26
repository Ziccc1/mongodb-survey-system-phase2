import {ObjectId} from 'mongodb';
import {extractQuestionContent,normalizeQuestionParts,normalizeQuestions,validateQuestions} from '@survey/shared';
import type {Question,QuestionContent} from '@survey/shared';
import type {Phase2SurveyDocument,Phase2SnapshotDocument,QuestionVersionDocument,SurveyQuestionBindingDocument} from './phase2-models.js';
import {contentFromBson} from '../content-codec.js';
import {fromBson} from '../question-codec.js';
import {hash} from '../core/common.js';
import {ApiError} from '../errors.js';
import {jsonInteger} from './receipt-codec.js';
import {exact,stableString} from './operation-contract.js';

export const mappingIncomplete=()=>new ApiError(503,'QUESTION_MAPPING_INCOMPLETE','题目来源映射缺失或不一致');
const equal=(a:unknown,b:unknown)=>a instanceof ObjectId&&b instanceof ObjectId&&a.equals(b);
function checkBindingShape(b:SurveyQuestionBindingDocument):void {
  exact(b,['_id','schemaVersion','createdAt','surveyId','ownerId','instanceId','scope','publicationVersion','questionId','questionVersionId','contentHash','snapshotHash','acquisitionId','acquiredAt','authorization','mappingKind','evidenceKey']);
  for(const value of [b._id,b.surveyId,b.ownerId,b.questionId,b.questionVersionId,b.acquisitionId])if(!(value instanceof ObjectId))throw mappingIncomplete();
  for(const value of [b.createdAt,b.acquiredAt])if(!(value instanceof Date)||!Number.isFinite(value.getTime()))throw mappingIncomplete();
  if(jsonInteger(b.schemaVersion)!==1||!/^[0-9a-f]{64}$/.test(b.contentHash))throw mappingIncomplete();stableString(b.instanceId);
  const proof=b.authorization;
  switch(proof.kind){
    case 'owner':exact(proof,['kind']);break;
    case 'share':exact(proof,['kind','grantId','grantRevision']);if(!(proof.grantId instanceof ObjectId))throw mappingIncomplete();jsonInteger(proof.grantRevision);break;
    case 'template':exact(proof,['kind','templateId','templateHash']);if(!(proof.templateId instanceof ObjectId)||!/^[0-9a-f]{64}$/.test(proof.templateHash))throw mappingIncomplete();break;
    case 'legacyImport':exact(proof,['kind','evidenceKey']);if(proof.evidenceKey!==b.evidenceKey||b.mappingKind!=='legacyImport')throw mappingIncomplete();break;
    default:throw mappingIncomplete();
  }
  if(b.mappingKind==='native'){if(b.evidenceKey!==null)throw mappingIncomplete();}
  else if(b.mappingKind!=='legacyImport'||typeof b.evidenceKey!=='string'||!b.evidenceKey||[...b.evidenceKey].length>2048)throw mappingIncomplete();
}
export function contentHashOf(version:QuestionVersionDocument):string {
  try{const content=contentOfVersion(version);
    return hash(normalizeQuestionParts(content,{required:false,jumpRules:[]},'content').content);
  }catch{throw mappingIncomplete();}
}
export function contentOfVersion(version:QuestionVersionDocument):QuestionContent {
  try{
    let content=version.content;
    if(content.type==='multiple')content={...content,validation:{...content.validation,
      ...(content.validation.minChoices===undefined?{}:{minChoices:jsonInteger(content.validation.minChoices)}),
      ...(content.validation.maxChoices===undefined?{}:{maxChoices:jsonInteger(content.validation.maxChoices)})}};
    if(content.type==='text')content={...content,validation:{...content.validation,
      ...(content.validation.minLength===undefined?{}:{minLength:jsonInteger(content.validation.minLength)}),
      ...(content.validation.maxLength===undefined?{}:{maxLength:jsonInteger(content.validation.maxLength)})}};
    return contentFromBson(content);
  }catch{throw mappingIncomplete();}
}
export function bindingHashOf(bindings:readonly SurveyQuestionBindingDocument[]):string {
  const ids=new Set<string>();
  const tuples=bindings.map(b=>{
    if(ids.has(b.instanceId))throw mappingIncomplete();ids.add(b.instanceId);
    return [b.instanceId,b.questionId.toHexString(),b.questionVersionId.toHexString(),b.contentHash,b.acquisitionId.toHexString()];
  }).sort((a,b)=>a[0]<b[0]?-1:a[0]>b[0]?1:0);
  return hash(tuples);
}
export function questionsFromStorage(value:unknown):Question[] {
  if(!Array.isArray(value))throw mappingIncomplete();
  const questions=fromBson(value) as Question[];
  for(const [i,q] of questions.entries()){
    const stored=value[i] as {validation?:Record<string,unknown>};
    for(const field of ['minChoices','maxChoices','minLength','maxLength'] as const)if(q.validation?.[field]!==undefined)q.validation[field]=jsonInteger(stored.validation?.[field]);
    extractQuestionContent(q); // Includes strict flat DTO shape; no unknown fields are discarded.
  }
  if(validateQuestions(questions).errors.length)throw mappingIncomplete();
  return normalizeQuestions(questions);
}
export interface DraftMappingPolicy {requireComplete:boolean;requiredInstanceIds?:readonly string[]}
export interface CheckedBindings {bindings:SurveyQuestionBindingDocument[];unformalizedInstanceIds:string[]}
/** Pure consistency check, also usable with isolated corruption fixtures. Does not grant new rights. */
export function checkBindingSet(survey:Phase2SurveyDocument,bindings:SurveyQuestionBindingDocument[],versions:QuestionVersionDocument[],snapshot?:Phase2SnapshotDocument,policy:DraftMappingPolicy={requireComplete:true}):CheckedBindings {
  try {
    const questions=questionsFromStorage(snapshot?snapshot.definition.questions:survey.questions);
    const checked=validateQuestions(questions);if(snapshot&&checked.validationIssues.length)throw mappingIncomplete();
    const publication=snapshot?jsonInteger(snapshot.version,1):0;
    if(snapshot){
      if(!equal(snapshot.surveyId,survey._id))throw mappingIncomplete();
      const definition={title:snapshot.definition.title,description:snapshot.definition.description,questions};
      if(hash({definition,policy:snapshot.policySnapshot})!==snapshot.definitionHash)throw mappingIncomplete();
    }
    const ids=new Set<string>(),seen=new Set<string>(),unformalizedInstanceIds:string[]=[];
    for(const q of questions){if(ids.has(q.id))throw mappingIncomplete();ids.add(q.id);}
    for(const b of bindings){
      checkBindingShape(b);
      if(!equal(b.surveyId,survey._id)||!equal(b.ownerId,survey.ownerId)||seen.has(b.instanceId)||!ids.has(b.instanceId)
        ||b.scope!==(snapshot?'publication':'draft')||jsonInteger(b.publicationVersion)!==publication
        ||b.snapshotHash!==(snapshot?snapshot.definitionHash:null))throw mappingIncomplete();
      seen.add(b.instanceId);
      const version=versions.find(v=>equal(v._id,b.questionVersionId));
      if(!version||!equal(version.questionId,b.questionId)||contentHashOf(version)!==version.contentHash||version.contentHash!==b.contentHash)throw mappingIncomplete();
      const q=questions.find(q=>q.id===b.instanceId)!;
      if(hash(extractQuestionContent(q))!==b.contentHash)throw mappingIncomplete();
    }
    for(const q of questions)if(!seen.has(q.id)){
      if(snapshot||policy.requireComplete||policy.requiredInstanceIds?.includes(q.id))throw mappingIncomplete();
      unformalizedInstanceIds.push(q.id);
    }
    if(policy.requiredInstanceIds?.some(id=>!ids.has(id)))throw mappingIncomplete();
    if(snapshot?.schemaVersion===2&&bindingHashOf(bindings)!==snapshot.bindingHash)throw mappingIncomplete();
    return {bindings,unformalizedInstanceIds};
  }catch{throw mappingIncomplete();}
}
