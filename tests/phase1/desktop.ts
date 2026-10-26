import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync,existsSync} from 'node:fs';
import {chromium,expect} from '@playwright/test';
import type {Question} from '@survey/shared';
import {harness} from './harness.js';
import {MongoClient,testMongoOptions} from '../database-client.js';
import {loadConfig} from '../../apps/api/src/config.js';
import {buildApp} from '../../apps/api/src/app.js';
import {signAuth} from '../../apps/api/src/security.js';
const origin='http://127.0.0.1:3112',resuming=process.argv[2]==='--after',verifying=process.argv[2]==='--verify';
async function resume(){
 const dbName=process.argv[3];assert.match(dbName,/^project1_test_desktop_\d+$/);
 const base=loadConfig(),uri=new URL(base.uri);uri.pathname='/'+dbName;
 const config={...base,dbName,uri:uri.toString(),origin,publicAppUrl:origin},client=new MongoClient(config.uri,testMongoOptions());await client.connect();
 const db=client.db(dbName),app=await buildApp(config,{logger:false}),survey=await db.collection('surveys').findOne({title:'校园学习空间使用调查'});assert.ok(survey);
 const cookies=[`survey_auth=${await signAuth(survey.ownerId.toHexString(),config)}`];
 return {app,client,db,dbName,config,cookies,close:async()=>{await app.close();await client.close();}} as Awaited<ReturnType<typeof harness>>;
}
const h=resuming?await resume():await harness('desktop',{},origin);
let server=h.app;
await h.app.listen({host:'127.0.0.1',port:3112});
const questions:Question[]=[
 {id:'place',type:'single',title:'你通常在哪里进行课后学习？',required:true,options:[{id:'library',label:'图书馆'},{id:'room',label:'自习教室'},{id:'dorm',label:'宿舍'}],jumpRules:[]},
 {id:'needs',type:'multiple',title:'选择学习空间时，你看重哪些因素？',required:false,options:[{id:'quiet',label:'安静的环境'},{id:'power',label:'充足的电源'},{id:'seat',label:'舒适的座位'}],validation:{maxChoices:3},jumpRules:[]},
 {id:'time',type:'number',title:'每周在校自习时间（小时）',required:false,validation:{integerOnly:false,min:'0'},jumpRules:[]},
 {id:'advice',type:'text',title:'你希望学习空间有哪些改善？',required:false,validation:{maxLength:500},jumpRules:[]},
];
const existing=resuming?await h.db.collection('surveys').findOne({title:'校园学习空间使用调查'}):null;
const s=resuming?{id:existing!._id.toHexString(),publicId:existing!.publicId}:await h.draft(questions,{title:'校园学习空间使用调查',description:'了解同学们的学习习惯和空间需求，为校园学习环境改善提供参考。请根据你的实际体验填写，感谢参与。',allowAnonymous:true,allowRepeat:true});
if(!resuming){await h.publish(s.id);
for(const [option,hours] of [['library','8'],['library','12'],['room','10']])assert.equal((await h.request('POST',`/public/surveys/${s.publicId}/responses`,{publishedVersion:1,anonymous:true,answers:[{questionId:'place',type:'single',optionId:option},{questionId:'needs',type:'multiple',optionIds:['quiet','power']},{questionId:'time',type:'number',number:hours},{questionId:'advice',type:'text',text:'希望增加安静区域和插座。'}]},0,{'idempotency-key':randomUUID()})).statusCode,201);
await h.draft(questions.slice(0,2),{title:'课程项目体验反馈',description:'本课程项目的使用体验与改进建议。'});
const closed=await h.draft(questions.slice(0,1),{title:'学习习惯与时间安排'});await h.publish(closed.id);await h.state(closed.id,'close');
}
const browser=await chromium.launch({headless:true,...(existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')?{channel:'msedge'}:{})});
const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.addCookies([{name:'survey_auth',value:h.cookies[0].slice('survey_auth='.length),url:origin}]);
const page=await context.newPage(),errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const directory=resuming?process.argv[4]:`docs/testing/screenshots/desktop-polish-${Date.now()}`;assert.match(directory,/^docs\/testing\/screenshots\/desktop-polish-\d+$/);mkdirSync(directory,{recursive:true});
const paths={login:'/login',dashboard:'/dashboard',list:'/surveys',editor:`/surveys/${s.id}`,fill:`/survey/${s.publicId}`,statistics:`/surveys/${s.id}/statistics`};
async function captures(phase:string){
 mkdirSync(`${directory}/${phase}`,{recursive:true});
 for(const [name,path] of Object.entries(paths)){
  await page.goto(origin+path);await page.locator('h1').waitFor();
  if(name==='list')await page.locator('.survey-row').first().waitFor();
  if(name==='editor')await page.getByTestId('question').first().waitFor();
  if(name==='statistics')await page.locator('.choice-chart svg').first().waitFor();
  if(name==='fill')await page.locator('.fill-question').first().waitFor();
  if(phase==='after'&&name==='dashboard')await page.locator('.recent-surveys .survey-row').first().waitFor();
  await page.evaluate(()=>document.fonts.ready);await page.screenshot({path:`${directory}/${phase}/${name}.png`});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`${name} horizontal overflow`);
 }
}
try{
 if(!resuming&&!verifying){await captures('before');console.log(`BEFORE CAPTURED: ${directory}; fixture ${h.dbName}. Waiting for build; send newline to continue.`);
 await new Promise<void>(resolve=>process.stdin.once('data',()=>resolve()));
 // Static file routes are registered at startup; refresh them after a new dist build.
 await h.app.close();server=await buildApp(h.config,{logger:false});await server.listen({host:'127.0.0.1',port:3112});}
 await captures('after');
 await page.goto(origin+'/dashboard');await expect(page.locator('.recent-surveys .survey-row')).toHaveCount(3);await expect(page.locator('.recent-surveys')).toContainText('校园学习空间使用调查');
 const current=(await (await context.request.get(`${origin}/api/v1/surveys/${s.id}`)).json()).data;
 assert.equal((await context.request.post(`${origin}/api/v1/surveys/${s.id}/pause`,{headers:{origin,'x-csrf-guard':'1'},data:{expectedRevision:current.revision}})).status(),200);
 await page.locator('.dashboard-entry').filter({hasText:'我的问卷'}).click();await expect(page.locator('.survey-row')).toHaveCount(3);await page.locator('.survey-row').filter({hasText:'校园学习空间使用调查'}).click();
 await page.getByRole('button',{name:'第3题：每周在校自习时间（小时）',exact:true}).click();await expect(page.getByTestId('question').nth(2)).toHaveClass(/is-current/);await expect(page.getByTestId('question').nth(2).getByLabel('题干',{exact:true})).toBeFocused();
 await page.getByRole('button',{name:'添加文本题',exact:true}).click();const added=page.getByTestId('question').last();await expect(added.getByLabel('题干',{exact:true})).toBeFocused();await added.getByLabel('题干',{exact:true}).fill('你愿意补充的建议');await page.getByRole('button',{name:'保存题目',exact:true}).click();await expect(page.getByRole('status')).toContainText('题目已保存');await page.reload();await expect(page.getByTestId('question')).toHaveCount(5);
 await page.goto(origin+paths.statistics);await expect(page.getByTestId('selected-count')).toHaveText('3 份');await expect(page.getByRole('row',{name:'图书馆 2 66.7%',exact:true})).toBeVisible();assert.deepEqual(errors,[]);
 writeFileSync(`${directory}/result.json`,JSON.stringify({status:'passed',database:h.dbName,fixtureNote:verifying?'Fresh isolated fixtures; verification screenshots only, not a before/after comparison':'Same isolated database and definitions before/after; real test responses, not business data',screens:Object.keys(paths),pageErrors:errors,checks:['six representative pages at 1440x1000','real recent surveys and navigation','directory selects/focuses original question','bottom add/manual save/refresh','version statistics and percent table']},null,2));
 console.log(`PASS desktop composition, real recent items, editor directory/add/save, report. Comparison evidence: ${directory}`);
}finally{await browser.close();if(server!==h.app)await server.close();await h.close();}
