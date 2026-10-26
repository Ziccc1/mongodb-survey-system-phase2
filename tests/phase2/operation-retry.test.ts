import test from 'node:test';
import assert from 'node:assert/strict';
import {useOperation} from '../../apps/web/src/library-client.js';
import {RequestError} from '../../apps/web/src/api.js';
test('unknown operation preserves exact key/body and rejects another action or request before sending',async()=>{
 const sent:{path:string;body:unknown;headers:unknown}[]=[];let mode='lost';
 const op=useOperation(async<T>(path:string,_method?:string,body?:unknown,headers?:Record<string,string>)=>{sent.push({path,body,headers});if(mode==='lost')throw Error('response lost');return {resourceId:'original'} as T;});
 const body={expectedRevision:1,sourceVersionId:'old'};
 await assert.rejects(op.run('/questions/q/restorations',body));const original=JSON.parse(JSON.stringify(op.pending.value));
 await assert.rejects(op.run('/question-versions/v/forks',{content:{}}),/不能切换/);
 await assert.rejects(op.run('/questions/q/restorations',{...body,sourceVersionId:'different'}),/不能切换/);assert.equal(sent.length,1);assert.deepEqual({...op.pending.value},original);
 mode='success';assert.deepEqual(await op.run('/questions/q/restorations',body),{resourceId:'original'});assert.deepEqual(sent[0],sent[1]);assert.equal(op.pending.value,null);
});
test('definitive client errors release pending; 503 retains it',async()=>{
 for(const status of [400,409,422,503]){const op=useOperation(async()=>{throw new RequestError(status,'CODE','failure','trace');});await assert.rejects(op.run('/x',{}));assert.equal(!!op.pending.value,status>=500);}
});
