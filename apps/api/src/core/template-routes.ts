import type {FastifyInstance} from 'fastify';
import type {Phase2Context} from '../database/phase2-context.js';
import type {Auth} from './common.js';
import {key,revisionSchema} from './common.js';
export const templateEndpoints:[RegExp,string[],string[]][]=[
 [/^\/api\/v1\/templates$/,['GET','POST'],['scope','limit','cursor']],
 [/^\/api\/v1\/templates\/[^/]+$/,['GET'],[]],
 [/^\/api\/v1\/templates\/[^/]+\/(adoptions|listing|unlisting)$/,['POST'],[]],
 [/^\/api\/v1\/questions\/[^/]+\/distribution-grants$/,['GET','PUT'],['limit','cursor']],
 [/^\/api\/v1\/questions\/[^/]+\/distribution-grants\/[^/]+\/revocation$/,['POST'],[]],
];
const oid={type:'string',pattern:'^[0-9a-f]{24}$'},n=revisionSchema.properties.expectedRevision,nullableN={oneOf:[n,{type:'null'}]};
const strict=(properties:Record<string,unknown>,required=Object.keys(properties))=>({type:'object',additionalProperties:false,properties,required});
type Params={templateId:string;questionId:string;grantId:string};
export function registerTemplateRoutes(app:FastifyInstance,context:Phase2Context,auth:Auth,secret:string){
 const actor=async(r:Parameters<Auth>[0])=>context.forActor((await auth(r))._id);
 app.get('/api/v1/templates',async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.templates.list(r.url,secret,s))};});
 app.get<{Params:Params}>('/api/v1/templates/:templateId',async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.templates.preview(r.params.templateId,s))};});
 app.post<{Body:Record<string,unknown>}>('/api/v1/templates',{schema:{body:strict({surveyId:oid,publishedVersion:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER},expectedSurveyRevision:n})}},async(r,reply)=>{
  const a=await actor(r),result=await a.execute({operation:'createTemplate',path:{},body:r.body,requestKey:key(r.headers['idempotency-key'])},(s,f)=>a.templates.create(f.body,s));return reply.code(result.httpStatus).send({data:result.data});
 });
 app.post<{Params:Params;Body:Record<string,unknown>}>('/api/v1/templates/:templateId/adoptions',{schema:{body:strict({expectedTemplateRevision:n,title:{type:'string',minLength:1,maxLength:200}},['expectedTemplateRevision'])}},async(r,reply)=>{
  const a=await actor(r),result=await a.execute({operation:'adoptTemplate',path:{templateId:r.params.templateId},body:r.body,requestKey:key(r.headers['idempotency-key'])},(s,f)=>a.templates.adopt(r.params.templateId,f.body,s));return reply.code(result.httpStatus).send({data:result.data});
 });
 for(const [suffix,listed] of [['listing',true],['unlisting',false]] as const)app.post<{Params:Params;Body:Record<string,unknown>}>(`/api/v1/templates/:templateId/${suffix}`,{schema:{body:revisionSchema}},async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.templates.state(r.params.templateId,r.body,listed,s))};});
 app.get<{Params:Params}>('/api/v1/questions/:questionId/distribution-grants',async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.distributionGrants.list(r.params.questionId,r.url,secret,s))};});
 app.put<{Params:Params;Body:unknown}>('/api/v1/questions/:questionId/distribution-grants',{schema:{body:strict({questionVersionId:oid,username:{type:'string'},expectedRevision:n,expectedGrantRevision:nullableN})}},async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.distributionGrants.change(r.params.questionId,r.body,null,s))};});
 app.post<{Params:Params;Body:unknown}>('/api/v1/questions/:questionId/distribution-grants/:grantId/revocation',{schema:{body:strict({expectedRevision:n,expectedGrantRevision:n})}},async r=>{const a=await actor(r);return {data:await a.transaction(s=>a.distributionGrants.change(r.params.questionId,r.body,r.params.grantId,s))};});
}
