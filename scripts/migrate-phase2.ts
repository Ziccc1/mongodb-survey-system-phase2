import {createMigrationRun,openMigrationRun} from '../apps/api/src/database/phase2-migration.js';
const [command,runId,target]=process.argv.slice(2);
if(command==='new-run'){console.log(JSON.stringify(createMigrationRun(),null,2));}
else{
 if(!runId)throw Error('Usage: migrate-phase2.ts new-run | inspect/backup/restore/dry-run/apply/verify RUN_ID [EXACT_TARGET]');
 const run=await openMigrationRun(runId);
 try{
  let result:unknown;
  if(command==='inspect')result=await run.inspect();
  else if(command==='backup')result=await run.backup();
  else if(command==='restore')result=await run.restore(target);
  else if(command==='dry-run'){const p=await run.dryRun(target);result={planId:p.planId,sourceHash:p.sourceHash,target:p.target,batches:p.batches.length,rows:p.rows,blocked:p.blocked,audit:p.batches.flatMap(b=>b.audit)};}
  else if(command==='apply')result=await run.apply(target);
  else if(command==='verify')result=await run.verify(target);
  else throw Error('Unknown migration command');
  console.log(JSON.stringify(result,null,2));
 }finally{await run.close();}
}
