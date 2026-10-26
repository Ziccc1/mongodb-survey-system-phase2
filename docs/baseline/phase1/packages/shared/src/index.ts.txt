export * from "./answers.js";
export * from './core-types.js';
import type { Question } from './questions.js';
export * from './questions.js';
export interface User { id: string; username: string; createdAt: string }
export interface Credentials { username: string; password: string }
export interface CreateSurvey { title: string; description?: string; allowAnonymous?: boolean; allowRepeat?: boolean; expiresAt?: string | null }
export interface DefinitionIssue { code: string; field: string; questionId: string | null; message: string }
export interface SurveySummary {
  id: string; publicId: string; title: string; status: 'draft' | 'published' | 'paused' | 'closed';
  revision: number; currentPublishedVersion: number | null; cumulativeResponseCount: number;
  currentVersionResponseCount: number; createdAt: string; updatedAt: string;
}
export interface Editor {
  id: string; publicId: string; status: SurveySummary['status'];
  draftDefinition: { title: string; description: string; questions: Question[] };
  settings: { allowAnonymous: boolean; allowRepeat: boolean; expiresAt: string | null };
  draftDefinitionRevision: number; revision: number; currentPublishedVersion: number | null;
  hasUnpublishedChanges: boolean; cumulativeResponseCount: number; currentVersionResponseCount: number;
  firstPublishedAt: string | null; createdAt: string; updatedAt: string;
  validationIssues: DefinitionIssue[]; capabilities: { copySurvey: boolean };
}
export interface Page<T> { items: T[]; nextCursor: string | null }
export interface ApiErrorDetail { field?: string; reason?: string; questionId?: string; expectedRevision?: number; expectedPublishedVersion?: number; reloadRequired?: boolean }
export interface ApiErrorBody { error: { code: string; message: string; details: ApiErrorDetail[]; traceId: string } }
export interface SaveResult { revision: number; draftDefinitionRevision: number; hasUnpublishedChanges: boolean; validationIssues: DefinitionIssue[] }
export interface PatchSurvey extends Partial<CreateSurvey> { expectedRevision: number }
export interface SaveQuestions { expectedRevision: number; questions: Question[] }
export const credentialsSchema = {
  type: 'object', additionalProperties: false, required: ['username', 'password'],
  properties: { username: { type: 'string' }, password: { type: 'string' } },
} as const;
export const createSurveySchema = {
  type: 'object', additionalProperties: false, required: ['title'], properties: {
    title: { type: 'string' }, description: { type: 'string' },
    allowAnonymous: { type: 'boolean' }, allowRepeat: { type: 'boolean' },
    expiresAt: { anyOf: [{ type: 'string' }, { type: 'null' }] },
  },
} as const;
export const codePointLength = (text: string) => [...text].length;
export const normalizeUsername = (text: string) => text.normalize('NFKC').trim();

// API text limits use Unicode code points, never UTF-16 input.maxLength units.
export const SURVEY_TEXT_LIMITS = { title: 200, description: 2000 } as const;
export interface SurveyTextIssue { field: '/title' | '/description'; reason: 'REQUIRED' | 'TOO_LONG'; message: string }
export function surveyTextIssues(input: Pick<CreateSurvey, 'title' | 'description'>): SurveyTextIssue[] {
  const issues: SurveyTextIssue[] = [];
  const title = input.title.trim();
  if (!title) issues.push({ field: '/title', reason: 'REQUIRED', message: '请填写问卷标题' });
  else if (codePointLength(title) > SURVEY_TEXT_LIMITS.title) issues.push({ field: '/title', reason: 'TOO_LONG', message: `问卷标题最多 ${SURVEY_TEXT_LIMITS.title} 个字符` });
  if (codePointLength(input.description ?? '') > SURVEY_TEXT_LIMITS.description) issues.push({ field: '/description', reason: 'TOO_LONG', message: `问卷说明最多 ${SURVEY_TEXT_LIMITS.description} 个字符` });
  return issues;
}

export const patchSurveySchema = { ...createSurveySchema, required: ['expectedRevision'], minProperties: 2, properties: { ...createSurveySchema.properties, expectedRevision: { type: 'integer', minimum: 0, maximum: Number.MAX_SAFE_INTEGER } } } as const;
