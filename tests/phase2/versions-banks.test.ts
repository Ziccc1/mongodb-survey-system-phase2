import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ObjectId} from 'mongodb';
import {phase2Harness} from './harness.js';
import type {FaultHooks} from '../../apps/api/src/core/common.js';
import type {QuestionContent} from '@survey/shared';
test('W03 actual HTTP draft/version/restore/fork/bank contracts, CAS, rollback and pagination',async t=>{
 const faults:FaultHooks={},h=await phase2Harness('versions_banks',faults);let qid='',v1='',v2='',v3='',bank1='',bank2='';
 const content:QuestionContent={type:'number',title:'年龄😀',validation:{min:'0',max:'1.2e2',integerOnly:true}};
 try{
  await h.user();await h.user();
  await t.test('creation is draft only; all Content error categories and original no-op semantics',async()=>{
   const result=await h.createQuestion(content);qid=result.resourceId;assert.equal(result.versionId,null);assert.equal(await h.db.collection('question_versions').countDocuments(),0);
   let q=await h.getQuestion(qid);assert.equal(q.draft!.content.type,'number');assert.equal((q.draft!.content as typeof content).validation.max,'120');
   for(let i=1;i<=5;i++){const r=await h.request('PUT',`/questions/${qid}/draft`,{expectedRevision:q.revision,content:{...content,title:`年龄修改${i}`},baseVersionId:null});assert.equal(r.statusCode,200,r.body);q=r.json().data;}
   assert.equal(await h.db.collection('question_versions').countDocuments(),0);
   const no=await h.request('PUT',`/questions/${qid}/draft`,{expectedRevision:q.revision,content:q.draft!.content,baseVersionId:null});assert.equal(no.statusCode,200,no.body);assert.deepEqual(no.json().data,q);
   for(const [bad,status] of [[{...content,id:'forged'},400],[{...content,validation:{min:'NaN',integerOnly:true}},422],[{type:'single',title:'x',options:[{id:'x',label:'x'},{id:'x',label:'y'}]},422]] as const){const r=await h.request('POST','/questions',{content:bad},0,{'idempotency-key':randomUUID()});assert.equal(r.statusCode,status,r.body);}
   assert.equal((await h.request('GET',`/questions/${qid}/draft`,undefined,1)).statusCode,404);
  });
  await t.test('explicit formal save and original successful key replay after draft changes',async()=>{
   const saved=await h.saveVersion(qid);v1=saved.receipt.versionId!;
   const q=await h.getQuestion(qid);await h.request('PUT',`/questions/${qid}/draft`,{expectedRevision:q.revision,content:{...content,title:'第二正式内容'},baseVersionId:v1});
   const again=await h.request('POST',`/questions/${qid}/versions`,saved.body,0,{'idempotency-key':saved.key});assert.equal(again.statusCode,200,again.body);assert.deepEqual(again.json().data,{...saved.receipt,replayed:true});assert.equal(await h.db.collection('question_versions').countDocuments(),1);
   const conflict=await h.request('POST',`/questions/${qid}/versions`,{...saved.body,expectedRevision:99},0,{'idempotency-key':saved.key});assert.equal(conflict.statusCode,409);assert.equal(conflict.json().error.code,'OPERATION_IDEMPOTENCY_CONFLICT');
   v2=(await h.saveVersion(qid)).receipt.versionId!;
  });
  await t.test('arbitrary old parent; restore allocates a new version preserving draft and all middle history',async()=>{
   let q=await h.getQuestion(qid);await h.request('PUT',`/questions/${qid}/draft`,{expectedRevision:q.revision,content:{...content,title:'从v1编辑'},baseVersionId:v1});v3=(await h.saveVersion(qid)).receipt.versionId!;
   const v=await h.request('GET',`/questions/${qid}/versions/${v3}`);assert.equal(v.json().data.parentVersionId,v1);
   q=await h.getQuestion(qid);await h.request('PUT',`/questions/${qid}/draft`,{expectedRevision:q.revision,content:{...content,title:'未正式保存的编辑'},baseVersionId:v2});q=await h.getQuestion(qid);
   const before=q.draft,key=randomUUID(),body={expectedRevision:q.revision,sourceVersionId:v1};const r=await h.request('POST',`/questions/${qid}/restorations`,body,0,{'idempotency-key':key});assert.equal(r.statusCode,201,r.body);
   const restored=await h.request('GET',`/questions/${qid}/versions/${r.json().data.versionId}`);assert.equal(restored.json().data.version,4);assert.equal(restored.json().data.parentVersionId,v1);assert.equal(restored.json().data.restoredFromVersionId,v1);assert.deepEqual((await h.getQuestion(qid)).draft,before);
   assert.equal(await h.db.collection('question_versions').countDocuments(),4);
  });
  await t.test('different keys same revision one success/one CAS conflict; same key one immutable effect; rollback',async()=>{
   let q=await h.getQuestion(qid),body={expectedRevision:q.revision,expectedDraftRevision:q.draft!.revision};
   const pair=await Promise.all([randomUUID(),randomUUID()].map(key=>h.request('POST',`/questions/${qid}/versions`,body,0,{'idempotency-key':key})));assert.deepEqual(pair.map(r=>r.statusCode).sort(),[201,409]);
   q=await h.getQuestion(qid);body={expectedRevision:q.revision,expectedDraftRevision:q.draft!.revision};const key=randomUUID(),before=await h.db.collection('question_versions').countDocuments();
   const same=await Promise.all([1,2].map(()=>h.request('POST',`/questions/${qid}/versions`,body,0,{'idempotency-key':key})));assert.deepEqual(same.map(r=>r.statusCode).sort(),[200,201]);assert.equal(same[0].json().data.versionId,same[1].json().data.versionId);assert.equal(await h.db.collection('question_versions').countDocuments(),before+1);
   const fingerprint=await h.fingerprint();faults.afterQuestionVersionInsert=()=>{throw Error('injected version insert failure');};q=await h.getQuestion(qid);
   const fail=await h.request('POST',`/questions/${qid}/versions`,{expectedRevision:q.revision,expectedDraftRevision:q.draft!.revision},0,{'idempotency-key':randomUUID()});assert.equal(fail.statusCode,500,fail.body);assert.equal(await h.fingerprint(),fingerprint);delete faults.afterQuestionVersionInsert;
   h.saveEvidence('version-concurrency',{differentKeys:pair.map(r=>({status:r.statusCode,body:r.json()})),sameKey:same.map(r=>({status:r.statusCode,body:r.json()})),rollbackFingerprint:fingerprint});
  });
  await t.test('fork exact immutable source, future save/restore retains distribution obligations',async()=>{
   const r=await h.request('POST',`/question-versions/${v1}/forks`,{content},0,{'idempotency-key':randomUUID()});assert.equal(r.statusCode,201,r.body);const fork=r.json().data;
   const item=await h.db.collection('question_items').findOne({_id:new ObjectId(fork.resourceId)});assert.equal(item!.origin.sourceVersionId.toHexString(),v1);
   const f1=await h.db.collection('question_versions').findOne({_id:new ObjectId(fork.versionId)});assert.equal(f1!.parentVersionId,null);assert.equal(f1!.distributionSource.sourceVersionId.toHexString(),v1);
   const f2=(await h.saveVersion(fork.resourceId)).receipt;const q=await h.getQuestion(fork.resourceId);const restored=await h.request('POST',`/questions/${fork.resourceId}/restorations`,{expectedRevision:q.revision,sourceVersionId:fork.versionId},0,{'idempotency-key':randomUUID()});assert.equal(restored.statusCode,201);
   const all=await h.db.collection('question_versions').find({questionId:new ObjectId(fork.resourceId)}).toArray();assert.ok(all.every(v=>v.distributionSource.kind==='derived'&&v.distributionSource.sourceVersionId.toHexString()===v1));
  });
  await t.test('multi-bank identity, renaming, member removal, deletion tombstone and real deletion/member race',async()=>{
   for(let i=0;i<2;i++){const r=await h.request('POST','/question-banks',{name:`题库${i}`},0,{'idempotency-key':randomUUID()});assert.equal(r.statusCode,201,r.body);if(!i)bank1=r.json().data.resourceId;else bank2=r.json().data.resourceId;}
   for(const bank of [bank1,bank2])assert.equal((await h.request('PUT',`/question-banks/${bank}/members/${qid}`,{expectedRevision:0,present:true})).statusCode,200);
   assert.equal(await h.db.collection('question_bank_members').countDocuments({questionId:new ObjectId(qid)}),2);
   let r=await h.request('PATCH',`/question-banks/${bank1}`,{expectedRevision:1,name:'改名题库'});assert.equal(r.statusCode,200,r.body);
   r=await h.request('PUT',`/question-banks/${bank1}/members/${qid}`,{expectedRevision:2,present:false});assert.equal(r.statusCode,200,r.body);
   const another=(await h.createQuestion({type:'text',title:'另一题',validation:{}})).resourceId;
   let arrived!:()=>void,release!:()=>void;const paused=new Promise<void>(r=>arrived=r),gate=new Promise<void>(r=>release=r);let used=false;
   faults.afterBankRead=async p=>{if(p.bankId===bank2&&p.action==='member'&&!used){used=true;arrived();await gate;}};
   const member=h.request('PUT',`/question-banks/${bank2}/members/${another}`,{expectedRevision:1,present:true});await paused;
   const deletion=await h.request('POST',`/question-banks/${bank2}/deletion`,{expectedRevision:1});assert.equal(deletion.statusCode,200,deletion.body);release();const race=await member;assert.ok([404,409].includes(race.statusCode),race.body);delete faults.afterBankRead;
   assert.equal((await h.request('GET',`/question-banks/${bank2}/members`)).statusCode,404);assert.equal(await h.db.collection('question_items').countDocuments({_id:new ObjectId(qid)}),1);assert.equal(await h.db.collection('question_bank_members').countDocuments({bankId:new ObjectId(bank2),questionId:new ObjectId(another)}),0);
   h.saveEvidence('bank-race',{deletionStatus:deletion.statusCode,memberStatus:race.statusCode,deletedBankMembersUnreadable:true,questionPreserved:true});
  });
  await t.test('query/method/body security, signed cursors bind actor and resource',async()=>{
   const p=await h.request('GET',`/questions/${qid}/versions?limit=1`);assert.equal(p.statusCode,200,p.body);const cursor=p.json().data.nextCursor;assert.ok(cursor);
   const next=await h.request('GET',`/questions/${qid}/versions?limit=1&cursor=${encodeURIComponent(cursor)}`);assert.equal(next.statusCode,200,next.body);assert.notEqual(p.json().data.items[0].id,next.json().data.items[0].id);
   assert.equal((await h.request('GET',`/questions/${qid}/versions?limit=1&limit=2`)).statusCode,400);
   assert.equal((await h.request('GET','/questions?unknown=true')).statusCode,400);
   const wrong=await h.request('DELETE',`/questions/${qid}/draft`);assert.equal(wrong.statusCode,405);assert.equal(wrong.headers.allow,'GET, PUT');
   assert.equal((await h.request('POST','/questions',{content},-1,{'idempotency-key':randomUUID()})).statusCode,401);
   assert.equal((await h.request('POST','/questions',{content},0,{'idempotency-key':randomUUID(),origin:'http://untrusted.invalid'})).statusCode,403);
   const other=(await h.createQuestion(content)).resourceId;assert.equal((await h.request('GET',`/questions/${other}/versions?cursor=${encodeURIComponent(cursor)}`)).statusCode,400);
  });
 }finally{await h.close();}
});
