import {BSON,Decimal128,MongoServerError,ObjectId,Timestamp} from 'mongodb';
import type {ClientSession,Db,MongoClient,Document} from 'mongodb';
import {canonical,decimalValue,evaluateAnswers,hasAnswer} from '@survey/shared';
import type {Answer,CrossAnswer,CrossBase,CrossStatistics,Question,QuestionContent} from '@survey/shared';
import type {Phase2SurveyDocument,Phase2SnapshotDocument,QuestionVersionDocument} from '../database/phase2-models.js';
import {contentOfVersion,contentHashOf,mappingIncomplete} from '../database/binding-integrity.js';
import {readSourceSet} from '../database/source-read.js';
import {jsonInteger} from '../database/receipt-codec.js';
import {ApiError,invalid} from '../errors.js';
import {definitionOf} from './versions.js';
import type {VersionDocument} from './versions.js';
import {responseAnswers} from './submission.js';
import type {ResponseDocument} from './submission.js';
import {hash,id,pageParams,readCursor,signCursor} from './common.js';
import type {FaultHooks} from './common.js';
const expired=()=>new ApiError(409,'REPORT_SNAPSHOT_EXPIRED','统计快照已过期，请重新查询第一页',[{reloadRequired:true}]);
const capacity=()=>new ApiError(422,'REPORT_SCOPE_TOO_LARGE','统计范围超过容量，请限定本人问卷范围');
interface Point {at:{t:number;i:number};asOf:string;expires:number;after:unknown}
interface Sample {dto:CrossAnswer;answer:Answer;responseId:ObjectId;surveyId:ObjectId;publishedVersion:number;instanceId:string}
export class CrossStatisticsService {
 constructor(private db:Db,private client:MongoClient,private actor:ObjectId,private secret:string,private faults:FaultHooks={}){}
 private async currentScope(selected:string[]|null){
  const rows=await this.db.collection<Phase2SurveyDocument>('surveys').find({ownerId:this.actor,...(selected?{_id:{$in:selected.map(id)}}:{})}).project({_id:1}).limit(1001).toArray();
  if(rows.length>1000)throw capacity();if(selected&&rows.length!==selected.length)throw new ApiError(404,'NOT_FOUND','统计范围不存在或不可访问');return rows.map(x=>x._id.toHexString()).sort();
 }
 async query(questionId:string,versionId:string,url:string,kind:'summary'|'answers'|'distribution'){
  const qid=id(questionId),vid=id(versionId),query=new URL(url,'http://localhost').searchParams,p=pageParams(url);
  const selected=query.has('surveyIds')?query.get('surveyIds')!.split(','):null;
  if(selected&&(!selected.length||selected.length>100||new Set(selected).size!==selected.length||selected.some(v=>!/^[0-9a-f]{24}$/.test(v))))throw invalid();selected?.sort();
  const scope={actorId:this.actor.toHexString(),endpoint:'crossStatistics/'+kind,questionId:qid.toHexString(),versionId:vid.toHexString(),surveyIdsHash:hash(selected),sort:kind==='distribution'?'decimal_asc':'submittedAt_desc_responseId_desc_instanceId_desc'};
  let point:Point|null=null;
  if(p.cursor){const raw=readCursor(p.cursor,scope,this.secret) as Point;try{if(!raw||!Number.isSafeInteger(raw.at.t)||!Number.isSafeInteger(raw.at.i)||raw.at.t<0||raw.at.i<0||raw.at.t>0xffffffff||raw.at.i>0xffffffff||!Number.isFinite(raw.expires)||new Date(raw.asOf).toISOString()!==raw.asOf)throw Error();point=raw;}catch{throw new ApiError(400,'INVALID_CURSOR','统计游标无效');}}
  const current=await this.currentScope(selected);
  // A current grant is not required for retained publication rights. No source author can read another owner's answers.
  const retained=await this.db.collection('survey_question_bindings').findOne({ownerId:this.actor,surveyId:{$in:current.map(id)},scope:'publication',questionId:qid,questionVersionId:vid});
  const item=await this.db.collection('question_items').findOne({_id:qid});
  const grant=item&&!item.ownerId.equals(this.actor)?await this.db.collection('question_grants').findOne({questionId:qid,recipientId:this.actor,grantedBy:item.ownerId,state:'active'}):null;
  const allowed=!!retained||!!item&&(item.ownerId.equals(this.actor)||!!grant);
  // Reject before looking up the version, its type, or any historical definition/answers.
  // Retained publication acquisition facts remain a separate right after share/public revocation.
  if(!allowed)throw new ApiError(404,'NOT_FOUND','统计题目不存在或不可访问');
  if(point&&point.expires<=Date.now())throw expired();
  // mongodb 7.7.0 sessions.ts stores the server cursor.atClusterTime here; @internal strips it from .d.ts.
  // Keep the version-pinned bridge local and fail closed if a first real snapshot read does not populate it.
  const session=this.client.startSession({snapshot:true,causalConsistency:false}) as ClientSession&{snapshotTime?:Timestamp};if(point)session.snapshotTime=new Timestamp({t:point.at.t,i:point.at.i});
  try{
   const version=await this.db.collection<QuestionVersionDocument>('question_versions').findOne({_id:vid,questionId:qid},{session});if(!version)throw new ApiError(404,'NOT_FOUND','正式版本不存在');if(!item||!version.createdBy.equals(item.ownerId)||contentHashOf(version)!==version.contentHash)throw mappingIncomplete();
   if(!session.snapshotTime)throw new ApiError(503,'REPORT_SNAPSHOT_UNAVAILABLE','数据库未提供统计快照时刻');
   const at={t:session.snapshotTime.getHighBitsUnsigned(),i:session.snapshotTime.getLowBitsUnsigned()},asOf=point?.asOf??new Date().toISOString(),expires=point?.expires??Date.now()+300000;
   await this.faults.afterReportSnapshot?.({timestamp:at});
   const frozen=await this.db.collection('surveys').find({ownerId:this.actor,...(selected?{_id:{$in:selected.map(id)}}:{})},{session}).project({_id:1}).limit(1001).toArray();
   if(frozen.length>1000)throw capacity();const surveyIds=frozen.map(s=>s._id.toHexString()).sort();
   if(surveyIds.some(s=>!current.includes(s)))throw new ApiError(404,'NOT_FOUND','统计范围不存在或不可访问');
   const content=contentOfVersion(version);if(kind==='answers'&&!['text','number'].includes(content.type)||kind==='distribution'&&content.type!=='number')throw new ApiError(422,'UNSUPPORTED_QUESTION_TYPE','所选题型不支持此统计');
   const boundaries=query.has('boundaries')?query.get('boundaries')!.split(','):[];
   if(boundaries.length&&(content.type!=='number'||boundaries.length<2||boundaries.length>21||boundaries.some(x=>!decimalValue(x))||boundaries.some((x,i)=>i>0&&!decimalValue(x)!.gt(decimalValue(boundaries[i-1])!))))throw invalid();
   const checked=await this.samples(surveyIds,qid,vid,session),samples=checked.samples;
   const base:CrossBase={questionId:qid.toHexString(),versionId:vid.toHexString(),generatedAt:new Date().toISOString(),surveyCount:checked.surveyCount,eligibleResponseCount:checked.eligible,answeredCount:samples.length,skippedCount:checked.skipped,unansweredCount:checked.unanswered};
   if(kind==='summary')return await this.summary(base,content,boundaries,samples,session);
   const next=(after:unknown)=>signCursor(scope,{at,asOf,expires,after},this.secret);
   if(kind==='answers'){
    const sorted=samples.map(x=>x.dto).sort((a,b)=>b.submittedAt.localeCompare(a.submittedAt)||b.responseId.localeCompare(a.responseId)||b.instanceId.localeCompare(a.instanceId));
    let rows=sorted;
    if(point){const a=point.after as CrossAnswer;if(!a||typeof a.submittedAt!=='string'||!/^[0-9a-f]{24}$/.test(a.responseId)||typeof a.instanceId!=='string')throw new ApiError(400,'INVALID_CURSOR','统计位置无效');rows=sorted.filter(x=>x.submittedAt<a.submittedAt||x.submittedAt===a.submittedAt&&(x.responseId<a.responseId||x.responseId===a.responseId&&x.instanceId<a.instanceId));}
    const items=rows.slice(0,p.limit),last=items.at(-1),data={questionId,versionId,generatedAt:base.generatedAt,asOf,items,nextCursor:rows.length>p.limit?next({submittedAt:last!.submittedAt,responseId:last!.responseId,instanceId:last!.instanceId}):null};if(BSON.calculateObjectSize(data)>2097152)throw capacity();return data;
   }
   const after=point?.after;if(point&&(typeof after!=='string'||!decimalValue(after)))throw new ApiError(400,'INVALID_CURSOR','数值分页位置无效');
   const rows=await this.db.collection('responses').aggregate<Document>([...this.valuesPipeline(samples),{$group:{_id:'$answers.number',count:{$sum:1}}},...(point?[{$match:{_id:{$gt:Decimal128.fromString(after as string)}}}]:[]),{$sort:{_id:1}},{$limit:p.limit+1}],{session,maxTimeMS:30000}).toArray();
   const items=rows.slice(0,p.limit).map(x=>({value:decimalValue(x._id.toString())!.toString(),count:jsonInteger(x.count)}));
   return {questionId,versionId,generatedAt:base.generatedAt,asOf,items,nextCursor:rows.length>p.limit?next(items.at(-1)!.value):null};
  }catch(error){if(error instanceof MongoServerError&&[239,246,286].includes(Number(error.code??0)))throw expired();throw error;}
  finally{await session.endSession();}
 }
 private async samples(surveyIds:string[],qid:ObjectId,vid:ObjectId,session:ClientSession){
  const samples:Sample[]=[],used=new Set<string>();let eligible=0,skipped=0,unanswered=0,snapshotCount=0,scanned=0;
  for(const surveyId of surveyIds){
   const survey=await this.db.collection<Phase2SurveyDocument>('surveys').findOne({_id:id(surveyId),ownerId:this.actor},{session});if(!survey)throw mappingIncomplete();
   const snapshots=await this.db.collection<Phase2SnapshotDocument>('survey_versions').find({surveyId:survey._id},{session}).limit(5001).toArray();snapshotCount+=snapshots.length;if(snapshotCount>5000)throw capacity();
   if(survey.currentPublishedVersion!==null&&!snapshots.some(v=>jsonInteger(v.version)===jsonInteger(survey.currentPublishedVersion)))throw mappingIncomplete();
   const published=new Set(snapshots.map(v=>jsonInteger(v.version)));
   if(await this.db.collection('responses').findOne({surveyId:survey._id,surveyDefinitionVersion:{$nin:[...published]}},{session}))throw mappingIncomplete();
   for(const snapshot of snapshots){
    if(!snapshot.publishedBy.equals(survey.ownerId))throw mappingIncomplete();
    const definition=definitionOf(snapshot as unknown as VersionDocument),source=await readSourceSet(this.db,survey,snapshot,session,{requireComplete:true});
    const matches=source.bindings.filter(b=>b.questionId.equals(qid)&&b.questionVersionId.equals(vid));
    if(matches.length>1)throw new ApiError(503,'QUESTION_MAPPING_INCOMPLETE','历史同题同版存在多个实例，需先审阅legacyMultiplicity边界');
    if(!matches.length)continue;used.add(surveyId);const instanceId=matches[0].instanceId;
    const cursor=this.db.collection<ResponseDocument>('responses').find({surveyId:survey._id,surveyDefinitionVersion:jsonInteger(snapshot.version)},{session}).batchSize(200);
    for await(const response of cursor){
     if(++scanned>100000)throw capacity();let input:Answer[],checked:ReturnType<typeof evaluateAnswers>;
     try{input=responseAnswers(response);checked=evaluateAnswers(definition.questions,input);if(checked.errors.length||canonical(checked.answers)!==canonical(input)||response.payloadHashVersion!==2||response.payloadHash!==hash({publishedVersion:jsonInteger(response.surveyDefinitionVersion),anonymous:response.anonymous,answers:checked.answers}))throw Error();}catch{throw new ApiError(503,'REPORT_DATA_INVALID','历史答卷损坏或不符合发布定义，统计已停止');}
     eligible++;const answer=checked.answers.find(x=>x.questionId===instanceId);
     if(!checked.path.some(q=>q.id===instanceId)){skipped++;continue;}if(!hasAnswer(answer)){unanswered++;continue;}
     const value=answer.type==='text'?answer.text:answer.type==='number'?answer.number:'';
     samples.push({dto:{surveyId,publishedVersion:jsonInteger(snapshot.version),instanceId,responseId:response._id.toHexString(),submittedAt:response.submittedAt.toISOString(),value},answer,responseId:response._id,surveyId:survey._id,publishedVersion:jsonInteger(snapshot.version),instanceId});
    }
   }
  }
  return {samples,surveyCount:used.size,eligible,skipped,unanswered};
 }
 private valuesPipeline(samples:Sample[]):Document[]{
  // _id index bounds the aggregate to the already path-validated real response facts.
  const tuples=[...new Map(samples.map(x=>[`${x.surveyId}:${x.publishedVersion}:${x.instanceId}`,{surveyId:x.surveyId,surveyDefinitionVersion:x.publishedVersion,'answers.questionId':x.instanceId}])).values()];
  const pipeline=[{$match:{_id:{$in:samples.map(x=>x.responseId)}}},{$unwind:'$answers'},{$match:{$or:tuples.length?tuples:[{_id:null}]}},{$group:{_id:{responseId:'$_id',instanceId:'$answers.questionId'},answers:{$first:'$answers'}}}];
  if(BSON.calculateObjectSize({pipeline})>2097152)throw capacity();return pipeline;
 }
 private async summary(base:CrossBase,content:QuestionContent,boundaries:string[],samples:Sample[],session:ClientSession):Promise<CrossStatistics>{
  if(content.type==='single'||content.type==='multiple')return {...base,optionCounts:content.options.map(o=>{const count=samples.filter(s=>s.answer.type==='single'?s.answer.optionId===o.id:s.answer.type==='multiple'&&s.answer.optionIds.includes(o.id)).length;return {optionId:o.id,label:o.label,count,percentage:base.answeredCount?decimalValue(String(count))!.mul(100).div(base.answeredCount).toString():null};})};
  if(content.type==='text')return base;
  const rows=await this.db.collection('responses').aggregate<Document>([...this.valuesPipeline(samples),{$group:{_id:null,average:{$avg:'$answers.number'},min:{$min:'$answers.number'},max:{$max:'$answers.number'}}}],{session,maxTimeMS:30000}).toArray();
  const number=(v:unknown)=>v===null||v===undefined?null:decimalValue(String(v))!.toString(),bs=boundaries.map(v=>decimalValue(v)!),bins:{lower:string|null;upper:string|null;upperInclusive:boolean;count:number}[]=[];
  if(bs.length){bins.push({lower:null,upper:bs[0].toString(),upperInclusive:false,count:0});for(let i=0;i<bs.length-1;i++)bins.push({lower:bs[i].toString(),upper:bs[i+1].toString(),upperInclusive:i===bs.length-2,count:0});bins.push({lower:bs.at(-1)!.toString(),upper:null,upperInclusive:false,count:0});
   for(const sample of samples){const v=decimalValue(sample.dto.value)!;let index=0;if(v.gt(bs.at(-1)!))index=bins.length-1;else if(v.gte(bs[0])){index=bins.length-2;for(let i=1;i<bs.length;i++)if(v.lt(bs[i])){index=i;break;}}bins[index].count++;}
  }
  return {...base,average:number(rows[0]?.average),min:number(rows[0]?.min),max:number(rows[0]?.max),bins};
 }
}
