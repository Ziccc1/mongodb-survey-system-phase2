# MongoDB数据库增量设计

更新日期：2026-10-26。第二阶段八项需求及公开模板扩展均已实现并完成对应验证，当前主应用为 `localhost:27019/rs0` 的十三集合 `project2_app_v2`，通过 `:phase2` 命令启动；`project2_app_v1`仅保留四集合兼容基线。题目、题库、共享、固定引用、使用查询、跨问卷统计和模板均已接入API及页面。

2026-10-25已完成界面收尾、真实第一阶段数据的隔离恢复升级及当前本机数据库认证部署；应用使用受限账号，20项权限检查通过。真实迁移结果保存在独立目标库，当前网站继续使用第二阶段验收数据。S04/S05/S06均已确认实施。见[最终交付核对](phase2/delivery-verification.md)、[认证部署](phase2/authorization-deployment.md)和[真实迁移验证](phase2/real-migration-verification.md)。完整34组自动验收对应10月24日，收尾后的定向复测对应10月25日；原提示词、冻结材料及执行证据保留其历史日期。

实际可执行入口：`schema.ts`/`baselineRegistry`固定四集合，`phase2-schema.ts`/`phase2Registry`完整十三集合及28业务索引。`initializePhase2Schema`仍仅新test库；`initializePhase2ApplicationSchema`显式允许app_v2；启动/ready调用verify-only，要求survey格式3和全部来源覆盖，不把目标验证器允许旧格式2等同业务可运行。迁移apply是独立受控DDL路径，保留旧快照格式1/新格式2，responses格式2不扩展。角色现状见[实际认证部署](phase2/authorization-deployment.md)。

## 1 实际基线与变化总览

第一阶段已是四集合，不是历史旧文档中的三集合；Schema来自apps/api/src/database/schema.ts，模型来自models.ts、core/versions.ts、core/submission.ts。各集合均strict/error和additionalProperties=false。数据库不填默认值，默认由服务端构造。

| 集合 | 第一阶段完整顶层字段 | 第二阶段处理 |
| --- | --- | --- |
| users | _id、schemaVersion=1、username、usernameKey、passwordHash、createdAt、updatedAt | 全部保留，不升级 |
| surveys | _id、schemaVersion=2、ownerId、publicId、title、description、status、allowAnonymous、allowRepeat、expiresAt、definitionVersion、revision、structureLocked、submissionCount、currentPublishedVersion、currentVersionSubmissionCount、questions、copiedFromId、firstPublishedAt、createdAt、updatedAt | 全部保留；新格式3增加originTemplate、usageNumber；旧2仍可读 |
| survey_versions | _id、schemaVersion=1、surveyId、version、sourceDefinitionVersion、definition、policySnapshot、definitionHash、publishedAt、publishedBy、publicationRequestId、publicationRequestHash、origin.kind=publication | 全部保留；新格式2增加bindingHash；旧快照不改内容/hash/格式 |
| responses | _id、schemaVersion=2、surveyId、surveyDefinitionVersion、respondentId、anonymous、repeatAllowed、payloadHashVersion=2、requestId、payloadHash、answers、submittedAt | 全部保留，无新增字段，无数据重写 |

structureLocked已在第一阶段退出编辑准入，但字段保留；copiedFromId也保留，复制功能仍未启用。旧文档说legacyMigration或hashVersion1可兼容只是历史计划：真实Schema/代码目前不支持，本设计不借此宣布可迁移任意更早数据库。

新增9集合，总数推荐13：question_items、question_versions、question_banks、question_bank_members、question_grants、survey_question_bindings、survey_templates、template_grants、operation_receipts。不是机械把选项/规则各拆一个集合：有限内容整体嵌入，增长关系/历史独立分页。13是本轮技术推荐，不是教师指定数量。

## 2 字典约定与身份

本文件字段表合起来是完整白名单。除标?可选外均必填；nullable必须显式null，不可缺失。OID=ObjectId；S=string；B=bool；D=date；N=BSON int或long的安全整数，非负，版本>=1；H=64位小写SHA-256；SID=1—128字符[A-Za-z0-9_-]；Key=1—128字符[A-Za-z0-9._:-]。所有新集合schemaVersion为BSON int常量1，_id为OID；createdAt/updatedAt为D且服务器提供，createdAt不可改。下表未另指定默认的字段无默认、须可信构造。

| 标识 | 含义/作用域 |
| --- | --- |
| question_items._id | 跨问卷题身份OID，不能以题干/hash替代 |
| question_versions._id / version | 正式题版本OID / 同题递增展示号；编辑父来源看parentVersionId，分发来源看distributionSource |
| parentVersionId / restoredFromVersionId | 任意同题正式父版 / 恢复内容的来源正式版；不能用version-1推断 |
| surveys._id / publicId | 稳定问卷内部身份/分享标识，不因题库接入更换 |
| Question.id / bindings.instanceId | 问卷内SID实例；选项ID属于正式题内容，规则ID属于问卷 |
| survey_versions.version / responses.surveyDefinitionVersion | 问卷正式发布号/答卷关联号；与题版本不同 |
| surveys.definitionVersion / revision | 定义编辑修订/管理CAS；提交不增revision，管理定义变更双增 |
| schemaVersion | 存储格式，不是任何业务版本 |

正式内容Content为判别联合，只有type/title及类型内容字段，禁止id/required/jumpRules：single必须options且无validation；multiple必须options及validation{minChoices?,maxChoices?}；text必须validation{minLength?,maxLength?}；number必须validation{min?:Decimal128,max?:Decimal128,integerOnly:B}。每选项{id:SID,label:S}，2—100个且ID唯一；题干trim非空<=500码点，选项非空<=200。数量/长度整数上界100/10000，范围合理，沿用questions.ts精确十进制与Unicode口径。

配置Config={required:B,jumpRules:Rule[]}，默认false/[]；题序由questions数组顺序确定。Rule={id:SID,condition:Condition,targetQuestionId:SID}。单选eq+optionId，多选containsAny/All+非空唯一optionIds，数字eq/lt/lte/gt/gte+Decimal128，文本规则[]。每题<=100规则，规则ID全卷唯一，仅向后目标。复用已有validateQuestions/evaluateAnswers：把Content+Config+instanceId materialize成旧扁平Question，不把整个数据库来源对象送入旧函数。

## 3 四核心集合完整字段

### users

| 字段 | 类型/默认/约束 |
| --- | --- |
| _id、schemaVersion | OID / int=1 |
| username、usernameKey | S，NFKC trim后1—50码点，key小写，规范化用户名唯一 |
| passwordHash | S，scrypt编码，禁止明文或接口返回 |
| createdAt、updatedAt | D，创建时now |

### surveys

| 字段 | 类型/默认/引用/约束 |
| --- | --- |
| _id、ownerId、publicId | OID / OID→users / S SID后端随机；publicId唯一，保持原链接 |
| schemaVersion | 旧int2 / 新int3；旧2无originTemplate |
| title、description | S，trim非空1—200 / S 0—2000，说明默认空 |
| status | S枚举draft/published/paused/closed；初始draft，closed终态 |
| allowAnonymous、allowRepeat | B，默认false，首次发布后冻结 |
| expiresAt | D或null，默认null，服务器接受时刻>=截止拒新 |
| definitionVersion、revision | N>=1默认1 / N>=0默认0，管理CAS |
| structureLocked | B，旧值保留，新false；不再作为权限依据 |
| submissionCount、currentVersionSubmissionCount | N>=0默认0，累计/当前，答卷事务更新 |
| currentPublishedVersion | N>=1或null默认null→本问卷发布号 |
| questions | array扁平Question，默认[]，0—100题；保留旧物化定义，不只保存ID |
| copiedFromId | OID或null，默认null，旧字段保留，不授复制权 |
| firstPublishedAt | D或null，默认null，首次后保持 |
| createdAt、updatedAt | D |
| usageNumber | **仅格式3必填**S SID，服务端独立随机且唯一；稳定使用编号，不等于publicId或surveyId，不能据此构造填写链接 |
| originTemplate | **仅格式3必填**，null默认或{templateId:OID→survey_templates,contentHash:H,acquiredAt:D}；由模板选用事务构造 |

普通编辑可暂存未保存为正式版本的本地题内容；此时实例没有正式绑定。已经绑定实例只能改Config，内容必须与固定正式版相同。作者改内容走题目草稿/保存新正式版后替换；他人内容先派生。发布前所有实例必须有一致绑定，否则422 UNSAVED_QUESTION_CONTENT。第一阶段题目编辑/保存能力保留，新UI增加明确的正式保存动作，不能在publish中隐式生成题版。

### survey_versions

| 字段 | 类型/默认/引用/约束 |
| --- | --- |
| _id、schemaVersion | OID / 旧int1、新int2 |
| surveyId、version | OID→surveys / N>=1，复合唯一 |
| sourceDefinitionVersion | N>=1，来源编辑修订 |
| definition | {title:S,description:S,questions:Question[1—100]}，完整物化配置快照 |
| policySnapshot | {allowAnonymous:B,allowRepeat:B}，冻结策略 |
| definitionHash | H，沿用第一阶段canonical({definition,policy})算法，既有摘要不改 |
| publishedAt、publishedBy | D / OID→users，真实发布时间/发布者；本基线无null legacy分支 |
| publicationRequestId、publicationRequestHash | Key / H，原发布幂等前提摘要，不随P2变更算法 |
| origin | {kind:S常量publication}，原形状保持 |
| bindingHash | **仅格式2必填**H，对该发布版按instanceId排序的固定来源元组[instanceId,questionId,questionVersionId,contentHash,acquisitionId]计算，单独核查来源完整性 |

问卷发布不复制产生新的题目正式版本。新快照插入及发布绑定、指针切换同事务；旧快照格式1不补字段。读取旧快照仍用旧definitionOf摘要路径；新格式额外验证bindingHash。管理员破坏来源时报503，不静默套最新。

### responses

| 字段 | 类型/默认/引用/约束 |
| --- | --- |
| _id、schemaVersion | OID / int2 |
| surveyId、surveyDefinitionVersion | OID→surveys / N>=1→(surveyId,version) |
| respondentId | OID→users，登录主体，客户端不可指定 |
| anonymous、repeatAllowed | B / B，前者在策略允许时选择，后者服务端取冻结策略 |
| requestId、payloadHash、payloadHashVersion | Key / H / int2；原值、算法和作用域保持 |
| answers | array，0—100；同一instanceId最多一个，最终路径非空有效答案 |
| submittedAt | D，服务器接受时刻 |

Answer互斥：{questionId:SID,type:single,optionId:SID}；multiple改optionIds:SID[]非空唯一；text改text:S非空<=10000码点；number改number:Decimal128。跳过/可选未答无记录；0有效。匿名/非匿名管理输出均不含respondentId/requestId/hash；新跨卷接口同样过滤。

## 4 独立题目与正式版本

### question_items 每题一个身份，草稿有限嵌入

| 字段 | BSON类型/必填默认/约束 |
| --- | --- |
| _id、schemaVersion、createdAt、updatedAt | 公共字段 |
| ownerId | OID→users，创建者，不可变 |
| revision、accessFence | N默认0 / N默认0；前者编辑CAS，后者新增使用与撤销共同写的并发门闩 |
| latestVersionId、nextVersion | OID→question_versions或null默认null / N>=1默认1；latest为最大已分配版，不表示默认父版 |
| draft | null默认或{content:Content,baseVersionId:OID或null,revision:N}；只owner可读，初始revision0，每次内容/base变化+1；base只能自己同题正式版 |
| origin | null默认或{kind:S枚举fork/legacyImport,sourceQuestionId:OID或null,sourceVersionId:OID或null,evidenceKey:S或null}；fork两个源ID必填非null；origin由服务端生成且创建后不可变；legacyImport不可证来源为null，evidenceKey用于迁移审计 |

草稿也可先创建于独立题库；同题只一份作者编辑草稿，以revision处理多窗口冲突。创建fork时服务端核查源正式版及权限，不接受客户端自填origin；从源生成自己新identity和v1的显式派生操作保留内容来源。owner本人想独立分叉身份也可用fork操作，不能偷偷merge。

### question_versions 每个正式版一文档，只插读

| 字段 | BSON类型/必填默认/约束 |
| --- | --- |
| _id、schemaVersion、createdAt | OID / int1 / D；无updatedAt字段，永久不可覆盖 |
| questionId、version | OID→question_items / N>=1，复合唯一 |
| content、contentHash | Content / H，仅可复用内容canonical十进制规范化摘要 |
| distributionSource | 必填严格联合：{kind:original,sourceQuestionId:null,sourceVersionId:null}或{kind:derived,sourceQuestionId:OID,sourceVersionId:OID}或{kind:unrecorded,sourceQuestionId:null,sourceVersionId:null}；不可变，服务端生成，不进入Content摘要 |
| parentVersionId | OID或null，无来源首次版null，其他可任意同题正式版，不一定version-1 |
| restoredFromVersionId | OID或null，restore时与选定旧版一致；同时parentVersionId=该旧版，清楚表示按哪个版本内容恢复 |
| operation | S枚举save/restore/fork/legacyImport；save/restore必须显式用户操作，legacyImport仅迁移身份 |
| createdBy | OID→users；迁移用原问卷owner作为归属人并由operation明确不冒充操作人 |
| evidenceKey | S或null；legacyImport必非null，用迁移清单关联实际执行者/时间/来源；其他null |

fork v1.parentVersionId=null（不能跨题当父版），跨题源在question_items.origin。恢复不删除v2/v3，可从v1建v4，parent/restoredFrom都v1，v3保留。正式号分配：同事务CAS题身份revision，读取nextVersion，插正式版、递增nextVersion、更新latestVersionId；并发不同key一个409 EDIT_CONFLICT，不自动基于新草稿生成。操作结果未知用同key重放，不烧号。

## 5 题库及指定共享

### question_banks 每用户可多个整理容器

| 字段 | BSON类型/默认/约束 |
| --- | --- |
| _id、schemaVersion、createdAt、updatedAt | 公共字段 |
| ownerId、name、revision、deletedAt | OID→users / S trim非空1—100 / N默认0 / D或null默认null |

删除为元数据墓碑；查询仅deletedAt=null。题库不共享，不删除题。名称允许重复，以ID区分，减少无业务依据唯一限制。

### question_bank_members 每库每题一条整理关系

| 字段 | BSON类型/默认/约束 |
| --- | --- |
| _id、schemaVersion、createdAt | OID / int1 / D，无updatedAt |
| bankId、questionId、ownerId | OID→banks / OID→items / OID→users；owner必须是库owner |

加入须当前题owner或有效共享；撤销后成员元数据保留，但不能获取新版，目录显示不可选。移出仅删member。删库不需一大事务批删所有member：事务墓碑库，所有member读先验库未删；后续整理清理可单独进行。加成员/移出/删库共同CAS banks.revision防竞态。

### question_grants 每题每接收者一条可撤销授权状态

| 字段 | BSON类型/默认/约束 |
| --- | --- |
| _id、schemaVersion、createdAt、updatedAt | 公共字段 |
| questionId、recipientId、grantedBy | OID→items / OID→users / OID→users，grantedBy必须题owner |
| state、revision、revokedAt | S active/revoked默认active / N默认0 / D或null默认null；撤销设置D，重新授权置null、revision+1 |

不存用户名作为授权主键；用户名用现账号规范化逻辑查已注册用户，一次解析成recipientId，不向无权用户开放用户目录搜索。禁止共享给自己422。共享覆盖题全部正式版本和未来版，排除draft。不用TTL删除历史授权记录。

## 6 固定来源与使用情况事实

### survey_question_bindings 每草稿实例或发布实例一条来源事实

| 字段 | BSON类型/必填默认/引用 |
| --- | --- |
| _id、schemaVersion、createdAt | OID / int1 / D |
| surveyId、ownerId、instanceId | OID→surveys / OID→users（冗余查询，必须与survey.ownerId相同）/ SID=Question.id |
| scope、publicationVersion | S draft/publication / N；draft为0，publication>=1→survey_versions.version |
| questionId、questionVersionId | OID→items / OID→versions，须属于同题 |
| contentHash、snapshotHash | H / H或null；content与物化Question去配置后相同；draft的snapshotHash=null，publication必须等于原definitionHash |
| acquisitionId、acquiredAt、authorization | OID（服务端一次取得权的标识）/ D / AuthProof对象，见下 |
| mappingKind、evidenceKey | S native/legacyImport / S或null；旧映射有证据key，native为null |

AuthProof严格互斥：{kind:owner}；{kind:share,grantId:OID,grantRevision:N}；{kind:template,templateId:OID,templateHash:H}；{kind:legacyImport,evidenceKey:S}。所有字段服务端生成，客户端只给明确versionId与实例配置。存量使用只复用同surveyId+instanceId+questionVersionId+acquisitionId的已保存draft绑定，不允许换surveyId或复制instanceId到其他卷绕过撤销。移除该draft实例即失去此实例的draft保留权，历史publication绑定不删除且不能单独兑换新实例。

这是**固定题来源及取得权的事实来源**，不能把它当可丢弃索引重建；旧快照本来没有独立题身份，不能仅凭相同文字重建原授权。使用情况结果是可随时由binding+surveys重建的查询，不额外维护usage集合。native publication绑定只插读；draft绑定可由CAS事务删换；旧映射只由迁移角色插入，不与应用混用权限。

使用查询（P2-U01）：认证验题权后，**先**按questionId和可选questionVersionId过滤binding；无匹配不返回空壳问卷。核对绑定、版本所属、owner及当前指针，再按(surveyId,questionVersionId)聚合：isDraft=存在scope=draft；isCurrent=存在scope=publication且publicationVersion=surveys.currentPublishedVersion；hasHistorical=存在scope=publication且publicationVersion≠当前指针。paused/closed仍以最后发布指针判断；未发布指针null不应有publication绑定，否则QUESTION_MAPPING_INCOMPLETE。曾发布不自动算历史，同版可同时具备三种状态。

再按surveyId一卷一行；versions每正式版仅一项{versionId,version,isDraft,isCurrent,hasHistorical}，按version降序、versionId升序稳定排序；问卷isDraft/isCurrent分别为过滤后版本状态OR，onlyHistorical=!isDraft&&!isCurrent&&任一hasHistorical。多历史快照只贡献布尔值，不返回历史发布号数组，不多算问卷。推荐每行最多1000个版本、响应最多2MiB；超限422 USAGE_SCOPE_TOO_LARGE，提示限定versionId，不能静默截断状态。按usageNumber字典序游标分页，scope含actor/questionId/kind/versionId/排序；每页重验权限，单次以一致只读快照计算指针和binding，不保证跨页编辑期间冻结所有结果。

本人显示surveyId/title/managePath；他人仅username、surveyNumber（来自独立usageNumber，非分享publicId）、versions及三个问卷状态，不给内部surveyId/标题/链接/题干/答卷数量。派生从items.origin另查，不并入直接使用数。

## 7 公开模板与分发授权

### survey_templates 每个确定模板一份不可变内容

| 字段 | BSON类型/默认/约束 |
| --- | --- |
| _id、schemaVersion、createdAt、updatedAt | 公共字段 |
| publisherId、sourceSurveyId、sourcePublishedVersion | OID→users / OID→surveys / N>=1；发布者必须源问卷owner，服务端取已发布快照 |
| status、revision | S listed/unlisted初始listed / N默认0；revision仅用于管理CAS，实际上下架使其+1并更新updatedAt，普通选用不改变status/revision/updatedAt |
| accessFence | N默认0，内部并发门闩；选用及实际上下架在同事务中实际$inc，不作为客户端expectedTemplateRevision，不进公开DTO或业务内容摘要 |
| title、description、questions | S / S / Question[1—100]；源快照结构，仅白名单内容，不拷答卷或账户身份 |
| bindings | array TemplateBinding[1—100]，每项{instanceId:SID,questionId:OID,questionVersionId:OID,contentHash:H,distributionProof:DistributionProof}；证明包含本题版和全部上游分发义务，定义见下文 |
| contentHash | H，对title/description/questions/bindings固定元组计算，排除status/revision/accessFence/updatedAt |

不对源卷保存运行依赖；源问卷paused/closed不自动下架模板。更新内容创建**新模板ID**并主动下架旧模板（如需要），不覆盖原内容或自动改已选用问卷。公开DTO不含distributionProof或全部祖先详情，只含模板id、title、description、结构和允许展示的来源题版本；不暴露内部sourceSurveyId、源管理入口、grant、发布幂等key。登录用户可浏览广场与预览，必须登录选用；暂不新增访客匿名浏览需求。

### template_grants 每题版本每模板发布者一条公开分发授权

| 字段 | BSON类型/默认/约束 |
| --- | --- |
| _id、schemaVersion、createdAt、updatedAt | 公共字段 |
| questionId、questionVersionId、publisherId、grantedBy | OID→items / OID→versions / OID→users / OID→users（题作者） |
| state、revision、revokedAt | S active/revoked / N默认0 / D或null默认null |

S05/S06已确认：仅此题版向此发布者授权，不含其他版或转授权；派生作者只能授自己该层权利，不能代授上游。发布、上架和每次选用均遍历全部来源义务查当前grant，事务内写本题及全部上游items.accessFence；撤销写其所控来源题的同门闩。撤销阻止既有模板**未来**选用，不回收已生成实例。不用异步下架状态作为权限依据，广场eligible为实时计算；筛选后分页可空页且nextCursor仍前进，不能错把未填满limit当终页。

### P2-004 不可变来源与多级公开证明

原生新原创题origin=null，其正式版distributionSource=original。fork v1的distributionSource=derived，精确指向被派生的源questionId+versionId，须与item.origin吻合；后续save/restore无论选择哪个同题父版，均继承该身份的同一distributionSource，不得清空、替换为最新源版或改成original。parentVersionId/restoredFromVersionId仅描述同题内容编辑边，不替代跨题分发来源。再次fork另建新边，旧义务通过精确源版继续传递。所有来源只从服务端正式版和既有派生事实生成，请求不能提交这些字段。

legacyImport本身不证明原创或派生。有明确源证据的导入用derived；有经过审计的原创证据可用original；确实没有记录用unrecorded，两个源ID为null，证据清单保留“未记录”原因，不凭同文/hash猜来源。unrecorded不称作“已证他人派生”，可正常自用/维护/统计，公开暂缓核验。

**逐层具体版本方案（按已确认S05授权粒度，P2-010已实现）**：从模板binding的正式版按distributionSource走到original；每步核文档存在、version属于question、owner=createdBy、Content摘要、item.origin与正式版来源一致。按叶→根构造有限链，同一版本不可重复。对每个节点，若authorId=实际template.publisherId，仅该层隐式；否则必须存在精确(questionVersionId,publisherId)且grantedBy=该节点owner的active template_grant。A/Qv1→B/Fv1→C/Hv1，C发布H需B的Fv1→C及A的Qv1→C；A→B的授权不可抵用，B不能替A签字。修改F产生Fv2/恢复仍受Qv1限制；不追Q的最新版本。

DistributionProof完整白名单为{lineageHash:H,obligations:[{questionId:OID,questionVersionId:OID,authorId:OID,grantId:OID|null,grantRevision:N|null}]}。每binding按叶→根保存所有节点，含自己层；自己层grantId/grantRevision均null，非自己层均非null。取代旧单授权字段，不并存两套。lineageHash=SHA256(canonical有序节点数组)，每节点严格{questionId,questionVersionId,authorId,contentHash,distributionSource}，OID转小写文本，key排序、紧凑UTF-8、数组保持顺序；使用本节版本保存的不可变源及内容，不能只hash叶节点。模板contentHash仍按{title,description,questions,bindings}，因此包括完整distributionProof；不改Content/definitionHash/bindingHash/payloadHash算法。

证明固定于创建时，仅记录当时grantId和grantRevision作审计；不保存可变active状态。每次M01创建、M06上架、M04新选用都重建链并核完整覆盖、lineageHash和每层当前授权；已有模板还校验固定证明及模板hash。撤销/重新授权沿用同grantId、revision递增：重新有效后允许重新使用，**不要求当前grantRevision等于历史证明revision**，但grant的源版、发布者、作者及当前active必须匹配。不能凭旧证明跳过撤权，也不能因普通撤权状态变化重写不可变模板hash。M02广场eligible、M03非发布者预览在一致只读快照中同样完整核查；mine可返回eligible=false管理摘要，访客不见失效结构。

实现单链最多32节点、一个模板所有链并集最多500个题版本节点；超限422 DISTRIBUTION_LINEAGE_LIMIT_EXCEEDED，不截链后放行。未记录来源409 DISTRIBUTION_PROVENANCE_UNVERIFIED；缺失/循环/源对不符/伪造/摘要或证明不完整503 DISTRIBUTION_LINEAGE_INVALID；缺少或已撤销任何必需grant为403 PUBLIC_DISTRIBUTION_REQUIRED。这些是已知资源公开写及本人管理诊断的稳定错误；广场过滤不可用项，非发布者预览统一404/409 TEMPLATE_UNAVAILABLE，不返回祖先ID/内部reason。内部审计记录traceId、受影响版本及原因供核查。链问题不阻正常派生自用，只阻公开分发。

索引说明：源版本沿_id_逐层点查，授权沿uq_distribution精确查，ix_distribution_source仅服务审计反查；不为证明中的多层数组增加无必要索引，也不依赖异步反向下架保证权限。

修复路径是隔离公开资格→保留原证据和错误审计→维护角色凭真实来源证据建立可核验的替代身份及其正式版本/映射并审阅，替代身份保留全部已知上游义务和原evidenceKey审计联系（不提供正常业务API）→重新创建模板。不得修改旧不可变版本、既有模板内容、旧快照/答卷，不能通过正常API“声明原创”或删除已知上游限制。未知证据不足则继续不公开。证明不进QuestionVersion/TemplatePreview等公开DTO，不新增暴露全部祖先、内部grant或源问卷管理信息的字段。

## 8 通用幂等事实

### operation_receipts 每主体每次新增操作一个回执

| 字段 | BSON类型/默认/约束 |
| --- | --- |
| _id、schemaVersion、createdAt | OID / int1 / D，无TTL，无updatedAt |
| actorId、operation、resourceKey、requestKey | OID→users / S受控枚举 / S / Key |
| requestHash | H，对固定请求和路径计算，不含重试时当前资源状态 |
| resultVersion | BSON int常量1，历史成功DTO的编解码版本；重放使用此版本处理，不用当前资源或新版DTO默认值补结果 |
| firstHttpStatus | BSON int枚举200/201；记录首次成功状态，按operation检查（attach/replace/saveInlineQuestion为200，其余为201）；成功重放统一200 |
| result | 严格判别联合{kind:S,data:受控对象}，保存该操作完整且有限的成功业务DTO（不含replayed）；详见下表，不接受任意JSON |

operation枚举createQuestion/saveVersion/restoreVersion/forkQuestion/attachQuestion/replaceQuestion/saveInlineQuestion/createBank/createTemplate/adoptTemplate；resourceKey分别为create、题ID、源版ID、问卷ID、模板ID，本地正式化为surveyId+":"+instanceId，精确定义见API。唯一(actorId,operation,resourceKey,requestKey)。回执与业务写同事务，requestHash不含当前易变草稿。

| operation | result.kind | result.data完整字段与BSON类型 |
| --- | --- | --- |
| createQuestion/saveVersion/restoreVersion/forkQuestion/createBank/createTemplate | resourceReceipt | resourceId:S（小写24位OID文本）、versionId:S（同约束）或null、revision:N或null；首次成功DTO的全部业务字段 |
| attachQuestion/replaceQuestion/saveInlineQuestion | instanceSave | revision:N、draftDefinitionRevision:N>=1、instanceId:SID、questionVersionId:S（小写24位OID文本）、validationIssues:DefinitionIssue[]；包含首次生成的实例ID、原编辑修订及完整问题列表，即使为空也存[] |
| adoptTemplate | templateAdoption | surveyId:S（小写24位OID文本）、revision:N；新问卷首次创建时的修订，不是模板revision |

data以API兼容的规范JSON值保存，ID在此处为string而不是BSON ObjectId，以便直接重放首次DTO；与集合关联字段使用ObjectId的约定区分。DefinitionIssue严格为{code:S,field:S,questionId:SID或null,message:S}，仅用受控错误文案，不包含题干/选项原文、答卷/身份/密钥；code<=128、field<=2048、message<=1000码点，数组最多20000项，但以大小上限为先。整个result按BSON大小<=262144字节，包含元数据的回执文档<=1MiB。超限在业务事务提交前422 RECEIPT_TOO_LARGE并整体回滚，不能截断validationIssues后仍宣称完整成功；此上限为本轮技术选择，后续实现需核验。

构造完整成功DTO→检查白名单/operation-kind/status匹配与大小→同事务保存业务及回执→提交后从该DTO返回replayed=false。重试认证、请求结构和相同actor/操作/资源/key及requestHash后，直接读取不可变result.data，加replayed=true返回200；**不得读取当前问卷、绑定、题版本、模板或重新计算校验来还原历史结果，也不得因为当前revision过期、实例已删/已换、授权撤销或模板下架而重做原操作**。当前内容读取和新增使用权仍单独验权；回执不含题干/答案等内容，不授予新引用权。UI将历史revision/问题仅视为原操作结果，当前状态另GET刷新，不能用旧回执覆盖现在编辑状态。

没有成功回执时才进入新的权限/状态/CAS检查；事务冲突或结果未知重试同key，不能生成新instanceId后再返回另一结果。不存在回执不得事后从资源猜造；已存在但损坏/未知resultVersion返回503 OPERATION_RECEIPT_UNAVAILABLE，不重新执行。失败和回滚不留成功回执，回执无TTL、不可修改/删除。状态命令仍用CAS与GET确认，原P1发布/提交回执不属于本次新集合调整。

## 9 索引完整清单

所有集合自带_id_。第一阶段以下9个业务索引全部**保留**（集合+name对应真实schema.ts），不把原统计索引写成待建：

| 集合 | name / 键及选项 |
| --- | --- |
| users | uq_username_key: {usernameKey:1} unique |
| surveys | uq_survey_public_id: {publicId:1} unique；ix_owner_list: {ownerId:1,createdAt:-1,_id:-1} |
| survey_versions | uq_survey_version: {surveyId:1,version:1} unique；uq_publication_request: {surveyId:1,publicationRequestId:1} unique, partial publicationRequestId类型string |
| responses | ix_survey_responses: {surveyId:1,submittedAt:-1,_id:-1}；uq_one_response_per_user: {surveyId:1,respondentId:1} unique, partial repeatAllowed=false；uq_submission_request: {surveyId:1,respondentId:1,requestId:1} unique；ix_version_responses: {surveyId:1,surveyDefinitionVersion:1,submittedAt:-1,_id:-1} |

新增索引（无特殊说明均非unique）：

| 集合 | name / 键及选项 | 目的 |
| --- | --- | --- |
| surveys | uq_survey_usage_number {usageNumber:1} unique, partial usageNumber类型string | 独立使用编号，旧格式2过渡缺省不冲突 |
| question_items | ix_question_owner {ownerId:1,createdAt:-1,_id:-1}；ix_fork_source {origin.sourceQuestionId:1,createdAt:-1,_id:-1} | 私有题列表、派生分页 |
| question_versions | uq_question_version {questionId:1,version:1} unique；ix_question_parent {parentVersionId:1,_id:1}；ix_distribution_source {distributionSource.sourceVersionId:1,_id:1} | 历史/来源树，无需另存无界子数组 |
| question_banks | ix_bank_owner {ownerId:1,deletedAt:1,createdAt:-1,_id:-1} | 题库分页 |
| question_bank_members | uq_bank_question {bankId:1,questionId:1} unique；ix_bank_members {bankId:1,createdAt:-1,_id:-1} | 多库同题及成员分页 |
| question_grants | uq_question_recipient {questionId:1,recipientId:1} unique；ix_received {recipientId:1,state:1,createdAt:-1,_id:-1} | 授权状态、接收题列表 |
| survey_question_bindings | uq_instance_binding {surveyId:1,scope:1,publicationVersion:1,instanceId:1} unique；ix_question_usage {questionId:1,questionVersionId:1,surveyId:1}；ix_owned_question {ownerId:1,questionId:1,questionVersionId:1,scope:1,surveyId:1,publicationVersion:1} | 来源唯一、使用情况、本人统计范围 |
| survey_templates | ix_template_square {status:1,createdAt:-1,_id:-1}；ix_template_owner {publisherId:1,createdAt:-1,_id:-1} | 广场和我的模板 |
| template_grants | uq_distribution {questionVersionId:1,publisherId:1} unique；ix_author_distribution {grantedBy:1,createdAt:-1,_id:-1} | 分发权核查/作者撤销列表 |
| operation_receipts | uq_operation {actorId:1,operation:1,resourceKey:1,requestKey:1} unique | 跨资源操作去重 |

S04同版单实例由服务端发布/保存校验保证，迁移审计若发现历史重复不加会阻迁移的unique：历史保留，统计以实例为单位标记legacyMultiplicity并禁止宣称按答卷唯一；需要该历史进入统一统计前单独确认。唯一多键索引不能证明一个数组内不同元素的ID都不同，必须应用检查。[MongoDB唯一索引说明](https://www.mongodb.com/docs/manual/core/index-unique/)。

## 10 验证器草案与并发门禁

以下是**设计伪代码**，仅在Markdown中，不作为可执行Schema。它采用现有object工厂的strict白名单思想：

```javascript
// O(props, required=全部字段) => bsonType object, additionalProperties false
// T1 = O({...各字段表精确类型...})，每字段的required/nullable依照字段表
Content = {oneOf:[ SingleContent, MultipleContent, TextContent, NumberContent ]};
Schemas = {
 users: UserV1,
 surveys: {oneOf:[SurveyV2, SurveyV3 /* originTemplate必填可null、usageNumber必填 */]},
 survey_versions: {oneOf:[SnapshotV1, SnapshotV2 /* bindingHash必填 */]},
 responses: ResponseV2,
 question_items: O({_id:OID,schemaVersion:Int1,ownerId:OID,
   revision:NonNegativeInt,accessFence:NonNegativeInt,latestVersionId:NullableOID,
   nextVersion:PositiveInt,draft:NullableDraft,origin:NullableOrigin,
   createdAt:Date,updatedAt:Date}),
 question_versions: O({_id:OID,schemaVersion:Int1,questionId:OID,version:PositiveInt,
   content:Content,contentHash:Hash,distributionSource:DistributionSource,parentVersionId:NullableOID,
   restoredFromVersionId:NullableOID,operation:EnumSaveRestoreForkImport,
   createdBy:OID,evidenceKey:NullableString,createdAt:Date}),
 question_banks: BankV1, question_bank_members: MemberV1,
 question_grants: GrantV1, survey_question_bindings: BindingV1,
 survey_templates: TemplateV1, template_grants: DistributionV1,
 operation_receipts: ReceiptV1
};
// Binding oneOf:
// draft => publicationVersion int/long enum[0], snapshotHash null
// publication => publicationVersion int/long minimum1, snapshotHash Hash
// Origin/AuthProof/Content/Answer 用oneOf区分各互斥形状。
// Bank/Member/Grant/Template/Distribution/Receipt的全部属性就是第5—8节表；
// 不允许额外字段；state/grant撤销时间、version来源和内容hash由应用检查。
```

补充每个新集合的关键验证器展开（仍为设计伪代码；O默认所有列属性必填且拒未知字段，Nullable显式允许null，公共字段C={_id:OID,schemaVersion:Int1,createdAt:Date}）：

```javascript
BankV1 = O({...C,updatedAt:Date,ownerId:OID,name:String1To100,
 revision:NonNegativeInt,deletedAt:NullableDate});
MemberV1 = O({...C,bankId:OID,questionId:OID,ownerId:OID});
GrantV1 = O({...C,updatedAt:Date,questionId:OID,recipientId:OID,
 grantedBy:OID,state:EnumActiveRevoked,revision:NonNegativeInt,revokedAt:NullableDate});
DistributionV1 = O({...C,updatedAt:Date,questionId:OID,questionVersionId:OID,
 publisherId:OID,grantedBy:OID,state:EnumActiveRevoked,revision:NonNegativeInt,
 revokedAt:NullableDate});
BindingBase = {...C,surveyId:OID,ownerId:OID,instanceId:StableString,
 questionId:OID,questionVersionId:OID,contentHash:Hash,acquisitionId:OID,
 acquiredAt:Date,authorization:AuthProof,mappingKind:EnumNativeLegacy,
 evidenceKey:NullableString};
BindingV1 = {oneOf:[
 O({...BindingBase,scope:EnumDraft,publicationVersion:EnumIntZero,snapshotHash:Null}),
 O({...BindingBase,scope:EnumPublication,publicationVersion:PositiveInt,snapshotHash:Hash})]};
AuthProof = {oneOf:[O({kind:EnumOwner}),
 O({kind:EnumShare,grantId:OID,grantRevision:NonNegativeInt}),
 O({kind:EnumTemplate,templateId:OID,templateHash:Hash}),
 O({kind:EnumLegacyImport,evidenceKey:NonEmptyString})]};
DistributionSource = {oneOf:[
 O({kind:EnumOriginal,sourceQuestionId:Null,sourceVersionId:Null}),
 O({kind:EnumDerived,sourceQuestionId:OID,sourceVersionId:OID}),
 O({kind:EnumUnrecorded,sourceQuestionId:Null,sourceVersionId:Null})]};
DistributionObligation = {oneOf:[
 O({questionId:OID,questionVersionId:OID,authorId:OID,grantId:Null,grantRevision:Null}),
 O({questionId:OID,questionVersionId:OID,authorId:OID,grantId:OID,grantRevision:NonNegativeInt})]};
DistributionProof = O({lineageHash:Hash,obligations:Array1To32OfDistributionObligation});
TemplateBinding = O({instanceId:StableString,questionId:OID,questionVersionId:OID,
 contentHash:Hash,distributionProof:DistributionProof});
TemplateV1 = O({...C,updatedAt:Date,publisherId:OID,sourceSurveyId:OID,
 sourcePublishedVersion:PositiveInt,status:EnumListedUnlisted,revision:NonNegativeInt,
 accessFence:NonNegativeInt,
 title:String1To200,description:String0To2000,questions:Array1To100OfQuestion,
 bindings:Array1To100OfTemplateBinding,contentHash:Hash});
ReceiptV1 = O({...C,actorId:OID,operation:OperationEnum,resourceKey:NonEmptyString,
 requestKey:Key,requestHash:Hash,resultVersion:Int1,firstHttpStatus:Enum200Or201,
 result:{oneOf:[
   O({kind:EnumResourceReceipt,data:O({resourceId:ObjectIdHexString,
      versionId:NullableObjectIdHexString,revision:NullableNonNegativeInt})}),
   O({kind:EnumInstanceSave,data:O({revision:NonNegativeInt,
      draftDefinitionRevision:PositiveInt,instanceId:StableString,
      questionVersionId:ObjectIdHexString,validationIssues:BoundedDefinitionIssueArray})}),
   O({kind:EnumTemplateAdoption,data:O({surveyId:ObjectIdHexString,
      revision:NonNegativeInt})})]}});
// 顶层按operation分支约束result.kind/firstHttpStatus，拒绝合法形状但操作类型不匹配。
// result.data不存replayed；大小由服务端在事务提交前检查，不能靠Schema伪称自动限BSON字节。
// Content各分支均拒id/required/jumpRules：
SingleContent = O({type:EnumSingle,title:String1To500,options:Array2To100OfOption});
MultipleContent = O({type:EnumMultiple,title:String1To500,options:Array2To100OfOption,
 validation:O({minChoices:Count0To100,maxChoices:Count0To100},[])});
TextContent = O({type:EnumText,title:String1To500,
 validation:O({minLength:Count0To10000,maxLength:Count0To10000},[])});
NumberContent = O({type:EnumNumber,title:String1To500,
 validation:O({min:Decimal128,max:Decimal128,integerOnly:Bool},['integerOnly'])});
// 枚举值、字符串/数组长度及nullable/引用规则均以对应字段表为准。
```

引用外键、相同contentHash、不可变性、来源所属、owner/共享权、策略冻结和动态跳转不能靠JSON Schema自动保证。W02-A已将字段表展开为独立可执行验证器并真实验证各分支；权限/仓储/事务仍待后续。

事务统一snapshot/majority/primary，所有查询和写同session；callback无外部不可回滚副作用。授予/撤销share/public grant与新增attach/fork/template发布/选用都对相关question_items按_id排序执行accessFence实际$inc，再核查有效grant写业务；公开创建/上架/选用的相关题包含叶题及全部上游作者题（全局去重），不能只锁叶题，防止两个事务只分别读取/修改不同文档造成write skew。共享撤销先提交则新事务重读拒绝；新增先提交则它是允许保留的存量。

模板选用先核成功回执；新操作用{_id,status:listed,revision:expectedTemplateRevision}条件实际$inc模板accessFence，**不把accessFence值作为CAS前提，不递增管理revision或updatedAt**。真实上下架以publisher+expectedRevision+原状态CAS，并在同事务$inc{revision:1,accessFence:1}、更新updatedAt；无状态变化且revision仍匹配时返回原状态，不制造修订。模板相关操作统一先已有模板门闩、再全部来源题目OID有序门闩；新建模板尚无旧模板门闩。先只读不可变版本预计算候选链/锁集合，在同session取得所有门闩后重新完整核验链、hash及当前授权；发现新增未锁节点/不一致即中止重算，不在半程追加乱序锁。撤销分发权仍写对应上游题门闩，不需反向先锁模板。

两人同看revision=0、使用不同key选用，第一份提交仅使accessFence变1；另一事务如遇写冲突，以原key/请求开启新事务重读，revision仍0且授权有效便继续提交，最后accessFence=2、revision=0、两份独立草稿。门闩仍有物理写竞争，不能宣称无写冲突；有界重试耗尽返回503 OPERATION_RETRY_LATER（原key重试），只在真实管理修订变化时409 EDIT_CONFLICT，状态/授权失效按实际原因拒绝。结果未知仍503 OPERATION_OUTCOME_UNKNOWN并先确认原key；重放不再加门闩。一次<=100题，公开链并集<=500版本节点。

银行与成员写同bank revision；题版本号写同item revision；问卷绑定/Question变更写同survey revision；发布与submit继续写同survey以守状态/指针边界。来源可信性和多集合hash核对流程见[关键逻辑](key-logic.md)。业务权限与数据库角色双层；同一binding集合的draft/publication行权限无法用集合角色区分，应用必须禁止update publication行，迁移/管理身份单独控制。

## 11 旧题来源与统计关联

旧快照、答卷不变。以(surveyId,instanceId)保守形成旧题身份；同一问卷历史同实例ID、同规范化Content可映射同一正式版；不同Content生成不同历史版，但没有来源证据时parentVersionId=null。同ID疑似删后重建/题型大变列审计，不声称其父子已证实；不同问卷即使文字/hash完全相同也**不合并**。迁移产生operation=legacyImport、evidenceKey，createdAt是导入时间，不假造原“正式保存时间”。question_versions.version只是导入排序的展示号，不证明原修改顺序。

每个旧发布实例生成scope=publication的binding，snapshotHash等于旧definitionHash，原始快照及原hash逐字节/类型证据保持；草稿匹配旧内容可同版，不匹配则保持未正式保存本地题，不能假装曾发布。答卷通过原(surveyId,surveyDefinitionVersion)→publication绑定→questionVersionId，answers.questionId对instanceId；不向answers加来源或重算payloadHash。来源缺失/重复映射/内容不同要阻断该题统计，不悄悄漏算，返回503 QUESTION_MAPPING_INCOMPLETE。

统计先surveys.ownerId=当前用户，再用publication绑定同questionId+questionVersionId获取允许的(surveyId,publicationVersion,instanceId)；同一元组唯一，lookup只取答卷恰好对应发布号和答案实例，按(response._id,instanceId)去重后再聚合。不能把draft与历史所有binding先join问卷再unwind重复乘算。使用次数、问卷数、回答份数是不同维度。数字分布与手算数据见[实施测试计划](phase2/implementation-test-plan.md)。

## 12 一致示例及容量

[design-fixtures.json](phase2/design-fixtures.json)给出可机读逻辑样本，ID为真实格式OID字符串，number为JSON数字字符串，落库用ObjectId/Date/Decimal128转换；不是可直接导入脚本。样本中同Q/v1分布于A发布1、2和B发布1，C派生题排除。完整文档示例由字段表公共字段与样本业务片段组合，下面演示一条完整正式题版本（EJSON仅供设计）：

```json
{"_id":{"$oid":"720000000000000000000001"},"schemaVersion":1,"questionId":{"$oid":"710000000000000000000001"},"version":1,"content":{"type":"number","title":"年龄","validation":{"min":{"$numberDecimal":"0"},"max":{"$numberDecimal":"120"},"integerOnly":true}},"contentHash":"由规范化Content计算，不是可写入值","parentVersionId":null,"restoredFromVersionId":null,"operation":"save","distributionSource":{"kind":"original","sourceQuestionId":null,"sourceVersionId":null},"createdBy":{"$oid":"700000000000000000000001"},"evidenceKey":null,"createdAt":{"$date":"2026-10-22T08:00:00.000Z"}}
```

上面contentHash是解释占位，实际可验证的64位值及各集合完整样本文档保存在[collection-examples.json](phase2/collection-examples.json)，静态核对不将占位当真实hash。每份问卷/快照/模板限制2MiB、<=100题，避开16MiB文档硬上限；版本/共享/成员/绑定/答卷独立增长并索引分页，题身份不会嵌入无界历史。冗余Content是有意保留历史语义，保存/发布逐项对正式版hash与物化内容一致后方可写入。

## 13 环境、升级与历史入口

当前主应用通过 `db:init:phase2` 显式初始化 `project2_app_v2` 十三集合，通过 `db:verify:phase2` 只读检查结构与来源覆盖；原 `db:init` 保留四集合基线。应用入口和测试入口分别检查目标，均不自动升级旧库。注册表、索引、配置、启动及角色已配套接入；真实旧数据通过独立迁移工具恢复和升级，见[升级计划](phase2/data-migration-plan.md)及[真实迁移验证](phase2/real-migration-verification.md)。修改验证器使用单独受审阅升级，不在ready或initialize里偷偷collMod；strict验证器变更不会追溯自动检查已有文档，必须逐条预检和核对，[官方说明](https://www.mongodb.com/docs/manual/core/schema-validation/update-schema-validation/)。

历史深链兼容锚点仅用于导航，不恢复旧设计为现行规则：
<a id="4-surveys-字段"></a><a id="7-responses-字段"></a><a id="8-索引"></a><a id="10-统计口径和示例查询"></a><a id="13-survey_versions-字段"></a>

[第一阶段完整数据库文档](baseline/phase1/docs/database-design.md) · [第二阶段入口](phase2/README.md) · [项目入口](../README.md)


### W02-A可执行边界补充

新phase2验证器为未给定长度的evidenceKey采用1—2048码点、resourceKey采用1—257、passwordHash采用1—2048技术上限；所有新N限定int/long安全整数，格式号为int。无业务规则变化。原baseline验证器字节保持。Mongo部署本次未遇到不支持的Schema关键字，原伪代码用可执行工厂/enum/oneOf展开，不引入新授权规则。


## W02-B存储实现边界

operation-contract固定新操作requestHash=hash({operation,path,body})；资源scope和规范化以[实施说明](phase2/bindings-receipts-foundation.md)为准，旧hash算法不变。bindingHash按instanceId ASCII顺序的五项数组元组，与现有集合样例的b2169d9f…一致。回执插入及读取均严格校验完整有限DTO/大小，安全Long规范成JSON整数；回执/publication仓储不提供更新删除。draft通过owner/状态/revision CAS事务增删换，保留同版取得权。该基础模块的Schema与索引由后续业务复用。当前已在本机启用认证及受限应用角色；管理员仍具有维护权限，同一集合内的字段与草稿/发布行约束由应用保证，见[认证部署](phase2/authorization-deployment.md)。
