// Run in mongosh, connected explicitly to localhost:27019/rs0.
// Read-only manual inspection: no update/insert/delete/drop/$out/$merge.
// First load without P2_MANUAL_AUDIT to discover actual IDs. Then set:
// var P2_MANUAL_AUDIT = {surveyIds:['actual 24-hex ID'],questionId:'actual 24-hex ID',ownerUsername:'actual username'};
// load('D:/大三/数据库/pj1_2/database/inspect-phase2-manual.mongosh.js')
// mongosh 2.11.1 misrewrites a top-level `await (async () => ...)()`.
// Return the promise directly; load() awaits it through mongosh's own evaluator.
(async function () {
  const p2 = db.getSiblingDB('project2_app_v2');
  const hello = await p2.adminCommand({hello:1});
  const options = await p2.adminCommand({getCmdLineOpts:1});
  if (options.parsed.net.port !== 27019 || hello.setName !== 'rs0') {
    throw new Error('Stop: expected the phase2 local 27019/rs0 instance.');
  }
  const heading = title => print('\n===== ' + title + ' =====');
  const show = async (collection,pipeline) => printjson(await p2.getCollection(collection).aggregate(pipeline).toArray());
  const cfg = typeof P2_MANUAL_AUDIT === 'undefined' ? {} : P2_MANUAL_AUDIT;
  if (!cfg || typeof cfg !== 'object' || Array.isArray(cfg)) throw new Error('P2_MANUAL_AUDIT must be an object.');
  const asId = value => {
    if (typeof value !== 'string' || !/^[a-fA-F0-9]{24}$/.test(value)) throw new Error('Copy a real 24-hex ID from the inventory.');
    return ObjectId(value);
  };
  if (cfg.surveyIds !== undefined && (!Array.isArray(cfg.surveyIds) || !cfg.surveyIds.length)) throw new Error('surveyIds must be a nonempty array.');
  const surveyIds = (cfg.surveyIds || []).map(asId);
  const qid = cfg.questionId ? asId(cfg.questionId) : null;
  heading('Connection: phase2 application only');
  printjson({database:p2.getName(),port:options.parsed.net.port,replicaSet:hello.setName,checkedAt:new Date()});
  heading('Collections');
  printjson(await p2.getCollectionNames());
  heading('Users: no password hashes');
  printjson(await p2.users.find({},{_id:1,username:1,createdAt:1}).sort({createdAt:1}).toArray());
  heading('Actual surveys: copy IDs, do not assume planned titles/counts');
  await show('surveys',[
    {$lookup:{from:'users',localField:'ownerId',foreignField:'_id',as:'owner'}},
    {$project:{_id:1,title:1,owner:{$arrayElemAt:['$owner.username',0]},usageNumber:1,status:1,
      currentPublishedVersion:1,submissionCount:1,currentVersionSubmissionCount:1,
      questionCount:{$size:'$questions'},allowAnonymous:1,allowRepeat:1,expiresAt:1}},
    {$sort:{owner:1,title:1,_id:1}}
  ]);
  heading('Actual question identities: draft/latest title may differ from old formal versions');
  await show('question_items',[
    {$lookup:{from:'users',localField:'ownerId',foreignField:'_id',as:'owner'}},
    {$lookup:{from:'question_versions',localField:'latestVersionId',foreignField:'_id',as:'latest'}},
    {$project:{_id:1,owner:{$arrayElemAt:['$owner.username',0]},draftTitle:'$draft.content.title',
      latestTitle:{$arrayElemAt:['$latest.content.title',0]},latestVersion:{$arrayElemAt:['$latest.version',0]},
      latestVersionId:1,nextVersion:1,origin:1}},{$sort:{owner:1,_id:1}}
  ]);
  if (!surveyIds.length && !qid) {
    print('\nInventory only. Copy your actual survey/question IDs, set P2_MANUAL_AUDIT, then load again.');
    return;
  }
  if (surveyIds.length) {
    const surveys = await p2.surveys.find({_id:{$in:surveyIds}}).toArray();
    if (surveys.length !== new Set(surveyIds.map(String)).size) throw new Error('One or more selected surveys do not exist in project2_app_v2.');
    heading('Selected drafts: questions are the current editable definition, not old publications');
    printjson(surveys.map(s=>({_id:s._id,title:s.title,ownerId:s.ownerId,status:s.status,revision:s.revision,
      definitionVersion:s.definitionVersion,currentPublishedVersion:s.currentPublishedVersion,questions:s.questions})));
    heading('Immutable publication snapshots: compare each version and binding/definition hashes');
    printjson(await p2.survey_versions.find({surveyId:{$in:surveyIds}},
      {_id:1,surveyId:1,version:1,sourceDefinitionVersion:1,definition:1,policySnapshot:1,
        definitionHash:1,bindingHash:1,publishedAt:1}).sort({surveyId:1,version:1}).toArray());
    heading('Stored counter vs actual response count: matches should both be true');
    await show('surveys',[
      {$match:{_id:{$in:surveyIds}}},
      {$lookup:{from:'responses',let:{sid:'$_id',current:'$currentPublishedVersion'},pipeline:[
        {$match:{$expr:{$eq:['$surveyId','$$sid']}}},
        {$group:{_id:null,actualTotal:{$sum:1},actualCurrent:{$sum:{$cond:[{$eq:['$surveyDefinitionVersion','$$current']},1,0]}}}}
      ],as:'counts'}},
      {$set:{actualTotal:{$ifNull:[{$arrayElemAt:['$counts.actualTotal',0]},0]},actualCurrent:{$ifNull:[{$arrayElemAt:['$counts.actualCurrent',0]},0]}}},
      {$project:{_id:1,title:1,currentPublishedVersion:1,storedTotal:'$submissionCount',actualTotal:1,
        totalMatches:{$eq:['$submissionCount','$actualTotal']},storedCurrent:'$currentVersionSubmissionCount',actualCurrent:1,
        currentMatches:{$eq:['$currentVersionSubmissionCount','$actualCurrent']}}},{$sort:{_id:1}}
    ]);
    heading('Actual answers by publication; respondent identity and request hashes omitted');
    printjson(await p2.responses.find({surveyId:{$in:surveyIds}},
      {_id:1,surveyId:1,surveyDefinitionVersion:1,anonymous:1,repeatAllowed:1,answers:1,submittedAt:1})
      .sort({surveyId:1,surveyDefinitionVersion:1,submittedAt:1,_id:1}).toArray());
    heading('Instance -> formal question/version mappings, with exact publication scope');
    await show('survey_question_bindings',[
      {$match:{surveyId:{$in:surveyIds}}},
      {$lookup:{from:'question_versions',localField:'questionVersionId',foreignField:'_id',as:'version'}},
      {$set:{v:{$arrayElemAt:['$version',0]}}},
      {$project:{_id:1,surveyId:1,scope:1,publicationVersion:1,instanceId:1,questionId:1,questionVersionId:1,
        formalVersion:'$v.version',formalTitle:'$v.content.title',authorization:1,acquisitionId:1,
        contentHash:1,snapshotHash:1,formalVersionFound:{$eq:[{$size:'$version'},1]},
        questionMatches:{$eq:['$questionId','$v.questionId']},hashMatches:{$eq:['$contentHash','$v.contentHash']}}},
      {$sort:{surveyId:1,scope:1,publicationVersion:1,instanceId:1}}
    ]);
    heading('S04 duplicates within one definition: expected [] for native manual samples');
    await show('survey_question_bindings',[
      {$match:{surveyId:{$in:surveyIds}}},
      {$group:{_id:{surveyId:'$surveyId',scope:'$scope',publicationVersion:'$publicationVersion',
        questionId:'$questionId',questionVersionId:'$questionVersionId'},instances:{$push:'$instanceId'},count:{$sum:1}}},
      {$match:{count:{$gt:1}}}
    ]);
    heading('Broken response -> publication/instance references: expected []');
    await show('responses',[
      {$match:{surveyId:{$in:surveyIds}}},
      {$lookup:{from:'survey_versions',let:{sid:'$surveyId',pv:'$surveyDefinitionVersion'},pipeline:[
        {$match:{$expr:{$and:[{$eq:['$surveyId','$$sid']},{$eq:['$version','$$pv']}]}}},
        {$project:{_id:1,instanceIds:'$definition.questions.id'}}
      ],as:'publication'}},
      {$set:{unknownInstances:{$setDifference:['$answers.questionId',{$ifNull:[{$arrayElemAt:['$publication.instanceIds',0]},[]]}]}}},
      {$match:{$expr:{$or:[{$ne:[{$size:'$publication'},1]},{$gt:[{$size:'$unknownInstances'},0]}]}}},
      {$project:{_id:1,surveyId:1,surveyDefinitionVersion:1,unknownInstances:1}}
    ]);
  }
  if (qid) {
    if (!await p2.question_items.findOne({_id:qid})) throw new Error('Selected question does not exist.');
    heading('Selected question: current pending draft and origin');
    printjson(await p2.question_items.findOne({_id:qid}));
    heading('Formal history: restore creates a new number; old versions remain');
    printjson(await p2.question_versions.find({questionId:qid},{_id:1,questionId:1,version:1,content:1,contentHash:1,
      operation:1,parentVersionId:1,restoredFromVersionId:1,distributionSource:1,createdAt:1})
      .sort({version:1}).toArray());
    heading('Private share state: revoked rows are retained');
    await show('question_grants',[
      {$match:{questionId:qid}},{$lookup:{from:'users',localField:'recipientId',foreignField:'_id',as:'recipient'}},
      {$project:{_id:1,questionId:1,recipientUsername:{$arrayElemAt:['$recipient.username',0]},
        grantedBy:1,state:1,revision:1,revokedAt:1,updatedAt:1}}
    ]);
    heading('All acquired references: revocation must not remove existing draft/publication bindings');
    printjson(await p2.survey_question_bindings.find({questionId:qid},
      {_id:1,surveyId:1,ownerId:1,scope:1,publicationVersion:1,instanceId:1,questionVersionId:1,
        authorization:1,acquiredAt:1}).sort({surveyId:1,scope:1,publicationVersion:1}).toArray());
    heading('Bank membership: directory deletion does not delete the question');
    await show('question_bank_members',[
      {$match:{questionId:qid}},{$lookup:{from:'question_banks',localField:'bankId',foreignField:'_id',as:'bank'}},
      {$project:{_id:1,questionId:1,bankId:1,ownerId:1,bankName:{$arrayElemAt:['$bank.name',0]},
        bankDeletedAt:{$arrayElemAt:['$bank.deletedAt',0]}}}
    ]);
    if (cfg.ownerUsername) {
      const owner = await p2.users.findOne({username:cfg.ownerUsername},{_id:1,username:1});
      if (!owner) throw new Error('ownerUsername must exactly match a username in the inventory.');
      const owned = await p2.surveys.find({ownerId:owner._id,...(surveyIds.length?{_id:{$in:surveyIds}}:{})},{_id:1}).toArray();
      heading('Independent numeric oracle: chosen owner only, grouped by exact formal version');
      printjson({ownerUsername:owner.username,surveyIds:owned.map(s=>s._id),note:'Effective numeric answers only; skipped/unanswered are not zero. This does not recompute jump-path counts.'});
      await show('responses',[
        {$match:{surveyId:{$in:owned.map(s=>s._id)}}},{$unwind:'$answers'},{$match:{'answers.type':'number'}},
        {$lookup:{from:'survey_question_bindings',let:{sid:'$surveyId',pv:'$surveyDefinitionVersion',iid:'$answers.questionId'},pipeline:[
          {$match:{$expr:{$and:[{$eq:['$surveyId','$$sid']},{$eq:['$scope','publication']},
            {$eq:['$publicationVersion','$$pv']},{$eq:['$instanceId','$$iid']},{$eq:['$questionId',qid]}]}}}
        ],as:'binding'}},{$unwind:'$binding'},
        {$group:{_id:'$binding.questionVersionId',answeredCount:{$sum:1},average:{$avg:'$answers.number'},
          min:{$min:'$answers.number'},max:{$max:'$answers.number'},values:{$push:'$answers.number'},surveyIds:{$addToSet:'$surveyId'}}},
        {$lookup:{from:'question_versions',localField:'_id',foreignField:'_id',as:'version'}},
        {$project:{_id:1,formalVersion:{$arrayElemAt:['$version.version',0]},title:{$arrayElemAt:['$version.content.title',0]},
          answeredCount:1,average:1,min:1,max:1,values:1,surveyIds:1}},{$sort:{formalVersion:1}}
      ]);
    }
  }
  print('\nRead-only inspection finished. No PASS claim: compare the output with your actual actions.');
})();
