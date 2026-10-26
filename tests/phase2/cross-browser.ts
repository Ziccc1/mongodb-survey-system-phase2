import assert from 'node:assert/strict';
import {chromium,expect} from '@playwright/test';
import {ObjectId} from 'mongodb';
import {resolve} from 'node:path';
import {phase2Harness} from './harness.js';
import {crossFixture} from './cross-fixture.js';
import {assertPortsFree,assertListenersOwned} from '../runtime-listeners.js';
const browser=await chromium.launch({channel:'msedge',headless:true});
const errors:string[]=[];
try{
 const port=3219,origin=`http://localhost:${port}`;assertPortsFree([port]);
 {
  const h=await phase2Harness('w05_review',{},origin),context=await browser.newContext(),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  try{
   await h.app.listen({host:'127.0.0.1',port});const listener=assertListenersOwned([{port,pid:process.pid}]);await context.addCookies([{name:'survey_auth',value:h.cookies[0].split('=')[1],url:origin}]);
   const q=await h.createQuestion({type:'text',title:'连续版本一',validation:{}});await page.goto(`${origin}/questions/${q.resourceId}`);await page.getByRole('button',{name:'保存正式版本',exact:true}).click();await expect(page.getByText('正式版本已保存。已有问卷仍使用原固定版本，需要主动替换。',{exact:true})).toBeVisible();
   await expect(page.getByText(/编辑基线：v1/)).toBeVisible();await page.getByLabel('题干',{exact:true}).fill('连续版本二');await page.getByRole('button',{name:'保存编辑草稿',exact:true}).click();await expect(page.getByText('编辑草稿已保存，未生成正式版本。',{exact:true})).toBeVisible();await page.getByRole('button',{name:'保存正式版本',exact:true}).click();await expect(page.getByText(/编辑基线：v2/)).toBeVisible();
   const all=await h.db.collection('question_versions').find({questionId:new ObjectId(q.resourceId)}).sort({version:1}).toArray();assert.equal(all.length,2);assert.ok(all[1].parentVersionId.equals(all[0]._id));
   await page.getByRole('button',{name:'v1 · 连续版本一',exact:true}).click();await page.getByRole('button',{name:'以此版编辑草稿',exact:true}).click();await page.getByLabel('题干',{exact:true}).fill('明确从第一版继续');await page.getByRole('button',{name:'保存编辑草稿',exact:true}).click();await expect(page.getByRole('button',{name:'保存正式版本',exact:true})).toBeEnabled();await page.getByRole('button',{name:'保存正式版本',exact:true}).click();await expect(page.getByText(/编辑基线：v3/)).toBeVisible();
   const v3=await h.db.collection('question_versions').findOne({questionId:new ObjectId(q.resourceId),version:3});assert.ok(v3!.parentVersionId.equals(all[0]._id));
   await page.getByLabel('题干',{exact:true}).fill('保留未保存输入');let attempts=0,forkRequests=0;const keys:string[]=[];
   page.on('request',request=>{if(request.url().endsWith('/forks'))forkRequests++;});
   await page.route(`**/api/v1/questions/${q.resourceId}/restorations`,async route=>{attempts++;keys.push(route.request().headers()['idempotency-key']);if(attempts===1){await route.fetch();await route.abort('failed');}else await route.continue();});
   await page.getByRole('button',{name:'恢复此版为新正式版本',exact:true}).click();await expect(page.getByText('操作结果尚未确认。再次点击原操作按钮会使用原请求和原key确认。',{exact:true})).toBeVisible();
   const fork=page.getByRole('button',{name:'派生为独立新题',exact:true});await expect(fork).toBeDisabled();await expect(page.getByRole('button',{name:'保存正式版本',exact:true})).toBeDisabled();
   // Exercise the handler guard too: changing a DOM disabled flag must not dispatch another business action.
   await fork.evaluate(element=>{(element as HTMLButtonElement).disabled=false;(element as HTMLButtonElement).click();});assert.equal(forkRequests,0);assert.equal(attempts,1);
   await page.getByRole('button',{name:'恢复此版为新正式版本',exact:true}).click();await expect(page.getByText('已恢复为新的正式版本。原编辑草稿和中间历史全部保留；可明确选此版作为编辑基线。',{exact:true})).toBeVisible();await expect(page.getByLabel('题干',{exact:true})).toHaveValue('保留未保存输入');
   assert.equal(attempts,2);assert.equal(keys[0],keys[1]);assert.equal(await h.db.collection('question_versions').countDocuments({questionId:new ObjectId(q.resourceId)}),4);assert.equal(forkRequests,0);h.saveEvidence('review-browser',{continuousParent:true,explicitOldParent:true,unknownRestoreAttempts:attempts,sameKey:true,forkRequests,restoreKeepsLocalInput:true,listener});await page.screenshot({path:resolve(h.directory,'review-fixed.png'),fullPage:true});
  }catch(e){await page.screenshot({path:resolve(h.directory,'failure.png'),fullPage:true}).catch(()=>{});throw e;}
  finally{await context.close();await h.close();}
 }
 {
  const h=await phase2Harness('w05_statistics',{},origin),context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  try{
   const f=await crossFixture(h);await h.app.listen({host:'127.0.0.1',port});assertListenersOwned([{port,pid:process.pid}]);await context.addCookies([{name:'survey_auth',value:h.cookies[0].split('=')[1],url:origin}]);
   const age=f.formal[1];await page.goto(`${origin}/question-statistics/${age.questionId}?versionId=${age.versionId}`);await expect(page.getByTestId('cross-average')).toHaveText('15');await page.getByLabel('数值区间边界（逗号分隔，可留空）',{exact:true}).fill('0,18,30,121');await page.getByRole('button',{name:'查询本人范围',exact:true}).click();await expect(page.getByText('[18, 30)：1 份',{exact:true})).toBeVisible();
   await page.getByLabel('本人问卷范围',{exact:true}).selectOption('selected');await page.getByRole('checkbox',{name:'本人A',exact:true}).check();await page.getByRole('button',{name:'查询本人范围',exact:true}).click();await expect(page.getByTestId('cross-average')).toHaveText('10');await expect(page.getByTestId('cross-surveys')).toHaveText('1 份');
   await page.getByLabel('数值区间边界（逗号分隔，可留空）',{exact:true}).fill('30,0');await page.getByRole('button',{name:'查询本人范围',exact:true}).click();await expect(page.getByRole('alert')).toContainText('请求参数');await page.getByLabel('数值区间边界（逗号分隔，可留空）',{exact:true}).fill('0,18,30,121');await page.getByRole('button',{name:'重新查询',exact:true}).click();await expect(page.getByTestId('cross-average')).toHaveText('10');
   await expect(page.getByRole('button',{name:'查询本人范围',exact:true})).toBeEnabled();for(const width of [320,768,1024,1440]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:resolve(h.directory,`cross-${width}.png`),fullPage:true});}
   for(const i of [2,3]){const q=f.formal[i];await page.goto(`${origin}/question-statistics/${q.questionId}?versionId=${q.versionId}`);await expect(page.getByRole('heading',{name:'选项频数',exact:true})).toBeVisible();await expect(page.getByTestId('cross-answered')).toHaveText('3 份');}
   const text=f.formal[4],survey=await h.getSurvey(f.b),questions=survey.draftDefinition.questions;
   // Add real HTTP text submissions so browser pagination has more than one page.
   for(let i=0;i<21;i++){const r=await h.request('POST',`/public/surveys/${survey.publicId}/responses`,{publishedVersion:survey.currentPublishedVersion,anonymous:true,answers:[{questionId:questions[0].id,type:'single',optionId:'go'},{questionId:questions[4].id,type:'text',text:`追加原文 ${i}`}]},0,{'idempotency-key':crypto.randomUUID()});assert.equal(r.statusCode,201,r.body);}
   await page.goto(`${origin}/question-statistics/${text.questionId}?versionId=${text.versionId}`);await expect(page.getByRole('button',{name:'更多原文回答',exact:true})).toBeVisible();await page.getByRole('button',{name:'更多原文回答',exact:true}).click();await expect(page.locator('.answer-text')).toHaveCount(23);await page.reload();await expect(page.getByRole('heading',{name:'跨问卷题目统计',exact:true})).toBeVisible();assert.equal(errors.length,0,errors.join('\n'));h.saveEvidence('statistics-browser',{fourTypes:true,allMean:'15',selectedMean:'10',boundaries:true,rawPagination:23,widths:[320,768,1024,1440],pageErrors:errors});
  }catch(e){await page.screenshot({path:resolve(h.directory,'failure.png'),fullPage:true}).catch(()=>{});throw e;}
  finally{await context.close();await h.close();}
 }
 console.log('W05 REVIEW FIXES AND FOUR-TYPE STATISTICS REAL BROWSER PASSED');
}finally{await browser.close();}
