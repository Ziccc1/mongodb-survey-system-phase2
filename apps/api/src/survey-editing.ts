import type { FastifyInstance } from 'fastify';
import { ObjectId, BSON } from 'mongodb';
import type { Collection, Db } from 'mongodb';
import { canonical, normalizeQuestions, patchSurveySchema, saveQuestionsSchema, surveyTextIssues, validateQuestions } from '@survey/shared';
import type { PatchSurvey, SaveQuestions, SaveResult, Question } from '@survey/shared';
import type { SurveyDocument, UserDocument } from './database/models.js';
import { editorDto } from './dto.js';
import { fromBson, toBson } from './question-codec.js';
import { ApiError, invalid } from './errors.js';
import {readSourceSet} from './database/source-read.js';
import {bindingHashOf} from './database/binding-integrity.js';
import type {Phase2SurveyDocument,Phase2SnapshotDocument} from './database/phase2-models.js';
export async function loadEditor(db: Db, survey: SurveyDocument) {
  if(survey.currentPublishedVersion===null) return editorDto(survey);
  const snapshot=await db.collection('survey_versions').findOne({surveyId:survey._id,version:survey.currentPublishedVersion});
  if(!snapshot) throw new ApiError(503,'VERSION_DEFINITION_UNAVAILABLE','发布定义不可用，请先恢复历史定义');
  const definition={title:survey.title,description:survey.description,questions:normalizeQuestions(fromBson(survey.questions) as Question[])};
  const original={...snapshot.definition,questions:normalizeQuestions(fromBson(snapshot.definition.questions) as Question[])};
  let changed=canonical(definition)!==canonical(original)||canonical({allowAnonymous:survey.allowAnonymous,allowRepeat:survey.allowRepeat})!==canonical(snapshot.policySnapshot);
  if(survey.schemaVersion===3){const current=await readSourceSet(db,survey as Phase2SurveyDocument),published=await readSourceSet(db,survey as Phase2SurveyDocument,snapshot as Phase2SnapshotDocument);changed=changed||bindingHashOf(current.bindings)!==bindingHashOf(published.bindings);}
  return editorDto(survey,changed);
}
export function parseInstant(iso: string): Date {
  if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?(?:Z|[+-]\d{2}:\d{2})$/.test(iso)||!Number.isFinite(Date.parse(iso))) throw invalid();
  const day=Number(iso.slice(8,10)),month=Number(iso.slice(5,7)),year=Number(iso.slice(0,4));
  if(month<1||month>12||day<1||day>new Date(Date.UTC(year,month,0)).getUTCDate()) throw invalid();
  return new Date(iso);
}
export function registerEditingRoutes(app: FastifyInstance, db: Db, surveys: Collection<SurveyDocument>, auth: (request: {cookies:Record<string,string|undefined>})=>Promise<UserDocument>,phase2Save?:(userId:SurveyDocument['ownerId'],surveyId:string,expected:number,questions:Question[])=>Promise<SaveResult>) {
  async function owned(request: {cookies:Record<string,string|undefined>;params:{surveyId:string}}, expected: number) {
    const user=await auth(request),id=request.params.surveyId;
    if(!/^[0-9a-fA-F]{24}$/.test(id)) throw invalid();
    const survey=await surveys.findOne({_id:new ObjectId(id),ownerId:user._id});
    if(!survey) throw new ApiError(404,'NOT_FOUND','资源不存在或不可访问');
    if(survey.revision!==expected) throw conflict();
    return survey;
  }
  const conflict=()=>new ApiError(409,'EDIT_CONFLICT','编辑内容已变化，请重新加载并比较');
  async function save(survey: SurveyDocument, changes: Partial<SurveyDocument>, definitionChanged: boolean):Promise<SaveResult> {
    // Even a no-op is checked against the expected revision; it never bumps time or counters.
    const actual=Object.keys(changes).length
      ? await surveys.findOneAndUpdate({_id:survey._id,ownerId:survey.ownerId,revision:survey.revision},{ $set:{...changes,updatedAt:new Date()},$inc:{revision:1,...(definitionChanged?{definitionVersion:1}:{})} },{returnDocument:'after'})
      : await surveys.findOne({_id:survey._id,ownerId:survey.ownerId,revision:survey.revision});
    if(!actual) throw conflict();
    const dto=await loadEditor(db,actual);
    return {revision:dto.revision,draftDefinitionRevision:dto.draftDefinitionRevision,hasUnpublishedChanges:dto.hasUnpublishedChanges,validationIssues:dto.validationIssues};
  }
  app.patch<{Params:{surveyId:string};Body:PatchSurvey}>('/api/v1/surveys/:surveyId',{schema:{body:patchSurveySchema}},async request=>{
    const survey=await owned(request,request.body.expectedRevision),input=request.body,changes:Partial<SurveyDocument>={};
    if(survey.revision>=Number.MAX_SAFE_INTEGER||survey.definitionVersion>=Number.MAX_SAFE_INTEGER) throw invalid();
    if(('title'in input||'description'in input)&&!['draft','paused'].includes(survey.status)) throw new ApiError(409,'SURVEY_STATE_CONFLICT','当前收集状态不允许编辑定义');
    const textIssues=surveyTextIssues({title:input.title??survey.title,description:input.description??survey.description});
    if(textIssues.length) throw new ApiError(400,'INVALID_REQUEST',textIssues[0].message,textIssues.map(({field,reason})=>({field,reason})));
    if(input.title!==undefined&&input.title.trim()!==survey.title) changes.title=input.title.trim();
    if(input.description!==undefined&&input.description!==survey.description) changes.description=input.description;
    for(const key of ['allowAnonymous','allowRepeat'] as const) if(input[key]!==undefined&&input[key]!==survey[key]) {
      if(survey.firstPublishedAt!==null||survey.currentPublishedVersion!==null||survey.status!=='draft') throw new ApiError(409,'POLICY_LOCKED','首次发布后匿名和重复填写策略不可修改');
      changes[key]=input[key];
    }
    if(input.expiresAt!==undefined) {const date=input.expiresAt===null?null:parseInstant(input.expiresAt);if(date?.getTime()!==survey.expiresAt?.getTime()) changes.expiresAt=date;}
    // Validate any existing release reference before writing, never manufacture a snapshot.
    await loadEditor(db,survey);
    return {data:await save(survey,changes,'title'in changes||'description'in changes)};
  });
  app.put<{Params:{surveyId:string};Body:SaveQuestions}>('/api/v1/surveys/:surveyId/questions',{schema:{body:saveQuestionsSchema}},async request=>{
    if(phase2Save){const user=await auth(request);return {data:await phase2Save(user._id,request.params.surveyId,request.body.expectedRevision,request.body.questions)};}
    const survey=await owned(request,request.body.expectedRevision);
    if(!['draft','paused'].includes(survey.status)) throw new ApiError(409,'SURVEY_STATE_CONFLICT','当前收集状态不允许编辑题目');
    if(survey.revision>=Number.MAX_SAFE_INTEGER||survey.definitionVersion>=Number.MAX_SAFE_INTEGER) throw invalid();
    const checked=validateQuestions(request.body.questions);
    if(checked.errors.length) throw new ApiError(422,'DEFINITION_INVALID',checked.errors[0].message,checked.errors.map(({field,questionId,code})=>({field,questionId:questionId??undefined,reason:code})));
    const questions=normalizeQuestions(request.body.questions);
    let stored:unknown[];
    try{stored=toBson(questions);}catch{throw new ApiError(422,'DEFINITION_INVALID','数字无法精确保存为Decimal128');}
    if(BSON.calculateObjectSize({...survey,questions:stored})>2097152) throw new ApiError(422,'DEFINITION_INVALID','问卷定义超过2MiB限制');
    await loadEditor(db,survey);
    const changed=canonical(questions)!==canonical(normalizeQuestions(fromBson(survey.questions) as Question[]));
    return {data:await save(survey,changed?{questions:stored}:{},changed)};
  });
}
