import {maintenanceMongoOptions} from './mongo-maintenance.mjs';
import { MongoClient, MongoServerError } from 'mongodb';
import { assertOwnedPhase2Instance } from './phase2-runtime.mjs';
const owned = assertOwnedPhase2Instance();
const client = new MongoClient('mongodb://localhost:27019/admin?directConnection=true', { ...maintenanceMongoOptions(),serverSelectionTimeoutMS: 1000 });
try {
  let connected = false;
  for (let attempt = 0; attempt < 30; attempt++) { try { await client.connect(); connected = true; break; } catch { await new Promise(resolve => setTimeout(resolve, 500)); } }
  if (!connected) throw new Error('Project MongoDB did not start');
  const admin = client.db('admin');
  const actual = await admin.command({getCmdLineOpts:1});
  if (actual.parsed.storage.dbPath !== owned.dbPath || actual.parsed.net.port !== 27019 || actual.parsed.net.bindIp !== 'localhost' || actual.parsed.replication.replSet !== 'rs0') throw new Error('Actual P2 MongoDB options do not match verified process ownership');
  try { const result = await admin.command({ replSetGetConfig: 1 }); if (result.config._id !== 'rs0' || result.config.members.length !== 1 || result.config.members[0].host !== 'localhost:27019') throw new Error('Unexpected replica configuration; refusing reconfiguration'); }
  catch (error) {
    if (!(error instanceof MongoServerError) || error.code !== 94) throw error;
    await admin.command({ replSetInitiate: { _id: 'rs0', members: [{ _id: 0, host: 'localhost:27019' }] } });
  }
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) { const hello = await admin.command({ hello: 1 }); if (hello.isWritablePrimary && hello.setName === 'rs0') { ready = true; break; } await new Promise(resolve => setTimeout(resolve, 500)); }
  if (!ready) throw new Error('rs0 did not elect a writable primary');
  console.log('P2 rs0 writable primary ready at localhost:27019; no P1 database connected');
} finally { await client.close(); }
