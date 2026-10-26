import {ObjectId} from 'mongodb';
import type {Db,ClientSession,Document} from 'mongodb';
import {canonical,codePointLength,normalizeUsername} from '@survey/shared';
import type {QuestionContent,QuestionEditor,QuestionVersion,Bank,BankMember,Grant,LibraryQuestionSummary} from '@survey/shared';
import type {QuestionItemDocument,QuestionVersionDocument,QuestionBankDocument,QuestionGrantDocument,AuthorizationProof,DistributionSource,Phase2SurveyDocument} from '../database/phase2-models.js';
import {readSourceSet} from '../database/source-read.js';
import type {ResourceResult} from '../database/operation-contract.js';
import {normalizeContentInput,exact,safeInteger,oidString} from '../database/operation-contract.js';
import {jsonInteger} from '../database/receipt-codec.js';
import {contentOfVersion,contentHashOf,mappingIncomplete} from '../database/binding-integrity.js';
import {contentToBson} from '../content-codec.js';
import {ApiError,invalid} from '../errors.js';
import {hash,pageParams,readCursor,signCursor,timePoint} from './common.js';
import type {FaultHooks} from './common.js';

export const notFound=()=>new ApiError(404,'NOT_FOUND','资源不存在或不可访问');
export const editConflict=()=>new ApiError(409,'EDIT_CONFLICT','内容已变化，本地编辑已保留，请重新读取并比较');
export function assertRevision(actual:unknown,expected:unknown){if(jsonInteger(actual)!==safeInteger(expected))throw editConflict();}
export function incrementable(value:unknown){if(jsonInteger(value)>=Number.MAX_SAFE_INTEGER)throw new ApiError(422,'DEFINITION_INVALID','修订号超出范围');}
const oid=(s:unknown)=>new ObjectId(oidString(s));
const title=(s:unknown,max:number)=>{if(typeof s!=='string'||!s.trim()||codePointLength(s)>max)throw invalid();return s.trim();};
/** Server implementation detail; only the owned context supplies the Db and active-session guard. */
export class LibraryService {
 constructor(private db:Db,readonly actor:ObjectId,private requireWrite:(s:ClientSession)=>void,private faults:FaultHooks={}){}
 private items(){return this.db.collection<QuestionItemDocument>('question_items');}
 async item(questionId:ObjectId,session:ClientSession,ownerOnly=false){
  const item=await this.items().findOne({_id:questionId},{session});
  if(!item||(ownerOnly&&!item.ownerId.equals(this.actor)))throw notFound();return item;
 }
 async access(questionId:ObjectId,session:ClientSession):Promise<{item:QuestionItemDocument;proof:AuthorizationProof}|null>{
  const item=await this.items().findOne({_id:questionId},{session});if(!item)return null;
  if(item.ownerId.equals(this.actor))return {item,proof:{kind:'owner'}};
  const grant=await this.db.collection<QuestionGrantDocument>('question_grants').findOne({questionId,recipientId:this.actor,state:'active'},{session});
  if(!grant)return null;if(!grant.grantedBy.equals(item.ownerId))throw mappingIncomplete();
  return {item,proof:{kind:'share',grantId:grant._id,grantRevision:jsonInteger(grant.revision)}};
 }
 async lock(questionIds:ObjectId[],session:ClientSession,action:string){
  this.requireWrite(session);
  const ids=[...new Map(questionIds.map(id=>[id.toHexString(),id])).values()].sort((a,b)=>a.toHexString().localeCompare(b.toHexString()));
  for(const questionId of ids){
   await this.faults.beforeAccessFence?.({action,questionId:questionId.toHexString()});
   const result=await this.items().updateOne({_id:questionId,accessFence:{$lt:Number.MAX_SAFE_INTEGER}},{$inc:{accessFence:1}},{session});
   if(result.modifiedCount!==1)throw notFound();
   await this.faults.afterAccessFence?.({action,questionId:questionId.toHexString()});
  }
 }
 async acquire(versionId:ObjectId,session:ClientSession,action:string,also:ObjectId[]=[]){
  this.requireWrite(session);const version=await this.db.collection<QuestionVersionDocument>('question_versions').findOne({_id:versionId},{session});if(!version)throw notFound();
  await this.lock([...also,version.questionId],session,action);
  const access=await this.requireAccess(version.questionId,session);
  await this.validateVersion(version,session);return {version,...access};
 }
 async requireAccess(questionId:ObjectId,session:ClientSession){
  const access=await this.access(questionId,session);if(access)return access;
  const prior=await this.db.collection<QuestionGrantDocument>('question_grants').findOne({questionId,recipientId:this.actor},{session});
  if(prior?.state==='revoked')throw new ApiError(409,'SOURCE_ACCESS_REVOKED','当前共享已撤销，已保存实例仍可使用原版本');
  throw notFound();
 }
 async validateVersion(v:QuestionVersionDocument,session:ClientSession){
  const item=await this.item(v.questionId,session);
  if(!v.createdBy.equals(item.ownerId)||contentHashOf(v)!==v.contentHash||canonical(v.distributionSource)!==canonical(this.distribution(item)))throw mappingIncomplete();
  return v;
 }
 distribution(item:QuestionItemDocument):DistributionSource{
  if(item.origin&&((item.origin.sourceQuestionId===null)!==(item.origin.sourceVersionId===null)))throw mappingIncomplete();
  if(item.origin?.sourceQuestionId&&item.origin.sourceVersionId)return {kind:'derived',sourceQuestionId:item.origin.sourceQuestionId,sourceVersionId:item.origin.sourceVersionId};
  return {kind:item.origin?.kind==='legacyImport'?'unrecorded':'original',sourceQuestionId:null,sourceVersionId:null};
 }
 versionDto(v:QuestionVersionDocument):QuestionVersion{return {id:v._id.toHexString(),questionId:v.questionId.toHexString(),version:jsonInteger(v.version,1),content:contentOfVersion(v),parentVersionId:v.parentVersionId?.toHexString()??null,restoredFromVersionId:v.restoredFromVersionId?.toHexString()??null,operation:v.operation,createdAt:v.createdAt.toISOString()};}
 editor(item:QuestionItemDocument):QuestionEditor{return {id:item._id.toHexString(),revision:jsonInteger(item.revision),latestVersionId:item.latestVersionId?.toHexString()??null,
  draft:item.draft?{content:contentOfVersion({content:item.draft.content} as QuestionVersionDocument),baseVersionId:item.draft.baseVersionId?.toHexString()??null,revision:jsonInteger(item.draft.revision)}:null,
  origin:item.origin?{kind:item.origin.kind,sourceQuestionId:item.origin.sourceQuestionId?.toHexString()??null,sourceVersionId:item.origin.sourceVersionId?.toHexString()??null}:null};}
 async create(content:QuestionContent,session:ClientSession):Promise<ResourceResult>{
  this.requireWrite(session);const now=new Date(),item:QuestionItemDocument={_id:new ObjectId(),schemaVersion:1,ownerId:this.actor,revision:0,accessFence:0,latestVersionId:null,nextVersion:1,draft:{content:contentToBson(normalizeContentInput(content)),baseVersionId:null,revision:0},origin:null,createdAt:now,updatedAt:now};
  await this.items().insertOne(item,{session});return {resourceId:item._id.toHexString(),versionId:null,revision:0};
 }
 async draft(questionId:string,session:ClientSession){return this.editor(await this.item(oid(questionId),session,true));}
 async saveDraft(questionId:string,input:unknown,session:ClientSession){
  this.requireWrite(session);const body=exact(input,['expectedRevision','content','baseVersionId']),item=await this.item(oid(questionId),session,true);assertRevision(item.revision,body.expectedRevision);
  const content=normalizeContentInput(body.content),base=body.baseVersionId===null?null:oid(body.baseVersionId);
  if(base&&!await this.db.collection('question_versions').findOne({_id:base,questionId:item._id},{session}))throw notFound();
  const draft={content:contentToBson(content),baseVersionId:base,revision:jsonInteger(item.draft?.revision??0)+1};
  if(item.draft&&hash(contentOfVersion({content:item.draft.content} as QuestionVersionDocument))===hash(content)&&String(item.draft.baseVersionId)===String(base))return this.editor(item);
  incrementable(item.revision);incrementable(item.draft?.revision??0);
  const actual=await this.items().findOneAndUpdate({_id:item._id,ownerId:this.actor,revision:item.revision},{$set:{draft,updatedAt:new Date()},$inc:{revision:1}},{session,returnDocument:'after'});
  if(!actual)throw editConflict();return this.editor(actual);
 }
 private async insertVersion(item:QuestionItemDocument,content:QuestionContent,parent:ObjectId|null,restore:ObjectId|null,operation:'save'|'restore',session:ClientSession){
  this.requireWrite(session);incrementable(item.revision);incrementable(item.nextVersion);
  const version:QuestionVersionDocument={_id:new ObjectId(),schemaVersion:1,questionId:item._id,version:jsonInteger(item.nextVersion,1),content:contentToBson(content),contentHash:hash(content),distributionSource:this.distribution(item),parentVersionId:parent,restoredFromVersionId:restore,operation,createdBy:this.actor,evidenceKey:null,createdAt:new Date()};
  await this.db.collection<QuestionVersionDocument>('question_versions').insertOne(version,{session});await this.faults.afterQuestionVersionInsert?.();return version;
 }
 async saveVersion(questionId:string,input:Record<string,unknown>,session:ClientSession):Promise<ResourceResult>{
  this.requireWrite(session);const item=await this.item(oid(questionId),session,true);assertRevision(item.revision,input.expectedRevision);
  if(!item.draft)throw new ApiError(409,'NO_QUESTION_DRAFT','请先编辑并保存题目草稿');
  if(jsonInteger(item.draft.revision)!==safeInteger(input.expectedDraftRevision))throw new ApiError(409,'QUESTION_DRAFT_CONFLICT','题目草稿已变化');
  if(item.draft.baseVersionId&&!await this.db.collection('question_versions').findOne({_id:item.draft.baseVersionId,questionId:item._id},{session}))throw mappingIncomplete();
  incrementable(item.draft.revision);const content=contentOfVersion({content:item.draft.content} as QuestionVersionDocument),version=await this.insertVersion(item,content,item.draft.baseVersionId,null,'save',session);
  const changed=await this.items().updateOne({_id:item._id,revision:item.revision,'draft.revision':item.draft.revision},{$set:{latestVersionId:version._id,draft:{content:version.content,baseVersionId:version._id,revision:jsonInteger(item.draft.revision)+1},updatedAt:new Date()},$inc:{revision:1,nextVersion:1}},{session});
  if(changed.modifiedCount!==1)throw editConflict();return {resourceId:questionId,versionId:version._id.toHexString(),revision:jsonInteger(item.revision)+1};
 }
 async restoreVersion(questionId:string,input:Record<string,unknown>,session:ClientSession):Promise<ResourceResult>{
  this.requireWrite(session);const item=await this.item(oid(questionId),session,true);assertRevision(item.revision,input.expectedRevision);
  const source=await this.db.collection<QuestionVersionDocument>('question_versions').findOne({_id:oid(input.sourceVersionId),questionId:item._id},{session});if(!source)throw notFound();await this.validateVersion(source,session);
  const version=await this.insertVersion(item,contentOfVersion(source),source._id,source._id,'restore',session);
  const changed=await this.items().updateOne({_id:item._id,revision:item.revision},{$set:{latestVersionId:version._id,updatedAt:new Date()},$inc:{revision:1,nextVersion:1}},{session});
  if(changed.modifiedCount!==1)throw editConflict();return {resourceId:questionId,versionId:version._id.toHexString(),revision:jsonInteger(item.revision)+1};
 }
 async fork(versionId:string,input:Record<string,unknown>,session:ClientSession):Promise<ResourceResult>{
  this.requireWrite(session);let source:QuestionVersionDocument;
  if(input.sourceInstance!==undefined){
   const ref=exact(input.sourceInstance,['surveyId','instanceId']),survey=await this.db.collection<Phase2SurveyDocument>('surveys').findOne({_id:oid(ref.surveyId),ownerId:this.actor},{session});
   if(!survey||survey.schemaVersion!==3||!survey.originTemplate)throw notFound();
   const checked=await readSourceSet(this.db,survey,undefined,session),binding=checked.bindings.find(b=>b.instanceId===ref.instanceId&&b.questionVersionId.equals(oid(versionId))&&b.authorization.kind==='template');if(!binding)throw notFound();
   await this.lock([binding.questionId],session,'forkTemplateInstance');source=checked.versions.find(v=>v._id.equals(binding.questionVersionId))!;await this.validateVersion(source,session);
  }else source=(await this.acquire(oid(versionId),session,'fork')).version;
  const now=new Date(),questionId=new ObjectId(),newVersionId=new ObjectId(),content=normalizeContentInput(input.content);
  const item:QuestionItemDocument={_id:questionId,schemaVersion:1,ownerId:this.actor,revision:1,accessFence:0,latestVersionId:newVersionId,nextVersion:2,draft:{content:contentToBson(content),baseVersionId:newVersionId,revision:0},origin:{kind:'fork',sourceQuestionId:source.questionId,sourceVersionId:source._id,evidenceKey:null},createdAt:now,updatedAt:now};
  const version:QuestionVersionDocument={_id:newVersionId,schemaVersion:1,questionId,version:1,content:contentToBson(content),contentHash:hash(content),distributionSource:{kind:'derived',sourceQuestionId:source.questionId,sourceVersionId:source._id},parentVersionId:null,restoredFromVersionId:null,operation:'fork',createdBy:this.actor,evidenceKey:null,createdAt:now};
  await this.items().insertOne(item,{session});await this.db.collection<QuestionVersionDocument>('question_versions').insertOne(version,{session});await this.faults.afterQuestionVersionInsert?.();return {resourceId:questionId.toHexString(),versionId:newVersionId.toHexString(),revision:1};
 }
 async version(questionId:string,versionId:string,session:ClientSession){
  const qid=oid(questionId);if(!await this.access(qid,session))throw notFound();
  const v=await this.db.collection<QuestionVersionDocument>('question_versions').findOne({_id:oid(versionId),questionId:qid},{session});if(!v)throw notFound();return this.versionDto(await this.validateVersion(v,session));
 }
 private scope(endpoint:string,extra:Record<string,unknown>={}){return {actorId:this.actor.toHexString(),endpoint,...extra,sort:'createdAt_desc_id_desc'};}
 private page(url:string,scope:Record<string,unknown>,secret:string){const p=pageParams(url);return {...p,after:p.cursor?timePoint(readCursor(p.cursor,scope,secret)):null};}
 private after(after:{time:Date;_id:ObjectId}|null):Document{return after?{$or:[{createdAt:{$lt:after.time}},{createdAt:after.time,_id:{$lt:after._id}}]}:{};}
 private next(rows:{_id:ObjectId;createdAt:Date}[],limit:number,scope:Record<string,unknown>,secret:string){const last=rows.slice(0,limit).at(-1);return rows.length>limit&&last?signCursor(scope,{time:last.createdAt.toISOString(),id:last._id.toHexString()},secret):null;}
 async versions(questionId:string,url:string,secret:string,session:ClientSession){
  const qid=oid(questionId);if(!await this.access(qid,session))throw notFound();const p=pageParams(url),scope={...this.scope('questionVersions',{questionId}),sort:'version_desc'},after=p.cursor?readCursor(p.cursor,scope,secret):undefined;
  if(after!==undefined&&(typeof after!=='number'||!Number.isSafeInteger(after)||after<1))throw new ApiError(400,'INVALID_CURSOR','分页位置无效');
  const rows=await this.db.collection<QuestionVersionDocument>('question_versions').find({questionId:qid,...(after===undefined?{}:{version:{$lt:after as number}})},{session}).sort({version:-1}).limit(p.limit+1).toArray();
  for(const v of rows)await this.validateVersion(v,session);
  return {items:rows.slice(0,p.limit).map(v=>this.versionDto(v)),nextCursor:rows.length>p.limit?signCursor(scope,jsonInteger(rows[p.limit-1].version),secret):null};
 }
 async questions(url:string,secret:string,session:ClientSession){
  const mode=new URL(url,'http://localhost').searchParams.get('scope')??'own';if(!['own','shared'].includes(mode))throw invalid();
  const scope=this.scope('questions',{scope:mode}),p=this.page(url,scope,secret);let rows:QuestionItemDocument[];
  if(mode==='own')rows=await this.items().find({ownerId:this.actor,...this.after(p.after)},{session}).sort({createdAt:-1,_id:-1}).limit(p.limit+1).toArray();
  else{
   rows=await this.items().aggregate<QuestionItemDocument>([{$match:{ownerId:{$ne:this.actor},latestVersionId:{$ne:null},...this.after(p.after)}},{$lookup:{from:'question_grants',let:{qid:'$_id'},pipeline:[{$match:{$expr:{$and:[{$eq:['$questionId','$$qid']},{$eq:['$recipientId',this.actor]},{$eq:['$state','active']}]}}}],as:'currentGrant'}},{$match:{'currentGrant.0':{$exists:true}}},{$unset:'currentGrant'},{$sort:{createdAt:-1,_id:-1}},{$limit:p.limit+1}],{session}).toArray();
  }
  const items:LibraryQuestionSummary[]=[];
  for(const item of rows.slice(0,p.limit)){
   const v=item.latestVersionId?await this.db.collection<QuestionVersionDocument>('question_versions').findOne({_id:item.latestVersionId,questionId:item._id},{session}):null;
   if(item.latestVersionId&&!v)throw mappingIncomplete();if(v)await this.validateVersion(v,session);
   const owner=await this.db.collection('users').findOne({_id:item.ownerId},{session});if(!owner)throw mappingIncomplete();
   items.push({id:item._id.toHexString(),latestVersionId:v?._id.toHexString()??null,latestVersion:v?jsonInteger(v.version,1):null,title:v?contentOfVersion(v).title:this.editor(item).draft?.content.title??'',ownerUsername:owner.username});
  }
  return {items,nextCursor:this.next(rows,p.limit,scope,secret)};
 }
 private bankDto(b:QuestionBankDocument):Bank{return {id:b._id.toHexString(),name:b.name,revision:jsonInteger(b.revision),createdAt:b.createdAt.toISOString()};}
 async bank(bankId:string,session:ClientSession){const b=await this.db.collection<QuestionBankDocument>('question_banks').findOne({_id:oid(bankId),ownerId:this.actor,deletedAt:null},{session});if(!b)throw notFound();return b;}
 async createBank(name:unknown,session:ClientSession):Promise<ResourceResult>{this.requireWrite(session);const now=new Date(),b:QuestionBankDocument={_id:new ObjectId(),schemaVersion:1,createdAt:now,updatedAt:now,ownerId:this.actor,name:title(name,100),revision:0,deletedAt:null};await this.db.collection<QuestionBankDocument>('question_banks').insertOne(b,{session});return {resourceId:b._id.toHexString(),versionId:null,revision:0};}
 async banks(url:string,secret:string,session:ClientSession){const scope=this.scope('banks'),p=this.page(url,scope,secret),rows=await this.db.collection<QuestionBankDocument>('question_banks').find({ownerId:this.actor,deletedAt:null,...this.after(p.after)},{session}).sort({createdAt:-1,_id:-1}).limit(p.limit+1).toArray();return {items:rows.slice(0,p.limit).map(b=>this.bankDto(b)),nextCursor:this.next(rows,p.limit,scope,secret)};}
 async changeBank(bankId:string,input:unknown,deleted:boolean,session:ClientSession){
  this.requireWrite(session);const body=exact(input,deleted?['expectedRevision']:['expectedRevision','name']),b=await this.bank(bankId,session);assertRevision(b.revision,body.expectedRevision);
  await this.faults.afterBankRead?.({action:deleted?'delete':'rename',bankId});
  const name=deleted?b.name:title(body.name,100);if(!deleted&&name===b.name)return this.bankDto(b);incrementable(b.revision);
  const changed=await this.db.collection<QuestionBankDocument>('question_banks').findOneAndUpdate({_id:b._id,ownerId:this.actor,deletedAt:null,revision:b.revision},{$set:{name,deletedAt:deleted?new Date():null,updatedAt:new Date()},$inc:{revision:1}},{session,returnDocument:'after'});if(!changed)throw editConflict();
  return deleted?{id:bankId,revision:jsonInteger(changed.revision),state:'deleted' as const}:this.bankDto(changed);
 }
 async member(bankId:string,questionId:string,input:unknown,session:ClientSession){
  this.requireWrite(session);const body=exact(input,['expectedRevision','present']);if(typeof body.present!=='boolean')throw invalid();
  const b=await this.bank(bankId,session);assertRevision(b.revision,body.expectedRevision);const qid=oid(questionId);
  await this.faults.afterBankRead?.({action:'member',bankId});
  if(body.present){await this.lock([qid],session,'bankMember');await this.requireAccess(qid,session);}
  const members=this.db.collection('question_bank_members'),old=await members.findOne({bankId:b._id,questionId:qid},{session});
  let revision=jsonInteger(b.revision);
  if(!!old!==body.present){incrementable(b.revision);const result=await this.db.collection('question_banks').updateOne({_id:b._id,ownerId:this.actor,deletedAt:null,revision:b.revision},{$inc:{revision:1},$set:{updatedAt:new Date()}},{session});if(result.modifiedCount!==1)throw editConflict();
   if(body.present)await members.insertOne({_id:new ObjectId(),schemaVersion:1,createdAt:new Date(),bankId:b._id,questionId:qid,ownerId:this.actor},{session});else await members.deleteOne({_id:old!._id,bankId:b._id,ownerId:this.actor},{session});revision++;
  }
  return {id:bankId,revision,state:body.present?'memberPresent':'memberAbsent'};
 }
 async members(bankId:string,url:string,secret:string,session:ClientSession){
  const b=await this.bank(bankId,session),scope=this.scope('bankMembers',{bankId}),p=this.page(url,scope,secret),rows=await this.db.collection('question_bank_members').find({bankId:b._id,ownerId:this.actor,...this.after(p.after)},{session}).sort({createdAt:-1,_id:-1}).limit(p.limit+1).toArray(),items:BankMember[]=[];
  for(const row of rows.slice(0,p.limit)){
   const access=await this.access(row.questionId,session),v=access?.item.latestVersionId?await this.db.collection<QuestionVersionDocument>('question_versions').findOne({_id:access.item.latestVersionId,questionId:row.questionId},{session}):null;
   if(v)await this.validateVersion(v,session);
   items.push({questionId:row.questionId.toHexString(),selectable:!!access&&!!v,latestVersionId:access?v?._id.toHexString()??null:null,latestVersion:access&&v?jsonInteger(v.version,1):null,title:access&&v?contentOfVersion(v).title:null});
  }
  return {items,nextCursor:this.next(rows as {_id:ObjectId;createdAt:Date}[],p.limit,scope,secret)};
 }
 private async grantDto(g:QuestionGrantDocument,itemRevision:number,session:ClientSession):Promise<Grant>{const user=await this.db.collection('users').findOne({_id:g.recipientId},{session});if(!user)throw mappingIncomplete();return {id:g._id.toHexString(),recipientUsername:user.username,state:g.state,revision:jsonInteger(g.revision),itemRevision};}
 async shares(questionId:string,url:string,secret:string,session:ClientSession){const item=await this.item(oid(questionId),session,true),scope=this.scope('shares',{questionId}),p=this.page(url,scope,secret),rows=await this.db.collection<QuestionGrantDocument>('question_grants').find({questionId:item._id,...this.after(p.after)},{session}).sort({createdAt:-1,_id:-1}).limit(p.limit+1).toArray();const items:Grant[]=[];for(const g of rows.slice(0,p.limit))items.push(await this.grantDto(g,jsonInteger(item.revision),session));return {items,nextCursor:this.next(rows,p.limit,scope,secret)};}
 async share(questionId:string,input:unknown,grantId:string|null,session:ClientSession){
  this.requireWrite(session);const body=exact(input,grantId?['expectedRevision','expectedGrantRevision']:['username','expectedRevision','expectedGrantRevision']);
  const qid=oid(questionId);await this.item(qid,session,true);await this.lock([qid],session,grantId?'revoke':'grant');
  const item=await this.item(qid,session,true);assertRevision(item.revision,body.expectedRevision);
  const grants=this.db.collection<QuestionGrantDocument>('question_grants');let old:QuestionGrantDocument|null,recipientId:ObjectId;
  if(grantId){old=await grants.findOne({_id:oid(grantId),questionId:qid,grantedBy:this.actor},{session});if(!old)throw notFound();recipientId=old.recipientId;}
  else{
   if(typeof body.username!=='string')throw invalid();const username=normalizeUsername(body.username);if(!username||codePointLength(username)>50||/[\p{Cc}\p{Cf}]/u.test(username))throw invalid();
   const recipient=await this.db.collection('users').findOne({usernameKey:username.toLowerCase()},{session});if(!recipient)throw new ApiError(404,'USERNAME_NOT_FOUND','该注册用户名不存在');recipientId=recipient._id;
   if(recipientId.equals(this.actor))throw new ApiError(422,'INVALID_RECIPIENT','不能共享给自己');old=await grants.findOne({questionId:qid,recipientId},{session});
  }
  if(old?(body.expectedGrantRevision===null||jsonInteger(old.revision)!==safeInteger(body.expectedGrantRevision)):body.expectedGrantRevision!==null)throw editConflict();
  const state=grantId?'revoked':'active';if(old?.state===state)return this.grantDto(old,jsonInteger(item.revision),session);
  incrementable(item.revision);if(old)incrementable(old.revision);const now=new Date();
  const g:QuestionGrantDocument=old?{...old,state,revision:jsonInteger(old.revision)+1,revokedAt:state==='revoked'?now:null,updatedAt:now}:{_id:new ObjectId(),schemaVersion:1,createdAt:now,updatedAt:now,questionId:qid,recipientId,grantedBy:this.actor,state:'active',revision:0,revokedAt:null};
  if(old){const result=await grants.updateOne({_id:old._id,revision:old.revision},{$set:{state:g.state,revision:g.revision,revokedAt:g.revokedAt,updatedAt:now}},{session});if(result.modifiedCount!==1)throw editConflict();}else await grants.insertOne(g,{session});
  const result=await this.items().updateOne({_id:qid,ownerId:this.actor,revision:item.revision},{$inc:{revision:1},$set:{updatedAt:now}},{session});if(result.modifiedCount!==1)throw editConflict();return this.grantDto(g,jsonInteger(item.revision)+1,session);
 }
}
