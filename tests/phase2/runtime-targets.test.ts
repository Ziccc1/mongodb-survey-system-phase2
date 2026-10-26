import test from 'node:test';
import assert from 'node:assert/strict';
import {MongoClient,testMongoOptions} from '../database-client.js';
import {loadConfig,validateDatabaseTarget,validatePhase2ApplicationTarget} from '../../apps/api/src/config.js';
import {buildApp,buildPhase2App} from '../../apps/api/src/app.js';
import {initializePhase2Schema,initializePhase2ApplicationSchema} from '../../apps/api/src/database/phase2-initialize.js';
test('baseline and phase2 application entries reject the other fixed DB and every restore target before connection',async()=>{
 const base=loadConfig(),original=MongoClient.prototype.connect;let connects=0;
 MongoClient.prototype.connect=async function(){connects++;throw Error('unexpected connection');};
 try{
  for(const [factory,name] of [[buildApp,'project2_app_v2'],[buildPhase2App,'project2_app_v1'],[buildPhase2App,'project2_restore_1792751401306_cfcd1c9e'],[buildApp,'project1_app_v2']] as const){const uri=`mongodb://localhost:27019/${name}?replicaSet=rs0`;await assert.rejects(factory({...base,uri,dbName:name}));}
  for(const name of ['project2_app_v1','project2_restore_1792751401306_cfcd1c9e'])await assert.rejects(initializePhase2ApplicationSchema({uri:`mongodb://localhost:27019/${name}?replicaSet=rs0`,dbName:name}));
  await assert.rejects(initializePhase2Schema({uri:'mongodb://localhost:27019/project2_app_v2?replicaSet=rs0',dbName:'project2_app_v2'}));assert.equal(connects,0);
 }finally{MongoClient.prototype.connect=original;}
});
test('both explicit validators retain exact host/port/URI/replicaSet and finite MongoDB name boundary',()=>{
 for(const validate of [validateDatabaseTarget,validatePhase2ApplicationTarget]){
  const name='project2_test_targets';assert.doesNotThrow(()=>validate(`mongodb://localhost:27019/${name}?replicaSet=rs0`,name));
  for(const uri of [`mongodb://localhost:27018/${name}?replicaSet=rs0`,`mongodb://localhost:27019/${name}?replicaSet=other`,`mongodb://localhost:27019/${name}?replicaSet=rs0&directConnection=true`,`mongodb://localhost:27019/${name}?replicaSet=rs0&replicaSet=rs0`,`mongodb://other.invalid:27019/${name}?replicaSet=rs0`])assert.throws(()=>validate(uri,name));
  const long='project2_test_'+ 'x'.repeat(60);assert.throws(()=>validate(`mongodb://localhost:27019/${long}?replicaSet=rs0`,long));
 }
});
