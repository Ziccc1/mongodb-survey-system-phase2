import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {phase2Harness} from './harness.js';
import type {Question,Answer} from '@survey/shared';
import type {FaultHooks} from '../../apps/api/src/core/common.js';
const questions:Question[]=[{id:'s',type:'single',title:'单选',required:true,options:[{id:'yes',label:'是'},{id:'no',label:'否'},{id:'zero',label:'零次'}],jumpRules:[]},{id:'m',type:'multiple',title:'多选',required:false,options:[{id:'a',label:'A'},{id:'b',label:'B'},{id:'c',label:'C'}],validation:{},jumpRules:[]},{id:'t',type:'text',title:'文字',required:false,validation:{},jumpRules:[]},{id:'n',type:'number',title:'数字',required:false,validation:{integerOnly:false},jumpRules:[]}];
test('thirteen-collection equivalent regression of six original feature categories',async t=>{
 const faults:FaultHooks={},h=await phase2Harness('compatibility',faults);let id='',publicId='',receiptId='';
 async function create(qs:Question[],settings:Record<string,unknown>={}){
  const r=await h.request('POST','/surveys',{title:'十三集合原功能回归',allowAnonymous:true,allowRepeat:true,...settings});assert.equal(r.statusCode,201,r.body);const id=r.json().data.id;
  let s=await h.getSurvey(id);const saved=await h.request('PUT',`/surveys/${id}/questions`,{expectedRevision:s.revision,questions:qs});assert.equal(saved.statusCode,200,saved.body);
  for(const q of qs){s=await h.getSurvey(id);const formal=await h.request('POST',`/surveys/${id}/questions/${q.id}/formalization`,{expectedRevision:s.revision},0,{'idempotency-key':randomUUID()});assert.equal(formal.statusCode,200,formal.body);}
  return h.getSurvey(id);
 }
 async function publish(id:string){const s=await h.getSurvey(id),r=await h.request('POST',`/surveys/${id}/publish`,{expectedRevision:s.revision,expectedDraftDefinitionVersion:s.draftDefinitionRevision},0,{'publication-key':randomUUID()});assert.equal(r.statusCode,201,r.body);return r;}
 async function submit(pid:string,answers:Answer[],who=1,key=randomUUID(),version=1,anonymous=true){return h.request('POST',`/public/surveys/${pid}/responses`,{publishedVersion:version,anonymous,answers},who,{'idempotency-key':key});}
 try{
  await h.user();await h.user();
  await t.test('create/edit/formalization/publish retain stable IDs and zero-response old statistics',async()=>{
   const s=await create(questions);id=s.id;publicId=s.publicId;await publish(id);const r=await h.request('GET',`/surveys/${id}/statistics`);assert.equal(r.statusCode,200,r.body);assert.equal(r.json().data.selectedVersionResponseCount,0);assert.equal(r.json().data.questionSummaries[3].average,null);assert.deepEqual(r.json().data.questionSummaries[0].optionCounts.map((o:{count:number})=>o.count),[0,0,0]);
   const current=await h.getSurvey(id);assert.equal(current.publicId,publicId);assert.equal(current.hasUnpublishedChanges,false);assert.equal(current.status,'published');
  });
  await t.test('original 3-response hand-calculated single/multiple/text/numeric results, zero and anonymous whitelists',async()=>{
   const rows:Answer[][]=[[{questionId:'s',type:'single',optionId:'yes'},{questionId:'m',type:'multiple',optionIds:['a','b']},{questionId:'t',type:'text',text:'第一条'},{questionId:'n',type:'number',number:'0'}],[{questionId:'s',type:'single',optionId:'yes'},{questionId:'m',type:'multiple',optionIds:['b']},{questionId:'t',type:'text',text:'第二条'},{questionId:'n',type:'number',number:'1e1'}],[{questionId:'s',type:'single',optionId:'no'},{questionId:'m',type:'multiple',optionIds:['a']}]];
   for(const answers of rows){const r=await submit(publicId,answers);assert.equal(r.statusCode,201,r.body);receiptId||=r.json().data.receiptId;}
   const r=await h.request('GET',`/surveys/${id}/statistics`),data=r.json().data;assert.equal(data.cumulativeResponseCount,3);assert.equal(data.currentVersionResponseCount,3);assert.equal(data.selectedVersionResponseCount,3);assert.deepEqual(data.questionSummaries[0].optionCounts.map((o:{count:number})=>o.count),[2,1,0]);assert.deepEqual(data.questionSummaries[1].optionCounts.map((o:{count:number})=>o.count),[2,2,0]);assert.equal(data.questionSummaries[2].answeredCount,2);assert.equal(data.questionSummaries[3].average,'5');
   const history=await h.request('GET',`/surveys/${id}/responses/${receiptId}`);assert.equal(history.json().data.answers.find((a:Answer)=>a.type==='number').number,'0');assert.ok(!/(respondentId|requestId|payloadHash|username|ownerId|publishedBy|publicationRequest|schemaVersion)/.test(history.body));h.saveEvidence('hand-calculated-statistics',data);
  });
  await t.test('original per-version/history/raw pagination and scoped cursors remain isolated',async()=>{
   let r=await h.request('GET',`/surveys/${id}/questions/t/answers?version=1&limit=1`);assert.equal(r.statusCode,200,r.body);const cursor=r.json().data.nextCursor;assert.ok(cursor);const next=await h.request('GET',`/surveys/${id}/questions/t/answers?version=1&limit=1&cursor=${encodeURIComponent(cursor)}`);assert.equal(next.statusCode,200,next.body);assert.notEqual(r.json().data.items[0].responseId,next.json().data.items[0].responseId);
   assert.equal((await h.request('GET',`/surveys/${id}/questions/n/answers?version=1&cursor=${encodeURIComponent(cursor)}`)).statusCode,400);assert.equal((await h.request('GET',`/surveys/${id}/questions/t/answers?cursor=${encodeURIComponent(cursor)}`)).statusCode,400);
   for(const path of [`/surveys/${id}`,`/surveys/${id}/versions/1`,`/surveys/${id}/statistics`,`/surveys/${id}/responses`,`/surveys/${id}/responses/${receiptId}`])assert.equal((await h.request('GET',path,undefined,1)).statusCode,404);
   const s=await h.getSurvey(id);await h.request('POST',`/surveys/${id}/pause`,{expectedRevision:s.revision});await publish(id);r=await h.request('GET',`/surveys/${id}/statistics`);assert.equal(r.json().data.selectedVersion,2);assert.equal(r.json().data.cumulativeResponseCount,3);assert.equal(r.json().data.currentVersionResponseCount,0);assert.equal(r.json().data.selectedVersionResponseCount,0);assert.equal((await h.request('GET',`/surveys/${id}/statistics?version=1`)).json().data.selectedVersionResponseCount,3);
  });
  await t.test('same-key concurrent submissions, true repeats, rollback and old-key replay after pause/close',async()=>{
   const answers:Answer[]=[{questionId:'s',type:'single',optionId:'yes'},{questionId:'n',type:'number',number:'-1.25'}],key=randomUUID(),before=await h.db.collection('responses').countDocuments(),pair=await Promise.all([submit(publicId,answers,1,key,2),submit(publicId,answers,1,key,2)]);assert.deepEqual(pair.map(r=>r.statusCode).sort(),[200,201]);assert.equal(await h.db.collection('responses').countDocuments(),before+1);
   assert.equal((await submit(publicId,answers,1,key,2,false)).statusCode,409);assert.equal((await submit(publicId,answers,1,randomUUID(),2)).statusCode,201);
   const fingerprint=await h.fingerprint();faults.afterResponseInsert=()=>{throw Error('injected response insert failure');};assert.equal((await submit(publicId,answers,1,randomUUID(),2)).statusCode,500);assert.equal(await h.fingerprint(),fingerprint);delete faults.afterResponseInsert;
   let s=await h.getSurvey(id);await h.request('POST',`/surveys/${id}/pause`,{expectedRevision:s.revision});assert.equal((await submit(publicId,answers,1,randomUUID(),2)).json().error.code,'SURVEY_PAUSED');s=await h.getSurvey(id);await h.request('POST',`/surveys/${id}/close`,{expectedRevision:s.revision});assert.equal((await submit(publicId,answers,1,key,2)).statusCode,200);assert.equal((await submit(publicId,answers,1,randomUUID(),2)).json().error.code,'SURVEY_CLOSED');assert.equal((await h.request('POST',`/surveys/${id}/pause`,{expectedRevision:(await h.getSurvey(id)).revision})).statusCode,409);
  });
  await t.test('server forward jumps, required skipped inputs, exact choices/Unicode/Decimal limits, no-write failures',async()=>{
   const qs:Question[]=[{id:'s',type:'single',title:'分支',required:true,options:[{id:'go',label:'跳转'},{id:'stay',label:'继续'}],jumpRules:[{id:'jump',condition:{op:'eq',optionId:'go'},targetQuestionId:'n'}]},{id:'m',type:'multiple',title:'恰好两选',required:true,options:[{id:'a',label:'甲'},{id:'b',label:'乙'},{id:'c',label:'丙'}],validation:{minChoices:2,maxChoices:2},jumpRules:[]},{id:'t',type:'text',title:'两个字符',required:true,validation:{minLength:2,maxLength:2},jumpRules:[]},{id:'n',type:'number',title:'精确数字',required:true,validation:{min:'-120',max:'120',integerOnly:false},jumpRules:[]}],s=await create(qs);await publish(s.id);
   const good:Answer[]=[{questionId:'s',type:'single',optionId:'stay'},{questionId:'m',type:'multiple',optionIds:['a','b']},{questionId:'t',type:'text',text:'😀汉'},{questionId:'n',type:'number',number:'-1.25'}];assert.equal((await submit(s.publicId,good)).statusCode,201);
   for(const answers of [[{questionId:'s',type:'single',optionId:'go'},{questionId:'n',type:'number',number:'0'}],[{questionId:'s',type:'single',optionId:'go'},{questionId:'n',type:'number',number:'1.2e2'}]] as Answer[][])assert.equal((await submit(s.publicId,answers)).statusCode,201);
   for(const bad of [good.map(a=>a.type==='multiple'?{...a,optionIds:['a']}:a),good.map(a=>a.type==='text'?{...a,text:'😀汉字'}:a),good.map(a=>a.type==='number'?{...a,number:'121'}:a),good.map(a=>a.type==='number'?{...a,number:'NaN'}:a)]){const before=await h.fingerprint(),r=await submit(s.publicId,bad);assert.equal(r.statusCode,422,r.body);assert.equal(await h.fingerprint(),before);}
   const latest=await h.db.collection('responses').findOne({surveyId:(await h.db.collection('surveys').findOne({publicId:s.publicId}))!._id,'answers.number':{$exists:true}});assert.ok(latest!.answers.find((a:{number?:unknown})=>a.number)?.number);
  });
  await t.test('policy freezing, no-repeat, expiry, method/media/duplicate JSON and survey pagination',async()=>{
   const s=await create([{id:'n',type:'number',title:'整数',required:true,validation:{integerOnly:true},jumpRules:[]}],{allowRepeat:false,allowAnonymous:false});await publish(s.id);
   assert.equal((await submit(s.publicId,[{questionId:'n',type:'number',number:'1.25'}],1,randomUUID(),1,false)).statusCode,422);assert.equal((await submit(s.publicId,[{questionId:'n',type:'number',number:'0'}],1,randomUUID(),1,true)).statusCode,422);
   assert.equal((await submit(s.publicId,[{questionId:'n',type:'number',number:'13800138000'}],1,randomUUID(),1,false)).statusCode,201);assert.equal((await submit(s.publicId,[{questionId:'n',type:'number',number:'0'}],1,randomUUID(),1,false)).json().error.code,'ALREADY_SUBMITTED');
   let current=await h.getSurvey(s.id);assert.equal((await h.request('PATCH',`/surveys/${s.id}`,{expectedRevision:current.revision,allowAnonymous:true})).json().error.code,'POLICY_LOCKED');assert.equal((await h.request('PATCH',`/surveys/${s.id}`,{expectedRevision:current.revision,expiresAt:'2000-01-01T00:00:00.000Z'})).statusCode,200);assert.equal((await submit(s.publicId,[{questionId:'n',type:'number',number:'0'}],2,randomUUID(),1,false)).json().error.code,'SURVEY_EXPIRED');
   const one=await h.request('GET','/surveys?limit=1'),cursor=one.json().data.nextCursor;assert.ok(cursor);assert.equal((await h.request('GET',`/surveys?limit=1&cursor=${encodeURIComponent(cursor)}`,undefined,1)).statusCode,400);assert.equal((await h.request('GET',`/surveys?limit=1&cursor=${encodeURIComponent(cursor)}`)).statusCode,200);
   assert.equal((await h.request('POST','/questions','{"content":{"type":"text","title":"one","title":"two","validation":{}}}',0,{'idempotency-key':randomUUID(),'content-type':'application/json'})).statusCode,400);
   assert.equal((await h.request('POST','/questions','<xml/>',0,{'content-type':'application/xml','idempotency-key':randomUUID()})).statusCode,415);
  });
 }finally{await h.close();}
});
