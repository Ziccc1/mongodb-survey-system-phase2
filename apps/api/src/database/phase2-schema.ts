import { indexSpecs } from './schema.js';
import type { Phase2Documents } from './phase2-models.js';

type Schema = Record<string, unknown>;
const object=(properties:Record<string,unknown>,required=Object.keys(properties)):Schema=>({bsonType:'object',additionalProperties:false,...(required.length?{required}:{}),properties});
const text=(min:number,max:number):Schema=>({bsonType:'string',minLength:min,maxLength:max});
const enumeration=(...values:(string|number)[]):Schema=>({enum:values});
const integer=(minimum=0,maximum=Number.MAX_SAFE_INTEGER):Schema=>({bsonType:['int','long'],minimum,maximum});
const format=(n:number):Schema=>({bsonType:'int',enum:[n]});
const nullable=(schema:Schema):Schema=>({oneOf:[schema,{bsonType:'null'}]});
const array=(items:Schema,minItems:number,maxItems:number,uniqueItems=false):Schema=>({bsonType:'array',items,minItems,maxItems,...(uniqueItems?{uniqueItems:true}:{})});
const oid={bsonType:'objectId'},date={bsonType:'date'},bool={bsonType:'bool'},nil={bsonType:'null'},decimal={bsonType:'decimal'};
const sid={...text(1,128),pattern:'^[A-Za-z0-9_-]+$'},key={...text(1,128),pattern:'^[A-Za-z0-9._:-]+$'};
const hash={...text(64,64),pattern:'^[0-9a-f]{64}$'},oidText={...text(24,24),pattern:'^[0-9a-f]{24}$'};
// Finite technical bound for audit/resource strings absent a narrower business bound.
const evidence=text(1,2048),resourceKey=text(1,257);
const option=object({id:sid,label:text(1,200)}),options=array(option,2,100),strings=array(sid,1,100,true);
const singleCondition=object({op:enumeration('eq'),optionId:sid});
const multipleCondition=object({op:enumeration('containsAny','containsAll'),optionIds:strings});
const numberCondition=object({op:enumeration('eq','lt','lte','gt','gte'),number:decimal});
const rules=(condition:Schema)=>array(object({id:sid,condition,targetQuestionId:sid}),0,100);
const contentProperties=[
  {type:enumeration('single'),title:text(1,500),options},
  {type:enumeration('multiple'),title:text(1,500),options,validation:object({minChoices:integer(0,100),maxChoices:integer(0,100)},[])},
  {type:enumeration('text'),title:text(1,500),validation:object({minLength:integer(0,10000),maxLength:integer(0,10000)},[])},
  {type:enumeration('number'),title:text(1,500),validation:object({min:decimal,max:decimal,integerOnly:bool},['integerOnly'])},
];
export const storedContentSchema={oneOf:contentProperties.map(properties=>object(properties))};
const ruleSchemas=[rules(singleCondition),rules(multipleCondition),array(object({}),0,0),rules(numberCondition)];
export const storedQuestionSchema={oneOf:contentProperties.map((properties,i)=>object({...properties,id:sid,required:bool,jumpRules:ruleSchemas[i]}))};
const questions=(min=0)=>array(storedQuestionSchema,min,100);
const answer={oneOf:[object({questionId:sid,type:enumeration('single'),optionId:sid}),object({questionId:sid,type:enumeration('multiple'),optionIds:strings}),
  object({questionId:sid,type:enumeration('text'),text:text(1,10000)}),object({questionId:sid,type:enumeration('number'),number:decimal})]};
const created={_id:oid,schemaVersion:format(1),createdAt:date},mutable={...created,updatedAt:date};
const surveyBase={_id:oid,ownerId:oid,publicId:sid,title:text(1,200),description:text(0,2000),status:enumeration('draft','published','paused','closed'),
  allowAnonymous:bool,allowRepeat:bool,expiresAt:nullable(date),definitionVersion:integer(1),revision:integer(),structureLocked:bool,
  submissionCount:integer(),currentVersionSubmissionCount:integer(),currentPublishedVersion:nullable(integer(1)),questions:questions(),copiedFromId:nullable(oid),firstPublishedAt:nullable(date),createdAt:date,updatedAt:date};
const snapshotBase={_id:oid,surveyId:oid,version:integer(1),sourceDefinitionVersion:integer(1),
  definition:object({title:text(1,200),description:text(0,2000),questions:questions(1)}),policySnapshot:object({allowAnonymous:bool,allowRepeat:bool}),
  definitionHash:hash,publishedAt:date,publishedBy:oid,publicationRequestId:key,publicationRequestHash:hash,origin:object({kind:enumeration('publication')})};
const distributionSource={oneOf:[
  object({kind:enumeration('original'),sourceQuestionId:nil,sourceVersionId:nil}),
  object({kind:enumeration('derived'),sourceQuestionId:oid,sourceVersionId:oid}),
  object({kind:enumeration('unrecorded'),sourceQuestionId:nil,sourceVersionId:nil})]};
const origin=nullable({oneOf:[object({kind:enumeration('fork'),sourceQuestionId:oid,sourceVersionId:oid,evidenceKey:nullable(evidence)}),
  object({kind:enumeration('legacyImport'),sourceQuestionId:nullable(oid),sourceVersionId:nullable(oid),evidenceKey:nullable(evidence)})]});
const authorization={oneOf:[object({kind:enumeration('owner')}),object({kind:enumeration('share'),grantId:oid,grantRevision:integer()}),
  object({kind:enumeration('template'),templateId:oid,templateHash:hash}),object({kind:enumeration('legacyImport'),evidenceKey:evidence})]};
const bindingBase={...created,surveyId:oid,ownerId:oid,instanceId:sid,questionId:oid,questionVersionId:oid,contentHash:hash,acquisitionId:oid,
  acquiredAt:date,authorization,mappingKind:enumeration('native','legacyImport'),evidenceKey:nullable(evidence)};
const obligationBase={questionId:oid,questionVersionId:oid,authorId:oid};
const obligation={oneOf:[object({...obligationBase,grantId:nil,grantRevision:nil}),object({...obligationBase,grantId:oid,grantRevision:integer()})]};
const templateBinding=object({instanceId:sid,questionId:oid,questionVersionId:oid,contentHash:hash,
  distributionProof:object({lineageHash:hash,obligations:array(obligation,1,32)})});
const grantState={state:enumeration('active','revoked'),revision:integer(),revokedAt:nullable(date)};
const receiptBase={...created,actorId:oid,resourceKey,requestKey:key,requestHash:hash,resultVersion:format(1)};
const issue=object({code:text(1,128),field:text(1,2048),questionId:nullable(sid),message:text(1,1000)});
export const resourceOperations=['createQuestion','saveVersion','restoreVersion','forkQuestion','createBank','createTemplate'] as const;
export const instanceOperations=['attachQuestion','replaceQuestion','saveInlineQuestion'] as const;
export const phase2Schemas:Record<keyof Phase2Documents,Schema>={
  users:object({...mutable,username:text(1,50),usernameKey:text(1,50),passwordHash:text(1,2048)}),
  surveys:{oneOf:[object({...surveyBase,schemaVersion:format(2)}),object({...surveyBase,schemaVersion:format(3),usageNumber:sid,
    originTemplate:nullable(object({templateId:oid,contentHash:hash,acquiredAt:date}))})]},
  survey_versions:{oneOf:[object({...snapshotBase,schemaVersion:format(1)}),object({...snapshotBase,schemaVersion:format(2),bindingHash:hash})]},
  responses:object({_id:oid,schemaVersion:format(2),surveyId:oid,surveyDefinitionVersion:integer(1),respondentId:oid,anonymous:bool,repeatAllowed:bool,
    payloadHashVersion:format(2),requestId:key,payloadHash:hash,answers:array(answer,0,100),submittedAt:date}),
  question_items:object({...mutable,ownerId:oid,revision:integer(),accessFence:integer(),latestVersionId:nullable(oid),nextVersion:integer(1),
    draft:nullable(object({content:storedContentSchema,baseVersionId:nullable(oid),revision:integer()})),origin}),
  question_versions:object({...created,questionId:oid,version:integer(1),content:storedContentSchema,contentHash:hash,distributionSource,
    parentVersionId:nullable(oid),restoredFromVersionId:nullable(oid),operation:enumeration('save','restore','fork','legacyImport'),createdBy:oid,evidenceKey:nullable(evidence)}),
  question_banks:object({...mutable,ownerId:oid,name:text(1,100),revision:integer(),deletedAt:nullable(date)}),
  question_bank_members:object({...created,bankId:oid,questionId:oid,ownerId:oid}),
  question_grants:object({...mutable,questionId:oid,recipientId:oid,grantedBy:oid,...grantState}),
  survey_question_bindings:{oneOf:[object({...bindingBase,scope:enumeration('draft'),publicationVersion:{...integer(0,0),enum:[0]},snapshotHash:nil}),
    object({...bindingBase,scope:enumeration('publication'),publicationVersion:integer(1),snapshotHash:hash})]},
  survey_templates:object({...mutable,publisherId:oid,sourceSurveyId:oid,sourcePublishedVersion:integer(1),status:enumeration('listed','unlisted'),revision:integer(),accessFence:integer(),
    title:text(1,200),description:text(0,2000),questions:questions(1),bindings:array(templateBinding,1,100),contentHash:hash}),
  template_grants:object({...mutable,questionId:oid,questionVersionId:oid,publisherId:oid,grantedBy:oid,...grantState}),
  operation_receipts:{oneOf:[
    object({...receiptBase,operation:enumeration(...resourceOperations),firstHttpStatus:format(201),result:object({kind:enumeration('resourceReceipt'),
      data:object({resourceId:oidText,versionId:nullable(oidText),revision:nullable(integer())})})}),
    object({...receiptBase,operation:enumeration(...instanceOperations),firstHttpStatus:format(200),result:object({kind:enumeration('instanceSave'),
      data:object({revision:integer(),draftDefinitionRevision:integer(1),instanceId:sid,questionVersionId:oidText,validationIssues:array(issue,0,20000)})})}),
    object({...receiptBase,operation:enumeration('adoptTemplate'),firstHttpStatus:format(201),result:object({kind:enumeration('templateAdoption'),data:object({surveyId:oidText,revision:integer()})})})]},
};
type IndexSpec=(typeof indexSpecs)[string][number];
const index=(name:string,key:IndexSpec['key'],unique=false):IndexSpec=>({name,key,...(unique?{unique:true}:{})});
export const phase2IndexSpecs:Record<keyof Phase2Documents,IndexSpec[]>={
  users:[...indexSpecs.users],surveys:[...indexSpecs.surveys,{...index('uq_survey_usage_number',{usageNumber:1},true),partialFilterExpression:{usageNumber:{$type:'string'}}}],
  survey_versions:[...indexSpecs.survey_versions],responses:[...indexSpecs.responses],
  question_items:[index('ix_question_owner',{ownerId:1,createdAt:-1,_id:-1}),index('ix_fork_source',{'origin.sourceQuestionId':1,createdAt:-1,_id:-1})],
  question_versions:[index('uq_question_version',{questionId:1,version:1},true),index('ix_question_parent',{parentVersionId:1,_id:1}),index('ix_distribution_source',{'distributionSource.sourceVersionId':1,_id:1})],
  question_banks:[index('ix_bank_owner',{ownerId:1,deletedAt:1,createdAt:-1,_id:-1})],
  question_bank_members:[index('uq_bank_question',{bankId:1,questionId:1},true),index('ix_bank_members',{bankId:1,createdAt:-1,_id:-1})],
  question_grants:[index('uq_question_recipient',{questionId:1,recipientId:1},true),index('ix_received',{recipientId:1,state:1,createdAt:-1,_id:-1})],
  survey_question_bindings:[index('uq_instance_binding',{surveyId:1,scope:1,publicationVersion:1,instanceId:1},true),index('ix_question_usage',{questionId:1,questionVersionId:1,surveyId:1}),
    index('ix_owned_question',{ownerId:1,questionId:1,questionVersionId:1,scope:1,surveyId:1,publicationVersion:1})],
  survey_templates:[index('ix_template_square',{status:1,createdAt:-1,_id:-1}),index('ix_template_owner',{publisherId:1,createdAt:-1,_id:-1})],
  template_grants:[index('uq_distribution',{questionVersionId:1,publisherId:1},true),index('ix_author_distribution',{grantedBy:1,createdAt:-1,_id:-1})],
  operation_receipts:[index('uq_operation',{actorId:1,operation:1,resourceKey:1,requestKey:1},true)],
};
