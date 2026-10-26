import {readFileSync,lstatSync} from 'node:fs';
import {resolve,relative,isAbsolute} from 'node:path';
import type {MongoClientOptions} from 'mongodb';
import {existsSync} from 'node:fs';

export interface DatabaseAuth {username:string; password:string; authSource:string}
export function databaseClientOptions(auth?:DatabaseAuth):MongoClientOptions {
  return auth?{auth:{username:auth.username,password:auth.password},authSource:auth.authSource}:{};
}
// Explicitly used by local migration/test tooling, never by the application entry point.
export function readMaintenanceDatabaseAuth():DatabaseAuth|undefined {
  const file=resolve('.local/security/admin.json');if(!existsSync(file))return undefined;
  const value=JSON.parse(readFileSync(file,'utf8'));
  if(value.username!=='project2_administrator'||value.authSource!=='admin'||typeof value.password!=='string'||value.password.length<32)throw Error('Invalid private P2 maintenance credentials');
  return {username:value.username,password:value.password,authSource:'admin'};
}
// Keep credentials out of URIs, process arguments, public assets, and tracked configuration.
export function readDatabaseAuth(file:string|undefined,database:string):DatabaseAuth|undefined {
  if(!file)return undefined;
  try{
    const parent=resolve('.local/security'),path=resolve(file),rel=relative(parent,path);
    if(!rel||rel.startsWith('..')||/[\\/]/.test(rel)||isAbsolute(rel)||lstatSync(resolve('.local')).isSymbolicLink()||lstatSync(parent).isSymbolicLink()||lstatSync(path).isSymbolicLink())throw Error();
    const value=JSON.parse(readFileSync(path,'utf8'));
    if(Object.keys(value).sort().join(',')!=='authSource,database,password,username'||value.database!==database||value.authSource!==database
      ||typeof value.username!=='string'||!/^project2_[a-z0-9_]+$/.test(value.username)||typeof value.password!=='string'||value.password.length<32)throw Error();
    return {username:value.username,password:value.password,authSource:value.authSource};
  }catch{throw Error('P2_DATABASE_AUTH_FILE_INVALID: use the private credentials provisioned for this exact application database');}
}
