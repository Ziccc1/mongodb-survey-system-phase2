import {ObjectId,BSON} from 'mongodb';
import type {Db,ClientSession,Document} from 'mongodb';
import type {Usage,UsageVersion,Derivation} from '@survey/shared';
import type {Phase2SurveyDocument,Phase2SnapshotDocument,QuestionVersionDocument,QuestionItemDocument} from '../database/phase2-models.js';
import {readSourceSet} from '../database/source-read.js';
import {jsonInteger} from '../database/receipt-codec.js';
import {oidString} from '../database/operation-contract.js';
import {mappingIncomplete} from '../database/binding-integrity.js';
import {ApiError,invalid} from '../errors.js';
import {pageParams,readCursor,signCursor,timePoint} from './common.js';
import {LibraryService,notFound} from './library.js';

export async function verifySourceCoverage(db:Db,session?:ClientSession){
 for await(const survey of db.collection<Phase2SurveyDocument>('surveys').find({},{session})){
  if(survey.schemaVersion!==3)throw mappingIncomplete();
  await readSourceSet(db,survey,undefined,session);
  const snapshots=await db.collection<Phase2SnapshotDocument>('survey_versions').find({surveyId:survey._id},{session}).toArray();
  if(survey.currentPublishedVersion===null?snapshots.length>0:!snapshots.some(v=>jsonInteger(v.version,1)===jsonInteger(survey.currentPublishedVersion,1)))throw mappingIncomplete();
  for(const snapshot of snapshots)await readSourceSet(db,survey,snapshot,session,{requireComplete:true});
 }
}
export class QuestionUsageService {
 constructor(private db:Db,private actor:ObjectId,private library:LibraryService){}
 async query(questionId:string,url:string,secret:string,session:ClientSession){
  const qid=new ObjectId(oidString(questionId)),access=await this.library.access(qid,session);if(!access)throw notFound();
  const params=new URL(url,'http://localhost').searchParams,kind=params.get('kind')??'references';if(!['references','derivations'].includes(kind))throw invalid();
  const versionId=params.has('versionId')?oidString(params.get('versionId')):null;
  if(versionId&&!await this.db.collection('question_versions').findOne({_id:new ObjectId(versionId),questionId:qid},{session}))throw notFound();
  const p=pageParams(url),scope={actorId:this.actor.toHexString(),endpoint:'questionUsage',questionId,kind,versionId,sort:kind==='references'?'usageNumber_asc':'createdAt_desc_id_desc'};
  const after=p.cursor?readCursor(p.cursor,scope,secret):undefined;
  if(kind==='derivations'){
   if(!access.item.ownerId.equals(this.actor))throw notFound();const point=after===undefined?null:timePoint(after);
   const rows=await this.db.collection<QuestionItemDocument>('question_items').find({'origin.kind':'fork','origin.sourceQuestionId':qid,...(versionId?{'origin.sourceVersionId':new ObjectId(versionId)}:{}),...(point?{$or:[{createdAt:{$lt:point.time}},{createdAt:point.time,_id:{$lt:point._id}}]}:{})},{session}).sort({createdAt:-1,_id:-1}).limit(p.limit+1).toArray(),items:Derivation[]=[];
   for(const item of rows.slice(0,p.limit)){const owner=await this.db.collection('users').findOne({_id:item.ownerId},{session});if(!owner||!item.origin?.sourceVersionId)throw mappingIncomplete();items.push({questionId:item._id.toHexString(),ownerUsername:owner.username,sourceVersionId:item.origin.sourceVersionId.toHexString(),createdAt:item.createdAt.toISOString()});}
   const last=rows.slice(0,p.limit).at(-1);return {items,nextCursor:rows.length>p.limit&&last?signCursor(scope,{time:last.createdAt.toISOString(),id:last._id.toHexString()},secret):null};
  }
  if(after!==undefined&&(typeof after!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(after)))throw new ApiError(400,'INVALID_CURSOR','使用情况分页位置无效');
  // Course-scale completeness gate also detects an entire removed mapping group, which a match-only aggregate would miss.
  await verifySourceCoverage(this.db,session);
  const rows=await this.db.collection('survey_question_bindings').aggregate<Document>([
   {$match:{questionId:qid,...(versionId?{questionVersionId:new ObjectId(versionId)}:{})}},
   {$lookup:{from:'surveys',localField:'surveyId',foreignField:'_id',as:'survey'}},{$unwind:'$survey'},
   {$group:{_id:{surveyId:'$surveyId',versionId:'$questionVersionId'},isDraft:{$max:{$eq:['$scope','draft']}},isCurrent:{$max:{$and:[{$eq:['$scope','publication']},{$eq:['$publicationVersion','$survey.currentPublishedVersion']}]}},hasHistorical:{$max:{$and:[{$eq:['$scope','publication']},{$ne:['$publicationVersion','$survey.currentPublishedVersion']}]}}}},
   {$group:{_id:'$_id.surveyId',versions:{$push:{versionId:'$_id.versionId',isDraft:'$isDraft',isCurrent:'$isCurrent',hasHistorical:'$hasHistorical'}}}},
   {$lookup:{from:'surveys',localField:'_id',foreignField:'_id',as:'survey'}},{$unwind:'$survey'},
   ...(after===undefined?[]:[{$match:{'survey.usageNumber':{$gt:after}}}]),{$sort:{'survey.usageNumber':1}},{$limit:p.limit+1},
  ],{session,allowDiskUse:true}).toArray();
  const items:Usage[]=[];
  for(const row of rows.slice(0,p.limit)){
   const survey=row.survey as Phase2SurveyDocument;if(survey.schemaVersion!==3||row.versions.length>1000)throw new ApiError(422,'USAGE_SCOPE_TOO_LARGE','请限定正式版本后查询');
   const versions:UsageVersion[]=[];
   for(const state of row.versions){const v=await this.db.collection<QuestionVersionDocument>('question_versions').findOne({_id:state.versionId,questionId:qid},{session});if(!v)throw mappingIncomplete();versions.push({versionId:v._id.toHexString(),version:jsonInteger(v.version,1),isDraft:state.isDraft,isCurrent:state.isCurrent,hasHistorical:state.hasHistorical});}
   versions.sort((a,b)=>b.version-a.version||(a.versionId<b.versionId?-1:a.versionId>b.versionId?1:0));
   const isDraft=versions.some(v=>v.isDraft),isCurrent=versions.some(v=>v.isCurrent),common={surveyNumber:survey.usageNumber,versions,isDraft,isCurrent,onlyHistorical:!isDraft&&!isCurrent&&versions.some(v=>v.hasHistorical)};
   if(survey.ownerId.equals(this.actor))items.push({...common,surveyId:survey._id.toHexString(),title:survey.title,managePath:`/surveys/${survey._id.toHexString()}`});
   else{const owner=await this.db.collection('users').findOne({_id:survey.ownerId},{session});if(!owner)throw mappingIncomplete();items.push({...common,username:owner.username});}
  }
  if(BSON.calculateObjectSize({items})>2097152)throw new ApiError(422,'USAGE_SCOPE_TOO_LARGE','结果超过容量，请缩小查询范围');
  return {items,nextCursor:rows.length>p.limit?signCursor(scope,(rows[p.limit-1].survey as {usageNumber:string}).usageNumber,secret):null};
 }
}
