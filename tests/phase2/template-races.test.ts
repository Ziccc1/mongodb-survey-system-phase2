import test from 'node:test';
import assert from 'node:assert/strict';
import {ObjectId} from 'mongodb';
import {phase2Harness} from './harness.js';
import {templateFixture,textContent} from './template-fixture.js';
import type {FaultHooks} from '../../apps/api/src/core/common.js';
function deferred(){let resolve!:()=>void;return {promise:new Promise<void>(r=>resolve=r),resolve:()=>resolve()};}
async function bounded(p:Promise<unknown>){let timer:ReturnType<typeof setTimeout>;try{await Promise.race([p,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Barrier timed out')),10000))]);}finally{clearTimeout(timer!);}}
test('W06 six controlled actual Mongo fence orders: adoption/unlisting/direct/deep revocation',async t=>{
 const faults:FaultHooks={},h=await phase2Harness('template_races',faults),f=templateFixture(h);
 try{await h.user();await h.user();
  for(const opponent of ['unlisting','direct','deep'] as const)for(const order of ['adopt-first','stop-first'] as const)await t.test(`${opponent} / ${order}`,async()=>{
   const q=await f.formal(),events:string[]=[];let leaf=q.vid,g:any;
   if(opponent!=='unlisting'){await f.share(q.qid,1);g=await f.grant(q.qid,q.vid,1);}
   if(opponent==='deep'){const fork=await f.fork(q.vid,1,{...textContent,title:'有上游的叶题'});assert.equal(fork.r.statusCode,201,fork.r.body);leaf=fork.r.json().data.versionId;}
   const owner=opponent==='unlisting'?0:1,{tid}=await f.template([leaf],owner),held=deferred(),release=deferred(),stopAtFence=deferred();let used=false;
   const templateBarrier=async(p:{action:string;templateId:string})=>{if(p.templateId===tid&&p.action==='adoptTemplate'&&!used){used=true;events.push('adopt-held');held.resolve();await release.promise;}};
   const questionBarrier=async(p:{action:string;questionId:string})=>{if(p.questionId===q.qid&&p.action==='adoptTemplate'&&!used){used=true;events.push('adopt-held');held.resolve();await release.promise;}};
   if(opponent==='unlisting'){
    if(order==='adopt-first')faults.afterTemplateFence=templateBarrier;
    faults.beforeTemplateFence=async p=>{if(order==='stop-first')await templateBarrier(p);if(p.templateId===tid&&p.action==='unlisting'){events.push('stop-at-fence');stopAtFence.resolve();}};
   }else{
    if(order==='adopt-first')faults.afterAccessFence=questionBarrier;
    faults.beforeAccessFence=async p=>{if(order==='stop-first')await questionBarrier(p);if(p.questionId===q.qid&&p.action==='distributionRevoke'){events.push('stop-at-fence');stopAtFence.resolve();}};
   }
   const before=await h.db.collection('surveys').countDocuments(),run=f.adopt(tid,2);let stop:any,result:any;
   try{await bounded(held.promise);const stopping=opponent==='unlisting'?f.state(tid,false,0,owner):f.revoke(q.qid,g);
    if(order==='adopt-first'){await bounded(stopAtFence.promise);events.push('release-adopt');release.resolve();result=await run;events.push('adopt-committed');stop=await stopping;events.push('stop-committed');}
    else{stop=await stopping;events.push('stop-committed');release.resolve();result=await run;events.push('adopt-rejected');}
   }finally{release.resolve();delete faults.beforeAccessFence;delete faults.afterAccessFence;delete faults.beforeTemplateFence;delete faults.afterTemplateFence;}
   assert.equal(result.r.statusCode,order==='adopt-first'?201:opponent==='unlisting'?409:403,result.r.body);if(opponent==='unlisting')assert.equal(stop.statusCode,200,stop.body);
   assert.equal(await h.db.collection('surveys').countDocuments(),before+(order==='adopt-first'?1:0));const receipts=await h.db.collection('operation_receipts').countDocuments({operation:'adoptTemplate',requestKey:result.key});assert.equal(receipts,order==='adopt-first'?1:0);
   const template=await h.db.collection('survey_templates').findOne({_id:new ObjectId(tid)});assert.equal(template!.revision,opponent==='unlisting'?1:0);
   if(order==='adopt-first'){const sid=result.r.json().data.surveyId;await f.publish(sid,2);const e=await h.getSurvey(sid,2),answer=await f.post(`/public/surveys/${e.publicId}/responses`,{publishedVersion:1,anonymous:false,answers:[{questionId:e.draftDefinition.questions[0].id,type:'text',text:'存量仍可填写'}]},2);assert.equal(answer.r.statusCode,201,answer.r.body);}
   h.saveEvidence(`race-${opponent}-${order}`,{events,status:result.r.statusCode,receipts,templateRevision:template!.revision,accessFence:template!.accessFence,database:h.config.dbName,realMongoTransactions:true});
  });
  for(const action of ['createTemplate','listing'] as const)for(const order of ['adopt-first','stop-first'] as const)await t.test(`deep revoke versus ${action} / ${order}`,async()=>{
   const q=await f.formal();await f.share(q.qid,1);const g=await f.grant(q.qid,q.vid,1),fork=await f.fork(q.vid,1);assert.equal(fork.r.statusCode,201,fork.r.body);const sid=await f.source([fork.r.json().data.versionId],1);let tid='';
   if(action==='listing'){const x=await f.create(sid,1);assert.equal(x.r.statusCode,201,x.r.body);tid=x.r.json().data.resourceId;assert.equal((await f.state(tid,false,0,1)).statusCode,200);}
   const held=deferred(),release=deferred(),stopAtFence=deferred(),events:string[]=[];let used=false;
   const barrier=async(p:{action:string;questionId:string})=>{if(p.action===action&&p.questionId===q.qid&&!used){used=true;events.push('public-held');held.resolve();await release.promise;}};
   if(order==='adopt-first')faults.afterAccessFence=barrier;faults.beforeAccessFence=async p=>{if(order==='stop-first')await barrier(p);if(p.action==='distributionRevoke'&&p.questionId===q.qid)stopAtFence.resolve();};
   const before=await h.db.collection('survey_templates').countDocuments(),run=action==='createTemplate'?f.create(sid,1).then(x=>x.r):f.state(tid,true,1,1);let result:any;
   try{await bounded(held.promise);const stopping=f.revoke(q.qid,g);if(order==='adopt-first'){await bounded(stopAtFence.promise);release.resolve();result=await run;events.push('public-committed');await stopping;events.push('revoke-committed');}else{await stopping;events.push('revoke-committed');release.resolve();result=await run;events.push('public-rejected');}}
   finally{release.resolve();delete faults.beforeAccessFence;delete faults.afterAccessFence;}
   assert.equal(result.statusCode,order==='adopt-first'?(action==='createTemplate'?201:200):403,result.body);
   assert.equal(await h.db.collection('survey_templates').countDocuments(),before+(action==='createTemplate'&&order==='adopt-first'?1:0));if(action==='listing'){const stored=await h.db.collection('survey_templates').findOne({_id:new ObjectId(tid)});assert.equal(stored!.status,order==='adopt-first'?'listed':'unlisted');assert.equal(stored!.revision,order==='adopt-first'?2:1);}
   h.saveEvidence(`race-${action}-${order}`,{events,status:result.statusCode,upstreamQuestion:q.qid,realMongoTransactions:true});
  });
 }finally{await h.close();}
});
