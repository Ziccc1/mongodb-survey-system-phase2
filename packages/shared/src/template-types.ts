import type {Question} from './questions.js';
export interface DistributionGrant {id:string;questionVersionId:string;publisherUsername:string;state:'active'|'revoked';revision:number;itemRevision:number}
export interface TemplateSummary {id:string;title:string;description:string;revision:number;status:'listed'|'unlisted';eligible:boolean}
export interface TemplatePreview extends TemplateSummary {questions:Question[];sources:{instanceId:string;questionId:string;questionVersionId:string}[]}
export interface TemplateAdoption {surveyId:string;revision:number;replayed:boolean}
