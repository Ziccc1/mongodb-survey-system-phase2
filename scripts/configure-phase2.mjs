import {existsSync,readFileSync,writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {parseEnv} from 'node:util';
import {spawnSync} from 'node:child_process';
// Baseline .env stays in place. Node's explicit env-file chooses the application entry.
if(!existsSync('.env.phase2'))writeFileSync('.env.phase2',`MONGODB_URI=mongodb://localhost:27019/project2_app_v2?replicaSet=rs0\nMONGODB_DB=project2_app_v2\nAPP_ORIGIN=http://localhost:5200\nPUBLIC_APP_URL=http://localhost:5200\nAPI_HOST=127.0.0.1\nWEB_HOST=localhost\nAPI_PORT=3200\nJWT_SECRET=${randomBytes(48).toString('base64url')}\nCURSOR_SECRET=${randomBytes(48).toString('base64url')}\n`,{flag:'wx'});
const result=spawnSync(process.execPath,['--env-file=.env.phase2','--import','tsx','--input-type=module','--eval',"import {loadPhase2Config} from './apps/api/src/config.ts'; loadPhase2Config(); console.log('P2 app_v2 configuration validated; baseline .env retained');"],{stdio:'inherit',windowsHide:true,env:{...process.env,...parseEnv(readFileSync('.env.phase2','utf8'))}});
process.exitCode=result.status??1;
