import assert from 'node:assert/strict';
import {readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {MongoClient} from 'mongodb';
import {buildPhase2App} from '../apps/api/src/app.js';
import {loadConfig} from '../apps/api/src/config.js';
import {databaseClientOptions,readMaintenanceDatabaseAuth} from '../apps/api/src/database/credentials.js';
import {openMigrationRun} from '../apps/api/src/database/phase2-migration.js';
const root=resolve('docs/testing/phase2-runs/delivery-20261025');
const migration=JSON.parse(readFileSync(resolve(root,'real-p1-migration.json'),'utf8'));
assert.equal(migration.status,'passed');
const run=await openMigrationRun(migration.runId),auth=readMaintenanceDatabaseAuth();assert(auth);
try{
 const verified=await run.verify(migration.manifest.applicationTest);
 const target=migration.manifest.applicationTest,config={...loadConfig(),databaseAuth:auth,dbName:target,uri:`mongodb://localhost:27019/${target}?replicaSet=rs0`};
 const app=await buildPhase2App(config,{logger:false});
 try{
  const ready=await app.inject({method:'GET',url:'/api/v1/health/ready'});assert.equal(ready.statusCode,200,ready.body);
  const anonymous=await app.inject({method:'GET',url:'/api/v1/surveys'});assert.equal(anonymous.statusCode,401);
  const client=new MongoClient(config.uri,databaseClientOptions(auth));await client.connect();
  let legacySnapshots=0,legacyResponses=0;
  try{
   const db=client.db(target);legacySnapshots=await db.collection('survey_versions').countDocuments({schemaVersion:1});legacyResponses=await db.collection('responses').countDocuments({schemaVersion:2});
   assert.equal(legacySnapshots,migration.counts.survey_versions);assert.equal(legacyResponses,migration.counts.responses);
  }finally{await client.close();}
  const result={status:'passed',target,authorization:'enabled; explicit maintenance credential for isolated migration verification only',migration:verified,phase2Ready:ready.json(),anonymousSurveyListStatus:anonymous.statusCode,legacySnapshots,legacyResponses,at:new Date().toISOString(),limits:'No original user password reset or fabricated login; all original fields/BSON/hash are checked by migration.verify.'};
  writeFileSync(resolve(root,'real-migration-runtime.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({status:result.status,target,legacySnapshots,legacyResponses,ready:200}));
 }finally{await app.close();}
}finally{await run.close();}
