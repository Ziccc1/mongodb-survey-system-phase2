import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import {ObjectId,Decimal128} from 'mongodb';
import {MongoClient,testMongoOptions} from './database-client.js';
import { chromium, expect } from '@playwright/test';
import { canonical, normalizeQuestions, validateQuestions } from '@survey/shared';
import type { Question, Editor } from '@survey/shared';
import { buildApp } from '../apps/api/src/app.js';
import {isolatedTestConfig,evidenceDirectory} from './runtime-environment.js';
import { initialize } from '../apps/api/src/database/initialize.js';

const config=isolatedTestConfig('editor','http://127.0.0.1:3103',3103),dbName=config.dbName;
const artifactDirectory=evidenceDirectory('editor');
const client=new MongoClient(config.uri,testMongoOptions());await client.connect();const db=client.db(dbName);await initialize(db);
const app=await buildApp(config,{logger:false});await app.listen({host:'127.0.0.1',port:3103});
const headers={origin:config.origin,'x-csrf-guard':'1'}, password=`Editor-${randomUUID()}`, names=['editor_owner','editor_other'];
const checks:string[]=[];let cookie='',otherCookie='';
const channel=process.env.PLAYWRIGHT_CHANNEL??(existsSync('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe')?'msedge':undefined);
const browser=await chromium.launch({headless:true,...(channel?{channel}:{})});
async function request(method:'GET'|'POST'|'PATCH'|'PUT',path:string,body?:unknown,session=cookie){return app.inject({method,url:`/api/v1${path}`,headers:{...headers,...(session?{cookie:session}:{})},...(body===undefined?{}:{payload:body as object})});}
async function current(id:string):Promise<Editor>{const r=await request('GET',`/surveys/${id}`);assert.equal(r.statusCode,200,r.body);return r.json().data;}
async function check(name:string,run:()=>Promise<void>){await run();checks.push(name);console.log(`PASS ${name}`);}
const q:Question[]=[
  {id:'q1',type:'single',title:'选择水果',required:true,options:[{id:'a',label:'苹果'},{id:'b',label:'香蕉'}],jumpRules:[{id:'r1',condition:{op:'eq',optionId:'a'},targetQuestionId:'q4'},{id:'r2',condition:{op:'eq',optionId:'b'},targetQuestionId:'q3'}]},
  {id:'q2',type:'multiple',title:'选择活动',required:false,options:[{id:'x',label:'游泳'},{id:'y',label:'跑步'},{id:'z',label:'球类'}],validation:{minChoices:1,maxChoices:2},jumpRules:[{id:'r3',condition:{op:'containsAny',optionIds:['x']},targetQuestionId:'q4'},{id:'r4',condition:{op:'containsAll',optionIds:['x','y']},targetQuestionId:'q4'}]},
  {id:'q3',type:'number',title:'年龄',required:true,validation:{min:'-10.50',max:'100.25',integerOnly:false},jumpRules:[{id:'r5',condition:{op:'gte',number:'0.0'},targetQuestionId:'q4'}]},
  {id:'q4',type:'text',title:'建议',required:false,validation:{minLength:2,maxLength:500},jumpRules:[]},
];
try{
  for(const username of names){assert.equal((await request('POST','/auth/register',{username,password})).statusCode,201);const r=await request('POST','/auth/login',{username,password});const c=String(r.headers['set-cookie']).split(';')[0];if(username===names[0])cookie=c;else otherCookie=c;}
  const created=await request('POST','/surveys',{title:'接口编辑验证'});assert.equal(created.statusCode,201);const id=created.json().data.id;
  await check('four types, all condition operators, Decimal128 persistence and stable IDs',async()=>{
    const r=await request('PUT',`/surveys/${id}/questions`,{expectedRevision:0,questions:q});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().data.revision,1);assert.equal(r.json().data.draftDefinitionRevision,2);
    const data=await current(id);assert.equal(canonical(data.draftDefinition.questions),canonical(normalizeQuestions(q)));assert.deepEqual(data.validationIssues,[]);
    const stored=await db.collection('surveys').findOne({_id:new ObjectId(id)});assert.ok(stored!.questions[2].validation.min instanceof Decimal128);assert.equal(stored!.questions[2].validation.min.toString(),'-10.5');assert.ok(stored!.questions[2].jumpRules[0].condition.number instanceof Decimal128);
    for(const op of ['eq','lt','lte','gt','gte'] as const){const input=structuredClone(q);input[2].jumpRules[0].condition.op=op;assert.deepEqual(validateQuestions(input).errors,[]);}
  });
  await check('semantic no-op keeps revision, definition revision and updatedAt',async()=>{
    const before=await db.collection('surveys').findOne({_id:new ObjectId(id)}),input=structuredClone(q);input[2].validation!.min='-10.500';input[2].jumpRules[0].condition.number='0e0';
    const r=await request('PUT',`/surveys/${id}/questions`,{expectedRevision:1,questions:input});assert.equal(r.statusCode,200);assert.equal(r.json().data.revision,1);assert.equal(r.json().data.draftDefinitionRevision,2);
    assert.equal((await db.collection('surveys').findOne({_id:new ObjectId(id)}))!.updatedAt.getTime(),before!.updatedAt.getTime());
  });
  await check('metadata changes, runtime-only deadline, Unicode limits and no-op',async()=>{
    let data=await current(id);
    let r=await request('PATCH',`/surveys/${id}`,{expectedRevision:data.revision,title:'  修改后的标题  ',description:'😀'.repeat(2000)});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().data.draftDefinitionRevision,3);
    data=await current(id);assert.equal(data.draftDefinition.title,'修改后的标题');assert.equal(data.draftDefinition.description,'😀'.repeat(2000));
    r=await request('PATCH',`/surveys/${id}`,{expectedRevision:data.revision,description:'😀'.repeat(2001)});assert.equal(r.statusCode,400);assert.deepEqual(r.json().error.details,[{field:'/description',reason:'TOO_LONG'}]);
    r=await request('PATCH',`/surveys/${id}`,{expectedRevision:data.revision,expiresAt:'2026-10-30T10:00:00Z'});assert.equal(r.statusCode,200);assert.equal(r.json().data.draftDefinitionRevision,3);
    data=await current(id);r=await request('PATCH',`/surveys/${id}`,{expectedRevision:data.revision,expiresAt:'2026-10-30T10:00:00.000Z'});assert.equal(r.json().data.revision,data.revision);
    assert.equal((await request('PATCH',`/surveys/${id}`,{expectedRevision:data.revision})).statusCode,400);
  });
  await check('invalid ranges, duplicate IDs, malformed conditions and decimal precision rejected',async()=>{
    const data=await current(id);
    const bad:Question[][]=[];
    let a=structuredClone(q);a[1].validation={minChoices:3,maxChoices:1};bad.push(a);
    a=structuredClone(q);a[3].validation={minLength:10,maxLength:2};bad.push(a);
    a=structuredClone(q);a[2].validation={min:'2',max:'1',integerOnly:true};bad.push(a);
    a=structuredClone(q);a[2].validation!.min='1.123456789012345678901234567890123456';bad.push(a);
    a=structuredClone(q);a[2].validation!.min='1e6145';bad.push(a);
    a=structuredClone(q);a[1].id='q1';bad.push(a);
    a=structuredClone(q);a[1].jumpRules[0].id='r1';bad.push(a);
    a=structuredClone(q);a[0].options![1].id='a';bad.push(a);
    for(const questions of bad){const r=await request('PUT',`/surveys/${id}/questions`,{expectedRevision:data.revision,questions});assert.equal(r.statusCode,422,r.body);assert.equal(r.json().error.code,'DEFINITION_INVALID');assert.ok(r.json().error.details.length);}
    const shape=structuredClone(q);shape[2].jumpRules[0].condition={op:'containsAny',optionIds:['x']};assert.equal((await request('PUT',`/surveys/${id}/questions`,{expectedRevision:data.revision,questions:shape})).statusCode,400);
    assert.equal((await current(id)).revision,data.revision);
  });
  await check('unfinished target/option references and unsatisfiable publish constraints remain savable',async()=>{
    const data=await current(id),input=structuredClone(q);input[0].jumpRules[0].targetQuestionId='missing_target';input[1].jumpRules[0].condition.optionIds=['missing_option'];input[1].jumpRules[1].targetQuestionId='q1';input[2].validation={min:'0.1',max:'0.2',integerOnly:true};
    const r=await request('PUT',`/surveys/${id}/questions`,{expectedRevision:data.revision,questions:input});assert.equal(r.statusCode,200,r.body);const codes=r.json().data.validationIssues.map((i:{code:string})=>i.code);for(const code of ['TARGET_MISSING','OPTION_MISSING','TARGET_NOT_FORWARD','INTEGER_UNSATISFIABLE'])assert.ok(codes.includes(code));
    const restored=await current(id);assert.equal(restored.draftDefinition.questions[0].jumpRules[0].targetQuestionId,'missing_target');
  });
  await check('cross-user PATCH/PUT and anonymous editing rejected',async()=>{
    const data=await current(id);
    for(const [method,path,body]of [['PATCH',`/surveys/${id}`,{expectedRevision:data.revision,title:'stolen'}],['PUT',`/surveys/${id}/questions`,{expectedRevision:data.revision,questions:q}]]as const){const denied=await request(method,path,body,otherCookie);assert.equal(denied.statusCode,404);assert.equal(denied.json().error.code,'NOT_FOUND');assert.equal((await request(method,path,body,'')).statusCode,401);}
    assert.equal((await current(id)).revision,data.revision);
  });
  await check('stale and racing revisions cannot overwrite another save',async()=>{
    const data=await current(id);
    const r=await request('PUT',`/surveys/${id}/questions`,{expectedRevision:data.revision-1,questions:q});assert.equal(r.statusCode,409);assert.equal(r.json().error.code,'EDIT_CONFLICT');
    const results=await Promise.all([request('PUT',`/surveys/${id}/questions`,{expectedRevision:data.revision,questions:q}),request('PATCH',`/surveys/${id}`,{expectedRevision:data.revision,title:'并发标题'})]);
    assert.deepEqual(results.map(r=>r.statusCode).sort(),[200,409]);assert.equal((await current(id)).revision,data.revision+1);
  });
  await check('paused fixture with response stays editable; policy/state rules and snapshot comparison',async()=>{
    // Explicit DB fixtures test editing boundaries, not implemented publication/submission APIs.
    const fixture=(await request('POST','/surveys',{title:'暂停后编辑',allowRepeat:true})).json().data.id;
    await request('PUT',`/surveys/${fixture}/questions`,{expectedRevision:0,questions:q});
    const doc=await db.collection('surveys').findOne({_id:new ObjectId(fixture)}),now=new Date();assert.ok(doc);
    const definition={title:doc.title,description:doc.description,questions:doc.questions},hash=createHash('sha256').update(canonical(normalizeQuestions(q))).digest('hex');
    await db.collection('survey_versions').insertOne({schemaVersion:1,surveyId:doc._id,version:1,sourceDefinitionVersion:doc.definitionVersion,definition,policySnapshot:{allowAnonymous:doc.allowAnonymous,allowRepeat:doc.allowRepeat},definitionHash:hash,publishedAt:now,publishedBy:doc.ownerId,publicationRequestId:randomUUID(),publicationRequestHash:hash,origin:{kind:'publication'}});
    const response={schemaVersion:2,surveyId:doc._id,surveyDefinitionVersion:1,respondentId:doc.ownerId,anonymous:false,repeatAllowed:true,requestId:randomUUID(),payloadHash:hash,payloadHashVersion:2,answers:[],submittedAt:now};await db.collection('responses').insertOne(response);
    await db.collection('surveys').updateOne({_id:doc._id},{$set:{status:'published',currentPublishedVersion:1,firstPublishedAt:now,structureLocked:true,submissionCount:1,currentVersionSubmissionCount:1}});
    assert.equal((await current(fixture)).hasUnpublishedChanges,false);
    assert.equal((await request('PUT',`/surveys/${fixture}/questions`,{expectedRevision:1,questions:q})).statusCode,409);
    assert.equal((await request('PATCH',`/surveys/${fixture}`,{expectedRevision:1,allowAnonymous:true})).json().error.code,'POLICY_LOCKED');
    assert.equal((await request('PATCH',`/surveys/${fixture}`,{expectedRevision:1,expiresAt:null,allowRepeat:true})).statusCode,200);
    await db.collection('surveys').updateOne({_id:doc._id},{$set:{status:'paused'}});
    const changed=structuredClone(q);changed[0].title='暂停后仍可修改';let r=await request('PUT',`/surveys/${fixture}/questions`,{expectedRevision:1,questions:changed});assert.equal(r.statusCode,200,r.body);assert.equal(r.json().data.hasUnpublishedChanges,true);
    r=await request('PUT',`/surveys/${fixture}/questions`,{expectedRevision:2,questions:q});assert.equal(r.statusCode,200);assert.equal(r.json().data.hasUnpublishedChanges,false);
    assert.equal(await db.collection('responses').countDocuments({surveyId:doc._id}),1);assert.equal(await db.collection('survey_versions').countDocuments({surveyId:doc._id}),1);assert.equal((await db.collection('surveys').findOne({_id:doc._id}))!.submissionCount,1);
    assert.equal((await db.collection('survey_versions').findOne({surveyId:doc._id}))!.definition.questions[0].title,q[0].title);
  });

  const context=await browser.newContext();await context.addCookies([{name:'survey_auth',value:cookie.slice('survey_auth='.length),url:config.origin}]);const page=await context.newPage({viewport:{width:1280,height:1000}});const pageErrors:string[]=[];page.on('pageerror',e=>pageErrors.push(e.message));
  const ui=(await request('POST','/surveys',{title:'可操作题目编辑'})).json().data.id;
  await check('browser adds all four types, edits metadata, options, constraints and rule priority',async()=>{
    await page.goto(`${config.origin}/surveys/${ui}`);await page.getByRole('heading',{name:'可操作题目编辑',exact:true}).waitFor();
    await page.getByLabel('问卷说明',{exact:true}).fill('😀'.repeat(2001));await expect(page.getByRole('button',{name:'保存基本信息',exact:true})).toBeDisabled();await expect(page.locator('#edit-description-error')).toContainText('超出 1');
    await page.getByLabel('问卷说明',{exact:true}).fill('题目编辑测试说明');await page.locator('#editor-settings').evaluate(el=>(el as HTMLDetailsElement).open=true);await page.getByRole('button',{name:'保存基本信息',exact:true}).click();await expect(page.getByRole('status')).toContainText('基本信息已保存');
    for(const type of ['单选题','多选题','数字题','文本题'])await page.getByRole('button',{name:`添加${type}`,exact:true}).click();
    const cards=page.getByTestId('question');await expect(cards).toHaveCount(4);
    const titles=['喜欢的水果','平时的活动','年龄数字','其他建议'];for(let i=0;i<4;i++)await cards.nth(i).getByLabel('题干',{exact:true}).fill(titles[i]);
    await cards.nth(0).getByRole('checkbox',{name:'必答',exact:true}).check();await cards.nth(0).getByLabel('选项 1',{exact:true}).fill('苹果');await cards.nth(0).getByRole('button',{name:'添加选项',exact:true}).click();await cards.nth(0).getByLabel('选项 3',{exact:true}).fill('橘子');
    await cards.nth(1).getByLabel('最少选择',{exact:true}).fill('2');await cards.nth(1).getByLabel('最多选择',{exact:true}).fill('1');await expect(page.getByRole('alert')).toContainText('最小限制不能大于最大限制');await expect(page.getByRole('button',{name:'保存题目',exact:true})).toBeDisabled();await cards.nth(1).getByLabel('最多选择',{exact:true}).fill('2');
    await cards.nth(2).getByLabel('数字下限',{exact:true}).fill('0');await cards.nth(2).getByLabel('数字上限',{exact:true}).fill('120');await cards.nth(2).getByLabel('只允许整数',{exact:true}).check();await cards.nth(3).getByLabel('最少字符',{exact:true}).fill('1');await cards.nth(3).getByLabel('最多字符',{exact:true}).fill('300');
    const textId=await cards.nth(3).getAttribute('data-question-id');assert.ok(textId);
    for(const index of [0,1,2]){await cards.nth(index).getByRole('button',{name:'添加跳转规则',exact:true}).click();await cards.nth(index).getByLabel('跳转到',{exact:true}).selectOption(textId);}
    await cards.nth(1).getByLabel('条件',{exact:true}).selectOption('containsAll');await cards.nth(1).getByTestId('rule').getByLabel('选项2',{exact:true}).check();
    await cards.nth(2).getByLabel('比较条件',{exact:true}).selectOption('gte');await cards.nth(2).getByLabel('比较值',{exact:true}).fill('18');
    await cards.nth(0).getByRole('button',{name:'添加跳转规则',exact:true}).click();const rules=cards.nth(0).getByTestId('rule');await rules.nth(1).getByLabel('跳转到',{exact:true}).selectOption(textId);const secondId=await rules.nth(1).getAttribute('data-rule-id');await rules.nth(1).getByRole('button',{name:'规则2上移',exact:true}).click();assert.equal(await rules.nth(0).getAttribute('data-rule-id'),secondId);
    await cards.nth(3).getByRole('button',{name:'第4题上移',exact:true}).click();await expect(page.locator('.definition-issues')).toContainText('跳转目标须位于当前题之后');await cards.nth(2).getByRole('button',{name:'第3题下移',exact:true}).click();
    await page.getByRole('button',{name:'保存题目',exact:true}).click();await expect(page.getByRole('status')).toContainText('题目已保存');
    const saved=await current(ui);assert.equal(saved.draftDefinition.questions.length,4);assert.equal(saved.draftDefinition.questions[0].jumpRules[0].id,secondId);assert.equal(saved.draftDefinition.questions[2].validation!.max,'120');
    await page.reload();await expect(page.getByTestId('question')).toHaveCount(4);await expect(page.getByTestId('question').nth(2).getByLabel('数字上限',{exact:true})).toHaveValue('120');const again=await current(ui);assert.equal(canonical(again.draftDefinition.questions),canonical(saved.draftDefinition.questions));
  });
  await check('browser preserves local edits during real revision conflict and allows explicit resolution',async()=>{
    const card=page.getByTestId('question').nth(0);await card.getByLabel('题干',{exact:true}).fill('保留本地题干');const before=await current(ui);
    assert.equal((await request('PATCH',`/surveys/${ui}`,{expectedRevision:before.revision,title:'另一窗口的新标题'})).statusCode,200);
    await page.getByRole('button',{name:'保存题目',exact:true}).click();await expect(page.locator('.conflict')).toBeVisible();await expect(card.getByLabel('题干',{exact:true})).toHaveValue('保留本地题干');await expect(page.getByRole('button',{name:'保存题目',exact:true})).toBeDisabled();
    await page.getByRole('button',{name:'已比较，保留本地并采用最新修订号',exact:true}).click();await expect(card.getByLabel('题干',{exact:true})).toHaveValue('保留本地题干');await page.getByRole('button',{name:'保存题目',exact:true}).click();await expect(page.getByRole('status')).toContainText('题目已保存');assert.equal((await current(ui)).draftDefinition.questions[0].title,'保留本地题干');
    // Metadata is still intentionally local; explicitly save it before refresh.
    await page.locator('#editor-settings').evaluate(el=>(el as HTMLDetailsElement).open=true);await page.getByRole('button',{name:'保存基本信息',exact:true}).click();await expect(page.getByRole('status')).toContainText('基本信息已保存');
  });
  await check('browser deletion keeps unfinished references, supports save/reload and mobile layout',async()=>{
    const cards=page.getByTestId('question');await cards.nth(3).getByRole('button',{name:'删除第4题',exact:true}).click();await expect(cards).toHaveCount(3);await expect(page.locator('.definition-issues')).toContainText('目标尚未选择或已删除');
    await cards.nth(0).getByRole('button',{name:'删除选项1',exact:true}).click();await expect(page.locator('.definition-issues')).toContainText('条件选项已失效');await page.getByRole('button',{name:'保存题目',exact:true}).click();await expect(page.getByRole('status')).toContainText('题目已保存');await page.reload();await expect(page.getByTestId('question')).toHaveCount(3);await expect(page.locator('.definition-issues')).toContainText('目标尚未选择或已删除');
    await mkdir(`${artifactDirectory}`,{recursive:true});await page.screenshot({path:`${artifactDirectory}/editor-desktop.png`,fullPage:true});
    for(const width of [320,768,1024,1440]){await page.setViewportSize({width,height:1000});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`overflow at ${width}`);}
    await page.setViewportSize({width:320,height:1000});await page.screenshot({path:`${artifactDirectory}/editor-mobile.png`,fullPage:true});assert.deepEqual(pageErrors,[]);
    assert.equal(await page.getByRole('button',{name:/复制问卷|断点恢复|自动保存/}).count(),0);
  });
  await mkdir(`${artifactDirectory}`,{recursive:true});const result={date:new Date().toISOString(),status:'passed',database:dbName,checks,checkCount:checks.length,realBrowser:'Edge/Chromium via Playwright',publishedAndResponseFixtures:'DB fixtures only; publication/submission APIs not implemented',retainedTestData:true,noSchemaChange:true};await writeFile(`${artifactDirectory}/editor.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{await browser.close();await app.close();await client.close();}
