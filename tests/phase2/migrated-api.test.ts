import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,readdirSync,existsSync} from 'node:fs';
import {resolve} from 'node:path';
import {BSON} from 'mongodb';
import {MongoClient,testMongoOptions} from '../database-client.js';
import {createMigrationRun,openMigrationRun} from '../../apps/api/src/database/phase2-migration.js';
import {initialize} from '../../apps/api/src/database/initialize.js';
import {buildPhase2App} from '../../apps/api/src/app.js';
import {loadConfig} from '../../apps/api/src/config.js';
import {signAuth} from '../../apps/api/src/security.js';
import {evidenceDirectory} from '../runtime-environment.js';
import {hash} from '../../apps/api/src/core/common.js';
test('actual migrated thirteen-collection app reads old snapshots/answers and replays original publication/submission keys without writes',async()=>{
 // Reuse only a P2-008 synthetic BSON backup. Create a fresh source/run, never write prior evidence databases.
 const backups=resolve('.local/p2-008/migrations'),last=readdirSync(backups).filter(name=>/^[0-9]{13}_[a-f0-9]{8}$/.test(name)&&existsSync(resolve(backups,name,'backup.bson.json'))).sort().at(-1);if(!last)throw Error('Run the controlled migration rehearsal first');const parent=resolve(backups,last,'backup.bson.json'),dump=JSON.parse(readFileSync(parent,'utf8'));
 const manifest=createMigrationRun(),run=await openMigrationRun(manifest.runId),client=new MongoClient('mongodb://localhost:27019/?replicaSet=rs0',testMongoOptions());await client.connect();
 const source=client.db(manifest.source),directory=evidenceDirectory('migrated-api');let app:Awaited<ReturnType<typeof buildPhase2App>>|undefined;
 try{
  await initialize(source);for(const c of dump.collections){const docs=c.documents.map((s:string)=>BSON.deserialize(Buffer.from(s,'base64')));if(docs.length)await source.collection(c.name).insertMany(docs);}
  await run.backup();await run.restore(manifest.applicationTest);const plan=await run.dryRun(manifest.applicationTest);await run.apply(manifest.applicationTest);await run.verify(manifest.applicationTest);
  // dry-run reuses the persisted fixed plan even after apply, with thirteen collections now present.
  assert.equal((await run.dryRun(manifest.applicationTest)).planId,plan.planId);
  const target=client.db(manifest.applicationTest),base=loadConfig(),config={...base,uri:`mongodb://localhost:27019/${manifest.applicationTest}?replicaSet=rs0`,dbName:manifest.applicationTest};
  app=await buildPhase2App(config,{logger:false});
  const user=await target.collection('users').findOne({username:'migrate_0'}),respondent=await target.collection('users').findOne({username:'migrate_1'}),survey=await target.collection('surveys').findOne();assert.ok(user&&respondent&&survey);
  const cookie=`survey_auth=${await signAuth(user._id.toHexString(),config)}`,answerCookie=`survey_auth=${await signAuth(respondent._id.toHexString(),config)}`;
  const fingerprint=async()=>{const rows=[];for(const c of await target.listCollections({},{nameOnly:true}).toArray())rows.push({name:c.name,docs:(await target.collection(c.name).find().sort({_id:1}).toArray()).map(d=>Buffer.from(BSON.serialize(d)).toString('base64'))});return hash(rows.sort((a,b)=>a.name.localeCompare(b.name)));};
  const before=await fingerprint(),evidence:unknown[]=[];
  async function request(method:'GET'|'POST',path:string,body?:unknown,key?:string,answer=false){const r=await app!.inject({method,url:'/api/v1'+path,headers:{cookie:answer?answerCookie:cookie,origin:config.origin,'x-csrf-guard':'1',...(key?{[answer?'idempotency-key':'publication-key']:key}:{})},...(body===undefined?{}:{payload:body as object})});evidence.push({method,path,status:r.statusCode,response:r.json()});return r;}
  let r=await request('GET',`/surveys/${survey._id.toHexString()}/versions/1`);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().data.definition.questions[0].title,'年龄😀');
  const response=await target.collection('responses').findOne({surveyId:survey._id,surveyDefinitionVersion:1});r=await request('GET',`/surveys/${survey._id}/responses/${response!._id}`);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().data.answers[0].number,'0');
  r=await request('GET',`/surveys/${survey._id}/statistics?version=1`);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().data.questionSummaries[0].average,'0');
  r=await request('POST',`/surveys/${survey._id}/publish`,{expectedRevision:1,expectedDraftDefinitionVersion:1},'old-publish-1');assert.equal(r.statusCode,200,r.body);assert.equal(r.json().data.replayed,true);assert.equal(r.json().data.publishedVersion,1);
  r=await request('POST',`/public/surveys/${survey.publicId}/responses`,{publishedVersion:1,anonymous:true,answers:[{questionId:'age',type:'number',number:'0'}]},'old-submit-1',true);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().data.replayed,true);assert.equal(r.json().data.receiptId,response!._id.toHexString());
  assert.equal(await fingerprint(),before);writeFileSync(resolve(directory,'migrated-api.json'),JSON.stringify({manifest,planId:plan.planId,sourceHash:plan.sourceHash,fingerprintBefore:before,fingerprintAfter:await fingerprint(),requests:evidence,note:'JWT cookies supplied only by the test via the existing trusted signer; never logged. The application uses normal Cookie auth and actual migrated MongoDB data.'},null,2));
 }finally{await app?.close();await client.close();await run.close();}
});
