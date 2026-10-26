// W07: preserve the stopped P1 directory, open only an owned cold copy, and reuse the reviewed P2 migration.
import {MongoClient,BSON} from 'mongodb';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync,readdirSync,lstatSync,copyFileSync,existsSync} from 'node:fs';
import {resolve,join,relative} from 'node:path';
import {execFileSync,spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import {createMigrationRun,openMigrationRun} from '../apps/api/src/database/phase2-migration.js';
import {databaseClientOptions,readMaintenanceDatabaseAuth} from '../apps/api/src/database/credentials.js';

const root=resolve('.'),source=resolve('../project1/.local/mongodb-rs0-v2');
assert.equal(source,'D:\\大三\\数据库\\project1\\.local\\mongodb-rs0-v2');
const inventory=()=>JSON.parse(execFileSync('powershell.exe',['-NoProfile','-Command',"@(Get-CimInstance Win32_Process -Filter \"Name='mongod.exe'\" | Select-Object ProcessId,CommandLine) | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true}).trim());
function assertStopped(){const rows=inventory();assert(!([].concat(rows)).some((p:any)=>p.CommandLine?.toLowerCase().includes(source.toLowerCase())||/--port\s+27018(?:\s|$)/.test(p.CommandLine??'')),'Original P1 must be stopped before cold capture');}
assertStopped();assert.equal(readFileSync(join(source,'project1-instance.txt'),'utf8').trim(),'project1 dedicated rs0 localhost:27018 v2');
function files(dir:string):string[]{return readdirSync(dir,{withFileTypes:true}).flatMap(e=>{const p=join(dir,e.name);assert(!lstatSync(p).isSymbolicLink());return e.isDirectory()?files(p):[p];});}
const fingerprint=(dir:string)=>files(dir).map(p=>({path:relative(dir,p),sha256:createHash('sha256').update(readFileSync(p)).digest('hex')})).sort((a,b)=>a.path.localeCompare(b.path));
const before=fingerprint(source),manifest=createMigrationRun();
const privateRoot=resolve('.local/w07',manifest.runId),backup=join(privateRoot,'phase1-cold-backup'),clone=join(privateRoot,'phase1-working-copy');
assert(!existsSync(privateRoot));mkdirSync(privateRoot,{recursive:true});
function copyTree(from:string,to:string){mkdirSync(to,{recursive:true});for(const p of files(from)){const target=join(to,relative(from,p));mkdirSync(resolve(target,'..'),{recursive:true});copyFileSync(p,target);}}
copyTree(source,backup);assert.deepEqual(fingerprint(backup),before);copyTree(backup,clone);assertStopped();assert.deepEqual(fingerprint(source),before);
writeFileSync(join(privateRoot,'source-files.json'),JSON.stringify(before,null,2),{flag:'wx'});
const log=join(privateRoot,'working-copy.log'),child=spawn('D:\\Programmer\\bin\\mongod.exe',['--dbpath',clone,'--bind_ip','localhost','--port','27020','--logpath',log,'--logappend'],{windowsHide:true,stdio:'ignore'});
const readClient=new MongoClient('mongodb://localhost:27020/?directConnection=true',{serverSelectionTimeoutMS:1000,promoteLongs:false});
const output=resolve('docs/testing/phase2-runs/delivery-20261025');mkdirSync(output,{recursive:true});
const result:any={runId:manifest.runId,source:'Stopped real P1 cold copy; original never started or written',sourceDatabase:'project1_app_v2',originalFiles:before.length,sourceUnchanged:false,manifest,steps:[]};
let p2:MongoClient|undefined,run:Awaited<ReturnType<typeof openMigrationRun>>|undefined;
try{
  for(let n=0;;n++){try{await readClient.connect();await readClient.db('admin').command({ping:1});break;}catch(e){if(n>=30||child.exitCode!==null)throw e;await new Promise(r=>setTimeout(r,500));}}
  const opts=await readClient.db('admin').command({getCmdLineOpts:1});assert.equal(opts.parsed.storage.dbPath,clone);assert.equal(opts.parsed.net.port,27020);
  const db=readClient.db('project1_app_v2'),metadata=await db.listCollections().toArray();assert.deepEqual(metadata.map(x=>x.name).sort(),['responses','survey_versions','surveys','users']);
  const dump=[];
  for(const c of metadata.sort((a,b)=>a.name.localeCompare(b.name)))dump.push({name:c.name,options:c.options,indexes:await db.collection(c.name).indexes(),documents:(await db.collection(c.name).find().sort({_id:1}).toArray()).map(d=>Buffer.from(BSON.serialize(d)).toString('base64'))});
  assert(dump.some(c=>c.documents.length>0),'Real P1 source must be nonempty');
  writeFileSync(join(privateRoot,'logical-backup.bson.json'),JSON.stringify(dump),{flag:'wx'});
  result.counts=Object.fromEntries(dump.map(c=>[c.name,c.documents.length]));result.logicalBackupSha256=createHash('sha256').update(readFileSync(join(privateRoot,'logical-backup.bson.json'))).digest('hex');
  p2=new MongoClient('mongodb://localhost:27019/?replicaSet=rs0',{...databaseClientOptions(readMaintenanceDatabaseAuth()),promoteLongs:false});await p2.connect();const target=p2.db(manifest.source);assert.equal((await target.listCollections().toArray()).length,0);
  for(const c of dump){await target.createCollection(c.name,c.options);for(const i of c.indexes)if(i.name!=='_id_'){const {key,name,unique,partialFilterExpression}=i;await target.collection(c.name).createIndex(key,{name,...(unique?{unique}:{}),...(partialFilterExpression?{partialFilterExpression}:{})});}
    if(c.documents.length)await target.collection(c.name).insertMany(c.documents.map(d=>BSON.deserialize(Buffer.from(d,'base64'),{promoteLongs:false})));}
  run=await openMigrationRun(manifest.runId);result.steps.push({step:'inspect',result:await run.inspect()});result.steps.push({step:'backup',result:await run.backup()});
  for(const name of [manifest.restore,manifest.applicationTest]){
    result.steps.push({step:'restore',result:await run.restore(name)});const plan=await run.dryRun(name);assert.equal(plan.blocked.length,0,plan.blocked.join(','));
    result.steps.push({step:'dry-run',target:name,planId:plan.planId,batches:plan.batches.length,rows:plan.rows.length,blocked:plan.blocked});
    result.steps.push({step:'apply',result:await run.apply(name)});result.steps.push({step:'verify',result:await run.verify(name)});result.steps.push({step:'repeat-apply',result:await run.apply(name)});
  }
  result.status='passed';
}catch(e){result.status='failed';result.error=(e as Error).message;process.exitCode=1;}
finally{
  if(run)await run.close();if(p2)await p2.close();
  try{await readClient.db('admin').command({shutdown:1});}catch{}
  await readClient.close();
  for(let n=0;n<40&&child.exitCode===null;n++)await new Promise(r=>setTimeout(r,250));
  result.workingCopyStopped=child.exitCode!==null;assertStopped();result.sourceUnchanged=JSON.stringify(fingerprint(source))===JSON.stringify(before);assert(result.sourceUnchanged);
  result.finishedAt=new Date().toISOString();writeFileSync(join(output,'real-p1-migration.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({status:result.status,runId:manifest.runId,counts:result.counts,sourceUnchanged:result.sourceUnchanged,workingCopyStopped:result.workingCopyStopped,error:result.error,targets:[manifest.restore,manifest.applicationTest]}));
}
