import {BSON,Int32,Long,ObjectId} from 'mongodb';
import type {OperationReceiptDocument} from './phase2-models.js';
import type {Operation,OperationResults} from './operation-contract.js';
import {assertOperationReceiptBounds} from './document-guards.js';
import {ApiError} from '../errors.js';

export function receiptUnavailable():ApiError {return new ApiError(503,'OPERATION_RECEIPT_UNAVAILABLE','历史操作回执损坏或版本不受支持');}
export function jsonInteger(value:unknown,min=0):number {
  if(value instanceof Long){const n=value.toBigInt();if(n<BigInt(min)||n>BigInt(Number.MAX_SAFE_INTEGER))throw receiptUnavailable();return Number(n);}
  const n=value instanceof Int32?value.valueOf():value;
  if(typeof n!=='number'||!Number.isSafeInteger(n)||n<min)throw receiptUnavailable();return n;
}
function record(value:unknown,keys:string[]):Record<string,unknown> {
  if(!value||Object.getPrototypeOf(value)!==Object.prototype)throw receiptUnavailable();
  const v=value as Record<string,unknown>;
  if(JSON.stringify(Object.keys(v).sort())!==JSON.stringify([...keys].sort()))throw receiptUnavailable();return v;
}
function bounded(value:unknown,max:number,pattern?:RegExp):void {if(typeof value!=='string'||![...value].length||[...value].length>max||(pattern&&!pattern.test(value)))throw receiptUnavailable();}
export function assertReceiptSize(value:object):void {
  const doc=value as {result?:unknown};
  if(BSON.calculateObjectSize(value)>1048576||(doc.result&&typeof doc.result==='object'&&BSON.calculateObjectSize(doc.result)>262144))throw new ApiError(422,'RECEIPT_TOO_LARGE','完整成功回执超过容量限制');
}
/** Reject corrupted persisted data before returning a DTO; no defaults or resource reconstruction. */
export function decodeOperationReceipt(value:unknown):OperationReceiptDocument {
  try {
    const v=record(value,['_id','schemaVersion','createdAt','actorId','operation','resourceKey','requestKey','requestHash','resultVersion','firstHttpStatus','result']);
    if(!(v._id instanceof ObjectId)||!(v.actorId instanceof ObjectId)||!(v.createdAt instanceof Date)||!Number.isFinite(v.createdAt.getTime())||jsonInteger(v.schemaVersion)!==1||jsonInteger(v.resultVersion)!==1)throw receiptUnavailable();
    bounded(v.resourceKey,257);bounded(v.requestKey,128,/^[A-Za-z0-9._:-]+$/);bounded(v.requestHash,64,/^[0-9a-f]{64}$/);
    const result=record(v.result,['kind','data']);
    const data=result.data&&typeof result.data==='object'?{...result.data}:result.data;
    // Check exact fields and operation-kind/status via the existing guard after safe BSON integer conversion.
    if(data&&typeof data==='object')for(const k of ['revision','draftDefinitionRevision'])if(k in data&&(data as Record<string,unknown>)[k]!==null)(data as Record<string,unknown>)[k]=jsonInteger((data as Record<string,unknown>)[k],k==='draftDefinitionRevision'?1:0);
    const decoded={...v,schemaVersion:1,resultVersion:1,firstHttpStatus:jsonInteger(v.firstHttpStatus),result:{kind:result.kind,data}} as OperationReceiptDocument;
    assertReceiptSize(value as object);assertOperationReceiptBounds(decoded);
    const detachedData=JSON.parse(JSON.stringify(decoded.result.data)) as OperationReceiptDocument['result']['data'];
    return {...decoded,result:{kind:decoded.result.kind,data:detachedData}} as OperationReceiptDocument;
  }catch {throw receiptUnavailable();}
}
export function receiptData<O extends Operation>(doc:OperationReceiptDocument,operation:O):OperationResults[O] {
  if(doc.operation!==operation)throw receiptUnavailable();
  // Guard above guarantees JSON-only result fields; stringify makes the returned graph independent.
  return JSON.parse(JSON.stringify(doc.result.data)) as OperationResults[O];
}
