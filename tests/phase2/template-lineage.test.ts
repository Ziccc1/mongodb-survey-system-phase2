import test from 'node:test';
import assert from 'node:assert/strict';
import {ObjectId,BSON} from 'mongodb';
import {randomUUID} from 'node:crypto';
import {phase2Harness} from './harness.js';
import {templateFixture,textContent} from './template-fixture.js';
import {hash} from '../../apps/api/src/core/common.js';
import {templateContentHash} from '../../apps/api/src/database/template-integrity.js';
import {bindingHashOf} from '../../apps/api/src/database/binding-integrity.js';
import type {SurveyTemplateDocument,SurveyQuestionBindingDocument} from '../../apps/api/src/database/phase2-models.js';
test('W06 multi-author fixed chain, proof integrity, unavailable pagination and source publication independence',async t=>{
 const h=await phase2Harness('template_lineage'),f=templateFixture(h);
 try{await h.user();await h.user();await h.user();const a=await f.formal();await f.share(a.qid,1);await f.grant(a.qid,a.vid,1);const fb=await f.fork(a.vid,1);assert.equal(fb.r.statusCode,201,fb.r.body);const b={qid:fb.r.json().data.resourceId,vid:fb.r.json().data.versionId};await f.share(b.qid,2,1);const fc=await f.fork(b.vid,2);assert.equal(fc.r.statusCode,201,fc.r.body);const c={qid:fc.r.json().data.resourceId,vid:fc.r.json().data.versionId},sid=await f.source([c.vid],2);
  await t.test('A→B does not authorize C; leaf self never exempts ancestors; complete leaf-to-root proof/hash',async()=>{
   assert.equal((await f.create(sid,2)).r.statusCode,403);await f.grant(b.qid,b.vid,2,1);assert.equal((await f.create(sid,2)).r.statusCode,403);await f.grant(a.qid,a.vid,2);const x=await f.create(sid,2);assert.equal(x.r.statusCode,201,x.r.body);const stored=await h.db.collection<SurveyTemplateDocument>('survey_templates').findOne({_id:new ObjectId(x.r.json().data.resourceId)}),proof=stored!.bindings[0].distributionProof;
   assert.deepEqual(proof.obligations.map(o=>String(o.questionVersionId)),[c.vid,b.vid,a.vid]);assert.equal(proof.obligations[0].grantId,null);assert.ok(proof.obligations[1].grantId);assert.ok(proof.obligations[2].grantId);assert.equal(stored!.contentHash,templateContentHash(stored!));
   const nodes=[];for(const vid of [c.vid,b.vid,a.vid]){const v=await h.db.collection('question_versions').findOne({_id:new ObjectId(vid)});nodes.push({questionId:String(v!.questionId),questionVersionId:String(v!._id),authorId:String(v!.createdBy),contentHash:v!.contentHash,distributionSource:{kind:v!.distributionSource.kind,sourceQuestionId:v!.distributionSource.sourceQuestionId?.toHexString()??null,sourceVersionId:v!.distributionSource.sourceVersionId?.toHexString()??null}});}assert.equal(proof.lineageHash,hash(nodes));
   // Newly inserted negative fixture: rehashing an incomplete proof cannot hide missing obligations.
   const forged={...stored!,_id:new ObjectId(),bindings:stored!.bindings.map(b=>({...b,distributionProof:{...b.distributionProof,obligations:b.distributionProof.obligations.slice(0,1)}}))};forged.contentHash=templateContentHash(forged);await h.db.collection('survey_templates').insertOne(forged);const before=await h.fingerprint();assert.equal((await f.adopt(String(forged._id),3)).r.statusCode,503);assert.equal(await h.fingerprint(),before);
   let q=await h.getQuestion(c.qid,2);assert.equal((await h.request('PUT',`/questions/${c.qid}/draft`,{expectedRevision:q.revision,content:{...textContent,title:'改写后仍有祖先'},baseVersionId:c.vid},2)).statusCode,200);const edited=(await h.saveVersion(c.qid,2)).receipt.versionId!;q=await h.getQuestion(c.qid,2);const restore=await f.post(`/questions/${c.qid}/restorations`,{expectedRevision:q.revision,sourceVersionId:c.vid},2);assert.equal(restore.r.statusCode,201);for(const vid of [edited,restore.r.json().data.versionId]){const v=await h.db.collection('question_versions').findOne({_id:new ObjectId(vid)});assert.equal(String(v!.distributionSource.sourceVersionId),b.vid);}
   let s=await h.getSurvey(sid,2);assert.equal((await h.request('POST',`/surveys/${sid}/pause`,{expectedRevision:s.revision},2)).statusCode,200);s=await h.getSurvey(sid,2);assert.equal((await h.request('POST',`/surveys/${sid}/close`,{expectedRevision:s.revision},2)).statusCode,200);assert.equal((await f.adopt(String(stored!._id),3)).r.statusCode,201);h.saveEvidence('full-proof',{proof:JSON.parse(JSON.stringify(proof)),lineageHash:proof.lineageHash,sourceClosedStillAdoptable:true,editedAndRestoredFixedSource:b.vid});
  });
  await t.test('filtered empty page retains scan cursor; scopes/actors and next-page current grants are checked',async()=>{
   // Many new corrupt template fixtures are listed but ineligible, all newer than the genuine template.
   const good=await h.db.collection<SurveyTemplateDocument>('survey_templates').findOne({publisherId:new ObjectId(h.userIds[2]),'bindings.distributionProof.obligations.2':{$exists:true}});assert.ok(good);
   for(let i=0;i<5;i++)await h.db.collection('survey_templates').insertOne({...good!,_id:new ObjectId(),createdAt:new Date(Date.now()+1000+i),contentHash:'0'.repeat(64)});
   const first=await h.request('GET','/templates?scope=square&limit=1',undefined,3);assert.equal(first.statusCode,200,first.body);assert.deepEqual(first.json().data.items,[]);let cursor=first.json().data.nextCursor;assert.ok(cursor);
   for(const [scope,actor] of [['mine',3],['square',1]] as const)assert.equal((await h.request('GET',`/templates?scope=${scope}&limit=1&cursor=${encodeURIComponent(cursor)}`,undefined,actor)).statusCode,400);
   const ids:string[]=[];let pages=1;while(cursor){const r=await h.request('GET',`/templates?scope=square&limit=1&cursor=${encodeURIComponent(cursor)}`,undefined,3);assert.equal(r.statusCode,200,r.body);ids.push(...r.json().data.items.map((v:any)=>v.id));cursor=r.json().data.nextCursor;pages++;assert.ok(pages<20);}assert.ok(ids.includes(String(good!._id)));assert.equal(new Set(ids).size,ids.length);
   const grants=await h.db.collection('template_grants').findOne({questionVersionId:new ObjectId(a.vid),publisherId:new ObjectId(h.userIds[2])});await f.revoke(a.qid,{id:String(grants!._id),revision:grants!.revision});const next=await h.request('GET',`/templates?scope=square&limit=100&cursor=${encodeURIComponent(first.json().data.nextCursor)}`,undefined,3);assert.equal(next.statusCode,200,next.body);assert.ok(!next.json().data.items.some((x:any)=>x.id===String(good!._id)));h.saveEvidence('filtered-pages',{pages,firstEmpty:true,firstHasCursor:true,reachedValid:true,revalidationAfterRevoke:true,actorScopeBound:true});
  });
 }finally{await h.close();}
});

test('W06 actual BSON exact 2MiB template accepted, +1 rejected; UUID expansion also checked atomically',async()=>{
 const h=await phase2Harness('template_bson'),f=templateFixture(h);
 try{
  const base=await f.formal(),item=await h.db.collection('question_items').findOne({_id:new ObjectId(base.qid)}),version=await h.db.collection('question_versions').findOne({_id:new ObjectId(base.vid)}),now=new Date();
  async function seed(target:number){
   const sid=new ObjectId(await f.draft()),owner=new ObjectId(h.userIds[0]),qs:any[]=Array.from({length:40},(_,i)=>({id:`q${i}`,type:'single',title:`BSON容量题${i}`,options:Array.from({length:100},(_,j)=>({id:`o${j}`,label:'汉'.repeat(200)})),required:false,jumpRules:i===39?[]:Array.from({length:100},(_,j)=>({id:`r${i}_${j}`,condition:{op:'eq',optionId:'o0'},targetQuestionId:'q39'}))}));
   const bindings:any[]=qs.map(q=>({instanceId:q.id,questionId:new ObjectId(),questionVersionId:new ObjectId(),contentHash:'0'.repeat(64),distributionProof:{lineageHash:'0'.repeat(64),obligations:[]}}));for(const b of bindings)b.distributionProof.obligations=[{questionId:b.questionId,questionVersionId:b.questionVersionId,authorId:owner,grantId:null,grantRevision:null}];
   const template:SurveyTemplateDocument={_id:new ObjectId(),schemaVersion:1,createdAt:now,updatedAt:now,publisherId:owner,sourceSurveyId:sid,sourcePublishedVersion:1,status:'listed',revision:0,accessFence:0,title:'固定模板源',description:'',questions:qs,bindings,contentHash:'0'.repeat(64)};
   let excess=BSON.calculateObjectSize(template)-target;assert.ok(excess>100000);if(excess%2){qs[0].options[0].label='😀'+'汉'.repeat(199);excess++;}
   for(const q of qs)for(const o of q.options){if(!excess)break;const chars=[...o.label];for(let j=0;j<chars.length&&excess>=2;j++)if(chars[j]==='汉'){chars[j]='a';excess-=2;}o.label=chars.join('');}assert.equal(excess,0);
   const versions=qs.map((q,i)=>{const content={type:q.type,title:q.title,options:q.options},b=bindings[i];b.contentHash=hash(content);b.distributionProof.lineageHash=hash([{questionId:String(b.questionId),questionVersionId:String(b.questionVersionId),authorId:String(owner),contentHash:b.contentHash,distributionSource:{kind:'original',sourceQuestionId:null,sourceVersionId:null}}]);return {...version!,_id:b.questionVersionId,questionId:b.questionId,content,contentHash:b.contentHash};});template.contentHash=templateContentHash(template);assert.equal(BSON.calculateObjectSize(template),target);
   await h.db.collection('question_items').insertMany(bindings.map(b=>({...item!,_id:b.questionId,latestVersionId:b.questionVersionId,draft:null,nextVersion:2})));await h.db.collection('question_versions').insertMany(versions);
   const definition={title:template.title,description:'',questions:qs},policy={allowAnonymous:false,allowRepeat:false},definitionHash=hash({definition,policy});const rows:SurveyQuestionBindingDocument[]=bindings.map(b=>({_id:new ObjectId(),schemaVersion:1,createdAt:now,surveyId:sid,ownerId:owner,instanceId:b.instanceId,questionId:b.questionId,questionVersionId:b.questionVersionId,contentHash:b.contentHash,acquisitionId:new ObjectId(),acquiredAt:now,authorization:{kind:'owner'},mappingKind:'native',evidenceKey:null,scope:'publication',publicationVersion:1,snapshotHash:definitionHash}));
   await h.db.collection('survey_versions').insertOne({_id:new ObjectId(),schemaVersion:2,surveyId:sid,version:1,sourceDefinitionVersion:1,definition,policySnapshot:policy,definitionHash,bindingHash:bindingHashOf(rows),publishedAt:now,publishedBy:owner,publicationRequestId:randomUUID(),publicationRequestHash:hash({synthetic:true}),origin:{kind:'publication'}});await h.db.collection('survey_question_bindings').insertMany(rows);return {sid:String(sid),target};
  }
  const exact=await seed(2097152),x=await f.create(exact.sid);assert.equal(x.r.statusCode,201,x.r.body);const tid=x.r.json().data.resourceId,stored=await h.db.collection('survey_templates').findOne({_id:new ObjectId(tid)});assert.equal(BSON.calculateObjectSize(stored!),2097152);
  let before=await h.fingerprint();const adopt=await f.adopt(tid);assert.equal(adopt.r.statusCode,422,adopt.r.body);assert.equal(adopt.r.json().error.code,'DEFINITION_INVALID');assert.equal(await h.fingerprint(),before);
  const over=await seed(2097153);before=await h.fingerprint();const fail=await f.create(over.sid);assert.equal(fail.r.statusCode,422,fail.r.body);assert.equal(fail.r.json().error.code,'DEFINITION_INVALID');assert.equal(await h.fingerprint(),before);h.saveEvidence('bson-capacity',{fixture:'new explicit schema-valid fixed publications with exact actual BSON sizes; no historical source edits',acceptedTemplateBytes:2097152,rejectedTemplateBytes:2097153,uuidExpansionRejected:adopt.r.statusCode,zeroPartialWrites:true});
 }finally{await h.close();}
});

test('W06 actual schema-valid synthetic graph bounds 32/33, union 500/501 and malformed provenance',async t=>{
 const h=await phase2Harness('lineage_bounds'),f=templateFixture(h);
 try{const base=await f.formal(),item=await h.db.collection('question_items').findOne({_id:new ObjectId(base.qid)}),version=await h.db.collection('question_versions').findOne({_id:new ObjectId(base.vid)});
  async function chain(n:number,kind='valid'){
   const items:any[]=[],versions:any[]=[];for(let i=0;i<n;i++){const qid=new ObjectId(),vid=new ObjectId(),parent=versions.at(-1),source=parent?{kind:'derived',sourceQuestionId:parent.questionId,sourceVersionId:parent._id}:{kind:'original',sourceQuestionId:null,sourceVersionId:null};items.push({...item!,_id:qid,latestVersionId:vid,nextVersion:2,draft:null,origin:parent?{kind:'fork',sourceQuestionId:parent.questionId,sourceVersionId:parent._id,evidenceKey:null}:null});versions.push({...version!,_id:vid,questionId:qid,distributionSource:source,parentVersionId:null,operation:parent?'fork':'save'});}
   const v=versions.at(-1)!,q=items.at(-1)!;
   if(kind==='unknown'){q.origin={kind:'legacyImport',sourceQuestionId:null,sourceVersionId:null,evidenceKey:'synthetic-unrecorded'};v.distributionSource={kind:'unrecorded',sourceQuestionId:null,sourceVersionId:null};v.operation='legacyImport';}
   if(kind==='missing'){v.distributionSource={kind:'derived',sourceQuestionId:new ObjectId(),sourceVersionId:new ObjectId()};q.origin={kind:'fork',...v.distributionSource,evidenceKey:null};delete q.origin.kind;q.origin.kind='fork';}
   if(kind==='cycle'){v.distributionSource={kind:'derived',sourceQuestionId:q._id,sourceVersionId:v._id};q.origin={kind:'fork',sourceQuestionId:q._id,sourceVersionId:v._id,evidenceKey:null};}
   if(kind==='owner')v.createdBy=new ObjectId();
   if(kind==='pair'){v.distributionSource.sourceQuestionId=new ObjectId();q.origin.sourceQuestionId=v.distributionSource.sourceQuestionId;}
   if(kind==='hash')v.contentHash='1'.repeat(64);
   await h.db.collection('question_items').insertMany(items);await h.db.collection('question_versions').insertMany(versions);return {vid:String(v._id),qid:String(q._id)};
  }
  await t.test('32 nodes accepted, 33 rejected atomically; unknown409 and broken chains503',async()=>{
   const c32=await chain(32),good=await f.template([c32.vid]);assert.ok(good.tid);const c33=await chain(33),sid=await f.source([c33.vid]),before=await h.fingerprint(),bad=await f.create(sid);assert.equal(bad.r.statusCode,422,bad.r.body);assert.equal(bad.r.json().error.code,'DISTRIBUTION_LINEAGE_LIMIT_EXCEEDED');assert.equal(await h.fingerprint(),before);
   for(const kind of ['unknown','missing','cycle','pair']){const c=await chain(kind==='pair'?2:1,kind),s=await f.source([c.vid]),before=await h.fingerprint(),r=await f.create(s);assert.equal(r.r.statusCode,kind==='unknown'?409:503,r.r.body);assert.equal(await h.fingerprint(),before);}
   // Corrupt leaf owner/hash are rejected by existing source acquisition integrity before template publication.
   for(const kind of ['owner','hash']){const c=await chain(1,kind),s=await f.draft(),e=await h.getSurvey(s),before=await h.fingerprint(),r=await f.post(`/surveys/${s}/question-references`,{expectedRevision:e.revision,position:0,questionVersionId:c.vid});assert.equal(r.r.statusCode,503,r.r.body);assert.equal(await h.fingerprint(),before);}
  });
  await t.test('full distinct union500 accepted; union501 fails before any template or receipt survives',async()=>{
   const leaves=[];for(let i=0;i<15;i++)leaves.push((await chain(32)).vid);leaves.push((await chain(20)).vid);const sid=await f.source(leaves),x=await f.create(sid);assert.equal(x.r.statusCode,201,x.r.body);const stored=await h.db.collection<SurveyTemplateDocument>('survey_templates').findOne({_id:new ObjectId(x.r.json().data.resourceId)});assert.equal(new Set(stored!.bindings.flatMap(b=>b.distributionProof.obligations.map(o=>String(o.questionVersionId)))).size,500);
   const extra=await chain(1),tooMany=await f.source([...leaves,extra.vid]),before=await h.fingerprint(),r=await f.create(tooMany);assert.equal(r.r.statusCode,422,r.r.body);assert.equal(await h.fingerprint(),before);h.saveEvidence('lineage-limits',{chainAccepted:32,chainRejected:33,unionAccepted:500,unionRejected:501,fixture:'explicit fresh schema-valid storage graphs; real HTTP publication/templates',noPartialWrites:true});
  });
 }finally{await h.close();}
});
