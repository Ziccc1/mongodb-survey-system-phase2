import {readMaintenanceDatabaseAuth} from '../apps/api/src/database/credentials.js';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import {loadConfig,validateDatabaseTarget} from '../apps/api/src/config.js';
import {assertOwnedPhase2Instance} from '../scripts/phase2-runtime.mjs';

export function isolatedTestConfig(name:string,origin?:string,port?:number) {
  assert.match(name,/^[a-zA-Z0-9_]+$/);
  const base=loadConfig(), dbName=`project2_test_${name}_${Date.now()}_${randomUUID().slice(0,8).replaceAll('-','')}`;
  assertOwnedPhase2Instance(); // Fail before the first test database connection.
  const uri=new URL(base.uri);uri.pathname='/'+dbName;
  validateDatabaseTarget(uri.toString(),dbName);
  assert.match(dbName,/^project2_test_[a-zA-Z0-9_]+$/);
  const actualOrigin=origin??base.origin;
  console.log(`P2 synthetic target localhost:27019 / ${dbName}`);
  return {...base,databaseAuth:readMaintenanceDatabaseAuth(),dbName,uri:uri.toString(),origin:actualOrigin,publicAppUrl:actualOrigin,...(port===undefined?{}:{port})};
}

export function evidenceDirectory(name:string) {
  assert.match(name,/^[a-zA-Z0-9_-]+$/);
  const allowed=resolve('docs/testing/phase2-runs');
  const parent=resolve(process.env.PHASE2_EVIDENCE_DIR??`${allowed}/standalone-${Date.now()}-${randomUUID()}`);
  const rel=relative(allowed,parent);
  assert.ok(rel && !rel.startsWith('..') && !isAbsolute(rel),'P2 evidence must be in a new phase2-runs subdirectory');
  const result=resolve(parent,name);mkdirSync(result,{recursive:true});return result;
}
