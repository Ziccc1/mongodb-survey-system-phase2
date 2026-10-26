import type {FastifyInstance} from 'fastify';
import {ObjectId} from 'mongodb';
import type {Config} from '../config.js';
import type {Phase2Context} from '../database/phase2-context.js';
import type {Auth} from './common.js';
import {key} from './common.js';
import {questionContentSchema} from '@survey/shared';
import {questionInstanceConfigSchema} from '@survey/shared';
import {revisionSchema} from './common.js';

const oid={type:'string',pattern:'^[0-9a-f]{24}$'},nullableOid={oneOf:[oid,{type:'null'}]},n=revisionSchema.properties.expectedRevision;
const strict=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
export const libraryEndpoints:[RegExp,string[],string[]][]=[
 [/^\/api\/v1\/questions$/,['GET','POST'],['scope','limit','cursor']],
 [/^\/api\/v1\/questions\/[^/]+\/draft$/,['GET','PUT'],[]],
 [/^\/api\/v1\/questions\/[^/]+\/versions$/,['GET','POST'],['limit','cursor']],
 [/^\/api\/v1\/questions\/[^/]+\/versions\/[^/]+$/,['GET'],[]],
 [/^\/api\/v1\/questions\/[^/]+\/restorations$/,['POST'],[]],
 [/^\/api\/v1\/question-versions\/[^/]+\/forks$/,['POST'],[]],
 [/^\/api\/v1\/question-banks$/,['GET','POST'],['limit','cursor']],
 [/^\/api\/v1\/question-banks\/[^/]+$/,['PATCH'],[]],
 [/^\/api\/v1\/question-banks\/[^/]+\/deletion$/,['POST'],[]],
 [/^\/api\/v1\/question-banks\/[^/]+\/members$/,['GET'],['limit','cursor']],
 [/^\/api\/v1\/question-banks\/[^/]+\/members\/[^/]+$/,['PUT'],[]],
 [/^\/api\/v1\/questions\/[^/]+\/shares$/,['GET','PUT'],['limit','cursor']],
 [/^\/api\/v1\/questions\/[^/]+\/shares\/[^/]+\/revocation$/,['POST'],[]],
 [/^\/api\/v1\/questions\/[^/]+\/usage$/,['GET'],['versionId','kind','limit','cursor']],
 [/^\/api\/v1\/surveys\/[^/]+\/(question-sources|question-updates)$/,['GET'],[]],
 [/^\/api\/v1\/surveys\/[^/]+\/question-references$/,['POST'],[]],
 [/^\/api\/v1\/surveys\/[^/]+\/questions\/[^/]+\/(replacement|formalization)$/,['POST'],[]],
];
type Params={questionId:string;versionId:string;bankId:string;grantId:string};
export function registerLibraryRoutes(app:FastifyInstance,context:Phase2Context,auth:Auth,config:Config){
 async function actor(request:Parameters<Auth>[0]){return context.forActor((await auth(request))._id);}
 app.post<{Body:{content:unknown}}>('/api/v1/questions',{schema:{body:strict({content:questionContentSchema})}},async(r,reply)=>{
  const a=await actor(r),result=await a.execute({operation:'createQuestion',path:{},body:r.body,requestKey:key(r.headers['idempotency-key'])},(s,f)=>a.library.create(f.body.content as never,s));return reply.code(result.httpStatus).send({data:result.data});
 });
 app.get('/api/v1/questions',async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.library.questions(r.url,config.cursorSecret,s))};});
 app.get<{Params:Params}>('/api/v1/questions/:questionId/draft',async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.library.draft(r.params.questionId,s))};});
 app.put<{Params:Params;Body:Record<string,unknown>}>('/api/v1/questions/:questionId/draft',{schema:{body:strict({expectedRevision:n,content:questionContentSchema,baseVersionId:nullableOid})}},async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.library.saveDraft(r.params.questionId,r.body,s))};});
 for(const [suffix,operation] of [['versions','saveVersion'],['restorations','restoreVersion']] as const){
  app.post<{Params:Params;Body:Record<string,unknown>}>(`/api/v1/questions/:questionId/${suffix}`,{schema:{body:strict(operation==='saveVersion'?{expectedRevision:n,expectedDraftRevision:n}:{expectedRevision:n,sourceVersionId:oid})}},async(r,reply)=>{
   const a=await actor(r),result=await a.execute({operation,path:{questionId:r.params.questionId},body:r.body,requestKey:key(r.headers['idempotency-key'])},(s,f)=>operation==='saveVersion'?a.library.saveVersion(r.params.questionId,f.body,s):a.library.restoreVersion(r.params.questionId,f.body,s));return reply.code(result.httpStatus).send({data:result.data});
  });
 }
 app.get<{Params:Params}>('/api/v1/questions/:questionId/versions',async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.library.versions(r.params.questionId,r.url,config.cursorSecret,s))};});
 app.get<{Params:Params}>('/api/v1/questions/:questionId/versions/:versionId',async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.library.version(r.params.questionId,r.params.versionId,s))};});
 app.post<{Params:Params;Body:Record<string,unknown>}>('/api/v1/question-versions/:versionId/forks',{schema:{body:strict({content:questionContentSchema,sourceInstance:strict({surveyId:oid,instanceId:{type:'string',pattern:'^[A-Za-z0-9_-]{1,128}$'}})},['content'])}},async(r,reply)=>{const a=await actor(r),result=await a.execute({operation:'forkQuestion',path:{versionId:r.params.versionId},body:r.body,requestKey:key(r.headers['idempotency-key'])},(s,f)=>a.library.fork(r.params.versionId,f.body,s));return reply.code(result.httpStatus).send({data:result.data});});
 app.post<{Body:Record<string,unknown>}>('/api/v1/question-banks',{schema:{body:strict({name:{type:'string',minLength:1,maxLength:100}})}},async(r,reply)=>{const a=await actor(r),result=await a.execute({operation:'createBank',path:{},body:r.body,requestKey:key(r.headers['idempotency-key'])},(s,f)=>a.library.createBank(f.body.name,s));return reply.code(result.httpStatus).send({data:result.data});});
 app.get('/api/v1/question-banks',async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.library.banks(r.url,config.cursorSecret,s))};});
 app.patch<{Params:Params;Body:unknown}>('/api/v1/question-banks/:bankId',{schema:{body:strict({expectedRevision:n,name:{type:'string',minLength:1,maxLength:100}})}},async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.library.changeBank(r.params.bankId,r.body,false,s))};});
 app.post<{Params:Params;Body:unknown}>('/api/v1/question-banks/:bankId/deletion',{schema:{body:revisionSchema}},async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.library.changeBank(r.params.bankId,r.body,true,s))};});
 app.get<{Params:Params}>('/api/v1/question-banks/:bankId/members',async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.library.members(r.params.bankId,r.url,config.cursorSecret,s))};});
 app.put<{Params:Params;Body:unknown}>('/api/v1/question-banks/:bankId/members/:questionId',{schema:{body:strict({expectedRevision:n,present:{type:'boolean'}})}},async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.library.member(r.params.bankId,r.params.questionId,r.body,s))};});
 app.get<{Params:Params}>('/api/v1/questions/:questionId/shares',async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.library.shares(r.params.questionId,r.url,config.cursorSecret,s))};});
 app.put<{Params:Params;Body:unknown}>('/api/v1/questions/:questionId/shares',{schema:{body:strict({expectedRevision:n,expectedGrantRevision:{oneOf:[n,{type:'null'}]},username:{type:'string'}})}},async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.library.share(r.params.questionId,r.body,null,s))};});
 app.post<{Params:Params;Body:unknown}>('/api/v1/questions/:questionId/shares/:grantId/revocation',{schema:{body:strict({expectedRevision:n,expectedGrantRevision:n})}},async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.library.share(r.params.questionId,r.body,r.params.grantId,s))};});
 app.get<{Params:Params}>('/api/v1/questions/:questionId/usage',async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.usage.query(r.params.questionId,r.url,config.cursorSecret,s))};});
 const rule={oneOf:['single','multiple','number','text'].map(type=>(questionInstanceConfigSchema(type as 'single') as {properties:{jumpRules:unknown}}).properties.jumpRules)};
 // A rule array can match several empty/default branches: anyOf is intentional here.
 const rules={anyOf:rule.oneOf};
 for(const [suffix,operation,properties,required] of [
  ['question-references','attachQuestion',{expectedRevision:n,questionVersionId:oid,position:{type:'integer',minimum:0,maximum:100},instanceId:{type:'string',pattern:'^[A-Za-z0-9_-]{1,128}$'},required:{type:'boolean'},jumpRules:rules},['expectedRevision','questionVersionId','position']],
  ['questions/:instanceId/replacement','replaceQuestion',{expectedRevision:n,questionVersionId:oid,reviewedJumpRules:rules},['expectedRevision','questionVersionId']],
  ['questions/:instanceId/formalization','saveInlineQuestion',{expectedRevision:n},['expectedRevision']],
 ] as const){
  app.post<{Params:{surveyId:string;instanceId?:string};Body:Record<string,unknown>}>(`/api/v1/surveys/:surveyId/${suffix}`,{schema:{body:strict(properties,[...required])}},async(r,reply)=>{
   const a=await actor(r),path={surveyId:r.params.surveyId,...(r.params.instanceId===undefined?{}:{instanceId:r.params.instanceId})};
   const result=await a.execute({operation,path,body:r.body,requestKey:key(r.headers['idempotency-key'])},(s,f)=>operation==='attachQuestion'?a.surveys.attach(r.params.surveyId,f.body,s):operation==='replaceQuestion'?a.surveys.replace(r.params.surveyId,r.params.instanceId!,f.body,s):a.surveys.formalize(r.params.surveyId,r.params.instanceId!,f.body,s));
   return reply.code(result.httpStatus).send({data:result.data});
  });
 }
 for(const [endpoint,updatesOnly] of [['question-sources',false],['question-updates',true]] as const)app.get<{Params:{surveyId:string}}>(`/api/v1/surveys/:surveyId/${endpoint}`,async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.surveys.sources(r.params.surveyId,updatesOnly,s))};});
}
