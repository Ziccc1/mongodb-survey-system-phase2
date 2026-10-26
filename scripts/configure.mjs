import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { parseEnv } from 'node:util';
if (existsSync('.env')) { console.log('.env already exists; left unchanged'); }
else {
  writeFileSync('.env', `MONGODB_URI=mongodb://localhost:27019/project2_app_v1?replicaSet=rs0\nMONGODB_DB=project2_app_v1\nAPP_ORIGIN=http://localhost:5200\nPUBLIC_APP_URL=http://localhost:5200\nAPI_HOST=127.0.0.1\nWEB_HOST=localhost\nAPI_PORT=3200\nJWT_SECRET=${randomBytes(48).toString('base64url')}\nCURSOR_SECRET=${randomBytes(48).toString('base64url')}\n`.replaceAll('\\n','\n'), { flag: 'wx' });
  console.log('Created local .env with independent random secrets');
}
// Existing files are checked, never overwritten; errors never print environment values.
const checked = spawnSync(process.execPath, ['--env-file=.env', '--import', 'tsx', '--input-type=module', '--eval', "import {loadConfig} from './apps/api/src/config.ts'; loadConfig(); console.log('P2 local configuration validated; secrets not displayed');"], { stdio: 'inherit', env: {...process.env,...parseEnv(readFileSync('.env','utf8'))} });
process.exitCode = checked.status ?? 1;
