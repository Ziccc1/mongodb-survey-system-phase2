import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {ObjectId,Collection} from 'mongodb';
import {phase2Harness} from './harness.js';
import type {FaultHooks} from '../../apps/api/src/core/common.js';
import type {Question,QuestionContent} from '@survey/shared';
const numeric:QuestionContent={type:'number',title:'共享年龄😀',validation:{min:'-10',max:'120',integerOnly:false}};
test('W04 real source APIs / sharing fences / retained rights / publication / usage privacy',async t=>{
 const faults:FaultHooks={},h=await phase2Harness('surveys_sharing_usage',faults);let qid='',v1='',v2='',v3='',sid='',instanceId='',grantId='',bankId='',savedAttach:{body:unknown;key:string;data:unknown}|null=null,oldPublication:{body:unknown;key:string;data:unknown}|null=null;
 async function draft(who=0){const r=await h.request('POST','/surveys',{title:`私有问卷-${who}-${randomUUID().slice(0,4)}`,allowAnonymous:true,allowRepeat:true},who);assert.equal(r.statusCode,201,r.body);return r.json().data;}
 async function publish(id:string,who=0){const s=await h.getSurvey(id,who),body={expectedRevision:s.revision,expectedDraftDefinitionVersion:s.draftDefinitionRevision},key=randomUUID(),r=await h.request('POST',`/surveys/${id}/publish`,body,who,{'publication-key':key});assert.equal(r.statusCode,201,r.body);return {body,key,data:r.json().data};}
 async function pause(id:string,who=0){const s=await h.getSurvey(id,who),r=await h.request('POST',`/surveys/${id}/pause`,{expectedRevision:s.revision},who);assert.equal(r.statusCode,200,r.body);}
 async function attach(id:string,version:string,who=0,extra:Record<string,unknown>={}){const s=await h.getSurvey(id,who),body={expectedRevision:s.revision,questionVersionId:version,position:s.draftDefinition.questions.length,...extra},key=randomUUID(),r=await h.request('POST',`/surveys/${id}/question-references`,body,who,{'idempotency-key':key});return {r,body,key};}
 async function grant(q:string,who:number){const item=await h.getQuestion(q),r=await h.request('PUT',`/questions/${q}/shares`,{username:h.usernames[who],expectedRevision:item.revision,expectedGrantRevision:null});assert.equal(r.statusCode,200,r.body);return r.json().data;}
 async function revoke(q:string,gid:string,rev=0){const item=await h.getQuestion(q),r=await h.request('POST',`/questions/${q}/shares/${gid}/revocation`,{expectedRevision:item.revision,expectedGrantRevision:rev});assert.equal(r.statusCode,200,r.body);return r;}
 try{
  await h.user();await h.user();
  await t.test('four local types stay draft until explicit formalization, preserve IDs/config; bound Content is immutable',async()=>{
   const s=await draft(),questions:Question[]=[{id:'s',type:'single',title:'单选',required:true,options:[{id:'a',label:'甲'},{id:'b',label:'乙'}],jumpRules:[]},{id:'m',type:'multiple',title:'多选',required:false,options:[{id:'a',label:'甲'},{id:'b',label:'乙'}],validation:{maxChoices:2},jumpRules:[]},{id:'t',type:'text',title:'文本😀',required:false,validation:{maxLength:10},jumpRules:[]},{id:'n',type:'number',title:'数字',required:false,validation:{integerOnly:false,min:'-1.25'},jumpRules:[]}];
   let r=await h.request('PUT',`/surveys/${s.id}/questions`,{expectedRevision:0,questions});assert.equal(r.statusCode,200,r.body);assert.equal(await h.db.collection('question_versions').countDocuments(),0);
   let editor=await h.getSurvey(s.id);r=await h.request('POST',`/surveys/${s.id}/publish`,{expectedRevision:editor.revision,expectedDraftDefinitionVersion:editor.draftDefinitionRevision},0,{'publication-key':randomUUID()});assert.equal(r.statusCode,422);assert.equal(r.json().error.code,'UNSAVED_QUESTION_CONTENT');assert.equal(await h.db.collection('question_versions').countDocuments(),0);
   for(const q of questions){editor=await h.getSurvey(s.id);r=await h.request('POST',`/surveys/${s.id}/questions/${q.id}/formalization`,{expectedRevision:editor.revision},0,{'idempotency-key':randomUUID()});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().data.instanceId,q.id);}
   editor=await h.getSurvey(s.id);assert.deepEqual(editor.draftDefinition.questions,questions);const mutated=structuredClone(questions);mutated[0].title='不应原地改正式内容';const before=await h.fingerprint();r=await h.request('PUT',`/surveys/${s.id}/questions`,{expectedRevision:editor.revision,questions:mutated});assert.equal(r.statusCode,409);assert.equal(r.json().error.code,'QUESTION_CONTENT_REQUIRES_VERSION');assert.equal(await h.fingerprint(),before);
   await publish(s.id);const snapshot=await h.db.collection('survey_versions').findOne({surveyId:new ObjectId(s.id)});assert.equal(snapshot!.schemaVersion,2);assert.match(snapshot!.bindingHash,/^[a-f0-9]{64}$/);
  });
  await t.test('shared history and future formal versions exclude draft; server owns all source fields',async()=>{
   qid=(await h.createQuestion(numeric)).resourceId;v1=(await h.saveVersion(qid)).receipt.versionId!;grantId=(await grant(qid,1)).id;
   assert.equal((await h.request('GET',`/questions/${qid}/versions`,undefined,1)).statusCode,200);assert.equal((await h.request('GET',`/questions/${qid}/draft`,undefined,1)).statusCode,404);assert.equal((await h.request('GET',`/questions/${qid}/versions`,undefined,2)).statusCode,404);
   const privateProbe=await draft(2);assert.equal((await attach(privateProbe.id,v1,2)).r.statusCode,404);assert.equal((await h.request('POST',`/question-versions/${v1}/forks`,{content:numeric},2,{'idempotency-key':randomUUID()})).statusCode,404);
   const s=await draft(1);sid=s.id;const a=await attach(sid,v1,1);assert.equal(a.r.statusCode,200,a.r.body);instanceId=a.r.json().data.instanceId;savedAttach={body:a.body,key:a.key,data:a.r.json().data};
   const before=await h.fingerprint();const bad=await attach(sid,v1,1,{ownerId:h.userIds[0],authorization:{kind:'owner'}});assert.equal(bad.r.statusCode,400,bad.r.body);assert.equal(await h.fingerprint(),before);
   const bank=await h.request('POST','/question-banks',{name:'共享整理'},1,{'idempotency-key':randomUUID()});bankId=bank.json().data.resourceId;assert.equal((await h.request('PUT',`/question-banks/${bankId}/members/${qid}`,{expectedRevision:0,present:true},1)).statusCode,200);
   oldPublication=await publish(sid,1);
   const fill=await h.request('GET',`/public/surveys/${s.publicId}`,undefined,2);assert.equal(fill.statusCode,200,fill.body);
   const answer=await h.request('POST',`/public/surveys/${s.publicId}/responses`,{publishedVersion:1,anonymous:true,answers:[{questionId:instanceId,type:'number',number:'0'}]},2,{'idempotency-key':'shared-old-submit'});assert.equal(answer.statusCode,201,answer.body);
  });
  await t.test('same Content different source version counts as unpublished change; explicit pause/replace/re-publish preserves history',async()=>{
   const original=await h.db.collection('survey_versions').findOne({surveyId:new ObjectId(sid),version:1}),answer=await h.db.collection('responses').findOne({surveyId:new ObjectId(sid)});
   v2=(await h.saveVersion(qid)).receipt.versionId!;const updates=await h.request('GET',`/surveys/${sid}/question-updates`,undefined,1);assert.equal(updates.json().data.items[0].latestAccessibleVersionId,v2);
   let s=await h.getSurvey(sid,1),r=await h.request('POST',`/surveys/${sid}/questions/${instanceId}/replacement`,{expectedRevision:s.revision,questionVersionId:v2},1,{'idempotency-key':randomUUID()});assert.equal(r.statusCode,409);assert.equal(r.json().error.code,'SURVEY_STATE_CONFLICT');
   await pause(sid,1);s=await h.getSurvey(sid,1);r=await h.request('POST',`/surveys/${sid}/questions/${instanceId}/replacement`,{expectedRevision:s.revision,questionVersionId:v2},1,{'idempotency-key':randomUUID()});assert.equal(r.statusCode,200,r.body);
   const after=await h.getSurvey(sid,1);assert.equal(after.hasUnpublishedChanges,true);assert.equal(after.draftDefinition.questions[0].id,instanceId);assert.deepEqual(after.draftDefinition.questions,s.draftDefinition.questions);await publish(sid,1);
   assert.deepEqual(await h.db.collection('survey_versions').findOne({_id:original!._id}),original);assert.deepEqual(await h.db.collection('responses').findOne({_id:answer!._id}),answer);
   const stats=await h.request('GET',`/surveys/${sid}/statistics?version=1`,undefined,1);assert.equal(stats.statusCode,200,stats.body);assert.equal(stats.json().data.questionSummaries[0].average,'0');
  });
  await t.test('usage HTTP whitelist, precise version states and explicit derivation privacy',async()=>{
   const usage=await h.request('GET',`/questions/${qid}/usage`);assert.equal(usage.statusCode,200,usage.body);const row=usage.json().data.items[0];assert.deepEqual(Object.keys(row).sort(),['surveyNumber','username','versions','isDraft','isCurrent','onlyHistorical'].sort());assert.notEqual(row.surveyNumber,(await h.getSurvey(sid,1)).publicId);assert.equal(row.username,h.usernames[1]);assert.equal(row.versions.find((v:{versionId:string})=>v.versionId===v1).hasHistorical,true);assert.equal(row.versions.find((v:{versionId:string})=>v.versionId===v2).isCurrent,true);
   for(const endpoint of ['', '/versions/1','/responses','/statistics'])assert.equal((await h.request('GET',`/surveys/${sid}${endpoint}`)).statusCode,404);
   assert.equal((await h.request('GET',`/questions/${qid}/usage?kind=derivations`,undefined,1)).statusCode,404);
   const fork=await h.request('POST',`/question-versions/${v1}/forks`,{content:numeric},1,{'idempotency-key':randomUUID()});assert.equal(fork.statusCode,201,fork.body);
   const derivations=await h.request('GET',`/questions/${qid}/usage?kind=derivations`);assert.equal(derivations.json().data.items.length,1);assert.equal((await h.request('GET',`/questions/${fork.json().data.resourceId}/versions`)).statusCode,404);
   h.saveEvidence('usage-privacy',{other:row,derivations:derivations.json().data});
  });
  await t.test('revocation keeps stored draft/config/publication/fill, hides future versions and blocks all new expansion',async()=>{
   const cursor=(await h.request('GET',`/questions/${qid}/versions?limit=1`,undefined,1)).json().data.nextCursor;await revoke(qid,grantId);v3=(await h.saveVersion(qid)).receipt.versionId!;
   const sources=await h.request('GET',`/surveys/${sid}/question-sources`,undefined,1);assert.equal(sources.json().data.items[0].rights,'retained');assert.equal(sources.json().data.items[0].hasAccessibleUpdate,false);assert.deepEqual((await h.request('GET',`/surveys/${sid}/question-updates`,undefined,1)).json().data.items,[]);
   assert.equal((await h.request('GET',`/questions/${qid}/versions?cursor=${encodeURIComponent(cursor)}`,undefined,1)).statusCode,404);
   const members=await h.request('GET',`/question-banks/${bankId}/members`,undefined,1);assert.deepEqual(members.json().data.items[0],{questionId:qid,selectable:false,latestVersionId:null,latestVersion:null,title:null});
   const priorFork=await h.db.collection('question_items').findOne({'origin.sourceQuestionId':new ObjectId(qid),ownerId:new ObjectId(h.userIds[1])});assert.ok(priorFork);await h.saveVersion(priorFork._id.toHexString(),1);
   await pause(sid,1);let s=await h.getSurvey(sid,1);s.draftDefinition.questions[0].required=true;let r=await h.request('PUT',`/surveys/${sid}/questions`,{expectedRevision:s.revision,questions:s.draftDefinition.questions},1);assert.equal(r.statusCode,200,r.body);await publish(sid,1);
   s=await h.getSurvey(sid,1);r=await h.request('POST',`/public/surveys/${s.publicId}/responses`,{publishedVersion:s.currentPublishedVersion,anonymous:true,answers:[{questionId:instanceId,type:'number',number:'-1.25'}]},2,{'idempotency-key':randomUUID()});assert.equal(r.statusCode,201,r.body);
   const fresh=await draft(1);r=(await attach(fresh.id,v1,1)).r;assert.equal(r.statusCode,409);assert.equal(r.json().error.code,'SOURCE_ACCESS_REVOKED');
   r=await h.request('POST',`/question-versions/${v1}/forks`,{content:numeric},1,{'idempotency-key':randomUUID()});assert.equal(r.statusCode,409);
   await pause(sid,1);s=await h.getSurvey(sid,1);r=await h.request('POST',`/surveys/${sid}/questions/${instanceId}/replacement`,{expectedRevision:s.revision,questionVersionId:v3},1,{'idempotency-key':randomUUID()});assert.equal(r.statusCode,409);
   const old=await h.request('POST',`/surveys/${sid}/publish`,oldPublication!.body,1,{'publication-key':oldPublication!.key});assert.equal(old.statusCode,200,old.body);assert.deepEqual(old.json().data,{...(oldPublication!.data as object),replayed:true});
   r=await h.request('PUT',`/surveys/${sid}/questions`,{expectedRevision:s.revision,questions:[]},1);assert.equal(r.statusCode,200,r.body);
   r=(await attach(sid,v2,1,{instanceId})).r;assert.equal(r.statusCode,409);assert.equal(await h.db.collection('survey_question_bindings').countDocuments({surveyId:new ObjectId(sid),scope:'draft'}),0);
   // Old successful endpoint receipt is read without touching any current question/survey/binding resource.
   const before=await h.fingerprint(),originalFind=Collection.prototype.findOne;
   Collection.prototype.findOne=function(...args:Parameters<typeof originalFind>){if(!['users','operation_receipts'].includes(this.collectionName))throw Error('receipt replay touched current resource');return originalFind.apply(this,args);};
   try{r=await h.request('POST',`/surveys/${sid}/question-references`,savedAttach!.body,1,{'idempotency-key':savedAttach!.key});assert.equal(r.statusCode,200,r.body);assert.deepEqual(r.json().data,{...(savedAttach!.data as object),replayed:true});}finally{Collection.prototype.findOne=originalFind;}
   assert.equal(await h.fingerprint(),before);
   const oldSubmit=await h.request('POST',`/public/surveys/${s.publicId}/responses`,{publishedVersion:1,anonymous:true,answers:[{questionId:instanceId,type:'number',number:'0'}]},2,{'idempotency-key':'shared-old-submit'});assert.equal(oldSubmit.statusCode,200,oldSubmit.body);
  });
  await t.test('S04 same identity/version rejects duplicate, different versions coexist; version-first usage filtering and history flags',async()=>{
   const s=await draft();let a=await attach(s.id,v1);assert.equal(a.r.statusCode,200,a.r.body);const iid=a.r.json().data.instanceId;
   const before=await h.fingerprint();a=await attach(s.id,v1);assert.equal(a.r.statusCode,422,a.r.body);assert.equal(a.r.json().error.code,'DUPLICATE_QUESTION_VERSION');assert.equal(await h.fingerprint(),before);
   a=await attach(s.id,v2);assert.equal(a.r.statusCode,200,a.r.body);const second=a.r.json().data.instanceId;await publish(s.id);await pause(s.id);
   let current=await h.getSurvey(s.id);await h.request('PUT',`/surveys/${s.id}/questions`,{expectedRevision:current.revision,questions:current.draftDefinition.questions.filter(q=>q.id!==second)});await publish(s.id);await pause(s.id);
   current=await h.getSurvey(s.id);let r=await h.request('POST',`/surveys/${s.id}/questions/${iid}/replacement`,{expectedRevision:current.revision,questionVersionId:v2},0,{'idempotency-key':randomUUID()});assert.equal(r.statusCode,200,r.body);
   const all=await h.request('GET',`/questions/${qid}/usage`),own=all.json().data.items.find((row:{surveyId:string})=>row.surveyId===s.id);assert.ok(own);assert.equal(own.isDraft,true);assert.equal(own.isCurrent,true);assert.equal(own.versions.find((v:{versionId:string})=>v.versionId===v2).isDraft,true);assert.equal(own.versions.find((v:{versionId:string})=>v.versionId===v1).isDraft,false);
   const only=await h.request('GET',`/questions/${qid}/usage?versionId=${v1}`),filtered=only.json().data.items.find((row:{surveyId:string})=>row.surveyId===s.id);assert.equal(filtered.isDraft,false);assert.equal(filtered.isCurrent,true);assert.equal(filtered.versions.length,1);
   assert.deepEqual((await h.request('GET',`/questions/${qid}/usage?versionId=${v3}`)).json().data.items,[]);
   await publish(s.id);const historical=(await h.request('GET',`/questions/${qid}/usage?versionId=${v1}`)).json().data.items.find((row:{surveyId:string})=>row.surveyId===s.id);assert.equal(historical.onlyHistorical,true);
   const first=await h.request('GET',`/questions/${qid}/usage?limit=1`),cursor=first.json().data.nextCursor;assert.ok(cursor);const next=await h.request('GET',`/questions/${qid}/usage?limit=1&cursor=${encodeURIComponent(cursor)}`);assert.equal(next.statusCode,200,next.body);assert.notEqual(first.json().data.items[0].surveyNumber,next.json().data.items[0].surveyNumber);
   assert.equal((await h.request('GET',`/questions/${qid}/usage?versionId=${v1}&cursor=${encodeURIComponent(cursor)}`)).statusCode,400);
   h.saveEvidence('usage-version-states',{mixed:own,filtered,historical});
  });
  await t.test('type change requires explicit reviewed rules; stale option is saveable soft issue that blocks publish',async()=>{
   const content:QuestionContent={type:'single',title:'选择并跳转',options:[{id:'yes',label:'是'},{id:'no',label:'否'}]},q=(await h.createQuestion(content)).resourceId,old=(await h.saveVersion(q)).receipt.versionId!,s=await draft();
   let a=await attach(s.id,old,0,{instanceId:'choice',jumpRules:[{id:'rule',condition:{op:'eq',optionId:'yes'},targetQuestionId:'tail'}]});assert.equal(a.r.statusCode,200,a.r.body);assert.ok(a.r.json().data.validationIssues.length);
   let editor=await h.getSurvey(s.id);await h.request('PUT',`/surveys/${s.id}/questions`,{expectedRevision:editor.revision,questions:[...editor.draftDefinition.questions,{id:'tail',type:'text',title:'尾题',required:false,validation:{},jumpRules:[]}]});editor=await h.getSurvey(s.id);assert.equal((await h.request('POST',`/surveys/${s.id}/questions/tail/formalization`,{expectedRevision:editor.revision},0,{'idempotency-key':randomUUID()})).statusCode,200);
   let item=await h.getQuestion(q);await h.request('PUT',`/questions/${q}/draft`,{expectedRevision:item.revision,content:{type:'single',title:content.title,options:[{id:'other',label:'别的'},{id:'no',label:'否'}]},baseVersionId:old});const stale=(await h.saveVersion(q)).receipt.versionId!;
   editor=await h.getSurvey(s.id);let r=await h.request('POST',`/surveys/${s.id}/questions/choice/replacement`,{expectedRevision:editor.revision,questionVersionId:stale},0,{'idempotency-key':randomUUID()});assert.equal(r.statusCode,200,r.body);assert.ok(r.json().data.validationIssues.some((i:{code:string})=>i.code==='OPTION_MISSING'));
   editor=await h.getSurvey(s.id);r=await h.request('POST',`/surveys/${s.id}/publish`,{expectedRevision:editor.revision,expectedDraftDefinitionVersion:editor.draftDefinitionRevision},0,{'publication-key':randomUUID()});assert.equal(r.statusCode,422);
   item=await h.getQuestion(q);await h.request('PUT',`/questions/${q}/draft`,{expectedRevision:item.revision,content:numeric,baseVersionId:old});const changed=(await h.saveVersion(q)).receipt.versionId!;
   const body={expectedRevision:editor.revision,questionVersionId:changed};r=await h.request('POST',`/surveys/${s.id}/questions/choice/replacement`,body,0,{'idempotency-key':randomUUID()});assert.equal(r.statusCode,422);assert.equal(r.json().error.code,'RULE_REVIEW_REQUIRED');
   r=await h.request('POST',`/surveys/${s.id}/questions/choice/replacement`,{...body,reviewedJumpRules:[]},0,{'idempotency-key':randomUUID()});assert.equal(r.statusCode,200,r.body);await publish(s.id);
  });
  for(const action of ['attach','fork'] as const)for(const order of ['new-first','revoke-first'] as const)await t.test(`real common-fence barrier ${action} / ${order}`,async()=>{
   const q=(await h.createQuestion(numeric)).resourceId,v=(await h.saveVersion(q)).receipt.versionId!,g=await grant(q,1),s=action==='attach'?await draft(1):null;
   let arrived!:()=>void,release!:()=>void,revokeArrived!:()=>void;const gate=new Promise<void>(r=>release=r),held=new Promise<void>(r=>arrived=r),revoking=new Promise<void>(r=>revokeArrived=r);let used=false;
   const callback=async(p:{action:string;questionId:string})=>{if(p.questionId===q&&p.action===action&&!used){used=true;arrived();await gate;}};
   if(order==='new-first')faults.afterAccessFence=callback;else faults.beforeAccessFence=callback;
   const prior=faults.beforeAccessFence;faults.beforeAccessFence=async p=>{if(p.questionId===q&&p.action==='revoke')revokeArrived();await prior?.(p);};
   const run=action==='attach'?attach(s!.id,v,1).then(x=>x.r):h.request('POST',`/question-versions/${v}/forks`,{content:numeric},1,{'idempotency-key':randomUUID()});await held;
   let revoked:Awaited<ReturnType<typeof revoke>>;
   if(order==='new-first'){const pending=revoke(q,g.id);await revoking;release();revoked=await pending;}
   else{revoked=await revoke(q,g.id);release();}
   const created=await run;delete faults.beforeAccessFence;delete faults.afterAccessFence;
   assert.equal(created.statusCode,order==='new-first'?(action==='attach'?200:201):409,created.body);
   const effects=action==='attach'?await h.db.collection('survey_question_bindings').countDocuments({surveyId:new ObjectId(s!.id),scope:'draft'}):await h.db.collection('question_items').countDocuments({'origin.sourceQuestionId':new ObjectId(q),ownerId:new ObjectId(h.userIds[1])});
   assert.equal(effects,order==='new-first'?1:0);h.saveEvidence(`fence-${action}-${order}`,{questionId:q,hook:order==='new-first'?'after real $inc before grant read':'before $inc with pre-existing snapshot',newStatus:created.statusCode,revokeStatus:revoked.statusCode,effects,finalGrant:(await h.db.collection('question_grants').findOne({_id:new ObjectId(g.id)}))!.state});
   if(action==='attach'&&order==='new-first'){
    await publish(s!.id,1);const response=await h.request('POST',`/public/surveys/${s!.publicId}/responses`,{publishedVersion:1,anonymous:true,answers:[{questionId:created.json().data.instanceId,type:'number',number:'0'}]},2,{'idempotency-key':randomUUID()});assert.equal(response.statusCode,201,response.body);h.saveEvidence('revoked-unpublished-draft',{surveyId:s!.id,revokedBeforeFirstPublication:true,publicationVersion:1,submitStatus:response.statusCode});
   }
  });
  await t.test('real formalization receipt capacity rolls back identity, version, binding and survey; HTTP whitelist',async()=>{
   const s=await draft(),questions:Question[]=Array.from({length:25},(_,i)=>({id:`q${i}`,type:'number',title:`题${i}`,required:false,validation:{integerOnly:false},jumpRules:Array.from({length:100},(_,j)=>({id:`r${i}_${j}`,condition:{op:'eq',number:'0'},targetQuestionId:`missing_${j}`}))}));
   let r=await h.request('PUT',`/surveys/${s.id}/questions`,{expectedRevision:0,questions});assert.equal(r.statusCode,200,r.body);const before=await h.fingerprint(),editor=await h.getSurvey(s.id);r=await h.request('POST',`/surveys/${s.id}/questions/q0/formalization`,{expectedRevision:editor.revision},0,{'idempotency-key':randomUUID()});assert.equal(r.statusCode,422,r.body);assert.equal(r.json().error.code,'RECEIPT_TOO_LARGE');assert.equal(await h.fingerprint(),before);
   assert.equal((await h.request('GET',`/questions/${qid}/usage?kind=bad`)).statusCode,400);assert.equal((await h.request('GET',`/questions/${qid}/usage?versionId=${v1}&versionId=${v2}`)).statusCode,400);
   const wrong=await h.request('DELETE',`/surveys/${sid}/question-references`);assert.equal(wrong.statusCode,405);assert.equal(wrong.headers.allow,'POST');h.saveEvidence('receipt-capacity',{status:r.statusCode,code:r.json().error.code,fingerprintBefore:before,fingerprintAfter:await h.fingerprint()});
  });
 }finally{await h.close();}
});
