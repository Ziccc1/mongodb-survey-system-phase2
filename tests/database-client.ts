export {MongoClient} from 'mongodb';
import {databaseClientOptions,readMaintenanceDatabaseAuth} from '../apps/api/src/database/credentials.js';
// Explicit local fixture credentials; exporting the original driver preserves prototype-based guard probes.
export const testMongoOptions=()=>databaseClientOptions(readMaintenanceDatabaseAuth());
