import type {ClientSession,Db} from 'mongodb';
import type {ObjectId} from 'mongodb';
import {canonical,normalizeQuestions,validateQuestions} from '@survey/shared';
import type {Definition,VersionDetail} from '@survey/shared';
import {fromBson} from '../question-codec.js';
import {ApiError} from '../errors.js';
import {hash} from './common.js';
import {readSourceSet} from '../database/source-read.js';
import type {Phase2SurveyDocument,Phase2SnapshotDocument} from '../database/phase2-models.js';
export interface VersionDocument {_id?:ObjectId;schemaVersion:1|2;bindingHash?:string;surveyId:ObjectId;version:number;sourceDefinitionVersion:number;definition:unknown;policySnapshot:{allowAnonymous:boolean;allowRepeat:boolean};definitionHash:string;publishedAt:Date;publishedBy:ObjectId;publicationRequestId:string;publicationRequestHash:string;origin:{kind:'publication'}}
// Intentionally exposes find/list/insert only. No version update, replace or delete operation.
export function versionRepository(db:Db){
  const collection=db.collection<VersionDocument>('survey_versions');
  return {
    find:(surveyId:ObjectId,version:number,session?:ClientSession)=>collection.findOne({surveyId,version},{session}),
    byRequest:(surveyId:ObjectId,publicationRequestId:string,session?:ClientSession)=>collection.findOne({surveyId,publicationRequestId},{session}),
    list:(surveyId:ObjectId,before:number|undefined,limit:number,session?:ClientSession)=>collection.find({surveyId,...(before?{version:{$lt:before}}:{})},{session}).sort({version:-1}).limit(limit).toArray(),
    insert:(document:VersionDocument,session:ClientSession)=>collection.insertOne(document,{session}),
  };
}
export function definitionOf(version:VersionDocument):Definition{
  try{
    if(version.schemaVersion!==1&&version.schemaVersion!==2)throw Error();
    const definition=fromBson(version.definition) as Definition;
    const checked=validateQuestions(definition.questions);
    if(checked.errors.length||checked.validationIssues.length||!definition.title.trim())throw Error();
    const normalized={...definition,questions:normalizeQuestions(definition.questions)};
    if(hash({definition:normalized,policy:version.policySnapshot})!==version.definitionHash)throw Error();
    return normalized;
  }catch{throw new ApiError(503,'VERSION_DEFINITION_UNAVAILABLE','历史发布定义损坏或待恢复');}
}
export async function validateStoredVersion(db:Db,stored:VersionDocument,session?:ClientSession){definitionOf(stored);if(stored.schemaVersion===2){const survey=await db.collection<Phase2SurveyDocument>('surveys').findOne({_id:stored.surveyId},{session});if(!survey)throw new ApiError(503,'QUESTION_MAPPING_INCOMPLETE','发布来源缺失');await readSourceSet(db,survey,stored as Phase2SnapshotDocument,session,{requireComplete:true});}return stored;}
export async function requireVersion(db:Db,surveyId:ObjectId,version:number,session?:ClientSession){const stored=await versionRepository(db).find(surveyId,version,session);if(!stored)throw new ApiError(404,'VERSION_NOT_FOUND','所选发布版本不存在');await validateStoredVersion(db,stored,session);return stored;}
export function versionDto(v:VersionDocument):VersionDetail{return {surveyId:v.surveyId.toHexString(),publishedVersion:v.version,sourceDraftDefinitionRevision:v.sourceDefinitionVersion,definition:definitionOf(v),policy:{...v.policySnapshot},publishedAt:v.publishedAt.toISOString(),legacy:false};}
