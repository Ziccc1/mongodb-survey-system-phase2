import test from 'node:test';
import assert from 'node:assert/strict';
import {loadConfig,validateDatabaseTarget} from '../apps/api/src/config.js';
import {buildApp} from '../apps/api/src/app.js';

test('P2 configuration accepts only exact local 27019 / rs0 application and synthetic databases',()=>{
  for(const host of ['localhost','127.0.0.1'])for(const db of ['project2_app_v1','project2_test_config_123']){
    assert.doesNotThrow(()=>validateDatabaseTarget(`mongodb://${host}:27019/${db}?replicaSet=rs0`,db));
  }
});
const badTargets=[
  ['mongodb://localhost:27018/project2_app_v1?replicaSet=rs0','project2_app_v1'],
  ['mongodb://localhost:27019/project1_app_v2?replicaSet=rs0','project1_app_v2'],
  ['mongodb://localhost:27019/project1_test_probe?replicaSet=rs0','project1_test_probe'],
  ['mongodb://localhost:27019/project2_app_v1?replicaSet=rs0','project2_test_mismatch'],
  ['mongodb://localhost:27019/uncontrolled?replicaSet=rs0','uncontrolled'],
  ['mongodb://example.invalid:27019/project2_app_v1?replicaSet=rs0','project2_app_v1'],
  ['mongodb://localhost:27019/project2_app_v1?replicaSet=other','project2_app_v1'],
  ['mongodb://localhost/project2_app_v1?replicaSet=rs0','project2_app_v1'],
  ['mongodb://localhost:27019/project2_app_v1?replicaSet=rs0&replicaSet=other','project2_app_v1'],
  ['mongodb://localhost:27019/project2_app_v1?replicaSet=rs0&directConnection=true','project2_app_v1'],
  ['mongodb://user:unused@localhost:27019/project2_app_v1?replicaSet=rs0','project2_app_v1']
];
for(const [index,[uri,db]] of badTargets.entries())test(`P2 rejects unsafe target ${index+1} before database connection`,()=>assert.throws(()=>validateDatabaseTarget(uri,db)));
test('direct buildApp callers cannot bypass target validation',async()=>{
  const config=loadConfig();
  await assert.rejects(buildApp({...config,uri:'mongodb://localhost:27018/project1_app_v2?replicaSet=rs0',dbName:'project1_app_v2'}),/P2 requires/);
});
test('actual generated configuration uses independent secrets and exact same-origin public URL',()=>{
  const c=loadConfig();assert.notEqual(c.jwtSecret,c.cursorSecret);assert.ok(c.jwtSecret.length>=48&&c.cursorSecret.length>=48);assert.equal(c.publicAppUrl,c.origin);assert.equal(c.dbName,'project2_app_v1');
});
