import {BSON,ObjectId} from 'mongodb';
import {extractQuestionContent,validateQuestions} from '@survey/shared';
import type {DistributionProof,SurveyTemplateDocument} from './phase2-models.js';
import {questionsFromStorage} from './binding-integrity.js';
import {jsonInteger} from './receipt-codec.js';
import {exact} from './operation-contract.js';
import {hash} from '../core/common.js';
import {ApiError} from '../errors.js';
export const lineageInvalid=()=>new ApiError(503,'DISTRIBUTION_LINEAGE_INVALID','模板来源链或固定证明不完整，暂不可公开使用');
export const lineageLimit=()=>new ApiError(422,'DISTRIBUTION_LINEAGE_LIMIT_EXCEEDED','公开来源链超过容量限制');
export function proofValue(p:DistributionProof){return {lineageHash:p.lineageHash,obligations:p.obligations.map(o=>({questionId:o.questionId.toHexString(),questionVersionId:o.questionVersionId.toHexString(),authorId:o.authorId.toHexString(),grantId:o.grantId?.toHexString()??null,grantRevision:o.grantRevision===null?null:jsonInteger(o.grantRevision)}))};}
export function templateContentHash(t:Pick<SurveyTemplateDocument,'title'|'description'|'questions'|'bindings'>){return hash({title:t.title,description:t.description,questions:questionsFromStorage(t.questions),bindings:t.bindings.map(b=>({instanceId:b.instanceId,questionId:b.questionId.toHexString(),questionVersionId:b.questionVersionId.toHexString(),contentHash:b.contentHash,distributionProof:proofValue(b.distributionProof)}))});}
/** Pure immutable shape/hash verification. It grants neither current public rights nor general question access. */
export function checkTemplate(t:SurveyTemplateDocument){
 try{
  const questions=questionsFromStorage(t.questions),checked=validateQuestions(questions),seen=new Set<string>(),versions=new Set<string>(),nodes=new Set<string>();
  if(!questions.length||questions.length>100||checked.validationIssues.length||t.bindings.length!==questions.length)throw lineageInvalid();
  for(const b of t.bindings){exact(b,['instanceId','questionId','questionVersionId','contentHash','distributionProof']);const q=questions.find(q=>q.id===b.instanceId),tuple=String(b.questionId)+':'+String(b.questionVersionId);
   if(!q||seen.has(b.instanceId)||versions.has(tuple)||!(b.questionId instanceof ObjectId)||!(b.questionVersionId instanceof ObjectId)||hash(extractQuestionContent(q))!==b.contentHash)throw lineageInvalid();seen.add(b.instanceId);versions.add(tuple);
   exact(b.distributionProof,['lineageHash','obligations']);if(!/^[0-9a-f]{64}$/.test(b.distributionProof.lineageHash)||!b.distributionProof.obligations.length)throw lineageInvalid();if(b.distributionProof.obligations.length>32)throw lineageLimit();
   for(const o of b.distributionProof.obligations){exact(o,['questionId','questionVersionId','authorId','grantId','grantRevision']);for(const v of [o.questionId,o.questionVersionId,o.authorId])if(!(v instanceof ObjectId))throw lineageInvalid();if(o.grantId!==null&&!(o.grantId instanceof ObjectId)||((o.grantId===null)!==(o.grantRevision===null)))throw lineageInvalid();if(o.grantRevision!==null)jsonInteger(o.grantRevision);nodes.add(o.questionVersionId.toHexString());}
  }
  if(nodes.size>500)throw lineageLimit();if(BSON.calculateObjectSize(t)>2097152)throw new ApiError(422,'DEFINITION_INVALID','模板超过2MiB容量');
  if(templateContentHash(t)!==t.contentHash)throw lineageInvalid();return questions;
 }catch(e){if(e instanceof ApiError&&['DISTRIBUTION_LINEAGE_LIMIT_EXCEEDED','DEFINITION_INVALID'].includes(e.code))throw e;throw lineageInvalid();}
}
