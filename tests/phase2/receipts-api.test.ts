import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Collection} from 'mongodb';
import {phase2Harness} from './harness.js';
test('all eight implemented operation endpoints replay complete historical DTOs without resource reads or writes',async()=>{
 const h=await phase2Harness('http_receipts'),saved:{path:string;body:object;key:string;data:object}[]=[];
 async function execute(path:string,body:object){const key=randomUUID(),r=await h.request('POST',path,body,0,{'idempotency-key':key});assert.ok([200,201].includes(r.statusCode),r.body);saved.push({path,body,key,data:r.json().data});return r.json().data;}
 try{
  const content={type:'number',title:'历史回执数字',validation:{integerOnly:false}},q=await execute('/questions',{content});
  let editor=await h.getQuestion(q.resourceId);
  const v1=await execute(`/questions/${q.resourceId}/versions`,{expectedRevision:editor.revision,expectedDraftRevision:editor.draft!.revision});
  editor=await h.getQuestion(q.resourceId);
  const v2=await execute(`/questions/${q.resourceId}/restorations`,{expectedRevision:editor.revision,sourceVersionId:v1.versionId});
  await execute(`/question-versions/${v1.versionId}/forks`,{content});
  const bank=await execute('/question-banks',{name:'随后删除的题库'});
  assert.equal((await h.request('POST',`/question-banks/${bank.resourceId}/deletion`,{expectedRevision:0})).statusCode,200);
  const created=await h.request('POST','/surveys',{title:'回执历史问卷'});assert.equal(created.statusCode,201,created.body);const sid=created.json().data.id;
  const local={id:'local',type:'text',title:'本地正式化',validation:{},required:false,jumpRules:[]};
  assert.equal((await h.request('PUT',`/surveys/${sid}/questions`,{expectedRevision:0,questions:[local]})).statusCode,200);
  await execute(`/surveys/${sid}/questions/local/formalization`,{expectedRevision:1});
  let survey=await h.getSurvey(sid);
  const instance=await execute(`/surveys/${sid}/question-references`,{expectedRevision:survey.revision,questionVersionId:v1.versionId,position:1,jumpRules:[{id:'warning',condition:{op:'gte',number:'0'},targetQuestionId:'missing'}]});
  assert.ok(instance.validationIssues.length,'first DTO contains nonempty original issues');
  survey=await h.getSurvey(sid);
  await execute(`/surveys/${sid}/questions/${instance.instanceId}/replacement`,{expectedRevision:survey.revision,questionVersionId:v2.versionId});
  survey=await h.getSurvey(sid);assert.equal((await h.request('PUT',`/surveys/${sid}/questions`,{expectedRevision:survey.revision,questions:[]})).statusCode,200);
  const before=await h.fingerprint(),original=Collection.prototype.findOne;
  Collection.prototype.findOne=function(...args:Parameters<typeof original>){if(!['users','operation_receipts'].includes(this.collectionName))throw Error('Historical replay read a current resource');return original.apply(this,args);};
  try{for(const row of saved){const r=await h.request('POST',row.path,row.body,0,{'idempotency-key':row.key});assert.equal(r.statusCode,200,r.body);assert.deepEqual(r.json().data,{...row.data,replayed:true});}}
  finally{Collection.prototype.findOne=original;}
  assert.equal(saved.length,8);assert.equal(await h.fingerprint(),before);
  h.saveEvidence('historical-receipts',{operations:saved.map(r=>({path:r.path,originalData:r.data})),allCompleteDtoEqual:true,currentResourceReads:0,databaseFingerprintUnchanged:true});
 }finally{await h.close();}
});
