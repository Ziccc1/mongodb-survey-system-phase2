  const str = { bsonType: 'string', minLength: 1 };
  const id = { bsonType: 'objectId' };
  const date = { bsonType: 'date' };
  const bool = { bsonType: 'bool' };
  const integer = { bsonType: ['int', 'long'], minimum: 0 };
  const decimal = { bsonType: 'decimal' };
  const object = (properties: Record<string, unknown>, required = Object.keys(properties)) => ({
    bsonType: 'object', additionalProperties: false,
    ...(required.length ? { required } : {}), properties
  });
  const stringArray = { bsonType: 'array', items: str, uniqueItems: true };
  const option = object({ id: str, label: str });
  const rule = object({
    id: str,
    condition: { oneOf: [
      object({ op: { enum: ['eq'] }, optionId: str }),
      object({ op: { enum: ['containsAny', 'containsAll'] }, optionIds: { ...stringArray, minItems: 1 } }),
      object({ op: { enum: ['eq', 'lt', 'lte', 'gt', 'gte'] }, number: decimal })
    ] },
    targetQuestionId: str
  });
  const commonQuestion = {
    id: str, title: str, required: bool,
    jumpRules: { bsonType: 'array', items: rule }
  };
  const question = { oneOf: [
    object({ ...commonQuestion, type: { enum: ['single'] },
      options: { bsonType: 'array', minItems: 2, items: option } }),
    object({ ...commonQuestion, type: { enum: ['multiple'] },
      options: { bsonType: 'array', minItems: 2, items: option },
      validation: object({ minChoices: integer, maxChoices: integer }, []) }),
    object({ ...commonQuestion, type: { enum: ['text'] },
      validation: object({ minLength: integer, maxLength: integer }, []) }),
    object({ ...commonQuestion, type: { enum: ['number'] },
      validation: object({ min: decimal, max: decimal, integerOnly: bool }, ['integerOnly']) })
  ] };
  const answer = { oneOf: [
    object({ questionId: str, type: { enum: ['single'] }, optionId: str }),
    object({ questionId: str, type: { enum: ['multiple'] }, optionIds: { ...stringArray, minItems: 1 } }),
    object({ questionId: str, type: { enum: ['text'] }, text: str }),
    object({ questionId: str, type: { enum: ['number'] }, number: decimal })
  ] };
  export const schemas = {
    users: object({
      _id: id, schemaVersion: { enum: [1] }, username: str, usernameKey: str,
      passwordHash: str, createdAt: date, updatedAt: date
    }),
    surveys: object({
      _id: id, schemaVersion: { enum: [2] }, ownerId: id, publicId: str,
      title: str, description: { bsonType: 'string' },
      status: { enum: ['draft', 'published', 'paused', 'closed'] },
      allowAnonymous: bool, allowRepeat: bool,
      expiresAt: { bsonType: ['date', 'null'] },
      definitionVersion: { ...integer, minimum: 1 }, revision: integer,
      structureLocked: bool, submissionCount: integer,
      currentPublishedVersion: { bsonType: ['int', 'long', 'null'], minimum: 1 }, currentVersionSubmissionCount: integer,
      questions: { bsonType: 'array', items: question },
      copiedFromId: { bsonType: ['objectId', 'null'] },
      firstPublishedAt: { bsonType: ['date', 'null'] }, createdAt: date, updatedAt: date
    }),
    responses: object({
      _id: id, schemaVersion: { enum: [2] }, surveyId: id,
      surveyDefinitionVersion: { ...integer, minimum: 1 },
      respondentId: id, anonymous: bool, repeatAllowed: bool,
      payloadHashVersion: { enum: [2] }, requestId: str, payloadHash: { bsonType: 'string', pattern: '^[0-9a-f]{64}$' },
      answers: { bsonType: 'array', items: answer },
      submittedAt: date
    }),
    survey_versions: object({
      _id: id, schemaVersion: { enum: [1] }, surveyId: id,
      version: { ...integer, minimum: 1 }, sourceDefinitionVersion: { ...integer, minimum: 1 },
      definition: object({ title: str, description: { bsonType: 'string' }, questions: { bsonType: 'array', minItems: 1, items: question } }),
      policySnapshot: object({ allowAnonymous: bool, allowRepeat: bool }),
      definitionHash: { bsonType: 'string', pattern: '^[0-9a-f]{64}$' },
      publishedAt: date, publishedBy: id, publicationRequestId: str,
      publicationRequestHash: { bsonType: 'string', pattern: '^[0-9a-f]{64}$' },
      origin: object({ kind: { enum: ['publication'] } })
    })
  };

export const indexSpecs: Record<string, { key: Record<string, 1 | -1>; name: string; unique?: boolean; partialFilterExpression?: Record<string, unknown> }[]> = {
  users: [{ key: { usernameKey: 1 }, name: 'uq_username_key', unique: true }],
  surveys: [
    { key: { publicId: 1 }, name: 'uq_survey_public_id', unique: true },
    { key: { ownerId: 1, createdAt: -1, _id: -1 }, name: 'ix_owner_list' },
  ],
  responses: [
    { key: { surveyId: 1, submittedAt: -1, _id: -1 }, name: 'ix_survey_responses' },
    { key: { surveyId: 1, respondentId: 1 }, name: 'uq_one_response_per_user', unique: true, partialFilterExpression: { repeatAllowed: false } },
    { key: { surveyId: 1, respondentId: 1, requestId: 1 }, name: 'uq_submission_request', unique: true },
    { key: { surveyId: 1, surveyDefinitionVersion: 1, submittedAt: -1, _id: -1 }, name: 'ix_version_responses' },
  ],
  survey_versions: [
    { key: { surveyId: 1, version: 1 }, name: 'uq_survey_version', unique: true },
    { key: { surveyId: 1, publicationRequestId: 1 }, name: 'uq_publication_request', unique: true, partialFilterExpression: { publicationRequestId: { $type: 'string' } } },
  ],
};
