import {createHash,createHmac,timingSafeEqual} from 'node:crypto';
import {ObjectId} from 'mongodb';
import type {ClientSession,Db} from 'mongodb';
import type {UserDocument,SurveyDocument} from '../database/models.js';
import {canonical} from '@survey/shared';
import {ApiError,invalid} from '../errors.js';
export type Auth=(request:{cookies:Record<string,string|undefined>})=>Promise<UserDocument>;
export interface FaultHooks {
 beforeTemplateFence?:(point:{action:string;templateId:string})=>void|Promise<void>;
 afterTemplateFence?:(point:{action:string;templateId:string})=>void|Promise<void>;
 afterTemplateInsert?:()=>void|Promise<void>;
 afterTemplateSurveyInsert?:()=>void|Promise<void>;
 afterTemplateBindingsInsert?:()=>void|Promise<void>;
 afterReportSnapshot?:(point:{timestamp:{t:number;i:number}})=>void|Promise<void>;
 reportCommand?:(point:{name:string;readConcern:unknown;transaction:boolean})=>void;
 afterSnapshotInsert?:()=>void;afterResponseInsert?:()=>void;
 afterQuestionVersionInsert?:()=>void|Promise<void>;
 beforeAccessFence?:(point:{action:string;questionId:string})=>void|Promise<void>;
 afterAccessFence?:(point:{action:string;questionId:string})=>void|Promise<void>;
 afterBankRead?:(point:{action:string;bankId:string})=>void|Promise<void>;
}
export const hash=(value:unknown)=>createHash('sha256').update(canonical(value)).digest('hex');
export function id(value:string){if(!/^[a-fA-F0-9]{24}$/.test(value))throw invalid();return new ObjectId(value);}
export function positive(value:string){if(!/^[1-9]\d*$/.test(value)||!Number.isSafeInteger(Number(value)))throw invalid();return Number(value);}
export function key(value:unknown){if(typeof value!=='string'||!/^[A-Za-z0-9._:-]{1,128}$/.test(value))throw invalid();return value;}
export async function own(db:Db,surveyId:string,ownerId:ObjectId,session?:ClientSession){const survey=await db.collection<SurveyDocument>('surveys').findOne({_id:id(surveyId),ownerId},{session});if(!survey)throw new ApiError(404,'NOT_FOUND','资源不存在或不可访问');return survey;}
export function pageParams(url:string){const p=new URL(url,'http://localhost').searchParams;const raw=p.get('limit')??'20';if(!/^[1-9]\d*$/.test(raw)||Number(raw)>100)throw invalid();const cursor=p.get('cursor');if(cursor!==null&&(!cursor||cursor.length>2048))throw new ApiError(400,'INVALID_CURSOR','分页游标无效');return {limit:Number(raw),cursor,version:p.get('version')};}
export function signCursor(scope:Record<string,unknown>,after:unknown,secret:string){const payload=Buffer.from(JSON.stringify({scope,after})).toString('base64url');return payload+'.'+createHmac('sha256',secret).update(payload).digest('base64url');}
export function readCursor(value:string,scope:Record<string,unknown>,secret:string):unknown{try{const [payload,sig,extra]=value.split('.');if(!payload||!sig||extra!==undefined)throw Error();const a=Buffer.from(sig,'base64url'),b=createHmac('sha256',secret).update(payload).digest();if(a.length!==b.length||!timingSafeEqual(a,b))throw Error();const parsed=JSON.parse(Buffer.from(payload,'base64url').toString());if(canonical(parsed.scope)!==canonical(scope))throw Error();return parsed.after;}catch{throw new ApiError(400,'INVALID_CURSOR','分页游标与查询范围不匹配');}}
export function timePoint(value:unknown):{time:Date;_id:ObjectId}{try{const p=value as {time:string;id:string};const time=new Date(p.time);if(time.toISOString()!==p.time)throw Error();return {time,_id:id(p.id)};}catch{throw new ApiError(400,'INVALID_CURSOR','分页位置无效');}}
export const revisionSchema={type:'object',additionalProperties:false,required:['expectedRevision'],properties:{expectedRevision:{type:'integer',minimum:0,maximum:Number.MAX_SAFE_INTEGER}}};
export const publishSchema={...revisionSchema,required:['expectedRevision','expectedDraftDefinitionVersion'],properties:{...revisionSchema.properties,expectedDraftDefinitionVersion:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER}}};
