import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {request as nodeRequest,Agent} from 'node:http';
import {ObjectId} from 'mongodb';
import type {QuestionContent} from '@survey/shared';
import {phase2Harness} from './harness.js';
import {templateFixture} from './template-fixture.js';
import {assertPortsFree,assertListenersOwned} from '../runtime-listeners.js';

test('acceptance: 36 API-created surveys, 2160 real HTTP submissions, 12 workers and independent four-type oracles',async()=>{
 const port=3234,origin=`http://localhost:${port}`,h=await phase2Harness('accept_scale',{},origin),f=templateFixture(h),timings:{operation:string;ms:number;status:number}[]=[],started=performance.now(),agents=Array.from({length:28},(_,who)=>new Agent({keepAlive:true,localAddress:`127.0.0.${100+who}`,maxSockets:4}));
 const contents:QuestionContent[]=[{type:'number',title:'规模数字',validation:{integerOnly:true}},{type:'text',title:'规模文本😀',validation:{}},{type:'single',title:'规模单选',options:[{id:'a',label:'甲'},{id:'b',label:'乙'},{id:'c',label:'未选'}]},{type:'multiple',title:'规模多选',options:[{id:'a',label:'甲'},{id:'b',label:'乙'},{id:'c',label:'未选'}],validation:{}}];
 async function http(path:string,who:number,body?:object,key=randomUUID()){
  const start=performance.now(),payload=body?JSON.stringify(body):undefined;
  const r=await new Promise<{status:number;json:any}>((resolve,reject)=>{const req=nodeRequest({host:'127.0.0.1',port,path:'/api/v1'+path,method:body?'POST':'GET',agent:agents[who],headers:{cookie:h.cookies[who],origin,'x-csrf-guard':'1','content-type':'application/json','idempotency-key':key,...payload?{'content-length':Buffer.byteLength(payload)}:{}}},res=>{const chunks:Buffer[]=[];res.on('data',c=>chunks.push(c));res.on('error',reject);res.on('end',()=>{try{resolve({status:res.statusCode!,json:JSON.parse(Buffer.concat(chunks).toString('utf8'))});}catch(e){reject(e);}});});req.on('error',reject);req.setTimeout(60000,()=>req.destroy(Error('HTTP test timeout')));req.end(payload);});
  timings.push({operation:body?'submit':path.startsWith('/public/')?'rate-probe':path.includes('/answers')?'page':path.includes('/distribution')?'distribution':'summary',ms:performance.now()-start,status:r.status});return r;
 }
 const surveys:{id:string;owner:number;publicId:string;ids:string[]}[]=[],versions:Awaited<ReturnType<typeof f.formal>>[]=[],sent:{path:string;who:number;body:object;key:string;receiptId:string}[]=[];
 try{
  assertPortsFree([port]);for(let i=1;i<28;i++)await h.user();await h.app.listen({host:'127.0.0.1',port});assertListenersOwned([{port,pid:process.pid}]);
  for(const c of contents){const v=await f.formal(0,c);versions.push(v);await f.share(v.qid,1);await f.share(v.qid,2);}
  for(let owner=0;owner<3;owner++)for(let n=0;n<12;n++){const id=await f.draft(owner,`规模验证-${owner}-${n}`);for(const v of versions)await f.attach(id,v.vid,owner);await f.publish(id,owner);const e=await h.getSurvey(id,owner);surveys.push({id,owner,publicId:e.publicId,ids:e.draftDefinition.questions.map(q=>q.id)});}
  console.log('Scale setup: 36 surveys created/attached/published through normal APIs; starting 2160 real HTTP submissions, concurrency 12.');
  const setupMs=performance.now()-started,submitStart=performance.now(),jobs=surveys.flatMap(s=>Array.from({length:60},(_,i)=>({s,i})));let next=0,active=0,maxActive=0;
  let failed=false;const workers=await Promise.allSettled(Array.from({length:12},async()=>{while(!failed&&next<jobs.length){const job=next++,{s,i}=jobs[job],who=3+job%24,key=randomUUID(),answers:any[]=[{questionId:s.ids[2],type:'single',optionId:i%2?'b':'a'},{questionId:s.ids[3],type:'multiple',optionIds:i%2?['b']:['a','b']}];if(i%10!==9)answers.push({questionId:s.ids[0],type:'number',number:String(i%10-5+s.owner*100)});if(i%3===0)answers.push({questionId:s.ids[1],type:'text',text:`😀汉-${s.id}-${i}`});const body={publishedVersion:1,anonymous:true,answers},path=`/public/surveys/${s.publicId}/responses`;active++;maxActive=Math.max(maxActive,active);try{const r=await http(path,who,body,key);assert.equal(r.status,201,JSON.stringify({survey:s.id,i,...r}));sent.push({path,who,body,key,receiptId:r.json.data.receiptId});}catch(e){failed=true;throw e;}finally{active--;}}}));for(const worker of workers)if(worker.status==='rejected')throw worker.reason;
  const submitMs=performance.now()-submitStart;assert.equal(sent.length,2160);assert.equal(maxActive,12);assert.equal(new Set(sent.map(x=>x.receiptId)).size,2160);assert.equal(await h.db.collection('responses').countDocuments(),2160);
  for(const s of surveys){const stored=await h.db.collection('surveys').findOne({_id:new ObjectId(s.id)});assert.equal(Number(stored!.submissionCount),60);assert.equal(Number(stored!.currentVersionSubmissionCount),60);}
  // Repeat real successful requests using the original keys: each returns its original receipt without writes.
  const before=await h.fingerprint();for(const x of sent.slice(0,12)){const r=await http(x.path,x.who,x.body,x.key);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.json.data.receiptId,x.receiptId);assert.equal(r.json.data.replayed,true);}assert.equal(await h.fingerprint(),before);
  const queryStart=performance.now(),oracles:unknown[]=[];
  for(let owner=0;owner<3;owner++){
   const base=(i:number)=>`/question-statistics/${versions[i].qid}/versions/${versions[i].vid}`,offset=owner*100,number=await http(base(0)+`?boundaries=${offset-5},${offset},${offset+5}`,owner);assert.equal(number.status,200,JSON.stringify(number));const n=number.json.data;
   assert.deepEqual([n.surveyCount,n.eligibleResponseCount,n.answeredCount,n.unansweredCount,n.skippedCount,n.average,n.min,n.max],[12,720,648,72,0,String(offset-1),String(offset-5),String(offset+3)]);assert.deepEqual(n.bins.map((b:any)=>b.count),[0,360,288,0]);
   const text=await http(base(1),owner);assert.equal(text.status,200);assert.deepEqual([text.json.data.answeredCount,text.json.data.unansweredCount],[240,480]);
   for(const [i,counts] of [[2,[360,360,0]],[3,[360,720,0]]] as const){const r=await http(base(i),owner);assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.json.data.answeredCount,720);assert.deepEqual(r.json.data.optionCounts.map((x:any)=>x.count),counts);}
   const items:any[]=[];let cursor:string|null=null;do{const r=await http(base(0)+'/answers?limit=73'+(cursor?'&cursor='+encodeURIComponent(cursor):''),owner);assert.equal(r.status,200,JSON.stringify(r));items.push(...r.json.data.items);cursor=r.json.data.nextCursor;}while(cursor);
   assert.equal(items.length,648);assert.equal(new Set(items.map(x=>x.responseId+':'+x.instanceId)).size,648);const expectedSurveys=new Set(surveys.filter(s=>s.owner===owner).map(s=>s.id));assert.ok(items.every(x=>expectedSurveys.has(x.surveyId)));assert.deepEqual(new Set(items.map(x=>x.responseId)),new Set((await h.db.collection('responses').find({surveyId:{$in:[...expectedSurveys].map(id=>new ObjectId(id))},'answers.type':'number'}).project({_id:1}).toArray()).map(x=>x._id.toHexString())));
   const distribution=await http(base(0)+'/distribution?limit=100',owner);assert.equal(distribution.status,200);assert.deepEqual(distribution.json.data.items,Array.from({length:9},(_,i)=>({value:String(offset+i-5),count:72})));assert.equal(distribution.json.data.nextCursor,null);
   const textItems:any[]=[];cursor=null;do{const r=await http(base(1)+'/answers?limit=73'+(cursor?'&cursor='+encodeURIComponent(cursor):''),owner);assert.equal(r.status,200,JSON.stringify(r));textItems.push(...r.json.data.items);cursor=r.json.data.nextCursor;}while(cursor);assert.equal(textItems.length,240);assert.equal(new Set(textItems.map(x=>x.value)).size,240);assert.ok(textItems.every(x=>expectedSurveys.has(x.surveyId)));
   const foreign=surveys.find(s=>s.owner!==owner)!;assert.equal((await http(base(0)+'?surveyIds='+foreign.id,owner)).status,404);oracles.push({owner,number:n,text:text.json.data,answerPages:items.length,textPages:textItems.length,allIdsMatchDatabase:true});
  }
  assert.equal(await h.fingerprint(),before);
  // Keep the production limiter enabled. One additional real source IP deliberately exceeds its route window.
  for(let i=0;i<180;i++){const r=await http(`/public/surveys/${surveys[0].publicId}`,27);assert.equal(r.status,200,JSON.stringify({rateProbe:i,...r}));}const limited=await http(`/public/surveys/${surveys[0].publicId}`,27);assert.equal(limited.status,429);assert.equal(limited.json.error.code,'RATE_LIMITED');assert.equal(await h.fingerprint(),before);
  function report(kind:string){const xs=timings.filter(t=>t.operation===kind).map(t=>t.ms).sort((a,b)=>a-b);return {requests:xs.length,p50Ms:xs[Math.floor(xs.length*.5)]??null,p95Ms:xs[Math.min(xs.length-1,Math.ceil(xs.length*.95)-1)]??null,maxMs:xs.at(-1)??null};}
  h.saveEvidence('scale-result',{scope:'local single-node MongoDB, real HTTP, no injected faults, no production throughput claim',surveys:36,actors:28,respondents:24,rateProbeActor:1,sourceIPs:'one actual loopback source address per actor, 127.0.0.100—127.0.0.127; no spoofed forwarding header; original limiter unchanged',rateProbe:{allowed:180,nextStatus:429,code:'RATE_LIMITED'},submissions:2160,workers:12,maxActive,setupMs,submitMs,queryMs:performance.now()-queryStart,totalMs:performance.now()-started,statuses:timings.reduce((out:Record<string,number>,x)=>(out[x.status]=(out[x.status]??0)+1,out),{}),latency:['submit','summary','page','distribution'].map(operation=>({operation,...report(operation)})),oracles,successfulReplayCount:12,readsAndReplaysUnchanged:true});
  console.log('Scale passed: 2160 real HTTP writes, exact per-survey counters, three isolated four-type oracles, complete pagination and 12 unchanged replays.');
 }finally{h.saveEvidence('request-timings',timings);for(const agent of agents)agent.destroy();await h.close();}
});
