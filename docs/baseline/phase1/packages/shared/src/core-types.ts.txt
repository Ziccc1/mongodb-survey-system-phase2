import type { Question, QuestionType } from './questions.js';
export interface Definition { title: string; description: string; questions: Question[] }
export type Answer = {questionId:string;type:'single';optionId:string}|{questionId:string;type:'multiple';optionIds:string[]}|{questionId:string;type:'text';text:string}|{questionId:string;type:'number';number:string};
export interface PublishCommand { expectedRevision:number; expectedDraftDefinitionVersion:number }
export interface PublishReceipt { surveyId:string;publishedVersion:number;status:'published';revision:number;publishedAt:string;firstPublishedAt:string;shareUrl:string;replayed:boolean }
export interface StateResult {surveyId:string;status:'paused'|'closed';revision:number;currentPublishedVersion:number}
export interface VersionSummary {publishedVersion:number;title:string;publishedAt:string|null;legacy:boolean}
export interface VersionDetail {surveyId:string;publishedVersion:number;sourceDraftDefinitionRevision:number;definition:Definition;policy:{allowAnonymous:boolean;allowRepeat:boolean};publishedAt:string|null;legacy:boolean}
export interface VersionPage {surveyId:string;latestPublishedVersion:number|null;items:VersionSummary[];nextCursor:string|null}
export interface FillDefinition extends Definition {publicId:string;publishedVersion:number;allowAnonymous:boolean;allowRepeat:boolean;expiresAt:string|null;canSubmit:boolean;unavailableReason:null|'SURVEY_PAUSED'|'SURVEY_CLOSED'|'SURVEY_EXPIRED'|'ALREADY_SUBMITTED';hasSubmitted:boolean}
export interface SubmitCommand {publishedVersion:number;anonymous:boolean;answers:Answer[]}
export interface SubmitReceipt {receiptId:string;submittedAt:string;publishedVersion:number;replayed:boolean}
export interface ResponseSummary {responseId:string;publishedVersion:number;anonymous:boolean;submittedAt:string}
export interface ResponseDetail extends ResponseSummary {surveyId:string;definition:Definition;answers:Answer[]}
export interface ResponsePage {surveyId:string;selectedVersion:number;latestPublishedVersion:number;items:ResponseSummary[];nextCursor:string|null}
export interface VersionContext {surveyId:string;selectedVersion:number;latestPublishedVersion:number;cumulativeResponseCount:number;currentVersionResponseCount:number;selectedVersionResponseCount:number;generatedAt:string}
export interface QuestionSummary {questionId:string;type:QuestionType;title:string;answeredCount:number;optionCounts?:{optionId:string;label:string;count:number}[];average?:string|null}
export interface Statistics extends VersionContext {questionSummaries:QuestionSummary[]}
export interface SingleStatistics extends VersionContext {questionSummary:QuestionSummary}
export interface AnswerPage extends VersionContext {question:{id:string;type:'text'|'number';title:string};items:{responseId:string;anonymous:boolean;submittedAt:string;answer:Answer}[];nextCursor:string|null}
