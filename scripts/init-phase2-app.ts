import {loadPhase2Config} from '../apps/api/src/config.js';
import {initializePhase2ApplicationSchema,verifyPhase2ApplicationSchema} from '../apps/api/src/database/phase2-initialize.js';
const config=loadPhase2Config(),target={uri:config.uri,dbName:config.dbName,databaseAuth:config.databaseAuth};
if(process.argv.includes('--verify'))await verifyPhase2ApplicationSchema(target);
else await initializePhase2ApplicationSchema(target);
console.log(`P2 thirteen-collection application ${process.argv.includes('--verify')?'verified':'initialized'}: ${config.dbName}`);
