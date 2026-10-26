import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {phase2Harness} from './harness.js';
import {templateFixture} from './template-fixture.js';

test('acceptance: named actor × retained-right state × operation permission matrix',async t=>{
 const h=await phase2Harness('accept_matrix'),f=templateFixture(h),matrix:unknown[]=[];
 try{
  for(let i=0;i<4;i++)await h.user();
  const q=await f.formal(0,{type:'number',title:'权限矩阵数字',validation:{integerOnly:false}}),v2=(await h.saveVersion(q.qid)).receipt.versionId!;
  await f.share(q.qid,1);const revoked=await f.share(q.qid,2),sharedSurvey=await f.source([q.vid],2),grant=await f.grant(q.qid,q.vid,1),source=await f.source([q.vid],1),made=await f.create(source,1);assert.equal(made.r.statusCode,201,made.r.body);
  const tid=made.r.json().data.resourceId,adopt=await f.adopt(tid,3);assert.equal(adopt.r.statusCode,201,adopt.r.body);const narrowSurvey=adopt.r.json().data.surveyId;await f.publish(narrowSurvey,3);
  const item=await h.getQuestion(q.qid);assert.equal((await h.request('POST',`/questions/${q.qid}/shares/${revoked.id}/revocation`,{expectedRevision:item.revision,expectedGrantRevision:revoked.revision})).statusCode,200);
  const actors=[{who:0,name:'owner',history:200,write:201,attach:200,summary:200,future:200},{who:1,name:'active-share',history:200,write:404,attach:200,summary:200,future:200},{who:2,name:'revoked-retained',history:404,write:404,attach:409,summary:200,future:404},{who:3,name:'template-narrow',history:404,write:404,attach:404,summary:200,future:404},{who:4,name:'unrelated',history:404,write:404,attach:404,summary:404,future:404}];
  for(const a of actors)await t.test(a.name,async()=>{
   const rows:any[]=[];
   async function check(operation:string,method:'GET'|'POST',path:string,expected:number,body?:object){const r=await h.request(method,path,body,a.who,{'idempotency-key':randomUUID()}),row={actor:a.name,operation,expected,actual:r.statusCode,code:r.json().error?.code??null};rows.push(row);matrix.push(row);assert.equal(r.statusCode,expected,JSON.stringify({...row,body:r.json()}));}
   const own=await h.getQuestion(q.qid),draft=await f.draft(a.who);
   await check('history','GET',`/questions/${q.qid}/versions`,a.history);
   await check('private-draft','GET',`/questions/${q.qid}/draft`,a.who===0?200:404);
   await check('save-version','POST',`/questions/${q.qid}/versions`,a.write,{expectedRevision:own.revision,expectedDraftRevision:own.draft!.revision});
   await check('new-reference','POST',`/surveys/${draft}/question-references`,a.attach,{expectedRevision:0,position:0,questionVersionId:q.vid});
   await check('general-fork','POST',`/question-versions/${q.vid}/forks`,a.who<2?201:a.who===2?409:404,{content:q.content});
   for(const suffix of ['','/answers','/distribution'])await check('fixed-statistics'+suffix,'GET',`/question-statistics/${q.qid}/versions/${q.vid}${suffix}`,a.summary);
   await check('unacquired-version-statistics','GET',`/question-statistics/${q.qid}/versions/${v2}`,a.future);
   await check('other-owner-statistics','GET',`/surveys/${a.who===2?narrowSurvey:sharedSurvey}/statistics`,404);
   // Ordinary share and template preview do not transfer source management or public distribution rights.
   await check('source-management','GET',`/surveys/${source}`,a.who===1?200:404);
   if(a.who>=2){const before=await h.fingerprint();await check('template-redistribution','POST','/templates',a.who===4?404:403,{surveyId:a.who===2?sharedSurvey:narrowSurvey,publishedVersion:1,expectedSurveyRevision:(await h.getSurvey(a.who===2?sharedSurvey:narrowSurvey,a.who===2?2:3)).revision});assert.equal(await h.fingerprint(),before);}
   h.saveEvidence('permission-'+a.name,rows);
  });
  await f.revoke(q.qid,grant);const before=await h.fingerprint();for(const who of [2,3,4]){const x=await f.adopt(tid,who);matrix.push({actor:actors[who].name,operation:'adopt-after-distribution-revocation',expected:403,actual:x.r.statusCode});assert.equal(x.r.statusCode,403,x.r.body);}assert.equal(await h.fingerprint(),before);
  // An unreadable reference in an otherwise readable survey never grants access to the question library.
  assert.equal((await h.request('GET',`/questions/${q.qid}/usage`,undefined,3)).statusCode,404);
 }finally{h.saveEvidence('matrix',matrix);await h.close();}
});
