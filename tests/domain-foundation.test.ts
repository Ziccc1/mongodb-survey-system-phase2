import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ObjectId,Decimal128,BSON} from 'mongodb';
import {reactive} from 'vue';
import {extractQuestionContent as content,extractQuestionConfig as config,materializeQuestion as materialize,normalizeQuestions,normalizeQuestionParts,parseQuestionContent,validateQuestions,evaluateAnswers,canonical,decimalValue} from '@survey/shared';
import type {Question} from '@survey/shared';
import {contentFromBson,contentToBson,configFromBson,configToBson} from '../apps/api/src/content-codec.js';
import {fromBson} from '../apps/api/src/question-codec.js';
import {hash} from '../apps/api/src/core/common.js';
import {assertOperationReceiptBounds,assertTemplateBounds} from '../apps/api/src/database/document-guards.js';
const choices=[{id:'yes',label:'是'},{id:'no',label:'否'}];
const fixtures:Question[]=[
 {id:'s',type:'single',title:'选择😀',required:true,options:choices,jumpRules:[{id:'r',condition:{op:'eq',optionId:'no'},targetQuestionId:'n'}]},
 {id:'m',type:'multiple',title:'多选',required:false,options:choices,validation:{},jumpRules:[]},
 {id:'t',type:'text',title:'文字',required:false,validation:{maxLength:2},jumpRules:[]},
 {id:'n',type:'number',title:'数字',required:false,validation:{min:'-1.25e2',max:'1e3',integerOnly:false},jumpRules:[{id:'nr',condition:{op:'gte',number:'0'},targetQuestionId:'missing'}]},
];
test('four types round trip; Vue proxy, IDs, options, config isolation and hashes',()=>{
 for(const q of fixtures){const c=content(reactive(q)),g=config(q),a=materialize(c,g,q.id),b=materialize(c,g,q.id);
  assert.deepEqual(a,q);assert.equal(canonical(normalizeQuestions([a])),canonical(normalizeQuestions([q])));
  assert.deepEqual(Object.keys(c).filter(k=>['id','required','jumpRules'].includes(k)),[]);
  a.jumpRules.push({id:'changed',condition:{op:'eq',optionId:'yes'},targetQuestionId:'other'});assert.deepEqual(b.jumpRules,q.jumpRules);
  if(a.options){a.options[0].label='changed';assert.equal((c as {options:typeof choices}).options[0].label,'是');}
  assert.deepEqual(contentFromBson(contentToBson(c)),normalizeQuestionParts(c,{required:false,jumpRules:[]},q.id).content);
  assert.deepEqual(configFromBson(configToBson(g,q.type),q.type),normalizeQuestionParts(c,g,q.id).config);
 }
 const sample=JSON.parse(readFileSync('docs/phase2/collection-examples.json','utf8')).examples;
 const definition=fromBson(BSON.EJSON.deserialize(sample.survey_versions.definition));
 assert.equal(hash({definition,policy:sample.survey_versions.policySnapshot}),sample.survey_versions.definitionHash);
 const answers=fromBson(BSON.EJSON.deserialize(sample.responses.answers));
 assert.equal(hash({publishedVersion:1,anonymous:false,answers}),sample.responses.payloadHash);
});
test('strict shapes, semantic limits and soft draft validation reuse old path',()=>{
 const c=content(fixtures[0]);for(const extra of [{id:'evil'},{required:false},{jumpRules:[]},{unknown:1}])assert.throws(()=>parseQuestionContent({...c,...extra}));
 assert.throws(()=>parseQuestionContent({...c,validation:{}}));assert.throws(()=>parseQuestionContent({...content(fixtures[2]),validation:{minLength:3,maxLength:2}}));
 assert.throws(()=>parseQuestionContent({...c,options:[{id:'a',label:'a',extra:1},{id:'b',label:'b'}]}));
 assert.throws(()=>parseQuestionContent({type:'number',title:'n',validation:{integerOnly:true,min:'NaN'}}));
 assert.throws(()=>parseQuestionContent({type:'text',title:'😀'.repeat(501),validation:{}}));
 assert.doesNotThrow(()=>parseQuestionContent({type:'text',title:'😀'.repeat(500),validation:{}}));
 const rebuilt=fixtures.map(q=>materialize(content(q),config(q),q.id));assert.deepEqual(validateQuestions(rebuilt),validateQuestions(fixtures));
 assert.ok(validateQuestions(rebuilt).validationIssues.some(i=>i.code==='TARGET_MISSING'));
 assert.deepEqual(evaluateAnswers(rebuilt,[{questionId:'s',type:'single',optionId:'no'},{questionId:'n',type:'number',number:'0'}]).path.map(q=>q.id),['s','n']);
});
test('Decimal exact boundaries and BSON special objects stay intact',()=>{
 for(const n of ['0','-1.25','1e-6176','9.999999999999999999999999999999999e6144','1234567890123456789012345678901234']){
  const c={type:'number' as const,title:'n',validation:{integerOnly:false,min:n}};
  assert.equal((contentFromBson(contentToBson(c)) as typeof c).validation.min,decimalValue(n)!.toString());
 }
 const id=new ObjectId(),date=new Date();const result=fromBson({id,date,n:Decimal128.fromString('0'),text:'123'}) as {id:ObjectId;date:Date;n:string;text:string};
 assert.equal(result.id,id);assert.equal(result.date,date);assert.equal(result.n,'0');assert.equal(result.text,'123');
});
test('receipt operation/status/unknown keys and actual BSON size; template node limit',()=>{
 const source=JSON.parse(readFileSync('docs/phase2/collection-examples.json','utf8'));
 const receipt=BSON.EJSON.deserialize(source.supportingDocuments.operation_receipts[0]);
 assert.doesNotThrow(()=>assertOperationReceiptBounds(receipt));
 assert.throws(()=>assertOperationReceiptBounds({...receipt,firstHttpStatus:201}));
 assert.throws(()=>assertOperationReceiptBounds({...receipt,result:{...receipt.result,data:{...receipt.result.data,replayed:false}}}));
 const issues=Array.from({length:400},()=>({code:'LIMIT',field:'/x',questionId:null,message:'汉'.repeat(1000)}));
 assert.throws(()=>assertOperationReceiptBounds({...receipt,result:{kind:'instanceSave',data:{...receipt.result.data,validationIssues:issues}}}),/RECEIPT_TOO_LARGE/);
 const template=BSON.EJSON.deserialize(source.examples.survey_templates);assert.doesNotThrow(()=>assertTemplateBounds(template));
 template.bindings=Array.from({length:20},()=>({...template.bindings[0],distributionProof:{lineageHash:'0'.repeat(64),obligations:Array.from({length:32},()=>({questionVersionId:new ObjectId()}))}}));
 assert.throws(()=>assertTemplateBounds(template),/LINEAGE_LIMIT/);
});
