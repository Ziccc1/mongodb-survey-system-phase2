import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdirSync,createWriteStream,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {once} from 'node:events';
import {loadPhase2Config} from '../../apps/api/src/config.js';
import {assertOwnedPhase2Instance} from '../../scripts/phase2-runtime.mjs';
import {assertPortsFree,assertListenersOwned} from '../runtime-listeners.js';
const config=loadPhase2Config(),directory=process.env.PHASE2_EVIDENCE_DIR;if(!directory)throw Error('Use P2 evidence runner');
assertOwnedPhase2Instance();mkdirSync(directory,{recursive:true});
const started=new Date().toISOString(),processes:{name:string;child:ReturnType<typeof spawn>;closed:Promise<unknown>;spawnError?:string}[]=[];
function start(name:string,args:string[],cwd:string){
  const child=spawn(process.execPath,args,{cwd,windowsHide:true,stdio:['ignore','pipe','pipe'],env:process.env});
  const log=createWriteStream(resolve(directory!,name+'.log'));for(const stream of [child.stdout,child.stderr])stream?.on('data',chunk=>log.write(chunk));child.on('close',()=>log.end());
  const tracked:typeof processes[number]={name,child,closed:once(child,'close')};
  child.on('error',e=>{tracked.spawnError=e.message;});
  // Observe a spawn rejection immediately; cleanup still awaits every child below.
  tracked.closed.catch(()=>{});processes.push(tracked);return child;
}
function assertChildrenLive(){if(processes.some(p=>p.spawnError||p.child.exitCode!==null||p.child.signalCode!==null||p.child.killed))throw Error('A dedicated application child exited during startup');}
async function fetchReady(url:string){let error:unknown;for(let i=0;i<60;i++){assertChildrenLive();try{const r=await fetch(url,{signal:AbortSignal.timeout(2000)});assertChildrenLive();if(r.ok)return r;error=Error(`HTTP ${r.status}`);}catch(e){error=e;}await new Promise(r=>setTimeout(r,250));}throw error;}
async function waitForOwnedListeners(expected:{port:number;pid:number}[]){
  const deadline=Date.now()+30000;
  while(true){assertChildrenLive();try{return assertListenersOwned(expected);}catch(e){
    if(!(e instanceof Error)||!e.message.startsWith('P2_SMOKE_LISTENER_NOT_READY:')||Date.now()>=deadline)throw e;
  }await new Promise(r=>setTimeout(r,150));}
}
let passed=false;
try {
  const webPort=Number(new URL(config.publicAppUrl!).port||(config.publicAppUrl!.startsWith('https:')?443:80));
  assert.notEqual(config.port,webPort,'API and Vite smoke ports must differ');
  assertPortsFree([config.port,webPort]); // Refuse before spawning or probing an existing service.
  const apiChild=start('api',['--env-file=.env.phase2','apps/api/dist/main-phase2.js'],process.cwd());
  const viteChild=start('vite',[resolve('node_modules/vite/bin/vite.js'),'--mode','phase2'],resolve('apps/web'));
  if(!apiChild.pid||!viteChild.pid)throw Error('Application child PID unavailable');
  const expected=[{port:config.port,pid:apiChild.pid},{port:webPort,pid:viteChild.pid}];
  const listenerBeforeHTTP=await waitForOwnedListeners(expected);
  const api=`http://127.0.0.1:${config.port}`,web=config.publicAppUrl!;
  await fetchReady(api+'/api/v1/health/ready');await fetchReady(web+'/');
  const checks=[];
  for(const base of [api,web]){
    assertChildrenLive();assertListenersOwned(expected);
    for(const path of ['/','/api/v1/health/live','/api/v1/health/ready']){assert.equal((await fetch(base+path)).status,200);checks.push(base+path);}
    const response=await fetch(base+'/app-config.js');assert.equal(await response.text(),`window.__SURVEY_CONFIG__=${JSON.stringify({publicAppUrl:config.publicAppUrl,libraryEnabled:true})};`);checks.push(base+'/app-config.js whitelist');
    assert.equal((await fetch(base+'/api/v1/auth/logout',{method:'POST',headers:{origin:'http://untrusted.invalid','x-csrf-guard':'1'}})).status,403);checks.push(base+' rejects wrong Origin');
  }
  assertChildrenLive();const listenerAfterHTTP=assertListenersOwned(expected);
  const result={started,finished:new Date().toISOString(),status:'passed',checks,apiUrl:api,webUrl:web,applicationDatabase:config.dbName,schema:'phase2-thirteen-collections',processes:processes.map(p=>({name:p.name,pid:p.child.pid})),listenerBeforeHTTP,listenerAfterHTTP,note:'Ports were vacant before launch; OS listener PIDs match live children before/after HTTP. All application children released in finally; no sample data inserted'};
  writeFileSync(resolve(directory,'startup-probes.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));passed=true;
} catch(error) {
  writeFileSync(resolve(directory,'startup-failure.json'),JSON.stringify({started,finished:new Date().toISOString(),message:error instanceof Error?error.message:String(error),spawnedPids:processes.map(p=>p.child.pid)},null,2));
  throw error;
} finally {
  for(const p of processes){if(p.child.exitCode===null&&p.child.signalCode===null)p.child.kill('SIGTERM');}
  await Promise.allSettled(processes.map(p=>p.closed));
  writeFileSync(resolve(directory,'startup-cleanup.json'),JSON.stringify({checkedAt:new Date().toISOString(),probesPassed:passed,processes:processes.map(p=>({name:p.name,pid:p.child.pid,exitCode:p.child.exitCode,signal:p.child.signalCode,released:p.child.exitCode!==null||p.child.signalCode!==null}))},null,2));
  console.log('Dedicated API and Vite test processes released; owned P2 MongoDB retained.');
}
