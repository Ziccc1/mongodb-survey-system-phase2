import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {randomUUID} from 'node:crypto';
import {readDatabaseAuth,databaseClientOptions} from '../apps/api/src/database/credentials.js';
import {validatePhase2ApplicationTarget} from '../apps/api/src/config.js';

test('explicit database auth is scoped to the exact private file and database without weakening URI guards',()=>{
 assert.equal(readDatabaseAuth(undefined,'project2_app_v2'),undefined);
 assert.deepEqual(databaseClientOptions(undefined),{});
 mkdirSync('.local/security',{recursive:true});
 const file=resolve('.local/security',`auth-config-fixture-${randomUUID()}.json`);
 const fixture={username:'project2_fixture',password:'synthetic-only-password-at-least-32-characters',authSource:'project2_app_v2',database:'project2_app_v2'};
 writeFileSync(file,JSON.stringify(fixture),{flag:'wx'});
 const auth=readDatabaseAuth(file,'project2_app_v2');assert(auth);assert.equal(auth.username,fixture.username);assert.equal(databaseClientOptions(auth).authSource,'project2_app_v2');
 assert.throws(()=>readDatabaseAuth(file,'project2_app_v1'),/AUTH_FILE_INVALID/);
 assert.throws(()=>readDatabaseAuth('.local/security/missing.json','project2_app_v2'),/AUTH_FILE_INVALID/);
 assert.throws(()=>readDatabaseAuth('.local/security/../arbitrary.json','project2_app_v2'),/AUTH_FILE_INVALID/);
 writeFileSync(file,JSON.stringify({...fixture,unreviewed:true}));assert.throws(()=>readDatabaseAuth(file,'project2_app_v2'),/AUTH_FILE_INVALID/);
 writeFileSync(file,JSON.stringify(fixture));
 validatePhase2ApplicationTarget('mongodb://localhost:27019/project2_app_v2?replicaSet=rs0','project2_app_v2');
 for(const uri of ['mongodb://fixture:secret@localhost:27019/project2_app_v2?replicaSet=rs0','mongodb://localhost:27018/project2_app_v2?replicaSet=rs0','mongodb://localhost:27019/project2_app_v2?replicaSet=rs0&authSource=admin'])assert.throws(()=>validatePhase2ApplicationTarget(uri,'project2_app_v2'));
});
