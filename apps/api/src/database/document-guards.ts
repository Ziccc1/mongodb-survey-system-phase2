import { BSON, Long } from 'mongodb';
import type { OperationReceiptDocument, SurveyTemplateDocument, Phase2Documents } from './phase2-models.js';
import { resourceOperations, instanceOperations } from './phase2-schema.js';

function keys(value:object,expected:string[]):void {
  const actual=Object.keys(value).sort();
  if(JSON.stringify(actual)!==JSON.stringify([...expected].sort()))throw Error('RECEIPT_STRUCTURE_INVALID');
}
function nonnegative(value:unknown,minimum=0):boolean {
  const n=value instanceof Long?value.toBigInt():typeof value==='number'&&Number.isSafeInteger(value)?BigInt(value):BigInt(-1);
  return n>=BigInt(minimum)&&n<=BigInt(Number.MAX_SAFE_INTEGER);
}
const oidText=(v:unknown)=>typeof v==='string'&&/^[0-9a-f]{24}$/.test(v);
const sid=(v:unknown)=>typeof v==='string'&&/^[A-Za-z0-9_-]{1,128}$/.test(v);
const bounded=(v:unknown,max:number)=>typeof v==='string'&&[...v].length>=1&&[...v].length<=max;
/** Pure structural/size guard. This does not persist or replay receipts. Mongo validates the envelope. */
export function assertOperationReceiptBounds(receipt:OperationReceiptDocument):void {
  const result=receipt.result,data=result.data;
  keys(result,['kind','data']);
  if(receipt.resultVersion!==1)throw Error('RECEIPT_STRUCTURE_INVALID');
  if(result.kind==='resourceReceipt') {
    keys(data,['resourceId','versionId','revision']);
    const d=result.data;
    if(!(resourceOperations as readonly string[]).includes(receipt.operation)||receipt.firstHttpStatus!==201||!oidText(d.resourceId)
      ||(d.versionId!==null&&!oidText(d.versionId))||(d.revision!==null&&!nonnegative(d.revision)))throw Error('RECEIPT_STRUCTURE_INVALID');
  } else if(result.kind==='instanceSave') {
    keys(data,['revision','draftDefinitionRevision','instanceId','questionVersionId','validationIssues']);
    const d=result.data;
    if(!(instanceOperations as readonly string[]).includes(receipt.operation)||receipt.firstHttpStatus!==200||!nonnegative(d.revision)||!nonnegative(d.draftDefinitionRevision,1)
      ||!sid(d.instanceId)||!oidText(d.questionVersionId)||!Array.isArray(d.validationIssues)||d.validationIssues.length>20000)throw Error('RECEIPT_STRUCTURE_INVALID');
    for(const issue of d.validationIssues) {
      keys(issue,['code','field','questionId','message']);
      if(!bounded(issue.code,128)||!bounded(issue.field,2048)||!bounded(issue.message,1000)||(issue.questionId!==null&&!sid(issue.questionId)))throw Error('RECEIPT_STRUCTURE_INVALID');
    }
  } else if(result.kind==='templateAdoption') {
    keys(data,['surveyId','revision']);
    if(receipt.operation!=='adoptTemplate'||receipt.firstHttpStatus!==201||!oidText(result.data.surveyId)||!nonnegative(result.data.revision))throw Error('RECEIPT_STRUCTURE_INVALID');
  } else throw Error('RECEIPT_STRUCTURE_INVALID');
  if(BSON.calculateObjectSize(result)>262144||BSON.calculateObjectSize(receipt)>1048576)throw Error('RECEIPT_TOO_LARGE');
}
/** Cardinality only: does NOT establish lineage, ownership, grant validity or hash authenticity. */
export function assertTemplateBounds(template:SurveyTemplateDocument):void {
  const nodes=new Set(template.bindings.flatMap(b=>b.distributionProof.obligations.map(o=>o.questionVersionId.toHexString())));
  if(nodes.size>500)throw Error('DISTRIBUTION_LINEAGE_LIMIT_EXCEEDED');
  if(BSON.calculateObjectSize(template)>2097152)throw Error('DOCUMENT_TOO_LARGE');
}
export function assertPhase2DocumentBounds<K extends keyof Phase2Documents>(name:K,document:Phase2Documents[K]):void {
  if(name==='operation_receipts')assertOperationReceiptBounds(document as OperationReceiptDocument);
  else if(name==='survey_templates')assertTemplateBounds(document as SurveyTemplateDocument);
  else if(BSON.calculateObjectSize(document)>2097152)throw Error('DOCUMENT_TOO_LARGE');
}
