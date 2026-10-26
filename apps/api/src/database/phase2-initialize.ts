import { MongoClient } from 'mongodb';
import type { Db } from 'mongodb';
import {databaseClientOptions} from './credentials.js';
import type {DatabaseAuth} from './credentials.js';
import { validateDatabaseTarget,validatePhase2ApplicationTarget } from '../config.js';
import { assertOwnedDatabaseInstance, verifyConnectedDatabaseInstance } from './instance-ownership.js';
import { phase2Registry } from './schema-registry.js';
import {verifySourceCoverage} from '../core/question-usage.js';

export interface Phase2SchemaTarget {uri:string; dbName:string; databaseAuth?:DatabaseAuth}
export function validatePhase2SchemaTarget(target:Phase2SchemaTarget):void {
  validateDatabaseTarget(target.uri,target.dbName);
  if(!/^project2_test_[A-Za-z0-9_]+$/.test(target.dbName))throw Error('P2_SCHEMA_TEST_DATABASE_REQUIRED');
}
function stable(value:unknown):string {
  if(Array.isArray(value))return `[${value.map(stable).join(',')}]`;
  if(value&&typeof value==='object')return `{${Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${stable(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
async function preflight(db:Db,allowMissingCollections:boolean) {
  const existing=await db.listCollections({},{nameOnly:false}).toArray();
  const {schemas,indexSpecs}=phase2Registry;
  for(const collection of existing) {
    if(!Object.hasOwn(schemas,collection.name))throw Error('P2_SCHEMA_UNKNOWN_COLLECTION: reviewed migration required');
    const name=collection.name as keyof typeof schemas;
    if(collection.type!=='collection'||stable(collection.options?.validator)!==stable({$jsonSchema:schemas[name]})
      ||collection.options?.validationLevel!=='strict'||collection.options?.validationAction!=='error')throw Error('P2_SCHEMA_VALIDATOR_MISMATCH: reviewed migration required');
    const actual=await db.collection(name).indexes(),specs=indexSpecs[name];
    for(const spec of specs) {
      const found=actual.find(i=>i.name===spec.name);
      if(!found||JSON.stringify(found.key)!==JSON.stringify(spec.key)||!!found.unique!==!!spec.unique
        ||stable(found.partialFilterExpression)!==stable(spec.partialFilterExpression)
        ||found.sparse||found.hidden||found.expireAfterSeconds!==undefined||found.collation)throw Error('P2_SCHEMA_INDEX_MISMATCH: no automatic repair');
    }
    if(actual.some(i=>i.name!=='_id_'&&!specs.some(s=>s.name===i.name)))throw Error('P2_SCHEMA_UNKNOWN_INDEX');
    if(Object.keys(collection.options??{}).some(k=>!['validator','validationLevel','validationAction'].includes(k)))throw Error('P2_SCHEMA_OPTIONS_MISMATCH');
  }
  if(!allowMissingCollections&&existing.length!==Object.keys(schemas).length)throw Error('P2_SCHEMA_THIRTEEN_COLLECTIONS_REQUIRED');
  return existing;
}
async function withOwnedTarget(target:Phase2SchemaTarget,action:(db:Db)=>Promise<void>,application=false) {
  if(application)validatePhase2ApplicationTarget(target.uri,target.dbName);
  else validatePhase2SchemaTarget(target); // Restriction before OS lookup or connection.
  const owned=assertOwnedDatabaseInstance();
  const client=new MongoClient(target.uri,databaseClientOptions(target.databaseAuth));
  try {
    await client.connect();
    await verifyConnectedDatabaseInstance(client,owned); // Before any target schema read/write.
    await action(client.db(target.dbName));
  } finally {await client.close();}
}
export async function verifyPhase2Schema(target:Phase2SchemaTarget):Promise<void> {
  await withOwnedTarget(target,async db=>{await preflight(db,false);});
}
export async function initializePhase2Schema(target:Phase2SchemaTarget):Promise<void> {
  await withOwnedTarget(target,initialize);
}
async function initialize(db:Db) {
    const existing=await preflight(db,true); // Inspect ALL existing objects before the first DDL.
    for(const [name,schema] of Object.entries(phase2Registry.schemas)) {
      if(existing.some(c=>c.name===name))continue;
      await db.createCollection(name,{validator:{$jsonSchema:schema},validationLevel:'strict',validationAction:'error'});
      for(const {key,...options} of phase2Registry.indexSpecs[name as keyof typeof phase2Registry.schemas])await db.collection(name).createIndex(key,options);
    }
    await preflight(db,false);
}
/** Explicit new-application initializer. Never accepts app_v1 or restore databases. */
export async function initializePhase2ApplicationSchema(target:Phase2SchemaTarget):Promise<void> {
  await withOwnedTarget(target,async db=>{await preflight(db,true);if(await db.collection('surveys').countDocuments({schemaVersion:{$ne:3}}))throw Error('P2_MIGRATION_INCOMPLETE');await initialize(db);await verifyPhase2Database(db);},true);
}
export async function verifyPhase2Database(db:Db):Promise<void> {
  await preflight(db,false);
  if(await db.collection('surveys').countDocuments({schemaVersion:{$ne:3}}))throw Error('P2_MIGRATION_INCOMPLETE');
  await verifySourceCoverage(db);
}
export async function verifyPhase2ApplicationSchema(target:Phase2SchemaTarget):Promise<void> {
  await withOwnedTarget(target,verifyPhase2Database,true);
}

