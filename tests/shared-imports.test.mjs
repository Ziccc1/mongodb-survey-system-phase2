import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';

// Do not import shared here: each entry must initialize in its own cold ESM process.
const modules=['questions','answers','question-content','index'];
for(const layer of ['src','dist'])for(const entry of modules){
  test(`cold direct import ${layer}/${entry}`,()=>{
    const extension=layer==='src'?'ts':'js';
    const urls=Object.fromEntries(modules.map(name=>[name,new URL(`../packages/shared/${layer}/${name}.${extension}`,import.meta.url).href]));
    const script=`
      import assert from 'node:assert/strict';
      const urls=${JSON.stringify(urls)};
      await import(urls[${JSON.stringify(entry)}]);
      const q=await import(urls.questions);
      const a=await import(urls.answers);
      const c=await import(urls['question-content']);
      const index=await import(urls.index);
      assert.equal(q.questionSchema.oneOf.length,4);
      assert.equal(c.questionContentSchema.oneOf.length,4);
      assert.equal(index.codePointLength('😀汉'),2);
      assert.equal(index.questionSchema,q.questionSchema);
      assert.equal(index.validateQuestions,q.validateQuestions);
      assert.equal(index.evaluateAnswers,a.evaluateAnswers);
      assert.equal(index.materializeQuestion,c.materializeQuestion);
      const content={type:'text',title:'😀汉',validation:{maxLength:2}};
      const question=c.materializeQuestion(content,{required:true,jumpRules:[]},'text');
      assert.deepEqual(c.extractQuestionContent(question),content);
      assert.deepEqual(q.validateQuestions([question]),{errors:[],validationIssues:[]});
      assert.equal(a.evaluateAnswers([question],[{questionId:'text',type:'text',text:'😀汉'}]).errors.length,0);
      assert.equal(a.evaluateAnswers([question],[{questionId:'text',type:'text',text:'😀汉字'}]).errors[0].reason,'TEXT_LENGTH');
      console.log('COLD_IMPORT_OK');
    `;
    const result=spawnSync(process.execPath,[...(layer==='src'?['--import','tsx']:[]),'--input-type=module','--eval',script],{
      encoding:'utf8',windowsHide:true,timeout:15000,
    });
    assert.ifError(result.error);
    assert.equal(result.status,0,`${layer}/${entry}\n${result.stderr}\n${result.stdout}`);
    assert.equal(result.signal,null);
    assert.match(result.stdout,/COLD_IMPORT_OK/);
  });
}
