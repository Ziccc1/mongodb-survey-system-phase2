import {ref} from 'vue';
import type {Question,QuestionContent,Page} from '@survey/shared';
import {api,RequestError} from './api';
import {canonical} from '@survey/shared';
export function contentOf(q:Question):QuestionContent{
 const {id,required,jumpRules,...content}=JSON.parse(JSON.stringify(q)) as Question;
 return content as QuestionContent;
}
export function useOperation(send:typeof api=api){
 const pending=ref<{path:string;body:unknown;key:string}|null>(null);
 return {pending,async run<T>(path:string,body:unknown):Promise<T>{
  if(pending.value&&(pending.value.path!==path||canonical(pending.value.body)!==canonical(body)))throw new Error('原操作结果尚未确认，请先重试原操作；不能切换动作或修改请求。');
  pending.value??={path,body:JSON.parse(JSON.stringify(body)),key:crypto.randomUUID()};const request=pending.value;
  try{const result=await send<T>(request.path,'POST',request.body,{'Idempotency-Key':request.key});pending.value=null;return result;}
  catch(error){if(error instanceof RequestError&&error.status<500)pending.value=null;throw error;}
 }};
}
export const queryPage=(query:Record<string,string|undefined>)=>'?'+new URLSearchParams(Object.entries(query).filter((entry):entry is [string,string]=>entry[1]!==undefined)).toString();
