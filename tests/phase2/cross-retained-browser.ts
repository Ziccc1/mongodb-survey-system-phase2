import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {resolve} from 'node:path';
import {phase2Harness} from './harness.js';
import {templateFixture} from './template-fixture.js';
import {assertPortsFree,assertListenersOwned} from '../runtime-listeners.js';
const port=3232,origin=`http://localhost:${port}`,h=await phase2Harness('retained_ui',{},origin),f=templateFixture(h),browser=await chromium.launch({channel:'msedge',headless:true}),errors:string[]=[],rows:unknown[]=[];
let context:Awaited<ReturnType<typeof browser.newContext>>|undefined,page:Awaited<ReturnType<typeof browser.newPage>>|undefined;
try{
 assertPortsFree([port]);await h.user();await h.user();const root=await f.formal(0,{type:'number',title:'固定数值5',validation:{integerOnly:false}}),share=await f.share(root.qid,1),retained=await f.source([root.vid],1),template=await f.template([root.vid]),adopt=await f.adopt(template.tid,2);assert.equal(adopt.r.statusCode,201,adopt.r.body);const templated=adopt.r.json().data.surveyId;await f.publish(templated,2);
 for(const [sid,who] of [[retained,1],[templated,2]] as const){const e=await h.getSurvey(sid,who),r=await f.post(`/public/surveys/${e.publicId}/responses`,{publishedVersion:1,anonymous:who===1,answers:[{questionId:e.draftDefinition.questions[0].id,type:'number',number:'5'}]},who);assert.equal(r.r.statusCode,201,r.r.body);}
 const future=(await h.saveVersion(root.qid)).receipt.versionId!,q=await h.getQuestion(root.qid);assert.equal((await h.request('POST',`/questions/${root.qid}/shares/${share.id}/revocation`,{expectedRevision:q.revision,expectedGrantRevision:0})).statusCode,200);
 await h.app.listen({host:'127.0.0.1',port});const listener=assertListenersOwned([{port,pid:process.pid}]);
 for(const [name,who] of [['revoked-share',1],['template-narrow',2]] as const){
  context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'survey_auth',value:h.cookies[who].split('=')[1],url:origin}]);page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().includes('/api/v1/'))rows.push({case:name,status:r.status(),path:new URL(r.url()).pathname});});
  await page.goto(`${origin}/question-statistics/${root.qid}?versionId=${root.vid}`);await expect(page.getByTestId('cross-average')).toHaveText('5');const input=page.getByLabel('数值区间边界（逗号分隔，可留空）',{exact:true});await expect(input).toHaveCount(1);await expect(input).toBeEnabled();await input.fill('0,10');await page.getByRole('button',{name:'查询本人范围',exact:true}).click();await expect(page.getByText('[0, 10]：1 份',{exact:true})).toBeVisible();await expect(page.getByTestId('cross-average')).toHaveText('5');
  await input.fill('10,0');await page.getByRole('button',{name:'查询本人范围',exact:true}).click();await expect(page.getByRole('alert')).toBeVisible();await expect(input).toBeVisible();await expect(input).toBeEnabled();await input.fill('0,10');await page.getByRole('button',{name:'重新查询',exact:true}).click();await expect(page.getByText('[0, 10]：1 份',{exact:true})).toBeVisible();await page.reload();await expect(input).toHaveCount(1);await expect(page.getByTestId('cross-average')).toHaveText('5');
  for(const width of [320,768,1024,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve(h.directory,`${name}-${width}.png`),fullPage:true});}await page.keyboard.press('Tab');assert.notEqual(await page.evaluate(()=>document.activeElement?.tagName),'BODY');
  assert.equal((await h.request('GET',`/questions/${root.qid}/versions`,undefined,who)).statusCode,404);assert.equal((await h.request('GET',`/questions/${root.qid}/versions/${future}`,undefined,who)).statusCode,404);assert.equal((await h.request('GET',`/question-statistics/${root.qid}/versions/${future}`,undefined,who)).statusCode,404);await context.close();context=undefined;
 }
 assert.equal(errors.length,0,errors.join('\n'));h.saveEvidence('retained-number-ui',{cases:['revoked-share','template-narrow'],average:'5',boundaries:'0,10',bins:[0,1,0],invalidBoundariesRecoverable:true,historyAndFutureRemain404:true,widths:[320,768,1024,1440],listener,pageErrors:errors});console.log('R2 RETAINED SHARE AND TEMPLATE NARROW NUMBER CONTROLS REAL EDGE PASSED');
}catch(e){await page?.screenshot({path:resolve(h.directory,'failure.png'),fullPage:true}).catch(()=>{});throw e;}
finally{h.saveEvidence('browser-http',rows);await context?.close();await h.close();await browser.close();}
