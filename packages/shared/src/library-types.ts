import type {QuestionContent} from './question-content.js';
export interface QuestionEditor {id:string;revision:number;draft:null|{content:QuestionContent;baseVersionId:string|null;revision:number};latestVersionId:string|null;origin:null|{kind:'fork'|'legacyImport';sourceQuestionId:string|null;sourceVersionId:string|null}}
export interface LibraryQuestionSummary {id:string;latestVersionId:string|null;latestVersion:number|null;title:string;ownerUsername:string}
export interface QuestionVersion {id:string;questionId:string;version:number;content:QuestionContent;parentVersionId:string|null;restoredFromVersionId:string|null;operation:'save'|'restore'|'fork'|'legacyImport';createdAt:string}
export interface ResourceReceipt {resourceId:string;versionId:string|null;revision:number|null;replayed:boolean}
export interface Bank {id:string;name:string;revision:number;createdAt:string}
export interface BankMember {questionId:string;selectable:boolean;latestVersionId:string|null;latestVersion:number|null;title:string|null}
export interface Grant {id:string;recipientUsername:string;state:'active'|'revoked';revision:number;itemRevision:number}
export interface InstanceSource {instanceId:string;questionId:string;questionVersionId:string;questionVersion:number;rights:'owner'|'share'|'retained'|'template';hasAccessibleUpdate:boolean}
export interface UpdateNotice {instanceId:string;currentVersionId:string;latestAccessibleVersionId:string;latestAccessibleVersion:number}
export interface UsageVersion {versionId:string;version:number;isDraft:boolean;isCurrent:boolean;hasHistorical:boolean}
export type Usage={surveyNumber:string;versions:UsageVersion[];isDraft:boolean;isCurrent:boolean;onlyHistorical:boolean}&({surveyId:string;title:string;managePath:string}|{username:string});
export interface Derivation {questionId:string;ownerUsername:string;sourceVersionId:string;createdAt:string}
