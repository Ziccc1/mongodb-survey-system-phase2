import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {MongoClient,testMongoOptions} from '../database-client.js';
import type {FaultHooks} from '../../apps/api/src/core/common.js';
import {buildApp} from '../../apps/api/src/app.js';
import {isolatedTestConfig} from '../runtime-environment.js';
import {initialize} from '../../apps/api/src/database/initialize.js';
import type {Question,Editor} from '@survey/shared';
export async function harness(name:string,faults:FaultHooks={},origin?:string){
  const config=isolatedTestConfig(name,origin),dbName=config.dbName,client=new MongoClient(config.uri,testMongoOptions());await client.connect();const db=client.db(dbName);await initialize(db);
  const app=await buildApp(config,{logger:false,faults});const cookies:string[]=[];
  const headers={origin:config.origin,'x-csrf-guard':'1'};
  async function request(method:'GET'|'POST'|'PUT'|'PATCH'|'DELETE',path:string,body?:unknown,who=0,extra:Record<string,string>={}){return app.inject({method,url:'/api/v1'+path,headers:{...headers,...(cookies[who]?{cookie:cookies[who]}:{}),...extra},...(body===undefined?{}:{payload:body as object})});}
  async function user(){const n=cookies.length,credentials={username:`${name}_${n}_${randomUUID().slice(0,8)}`,password:randomUUID()};let r=await request('POST','/auth/register',credentials,-1);assert.equal(r.statusCode,201,r.body);r=await request('POST','/auth/login',credentials,-1);assert.equal(r.statusCode,200,r.body);cookies.push(String(r.headers['set-cookie']).split(';')[0]);return n;}
  async function get(id:string){const r=await request('GET',`/surveys/${id}`);assert.equal(r.statusCode,200,r.body);return r.json().data as Editor;}
  async function draft(questions:Question[],settings:Record<string,unknown>={}){const r=await request('POST','/surveys',{title:'阶段核心验证',...settings});assert.equal(r.statusCode,201,r.body);const id=r.json().data.id;const saved=await request('PUT',`/surveys/${id}/questions`,{expectedRevision:0,questions});assert.equal(saved.statusCode,200,saved.body);return get(id);}
  async function publish(id:string,operationKey=randomUUID()){const s=await get(id);return request('POST',`/surveys/${id}/publish`,{expectedRevision:s.revision,expectedDraftDefinitionVersion:s.draftDefinitionRevision},0,{'publication-key':operationKey});}
  async function state(id:string,action:'pause'|'close'){const s=await get(id);const r=await request('POST',`/surveys/${id}/${action}`,{expectedRevision:s.revision});assert.equal(r.statusCode,200,r.body);return r;}
  await user();console.log(`Independent retained database: ${dbName}`);
  return {app,client,db,dbName,config,request,user,get,draft,publish,state,cookies,close:async()=>{await app.close();await client.close();}};
}
export const simpleQuestions:Question[]=[{id:'single',type:'single',title:'选择',required:true,options:[{id:'yes',label:'是'},{id:'no',label:'否'}],jumpRules:[]},{id:'number',type:'number',title:'数值',required:false,validation:{integerOnly:false},jumpRules:[]}];
