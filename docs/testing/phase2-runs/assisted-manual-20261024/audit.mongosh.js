// Read-only audit of the actual browser-assisted manual acceptance samples.
// No inserts, updates, deletes, $out or $merge. Explicit phase2-only guard.
(async function () {
  const p2 = db.getSiblingDB('project2_app_v2');
  const hello = await p2.adminCommand({hello:1});
  const opts = await p2.adminCommand({getCmdLineOpts:1});
  if (hello.setName !== 'rs0' || opts.parsed.net.port !== 27019) throw Error('Expected phase2 27019/rs0');
  const ids = {
    W01:'6adcc529ba826d37d9e2d205', W02:'6adcc6e9ba826d37d9e2d229',
    W03:'6adcc770ba826d37d9e2d236', W04:'6adcd02bba826d37d9e2d259',
    W05:'6adcd50dba826d37d9e2d27f', W06:'6adcd577ba826d37d9e2d28f',
    W07:'6adcc924ba826d37d9e2d24f', W08:'6adcd88aba826d37d9e2d2b2'
  };
  const expected = {W01:[4,4,1],W02:[1,1,1],W03:[3,1,2],W04:[1,0,2],W05:[3,3,1],W06:[2,1,2],W07:[0,0,null],W08:[3,0,3]};
  const surveys = await p2.surveys.find({_id:{$in:Object.values(ids).map(ObjectId)}}).toArray();
  const responses = await p2.responses.find({surveyId:{$in:surveys.map(s=>s._id)}}).toArray();
  const publications = await p2.survey_versions.find({surveyId:{$in:surveys.map(s=>s._id)}}).toArray();
  const bindings = await p2.survey_question_bindings.find({surveyId:{$in:surveys.map(s=>s._id)}}).toArray();
  const versions = await p2.question_versions.find({}).toArray();
  const byId = new Map(surveys.map(s=>[String(s._id),s]));
  const versionById = new Map(versions.map(v=>[String(v._id),v]));
  const checks = [];
  const check = (name,pass,detail) => checks.push({name,pass:!!pass,...(detail === undefined ? {} : {detail})});
  const s = name=>byId.get(ids[name]);
  const pub = (name,v)=>publications.find(p=>String(p.surveyId)===ids[name]&&p.version===v);
  const same = (a,b)=>EJSON.stringify(a)===EJSON.stringify(b);
  const counts = Object.entries(ids).map(([name,id])=>{
    const survey=byId.get(id), rows=responses.filter(r=>String(r.surveyId)===id);
    const current=rows.filter(r=>r.surveyDefinitionVersion===survey.currentPublishedVersion).length;
    check(name+' counters',rows.length===survey.submissionCount&&current===survey.currentVersionSubmissionCount);
    check(name+' actual recipe',same([rows.length,current,survey.currentPublishedVersion],expected[name]));
    return {name,id,title:survey.title,status:survey.status,publishedVersion:survey.currentPublishedVersion,total:rows.length,current,
      byPublication:publications.filter(p=>String(p.surveyId)===id).map(p=>({version:p.version,count:rows.filter(r=>r.surveyDefinitionVersion===p.version).length}))};
  });
  check('Eight selected survey identities',surveys.length===8);
  check('Actual selected responses total 17',responses.length===17);
  const brokenBindings=bindings.filter(b=>{const v=versionById.get(String(b.questionVersionId));return !v||String(v.questionId)!==String(b.questionId)||v.contentHash!==b.contentHash;});
  check('Every binding resolves exact formal identity and hash',brokenBindings.length===0,{count:bindings.length,broken:brokenBindings.map(b=>String(b._id))});
  const bindingGroups=new Map();
  for(const b of bindings){const key=[b.surveyId,b.scope,b.publicationVersion,b.questionId,b.questionVersionId].join('|');bindingGroups.set(key,(bindingGroups.get(key)||0)+1);}
  check('No same-question same-version duplicates in one definition',[...bindingGroups.values()].every(n=>n===1));
  check('All response publication and instance references valid',responses.every(r=>{const p=publications.find(p=>String(p.surveyId)===String(r.surveyId)&&p.version===r.surveyDefinitionVersion);return p&&r.answers.every(a=>p.definition.questions.some(q=>q.id===a.questionId));}));
  const template=await p2.survey_templates.findOne({_id:ObjectId('6adcd317ba826d37d9e2d273')});
  check('Exactly one existing public template',await p2.survey_templates.countDocuments({})===1);
  check('Original template still source publication v1',String(template.sourceSurveyId)===ids.W04&&template.sourcePublishedVersion===1&&same(template.questions,pub('W04',1).definition.questions));
  check('Source v2 optional Q2 but fixed template required',s('W04').questions[1].required===false&&template.questions[1].required===true);
  check('Template immutable content hash retained',template.contentHash==='e6fe4c1b8a8d1fbc6d7b72acd8b62435b0225fb168ee393f4ef627668b31c1e2');
  check('Original template relisted',template.status==='listed'&&template.revision===2);
  const instances=['W04','W05','W06'].flatMap(name=>pub(name,1).definition.questions.map(q=>q.id));
  check('Source/C/D twelve instance IDs independent',new Set(instances).size===12);
  const ruleIds=['W04','W05','W06'].map(name=>pub(name,1).definition.questions[0].jumpRules[0].id);
  check('Source/C/D rule IDs independent',new Set(ruleIds).size===3);
  check('Each adopted jump targets its own Q3',['W04','W05','W06'].every(name=>{const qs=pub(name,1).definition.questions;return qs[0].jumpRules[0].targetQuestionId===qs[2].id;}));
  check('C-only required text config',pub('W05',1).definition.questions[3].required&&!pub('W06',1).definition.questions[3].required&&!pub('W04',1).definition.questions[3].required);
  check('C/D default policies independent from source',['W05','W06'].every(name=>!s(name).allowAnonymous&&!s(name).allowRepeat&&s(name).expiresAt===null));
  const at01='6adcc3d7ba826d37d9e2d1ec', at02='6adcc3f3ba826d37d9e2d1f0', at01v1='6adcc3e4ba826d37d9e2d1ee', at02v1='6adcc3ffba826d37d9e2d1f2';
  const privateGrants=await p2.question_grants.find({questionId:{$in:[ObjectId(at01),ObjectId(at02)]}}).toArray();
  check('Both private grants remain revoked',privateGrants.length===2&&privateGrants.every(g=>g.state==='revoked'));
  const publicGrants=await p2.template_grants.find({questionVersionId:{$in:[ObjectId(at01v1),ObjectId(at02v1)]}}).toArray();
  check('Both exact v1 public grants restored to B only',publicGrants.length===2&&publicGrants.every(g=>g.state==='active'&&String(g.publisherId)==='6adcb9e4ba826d37d9e2d1e5'));
  const fork=await p2.question_items.findOne({_id:ObjectId('6adcd7dfba826d37d9e2d2a6')});
  check('Derivative retains original question/version lineage',String(fork.origin.sourceQuestionId)===at02&&String(fork.origin.sourceVersionId)===at02v1);
  const w06q2=pub('W06',1).definition.questions[1].id;
  const mapped=version=>bindings.find(b=>String(b.surveyId)===ids.W06&&b.scope==='publication'&&b.publicationVersion===version&&b.instanceId===w06q2);
  check('Derivative replacement keeps instance but changes exact identity',String(mapped(1).questionId)===at02&&String(mapped(2).questionId)===String(fork._id));
  const numeric = name=>responses.filter(r=>String(r.surveyId)===ids[name]).flatMap(r=>r.answers.filter(a=>a.type==='number').map(a=>{
    const binding=bindings.find(b=>String(b.surveyId)===ids[name]&&b.scope==='publication'&&b.publicationVersion===r.surveyDefinitionVersion&&b.instanceId===a.questionId);
    return {responseId:String(r._id),publication:r.surveyDefinitionVersion,questionId:String(binding.questionId),questionVersionId:String(binding.questionVersionId),value:String(a.number)};
  }));
  const numericRows=Object.fromEntries(['W02','W03','W04','W05','W06','W08'].map(name=>[name,numeric(name)]));
  check('C valid values 2 and 5; skipped does not become zero',same(numericRows.W05.map(a=>a.value).sort(),['2','5'])&&responses.filter(r=>String(r.surveyId)===ids.W05).length===3);
  check('D original 4 and derivative 6 separated',numericRows.W06.length===2&&numericRows.W06.some(a=>a.questionId===at02&&a.value==='4'&&a.publication===1)&&numericRows.W06.some(a=>a.questionId===String(fork._id)&&a.value==='6'&&a.publication===2));
  check('W08 same formal version across three publications',new Set(bindings.filter(b=>String(b.surveyId)===ids.W08&&b.scope==='publication').map(b=>String(b.questionVersionId))).size===1);
  check('W08 closed after natural expiry',s('W08').status==='closed'&&s('W08').expiresAt.getTime()<Date.now());
  check('W08 three anonymous responses only',responses.filter(r=>String(r.surveyId)===ids.W08).every(r=>r.anonymous===true)&&same(numericRows.W08.map(a=>a.value).sort(),['2','4','8']));
  check('W08 v3 has no extra 9 submission',!responses.some(r=>String(r.surveyId)===ids.W08&&r.surveyDefinitionVersion===3));
  const w08Rows=responses.filter(r=>String(r.surveyId)===ids.W08);
  const bRows=w08Rows.filter(r=>String(r.respondentId)==='6adcb9e4ba826d37d9e2d1e5');
  check('W08 B repeated as two real request keys',bRows.length===2&&new Set(bRows.map(r=>r.requestId)).size===2&&same(bRows.map(r=>r.surveyDefinitionVersion).sort(),[1,2]));
  const pending=await p2.question_items.findOne({_id:ObjectId(at02)});
  check('AT02 pending v2-based draft and restored v3 retained',pending.nextVersion===4&&String(pending.draft.baseVersionId)==='6adcc815ba826d37d9e2d244'&&pending.draft.content.title.endsWith('（草稿）')&&versions.filter(v=>String(v.questionId)===at02).length===3);
  const extras=await p2.surveys.find({_id:{$in:[ObjectId('6adcc4e5ba826d37d9e2d201'),ObjectId('6adcd31fba826d37d9e2d275')]}}).toArray();
  check('Both pre-existing extra drafts retained untouched',extras.length===2&&extras.every(e=>e.status==='draft'&&e.submissionCount===0));
  const receipts=responses.map(r=>({id:String(r._id),survey:Object.keys(ids).find(name=>ids[name]===String(r.surveyId)),publication:r.surveyDefinitionVersion,anonymous:r.anonymous,submittedAt:r.submittedAt.toISOString()}));
  const result={checkedAt:new Date().toISOString(),database:p2.getName(),port:27019,replicaSet:hello.setName,scope:'Read-only persisted-data checks; browser steps separately documented',counts,checks,passed:checks.filter(c=>c.pass).length,total:checks.length,numericRows,receipts,
    template:{id:String(template._id),sourceVersion:template.sourcePublishedVersion,status:template.status,revision:template.revision,contentHash:template.contentHash},
    privateGrants:privateGrants.map(g=>({id:String(g._id),questionId:String(g.questionId),state:g.state,revision:g.revision})),
    publicGrants:publicGrants.map(g=>({id:String(g._id),versionId:String(g.questionVersionId),publisherId:String(g.publisherId),state:g.state,revision:g.revision}))};
  print('AUDIT_JSON='+JSON.stringify(result));
})();
