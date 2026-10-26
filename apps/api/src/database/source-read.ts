import type {Db,ClientSession} from 'mongodb';
import type {Phase2SurveyDocument,Phase2SnapshotDocument,QuestionItemDocument,QuestionVersionDocument,QuestionGrantDocument,SurveyQuestionBindingDocument,SurveyTemplateDocument} from './phase2-models.js';
import {checkTemplate} from './template-integrity.js';
import {checkBindingSet,mappingIncomplete} from './binding-integrity.js';
import type {DraftMappingPolicy} from './binding-integrity.js';
import {jsonInteger} from './receipt-codec.js';
import {ApiError} from '../errors.js';
/** Checks persisted acquisition facts. It deliberately does not require a grant to remain active. */
export async function readSourceSet(db:Db,survey:Phase2SurveyDocument,snapshot?:Phase2SnapshotDocument,session?:ClientSession,policy:DraftMappingPolicy={requireComplete:false}){
 const bindings=await db.collection<SurveyQuestionBindingDocument>('survey_question_bindings').find({surveyId:survey._id,scope:snapshot?'publication':'draft',publicationVersion:snapshot?jsonInteger(snapshot.version,1):0},{session}).toArray();
 const versions:QuestionVersionDocument[]=[];
 for(const b of bindings){
  const item=await db.collection<QuestionItemDocument>('question_items').findOne({_id:b.questionId},{session});
  const v=await db.collection<QuestionVersionDocument>('question_versions').findOne({_id:b.questionVersionId},{session});
  if(!item||!v||!v.createdBy.equals(item.ownerId))throw mappingIncomplete();
  if(b.authorization.kind==='owner'&&!item.ownerId.equals(survey.ownerId))throw mappingIncomplete();
  if(b.authorization.kind==='share'){
   const g=await db.collection<QuestionGrantDocument>('question_grants').findOne({_id:b.authorization.grantId,questionId:b.questionId,recipientId:survey.ownerId,grantedBy:item.ownerId},{session});
   if(!g||jsonInteger(g.revision)<jsonInteger(b.authorization.grantRevision))throw mappingIncomplete();
  }
  if(b.authorization.kind==='template'){
   if(survey.schemaVersion!==3||!survey.originTemplate||!survey.originTemplate.templateId.equals(b.authorization.templateId)||survey.originTemplate.contentHash!==b.authorization.templateHash)throw mappingIncomplete();
   const template=await db.collection<SurveyTemplateDocument>('survey_templates').findOne({_id:b.authorization.templateId},{session});
   if(!template||template.contentHash!==b.authorization.templateHash)throw mappingIncomplete();
   try{checkTemplate(template);}catch{throw mappingIncomplete();}
   if(!template.bindings.some(x=>x.questionId.equals(b.questionId)&&x.questionVersionId.equals(b.questionVersionId)&&x.contentHash===b.contentHash))throw mappingIncomplete();
  }
  if(b.mappingKind==='legacyImport'&&(!item.ownerId.equals(survey.ownerId)||v.operation!=='legacyImport'||v.evidenceKey!==b.evidenceKey||item.origin?.kind!=='legacyImport'||item.origin.evidenceKey!==b.evidenceKey))throw mappingIncomplete();
  versions.push(v);
 }
 return {...checkBindingSet(survey,bindings,versions,snapshot,policy),versions};
}
export function assertDistinctVersions(bindings:readonly SurveyQuestionBindingDocument[]){
 const seen=new Set<string>();for(const b of bindings){const tuple=`${b.questionId.toHexString()}:${b.questionVersionId.toHexString()}`;if(seen.has(tuple))throw new ApiError(422,'DUPLICATE_QUESTION_VERSION','同一问卷中同一道题的同一正式版本只能使用一次');seen.add(tuple);}
}
