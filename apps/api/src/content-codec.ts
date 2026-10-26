import { Decimal128 } from 'mongodb';
import { decimalValue, parseQuestionContent, parseQuestionInstanceConfig } from '@survey/shared';
import type { QuestionContent, QuestionInstanceConfig, QuestionType } from '@survey/shared';
import type { StoredContent, StoredConfig } from './database/phase2-models.js';

function decimal(value:string):Decimal128 {
  const parsed=decimalValue(value);
  if(!parsed) throw new Error('DECIMAL_INVALID');
  return Decimal128.fromString(parsed.toString());
}
function decimalText(value:Decimal128):string {
  if(!(value instanceof Decimal128))throw new Error('DECIMAL_INVALID');
  const parsed=decimalValue(value.toString());
  if(!parsed)throw new Error('DECIMAL_INVALID');
  return parsed.toString();
}
export function contentToBson(input:QuestionContent):StoredContent {
  const content=parseQuestionContent(input);
  if(content.type!=='number')return content;
  return {type:'number',title:content.title,validation:{integerOnly:content.validation.integerOnly,
    ...(content.validation.min===undefined?{}:{min:decimal(content.validation.min)}),
    ...(content.validation.max===undefined?{}:{max:decimal(content.validation.max)})}};
}
export function contentFromBson(input:StoredContent):QuestionContent {
  if(input.type!=='number')return parseQuestionContent(input);
  // Keep unknown fields until the strict JSON boundary checks them; never silently discard.
  return parseQuestionContent({...input,validation:{...input.validation,
    ...(input.validation.min===undefined?{}:{min:decimalText(input.validation.min)}),
    ...(input.validation.max===undefined?{}:{max:decimalText(input.validation.max)})}});
}
export function configToBson(input:QuestionInstanceConfig,type:QuestionType):StoredConfig {
  const config=parseQuestionInstanceConfig(input,type);
  if(type!=='number')return config as StoredConfig;
  return {required:config.required,jumpRules:config.jumpRules.map(rule=>{
    if(!('number' in rule.condition))throw new Error('QUESTION_SHAPE_INVALID');
    return {id:rule.id,targetQuestionId:rule.targetQuestionId,condition:{op:rule.condition.op,number:decimal(rule.condition.number)}};
  })};
}
export function configFromBson(input:StoredConfig,type:QuestionType):QuestionInstanceConfig {
  if(type!=='number')return parseQuestionInstanceConfig(input,type);
  return parseQuestionInstanceConfig({...input,jumpRules:input.jumpRules.map(rule=>{
    if(!('number' in rule.condition) || !(rule.condition.number instanceof Decimal128))throw new Error('DECIMAL_INVALID');
    return {...rule,condition:{...rule.condition,number:decimalText(rule.condition.number)}};
  })},type);
}
