import { Decimal } from 'decimal.js';
import { codePointLength } from './index.js';
import type { DefinitionIssue } from './index.js';
export type QuestionType = 'single' | 'multiple' | 'text' | 'number';
export interface Option { id: string; label: string }
export interface Condition { op: 'eq' | 'containsAny' | 'containsAll' | 'lt' | 'lte' | 'gt' | 'gte'; optionId?: string; optionIds?: string[]; number?: string }
export interface JumpRule { id: string; condition: Condition; targetQuestionId: string }
export interface Validation { minChoices?: number; maxChoices?: number; minLength?: number; maxLength?: number; min?: string; max?: string; integerOnly?: boolean }
export interface Question { id: string; type: QuestionType; title: string; required: boolean; jumpRules: JumpRule[]; options?: Option[]; validation?: Validation }
export const QUESTION_LABELS: Record<QuestionType, string> = { single: '单选题', multiple: '多选题', text: '文本题', number: '数字题' };
const stableId = { type: 'string', minLength: 1, maxLength: 128, pattern: '^[A-Za-z0-9_-]+$' };
const obj = (properties: Record<string, unknown>) => ({ type: 'object', additionalProperties: false, required: Object.keys(properties), properties });
const count = (max: number) => ({ type: 'integer', minimum: 0, maximum: max });
const optionalObj = (properties: Record<string, unknown>, required: string[] = []) => ({ ...obj(properties), required });
const optionSchema = obj({ id: stableId, label: { type: 'string', minLength: 1, maxLength: 200 } });
const strings = { type: 'array', minItems: 1, maxItems: 100, uniqueItems: true, items: stableId };
const rule = (condition: unknown) => obj({ id: stableId, condition, targetQuestionId: stableId });
const common = { id: stableId, title: { type: 'string', minLength: 1, maxLength: 500 }, required: { type: 'boolean' } };
const options = { type: 'array', minItems: 2, maxItems: 100, items: optionSchema };
const rules = (condition: unknown) => ({ type: 'array', maxItems: 100, items: rule(condition) });
export const questionSchema = { oneOf: [
  obj({ ...common, type: { const: 'single' }, options, jumpRules: rules(obj({ op: { const: 'eq' }, optionId: stableId })) }),
  obj({ ...common, type: { const: 'multiple' }, options, validation: optionalObj({ minChoices: count(100), maxChoices: count(100) }), jumpRules: rules(obj({ op: { enum: ['containsAny', 'containsAll'] }, optionIds: strings })) }),
  obj({ ...common, type: { const: 'text' }, validation: optionalObj({ minLength: count(10000), maxLength: count(10000) }), jumpRules: { type: 'array', maxItems: 0 } }),
  obj({ ...common, type: { const: 'number' }, validation: optionalObj({ min: { type: 'string' }, max: { type: 'string' }, integerOnly: { type: 'boolean' } }, ['integerOnly']), jumpRules: rules(obj({ op: { enum: ['eq', 'lt', 'lte', 'gt', 'gte'] }, number: { type: 'string' } })) }),
] };
export const saveQuestionsSchema = obj({ expectedRevision: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER }, questions: { type: 'array', maxItems: 100, items: questionSchema } });
export function decimalValue(value: unknown): Decimal | null {
  if (typeof value !== 'string' || value.length > 128 || !/^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$/.test(value)) return null;
  try { const d = new Decimal(value); if (!d.isFinite() || (!d.isZero() && (d.sd() > 34 || d.e > 6144 || d.e - d.sd() + 1 < -6176))) return null; return d; } catch { return null; }
}
export function normalizeQuestions(questions: Question[]): Question[] {
  // DTOs contain only JSON values; this also accepts Vue reactive proxies.
  const copy = JSON.parse(JSON.stringify(questions)) as Question[];
  for (const q of copy) {
    if (q.type === 'number') {
      for (const key of ['min', 'max'] as const) if (q.validation?.[key] !== undefined) q.validation[key] = decimalValue(q.validation[key])!.toString();
      for (const r of q.jumpRules) r.condition.number = decimalValue(r.condition.number)!.toString();
    }
    if (q.type === 'multiple') for (const r of q.jumpRules) r.condition.optionIds?.sort();
  }
  return copy;
}
export function canonical(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value).filter(([,v]) => v !== undefined).sort(([a],[b])=>a.localeCompare(b)).map(([k,v])=>`${JSON.stringify(k)}:${canonical(v)}`).join(',')}}`;
  return JSON.stringify(value);
}
export function validateQuestions(questions: Question[]): { errors: DefinitionIssue[]; validationIssues: DefinitionIssue[] } {
  const errors: DefinitionIssue[] = [], validationIssues: DefinitionIssue[] = [];
  const idPattern = /^[A-Za-z0-9_-]{1,128}$/;
  const questionIds = new Set<string>(), ruleIds = new Set<string>();
  if (questions.length > 100) errors.push({ code: 'QUESTION_COUNT', field: '/questions', questionId: null, message: '最多保存100道题' });
  if (!questions.length) validationIssues.push({ code: 'NO_QUESTIONS', field: '/questions', questionId: null, message: '至少需要一道题才能发布' });
  questions.forEach((q,i) => {
    const prefix = `/questions/${i}`, name = `第${i+1}题`;
    const issue = (code: string, field: string, message: string, soft = false) => (soft ? validationIssues : errors).push({ code, field: prefix+field, questionId: q.id, message: `${name}：${message}` });
    if (!idPattern.test(q.id) || questionIds.has(q.id)) issue('DUPLICATE_ID','/id','题目ID无效或重复'); questionIds.add(q.id);
    if (!q.title.trim() || codePointLength(q.title)>500) issue('TITLE_LENGTH','/title','题干须为1—500个字符，不能全为空白');
    if (!['single','multiple','text','number'].includes(q.type)) issue('QUESTION_TYPE','/type','不支持该题型');
    const v = q.validation ?? {};
    const choices = q.options ?? [];
    if (q.type === 'single' || q.type === 'multiple') {
      if (choices.length<2 || choices.length>100) issue('OPTION_COUNT','/options','选择题需要2—100个选项');
      const ids = new Set<string>();
      choices.forEach((o,j)=> { if (!idPattern.test(o.id) || ids.has(o.id)) issue('DUPLICATE_ID',`/options/${j}/id`,'选项ID无效或重复'); ids.add(o.id); if (!o.label.trim() || codePointLength(o.label)>200) issue('OPTION_LABEL',`/options/${j}/label`,'选项文字须为1—200个字符'); });
    }
    for (const [lo,hi,max] of (q.type==='multiple' ? [['minChoices','maxChoices',100]] : q.type==='text' ? [['minLength','maxLength',10000]] : []) as [keyof Validation,keyof Validation,number][]) {
      for (const key of [lo,hi]) { const value=v[key]; if(value!==undefined && (typeof value!=='number' || !Number.isInteger(value) || value<0 || value>max)) issue('INVALID_LIMIT',`/validation/${key}`,`限制必须是0—${max}的整数`); }
      const low=v[lo] as number|undefined, high=v[hi] as number|undefined;
      if(low!==undefined && high!==undefined && low>high) issue('MIN_MAX',`/validation/${lo}`,'最小限制不能大于最大限制');
      if(q.type==='multiple' && ((low??0)>choices.length || (high??0)>choices.length)) issue('CHOICE_COUNT','/validation','选择数量不能超过选项数量');
    }
    if(q.required && ((q.type==='multiple' && v.maxChoices===0) || (q.type==='text' && v.maxLength===0))) issue('REQUIRED_UNSATISFIABLE','/validation','当前上限无法满足必答要求，发布前须调整',true);
    if(q.type==='number') {
      for(const key of ['min','max'] as const) if(v[key]!==undefined && !decimalValue(v[key])) issue('DECIMAL_INVALID',`/validation/${key}`,'请输入可精确保存为Decimal128的有限数字字符串');
      const min=v.min!==undefined?decimalValue(v.min):null, max=v.max!==undefined?decimalValue(v.max):null;
      if(min && max && min.gt(max)) issue('MIN_MAX','/validation/min','数字下限不能大于上限');
      else if(v.integerOnly && min && max && min.ceil().gt(max.floor())) issue('INTEGER_UNSATISFIABLE','/validation','该范围内没有整数，发布前须调整',true);
      if(typeof v.integerOnly!=='boolean') issue('INTEGER_REQUIRED','/validation/integerOnly','请明确整数限制');
    }
    if(q.jumpRules.length>100) issue('RULE_COUNT','/jumpRules','每题最多100条规则');
    if(q.type==='text' && q.jumpRules.length) issue('RULE_TYPE','/jumpRules','文本题不支持跳转');
    q.jumpRules.forEach((r,j)=> {
      const field=`/jumpRules/${j}`;
      if(!idPattern.test(r.id) || ruleIds.has(r.id)) issue('DUPLICATE_ID',field+'/id','规则ID无效或全问卷重复'); ruleIds.add(r.id);
      if(!idPattern.test(r.targetQuestionId)) issue('INVALID_ID',field+'/targetQuestionId','目标ID格式无效');
      const target=questions.findIndex(item=>item.id===r.targetQuestionId);
      if(target<=i) issue(target<0?'TARGET_MISSING':'TARGET_NOT_FORWARD',field+'/targetQuestionId',target<0?'跳转目标尚未选择或已删除，可保存草稿':'跳转目标须位于当前题之后，可先保存草稿',true);
      const c=r.condition;
      if(q.type==='single') {
        if(c.op!=='eq' || !c.optionId || !idPattern.test(c.optionId)) issue('RULE_CONDITION',field+'/condition','请选择单选条件');
        else if(!choices.some(o=>o.id===c.optionId)) issue('OPTION_MISSING',field+'/condition/optionId','条件选项已失效，可保存草稿',true);
      }
      if(q.type==='multiple') {
        if(!['containsAny','containsAll'].includes(c.op) || !c.optionIds?.length || c.optionIds.length>100 || new Set(c.optionIds).size!==c.optionIds.length || c.optionIds.some(id=>!idPattern.test(id))) issue('RULE_CONDITION',field+'/condition','多选条件须选择至少一个不重复的选项');
        else if(c.optionIds.some(id=>!choices.some(o=>o.id===id))) issue('OPTION_MISSING',field+'/condition/optionIds','条件中有已删除选项，可保存草稿',true);
      }
      if(q.type==='number' && (!['eq','lt','lte','gt','gte'].includes(c.op) || !decimalValue(c.number))) issue('RULE_CONDITION',field+'/condition','数字规则须使用有效运算符和Decimal128数字字符串');
    });
  });
  return { errors, validationIssues };
}
export function newQuestion(type: QuestionType): Question {
  const q: Question={id:crypto.randomUUID(),type,title:QUESTION_LABELS[type],required:false,jumpRules:[]};
  if(type==='single'||type==='multiple') q.options=[{id:crypto.randomUUID(),label:'选项1'},{id:crypto.randomUUID(),label:'选项2'}];
  if(type!=='single') q.validation=type==='number'?{integerOnly:true}:{};
  return q;
}
