import {ObjectId} from 'mongodb';
import {codePointLength,decimalValue,normalizeQuestionParts,parseQuestionContent,parseQuestionInstanceConfig,QuestionValidationError} from '@survey/shared';
import type {DefinitionIssue,JumpRule,QuestionContent} from '@survey/shared';
import type {OperationReceiptDocument} from './phase2-models.js';
import {hash} from '../core/common.js';
import {ApiError,invalid} from '../errors.js';

export type Operation=OperationReceiptDocument['operation'];
export interface ResourceResult {resourceId:string;versionId:string|null;revision:number|null}
export interface InstanceResult {revision:number;draftDefinitionRevision:number;instanceId:string;questionVersionId:string;validationIssues:DefinitionIssue[]}
export interface AdoptionResult {surveyId:string;revision:number}
export interface OperationResults {
  createQuestion:ResourceResult;saveVersion:ResourceResult;restoreVersion:ResourceResult;forkQuestion:ResourceResult;
  createBank:ResourceResult;createTemplate:ResourceResult;attachQuestion:InstanceResult;replaceQuestion:InstanceResult;
  saveInlineQuestion:InstanceResult;adoptTemplate:AdoptionResult;
}
export interface OperationRequest<O extends Operation=Operation> {operation:O;path:unknown;body:unknown;requestKey:string}
export interface OperationScope {actorId:ObjectId;operation:Operation;resourceKey:string;requestKey:string}
export interface PreparedOperation extends OperationScope {requestHash:string;path:Record<string,unknown>;body:Record<string,unknown>}
export function exact(value:unknown,required:string[],optional:string[]=[]):Record<string,unknown> {
  if(!value||Object.getPrototypeOf(value)!==Object.prototype)throw invalid();
  const object=value as Record<string,unknown>;
  if(required.some(k=>!Object.hasOwn(object,k))||Object.keys(object).some(k=>!required.includes(k)&&!optional.includes(k)))throw invalid();
  return object;
}
export function oidString(value:unknown):string {if(typeof value!=='string'||!/^[0-9a-f]{24}$/.test(value))throw invalid();return value;}
export function stableString(value:unknown):string {if(typeof value!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw invalid();return value;}
export function safeInteger(value:unknown,min=0,max=Number.MAX_SAFE_INTEGER):number {if(typeof value!=='number'||!Number.isSafeInteger(value)||value<min||value>max)throw invalid();return value;}
function text(value:unknown,max:number):string {if(typeof value!=='string'||!value.trim()||codePointLength(value)>max)throw invalid();return value.trim();}
export function normalizeContentInput(value:unknown):QuestionContent {
  try{return normalizeQuestionParts(parseQuestionContent(value),{required:false,jumpRules:[]},'content').content;}
  catch(error){
    if(!(error instanceof QuestionValidationError))throw error;
    if(error.kind==='shape')throw invalid();
    throw new ApiError(422,'DEFINITION_INVALID',error.issues[0].message,
      error.issues.map(({field,code})=>({field:field.replace(/^\/questions\/0(?=\/|$)/,'/content'),reason:code})));
  }
}
function normalizedRules(value:unknown):JumpRule[] {
  for(const type of ['single','multiple','number','text'] as const)try {
    const rules=parseQuestionInstanceConfig({required:false,jumpRules:value},type).jumpRules;
    for(const rule of rules){const c=rule.condition;if('number' in c){const n=decimalValue(c.number);if(!n)throw invalid();c.number=n.toString();}if('optionIds' in c)c.optionIds.sort();}
    return rules;
  } catch { /* Try the next strict condition shape; no current resource reads. */ }
  throw invalid();
}
/** Fixed DTO/path validation precedes receipt lookup. No current business state is hashed. */
export function prepareOperation(actorId:ObjectId,input:OperationRequest):PreparedOperation {
  exact(input,['operation','path','body','requestKey']);
  if(!(actorId instanceof ObjectId)||typeof input.requestKey!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(input.requestKey))throw invalid();
  let path:Record<string,unknown>,body:Record<string,unknown>,resourceKey:string;
  const rev=(b:Record<string,unknown>,name='expectedRevision')=>safeInteger(b[name]);
  switch(input.operation){
    case 'createQuestion':case 'forkQuestion':{
      path=exact(input.path,input.operation==='forkQuestion'?['versionId']:[]);
      const b=exact(input.body,['content'],input.operation==='forkQuestion'?['sourceInstance']:[]);
      const content=normalizeContentInput(b.content);
      body={content};resourceKey=input.operation==='forkQuestion'?oidString(path.versionId):'create';
      if(b.sourceInstance!==undefined){const s=exact(b.sourceInstance,['surveyId','instanceId']);body.sourceInstance={surveyId:oidString(s.surveyId),instanceId:stableString(s.instanceId)};}
      break;
    }
    case 'saveVersion':case 'restoreVersion':{
      path=exact(input.path,['questionId']);resourceKey=oidString(path.questionId);
      const b=exact(input.body,input.operation==='saveVersion'?['expectedRevision','expectedDraftRevision']:['expectedRevision','sourceVersionId']);
      body=input.operation==='saveVersion'?{expectedRevision:rev(b),expectedDraftRevision:safeInteger(b.expectedDraftRevision)}:{expectedRevision:rev(b),sourceVersionId:oidString(b.sourceVersionId)};break;
    }
    case 'createBank':{path=exact(input.path,[]);const b=exact(input.body,['name']);body={name:text(b.name,100)};resourceKey='create';break;}
    case 'createTemplate':{path=exact(input.path,[]);const b=exact(input.body,['surveyId','publishedVersion','expectedSurveyRevision']);body={surveyId:oidString(b.surveyId),publishedVersion:safeInteger(b.publishedVersion,1),expectedSurveyRevision:rev(b,'expectedSurveyRevision')};resourceKey=String(body.surveyId);break;}
    case 'adoptTemplate':{path=exact(input.path,['templateId']);resourceKey=oidString(path.templateId);const b=exact(input.body,['expectedTemplateRevision'],['title']);body={expectedTemplateRevision:rev(b,'expectedTemplateRevision'),...(b.title===undefined?{}:{title:text(b.title,200)})};break;}
    case 'attachQuestion':{
      path=exact(input.path,['surveyId']);resourceKey=oidString(path.surveyId);
      const b=exact(input.body,['expectedRevision','questionVersionId','position'],['instanceId','required','jumpRules']);
      if(b.required!==undefined&&typeof b.required!=='boolean')throw invalid();
      body={expectedRevision:rev(b),questionVersionId:oidString(b.questionVersionId),position:safeInteger(b.position,0,100),required:b.required===undefined?false:b.required,jumpRules:normalizedRules(b.jumpRules===undefined?[]:b.jumpRules),...(b.instanceId===undefined?{}:{instanceId:stableString(b.instanceId)})};break;
    }
    case 'replaceQuestion':{
      path=exact(input.path,['surveyId','instanceId']);resourceKey=oidString(path.surveyId);stableString(path.instanceId);
      const b=exact(input.body,['expectedRevision','questionVersionId'],['reviewedJumpRules']);
      body={expectedRevision:rev(b),questionVersionId:oidString(b.questionVersionId),...(b.reviewedJumpRules===undefined?{}:{reviewedJumpRules:normalizedRules(b.reviewedJumpRules)})};break;
    }
    case 'saveInlineQuestion':{path=exact(input.path,['surveyId','instanceId']);resourceKey=oidString(path.surveyId)+':'+stableString(path.instanceId);const b=exact(input.body,['expectedRevision']);body={expectedRevision:rev(b)};break;}
    default:throw invalid();
  }
  const fixedPath=JSON.parse(JSON.stringify(path)) as Record<string,unknown>;
  return {actorId:new ObjectId(actorId.toHexString()),operation:input.operation,resourceKey,requestKey:input.requestKey,path:fixedPath,body,
    requestHash:hash({operation:input.operation,path:fixedPath,body})};
}
