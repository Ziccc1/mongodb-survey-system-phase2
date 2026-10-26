import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export interface Listener {port:number;pid:number;address:string}
export function listenersFor(ports:number[]):Listener[] {
  if(!ports.length||ports.some(p=>!Number.isInteger(p)||p<1||p>65535))throw Error('Invalid listener ports');
  const script=fileURLToPath(new URL('../scripts/check-listeners.ps1',import.meta.url));
  const output=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script,'-Ports',ports.join(',')],{encoding:'utf8',windowsHide:true,timeout:15000,stdio:['ignore','pipe','pipe']});
  const rows=JSON.parse(output.trim().replace(/^\uFEFF/,''));
  if(!Array.isArray(rows)||rows.some(r=>!Number.isInteger(r.port)||!Number.isInteger(r.pid)||typeof r.address!=='string'))throw Error('Invalid OS listener inventory');
  return rows;
}
export function assertPortsFree(ports:number[]):void {
  const existing=listenersFor(ports);
  if(existing.length)throw Error(`P2_SMOKE_PORT_IN_USE: ${existing.map(r=>`${r.port}/pid=${r.pid}`).join(',')}`);
}
export function assertListenersOwned(expected:{port:number;pid:number}[]):Listener[] {
  const rows=listenersFor(expected.map(x=>x.port));
  for(const item of expected){
    const matching=rows.filter(r=>r.port===item.port);
    if(!matching.length)throw Error(`P2_SMOKE_LISTENER_NOT_READY: ${item.port}`);
    if(matching.some(r=>r.pid!==item.pid))throw Error(`P2_SMOKE_LISTENER_MISMATCH: ${item.port} must belong to child pid=${item.pid}`);
  }
  return rows;
}
