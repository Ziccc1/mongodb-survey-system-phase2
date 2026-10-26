import { validateQuestions } from '@survey/shared';
import type { Question } from '@survey/shared';
import { fromBson } from './question-codec.js';
import type { User, SurveySummary, Editor } from '@survey/shared';
import type { SurveyDocument, UserDocument } from './database/models.js';
export const userDto = (u: UserDocument): User => ({ id: u._id.toHexString(), username: u.username, createdAt: u.createdAt.toISOString() });
export const summaryDto = (s: SurveyDocument): SurveySummary => ({
  id: s._id.toHexString(), publicId: s.publicId, title: s.title, status: s.status, revision: s.revision,
  currentPublishedVersion: s.currentPublishedVersion, cumulativeResponseCount: s.submissionCount,
  currentVersionResponseCount: s.currentVersionSubmissionCount, expiresAt: s.expiresAt?.toISOString() ?? null, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
});
export const editorDto = (s: SurveyDocument, hasUnpublishedChanges = true): Editor => ({
  id: s._id.toHexString(), publicId: s.publicId, status: s.status,
  draftDefinition: { title: s.title, description: s.description, questions: fromBson(s.questions) as Question[] },
  settings: { allowAnonymous: s.allowAnonymous, allowRepeat: s.allowRepeat, expiresAt: s.expiresAt?.toISOString() ?? null },
  draftDefinitionRevision: s.definitionVersion, revision: s.revision, currentPublishedVersion: s.currentPublishedVersion,
  hasUnpublishedChanges, cumulativeResponseCount: s.submissionCount, currentVersionResponseCount: s.currentVersionSubmissionCount,
  firstPublishedAt: s.firstPublishedAt?.toISOString() ?? null, createdAt: s.createdAt.toISOString(), updatedAt: s.updatedAt.toISOString(),
  validationIssues: validateQuestions(fromBson(s.questions) as Question[]).validationIssues, capabilities: { copySurvey: false },
});
