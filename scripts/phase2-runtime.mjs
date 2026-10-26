import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
export function assertOwnedPhase2Instance() {
  const script=fileURLToPath(new URL('./check-mongo-owner.ps1',import.meta.url));
  const text=execFileSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script],{encoding:'utf8',windowsHide:true});
  const owned=JSON.parse(text.trim().replace(/^\uFEFF/,''));
  if(owned.port!==27019 || owned.replicaSet!=='rs0') throw Error('P2 instance ownership check failed');
  return owned;
}
