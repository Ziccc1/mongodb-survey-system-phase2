import {readDatabaseAuth} from './database/credentials.js';
import type {DatabaseAuth} from './database/credentials.js';
export interface Config {
  databaseAuth?:DatabaseAuth;
  uri: string; dbName: string; jwtSecret: string; cursorSecret: string;
  issuer: string; audience: string; origin: string; publicAppUrl?: string; secure: boolean; port: number; host: string;
}
// Validate before creating any MongoClient, including callers supplying Config directly.
export function validateDatabaseTarget(uri: string, dbName: string): void {
  validateTarget(uri,dbName,/^project2_(app_v1|test_[a-zA-Z0-9_]+)$/);
}
export function validatePhase2ApplicationTarget(uri:string,dbName:string):void {
  validateTarget(uri,dbName,/^project2_(app_v2|test_[a-zA-Z0-9_]+)$/);
}
function validateTarget(uri:string,dbName:string,names:RegExp):void {
  let parsed: URL;
  try { parsed = new URL(uri); } catch { throw new Error('Invalid P2 database URI'); }
  if (parsed.protocol !== 'mongodb:' || !['localhost', '127.0.0.1'].includes(parsed.hostname)
    || parsed.port !== '27019' || parsed.username || parsed.password || parsed.hash
    || !names.test(dbName) || dbName.length>63
    || decodeURIComponent(parsed.pathname.slice(1)) !== dbName
    || parsed.searchParams.getAll('replicaSet').length !== 1 || parsed.searchParams.get('replicaSet') !== 'rs0'
    || [...parsed.searchParams.keys()].some(key => key !== 'replicaSet')) {
    throw new Error('P2 requires a dedicated local database on port 27019 / rs0 with matching URI/database and the explicit baseline or phase2 application target');
  }
}
export function loadConfig(): Config {
  return readConfig(validateDatabaseTarget);
}
export function loadPhase2Config():Config {
  return readConfig(validatePhase2ApplicationTarget);
}
function readConfig(validate:(uri:string,name:string)=>void):Config {
  const required = (key: string) => { const value = process.env[key]; if (!value) throw new Error(`Missing ${key}; run npm run configure`); return value; };
  const uri = required('MONGODB_URI'); const dbName = required('MONGODB_DB');
  validate(uri, dbName);
  const jwtSecret = required('JWT_SECRET'), cursorSecret = required('CURSOR_SECRET');
  if (jwtSecret.length < 48 || cursorSecret.length < 48 || jwtSecret === cursorSecret) throw new Error('Independent strong JWT/CURSOR secrets required');
  const origin = required('APP_ORIGIN'); if (new URL(origin).origin !== origin) throw new Error('APP_ORIGIN must be an origin');
  const port = Number(process.env.API_PORT ?? 3200); if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('Invalid API_PORT');
  const publicAppUrl = process.env.PUBLIC_APP_URL ?? origin;
  if (new URL(publicAppUrl).origin !== publicAppUrl || !/^https?:/.test(publicAppUrl) || publicAppUrl !== origin) throw new Error('PUBLIC_APP_URL must equal APP_ORIGIN (one exact same-origin deployment)');
  const host = process.env.API_HOST ?? '127.0.0.1';
  if (!['127.0.0.1','0.0.0.0','::1'].includes(host)) throw new Error('Invalid API_HOST');
  const databaseAuth=readDatabaseAuth(process.env.MONGODB_AUTH_FILE,dbName);
  return { uri, dbName, ...(databaseAuth?{databaseAuth}:{}), jwtSecret, cursorSecret, issuer: 'project1-survey', audience: 'project1-web', origin, publicAppUrl, secure: origin.startsWith('https:'), port, host };
}
