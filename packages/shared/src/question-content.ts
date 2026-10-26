import { questionSchema, normalizeQuestions, validateQuestions } from './questions.js';
import type { Question, QuestionType, Option } from './questions.js';
import type { DefinitionIssue } from './validation-common.js';

/** Expected DTO failures; callers must let unexpected runtime errors propagate. */
export class QuestionValidationError extends Error {
  constructor(public readonly kind: 'shape' | 'content', public readonly issues: DefinitionIssue[] = []) {
    super(kind === 'shape' ? 'QUESTION_SHAPE_INVALID' : `QUESTION_CONTENT_INVALID: ${issues.map(i => i.code).join(',')}`);
  }
}

/** JSON boundary only. Decimal strings use decimalValue's existing exact grammar. */
export type DecimalString = string;
export type QuestionContent =
  | { type: 'single'; title: string; options: Option[] }
  | { type: 'multiple'; title: string; options: Option[]; validation: { minChoices?: number; maxChoices?: number } }
  | { type: 'text'; title: string; validation: { minLength?: number; maxLength?: number } }
  | { type: 'number'; title: string; validation: { min?: DecimalString; max?: DecimalString; integerOnly: boolean } };
type Rule<C> = { id: string; condition: C; targetQuestionId: string };
export type SingleRule = Rule<{ op: 'eq'; optionId: string }>;
export type MultipleRule = Rule<{ op: 'containsAny' | 'containsAll'; optionIds: string[] }>;
export type NumberRule = Rule<{ op: 'eq' | 'lt' | 'lte' | 'gt' | 'gte'; number: DecimalString }>;
export type QuestionInstanceConfig<T extends QuestionType = QuestionType> = {
  required: boolean;
  jumpRules: (T extends 'single' ? SingleRule : T extends 'multiple' ? MultipleRule : T extends 'number' ? NumberRule : never)[];
};

// Derive structural rules from the existing flat DTO; semantic rules remain in validateQuestions.
export const questionContentSchema = { oneOf: questionSchema.oneOf.map(branch => {
  const properties = Object.fromEntries(Object.entries(branch.properties).filter(([key]) => !['id', 'required', 'jumpRules'].includes(key)));
  return { type: 'object', additionalProperties: false, required: Object.keys(properties), properties };
}) };
export function questionInstanceConfigSchema(type: QuestionType) {
  const branch = questionSchema.oneOf.find(b => (b.properties.type as {const:string}).const === type);
  if (!branch) throw new QuestionValidationError('shape');
  return { type: 'object', additionalProperties: false, required: ['required', 'jumpRules'], properties: {
    required: { type: 'boolean' }, jumpRules: branch.properties.jumpRules,
  } };
}

/** Limited interpreter for our closed, local DTO schemas; never accepts a caller supplied schema. */
function matches(value: unknown, schema: Record<string, unknown>): boolean {
  if (Array.isArray(schema.oneOf)) return schema.oneOf.filter(s => matches(value, s)).length === 1;
  if ('const' in schema && value !== schema.const) return false;
  if (Array.isArray(schema.enum) && !schema.enum.includes(value)) return false;
  if (schema.type === 'object') {
    if (!value || Object.prototype.toString.call(value) !== '[object Object]') return false;
    const object = value as Record<string, unknown>, properties = schema.properties as Record<string, Record<string, unknown>>;
    if ((schema.required as string[]).some(key => !Object.hasOwn(object, key))) return false;
    return Object.keys(object).every(key => Object.hasOwn(properties, key) && matches(object[key], properties[key]));
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length < Number(schema.minItems ?? 0) || value.length > Number(schema.maxItems ?? Infinity)) return false;
    if (schema.uniqueItems && new Set(value).size !== value.length) return false;
    return value.every(item => matches(item, schema.items as Record<string, unknown>));
  }
  if (schema.type === 'string') return typeof value === 'string' && [...value].length >= Number(schema.minLength ?? 0)
    && [...value].length <= Number(schema.maxLength ?? Infinity) && (!schema.pattern || new RegExp(String(schema.pattern)).test(value));
  if (schema.type === 'integer') return typeof value === 'number' && Number.isSafeInteger(value) && value >= Number(schema.minimum ?? -Infinity) && value <= Number(schema.maximum ?? Infinity);
  if (schema.type === 'boolean') return typeof value === 'boolean';
  return 'const' in schema || Array.isArray(schema.enum);
}
function requireShape(value: unknown, schema: Record<string, unknown>): void {
  if (!matches(value, schema)) throw new QuestionValidationError('shape');
}
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T; // Vue reactive JSON supported.

export function parseQuestionContent(input: unknown): QuestionContent {
  requireShape(input, questionContentSchema);
  const content = copy(input as QuestionContent);
  const checked = validateQuestions([assemble(content, {required:false, jumpRules:[]}, 'content')]);
  if (checked.errors.length) throw new QuestionValidationError('content', checked.errors);
  return content;
}
export function parseQuestionInstanceConfig(input: unknown, type: QuestionType): QuestionInstanceConfig {
  requireShape(input, questionInstanceConfigSchema(type));
  return copy(input as QuestionInstanceConfig);
}
// Explicit selections: neither Content nor Config can override the instance ID.
function assemble(content: QuestionContent, config: QuestionInstanceConfig, instanceId: string): Question {
  const base = {id:instanceId, type:content.type, title:content.title, required:config.required, jumpRules:copy(config.jumpRules)};
  switch(content.type) {
    case 'single': return {...base, options:copy(content.options)};
    case 'multiple': return {...base, options:copy(content.options), validation:copy(content.validation)};
    case 'text': case 'number': return {...base, validation:copy(content.validation)};
  }
}
export function materializeQuestion(content: QuestionContent, config: QuestionInstanceConfig, instanceId: string): Question {
  const result = assemble(parseQuestionContent(content), parseQuestionInstanceConfig(config, content.type), instanceId);
  requireShape(result, questionSchema);
  const checked = validateQuestions([result]);
  if (checked.errors.length) throw new Error(`QUESTION_INSTANCE_INVALID: ${checked.errors.map(i=>i.code).join(',')}`);
  return result; // Missing/backward targets and stale options remain saveable draft issues.
}
export function extractQuestionContent(question: Question): QuestionContent {
  requireShape(question, questionSchema);
  const base = {type:question.type, title:question.title};
  const selected = question.type === 'single' ? {...base, options:question.options}
    : question.type === 'multiple' ? {...base, options:question.options, validation:question.validation}
    : {...base, validation:question.validation};
  return parseQuestionContent(selected);
}
export function extractQuestionConfig(question: Question): QuestionInstanceConfig {
  requireShape(question, questionSchema);
  return parseQuestionInstanceConfig({required:question.required, jumpRules:question.jumpRules}, question.type);
}
export function normalizeQuestionParts(content: QuestionContent, config: QuestionInstanceConfig, instanceId: string) {
  const [question] = normalizeQuestions([materializeQuestion(content, config, instanceId)]);
  return {content:extractQuestionContent(question), config:extractQuestionConfig(question)};
}
export function validateQuestionInstances(instances: {instanceId:string; content:QuestionContent; config:QuestionInstanceConfig}[]) {
  return validateQuestions(instances.map(i => materializeQuestion(i.content, i.config, i.instanceId)));
}
