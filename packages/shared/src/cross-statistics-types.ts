export interface CrossBase {questionId:string;versionId:string;generatedAt:string;surveyCount:number;eligibleResponseCount:number;answeredCount:number;skippedCount:number;unansweredCount:number}
export type CrossStatistics=CrossBase&({optionCounts:{optionId:string;label:string;count:number;percentage:string|null}[]}|{average:string|null;min:string|null;max:string|null;bins:{lower:string|null;upper:string|null;upperInclusive:boolean;count:number}[]}|Record<never,never>);
export interface CrossAnswer {surveyId:string;publishedVersion:number;instanceId:string;responseId:string;submittedAt:string;value:string}
export interface CrossPage<T>{questionId:string;versionId:string;generatedAt:string;asOf:string;items:T[];nextCursor:string|null}
