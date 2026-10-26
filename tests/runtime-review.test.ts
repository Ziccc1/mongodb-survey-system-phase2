import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {mkdirSync,cpSync,writeFileSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID,createHash} from 'node:crypto';
import {MongoClient,testMongoOptions} from './database-client.js';
import {buildApp} from '../apps/api/src/app.js';
import {initialize} from '../apps/api/src/database/initialize.js';
import {assertOwnedDatabaseInstance,verifyConnectedDatabaseInstance} from '../apps/api/src/database/instance-ownership.js';
import {assertListenersOwned} from './runtime-listeners.js';
import {isolatedTestConfig,evidenceDirectory} from './runtime-environment.js';

const directory=evidenceDirectory('review-cases');
async function run(label:string,args:string[],extraEnv:Record<string,string>={}) {
  const artifact=resolve(directory,label);mkdirSync(artifact,{recursive:true});
  const started=new Date().toISOString();
  const child=spawn(process.execPath,args,{cwd:process.cwd(),windowsHide:true,env:{...process.env,...extraEnv,PHASE2_EVIDENCE_DIR:artifact},stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';child.stdout.on('data',b=>{stdout+=b;});child.stderr.on('data',b=>{stderr+=b;});
  let timedOut=false;const timer=setTimeout(()=>{timedOut=true;child.kill('SIGTERM');},60000);
  try {
    await once(child,'close');
    writeFileSync(resolve(artifact,'stdout.log'),stdout);writeFileSync(resolve(artifact,'stderr.log'),stderr);
    const result={command:[process.execPath,...args],started,finished:new Date().toISOString(),exitCode:child.exitCode,signal:child.signalCode,timedOut};
    writeFileSync(resolve(artifact,'command-result.json'),JSON.stringify(result,null,2));
    assert.equal(timedOut,false,`${label} timed out`);return {...result,stdout,stderr,artifact};
  } finally {clearTimeout(timer);}
}

function apiFixture(label:string,withValidMarker:boolean) {
  const fixture=resolve('.local',`runtime-review-${label}-${randomUUID()}`);
  cpSync('apps/api/dist',resolve(fixture,'apps/api/dist'),{recursive:true});
  mkdirSync(resolve(fixture,'scripts'),{recursive:true});
  for(const name of ['phase2-instance.ps1','check-mongo-owner.ps1'])cpSync(resolve('scripts',name),resolve(fixture,'scripts',name));
  if(withValidMarker){
    const data=resolve(fixture,'.local/mongodb-phase2-rs0');mkdirSync(data,{recursive:true});
    writeFileSync(resolve(data,'project2-instance.json'),'\uFEFF'+JSON.stringify({kind:'phase2-runtime-v1',projectRoot:fixture,port:27019,replicaSet:'rs0'}));
  }
  const hook=resolve(fixture,'connection-probe.mjs');
  writeFileSync(hook,"import {MongoClient,testMongoOptions} from 'mongodb'; MongoClient.prototype.connect=async function(){console.log('P2_REVIEW_UNEXPECTED_MONGO_CONNECT');throw Error('Database connect must not run on ownership rejection');};\n");
  return {fixture,hook,main:resolve(fixture,'apps/api/dist/main.js')};
}
for(const [label,marker] of [['missing-marker',false],['foreign-directory',true]] as const){
  test(`compiled API refuses ${label} before MongoClient.connect`,async()=>{
    const fixture=apiFixture(label,marker);
    const result=await run(label,['--env-file=.env','--import',pathToFileURL(fixture.hook).href,fixture.main]);
    assert.notEqual(result.exitCode,0);assert.match(result.stderr,/P2_INSTANCE_OWNERSHIP_REQUIRED/);
    assert.ok(!result.stdout.includes('P2_REVIEW_UNEXPECTED_MONGO_CONNECT'));
    writeFileSync(resolve(result.artifact,'expected-rejection.json'),JSON.stringify({expected:'ownership rejection before database connect',passed:true,code:result.exitCode,actualMongoUntouched:true},null,2));
  });
}

for(const target of ['api','web'] as const){
  test(`startup refuses an existing ${target} service even if every URL returns 200`,async()=>{
    let requests=0;const existing=createServer((_req,res)=>{requests++;res.end('existing service returns 200');});
    existing.listen(0,'127.0.0.1');await once(existing,'listening');const port=(existing.address() as {port:number}).port;
    try {
      const extra=target==='api'?{API_PORT:String(port)}:{APP_ORIGIN:`http://127.0.0.1:${port}`,PUBLIC_APP_URL:`http://127.0.0.1:${port}`};
      const result=await run(`occupied-${target}`,['--env-file=.env','--import','tsx','tests/runtime-startup.ts'],extra);
      assert.notEqual(result.exitCode,0);assert.match(result.stderr,/P2_SMOKE_PORT_IN_USE/);assert.ok(result.stderr.includes(String(port)));
      assert.equal(requests,0,'No HTTP request may be sent to the pre-existing service');
      const cleanup=JSON.parse(readFileSync(resolve(result.artifact,'startup-cleanup.json'),'utf8'));
      assert.deepEqual(cleanup.processes,[]);assert.equal(cleanup.probesPassed,false);
      assert.equal((await fetch(`http://127.0.0.1:${port}/`)).status,200,'Existing service must remain alive');
      writeFileSync(resolve(result.artifact,'expected-rejection.json'),JSON.stringify({expected:'port conflict rejected before spawning or HTTP',passed:true,port,existingListenerPid:process.pid,requestsBeforeManualLivenessProbe:0,existingServicePreserved:true},null,2));
    } finally {await new Promise<void>(r=>existing.close(()=>r()));}
  });
}

test('post-start PID validation rejects a real listener owned by another process ID',async()=>{
  const existing=createServer((_req,res)=>res.end('200'));existing.listen(0,'127.0.0.1');await once(existing,'listening');
  const port=(existing.address() as {port:number}).port;
  try {
    assert.throws(()=>assertListenersOwned([{port,pid:process.pid+1000000}]),/P2_SMOKE_LISTENER_MISMATCH/);
    const actual=assertListenersOwned([{port,pid:process.pid}]);assert.ok(actual.length>0);
    writeFileSync(resolve(directory,'pid-mismatch.json'),JSON.stringify({status:'passed',actual,wrongExpectedPidRejected:true},null,2));
  } finally {await new Promise<void>(r=>existing.close(()=>r()));}
});

test('runtime verification accepts normal data; explicit fresh-empty acceptance rejects it without writing',async()=>{
  const config=isolatedTestConfig('runtime_review'),client=new MongoClient(config.uri,testMongoOptions());
  await client.connect();const db=client.db(config.dbName);await initialize(db);
  const env={MONGODB_URI:config.uri,MONGODB_DB:config.dbName};
  let app:Awaited<ReturnType<typeof buildApp>>|undefined;
  try {
    const fresh=await run('fresh-empty',['--env-file=.env','--import','tsx','scripts/verify-runtime-baseline.ts','--expect-empty'],env);
    assert.equal(fresh.exitCode,0,fresh.stderr);
    const owned=assertOwnedDatabaseInstance();
    await assert.rejects(verifyConnectedDatabaseInstance(client,{...owned,processId:owned.processId+1}),/P2_INSTANCE_IDENTITY_CHANGED/);
    app=await buildApp(config,{logger:false});
    const headers={origin:config.origin,'x-csrf-guard':'1'},credentials={username:`review_${randomUUID().slice(0,8)}`,password:randomUUID()};
    assert.equal((await app.inject({method:'POST',url:'/api/v1/auth/register',headers,payload:credentials})).statusCode,201);
    const login=await app.inject({method:'POST',url:'/api/v1/auth/login',headers,payload:credentials});assert.equal(login.statusCode,200);
    const cookie=String(login.headers['set-cookie']).split(';')[0];
    assert.equal((await app.inject({method:'POST',url:'/api/v1/surveys',headers:{...headers,cookie},payload:{title:'Runtime review synthetic survey'}})).statusCode,201);
    await app.close();app=undefined;
    async function fingerprint(){const docs=[];for(const name of ['users','surveys','survey_versions','responses'])docs.push([name,await db.collection(name).find({}).sort({_id:1}).toArray()]);return createHash('sha256').update(JSON.stringify(docs)).digest('hex');}
    const before=await fingerprint();
    const daily=await run('used-database-daily',['--env-file=.env','--import','tsx','scripts/verify-runtime-baseline.ts'],env);
    assert.equal(daily.exitCode,0,daily.stderr);
    const result=JSON.parse(readFileSync(resolve(daily.artifact,'runtime-inspection.json'),'utf8'));
    assert.equal(result.totalDocuments,2);assert.equal(result.emptyDatabaseRequired,false);
    assert.equal(result.collections.find((c:{name:string})=>c.name==='users').count,1);
    assert.equal(result.collections.find((c:{name:string})=>c.name==='surveys').count,1);
    const empty=await run('used-database-expect-empty',['--env-file=.env','--import','tsx','scripts/verify-runtime-baseline.ts','--expect-empty'],env);
    assert.notEqual(empty.exitCode,0);assert.match(empty.stderr,/P2_INITIAL_BASELINE_NOT_EMPTY/);
    assert.equal(await fingerprint(),before,'Both verification modes must be read-only');
    writeFileSync(resolve(directory,'used-database-result.json'),JSON.stringify({status:'passed',database:config.dbName,normalRegistrationAndSurveyCreation:true,dailyExitCode:daily.exitCode,expectEmptyExitCode:empty.exitCode,emptyRejectionExpected:true,totalDocuments:2,readOnlyVerification:true,connectedPidMismatchRejected:true,retainedSyntheticData:true},null,2));
  } finally {if(app)await app.close();await client.close();}
});
