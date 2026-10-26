import type {FastifyInstance} from 'fastify';
import {BSON,MongoServerError} from 'mongodb';
import type {Db,MongoClient,ClientSession} from 'mongodb';
import {normalizeQuestions,validateQuestions} from '@survey/shared';
import type {PublishCommand,PublishReceipt,Question} from '@survey/shared';
import type {SurveyDocument} from '../database/models.js';
import type {Config} from '../config.js';
import {ApiError} from '../errors.js';
import {fromBson,toBson} from '../question-codec.js';
import {hash,own,key,pageParams,positive,readCursor,signCursor,publishSchema,revisionSchema} from './common.js';
import type {Auth,FaultHooks} from './common.js';
import {versionRepository,requireVersion,versionDto,validateStoredVersion} from './versions.js';
import type {VersionDocument} from './versions.js';
export const transactionOptions={readConcern:{level:'snapshot' as const},writeConcern:{w:'majority' as const},readPreference:'primary' as const};
export function registerPublication(app:FastifyInstance,db:Db,client:MongoClient,auth:Auth,config:Config,faults:FaultHooks={},phase2Publish?:(actorId:SurveyDocument['ownerId'],surveyId:string,body:PublishCommand,key:string)=>Promise<{httpStatus:200|201;data:PublishReceipt}>){
  const surveys=db.collection<SurveyDocument>('surveys'),versions=versionRepository(db);
  function receipt(s:SurveyDocument,v:VersionDocument,body:PublishCommand,replayed:boolean):PublishReceipt{return {surveyId:s._id.toHexString(),publishedVersion:v.version,status:'published',revision:body.expectedRevision+1,publishedAt:v.publishedAt.toISOString(),firstPublishedAt:(s.firstPublishedAt??v.publishedAt).toISOString(),shareUrl:`${config.publicAppUrl ?? config.origin}/survey/${s.publicId}`,replayed};}
  app.post<{Params:{surveyId:string};Body:PublishCommand}>('/api/v1/surveys/:surveyId/publish',{schema:{body:publishSchema}},async(request,reply)=>{
    const user=await auth(request),operationKey=key(request.headers['publication-key']),body=request.body,requestHash=hash(body);
    if(phase2Publish){const result=await phase2Publish(user._id,request.params.surveyId,body,operationKey);return reply.code(result.httpStatus).send({data:result.data});}
    let replayed=false;
    const perform=async(session?:ClientSession)=>{
      const s=await own(db,request.params.surveyId,user._id,session);
      const old=await versions.byRequest(s._id,operationKey,session);
      if(old){if(old.publicationRequestHash!==requestHash)throw new ApiError(409,'PUBLICATION_IDEMPOTENCY_CONFLICT','该发布key已用于不同操作前提');replayed=true;return receipt(s,old,body,true);}
      if(!session)throw new ApiError(503,'PUBLICATION_OUTCOME_UNKNOWN','请使用原发布key重试确认结果');
      if(!['draft','paused'].includes(s.status))throw new ApiError(409,'SURVEY_STATE_CONFLICT','请先暂停收集后再发布');
      if(s.revision!==body.expectedRevision)throw new ApiError(409,'EDIT_CONFLICT','编辑内容已变化，请重新加载并比较');
      if(s.definitionVersion!==body.expectedDraftDefinitionVersion)throw new ApiError(409,'DRAFT_DEFINITION_CONFLICT','题目编辑修订已变化');
      if(s.expiresAt&&s.expiresAt.getTime()<=Date.now())throw new ApiError(409,'SURVEY_EXPIRED','截止时间已到，请先调整截止时间');
      const questions=normalizeQuestions(fromBson(s.questions) as Question[]),checked=validateQuestions(questions),issues=[...checked.errors,...checked.validationIssues];
      if(issues.length)throw new ApiError(422,'DEFINITION_INVALID','请先修复发布前检查问题',issues.map(i=>({field:i.field,reason:i.code,questionId:i.questionId??undefined})));
      const latest=(await versions.list(s._id,undefined,1,session))[0]?.version??0;
      const version=Math.max(latest,s.currentPublishedVersion??0)+1;
      if(!Number.isSafeInteger(version)||s.revision>=Number.MAX_SAFE_INTEGER)throw new ApiError(422,'DEFINITION_INVALID','修订号超出安全范围');
      const now=new Date(),definition={title:s.title,description:s.description,questions};
      const document:VersionDocument={schemaVersion:1,surveyId:s._id,version,sourceDefinitionVersion:s.definitionVersion,definition:{...definition,questions:toBson(questions)},policySnapshot:{allowAnonymous:s.allowAnonymous,allowRepeat:s.allowRepeat},definitionHash:hash({definition,policy:{allowAnonymous:s.allowAnonymous,allowRepeat:s.allowRepeat}}),publishedAt:now,publishedBy:user._id,publicationRequestId:operationKey,publicationRequestHash:requestHash,origin:{kind:'publication'}};
      if(BSON.calculateObjectSize(document)>2097152)throw new ApiError(422,'DEFINITION_INVALID','发布定义超过2MiB');
      const update=await surveys.updateOne({_id:s._id,ownerId:user._id,revision:s.revision,status:s.status},{$set:{status:'published',currentPublishedVersion:version,currentVersionSubmissionCount:0,firstPublishedAt:s.firstPublishedAt??now,updatedAt:now},$inc:{revision:1}},{session});
      if(update.modifiedCount!==1)throw new ApiError(409,'EDIT_CONFLICT','发布前提已变化');
      await versions.insert(document,session);faults.afterSnapshotInsert?.();
      return receipt(s,document,body,false);
    };
    try{const data=await client.withSession(session=>session.withTransaction(()=>perform(session),transactionOptions));return reply.code(replayed?200:201).send({data});}
    catch(error){if(error instanceof MongoServerError&&error.code===11000){const data=await perform();return reply.code(200).send({data});}if(error instanceof MongoServerError&&error.hasErrorLabel('UnknownTransactionCommitResult'))throw new ApiError(503,'PUBLICATION_OUTCOME_UNKNOWN','发布结果暂未确认，请用原key重试');throw error;}
  });
  for(const action of ['pause','close'] as const)app.post<{Params:{surveyId:string};Body:{expectedRevision:number}}>(`/api/v1/surveys/:surveyId/${action}`,{schema:{body:revisionSchema}},async request=>{
    const user=await auth(request),s=await own(db,request.params.surveyId,user._id),target=action==='pause'?'paused':'closed';
    if(s.revision!==request.body.expectedRevision)throw new ApiError(409,'EDIT_CONFLICT','编辑修订已变化');
    if(!(action==='pause'?['published']:['published','paused']).includes(s.status))throw new ApiError(409,'SURVEY_STATE_CONFLICT','当前状态不允许此操作');
    const changed=await surveys.updateOne({_id:s._id,ownerId:user._id,revision:s.revision,status:s.status},{$set:{status:target,updatedAt:new Date()},$inc:{revision:1}});
    if(changed.modifiedCount!==1)throw new ApiError(409,'EDIT_CONFLICT','收集状态已变化，请重新加载');
    return {data:{surveyId:s._id.toHexString(),status:target,revision:s.revision+1,currentPublishedVersion:s.currentPublishedVersion}};
  });
  app.post<{Params:{surveyId:string};Body:{expectedRevision:number}}>('/api/v1/surveys/:surveyId/copy',{schema:{body:revisionSchema}},async request=>{const user=await auth(request);await own(db,request.params.surveyId,user._id);throw new ApiError(501,'FEATURE_NOT_ENABLED','复制问卷暂未启用');});
  app.get<{Params:{surveyId:string}}>('/api/v1/surveys/:surveyId/versions',async request=>{
    const user=await auth(request),s=await own(db,request.params.surveyId,user._id),p=pageParams(request.url),scope={owner:user._id.toHexString(),endpoint:'versions',surveyId:s._id.toHexString()};
    const after=p.cursor?readCursor(p.cursor,scope,config.cursorSecret):undefined;
    if(after!==undefined&&(typeof after!=='number'||!Number.isSafeInteger(after)||after<1))throw new ApiError(400,'INVALID_CURSOR','版本游标无效');
    const rows=await versions.list(s._id,after as number|undefined,p.limit+1),items=rows.slice(0,p.limit);
    for(const v of items)await validateStoredVersion(db,v);
    return {data:{surveyId:s._id.toHexString(),latestPublishedVersion:s.currentPublishedVersion,items:items.map(v=>({publishedVersion:v.version,title:versionDto(v).definition.title,publishedAt:v.publishedAt.toISOString(),legacy:false})),nextCursor:rows.length>p.limit?signCursor(scope,items.at(-1)!.version,config.cursorSecret):null}};
  });
  app.get<{Params:{surveyId:string;version:string}}>('/api/v1/surveys/:surveyId/versions/:version',async request=>{const user=await auth(request),s=await own(db,request.params.surveyId,user._id);return {data:versionDto(await requireVersion(db,s._id,positive(request.params.version)))};});
}
