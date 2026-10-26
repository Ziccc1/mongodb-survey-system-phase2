import { MongoClient } from 'mongodb';
import { loadConfig } from '../apps/api/src/config.js';
import { initialize } from '../apps/api/src/database/initialize.js';
import { assertOwnedPhase2Instance } from './phase2-runtime.mjs';
assertOwnedPhase2Instance();
const config = loadConfig(), client = new MongoClient(config.uri);
try { await client.connect(); await initialize(client.db(config.dbName)); console.log('P2 isolated P1 compatibility baseline: four collections, original strict validators and indexes ready. No sample data inserted; no migration performed; P2 13-collection schema NOT implemented.'); } finally { await client.close(); }
