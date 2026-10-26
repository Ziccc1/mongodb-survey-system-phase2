import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import type {MongoClient} from 'mongodb';

export interface OwnedInstance {
  processId:number; projectRoot:string; dbPath:string; port:number; replicaSet:string;
}
const projectRoot=fileURLToPath(new URL('../../../../',import.meta.url));
const samePath=(a:string,b:string)=>resolve(a).toLowerCase()===resolve(b).toLowerCase();

// Source and compiled modules have the same depth; never resolve security resources from cwd.
export function assertOwnedDatabaseInstance():OwnedInstance {
  try {
    const script=fileURLToPath(new URL('../../../../scripts/check-mongo-owner.ps1',import.meta.url));
    const output=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script],{
      encoding:'utf8',windowsHide:true,timeout:15000,stdio:['ignore','pipe','pipe']
    });
    const owned=JSON.parse(output.trim().replace(/^\uFEFF/,'')) as OwnedInstance;
    if(!Number.isSafeInteger(owned.processId)||owned.processId<=0||owned.port!==27019||owned.replicaSet!=='rs0'
      ||!samePath(owned.projectRoot,projectRoot)||!samePath(owned.dbPath,resolve(projectRoot,'.local/mongodb-phase2-rs0')))throw Error('Mismatch');
    return owned;
  } catch {
    // Do not leak child output or configuration values on an ownership failure.
    throw new Error('P2_INSTANCE_OWNERSHIP_REQUIRED: marker, data directory and listening process must belong to this project');
  }
}

export async function verifyConnectedDatabaseInstance(client:MongoClient,owned:OwnedInstance):Promise<void> {
  const admin=client.db('admin');
  const opts=await admin.command({getCmdLineOpts:1});
  const status=await admin.command({serverStatus:1});
  const hello=await admin.command({hello:1});
  const replica=await admin.command({replSetGetConfig:1});
  if(Number(status.pid)!==owned.processId||!samePath(opts.parsed?.storage?.dbPath??'',owned.dbPath)
    ||opts.parsed?.net?.port!==27019||opts.parsed?.net?.bindIp!=='localhost'||opts.parsed?.replication?.replSet!=='rs0'
    ||hello.setName!=='rs0'||!hello.isWritablePrimary||replica.config?.members?.length!==1
    ||replica.config.members[0].host!=='localhost:27019') {
    throw new Error('P2_INSTANCE_IDENTITY_CHANGED: connected server differs from the verified owned process');
  }
}
