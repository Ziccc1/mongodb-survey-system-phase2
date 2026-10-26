import test from 'node:test';
import assert from 'node:assert/strict';
import {ObjectId} from 'mongodb';
import {prepareOperation} from '../apps/api/src/database/operation-contract.js';
import {ApiError} from '../apps/api/src/errors.js';

const actor=new ObjectId(),versionId=new ObjectId().toHexString();
for(const operation of ['createQuestion','forkQuestion'] as const){
  const prepare=(content:unknown)=>prepareOperation(actor,{operation,path:operation==='forkQuestion'?{versionId}:{},body:{content},requestKey:'content-review'});
  test(`${operation}: structural errors remain 400 INVALID_REQUEST`,()=>{
    for(const content of [null,{},
      {type:'text',title:'t',validation:{},extra:true},
      {type:'text',title:123,validation:{}},
      {type:'number',title:'n',validation:{integerOnly:false,min:1}},
      {type:'single',title:'s',options:[{id:'a',label:'a',extra:1},{id:'b',label:'b'}]},
    ])assert.throws(()=>prepare(content),e=>e instanceof ApiError&&e.status===400&&e.code==='INVALID_REQUEST');
  });
  test(`${operation}: semantic errors return 422 with Content fields and reasons`,()=>{
    const fixtures:[unknown,string,string][]=[
      [{type:'single',title:'s',options:[{id:'a',label:'a'},{id:'a',label:'b'}]},'DUPLICATE_ID','/content/options/1/id'],
      [{type:'text',title:'t',validation:{minLength:3,maxLength:2}},'MIN_MAX','/content/validation/minLength'],
      [{type:'multiple',title:'m',options:[{id:'a',label:'a'},{id:'b',label:'b'}],validation:{minChoices:2,maxChoices:1}},'MIN_MAX','/content/validation/minChoices'],
      [{type:'number',title:'n',validation:{integerOnly:false,min:'NaN'}},'DECIMAL_INVALID','/content/validation/min'],
      [{type:'number',title:'n',validation:{integerOnly:false,min:'1e6145'}},'DECIMAL_INVALID','/content/validation/min'],
      [{type:'number',title:'n',validation:{integerOnly:false,min:'2',max:'1'}},'MIN_MAX','/content/validation/min'],
      [{type:'text',title:'   ',validation:{}},'TITLE_LENGTH','/content/title'],
    ];
    for(const [content,reason,field] of fixtures)assert.throws(()=>prepare(content),e=>{
      assert.ok(e instanceof ApiError);assert.equal(e.status,422);assert.equal(e.code,'DEFINITION_INVALID');
      assert.ok(e.details.some(d=>d.reason===reason&&d.field===field));
      assert.ok(e.details.every(d=>d.questionId===undefined));return true;
    });
  });
  test(`${operation}: normalization and saveable draft issues remain accepted`,()=>{
    const content={type:'number',title:'数字',validation:{integerOnly:false,min:'1.0',max:'2e0'}};
    assert.equal(prepare(content).requestHash,prepare({...content,validation:{integerOnly:false,min:'1',max:'2'}}).requestHash);
    assert.doesNotThrow(()=>prepare({...content,validation:{integerOnly:true,min:'1.1',max:'1.9'}}));
  });
  test(`${operation}: unexpected errors are not disguised as invalid requests`,()=>{
    const failure=new Error('unexpected content access failure');
    const content={type:'text',get title(){throw failure;},validation:{}};
    assert.throws(()=>prepare(content),e=>e===failure);
  });
}
