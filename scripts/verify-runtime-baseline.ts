import assert from 'node:assert/strict';
import {realpathSync,readFileSync,writeFileSync,mkdirSync,readdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {resolve,relative} from 'node:path';
import {MongoClient} from 'mongodb';
import {loadConfig} from '../apps/api/src/config.js';
import {verifySchema} from '../apps/api/src/database/initialize.js';
import {assertOwnedPhase2Instance} from './phase2-runtime.mjs';
const owned=assertOwnedPhase2Instance(),config=loadConfig(),client=new MongoClient(config.uri);
const args=process.argv.slice(2);
if(args.some(arg=>arg!=='--expect-empty')||new Set(args).size!==args.length)throw Error('Only --expect-empty is supported');
const emptyDatabaseRequired=args.includes('--expect-empty');
try {
  await client.connect();const db=client.db(config.dbName);await verifySchema(db);
  const hello=await db.admin().command({hello:1}),opts=await db.admin().command({getCmdLineOpts:1}),replica=await db.admin().command({replSetGetConfig:1});
  assert.equal(hello.isWritablePrimary,true);assert.equal(hello.setName,'rs0');assert.equal(opts.parsed.storage.dbPath,owned.dbPath);assert.equal(opts.parsed.net.port,27019);assert.equal(opts.parsed.replication.replSet,'rs0');assert.equal(replica.config.members[0].host,'localhost:27019');assert.equal(replica.config.members.length,1);
  const collections=await db.listCollections().toArray();assert.deepEqual(collections.map(c=>c.name).sort(),['responses','survey_versions','surveys','users']);
  const collectionEvidence=[];
  for(const collection of collections){
    const count=await db.collection(collection.name).countDocuments();
    collectionEvidence.push({name:collection.name,count,options:collection.options,indexes:await db.collection(collection.name).indexes()});
  }
  const totalDocuments=collectionEvidence.reduce((total,c)=>total+c.count,0);
  if(emptyDatabaseRequired&&totalDocuments!==0)throw Error(`P2_INITIAL_BASELINE_NOT_EMPTY: ${totalDocuments} documents; this flag is only for fresh initialization acceptance`);
  const databases=(await db.admin().listDatabases({nameOnly:true})).databases.map(d=>d.name).sort();
  const allowedRestores=new Set<string>();
  const migrationRoot=resolve('.local/p2-008/migrations');
  const instanceHash=createHash('sha256').update(readFileSync('.local/mongodb-phase2-rs0/project2-instance.json')).digest('hex');
  for(const run of (existsSync(migrationRoot)?readdirSync(migrationRoot,{withFileTypes:true}):[]).filter(e=>e.isDirectory()&&/^[0-9]{13}_[a-f0-9]{8}$/.test(e.name))){
    const manifest=JSON.parse(readFileSync(resolve(migrationRoot,run.name,'manifest.json'),'utf8'));
    if(manifest.task==='P2-008'&&manifest.runId===run.name&&manifest.instanceHash===instanceHash&&manifest.restore===`project2_restore_${run.name}`)allowedRestores.add(manifest.restore);
  }
  assert.ok(databases.every(d=>['admin','config','local','project2_app_v1','project2_app_v2'].includes(d)||/^project2_test_[a-zA-Z0-9_]+$/.test(d)||allowedRestores.has(d)));
  const root=realpathSync('.'),workspaceLinks=['api','web','shared'].map(name=>{
    const actual=realpathSync(`node_modules/@survey/${name}`),expected=realpathSync(name==='shared'?'packages/shared':`apps/${name}`);assert.equal(actual,expected);assert.ok(!relative(root,actual).startsWith('..'));return {name,actual};
  });
  let scannedAssets=0;
  function inspect(directory:string){for(const entry of readdirSync(directory,{withFileTypes:true})){const p=resolve(directory,entry.name);if(entry.isDirectory())inspect(p);else if(/\.(js|html)$/.test(p)){const text=readFileSync(p,'utf8');assert.ok(!text.includes(config.jwtSecret)&&!text.includes(config.cursorSecret)&&!text.includes(config.uri));scannedAssets++;}}}
  inspect('apps/web/dist');
  const result={task:'P2-W01',state:'verified-P1-four-collection-baseline-not-P2-schema',checkedAt:new Date().toISOString(),node:process.version,ownedInstance:owned,serverVersion:(await db.admin().command({buildInfo:1})).version,primary:true,replicaMembers:replica.config.members.map((m:{host:string})=>m.host),database:config.dbName,databaseKind:config.dbName==='project2_app_v1'?'application':'syntheticTest',emptyDatabaseRequired,totalDocuments,collections:collectionEvidence,testDatabases:databases.filter(d=>d.startsWith('project2_test_')),workspaceLinks,publicAssetsScanned:scannedAssets,secretsExposed:false};
  const directory=process.env.PHASE2_EVIDENCE_DIR;if(!directory)throw Error('Run via controlled P2 evidence runner');mkdirSync(directory,{recursive:true});writeFileSync(resolve(directory,'runtime-inspection.json'),JSON.stringify(result,null,2));
  console.log(JSON.stringify({state:result.state,serverVersion:result.serverVersion,primary:true,database:config.dbName,databaseKind:result.databaseKind,emptyDatabaseRequired,totalDocuments,collectionCounts:collectionEvidence.map(c=>({name:c.name,count:c.count})),testDatabaseCount:result.testDatabases.length,workspaceLinksVerified:workspaceLinks.length,publicAssetsScanned:scannedAssets,details:resolve(directory,'runtime-inspection.json')},null,2));
} finally {await client.close();}
