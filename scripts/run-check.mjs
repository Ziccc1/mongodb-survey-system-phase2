import {spawn} from 'node:child_process';
import {mkdirSync,createWriteStream,writeFileSync} from 'node:fs';
import {resolve,relative,isAbsolute,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
const commands={publicationpage:['--env-file=.env','--import','tsx','tests/phase1/publication-page.ts'],desktop:['--env-file=.env','--import','tsx','tests/phase1/desktop.ts','--verify'],devconfig:['tests/phase1/dev-config.mjs'],redesign:['--env-file=.env','--import','tsx','tests/phase1/redesign.ts'],charts:['--env-file=.env','--import','tsx','tests/phase1/statistics-charts.ts'],pagination:["--env-file=.env","--import","tsx","tests/phase1/pagination.ts"],edges:['--env-file=.env','--import','tsx','tests/phase1/edges.ts'],regression:['--env-file=.env','--import','tsx','tests/phase1/regression.ts'],publish:['--env-file=.env','--import','tsx','tests/phase1/publish.ts'],flow:['--env-file=.env','--import','tsx','tests/phase1/flow.ts'],submit:['--env-file=.env','--import','tsx','tests/phase1/submit.ts'],statistics:['--env-file=.env','--import','tsx','tests/phase1/statistics.ts'],browser:['--env-file=.env','--import','tsx','tests/phase1/browser.ts']};
const npmCli=resolve(dirname(process.execPath),'node_modules/npm/bin/npm-cli.js');
Object.assign(commands,{
 databaseauth:['--import','tsx','--test','tests/database-auth-config.test.ts'],
 acceptancejourney:['--env-file=.env','--import','tsx','--test','tests/phase2/acceptance-journey.test.ts'],
 acceptancepermissions:['--env-file=.env','--import','tsx','--test','tests/phase2/acceptance-permissions.test.ts'],
 acceptancescale:['--env-file=.env','--import','tsx','--test','tests/phase2/acceptance-scale.test.ts'],
 crossaccessreview:['--env-file=.env','--import','tsx','--test','tests/phase2/cross-access-review.test.ts'],
 crossretainedbrowser:['--env-file=.env','--import','tsx','tests/phase2/cross-retained-browser.ts'],
 templatebrowser:['--env-file=.env','--import','tsx','tests/phase2/template-browser.ts'],
 templatelineage:['--env-file=.env','--import','tsx','--test','--test-concurrency=1','tests/phase2/template-lineage.test.ts'],
 templateraces:['--env-file=.env','--import','tsx','--test','tests/phase2/template-races.test.ts'],
 templates:['--env-file=.env','--import','tsx','--test','tests/phase2/templates.test.ts'],
 crossboundaries:['--env-file=.env','--import','tsx','--test','tests/phase2/cross-boundaries.test.ts'],
 crossbrowser:['--env-file=.env','--import','tsx','tests/phase2/cross-browser.ts'],
 operationretry:['--import','tsx','--test','tests/phase2/operation-retry.test.ts'],
 crossstatistics:['--env-file=.env','--import','tsx','--test','--test-concurrency=1','tests/phase2/cross-statistics.test.ts'],
 httpreceipts:['--env-file=.env','--import','tsx','--test','tests/phase2/receipts-api.test.ts'],
 usagecapacity:['--env-file=.env','--import','tsx','--test','tests/phase2/usage-capacity.test.ts'],
 phase2visual:['--env-file=.env','--import','tsx','tests/phase2/browser.ts','--own-only'],
 phase2startup:['--env-file=.env.phase2','--import','tsx','tests/phase2/startup.ts'],
 phase2compatibility:['--env-file=.env','--import','tsx','--test','--test-concurrency=1','tests/phase2/compatibility.test.ts'],
 phase2targets:['--env-file=.env','--import','tsx','--test','tests/phase2/runtime-targets.test.ts'],
 migratedapi:['--env-file=.env','--import','tsx','--test','tests/phase2/migrated-api.test.ts'],
 phase2browser:['--env-file=.env','--import','tsx','tests/phase2/browser.ts'],
 surveyssharingusage:['--env-file=.env','--import','tsx','--test','--test-concurrency=1','tests/phase2/surveys-sharing-usage.test.ts'],
 versionsbanks:['--env-file=.env','--import','tsx','--test','--test-concurrency=1','tests/phase2/versions-banks.test.ts'],
 configurephase2:['scripts/configure-phase2.mjs'],
 initphase2:['--env-file=.env.phase2','--import','tsx','scripts/init-phase2-app.ts'],
 verifyphase2:['--env-file=.env.phase2','--import','tsx','scripts/init-phase2-app.ts','--verify'],
 migration:['--env-file=.env','--import','tsx','--test','--test-concurrency=1','tests/phase2-migration.test.ts'],
 bindingsreceipts:['--env-file=.env','--import','tsx','--test','--test-concurrency=1','tests/bindings-receipts.test.ts'],
 sharedimports:['--test','tests/shared-imports.test.mjs'],
 contenterrors:['--env-file=.env','--import','tsx','--test','tests/operation-content-errors.test.ts'],
 domain:['--env-file=.env','--import','tsx','--test','tests/domain-foundation.test.ts','tests/operation-content-errors.test.ts','tests/shared-imports.test.mjs'],
 schemafoundation:['--env-file=.env','--import','tsx','--test','tests/schema-foundation.test.ts'],
 isolation:['--env-file=.env','--import','tsx','--test','tests/runtime-isolation.test.ts'],
 verifyruntime:['--env-file=.env','--import','tsx','scripts/verify-runtime-baseline.ts'],
 verifyinitial:['--env-file=.env','--import','tsx','scripts/verify-runtime-baseline.ts','--expect-empty'],
 runtimereview:['--env-file=.env','--import','tsx','--test','--test-concurrency=1','tests/runtime-review.test.ts'],
 runtimereviewapi:['--env-file=.env','--import','tsx','--test','--test-concurrency=1','--test-name-pattern=compiled API','tests/runtime-review.test.ts'],
 integration:['--env-file=.env','--import','tsx','--test','--test-concurrency=1','tests/integration.test.ts'],
 startup:['--env-file=.env','--import','tsx','tests/runtime-startup.ts'],
 configure:['scripts/configure.mjs'],
 typecheck:[npmCli,'run','typecheck'],build:[npmCli,'run','build'],
 dbstart:[npmCli,'run','db:start'],dbinit:[npmCli,'run','db:init'],
 phase1:[npmCli,'run','test:phase1'],existingregression:[npmCli,'run','test:regression']
});
const name=process.argv[2];if(!Object.hasOwn(commands,name))throw Error('Known baseline/test command required');
const allowed=resolve('docs/testing/phase2-runs');
const runRoot=resolve(process.env.PHASE2_RUN_ROOT??`${allowed}/${new Date().toISOString().replace(/[:.]/g,'-')}-${randomUUID()}`);
const scope=relative(allowed,runRoot);if(!scope || scope.startsWith('..') || isAbsolute(scope))throw Error('P2 evidence root must be a dedicated phase2-runs subdirectory');
const directory=resolve(runRoot,`${new Date().toISOString().replace(/[:.]/g,'-')}-${name}-${randomUUID().slice(0,8)}`);mkdirSync(directory,{recursive:true});
const log=createWriteStream(`${directory}/output.log`),start=new Date().toISOString();
const child=spawn(process.execPath,commands[name],{stdio:['ignore','pipe','pipe'],env:{...process.env,PHASE2_RUN_ROOT:runRoot,PHASE2_EVIDENCE_DIR:resolve(directory,'artifacts')}});
for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>{process.stdout.write(chunk);log.write(chunk);});
child.on('error',error=>{log.write(String(error));});
child.on('close',code=>{log.end();writeFileSync(`${directory}/result.json`,JSON.stringify({name,start,finished:new Date().toISOString(),command:[process.execPath,...commands[name]],databaseScope:'local 27019/rs0, project2_test_* synthetic data only for test commands',exitCode:code,status:code===0?'passed':'failed'},null,2));console.log(`Actual output retained: ${directory}`);process.exitCode=code??1;});
