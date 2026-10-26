import type {FastifyInstance} from 'fastify';
import {Decimal128,MongoServerError,ObjectId} from 'mongodb';
import type {Db,MongoClient,ClientSession} from 'mongodb';
import {evaluateAnswers,submitSchema} from '@survey/shared';
import type {Answer,SubmitCommand,SubmitReceipt,FillDefinition} from '@survey/shared';
import type {SurveyDocument} from '../database/models.js';
import {ApiError,invalid} from '../errors.js';
import {fromBson} from '../question-codec.js';
import type {Auth,FaultHooks} from './common.js';
import {hash,key} from './common.js';
import {definitionOf,versionRepository,validateStoredVersion} from './versions.js';
import {transactionOptions} from './publication.js';
export interface ResponseDocument {_id:ObjectId;schemaVersion:2;surveyId:ObjectId;surveyDefinitionVersion:number;respondentId:ObjectId;anonymous:boolean;repeatAllowed:boolean;requestId:string;payloadHash:string;payloadHashVersion:2;answers:unknown[];submittedAt:Date}
export const storedAnswers=(answers:Answer[])=>answers.map(a=>a.type==='number'?{...a,number:Decimal128.fromString(a.number)}:a);
export const responseAnswers=(r:ResponseDocument)=>fromBson(r.answers) as Answer[];
export function receiptOf(r:ResponseDocument,replayed:boolean):SubmitReceipt{return {receiptId:r._id.toHexString(),submittedAt:r.submittedAt.toISOString(),publishedVersion:r.surveyDefinitionVersion,replayed};}
export async function referencedVersion(db:Db,surveyId:ObjectId,version:number,session?:ClientSession){const stored=await versionRepository(db).find(surveyId,version,session);if(!stored)throw new ApiError(503,'VERSION_DEFINITION_UNAVAILABLE','答卷或问卷引用的发布定义缺失');await validateStoredVersion(db,stored,session);return stored;}
export function registerSubmission(app:FastifyInstance,db:Db,client:MongoClient,auth:Auth,faults:FaultHooks={}){
  const surveys=db.collection<SurveyDocument>('surveys'),responses=db.collection<ResponseDocument>('responses');
  const unavailable=(s:SurveyDocument)=>s.status==='closed'?'SURVEY_CLOSED':s.status==='paused'?'SURVEY_PAUSED':s.status!=='published'||s.currentPublishedVersion===null?'SURVEY_NOT_PUBLISHED':s.expiresAt&&s.expiresAt.getTime()<=Date.now()?'SURVEY_EXPIRED':null;
  const publicId=(value:string)=>{if(!/^[A-Za-z0-9_-]{1,128}$/.test(value))throw invalid();return value;};
  app.get<{Params:{publicId:string}}>('/api/v1/public/surveys/:publicId',async request=>{
    const user=await auth(request),s=await surveys.findOne({publicId:publicId(request.params.publicId)});
    if(!s||s.currentPublishedVersion===null)throw new ApiError(404,'NOT_FOUND','问卷不存在或尚未发布');
    const version=await referencedVersion(db,s._id,s.currentPublishedVersion),definition=definitionOf(version),hasSubmitted=!!await responses.findOne({surveyId:s._id,respondentId:user._id},{projection:{_id:1}});
    const reason=unavailable(s)??(!s.allowRepeat&&hasSubmitted?'ALREADY_SUBMITTED':null);
    const data:FillDefinition={publicId:s.publicId,...definition,publishedVersion:version.version,allowAnonymous:version.policySnapshot.allowAnonymous,allowRepeat:version.policySnapshot.allowRepeat,expiresAt:s.expiresAt?.toISOString()??null,canSubmit:!reason,unavailableReason:reason as FillDefinition['unavailableReason'],hasSubmitted};
    return {data};
  });
  app.post<{Params:{publicId:string};Body:SubmitCommand}>('/api/v1/public/surveys/:publicId/responses',{schema:{body:submitSchema}},async(request,reply)=>{
    const user=await auth(request),operationKey=key(request.headers['idempotency-key']),body=request.body,pid=publicId(request.params.publicId);
    async function replay(existing:ResponseDocument){
      if(existing.surveyDefinitionVersion!==body.publishedVersion||existing.payloadHashVersion!==2)throw new ApiError(409,'IDEMPOTENCY_CONFLICT','该提交key已用于不同内容或版本');
      const version=await referencedVersion(db,existing.surveyId,existing.surveyDefinitionVersion),checked=evaluateAnswers(definitionOf(version).questions,body.answers);
      if(checked.errors.length||hash({publishedVersion:body.publishedVersion,anonymous:body.anonymous,answers:checked.answers})!==existing.payloadHash)throw new ApiError(409,'IDEMPOTENCY_CONFLICT','该提交key已用于不同内容');
      return receiptOf(existing,true);
    }
    const perform=async(session:ClientSession)=>{
      const s=await surveys.findOne({publicId:pid},{session});if(!s)throw new ApiError(404,'NOT_FOUND','问卷不存在');
      const existing=await responses.findOne({surveyId:s._id,respondentId:user._id,requestId:operationKey},{session});if(existing)return replay(existing);
      const reason=unavailable(s);if(reason)throw new ApiError(409,reason,{SURVEY_CLOSED:'问卷已关闭',SURVEY_PAUSED:'问卷已暂停',SURVEY_NOT_PUBLISHED:'问卷尚未发布',SURVEY_EXPIRED:'已到收集截止时间'}[reason]);
      if(body.publishedVersion!==s.currentPublishedVersion)throw new ApiError(409,'SURVEY_VERSION_CHANGED','发布版本已变化，请重新加载',[{expectedPublishedVersion:s.currentPublishedVersion!,reloadRequired:true}]);
      if(!s.allowRepeat&&await responses.findOne({surveyId:s._id,respondentId:user._id},{session}))throw new ApiError(409,'ALREADY_SUBMITTED','当前账号已经提交过这份问卷');
      const version=await referencedVersion(db,s._id,s.currentPublishedVersion!,session),checked=evaluateAnswers(definitionOf(version).questions,body.answers);
      if(body.anonymous&&!version.policySnapshot.allowAnonymous)throw new ApiError(422,'ANONYMOUS_NOT_ALLOWED','这份问卷不允许匿名提交');
      if(checked.errors.length)throw new ApiError(422,'ANSWER_VALIDATION_FAILED',checked.errors[0].message,checked.errors.map(({questionId,field,reason})=>({questionId,field,reason})));
      const acceptedAt=new Date();if(s.expiresAt&&s.expiresAt.getTime()<=acceptedAt.getTime())throw new ApiError(409,'SURVEY_EXPIRED','已到收集截止时间');
      const r:ResponseDocument={_id:new ObjectId(),schemaVersion:2,surveyId:s._id,surveyDefinitionVersion:version.version,respondentId:user._id,anonymous:body.anonymous,repeatAllowed:s.allowRepeat,requestId:operationKey,payloadHash:hash({publishedVersion:body.publishedVersion,anonymous:body.anonymous,answers:checked.answers}),payloadHashVersion:2,answers:storedAnswers(checked.answers),submittedAt:acceptedAt};
      const update=await surveys.updateOne({_id:s._id,status:'published',currentPublishedVersion:version.version,revision:s.revision,$or:[{expiresAt:null},{expiresAt:{$gt:acceptedAt}}]},{$inc:{submissionCount:1,currentVersionSubmissionCount:1}},{session});
      if(update.modifiedCount!==1)throw new ApiError(409,'SURVEY_VERSION_CHANGED','收集状态或版本已变化，请重新加载',[{reloadRequired:true}]);
      await responses.insertOne(r,{session});faults.afterResponseInsert?.();return receiptOf(r,false);
    };
    try{const data=await client.withSession(session=>session.withTransaction(()=>perform(session),transactionOptions));return reply.code(data.replayed?200:201).send({data});}
    catch(error){
      if(error instanceof MongoServerError&&error.code===11000){const s=await surveys.findOne({publicId:pid});const existing=s&&await responses.findOne({surveyId:s._id,respondentId:user._id,requestId:operationKey});if(existing)return reply.code(200).send({data:await replay(existing)});if(s&&!s.allowRepeat&&await responses.findOne({surveyId:s._id,respondentId:user._id}))throw new ApiError(409,'ALREADY_SUBMITTED','当前账号已经提交过这份问卷');}
      if(error instanceof MongoServerError&&error.hasErrorLabel('UnknownTransactionCommitResult'))throw new ApiError(503,'SUBMISSION_OUTCOME_UNKNOWN','提交结果尚未确认，请使用原key重试');
      throw error;
    }
  });
}
