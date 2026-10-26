import type { Decimal128, Long, ObjectId } from 'mongodb';
import type { Answer, DefinitionIssue, QuestionContent, QuestionInstanceConfig } from '@survey/shared';
import type { SurveyDocument, UserDocument } from './models.js';

/** BSON int/long constrained to the safe integer range by the executable schema. */
export type StoredInteger = number | Long;
type DecimalFields<T> = { [K in keyof T]: K extends 'min' | 'max' | 'number' ? Decimal128 : T[K] extends object ? DecimalFields<T[K]> : T[K] };
// Distribute over the domain union, retaining exact optional fields and conditions.
export type StoredContent = QuestionContent extends infer C ? C extends QuestionContent ? DecimalFields<C> : never : never;
export type StoredConfig = DecimalFields<QuestionInstanceConfig>;
export type StoredQuestion = StoredContent & StoredConfig & { id: string };
export type StoredAnswer = Answer extends infer A ? A extends Answer ? DecimalFields<A> : never : never;
interface Created { _id:ObjectId; schemaVersion:1; createdAt:Date }
interface Mutable extends Created { updatedAt:Date }
export type Phase2UserDocument = Omit<UserDocument,'schemaVersion'> & {schemaVersion:1};
type SurveyBase = Omit<SurveyDocument,'schemaVersion'|'questions'> & { questions:StoredQuestion[] };
export type Phase2SurveyDocument =
  | SurveyBase & {schemaVersion:2}
  | SurveyBase & {schemaVersion:3; usageNumber:string; originTemplate:null|{templateId:ObjectId; contentHash:string; acquiredAt:Date}};
interface SnapshotBase {
  _id:ObjectId; surveyId:ObjectId; version:StoredInteger; sourceDefinitionVersion:StoredInteger;
  definition:{title:string; description:string; questions:StoredQuestion[]};
  policySnapshot:{allowAnonymous:boolean; allowRepeat:boolean}; definitionHash:string;
  publishedAt:Date; publishedBy:ObjectId; publicationRequestId:string; publicationRequestHash:string; origin:{kind:'publication'};
}
export type Phase2SnapshotDocument = SnapshotBase & ({schemaVersion:1}|{schemaVersion:2; bindingHash:string});
export interface Phase2ResponseDocument {
  _id:ObjectId; schemaVersion:2; surveyId:ObjectId; surveyDefinitionVersion:StoredInteger;
  respondentId:ObjectId; anonymous:boolean; repeatAllowed:boolean; payloadHashVersion:2;
  requestId:string; payloadHash:string; answers:StoredAnswer[]; submittedAt:Date;
}
export type QuestionOrigin =
  | {kind:'fork'; sourceQuestionId:ObjectId; sourceVersionId:ObjectId; evidenceKey:string|null}
  | {kind:'legacyImport'; sourceQuestionId:ObjectId|null; sourceVersionId:ObjectId|null; evidenceKey:string|null};
export interface QuestionItemDocument extends Mutable {
  ownerId:ObjectId; revision:StoredInteger; accessFence:StoredInteger; latestVersionId:ObjectId|null; nextVersion:StoredInteger;
  draft:null|{content:StoredContent; baseVersionId:ObjectId|null; revision:StoredInteger}; readonly origin:QuestionOrigin|null;
}
export type DistributionSource =
  | {kind:'original'|'unrecorded'; sourceQuestionId:null; sourceVersionId:null}
  | {kind:'derived'; sourceQuestionId:ObjectId; sourceVersionId:ObjectId};
export interface QuestionVersionDocument extends Created {
  questionId:ObjectId; version:StoredInteger; content:StoredContent; contentHash:string;
  readonly distributionSource:DistributionSource; parentVersionId:ObjectId|null; restoredFromVersionId:ObjectId|null;
  operation:'save'|'restore'|'fork'|'legacyImport'; createdBy:ObjectId; evidenceKey:string|null;
}
export interface QuestionBankDocument extends Mutable {ownerId:ObjectId; name:string; revision:StoredInteger; deletedAt:Date|null}
export interface QuestionBankMemberDocument extends Created {bankId:ObjectId; questionId:ObjectId; ownerId:ObjectId}
interface GrantState {state:'active'|'revoked'; revision:StoredInteger; revokedAt:Date|null}
export interface QuestionGrantDocument extends Mutable, GrantState {questionId:ObjectId; recipientId:ObjectId; grantedBy:ObjectId}
export type AuthorizationProof = {kind:'owner'} | {kind:'share'; grantId:ObjectId; grantRevision:StoredInteger}
  | {kind:'template'; templateId:ObjectId; templateHash:string} | {kind:'legacyImport'; evidenceKey:string};
interface BindingBase extends Created {
  surveyId:ObjectId; ownerId:ObjectId; instanceId:string; questionId:ObjectId; questionVersionId:ObjectId; contentHash:string;
  acquisitionId:ObjectId; acquiredAt:Date; authorization:AuthorizationProof; mappingKind:'native'|'legacyImport'; evidenceKey:string|null;
}
export type SurveyQuestionBindingDocument = BindingBase & (
  {scope:'draft'; publicationVersion:0; snapshotHash:null} | {scope:'publication'; publicationVersion:StoredInteger; snapshotHash:string}
);
export type DistributionObligation = {questionId:ObjectId; questionVersionId:ObjectId; authorId:ObjectId} & (
  {grantId:null; grantRevision:null} | {grantId:ObjectId; grantRevision:StoredInteger}
);
export interface DistributionProof {lineageHash:string; obligations:DistributionObligation[]}
export interface TemplateBinding {instanceId:string; questionId:ObjectId; questionVersionId:ObjectId; contentHash:string; distributionProof:DistributionProof}
export interface SurveyTemplateDocument extends Mutable {
  publisherId:ObjectId; sourceSurveyId:ObjectId; sourcePublishedVersion:StoredInteger; status:'listed'|'unlisted';
  revision:StoredInteger; accessFence:StoredInteger; title:string; description:string; questions:StoredQuestion[];
  bindings:TemplateBinding[]; contentHash:string;
}
export interface TemplateGrantDocument extends Mutable, GrantState {questionId:ObjectId; questionVersionId:ObjectId; publisherId:ObjectId; grantedBy:ObjectId}
export interface ResourceReceiptData {resourceId:string; versionId:string|null; revision:StoredInteger|null}
export interface InstanceSaveData {revision:StoredInteger; draftDefinitionRevision:StoredInteger; instanceId:string; questionVersionId:string; validationIssues:DefinitionIssue[]}
export interface TemplateAdoptionData {surveyId:string; revision:StoredInteger}
interface ReceiptBase extends Created {actorId:ObjectId; resourceKey:string; requestKey:string; requestHash:string; resultVersion:1}
export type OperationReceiptDocument = ReceiptBase & (
  {operation:'createQuestion'|'saveVersion'|'restoreVersion'|'forkQuestion'|'createBank'|'createTemplate'; firstHttpStatus:201; result:{kind:'resourceReceipt'; data:ResourceReceiptData}}
  | {operation:'attachQuestion'|'replaceQuestion'|'saveInlineQuestion'; firstHttpStatus:200; result:{kind:'instanceSave'; data:InstanceSaveData}}
  | {operation:'adoptTemplate'; firstHttpStatus:201; result:{kind:'templateAdoption'; data:TemplateAdoptionData}}
);
/** DTO only; usage aggregation and authorization are deferred. */
export interface UsageVersionState {versionId:string; version:number; isDraft:boolean; isCurrent:boolean; hasHistorical:boolean}
export interface Phase2Documents {
  users:Phase2UserDocument; surveys:Phase2SurveyDocument; survey_versions:Phase2SnapshotDocument; responses:Phase2ResponseDocument;
  question_items:QuestionItemDocument; question_versions:QuestionVersionDocument; question_banks:QuestionBankDocument;
  question_bank_members:QuestionBankMemberDocument; question_grants:QuestionGrantDocument; survey_question_bindings:SurveyQuestionBindingDocument;
  survey_templates:SurveyTemplateDocument; template_grants:TemplateGrantDocument; operation_receipts:OperationReceiptDocument;
}
