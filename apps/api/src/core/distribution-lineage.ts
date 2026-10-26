import {ObjectId} from 'mongodb';
import type {ClientSession,Db} from 'mongodb';
import type {DistributionProof,DistributionObligation,QuestionItemDocument,QuestionVersionDocument,TemplateBinding,TemplateGrantDocument} from '../database/phase2-models.js';
import {lineageInvalid,lineageLimit} from '../database/template-integrity.js';
import {contentHashOf} from '../database/binding-integrity.js';
import {jsonInteger} from '../database/receipt-codec.js';
import {ApiError} from '../errors.js';
import {hash} from './common.js';
import type {LibraryService} from './library.js';
interface Node {item:QuestionItemDocument;version:QuestionVersionDocument}
const missing=()=>new ApiError(403,'PUBLIC_DISTRIBUTION_REQUIRED','此模板尚缺当前有效的具体版本公开分发授权');
export class DistributionLineageService {
 constructor(private db:Db,private library:LibraryService){}
 async chain(versionId:ObjectId,session:ClientSession):Promise<Node[]>{
  const out:Node[]=[],seen=new Set<string>();let next=versionId;
  while(true){
   if(seen.has(next.toHexString()))throw lineageInvalid();if(out.length>=32)throw lineageLimit();seen.add(next.toHexString());
   const v=await this.db.collection<QuestionVersionDocument>('question_versions').findOne({_id:next},{session});if(!v)throw lineageInvalid();const item=await this.db.collection<QuestionItemDocument>('question_items').findOne({_id:v.questionId},{session});if(!item||!v.createdBy.equals(item.ownerId))throw lineageInvalid();
   try{if(contentHashOf(v)!==v.contentHash||hash(this.source(v))!==hash(this.source({...v,distributionSource:this.library.distribution(item)})))throw lineageInvalid();}catch{throw lineageInvalid();}
   out.push({item,version:v});const source=v.distributionSource;
   if(source.kind==='unrecorded')throw new ApiError(409,'DISTRIBUTION_PROVENANCE_UNVERIFIED','该题原始来源未核实，仍可自用，暂不可公开分发');
   if(source.kind==='original'){if(source.sourceQuestionId!==null||source.sourceVersionId!==null)throw lineageInvalid();break;}
   if(source.kind!=='derived'||!(source.sourceVersionId instanceof ObjectId)||!(source.sourceQuestionId instanceof ObjectId))throw lineageInvalid();
   const parent=await this.db.collection<QuestionVersionDocument>('question_versions').findOne({_id:source.sourceVersionId,questionId:source.sourceQuestionId},{session});if(!parent)throw lineageInvalid();next=parent._id;
  }
  return out;
 }
 private source(v:QuestionVersionDocument){return {kind:v.distributionSource.kind,sourceQuestionId:v.distributionSource.sourceQuestionId?.toHexString()??null,sourceVersionId:v.distributionSource.sourceVersionId?.toHexString()??null};}
 private node(n:Node){return {questionId:n.version.questionId.toHexString(),questionVersionId:n.version._id.toHexString(),authorId:n.item.ownerId.toHexString(),contentHash:n.version.contentHash,distributionSource:this.source(n.version)};}
 async inspect(bindings:Pick<TemplateBinding,'instanceId'|'questionId'|'questionVersionId'|'contentHash'>[],session:ClientSession){
  const chains:Node[][]=[],unique=new Map<string,ObjectId>();for(const b of bindings){const chain=await this.chain(b.questionVersionId,session);if(!chain[0].version.questionId.equals(b.questionId)||chain[0].version.contentHash!==b.contentHash)throw lineageInvalid();chains.push(chain);for(const n of chain)unique.set(n.version._id.toHexString(),n.item._id);if(unique.size>500)throw lineageLimit();}return {chains,questionIds:[...unique.values()]};
 }
 async proofs(bindings:Pick<TemplateBinding,'instanceId'|'questionId'|'questionVersionId'|'contentHash'>[],publisher:ObjectId,session:ClientSession,fixed?:TemplateBinding[]){
  const inspected=await this.inspect(bindings,session),proofs:DistributionProof[]=[];
  for(const [i,chain] of inspected.chains.entries()){
   const lineageHash=hash(chain.map(n=>this.node(n))),obligations:DistributionObligation[]=[],old=fixed?.[i]?.distributionProof;
   if(fixed&&(!old||old.lineageHash!==lineageHash||old.obligations.length!==chain.length))throw lineageInvalid();
   for(const [j,n] of chain.entries()){
    const v=n.version,self=n.item.ownerId.equals(publisher),prior=old?.obligations[j];
    if(prior&&(!prior.questionId.equals(v.questionId)||!prior.questionVersionId.equals(v._id)||!prior.authorId.equals(n.item.ownerId)||(self?(prior.grantId!==null||prior.grantRevision!==null):prior.grantId===null||prior.grantRevision===null)))throw lineageInvalid();
    let grant:TemplateGrantDocument|null=null;
    if(!self){grant=await this.db.collection<TemplateGrantDocument>('template_grants').findOne({questionVersionId:v._id,publisherId:publisher},{session});if(grant&&(!grant.questionId.equals(v.questionId)||!grant.grantedBy.equals(n.item.ownerId)))throw lineageInvalid();if(!grant||grant.state!=='active')throw missing();if(prior&&(!prior.grantId!.equals(grant._id)||jsonInteger(prior.grantRevision)>jsonInteger(grant.revision)))throw lineageInvalid();}
    obligations.push(self?{questionId:v.questionId,questionVersionId:v._id,authorId:n.item.ownerId,grantId:null,grantRevision:null}:{questionId:v.questionId,questionVersionId:v._id,authorId:n.item.ownerId,grantId:grant!._id,grantRevision:grant!.revision});
   }
   proofs.push({lineageHash,obligations});
  }
  return {...inspected,proofs};
 }
 async lockedProofs(bindings:Pick<TemplateBinding,'instanceId'|'questionId'|'questionVersionId'|'contentHash'>[],publisher:ObjectId,session:ClientSession,action:string,fixed?:TemplateBinding[]){
  const candidate=await this.inspect(bindings,session),locked=new Set(candidate.questionIds.map(id=>id.toHexString()));await this.library.lock(candidate.questionIds,session,action);const current=await this.proofs(bindings,publisher,session,fixed);if(current.questionIds.some(id=>!locked.has(id.toHexString())))throw lineageInvalid();return current.proofs;
 }
}
