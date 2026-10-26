import {ObjectId} from 'mongodb';
import type {ClientSession,Db} from 'mongodb';
import {codePointLength,normalizeUsername} from '@survey/shared';
import type {TemplateGrantDocument} from '../database/phase2-models.js';
import {jsonInteger} from '../database/receipt-codec.js';
import {exact,oidString,safeInteger} from '../database/operation-contract.js';
import {ApiError,invalid} from '../errors.js';
import {LibraryService,assertRevision,editConflict,incrementable,notFound} from './library.js';
import {pageParams,readCursor,signCursor,timePoint} from './common.js';
import {lineageInvalid} from '../database/template-integrity.js';
export class DistributionGrantService {
 constructor(private db:Db,private actor:ObjectId,private requireWrite:(s:ClientSession)=>void,private library:LibraryService){}
 private async dto(g:TemplateGrantDocument,itemRevision:number,session:ClientSession){const publisher=await this.db.collection('users').findOne({_id:g.publisherId},{session});if(!publisher)throw notFound();return {id:g._id.toHexString(),questionVersionId:g.questionVersionId.toHexString(),publisherUsername:publisher.username,state:g.state,revision:jsonInteger(g.revision),itemRevision};}
 async list(questionId:string,url:string,secret:string,session:ClientSession){
  const qid=new ObjectId(oidString(questionId)),item=await this.library.item(qid,session,true),p=pageParams(url),scope={actorId:this.actor.toHexString(),endpoint:'distributionGrants',questionId,sort:'createdAt_desc_id_desc'},point=p.cursor?timePoint(readCursor(p.cursor,scope,secret)):null;
  const rows=await this.db.collection<TemplateGrantDocument>('template_grants').find({questionId:qid,grantedBy:this.actor,...(point?{$or:[{createdAt:{$lt:point.time}},{createdAt:point.time,_id:{$lt:point._id}}]}:{})},{session}).sort({createdAt:-1,_id:-1}).limit(p.limit+1).toArray(),items=[];
  for(const g of rows.slice(0,p.limit))items.push(await this.dto(g,jsonInteger(item.revision),session));const last=rows.slice(0,p.limit).at(-1);return {items,nextCursor:rows.length>p.limit&&last?signCursor(scope,{time:last.createdAt.toISOString(),id:last._id.toHexString()},secret):null};
 }
 async change(questionId:string,input:unknown,grantId:string|null,session:ClientSession){
  this.requireWrite(session);const body=exact(input,grantId?['expectedRevision','expectedGrantRevision']:['expectedRevision','expectedGrantRevision','username','questionVersionId']),qid=new ObjectId(oidString(questionId));await this.library.item(qid,session,true);await this.library.lock([qid],session,grantId?'distributionRevoke':'distributionGrant');const item=await this.library.item(qid,session,true);assertRevision(item.revision,body.expectedRevision);
  const grants=this.db.collection<TemplateGrantDocument>('template_grants');let old:TemplateGrantDocument|null,publisherId:ObjectId,versionId:ObjectId;
  if(grantId){old=await grants.findOne({_id:new ObjectId(oidString(grantId)),questionId:qid,grantedBy:this.actor},{session});if(!old)throw notFound();publisherId=old.publisherId;versionId=old.questionVersionId;}
  else{
   versionId=new ObjectId(oidString(body.questionVersionId));const version=await this.db.collection('question_versions').findOne({_id:versionId,questionId:qid,createdBy:this.actor},{session});if(!version)throw notFound();
   if(typeof body.username!=='string')throw invalid();const username=normalizeUsername(body.username);if(!username||codePointLength(username)>50||/[\p{Cc}\p{Cf}]/u.test(username))throw invalid();const user=await this.db.collection('users').findOne({usernameKey:username.toLowerCase()},{session});if(!user)throw new ApiError(404,'USERNAME_NOT_FOUND','该注册用户名不存在');publisherId=user._id;if(publisherId.equals(this.actor))throw new ApiError(422,'INVALID_RECIPIENT','自己的这一层权利无需另行授权');old=await grants.findOne({questionVersionId:versionId,publisherId},{session});
  }
  if(old&&(!old.questionId.equals(qid)||!old.grantedBy.equals(this.actor)))throw lineageInvalid();
  if(old?(body.expectedGrantRevision===null||jsonInteger(old.revision)!==safeInteger(body.expectedGrantRevision)):body.expectedGrantRevision!==null)throw editConflict();
  const state=grantId?'revoked':'active';if(old?.state===state)return this.dto(old,jsonInteger(item.revision),session);incrementable(item.revision);if(old)incrementable(old.revision);const now=new Date();
  const grant:TemplateGrantDocument=old?{...old,state,revision:jsonInteger(old.revision)+1,revokedAt:state==='revoked'?now:null,updatedAt:now}:{_id:new ObjectId(),schemaVersion:1,createdAt:now,updatedAt:now,questionId:qid,questionVersionId:versionId,publisherId,grantedBy:this.actor,state:'active',revision:0,revokedAt:null};
  if(old){if((await grants.updateOne({_id:old._id,revision:old.revision},{$set:{state:grant.state,revision:grant.revision,revokedAt:grant.revokedAt,updatedAt:now}},{session})).modifiedCount!==1)throw editConflict();}else await grants.insertOne(grant,{session});
  if((await this.db.collection('question_items').updateOne({_id:qid,ownerId:this.actor,revision:item.revision},{$inc:{revision:1},$set:{updatedAt:now}},{session})).modifiedCount!==1)throw editConflict();return this.dto(grant,jsonInteger(item.revision)+1,session);
 }
}
