import assert from 'node:assert/strict';
import {MongoClient,BSON} from 'mongodb';
import {readFileSync,writeFileSync,mkdirSync,existsSync,lstatSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomBytes,createHash} from 'node:crypto';
import {assertOwnedPhase2Instance} from './phase2-runtime.mjs';
import {maintenanceMongoOptions} from './mongo-maintenance.mjs';
const root=resolve('.local/security'),evidence=resolve('docs/testing/phase2-runs/delivery-20261025');mkdirSync(root,{recursive:true});mkdirSync(evidence,{recursive:true});assert(!lstatSync(root).isSymbolicLink());
const dbName='project2_app_v2',name='project2_application',appUser='project2_application_user';
const insertOnly=['users','question_versions','survey_versions','responses','operation_receipts'];
const mutable=['surveys','question_items','question_banks','question_grants','survey_templates','template_grants'];
const relations=['question_bank_members','survey_question_bindings'];
const privileges=[{resource:{db:dbName,collection:''},actions:['listCollections']},
 ...insertOnly.map(collection=>({resource:{db:dbName,collection},actions:['listIndexes','find','insert']})),
 ...mutable.map(collection=>({resource:{db:dbName,collection},actions:['listIndexes','find','insert','update']})),
 ...relations.map(collection=>({resource:{db:dbName,collection},actions:['listIndexes','find','insert','update','remove']})),
 {resource:{cluster:true},actions:['getCmdLineOpts','serverStatus','replSetGetConfig']}];
function secret(file,build){const path=resolve(root,file);if(existsSync(path))return JSON.parse(readFileSync(path,'utf8'));const value=build();writeFileSync(path,JSON.stringify(value,null,2),{flag:'wx',mode:0o600});return value;}
const own=assertOwnedPhase2Instance(),client=new MongoClient('mongodb://localhost:27019/?replicaSet=rs0',{...maintenanceMongoOptions(),promoteLongs:false,serverSelectionTimeoutMS:5000});
await client.connect();const admin=client.db('admin'),db=client.db(dbName),opts=await admin.command({getCmdLineOpts:1});assert.equal(Number((await admin.command({serverStatus:1})).pid),own.processId);assert.equal(resolve(opts.parsed.storage.dbPath),resolve('.local/mongodb-phase2-rs0'));
async function appFingerprint(){const rows=[];for(const c of (await db.listCollections().toArray()).sort((a,b)=>a.name.localeCompare(b.name))){const docs=await db.collection(c.name).find().sort({_id:1}).toArray();rows.push({name:c.name,options:c.options,indexes:await db.collection(c.name).indexes(),documents:docs.map(d=>Buffer.from(BSON.serialize(d)).toString('base64'))});}return {rows,hash:createHash('sha256').update(JSON.stringify(rows)).digest('hex')};}
try{
 if(process.argv[2]==='provision'){
  const backup=resolve(root,'pre-auth-application.bson.json');if(!existsSync(backup)){
   let captured;await client.withSession(s=>s.withTransaction(async()=>{const rows=[];for(const c of await db.listCollections().toArray())rows.push({name:c.name,options:c.options,indexes:await db.collection(c.name).indexes(),documents:(await db.collection(c.name).find({},{session:s}).sort({_id:1}).toArray()).map(d=>Buffer.from(BSON.serialize(d)).toString('base64'))});captured={at:new Date().toISOString(),database:dbName,rows};},{readConcern:{level:'snapshot'},writeConcern:{w:'majority'},readPreference:'primary'}));
   writeFileSync(backup,JSON.stringify(captured),{flag:'wx',mode:0o600});
  }
  const before=await appFingerprint();
  const owner=secret('admin.json',()=>({username:'project2_administrator',password:randomBytes(48).toString('base64url'),authSource:'admin'}));
  if(!(await admin.command({usersInfo:owner.username})).users.length)await admin.command({createUser:owner.username,pwd:owner.password,roles:[{role:'root',db:'admin'}],writeConcern:{w:'majority'}});
  if(!(await admin.command({rolesInfo:name})).roles.length)await admin.command({createRole:name,privileges,roles:[],writeConcern:{w:'majority'}});
  const app=secret('application.json',()=>({username:appUser,password:randomBytes(48).toString('base64url'),authSource:dbName,database:dbName}));
  if(!(await db.command({usersInfo:appUser})).users.length)await db.command({createUser:appUser,pwd:app.password,roles:[{role:name,db:'admin'}],writeConcern:{w:'majority'}});
  const key=resolve(root,'mongodb-keyfile');if(!existsSync(key))writeFileSync(key,randomBytes(512).toString('base64'),{flag:'wx',mode:0o600});
  const envPath=resolve('.env.phase2'),env=readFileSync(envPath,'utf8');if(!existsSync(resolve(root,'env.phase2.before-auth')))writeFileSync(resolve(root,'env.phase2.before-auth'),env,{flag:'wx',mode:0o600});
  if(!/^MONGODB_AUTH_FILE=/m.test(env))writeFileSync(envPath,env.replace(/\s*$/,'')+'\nMONGODB_AUTH_FILE=.local/security/application.json\n');
  const after=await appFingerprint();assert.equal(after.hash,before.hash);
  const result={status:'provisioned-restart-required',database:dbName,businessFingerprintUnchanged:true,backupSha256:createHash('sha256').update(readFileSync(backup)).digest('hex'),credentials:'Private .local/security files only; no passwords in public evidence',role:name,collections:13,at:new Date().toISOString()};
  writeFileSync(resolve(evidence,'authorization-provision.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }else if(process.argv[2]==='verify'){
  assert.equal(opts.parsed.security.authorization,'enabled');assert(opts.parsed.security.keyFile);const before=await appFingerprint(),checks=[];
  async function denied(label,work,code=13){try{await work();throw Error('Unexpected permission success: '+label);}catch(e){assert.equal(e.code,code,label);checks.push({name:label,pass:true,code});}}
  const anonymous=new MongoClient('mongodb://localhost:27019/?replicaSet=rs0',{serverSelectionTimeoutMS:5000});try{await anonymous.connect();await denied('Unauthenticated application read refused',()=>anonymous.db(dbName).collection('surveys').findOne());}finally{await anonymous.close();}
  const cfg=JSON.parse(readFileSync(resolve(root,'application.json'),'utf8')),app=new MongoClient('mongodb://localhost:27019/?replicaSet=rs0',{auth:{username:cfg.username,password:cfg.password},authSource:cfg.authSource,serverSelectionTimeoutMS:5000});
  try{await app.connect();const limited=app.db(dbName);assert.equal((await limited.listCollections().toArray()).length,13);await limited.collection('users').findOne({});checks.push({name:'Application SCRAM login, thirteen collections and user read',pass:true});
   for(const collection of insertOnly){await denied(collection+' update refused',()=>limited.collection(collection).updateOne({_id:'authorization-denied-probe'},{$set:{authorizationProbe:true}}));await denied(collection+' delete refused',()=>limited.collection(collection).deleteOne({_id:'authorization-denied-probe'}));}
   await denied('Application cannot create collection',()=>limited.createCollection('authorization_denied_probe'));
   await denied('Application cannot change validator',()=>limited.command({collMod:'surveys',validationLevel:'off'}));
   await denied('Application cannot drop snapshots',()=>limited.collection('survey_versions').drop());
   await denied('Application cannot read baseline database',()=>app.db('project2_app_v1').collection('users').findOne());
   const survey=await limited.collection('surveys').findOne({});assert(survey);const transactionMarker=new Error('Rollback permission probe');
   try{await app.withSession(s=>s.withTransaction(async()=>{assert.equal((await limited.collection('surveys').updateOne({_id:survey._id},{$set:{description:survey.description}},{session:s})).matchedCount,1);throw transactionMarker;},{readConcern:{level:'snapshot'},writeConcern:{w:'majority'}}));}catch(e){assert.equal(e,transactionMarker);}checks.push({name:'Application mutable update permitted in real aborted transaction',pass:true});
  }finally{await app.close();}
  const wrong=new MongoClient('mongodb://localhost:27019/?replicaSet=rs0',{auth:{username:cfg.username,password:randomBytes(32).toString('hex')},authSource:cfg.authSource,serverSelectionTimeoutMS:5000});try{await denied('Wrong password refused',()=>wrong.connect(),18);}finally{await wrong.close();}
  const actual=(await admin.command({rolesInfo:name,showPrivileges:true})).roles[0];const normalize=rows=>rows.map(r=>({resource:r.resource,actions:[...r.actions].sort()})).sort((a,b)=>JSON.stringify(a.resource).localeCompare(JSON.stringify(b.resource)));assert.deepEqual(normalize(actual.privileges),normalize(privileges));checks.push({name:'Provisioned role matches reviewed privilege allowlist',pass:true});
  const after=await appFingerprint();assert.equal(before.hash,after.hash);checks.push({name:'All application documents options and indexes unchanged',pass:true});
  const result={status:'passed',authorization:'enabled',mechanism:'SCRAM (driver-negotiated)',database:dbName,bindIp:opts.parsed.net.bindIp,checks,passed:checks.length,total:checks.length,applicationFingerprint:after.hash,at:new Date().toISOString()};writeFileSync(resolve(evidence,'authorization-enforcement.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,passed:checks.length,total:checks.length}));
 }else throw Error('Use secure-phase2.mjs provision | verify');
}finally{await client.close();}
