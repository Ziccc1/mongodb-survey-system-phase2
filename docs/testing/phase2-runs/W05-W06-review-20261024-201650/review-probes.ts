import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {chromium,expect} from '@playwright/test';
import {ObjectId} from 'mongodb';
import {phase2Harness} from '../../../../tests/phase2/harness.js';
import {assertPortsFree,assertListenersOwned} from '../../../../tests/runtime-listeners.js';

// Review probes record actual versus expected behavior; they do not repair application code.
const root='docs/testing/phase2-runs/W05-W06-review-20261024-201650';
const origin='http://localhost:3225';
assertPortsFree([3225]);
const h=await phase2Harness('review_edges',{},origin);
const result:Record<string,unknown>={database:h.config.dbName,checks:[]};
let browser:Awaited<ReturnType<typeof chromium.launch>>|undefined;
try{
 await h.user();
 const privateQuestion=await h.createQuestion({type:'single',title:'Private fixture',options:[{id:'a',label:'A'},{id:'b',label:'B'}]});
 const privateVersion=(await h.saveVersion(privateQuestion.resourceId)).receipt.versionId!;
 const base=`/question-statistics/${privateQuestion.resourceId}/versions/${privateVersion}`;
 const unauthorized=[];
 for(const suffix of ['', '/answers', '/distribution']){
  const r=await h.request('GET',base+suffix,undefined,1);
  unauthorized.push({suffix,expected:404,actual:r.statusCode,code:r.json().error?.code,passed:r.statusCode===404});
 }
 const absent=await h.request('GET',`/question-statistics/${new ObjectId().toHexString()}/versions/${new ObjectId().toHexString()}/answers`,undefined,1);
 result.unauthorizedStatistics={checks:unauthorized,absentStatus:absent.statusCode};

 const numeric=await h.createQuestion({type:'number',title:'Retained numeric fixture',validation:{integerOnly:true}});
 const versionId=(await h.saveVersion(numeric.resourceId)).receipt.versionId!;
 let q=await h.getQuestion(numeric.resourceId);
 const grant=await h.request('PUT',`/questions/${numeric.resourceId}/shares`,{username:h.usernames[1],expectedRevision:q.revision,expectedGrantRevision:null});
 assert.equal(grant.statusCode,200,grant.body);
 const create=await h.request('POST','/surveys',{title:'Retained numeric owner survey',allowAnonymous:false,allowRepeat:true},1);
 assert.equal(create.statusCode,201,create.body);const sid=create.json().data.id;
 const attach=await h.request('POST',`/surveys/${sid}/question-references`,{expectedRevision:0,questionVersionId:versionId,position:0},1,{'idempotency-key':randomUUID()});
 assert.equal(attach.statusCode,200,attach.body);
 let survey=await h.getSurvey(sid,1);
 const pub=await h.request('POST',`/surveys/${sid}/publish`,{expectedRevision:survey.revision,expectedDraftDefinitionVersion:survey.draftDefinitionRevision},1,{'publication-key':randomUUID()});
 assert.equal(pub.statusCode,201,pub.body);survey=await h.getSurvey(sid,1);
 const submitted=await h.request('POST',`/public/surveys/${survey.publicId}/responses`,{publishedVersion:survey.currentPublishedVersion,anonymous:false,answers:[{questionId:survey.draftDefinition.questions[0].id,type:'number',number:'5'}]},1,{'idempotency-key':randomUUID()});
 assert.equal(submitted.statusCode,201,submitted.body);
 q=await h.getQuestion(numeric.resourceId);
 const revoke=await h.request('POST',`/questions/${numeric.resourceId}/shares/${grant.json().data.id}/revocation`,{expectedRevision:q.revision,expectedGrantRevision:grant.json().data.revision});
 assert.equal(revoke.statusCode,200,revoke.body);
 const apiResult=await h.request('GET',`/question-statistics/${numeric.resourceId}/versions/${versionId}?boundaries=0,10`,undefined,1);
 assert.equal(apiResult.statusCode,200,apiResult.body);assert.equal(apiResult.json().data.average,'5');
 const versions=await h.request('GET',`/questions/${numeric.resourceId}/versions`,undefined,1);assert.equal(versions.statusCode,404);
 await h.app.listen({host:'127.0.0.1',port:3225});assertListenersOwned([{port:3225,pid:process.pid}]);
 browser=await chromium.launch({channel:'msedge',headless:true});
 const context=await browser.newContext(),page=await context.newPage();
 await context.addCookies([{name:'survey_auth',value:h.cookies[1].split('=')[1],url:origin}]);
 await page.goto(`${origin}/question-statistics/${numeric.resourceId}?versionId=${versionId}`);
 await expect(page.getByTestId('cross-average')).toHaveText('5');
 const boundaryInputs=await page.getByLabel('数值区间边界（逗号分隔，可留空）',{exact:true}).count();
 result.retainedNumericControls={backendStatisticsStatus:apiResult.statusCode,backendAverage:'5',backendBins:apiResult.json().data.bins,sourceVersionsStatus:versions.statusCode,expectedBoundaryInputs:1,actualBoundaryInputs:boundaryInputs,passed:boundaryInputs===1};
 await page.screenshot({path:resolve(root,'retained-numeric-boundaries.png'),fullPage:true});
 await context.close();
 result.status='completed';
 console.log(JSON.stringify(result,null,2));
}catch(error){result.status='probe-execution-error';result.error=error instanceof Error?error.message:String(error);throw error;}
finally{writeFileSync(resolve(root,'review-probes.json'),JSON.stringify(result,null,2));await browser?.close();await h.close();}
