import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {BSON} from 'mongodb';
import {MongoClient,testMongoOptions} from '../database-client.js';
import type {FaultHooks} from '../../apps/api/src/core/common.js';
import {hash} from '../../apps/api/src/core/common.js';
import {buildPhase2App} from '../../apps/api/src/app.js';
import {isolatedTestConfig,evidenceDirectory} from '../runtime-environment.js';
import {initializePhase2Schema} from '../../apps/api/src/database/phase2-initialize.js';
import type {QuestionContent,QuestionEditor,ResourceReceipt,Editor} from '@survey/shared';
export async function phase2Harness(name:string,faults:FaultHooks={},origin?:string){
 const config=isolatedTestConfig(`p2008_${name.slice(0,16)}`,origin),client=new MongoClient(config.uri,testMongoOptions());await client.connect();const db=client.db(config.dbName);
 let app:Awaited<ReturnType<typeof buildPhase2App>>;
 try{await initializePhase2Schema(config);app=await buildPhase2App(config,{logger:false,faults});}catch(error){await client.close();throw error;}
 const directory=evidenceDirectory(name),cookies:string[]=[],usernames:string[]=[],userIds:string[]=[],requests:unknown[]=[];
 async function request(method:'GET'|'POST'|'PUT'|'PATCH'|'DELETE',path:string,body?:unknown,who=0,extra:Record<string,string>={}){
  const r=await app.inject({method,url:'/api/v1'+path,remoteAddress:`127.0.0.${who+2}`,headers:{origin:config.origin,'x-csrf-guard':'1',...(cookies[who]?{cookie:cookies[who]}:{}),...extra},...(body===undefined?{}:{payload:body as object})});
  requests.push({method,path,who,status:r.statusCode,...(path.startsWith('/auth')?{}:{response:r.json()})});return r;
 }
 async function user(){const n=cookies.length,credentials={username:`p2008_${name}_${n}_${randomUUID().slice(0,6)}`,password:randomUUID()};let r=await request('POST','/auth/register',credentials,-1);assert.equal(r.statusCode,201,r.body);userIds.push(r.json().data.id);r=await request('POST','/auth/login',credentials,-1);assert.equal(r.statusCode,200,r.body);cookies.push(String(r.headers['set-cookie']).split(';')[0]);usernames.push(credentials.username);return n;}
 async function getQuestion(id:string,who=0){const r=await request('GET',`/questions/${id}/draft`,undefined,who);assert.equal(r.statusCode,200,r.body);return r.json().data as QuestionEditor;}
 async function createQuestion(content:QuestionContent,who=0){const r=await request('POST','/questions',{content},who,{'idempotency-key':randomUUID()});assert.equal(r.statusCode,201,r.body);return r.json().data as ResourceReceipt;}
 async function saveVersion(id:string,who=0,requestKey=randomUUID()){const q=await getQuestion(id,who);const body={expectedRevision:q.revision,expectedDraftRevision:q.draft!.revision};const r=await request('POST',`/questions/${id}/versions`,body,who,{'idempotency-key':requestKey});assert.equal(r.statusCode,201,r.body);return {receipt:r.json().data as ResourceReceipt,body,key:requestKey};}
 async function getSurvey(id:string,who=0){const r=await request('GET',`/surveys/${id}`,undefined,who);assert.equal(r.statusCode,200,r.body);return r.json().data as Editor;}
 const fingerprint=async()=>{const out=[];for(const c of await db.listCollections({},{nameOnly:true}).toArray())out.push({name:c.name,docs:(await db.collection(c.name).find().sort({_id:1}).toArray()).map(d=>Buffer.from(BSON.serialize(d)).toString('base64'))});return hash(out.sort((a,b)=>a.name.localeCompare(b.name)));};
 const saveEvidence=(name:string,data:unknown)=>writeFileSync(resolve(directory,name+'.json'),JSON.stringify(data,null,2));
 await user();console.log(`P2-008 thirteen-collection synthetic app: ${config.dbName}`);
 return {app,client,db,config,directory,request,user,cookies,usernames,userIds,getQuestion,createQuestion,saveVersion,getSurvey,fingerprint,saveEvidence,
  close:async()=>{saveEvidence('http',requests);saveEvidence('target',{database:config.dbName,origin:config.origin});await app.close();await client.close();}};
}
