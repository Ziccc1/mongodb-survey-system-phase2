import { Decimal128, ObjectId } from 'mongodb';
import type { Question } from '@survey/shared';
export function fromBson(value: unknown): unknown {
  if (value instanceof Decimal128) return value.toString();
  if (value instanceof ObjectId || value instanceof Date) return value;
  if (Array.isArray(value)) return value.map(fromBson);
  if (value && typeof value==='object') return Object.fromEntries(Object.entries(value).map(([key,item])=>[key,fromBson(item)]));
  return value;
}
export function toBson(questions: Question[]): unknown[] {
  return questions.map(q=>({ ...q, ...(q.type==='number'?{validation:{...q.validation,...(q.validation?.min!==undefined?{min:Decimal128.fromString(q.validation.min)}:{}),...(q.validation?.max!==undefined?{max:Decimal128.fromString(q.validation.max)}:{})}}:{}), jumpRules:q.jumpRules.map(r=>({...r,condition:{...r.condition,...(q.type==='number'?{number:Decimal128.fromString(r.condition.number!)}:{})}})) }));
}
