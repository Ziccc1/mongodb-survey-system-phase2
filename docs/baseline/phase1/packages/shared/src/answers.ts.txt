import type {Answer,SubmitCommand} from './core-types.js';
import type {Question} from './questions.js';
import {decimalValue} from './questions.js';
import {codePointLength} from './index.js';
export interface AnswerIssue {questionId:string;field:string;reason:string;message:string}
const stableId={type:'string',minLength:1,maxLength:128,pattern:'^[A-Za-z0-9_-]+$'};
const object=(properties:Record<string,unknown>)=>({type:'object',additionalProperties:false,required:Object.keys(properties),properties});
export const answerSchema={oneOf:[
  object({questionId:stableId,type:{const:'single'},optionId:stableId}),
  object({questionId:stableId,type:{const:'multiple'},optionIds:{type:'array',minItems:1,maxItems:100,uniqueItems:true,items:stableId}}),
  object({questionId:stableId,type:{const:'text'},text:{type:'string',minLength:1,maxLength:10000}}),
  object({questionId:stableId,type:{const:'number'},number:{type:'string',minLength:1,maxLength:128}}),
]};
export const submitSchema=object({publishedVersion:{type:'integer',minimum:1,maximum:Number.MAX_SAFE_INTEGER},anonymous:{type:'boolean'},answers:{type:'array',maxItems:100,items:answerSchema}});
export function hasAnswer(answer:Answer|undefined):answer is Answer{return !!answer&&(answer.type==='text'?!!answer.text.trim():answer.type==='multiple'?answer.optionIds.length>0:answer.type==='single'?!!answer.optionId:answer.number!=='');}
export function answerIssues(question:Question,answer:Answer|undefined):AnswerIssue[]{
  const result:AnswerIssue[]=[],add=(reason:string,message:string)=>result.push({questionId:question.id,field:`/answers/${question.id}`,reason,message});
  if(!hasAnswer(answer)){if(question.required)add('REQUIRED','请回答这道必答题');return result;}
  const v=question.validation??{};
  if(answer.type==='multiple') {const min=v.minChoices??(question.required?1:0),max=v.maxChoices??question.options!.length;if(answer.optionIds.length<min||answer.optionIds.length>max)add('CHOICE_COUNT',`请选择${min}—${max}项`);}
  if(answer.type==='text'){const n=codePointLength(answer.text),min=v.minLength??0,max=v.maxLength??10000;if(n<min||n>max)add('TEXT_LENGTH',`请输入${min}—${max}个字符`);}
  if(answer.type==='number'){
    const number=decimalValue(answer.number);
    if(!number)add('NUMBER_INVALID','请输入有效数字，且不要超过支持的精度和范围');
    else {if(v.integerOnly&&!number.isInteger())add('INTEGER_REQUIRED','请输入整数');if(v.min!==undefined&&number.lt(decimalValue(v.min)!))add('NUMBER_RANGE',`不能小于${v.min}`);if(v.max!==undefined&&number.gt(decimalValue(v.max)!))add('NUMBER_RANGE',`不能大于${v.max}`);}
  }
  return result;
}
function matches(question:Question,answer:Answer|undefined,condition:Question['jumpRules'][number]['condition']):boolean{
  if(!hasAnswer(answer))return false;
  if(answer.type==='single')return condition.op==='eq'&&answer.optionId===condition.optionId;
  if(answer.type==='multiple'){const ids=condition.optionIds??[];return condition.op==='containsAny'?ids.some(id=>answer.optionIds.includes(id)):condition.op==='containsAll'&&ids.length>0&&ids.every(id=>answer.optionIds.includes(id));}
  if(answer.type==='number') {const value=decimalValue(answer.number),target=decimalValue(condition.number);if(!value||!target)return false;switch(condition.op){case'eq':return value.eq(target);case'lt':return value.lt(target);case'lte':return value.lte(target);case'gt':return value.gt(target);case'gte':return value.gte(target);default:return false;}}
  return false;
}
export function evaluateAnswers(questions:Question[],input:Answer[]):{path:Question[];answers:Answer[];errors:AnswerIssue[]}{
  const errors:AnswerIssue[]=[],byId=new Map<string,Answer>(),known=new Map(questions.map(q=>[q.id,q]));
  for(const answer of input){
    const q=known.get(answer.questionId),add=(reason:string,message:string)=>errors.push({questionId:answer.questionId,field:`/answers/${answer.questionId}`,reason,message});
    if(!q){add('UNKNOWN_QUESTION','答案包含未知题目');continue;}
    if(byId.has(answer.questionId)){add('DUPLICATE_ANSWER','同一题不能提供多个答案');continue;}
    if(q.type!==answer.type){add('ANSWER_TYPE','答案类型与题目不匹配');continue;}
    if(answer.type==='single'&&!q.options!.some(o=>o.id===answer.optionId))add('INVALID_OPTION','答案包含非法选项');
    if(answer.type==='multiple'&&(new Set(answer.optionIds).size!==answer.optionIds.length||answer.optionIds.some(id=>!q.options!.some(o=>o.id===id))))add('INVALID_OPTION','多选答案包含非法或重复选项');
    byId.set(answer.questionId,answer);
  }
  const path:Question[]=[],answers:Answer[]=[];
  let index=0;
  while(index<questions.length){
    const q=questions[index],answer=byId.get(q.id);path.push(q);errors.push(...answerIssues(q,answer));
    if(hasAnswer(answer)){
      if(answer.type==='multiple')answers.push({...answer,optionIds:q.options!.filter(o=>answer.optionIds.includes(o.id)).map(o=>o.id)});
      else if(answer.type==='number')answers.push({...answer,number:decimalValue(answer.number)?.toString()??answer.number});
      else answers.push({...answer});
    }
    const rule=q.jumpRules.find(r=>matches(q,answer,r.condition)),target=rule?questions.findIndex(item=>item.id===rule.targetQuestionId):-1;
    index=target>index?target:index+1; // Draft preview remains safe with unfinished references.
  }
  return {path,answers,errors};
}
export function cleanBranchAnswers(questions:Question[],input:Answer[]):Answer[]{const ids=new Set(evaluateAnswers(questions,input).path.map(q=>q.id));return input.filter(a=>ids.has(a.questionId));}
