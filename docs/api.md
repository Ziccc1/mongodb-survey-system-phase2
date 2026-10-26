# 问卷系统API第二阶段增量契约

更新日期：2026-10-26。第二阶段八项需求及公开模板扩展均已实现并完成对应验证，当前主应用为 `localhost:27019/rs0` 的十三集合 `project2_app_v2`，通过 `:phase2` 命令启动；`project2_app_v1`仅保留四集合兼容基线。题目、题库、共享、固定引用、使用查询、跨问卷统计和模板均已接入API及页面。

2026-10-25已完成界面收尾、真实第一阶段数据的隔离恢复升级及当前本机数据库认证部署；应用使用受限账号，20项权限检查通过。真实迁移结果保存在独立目标库，当前网站继续使用第二阶段验收数据。S04/S05/S06均已确认实施。见[最终交付核对](phase2/delivery-verification.md)、[认证部署](phase2/authorization-deployment.md)和[真实迁移验证](phase2/real-migration-verification.md)。完整34组自动验收对应10月24日，收尾后的定向复测对应10月25日；原提示词、冻结材料及执行证据保留其历史日期。

已实现HTTP范围：P2-L01—L09、B01—B06、G01—G03、I00—I04、U01共24项，加W05 X01—X03及W06 A01—A03/M01—M06合计36项。新路由统一纳入原认证、CSRF、媒体/重复JSON、query白名单/重复参数、405 Allow与严格body门禁。Content结构错误400 INVALID_REQUEST，硬语义422 DEFINITION_INVALID及原details，未知内部异常不伪装400。phase2公开`/app-config.js`只比baseline增加`libraryEnabled:true`，不公开模式参数、库名、密钥。完整请求/DTO见下文与机器契约；实际端点测试见[覆盖表](phase2/w02-w04-coverage.md)。

## P2 统一规则与类型

沿用/api/v1，不要求整体搬到v2。保留原认证Cookie、同源JSON、2MiB、未知字段/重复JSON键/重复query拒绝、Origin和X-CSRF-Guard写请求检查（DELETE亦如此）、限流与错误体。每个P2接口继承第一阶段公共400/401/403/404/413/415/429/500/503错误；读无正文无key；写表内字段外一律400。资源无权/不存在统一404，操作自己已知资源而当前授权已撤销可409 SOURCE_ACCESS_REVOKED。不返回内部Mongo文档。

OID、SID、N、Key、Content、Rule及BSON/JSON转换见[数据库字典](database-design.md)。JSON所有OID为小写24位字符串、Decimal128为有限精确DecimalString、日期UTC ISO毫秒、N为安全整数。query里的N严格十进制正整数；expectedRevision允许0。body类型不强制转换，不使用服务端默认之外隐式值。

list统一limit默认20、1—100；cursor可选1—2048字符；返回{items:[],nextCursor:null}，空列表200；query仅端点表列的键。版本列表按正式version降序，其余实体按(createdAt,_id)降序；usage按surveyNumber字典序，派生按(createdAt,_id)降序；answers按(submittedAt,responseId,instanceId)降序；distribution按Decimal128数值升序，不能字符串排序。

所有新游标签名scope包含actorId、endpoint、所有path ID、scope/kind/surveyIds规范排序等过滤、排序方向；跨卷统计还绑定asOf及distribution数值位置。下一页重复传完全相同过滤，每页重新验问卷owner和当前授权，撤销后不得仅靠旧cursor放行。跨卷原文/频数首批使用事务外readConcern snapshot的find/aggregate，由服务端返回实际atClusterTime；把该BSON Timestamp、asOf显示时间、查询范围和过期时间放进签名cursor，后批以同atClusterTime读取（causalConsistency=false，不在事务内设atClusterTime），不跨HTTP保持长事务。asOf仅显示时间，不能只用submittedAt<=asOf冒充数据库快照，否则早接受晚提交可能漏页。游标建议最长5分钟，服务端历史窗口可更早失效，SnapshotTooOld/过期统一409 REPORT_SNAPSHOT_EXPIRED并reloadRequired=true，重开第一页；不静默换当前快照。每页先按当前权限验owner，再读固定历史数据。P2-009已实测底层命令及实际Timestamp，局部版本锁定桥、晚提交及过期证据见W05说明。使用core/common签名器，不能复用旧survey列表仅owner作用域的cursor。

新增幂等写使用Idempotency-Key；作用域为(actorId,operation,resourceKey,key)，正文+路径生成requestHash；同key同hash重放200且replayed=true，异hash409 OPERATION_IDEMPOTENCY_CONFLICT。attach/replace/saveInlineQuestion首次成功200，其余新增幂等写首次201，重放均200。每种操作把其完整成功data（除replayed）按固定resultVersion=1、result.kind白名单保存，并记录firstHttpStatus；字段与大小上限见[数据库回执字典](database-design.md#8-通用幂等事实)。instanceSave必须存revision/draftDefinitionRevision/instanceId/questionVersionId/validationIssues全部字段，不允许只存resourceId/versionId/revision。

认证、固定请求结构、actor/操作/资源/key和requestHash核对后，成功重放只读取持久回执，加replayed=true；不用当前问卷/实例/题/模板重建DTO，不先检查当前修订/授权/上下架或实例是否仍存在。实例随后修改/删除或源授权撤销，仍可确认原成功结果；既不新建对象，也不恢复引用或授予新权。历史修订/校验问题不能覆盖前端当前编辑状态，另GET刷新。无成功回执才检查新操作资格；损坏或未知resultVersion返回503 OPERATION_RECEIPT_UNAVAILABLE，不猜补或重做。完整回执超限在事务提交前422 RECEIPT_TOO_LARGE整体回滚，不截断成功结果。结果未知503 OPERATION_OUTCOME_UNKNOWN，原body/key确认；CAS无key操作冲突409 EDIT_CONFLICT，超时GET确认，不用旧revision盲重试。

错误体沿用{error:{code,message,details:[],traceId}}。新增422：DISTRIBUTION_LINEAGE_LIMIT_EXCEEDED、USAGE_SCOPE_TOO_LARGE、RECEIPT_TOO_LARGE、RULE_REVIEW_REQUIRED、DEFINITION_INVALID、DUPLICATE_QUESTION_VERSION、INVALID_RECIPIENT、UNSAVED_QUESTION_CONTENT、UNSUPPORTED_QUESTION_TYPE；新增409：DISTRIBUTION_PROVENANCE_UNVERIFIED、REPORT_SNAPSHOT_EXPIRED、QUESTION_CONTENT_REQUIRES_VERSION、ALREADY_FORMALIZED、QUESTION_DRAFT_CONFLICT、NO_QUESTION_DRAFT、QUESTION_IDENTITY_MISMATCH、SOURCE_ACCESS_REVOKED、TEMPLATE_UNAVAILABLE、OPERATION_IDEMPOTENCY_CONFLICT；新增403 PUBLIC_DISTRIBUTION_REQUIRED；503 DISTRIBUTION_LINEAGE_INVALID/QUESTION_MAPPING_INCOMPLETE/OPERATION_OUTCOME_UNKNOWN/OPERATION_RECEIPT_UNAVAILABLE/OPERATION_RETRY_LATER。USERNAME_NOT_FOUND为404，仅题owner授权操作可得；不新增任意用户名搜索接口。NO_QUESTION_DRAFT用409。各端点列的NOT_FOUND与INVALID_CURSOR继承404/400。details仅field/reason/questionId/expectedRevision/reloadRequired等现有白名单；版本问题用field指向/versionId等，不随意追加数据库字段。

## P2 DTO完整字段

下表定义全部输出白名单，?可缺省、null显式可空。OId、N、S、B含义同数据库；Instant为ISO时间；公共响应包装{data:DTO}。所有具备操作key的创建写返回固定历史回执或InstanceSaveResult，并有replayed；题和库创建回执只返回新ID，再用读取端点获取内容，不向Bank任意追加字段。

| DTO | 完整字段 |
| --- | --- |
| QuestionEditor | id:OID,revision:N,draft:null或{content:Content,baseVersionId:OID|null,revision:N},latestVersionId:OID|null,origin:null或{kind:fork|legacyImport,sourceQuestionId:OID|null,sourceVersionId:OID|null}；不回内部evidenceKey |
| QuestionSummary | id:OID,latestVersionId:OID|null,latestVersion:N|null,title:S（仅有权内容）,ownerUsername:S；无正式版自己可见draft题干，共享列表不列未正式题 |
| QuestionVersion | id:OID,questionId:OID,version:N>=1,content:Content,parentVersionId:OID|null,restoredFromVersionId:OID|null,operation:save|restore|fork|legacyImport,createdAt:Instant |
| VersionReceipt/TemplateReceipt | resourceId:OID,versionId:OID|null,revision:N|null,replayed:B；返回原操作结果，不保证仍有内容读取权 |
| Bank | id:OID,name:S,revision:N,createdAt:Instant |
| BankMember | questionId:OID,selectable:B,latestVersionId:OID|null,latestVersion:N|null,title:S|null；撤销后后三字段null，不能漏出未来内容 |
| StateReceipt | id:OID,revision:N,state:deleted|memberPresent|memberAbsent|listed|unlisted |
| Grant | id:OID,recipientUsername:S,state:active|revoked,revision:N,itemRevision:N |
| DistributionGrant | id:OID,questionVersionId:OID,publisherUsername:S,state:active|revoked,revision:N,itemRevision:N |
| InstanceSource | instanceId:SID,questionId:OID,questionVersionId:OID,questionVersion:N,rights:owner|share|retained|template,hasAccessibleUpdate:B；仅问卷owner，配置从旧Editor读取 |
| InstanceSaveResult | revision:N,draftDefinitionRevision:N,instanceId:SID,questionVersionId:OID,validationIssues:DefinitionIssue[],replayed:B；前五字段为持久回执中的完整历史结果，自动实例ID与非空问题列表也必须保存；hasUnpublishedChanges由GET管理详情刷新 |
| UpdateNotice | instanceId:SID,currentVersionId:OID,latestAccessibleVersionId:OID,latestAccessibleVersion:N；只列有合法可访问新版项，撤销及窄模板权不提示其他版 |
| Usage 本人 | surveyId:OID,surveyNumber:S（来自usageNumber，非分享publicId）,title:S,managePath:S,versions:[{versionId:OID,version:N,isDraft:B,isCurrent:B,hasHistorical:B}],isDraft:B,isCurrent:B,onlyHistorical:B |
| Usage 他人 | surveyNumber:S（来自usageNumber，非分享publicId）,username:S,versions:[{versionId:OID,version:N,isDraft:B,isCurrent:B,hasHistorical:B}],isDraft:B,isCurrent:B,onlyHistorical:B；无title、链接、surveyId或答卷数据 |
| Derivation | questionId:OID,ownerUsername:S,sourceVersionId:OID,createdAt:Instant；仅题owner查询，不授派生题正文权；接收者kind=derivations返回404 |
| TemplateSummary | id:OID,title:S,description:S,revision:N,status:listed|unlisted,eligible:B；mine可含本人不可用模板，无答案/统计/源问卷内部ID |
| TemplatePreview | TemplateSummary全部字段+questions:Question[],sources:[{instanceId:SID,questionId:OID,questionVersionId:OID}]；非publisher遇不可用404/409，不给私有源定义 |
| TemplateAdoption | surveyId:OID,revision:N,replayed:B；两业务字段按原样保存，revision是新问卷的修订；其余通过原Q03本人管理详情读取 |
| CrossAnswer | surveyId:OID,publishedVersion:N,instanceId:SID,responseId:OID,submittedAt:Instant,value:S；text原文或number字符串，不返账号、requestId或hash |

CrossStatistics公共字段：questionId:OID,versionId:OID,generatedAt:Instant,surveyCount:N,eligibleResponseCount:N,answeredCount:N,skippedCount:N,unansweredCount:N；single/multiple再含optionCounts:[{optionId:SID,label:S,count:N,percentage:DecimalString|null}]；number再含average/min/max:DecimalString|null、bins:[{lower:DecimalString|null,upper:DecimalString|null,upperInclusive:B,count:N}]；text无数值/选项字段。分母answeredCount，0时percentage=null。路径从对应快照重算；eligibleResponseCount=answered+skipped+unanswered。同题同版一实例已确认S04，迁移历史多实例需要单独边界确认。

区间参数例boundaries=0,18,30,121，输出欠界(-∞,0)、[0,18)、[18,30)、[30,121]、超界(121,+∞)，中间左闭右开、最后给定区间闭右端；不能丢区间外合法数字。区间由服务端Decimal128/decimal.js精确比较；无参数bins=[]，客户端引导打开X03频数或选择区间，不宣称均值即年龄分布。frequency无数据items=[]，汇总count=0且数值null。各题型统计处理详见关键逻辑。

## P2-004 来源公开资格与Usage状态

派生只取得自己身份和维护权，不能绕过来源公开限制。内部来源/证明白名单及hash以[数据库第7节](database-design.md#7-公开模板与分发授权)为准；QuestionVersion和TemplatePreview均不新增distributionSource/distributionProof/祖先清单等输出。A01—A03作者只控制自己的那层权利，授权目标始终是实际模板publisher；M01/M06/M04新分发逐层检查精确源正式版及当前授权。M02/M03完整动态核资格，失效/未知来源不提供公开可选用结构；本人管理摘要eligible=false仍可见。M05可下架失效模板，不要求补授权。成功幂等重放仍按P2-003只读原完整回执，不重新分发或重新验当前授权。

已知资源的公开写：来源未记录409 DISTRIBUTION_PROVENANCE_UNVERIFIED；链缺失/循环/伪造/证明不全503 DISTRIBUTION_LINEAGE_INVALID；超过推荐32节点/模板500版本节点限制422 DISTRIBUTION_LINEAGE_LIMIT_EXCEEDED；任一必须授权缺失/撤销403 PUBLIC_DISTRIBUTION_REQUIRED。只返稳定通用文案，details不加祖先/授权/源问卷内部信息；内部审计留traceId并按数据库修复路径处理。公开广场过滤不可用项，非publisher预览统一404/409 TEMPLATE_UNAVAILABLE，不能据错误枚举他人来源链。S05/S06已确认，来源限制继承为已确认。

Usage由服务端事实计算：版本isDraft为匹配draft绑定；isCurrent为匹配当前发布指针的publication绑定；hasHistorical为非当前发布快照的绑定。暂停/关闭仍以最后发布指针为当前。同版可同时三者true；只存在当前发布不算历史。先versionId过滤，再按(surveyId,versionId)去重，再每问卷一行；版本号降序/ID升序。问卷isDraft/isCurrent为过滤后版本OR，onlyHistorical=无draft且无current且有历史；无匹配不返空行。每行最多1000版本/响应2MiB推荐上限，超限422 USAGE_SCOPE_TOO_LARGE，要求限定versionId而不截断状态。

U01示例是同卷v2仅草稿、v1当前且历史；若query versionId=v1，结果只有v1且问卷isDraft=false、isCurrent=true、onlyHistorical=false，不能继承v2状态。本人DTO有surveyId/title/managePath而不含username；他人只含username、独立surveyNumber、版本与状态。派生列表保持独立。更多边界静态数据见[design-fixtures.json](phase2/design-fixtures.json)，均非已实现响应。

## P2 现有接口逐项兼容

| 原接口 | 第一阶段真实状态与P2影响 |
| --- | --- |
| A01—A04 注册/登录/me/logout | 已实现，路径、请求响应及安全协议保持 |
| Q01 GET surveys、Q02 POST surveys | 已实现，既有DTO保持；服务端新建surveys格式3并originTemplate=null且生成独立usageNumber，来源不从客户端接收 |
| Q03 GET survey、Q04 PATCH survey | 已实现，原字段保持；来源用P2-I00单读，保存元数据不隐式生成题版；hasUnpublishedChanges要比较绑定元组，换同内容不同正式版也算未发布变化 |
| Q05 PUT questions | 已实现，扁平Question格式仍允许；绑定实例只能改配置/序/删题，改正式内容409 QUESTION_CONTENT_REQUIRES_VERSION；未绑定本地题可普通保存；删除同步删除draft binding；新增伪造instanceId不授权。需在app/schema/DTO中明确新增错误，不静默接受与来源不符内容 |
| V01 POST publish | 已实现，原前提/Publication-Key/回执保持；P2增加正式题内容及绑定完整检查，未正式保存422 UNSAVED_QUESTION_CONTENT；新Snapshot格式2+bindingHash；不隐式保存题版。旧客户端直接改绑定内容或发未正式题将收到显式错误，前端必须同步新正式保存流程，这一业务流程兼容限制需回归 |
| V02/V03 pause/close | 已实现，状态和权限不改；shared撤销不阻存量draft原版发布 |
| V04 POST copy | 仍501，不把P2模板选用当作已启用原复制；不提供绕过窄权的普通复制 |
| V05/V06 versions | 已实现，原DTO继续物化Question、过滤内部来源，新格式读额外核bindingHash；旧格式读原hash |
| F01/F02 填写/提交 | 已实现，协议和Question/Answer形状不改，不返题共享/原作者数据；旧成功key仍原版本原算法重放；提交不查题共享活跃状态以免撤销破坏存量 |
| H01/H02 历史答卷 | 已实现，原owner和匿名白名单不变，按原快照解释 |
| S01—S03 分问卷统计/原文 | 已实现，保持version语义及游标，不默认改成跨卷；新增X接口与其并存 |
| Z01/Z02 live/ready | 已实现，ready改查13集合/严格Schema/索引/迁移覆盖门禁，绝不自动迁移；live不改 |

P2没有破坏性重命名整个旧HTTP结构，不开/api/v2以掩盖适配；明确的题正式保存工作流差异在Q05/V01报错和UI中处理。questionId路径在旧API是实例SID，在P2/questions是独立OID，新X路径也OID；名称相同不代表可互换。

## P2 模板管理修订与选用门闩

expectedTemplateRevision继续是用户看到的管理revision前提，不改为accessFence。新选用在同一事务按_id+listed+expectedTemplateRevision实际$inc accessFence，再按题OID顺序写各题门闩、核当前公开分发权；不改模板revision/updatedAt/contentHash。真实上下架实际变更才使revision+1、accessFence+1和updatedAt变化；现状态相同且revision正确时空操作返回原值。

两用户各持revision=0、使用不同Idempotency-Key，同时选用同一模板：数据库可能让其中一项发生可重试写冲突，但它以原请求开启新事务重读后revision仍0、状态/授权仍有效，就能继续成功，不因另一人选用返回EDIT_CONFLICT。重试有界，单纯竞争耗尽返回503 OPERATION_RETRY_LATER，结果未知返回OPERATION_OUTCOME_UNKNOWN，均保留原key；只在真实管理revision变化时返回409 EDIT_CONFLICT，状态/授权改变按对应错误拒绝。已成功同key只重放回执，不再增任何门闩。M05/M06无key，临时竞争可有界重试，最终503则GET当前状态确认。

## P2 新增接口逐项契约

所有路径以下都带/api/v1；`:questionId/:versionId/:bankId/:templateId/:grantId`是OID，`:instanceId`是SID。query全可选，未列项拒绝。请求中无正文写入不在本轮新增，状态命令仍接收严格CAS正文。表后每例是设计样例，非实际响应。

### P2-L01 POST /api/v1/questions

权限：登录用户。query：无。body：content:Content；baseVersionId禁止，origin禁止。输出：VersionReceipt。

版本/修订/幂等：Idempotency-Key/createQuestion/create；完整成功data持久保存（不含replayed），重放只读原回执。专属错误：DEFINITION_INVALID、RECEIPT_TOO_LARGE、OPERATION_RECEIPT_UNAVAILABLE（再加公共失败集）。

```json
{"request":{"content":{"type":"number","title":"年龄","validation":{"min":"0","max":"120","integerOnly":true}}},"data":{"resourceId":"710000000000000000000001","versionId":null,"revision":0,"replayed":false}}
```

### P2-L02 GET /api/v1/questions/:questionId/draft

权限：题owner。query：无。body：无。输出：QuestionEditor。

版本/修订/幂等：只读，无key。专属错误：NOT_FOUND（再加公共失败集）。

```json
{"data":{"id":"710000000000000000000001","revision":0,"draft":{"content":{"type":"number","title":"年龄","validation":{"min":"0","max":"120","integerOnly":true}},"baseVersionId":null,"revision":0},"latestVersionId":null,"origin":null}}
```

### P2-L03 PUT /api/v1/questions/:questionId/draft

权限：题owner。query：无。body：expectedRevision:N；content:Content；baseVersionId:OID|null（同题任意正式版）。输出：QuestionEditor。

版本/修订/幂等：CAS item.revision；无key，无变化不增修订。专属错误：EDIT_CONFLICT、DEFINITION_INVALID（再加公共失败集）。

```json
{"request":{"expectedRevision":0,"content":{"type":"number","title":"年龄（整数）","validation":{"min":"0","max":"120","integerOnly":true}},"baseVersionId":null},"data":{"id":"710000000000000000000001","revision":1,"draft":{"content":{"type":"number","title":"年龄（整数）","validation":{"min":"0","max":"120","integerOnly":true}},"baseVersionId":null,"revision":1},"latestVersionId":null,"origin":null}}
```

### P2-L04 POST /api/v1/questions/:questionId/versions

权限：题owner。query：无。body：expectedRevision:N；expectedDraftRevision:N。输出：VersionReceipt。

版本/修订/幂等：Idempotency-Key/saveVersion/questionId；正式内容不可覆盖；完整成功data持久保存（不含replayed），重放只读原回执。专属错误：EDIT_CONFLICT、QUESTION_DRAFT_CONFLICT、NO_QUESTION_DRAFT、RECEIPT_TOO_LARGE、OPERATION_RECEIPT_UNAVAILABLE（再加公共失败集）。

```json
{"request":{"expectedRevision":1,"expectedDraftRevision":1},"data":{"resourceId":"710000000000000000000001","versionId":"720000000000000000000001","revision":2,"replayed":false}}
```

### P2-L05 GET /api/v1/questions/:questionId/versions

权限：题owner或当前有效定向share。query：limit、cursor。body：无。输出：Page<QuestionVersion>。

版本/修订/幂等：只读，无key。专属错误：NOT_FOUND、INVALID_CURSOR（再加公共失败集）。

```json
{"data":{"items":[],"nextCursor":null}}
```

### P2-L06 GET /api/v1/questions/:questionId/versions/:versionId

权限：题owner或当前有效定向share。query：无。body：无。输出：QuestionVersion。

版本/修订/幂等：只读，无key。专属错误：NOT_FOUND（再加公共失败集）。

```json
{"data":{"id":"720000000000000000000001","questionId":"710000000000000000000001","version":1,"content":{"type":"number","title":"年龄","validation":{"min":"0","max":"120","integerOnly":true}},"parentVersionId":null,"restoredFromVersionId":null,"operation":"save","createdAt":"2026-10-22T08:00:00.000Z"}}
```

### P2-L07 POST /api/v1/questions/:questionId/restorations

权限：题owner。query：无。body：expectedRevision:N；sourceVersionId:OID（同题）。输出：VersionReceipt。

版本/修订/幂等：Idempotency-Key/restoreVersion/questionId；不覆盖现草稿，恢复后保留原草稿供用户比较；完整成功data持久保存（不含replayed），重放只读原回执。专属错误：EDIT_CONFLICT、NOT_FOUND、RECEIPT_TOO_LARGE、OPERATION_RECEIPT_UNAVAILABLE（再加公共失败集）。

```json
{"request":{"expectedRevision":2,"sourceVersionId":"720000000000000000000001"},"data":{"resourceId":"710000000000000000000001","versionId":"720000000000000000000002","revision":3,"replayed":false}}
```

### P2-L08 POST /api/v1/question-versions/:versionId/forks

权限：源题owner或有效share；模板生成实例窄权例外需sourceInstance。query：无。body：content:Content；sourceInstance?:{surveyId:OID,instanceId:SID}（仅本人模板生成实例，须其绑定此版本）；禁止origin。输出：VersionReceipt。

版本/修订/幂等：Idempotency-Key/forkQuestion/versionId；派生即显式建自己身份+v1；完整成功data持久保存（不含replayed），重放只读原回执；服务端固定derived来源，后续正式版/恢复不清除；公开失败不阻正常自用派生。专属错误：NOT_FOUND、SOURCE_ACCESS_REVOKED、DEFINITION_INVALID、RECEIPT_TOO_LARGE、OPERATION_RECEIPT_UNAVAILABLE（再加公共失败集）。

```json
{"request":{"content":{"type":"number","title":"年龄","validation":{"min":"0","max":"120","integerOnly":true}}},"data":{"resourceId":"710000000000000000000002","versionId":"720000000000000000000003","revision":1,"replayed":false}}
```

### P2-L09 GET /api/v1/questions

权限：登录用户。query：scope、limit、cursor。body：无；scope=own|shared默认own；不含模板窄权和他人草稿。输出：Page<QuestionSummary>。

版本/修订/幂等：只读，无key。专属错误：INVALID_CURSOR（再加公共失败集）。

```json
{"data":{"items":[{"id":"710000000000000000000001","latestVersionId":"720000000000000000000001","latestVersion":1,"title":"年龄","ownerUsername":"teacher_demo"}],"nextCursor":null}}
```

### P2-B01 POST /api/v1/question-banks

权限：登录用户。query：无。body：name:S非空<=100。输出：VersionReceipt。

版本/修订/幂等：Idempotency-Key/createBank/create；完整成功data持久保存（不含replayed），重放只读原回执。专属错误：INVALID_REQUEST、RECEIPT_TOO_LARGE、OPERATION_RECEIPT_UNAVAILABLE（再加公共失败集）。

```json
{"request":{"name":"基本信息"},"data":{"resourceId":"740000000000000000000001","versionId":null,"revision":0,"replayed":false}}
```

### P2-B02 GET /api/v1/question-banks

权限：登录用户，仅本人。query：limit、cursor。body：无。输出：Page<Bank>。

版本/修订/幂等：只读，无key。专属错误：INVALID_CURSOR（再加公共失败集）。

```json
{"data":{"items":[],"nextCursor":null}}
```

### P2-B03 PATCH /api/v1/question-banks/:bankId

权限：库owner。query：无。body：expectedRevision:N；name:S。输出：Bank。

版本/修订/幂等：CAS；无key。专属错误：EDIT_CONFLICT、NOT_FOUND（再加公共失败集）。

```json
{"request":{"expectedRevision":0,"name":"基本题"},"data":{"id":"740000000000000000000001","name":"基本题","revision":1,"createdAt":"2026-10-22T08:00:00.000Z"}}
```

### P2-B04 POST /api/v1/question-banks/:bankId/deletion

权限：库owner。query：无。body：expectedRevision:N。输出：StateReceipt。

版本/修订/幂等：CAS墓碑；无key；超时GET确认，删库后404。专属错误：EDIT_CONFLICT、NOT_FOUND（再加公共失败集）。

```json
{"request":{"expectedRevision":1},"data":{"id":"740000000000000000000001","revision":2,"state":"deleted"}}
```

### P2-B05 GET /api/v1/question-banks/:bankId/members

权限：库owner。query：limit、cursor。body：无。输出：Page<BankMember>。

版本/修订/幂等：只读，无key。专属错误：NOT_FOUND、INVALID_CURSOR（再加公共失败集）。

```json
{"data":{"items":[{"questionId":"710000000000000000000001","selectable":true,"latestVersionId":"720000000000000000000001","latestVersion":1,"title":"年龄"}],"nextCursor":null}}
```

### P2-B06 PUT /api/v1/question-banks/:bankId/members/:questionId

权限：库owner；加入另须题owner/有效share。query：无。body：expectedRevision:N（库）；present:B。输出：StateReceipt。

版本/修订/幂等：CAS；present=false只移成员；无key，GET确认。专属错误：EDIT_CONFLICT、SOURCE_ACCESS_REVOKED、NOT_FOUND（再加公共失败集）。

```json
{"request":{"expectedRevision":0,"present":true},"data":{"id":"740000000000000000000001","revision":1,"state":"memberPresent"}}
```

### P2-G01 GET /api/v1/questions/:questionId/shares

权限：题owner。query：limit、cursor。body：无。输出：Page<Grant>。

版本/修订/幂等：只读，无key。专属错误：NOT_FOUND、INVALID_CURSOR（再加公共失败集）。

```json
{"data":{"items":[],"nextCursor":null}}
```

### P2-G02 PUT /api/v1/questions/:questionId/shares

权限：题owner。query：无。body：username:S注册同规范；expectedRevision:N（item）；expectedGrantRevision:N|null（新grant为null）。输出：Grant。

版本/修订/幂等：CAS item+grant；同状态无变化不增号，重授revoked则active。专属错误：EDIT_CONFLICT、USERNAME_NOT_FOUND、INVALID_RECIPIENT（再加公共失败集）。

```json
{"request":{"username":"student_demo","expectedRevision":2,"expectedGrantRevision":null},"data":{"id":"760000000000000000000001","recipientUsername":"student_demo","state":"active","revision":0,"itemRevision":3}}
```

### P2-G03 POST /api/v1/questions/:questionId/shares/:grantId/revocation

权限：题owner。query：无。body：expectedRevision:N（item）；expectedGrantRevision:N。输出：Grant。

版本/修订/幂等：CAS+accessFence；无key；存量binding不删。专属错误：EDIT_CONFLICT、NOT_FOUND（再加公共失败集）。

```json
{"request":{"expectedRevision":3,"expectedGrantRevision":0},"data":{"id":"760000000000000000000001","recipientUsername":"student_demo","state":"revoked","revision":1,"itemRevision":4}}
```

### P2-I00 GET /api/v1/surveys/:surveyId/question-sources

权限：问卷owner。query：无。body：无。输出：{revision:N,items:InstanceSource[]}。

版本/修订/幂等：只读，无key。专属错误：NOT_FOUND（再加公共失败集）。

```json
{"data":{"revision":1,"items":[{"instanceId":"age","questionId":"710000000000000000000001","questionVersionId":"720000000000000000000001","questionVersion":1,"rights":"owner","hasAccessibleUpdate":false}]}}
```

### P2-I01 POST /api/v1/surveys/:surveyId/question-references

权限：问卷owner且draft/paused；新增有效题使用权。query：无。body：expectedRevision:N；questionVersionId:OID；instanceId?:SID（缺省服务端UUID）；position:N 0至题数；required?:B默认false；jumpRules?:Rule[]默认[]。输出：InstanceSaveResult。

版本/修订/幂等：Idempotency-Key/attachQuestion/surveyId；原子来源+物化定义；完整成功data持久保存（不含replayed），重放只读原回执。专属错误：EDIT_CONFLICT、SOURCE_ACCESS_REVOKED、SURVEY_STATE_CONFLICT、DUPLICATE_QUESTION_VERSION、RECEIPT_TOO_LARGE、OPERATION_RECEIPT_UNAVAILABLE（再加公共失败集）。

```json
{"request":{"expectedRevision":0,"questionVersionId":"720000000000000000000001","position":0,"required":true},"data":{"revision":1,"draftDefinitionRevision":2,"instanceId":"age","questionVersionId":"720000000000000000000001","validationIssues":[],"replayed":false}}
```

### P2-I02 POST /api/v1/surveys/:surveyId/questions/:instanceId/replacement

权限：问卷owner且draft/paused；新版本须有效新增权（相同已存版可保留）。query：无。body：expectedRevision:N；questionVersionId:OID（同题版或本人直接派生于原固定版的新题v1）；reviewedJumpRules?:Rule[]（题型变化时用户明确修正规则，不传且旧形状失效则422 RULE_REVIEW_REQUIRED）；不接受内容。输出：InstanceSaveResult。

版本/修订/幂等：Idempotency-Key/replaceQuestion/surveyId；保实例、题序、必答；规则失效返回validationIssues；完整成功data持久保存（不含replayed），重放只读原回执。专属错误：EDIT_CONFLICT、SOURCE_ACCESS_REVOKED、QUESTION_IDENTITY_MISMATCH、SURVEY_STATE_CONFLICT、RULE_REVIEW_REQUIRED、RECEIPT_TOO_LARGE、OPERATION_RECEIPT_UNAVAILABLE（再加公共失败集）。

```json
{"request":{"expectedRevision":1,"questionVersionId":"720000000000000000000002"},"data":{"revision":2,"draftDefinitionRevision":3,"instanceId":"age","questionVersionId":"720000000000000000000002","validationIssues":[],"replayed":false}}
```

### P2-I03 GET /api/v1/surveys/:surveyId/question-updates

权限：问卷owner。query：无。body：无。输出：{revision:N,items:UpdateNotice[]}。

版本/修订/幂等：只读，无key。专属错误：NOT_FOUND（再加公共失败集）。

```json
{"data":{"revision":1,"items":[{"instanceId":"age","currentVersionId":"720000000000000000000001","latestAccessibleVersionId":"720000000000000000000002","latestAccessibleVersion":2}]}}
```

### P2-U01 GET /api/v1/questions/:questionId/usage

权限：题owner或当前share；撤销后仅通过I00看自己实例。query：versionId、kind、limit、cursor。body：无；kind=references|derivations默认references；versionId?先过滤正式版，再计算版本与问卷状态；无匹配不返空行。输出：Page<Usage或Derivation>；Usage.versions每项{versionId,version,isDraft,isCurrent,hasHistorical}。

版本/修订/幂等：只读，无key；单次一致快照，先版本过滤→group(surveyId,versionId)→group surveyId；问卷标志取过滤后OR；版本号降序/ID升序，问卷usageNumber升序，每页重验权；派生另列。专属错误：NOT_FOUND、INVALID_CURSOR、QUESTION_MAPPING_INCOMPLETE、USAGE_SCOPE_TOO_LARGE（再加公共失败集）。

```json
{"data":{"items":[{"surveyNumber":"usage_B_independent","username":"student_demo","versions":[{"versionId":"720000000000000000000002","version":2,"isDraft":true,"isCurrent":false,"hasHistorical":false},{"versionId":"720000000000000000000001","version":1,"isDraft":false,"isCurrent":true,"hasHistorical":true}],"isDraft":true,"isCurrent":true,"onlyHistorical":false}],"nextCursor":null}}
```

### P2-A01 PUT /api/v1/questions/:questionId/distribution-grants

权限：题owner（S05已确认）；仅管理自己该层版本权利，不能代表或转授上游权利。query：无。body：questionVersionId:OID；username:S模板发布者；expectedRevision:N（item）；expectedGrantRevision:N|null。输出：DistributionGrant。

版本/修订/幂等：CAS item/授权+fence；不授未来版；同一上游item门闩；实际模板发布者仍需逐层具备所有来源授权（S05/S06已确认）。专属错误：NOT_FOUND、EDIT_CONFLICT、USERNAME_NOT_FOUND（再加公共失败集）。

```json
{"request":{"questionVersionId":"720000000000000000000001","username":"student_demo","expectedRevision":2,"expectedGrantRevision":null},"data":{"id":"770000000000000000000001","questionVersionId":"720000000000000000000001","publisherUsername":"student_demo","state":"active","revision":0,"itemRevision":3}}
```

### P2-A02 GET /api/v1/questions/:questionId/distribution-grants

权限：题owner；仅管理自己该层版本权利，不能代表或转授上游权利。query：limit、cursor。body：无。输出：Page<DistributionGrant>。

版本/修订/幂等：只读，无key，不写门闩；仅列作者自己控制的该层授权，不代表模板已满足全部上游义务。专属错误：NOT_FOUND、INVALID_CURSOR（再加公共失败集）。

```json
{"data":{"items":[],"nextCursor":null}}
```

### P2-A03 POST /api/v1/questions/:questionId/distribution-grants/:grantId/revocation

权限：题owner（S06已确认）；仅管理自己该层版本权利，不能代表或转授上游权利。query：无。body：expectedRevision:N（item）；expectedGrantRevision:N。输出：DistributionGrant。

版本/修订/幂等：CAS+fence；阻既有模板未来选用，不剥夺既有问卷；同一上游item门闩；实际模板发布者仍需逐层具备所有来源授权（S05/S06已确认）。专属错误：NOT_FOUND、EDIT_CONFLICT（再加公共失败集）。

```json
{"request":{"expectedRevision":3,"expectedGrantRevision":0},"data":{"id":"770000000000000000000001","questionVersionId":"720000000000000000000001","publisherUsername":"student_demo","state":"revoked","revision":1,"itemRevision":4}}
```

### P2-M01 POST /api/v1/templates

权限：源问卷owner；完整来源链每层对实际publisher的当前公开权，自己仅免自身层。query：无。body：surveyId:OID；publishedVersion:N>=1；expectedSurveyRevision:N；不接收questions或source来源。输出：TemplateReceipt。

版本/修订/幂等：Idempotency-Key/createTemplate/surveyId；服务端读源快照，不读草稿；完整成功data持久保存（不含replayed），重放只读原回执；先已有模板门闩再全部叶/上游题OID全局有序门闩，同事务复核固定证明/链摘要/当前各层grant；无来源不猜原创。专属错误：NOT_FOUND、EDIT_CONFLICT、PUBLIC_DISTRIBUTION_REQUIRED、QUESTION_MAPPING_INCOMPLETE、RECEIPT_TOO_LARGE、OPERATION_RECEIPT_UNAVAILABLE、DISTRIBUTION_PROVENANCE_UNVERIFIED、DISTRIBUTION_LINEAGE_INVALID、DISTRIBUTION_LINEAGE_LIMIT_EXCEEDED（再加公共失败集）。

```json
{"request":{"surveyId":"730000000000000000000001","publishedVersion":1,"expectedSurveyRevision":2},"data":{"resourceId":"750000000000000000000001","versionId":null,"revision":0,"replayed":false}}
```

### P2-M02 GET /api/v1/templates

权限：登录用户。query：scope、limit、cursor。body：无；scope=square|mine默认square；square仅listed且当前eligible；失效链/未知来源eligible=false，square过滤，mine可见本人不可用摘要；非publisher不可用预览404/409 TEMPLATE_UNAVAILABLE。输出：Page<TemplateSummary>。

版本/修订/幂等：只读，无key；一致只读快照逐层核来源及当前授权，固定证明不能替代当前状态；不暴露证明或全部祖先详情。专属错误：INVALID_CURSOR（再加公共失败集）。

```json
{"data":{"items":[{"id":"750000000000000000000001","title":"基本信息调查","description":"课程示例","revision":0,"status":"listed","eligible":true}],"nextCursor":null}}
```

### P2-M03 GET /api/v1/templates/:templateId

权限：登录用户；公开可用模板或本人管理模板。query：无。body：无；失效链/未知来源eligible=false，square过滤，mine可见本人不可用摘要；非publisher不可用预览404/409 TEMPLATE_UNAVAILABLE。输出：TemplatePreview。

版本/修订/幂等：只读，无key；一致只读快照逐层核来源及当前授权，固定证明不能替代当前状态；不暴露证明或全部祖先详情。专属错误：NOT_FOUND、TEMPLATE_UNAVAILABLE（再加公共失败集）。

```json
{"data":{"id":"750000000000000000000001","title":"基本信息调查","description":"课程示例","revision":0,"status":"listed","eligible":true,"questions":[{"id":"age","type":"number","title":"年龄","required":true,"jumpRules":[],"validation":{"min":"0","max":"120","integerOnly":true}}],"sources":[{"instanceId":"age","questionId":"710000000000000000000001","questionVersionId":"720000000000000000000001"}]}}
```

### P2-M04 POST /api/v1/templates/:templateId/adoptions

权限：登录用户；listed且逐题分发权仍有效；完整来源链每层对实际publisher的当前公开权，自己仅免自身层。query：无。body：expectedTemplateRevision:N；title?:S 1—200默认模板标题；策略不继承，匿名/重复默认false、截止null。输出：TemplateAdoption。

版本/修订/幂等：Idempotency-Key/adoptTemplate/templateId；按_id+listed+expectedTemplateRevision实际$inc模板accessFence，普通选用不改管理revision/updatedAt；题门闩及授权核查、新草稿、完整templateAdoption回执同事务；可重试写冲突保持原key重开事务；先已有模板门闩再全部叶/上游题OID全局有序门闩，同事务复核固定证明/链摘要/当前各层grant；无来源不猜原创。专属错误：TEMPLATE_UNAVAILABLE、EDIT_CONFLICT、PUBLIC_DISTRIBUTION_REQUIRED、RECEIPT_TOO_LARGE、OPERATION_RECEIPT_UNAVAILABLE、OPERATION_RETRY_LATER、DISTRIBUTION_PROVENANCE_UNVERIFIED、DISTRIBUTION_LINEAGE_INVALID、DISTRIBUTION_LINEAGE_LIMIT_EXCEEDED（再加公共失败集）。

```json
{"request":{"expectedTemplateRevision":0},"data":{"surveyId":"730000000000000000000004","revision":0,"replayed":false}}
```

### P2-M05 POST /api/v1/templates/:templateId/unlisting

权限：模板publisher。query：无。body：expectedRevision:N。输出：StateReceipt。

版本/修订/幂等：管理CAS；实际上下架同事务$inc revision和accessFence并更新updatedAt，普通选用不改revision；同目标状态且修订匹配为空操作；无key，结果未知GET确认；下架不要求来源授权仍有效。专属错误：NOT_FOUND、EDIT_CONFLICT、OPERATION_RETRY_LATER（再加公共失败集）。

```json
{"request":{"expectedRevision":0},"data":{"id":"750000000000000000000001","revision":1,"state":"unlisted"}}
```

### P2-M06 POST /api/v1/templates/:templateId/listing

权限：模板publisher；逐题当前分发权；完整来源链每层对实际publisher的当前公开权，自己仅免自身层。query：无。body：expectedRevision:N。输出：StateReceipt。

版本/修订/幂等：管理CAS；实际上下架同事务$inc revision和accessFence并更新updatedAt，普通选用不改revision；同目标状态且修订匹配为空操作；无key，结果未知GET确认；先已有模板门闩再全部叶/上游题OID全局有序门闩，同事务复核固定证明/链摘要/当前各层grant；无来源不猜原创。专属错误：NOT_FOUND、EDIT_CONFLICT、PUBLIC_DISTRIBUTION_REQUIRED、OPERATION_RETRY_LATER、DISTRIBUTION_PROVENANCE_UNVERIFIED、DISTRIBUTION_LINEAGE_INVALID、DISTRIBUTION_LINEAGE_LIMIT_EXCEEDED（再加公共失败集）。

```json
{"request":{"expectedRevision":1},"data":{"id":"750000000000000000000001","revision":2,"state":"listed"}}
```

X01—X03错误优先级（2026-10-24 R1复审修正）：先核当前题owner、有效私人share或本人范围内精确题版publication取得事实；无权统一404 NOT_FOUND，先于正式版存在性、题型/区间、游标到期和相关历史详细校验。撤权存量publication权保留，不等同重新开放全部版本历史；授权后仍完整核相关快照/映射/答案并对损坏返回503。协议结构和游标签名校验仍遵循公共入口。见[R1/R2修正及真实证据](phase2/reviews/W05-W06-R1-R2-fix-2026-10-24.md)。

### P2-X01 GET /api/v1/question-statistics/:questionId/versions/:versionId

权限：登录；仅本人问卷publication绑定形成范围，不能靠题作者身份读他人。query：surveyIds、boundaries。body：无；surveyIds?逗号OID最多100，全部须本人；boundaries?逗号DecimalString 2—21个严格递增；默认无区间，只均值/最小最大和频数入口。输出：CrossStatistics。

版本/修订/幂等：只读，无key。专属错误：NOT_FOUND、QUESTION_MAPPING_INCOMPLETE、INVALID_REQUEST（再加公共失败集）。

```json
{"data":{"questionId":"710000000000000000000001","versionId":"720000000000000000000001","generatedAt":"2026-10-22T08:00:00.000Z","surveyCount":2,"eligibleResponseCount":5,"answeredCount":4,"skippedCount":1,"unansweredCount":0,"average":"15","min":"0","max":"30","bins":[]}}
```

### P2-X02 GET /api/v1/question-statistics/:questionId/versions/:versionId/answers

权限：同X01，text/number。query：surveyIds、limit、cursor。body：无。输出：Page<CrossAnswer> + questionId/versionId/generatedAt/asOf。

版本/修订/幂等：只读；首批snapshot选时，后页cursor签名固定atClusterTime及范围，快照过期409重开第一页。专属错误：NOT_FOUND、INVALID_CURSOR、UNSUPPORTED_QUESTION_TYPE、QUESTION_MAPPING_INCOMPLETE、REPORT_SNAPSHOT_EXPIRED（再加公共失败集）。

```json
{"data":{"questionId":"710000000000000000000001","versionId":"720000000000000000000001","generatedAt":"2026-10-22T08:00:00.000Z","asOf":"2026-10-22T08:00:00.000Z","items":[{"surveyId":"730000000000000000000001","publishedVersion":1,"instanceId":"age","responseId":"780000000000000000000001","submittedAt":"2026-10-22T07:00:00.000Z","value":"0"}],"nextCursor":null}}
```

### P2-X03 GET /api/v1/question-statistics/:questionId/versions/:versionId/distribution

权限：同X01，仅number。query：surveyIds、limit、cursor。body：无。输出：Page<{value:DecimalString,count:N}> + questionId/versionId/asOf/generatedAt。

版本/修订/幂等：只读；首批snapshot选时，后页cursor签名固定atClusterTime及范围，快照过期409重开第一页。专属错误：NOT_FOUND、INVALID_CURSOR、UNSUPPORTED_QUESTION_TYPE、QUESTION_MAPPING_INCOMPLETE、REPORT_SNAPSHOT_EXPIRED（再加公共失败集）。

```json
{"data":{"questionId":"710000000000000000000001","versionId":"720000000000000000000001","asOf":"2026-10-22T08:00:00.000Z","generatedAt":"2026-10-22T08:00:00.000Z","items":[{"value":"0","count":1},{"value":"10","count":1}],"nextCursor":null}}
```

### P2-I04 POST /api/v1/surveys/:surveyId/questions/:instanceId/formalization

权限：本人draft/paused且实例尚无正式绑定；已绑定返回409，不能借此复制撤销共享题。query：无。body：expectedRevision:N（问卷）；无内容/来源字段，服务端取已保存本地实例Content。输出：InstanceSaveResult。

版本/修订/幂等：Idempotency-Key/saveInlineQuestion/surveyId+instanceId；同事务建题身份及正式v1、绑定、问卷CAS和回执；完整成功data持久保存（不含replayed），重放只读原回执。专属错误：EDIT_CONFLICT、SURVEY_STATE_CONFLICT、ALREADY_FORMALIZED、DEFINITION_INVALID、RECEIPT_TOO_LARGE、OPERATION_RECEIPT_UNAVAILABLE（再加公共失败集）。

```json
{"request":{"expectedRevision":1},"data":{"revision":2,"draftDefinitionRevision":3,"instanceId":"age","questionVersionId":"720000000000000000000001","validationIssues":[],"replayed":false}}
```


事务外固定快照分页机制参照[MongoDB snapshot及atClusterTime](https://www.mongodb.com/docs/manual/reference/read-concern-snapshot/)，P2-009已实测真实Timestamp及过期重开。

## P2 实现配套检查

app.ts必须注册上述GET query白名单并同步405方法表；不得新增路由后被onRequest提前拒绝limit/scope/surveyIds/boundaries。shared新增Content及DTO严格请求schema，保留旧QuestionSchema/AnswerSchema。question-codec为Content与扁平Question分别处理Decimal128，不把OID交给递归fromBson误转普通对象。dto显式构造匿名/使用查询/模板输出。core/common游标签名要完整scope且每页重新验权。幂等回执hash、错误枚举与响应schema同时更新；API公开示例中不发送数据库schemaVersion、owner、来源证据或授权证明。

第一阶段接口详文从此处开始，范围仅限第一阶段基线。原文“唯一新增路径”“不增加跨卷”“本轮”以及历史未实现状态均指其原日期；第二阶段新增及变化以上述P2合同为准。历史编号及锚点保留，便于已有文档链接继续工作。

---

# 问卷系统 API 接口契约

[← 返回项目总 README](../README.md)


状态：第一阶段1.0.0核心已实现：A01—A04、Q01—Q05、V01—V03/V05—V06、F01—F02、H01—H02、S01—S03及Z01/Z02。可选V04复制暂未启用，核对认证和归属后501；无前端按钮。示例仍为契约样例，实际执行范围见[第一阶段测试](testing/phase1-results.md)。

## 1 契约范围与维护原则

本文件从[总体设计](system-design.md)、[数据库设计](database-design.md)、[正式决策](decisions.md)、[版本变更计划](versioning-change-plan.md)及[测试计划](test-plan.md)整理，保留现有路径、版本语义和范围。前后端以本文件维护请求与响应；总体设计只保留接口概览。数据库字段继续由数据库设计维护，不直接拿MongoDB文档作HTTP返回值。

沿用D01—D18：登录填写、内部身份关联、匿名白名单、整份问卷重复限制、向后跳转、暂停编辑、不可变发布版本、旧版拒新与成功重放、按版统计、累计/当前份数分开。复制仍可选，不提供改答、删除、重开、匿名/重复策略切换、去重人数或跨版本合并接口。

本文补充的长度限制、字段默认值、错误名称、分页细节和DTO包装是AI在用户授权下确定的普通接口细节，非教师强制。唯一新增路径为历史答卷分页列表，用于获得已有详情接口所需的responseId，理由见第13节；不新增业务行为。

## 2 传输、认证与统一规则

### 2.1 路径与媒体类型

- 前缀统一`/api/v1`。各端点章节写前缀后的路径；示例HTTP请求都带完整前缀。页面`/survey/:publicId`与API`/api/v1/public/surveys/:publicId`不同。
- UTF-8 JSON，响应`Content-Type: application/json; charset=utf-8`。GET无正文；POST/PATCH/PUT有正文时必须`application/json`。logout是唯一无JSON正文的写请求；不把GET当修改操作。
- 无正文、路径、query和额外业务头时，端点明确写“无”；不接受未列出的query或JSON字段，不自动转换body类型、不静默删除伪造字段。参数重复、非法JSON、NaN或重复JSON键均拒绝。
- 请求体最多2,097,152字节；超限413，非支持媒体415，不存在路径404，不支持的方法405并带Allow。失败响应也按统一错误体，不输出堆栈、SQL/Mongo语句、连接串或原始输入。
- 日期、数字和ID按第3节；成功响应固定`{"data":...}`，不混用`success/result/code=0`包装。无返回内容时仍为200且data=null，不用204又发送JSON。
- 除健康检查外响应`Cache-Control: no-store`；不允许共享缓存把草稿、私有统计或账号答卷混给别人。未来内部缓存键必须包含surveyId和发布号。

### 2.2 认证与CSRF

认证沿用短期JWT cookie；建议cookie名`survey_auth`、HttpOnly、SameSite=Lax、Path=/，HTTPS时Secure；2小时过期，不在响应JSON返回JWT或把它放localStorage。浏览器同源fetch，开发经Vite代理；不用Authorization头作为另一套浏览器登录协议。退出清cookie，不宣称已实现服务器撤销、刷新令牌或账号管理。

所有POST/PATCH/PUT，包括注册、登录和退出，要求`Origin`严格匹配APP_ORIGIN及`X-CSRF-Guard: 1`；缺失/错误403。普通GET不要求这两个头。非浏览器测试也显式发送写请求的头，不按缺失Origin放行。写操作成功与失败均不回显密码、cookie或幂等key。服务端产生响应头`X-Request-Id`用于追踪，错误体traceId与其一致；它不是答卷requestId。

权限分三级：**公开**（注册、登录、健康，以及幂等清理本机cookie的退出）、**登录用户**、**创建者**。创建者接口先按当前账号核对surveyId归属，再访问版本、题目或答卷；资源不存在或无权统一404 NOT_FOUND。所有分享填写接口也必须登录，匿名只影响对创建者的身份展示，不是访客免登录。

### 2.3 公共失败集与示例约定

各端点列出的专属错误，加本节公共错误，构成完整失败范围。表内`E`错误示例均用同一结构；details始终数组，空时为[]。每端点给一条具体失败示例，其余错误按同结构、对应code和状态返回；不需要前端解析中文message。文档中的示例traceId只是设计样例。

| 适用范围 | HTTP / code | 条件 |
| --- | --- | --- |
| 所有端点 | 400 INVALID_REQUEST | 路径/查询/JSON结构、类型、未知字段、长度或重复参数不合法 |
| 游标列表 | 400 INVALID_CURSOR | 签名、查询范围、版本、题目或排序点不合法；不能当第一页继续 |
| 须登录/创建者 | 401 AUTH_REQUIRED / AUTH_EXPIRED | 无有效登录或过期；先重新登录，不改变未知结果请求的key |
| 写请求 | 403 CSRF_REJECTED | Origin或X-CSRF-Guard不满足 |
| 创建者/资源读取 | 404 NOT_FOUND | 不存在、跨用户访问；不返回“属于某用户”等细节 |
| 所有端点 | 429 RATE_LIMITED | 限速，Retry-After为秒数 |
| 有JSON正文 | 413 PAYLOAD_TOO_LARGE；415 UNSUPPORTED_MEDIA_TYPE | 超全局体积或非JSON媒体 |
| 除健康专用探测 | 503 SERVICE_UNAVAILABLE；500 INTERNAL_ERROR | 已知未进入业务写入时不可用，或未预期故障；写结果未知另见专属code |

健康检查使用相同400/429格式；live本身失败可500 INTERNAL_ERROR；ready失败用503 NOT_READY，不回传数据库主机、版本缺失清单或凭据。写请求收到未约定5xx、连接中断或超时，即使没有专用code，也应视为结果未知；不得仅凭HTTP 500认定未保存。

统一错误体示例：

```json
{"error":{"code":"ANSWER_VALIDATION_FAILED","message":"部分答案不符合要求","details":[{"questionId":"11111111-1111-4111-8111-111111111111","field":"optionId","reason":"REQUIRED"}],"traceId":"trace-api-example"}}
```

details元素可出现的字段为`field`、`reason`、`questionId`、`expectedRevision`、`expectedPublishedVersion`、`reloadRequired`；各字段类型分别为string、string、string、安全非负整数、安全正整数、bool，均按错误需要可选，不含账号、答案原文或内部索引名。定义错误使用field的JSON Pointer定位，例如`/questions/0/jumpRules/0/targetQuestionId`。

## 3 ID、时间、数字、修订和分页

### 3.1 原子类型

| 名称 | JSON类型和完整约束 |
| --- | --- |
| ObjectIdString | 24位十六进制字符串，输出小写；路径surveyId/responseId和用户id用它，不能传对象或EJSON |
| StableId | 1—128字符，匹配`^[A-Za-z0-9_-]+$`；题目/选项/规则ID。新前端生成UUID，兼容既有q1/yes等历史ID；唯一性按题目/问卷范围检查 |
| PublicId | 1—128字符，同StableId字符集；后端新生成至少128bit不可预测标识（建议22字符base64url）；接受已有合法分享标识，不能由客户端指定 |
| Key | 1—128个ASCII字符，匹配`^[A-Za-z0-9._:-]+$`；新客户端用crypto.randomUUID；兼容已有key，不强制把历史key改成UUID |
| Revision | JSON安全整数，0—9,007,199,254,740,991；expectedRevision为CAS前提，不是新值 |
| PositiveVersion | JSON安全正整数；query/path用十进制`[1-9][0-9]*`文本解析，不接受all、浮点、指数或负数 |
| Instant | ISO 8601字符串，必须含Z或明确偏移且日期有效；输出UTC毫秒格式，例如2026-10-16T04:00:00.000Z；expiresAt可null，其他字段按DTO明确可空 |
| DecimalString | 1—128字符，语法见下面正则；允许小数和指数，必须有限且可精确表示为Decimal128，不舍入 |

DecimalString语法正则（不包含两侧分隔符）：

```text
^-?(0|[1-9][0-9]*)(\.[0-9]+)?([eE][+-]?[0-9]+)?$
```

DecimalString不是JSON number；不能先Number()再转BSON。后端按十进制数学值检查范围与整数性，`"0"`有效；`"1"`、`"1.0"`、`"1e0"`的幂等规范化值相同，`"-0"`归一为`"0"`。拒绝空白、前导加号、无小数位的`"1."`、前导零`"01"`、NaN/Infinity和不可精确转换值。统计平均值沿用Decimal128运算精度，以其有限十进制字符串返回；无答案为null，不返回字符串`"null"`。

编辑定义修订`draftDefinitionRevision`（存储旧definitionVersion）、发布号`publishedVersion`（答卷存surveyDefinitionVersion）、并发`revision`三者分开。发布输入沿用既有名称`expectedDraftDefinitionVersion`，它匹配GET管理详情的draftDefinitionRevision；不另造expectedPublishedVersion请求字段（错误details中的同名字段是服务端提示）。首次发布指针null，不能用0假装已发布。

### 3.2 分页

列表query：limit可选，默认20，十进制整数1—100；cursor可选，长度1—2048的不透明签名字符串；不传时首批，传空字符串报400。不得附page/offset/order等未声明参数。统一列表data有items数组和nextCursor字符串或null，其他上下文字段按DTO；空列表200 items=[]，不是404。不返回不可靠total。

问卷列表按createdAt降序、id降序；答卷/题目原文按submittedAt降序、responseId降序；发布版本按version降序（兼容publishedAt=null）。游标绑定登录主体、端点、surveyId、selectedVersion、questionId（如适用）、排序点并签名；签名key使用独立CURSOR_SECRET，不能由前端构造或解码后修改。不能跨问卷/版本/题目复用。未知/损坏游标400 INVALID_CURSOR。首次按默认最新版本获得selectedVersion后，后续页显式带version，避免期间重发使其跳版。

### 3.3 状态与版本规则

定义只在draft/paused可保存，已有答卷不阻止；保存不创建survey_versions。显式publish从draft/paused进入published，每次成功新操作创建新不可变发布号；published状态不能用新key直接再次publish。pause仅published→paused；close仅published/paused→closed，不提供重开；对已处于目标状态再次调用返回409 SURVEY_STATE_CONFLICT，客户端可GET确认，不自动复用陈旧revision。

管理实际字段变化使revision+1，定义变化还使draftDefinitionRevision+1；合法无变化保存返回原值，不空增号。新建revision=0、draftDefinitionRevision=1；提交只增加累计/当前计数，不改变管理revision或编辑修订。expiresAt修改是运行配置，任意现有状态下可由创建者CAS设置，不会重开closed，也不会改变旧快照；可设置过去时间让收集立即过期，发布时必须无截止或未截止。

首次发布后allowAnonymous/allowRepeat冻结。策略只在从未发布的draft可设置；传相同冻结值是无变化，试图改值409 POLICY_LOCKED；不因paused且零答卷放开。禁止重复按整份问卷跨所有版本限一次。复制可选，不代替同链接重发。

## 4 请求与响应 DTO 字典

本节是完整字段白名单；下表`?`表示可缺省，`|null`表示允许null。其他列出的字段均必填，未知字段拒绝；输出只含所选DTO字段，不能随便追加BSON文档字段。长度均按Unicode码点，HTTP体积另限。前后端文本长度统一复用共享模块：标题计trim后长度，说明保留原文，空格及换行计入；单码点emoji计1，组合表情可占多个码点。超限仍返回400 INVALID_REQUEST，details使用field（如/description）与reason=TOO_LONG定位，不改变错误协议。下列长度属于普通技术约定，不是教师额外要求。

### 4.1 请求对象

| 名称 | 完整字段及约束 |
| --- | --- |
| Credentials | username:string，NFKC/trim后1—50码点；password:string 8—128码点，注册/登录均不trim、不截断；登录接受相同编码方式，凭据错误不区分账号不存在 |
| CreateSurvey | title:string trim后1—200；description?:string 0—2000，默认空；allowAnonymous?:bool默认false；allowRepeat?:bool默认false；expiresAt?:Instant\|null默认null |
| PatchSurvey | expectedRevision:Revision；至少另一个title/description/allowAnonymous/allowRepeat/expiresAt，类型及长度同CreateSurvey；null不能代替缺省，除expiresAt外不允许null |
| SaveQuestions | expectedRevision:Revision；questions:Question[] 0—100；空数组可保存草稿但不能发布 |
| RevisionCommand | expectedRevision:Revision；不接受其他字段 |
| PublishCommand | expectedRevision:Revision；expectedDraftDefinitionVersion:PositiveVersion；Publication-Key头另传 |
| SubmitCommand | publishedVersion:PositiveVersion；anonymous:bool；answers:Answer[] 0—100，同一questionId不能重复；Idempotency-Key头另传 |

username规范化结果由后端生成usernameKey，不允许客户端提交。password强度长度是当前接口基线；未来若接入既有不同密码长度的真实账号需先评估兼容，本项目已实现账号基线，不以旧示例占位密码作为兼容依据。

### 4.2 题目与规则

Definition完整字段为`title`、`description`、`questions`，类型与限制同上。Question共同字段`id:StableId`、`type:"single"|"multiple"|"text"|"number"`、`title:string(非空1—500)`、`required:bool`、`jumpRules:JumpRule[]，数量0—100`；按type再要求以下字段，不接受其他题型的专有字段。

| type | 专有字段和约束 |
| --- | --- |
| single | options:Option[]，2—100；不接受validation |
| multiple | options:Option[]，2—100；validation:{minChoices?:整数0—100,maxChoices?:整数0—100}；缺省下限仅由required决定，上限为选项总数；min=max表达恰好 |
| text | validation:{minLength?:整数0—10000,maxLength?:整数0—10000}，缺省0/10000；jumpRules必须[] |
| number | validation:{min?:DecimalString,max?:DecimalString,integerOnly:bool}，缺省不设数值边界；所有数值都是字符串 |

Option字段`id:StableId,label:string(非空1—200)`；同题选项ID唯一。JumpRule字段`id:StableId,condition:Condition,targetQuestionId:StableId`；问卷内题目ID、规则ID不重复。Condition互斥三种：单选`{op:"eq",optionId:StableId}`；多选`{op:"containsAny"|"containsAll",optionIds:StableId[]，数量1—100且不重复}`；数字`{op:"eq"|"lt"|"lte"|"gt"|"gte",number:DecimalString}`。数组顺序决定题序与规则优先级，禁止额外order/priority字段。

保存时检查类型形状、ID唯一、同类型约束和上下界；未完成的跳转引用可留在草稿并以validationIssues返回，但正式发布须目标存在且严格在后、引用选项存在、至少一题、可满足必答约束、截止合法及定义大小受限。新增/删除/排序均用整体questions保存接口，不另建题目CRUD或服务器预览提交接口。

### 4.3 答案

Answer互斥形状完整如下；未答的可选题从answers中省略，不传null或空数组/空字符串；纯空格text在业务判空时按未答，最终不保存。数值0为有效回答。

| type | 完整字段 |
| --- | --- |
| single | questionId:StableId,type:"single",optionId:StableId |
| multiple | questionId:StableId,type:"multiple",optionIds:StableId[]，数量1—100且不能重复 |
| text | questionId:StableId,type:"text",text:string(1—10000)，非空内容保留原始文本并按题目长度校验 |
| number | questionId:StableId,type:"number",number:DecimalString |

后端先辨识幂等重放，再对新提交检查状态/版本，随后使用该版定义重算路径并检查内容。未知题/类型/非法选项拒绝；形状合法但已被改答跳过的旧分支答案剔除，不用于统计。客户端不能上传visitedQuestionIds、统计结果或跳转执行代码。

### 4.4 响应对象

下列对象均封装在data中。引用Definition/Question/Answer时沿用本节完整结构，无`...`省略字段的DTO定义。

| DTO | 完整字段 |
| --- | --- |
| User | id:ObjectIdString,username:string,createdAt:Instant；不含usernameKey/passwordHash |
| Settings | allowAnonymous:bool,allowRepeat:bool,expiresAt:Instant\|null |
| SurveySummary | id:ObjectIdString,publicId:PublicId,title:string,status:状态枚举,revision:Revision,currentPublishedVersion:PositiveVersion\|null,cumulativeResponseCount:安全非负整数,currentVersionResponseCount:安全非负整数,expiresAt:Instant\|null,createdAt:Instant,updatedAt:Instant |
| DefinitionIssue | code:string,field:string(JSON Pointer),questionId:StableId\|null,message:string；这些为只读问题，不回显用户答案 |
| Editor | id:ObjectIdString,publicId:PublicId,status:状态枚举,draftDefinition:Definition,settings:Settings,draftDefinitionRevision:PositiveVersion,revision:Revision,currentPublishedVersion:PositiveVersion\|null,hasUnpublishedChanges:bool,cumulativeResponseCount:安全非负整数,currentVersionResponseCount:安全非负整数,firstPublishedAt:Instant\|null,createdAt:Instant,updatedAt:Instant,validationIssues:DefinitionIssue[],capabilities:{copySurvey:bool} |
| SaveResult | revision:Revision,draftDefinitionRevision:PositiveVersion,hasUnpublishedChanges:bool,validationIssues:DefinitionIssue[]；没有新发布号 |
| PublishReceipt | surveyId:ObjectIdString,publishedVersion:PositiveVersion,status:"published",revision:Revision,publishedAt:Instant,firstPublishedAt:Instant,shareUrl:string,replayed:bool；status/revision是该次历史操作结果，重放不覆盖当前状态 |
| StateResult | surveyId:ObjectIdString,status:"paused"\|"closed",revision:Revision,currentPublishedVersion:PositiveVersion；计数不随暂停/关闭变化 |
| VersionSummary | publishedVersion:PositiveVersion,title:string,publishedAt:Instant\|null,legacy:bool |
| VersionDetail | surveyId:ObjectIdString,publishedVersion:PositiveVersion,sourceDraftDefinitionRevision:PositiveVersion,definition:Definition,policy:{allowAnonymous:bool,allowRepeat:bool},publishedAt:Instant\|null,legacy:bool；不输出发布key/hash/内部操作账号 |
| FillDefinition | publicId:PublicId,title:string,description:string,questions:Question[],publishedVersion:PositiveVersion,allowAnonymous:bool,allowRepeat:bool,expiresAt:Instant\|null,canSubmit:bool,unavailableReason:null\|"SURVEY_PAUSED"\|"SURVEY_CLOSED"\|"SURVEY_EXPIRED"\|"ALREADY_SUBMITTED",hasSubmitted:bool |
| SubmitReceipt | receiptId:ObjectIdString,submittedAt:Instant,publishedVersion:PositiveVersion,replayed:bool；只属于当前登录提交者 |
| ResponseSummary | responseId:ObjectIdString,publishedVersion:PositiveVersion,anonymous:bool,submittedAt:Instant |
| ResponseDetail | surveyId:ObjectIdString,responseId:ObjectIdString,publishedVersion:PositiveVersion,anonymous:bool,submittedAt:Instant,definition:Definition,answers:Answer[]；definition必须来自该答卷快照 |
| VersionContext | surveyId:ObjectIdString,selectedVersion:PositiveVersion,latestPublishedVersion:PositiveVersion,cumulativeResponseCount:安全非负整数,currentVersionResponseCount:安全非负整数,selectedVersionResponseCount:安全非负整数,generatedAt:Instant |
| QuestionSummary | questionId:StableId,type:题型枚举,title:string,answeredCount:安全非负整数；single/multiple另必填optionCounts:[{optionId:StableId,label:string,count:安全非负整数}]，其他题型禁止该字段；number另必填average:DecimalString\|null，text禁止average |

未发布时hasUnpublishedChanges=true；已发布后按完整编辑定义及策略内容是否与最后快照相同计算，而不是仅比较修订号（改后又改回可以false）。新问卷无答卷，两个计数均0；没有当前发布号时不得把编辑修订当发布号填入。策略/过期等运行配置的可变边界仍按正式决策；统计所有上下文的latestPublishedVersion只指最后发布号。

列表data完整结构：问卷列表`{items:SurveySummary[],nextCursor}`；版本列表`{surveyId,latestPublishedVersion:PositiveVersion|null,items:VersionSummary[],nextCursor}`；答卷列表`{surveyId,selectedVersion,latestPublishedVersion,items:ResponseSummary[],nextCursor}`。未发布问卷版本列表可200空数组；统计/按版答卷列表无已发布版则409 NO_PUBLISHED_VERSION。

统计data为VersionContext全部字段，加整卷`questionSummaries:QuestionSummary[]`或单题`questionSummary:QuestionSummary`。原文分页为VersionContext全部字段，加`question:{id:StableId,type:"text"|"number",title:string}`、`items:[{responseId,anonymous,submittedAt,answer:Answer}]`、nextCursor；只读所选版，未答/跳过不返回空记录。零答卷时题目/选项仍来自快照并补0，数字average=null。

统计页面展示约定（2026-10-17）：选项占比由前端按 count/answeredCount×100 计算并显示至多一位小数，不以整卷答卷数为分母；无有效回答显示零次数和0%表格，不绘制分布图。多选各项合计可超过100%，使用柱状图；单选可切换饼图/柱状图。数字average的API原值与类型不变，页面至多显示两位小数。标题含手机号、电话等关键词的数字题默认隐藏均值，允许创建者手动切换本次查看；这是展示偏好，不是题型推断、输入校验或快照字段，刷新/切版本重新采用默认，不修改历史发布定义。

### 4.5 可信字段与匿名输出白名单

| 来源 | 客户端能否传入业务正文 |
| --- | --- |
| title/description、设置、题目、expectedRevision、发布前提、publishedVersion、anonymous、答案 | 仅在对应端点白名单中可传；仍须后端核验 |
| Idempotency-Key、Publication-Key | 客户端提供操作标识，不等于能指定数据库记录或修改既有成功操作 |
| _id/id/publicId/ownerId/respondentId、schemaVersion、surveys.definitionVersion、surveyDefinitionVersion、repeatAllowed、submissionCount/currentVersionSubmissionCount、structureLocked、payloadHash/payloadHashVersion、firstPublishedAt/createdAt/updatedAt/submittedAt、发布号分配和快照 | 不能通过正文指定；后端生成/读取。允许的publishedVersion只是请求前提，不是允许客户端写任意归属 |

表内服务端生成的id指账号、问卷及答卷记录ID；Question/Option/JumpRule.id按其请求schema允许客户端生成并提交，不能与记录级ID混淆。请求顶层伪造上述可信字段400，不默默忽略。API输出用id/responseId等明确DTO名，不输出_id、BSON/EJSON、schemaVersion、structureLocked、数据库计数写入字段或hash。

账号接口只输出User。创建者历史答卷和原文页只输出ResponseDetail/ResponseSummary/原文DTO，匿名与非匿名均不额外输出respondentId、requestId、payloadHash、用户资料、cookie或可关联账号的旁路字段。responseId/receiptId是答卷记录标识，可在同问卷内定位该份历史答卷，不能反查账号；不作为去重人数或跨用户关联键。匿名内容里用户主动填写的姓名不自动识别或抹除，应在填写时提示。

填写端只输出FillDefinition；不能读取草稿、ownerId、内部ID、全部历史版本或其他人的答卷。历史管理接口须创建者，快照DTO也过滤publishedBy、publicationRequestId/hash及内部迁移证据路径，仅提供legacy标识和可空publishedAt。任何日志也不得把HTTP请求全文记录为匿名输出旁路。

## 5 接口目录与使用方法

下面每个接口都继承第2节传输/权限错误和第3节原子类型，第4节的请求/输出DTO是其完整字段合同。参数栏中没有列出的path/query/body/header一律不能用；标准Cookie/Origin/Content-Type/X-CSRF-Guard按第2节，不逐次复制密钥。每个示例都是完整JSON，不代表线上已存在这些ID。成功和失败展示不同前置条件或无效输入分支，不表示同一次请求既成功又失败；完整顺序流程单独见第15节。

示例共用问卷id `670000000000000000000010`、publicId `AbCdEfGhIjKlMnOpQrStUv`、题目UUID与固定UTC时刻。用户名teacher_demo/student_demo仅示例，密码不是实际账号；JWT cookie占位文本不是可用令牌。

| 编号 | 方法与路径 | 权限 |
| --- | --- | --- |
| [A01](#a01-注册) | POST /auth/register | 公开 |
| [A02](#a02-登录) | POST /auth/login | 公开 |
| [A03](#a03-读取当前账号) | GET /auth/me | 登录用户 |
| [A04](#a04-退出登录) | POST /auth/logout | 公开（仍校验写请求Origin/CSRF） |
| [Q01](#q01-自己的问卷列表) | GET /surveys | 登录用户 |
| [Q02](#q02-创建问卷草稿) | POST /surveys | 登录用户 |
| [Q03](#q03-问卷编辑详情) | GET /surveys/:surveyId | 创建者 |
| [Q04](#q04-保存元数据与运行配置) | PATCH /surveys/:surveyId | 创建者 |
| [Q05](#q05-整体保存题目) | PUT /surveys/:surveyId/questions | 创建者 |
| [V01](#v01-正式发布) | POST /surveys/:surveyId/publish | 创建者 |
| [V02](#v02-暂停收集) | POST /surveys/:surveyId/pause | 创建者 |
| [V03](#v03-关闭收集) | POST /surveys/:surveyId/close | 创建者 |
| [V04](#v04-可选复制问卷) | POST /surveys/:surveyId/copy | 创建者；仅capabilities.copySurvey=true可用 |
| [V05](#v05-发布版本列表) | GET /surveys/:surveyId/versions | 创建者 |
| [V06](#v06-读取历史发布定义) | GET /surveys/:surveyId/versions/:version | 创建者 |
| [F01](#f01-读取当前填写定义) | GET /public/surveys/:publicId | 登录用户（非创建者也可） |
| [F02](#f02-提交答卷或确认原成功结果) | POST /public/surveys/:publicId/responses | 登录用户 |
| [H01](#h01-按版本列出历史答卷) | GET /surveys/:surveyId/responses | 创建者 |
| [H02](#h02-历史答卷详情) | GET /surveys/:surveyId/responses/:responseId | 创建者 |
| [S01](#s01-整卷分版本统计) | GET /surveys/:surveyId/statistics | 创建者 |
| [S02](#s02-单题分版本统计) | GET /surveys/:surveyId/questions/:questionId/statistics | 创建者 |
| [S03](#s03-填空原文分版本分页) | GET /surveys/:surveyId/questions/:questionId/answers | 创建者 |
| [Z01](#z01-存活探测) | GET /health/live | 公开 |
| [Z02](#z02-就绪探测) | GET /health/ready | 公开 |

## 6 账号

### A01 注册

**POST `/auth/register`**，权限：公开。

完整参数：path/query：无；body：Credentials全部字段；不接受邮箱、角色、id或passwordHash。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：注册只创建账号，不自动登录，不设置登录cookie；用户名唯一键由后端规范化并经唯一索引保证。没有操作幂等key，网络结果未知时不能自动重新注册；可尝试登录确认。

请求示例：

```http
POST /api/v1/auth/register HTTP/1.1
Origin: http://localhost:5173
X-CSRF-Guard: 1
Content-Type: application/json
```

请求JSON：

```json
{
  "username": "teacher_demo",
  "password": "DemoOnly-Password-2026"
}
```

成功示例：HTTP 201，data完整类型为`User`。

```json
{
  "data": {
    "id": "670000000000000000000001",
    "username": "teacher_demo",
    "createdAt": "2026-10-16T03:50:00.000Z"
  }
}
```

失败范围：第2.3节适用的公共失败；409 USERNAME_TAKEN、422 USERNAME_INVALID。

失败示例：HTTP 409。例如同一个规范化用户名已经注册。

```json
{
  "error": {
    "code": "USERNAME_TAKEN",
    "message": "用户名已被使用",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


### A02 登录

**POST `/auth/login`**，权限：公开。

完整参数：path/query：无；body：Credentials全部字段。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：成功Set-Cookie: survey_auth=<签名令牌>; HttpOnly; SameSite=Lax; Path=/; Max-Age=7200，HTTPS另加Secure。响应正文不含令牌。错误不区分账号不存在/密码错误。重复登录可产生新的cookie，不是业务答卷幂等操作。

请求示例：

```http
POST /api/v1/auth/login HTTP/1.1
Origin: http://localhost:5173
X-CSRF-Guard: 1
Content-Type: application/json
```

请求JSON：

```json
{
  "username": "teacher_demo",
  "password": "DemoOnly-Password-2026"
}
```

成功示例：HTTP 200，data完整类型为`User`。

```json
{
  "data": {
    "id": "670000000000000000000001",
    "username": "teacher_demo",
    "createdAt": "2026-10-16T03:50:00.000Z"
  }
}
```

失败范围：第2.3节适用的公共失败；401 INVALID_CREDENTIALS。

失败示例：HTTP 401。例如密码不正确。

```json
{
  "error": {
    "code": "INVALID_CREDENTIALS",
    "message": "用户名或密码错误",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


### A03 读取当前账号

**GET `/auth/me`**，权限：登录用户。

完整参数：path/query/body：无。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：只返回当前cookie对应账号；不接受userId查询参数。读取不修改状态，无幂等key。

请求示例：

```http
GET /api/v1/auth/me HTTP/1.1
Cookie: survey_auth=<当前角色登录cookie>
```

请求正文：无。

成功示例：HTTP 200，data完整类型为`User`。

```json
{
  "data": {
    "id": "670000000000000000000001",
    "username": "teacher_demo",
    "createdAt": "2026-10-16T03:50:00.000Z"
  }
}
```

失败范围：第2.3节适用的公共失败；无额外专属错误。

失败示例：HTTP 401。例如未携带有效登录cookie。

```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "请先登录",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


### A04 退出登录

**POST `/auth/logout`**，权限：公开（仍校验写请求Origin/CSRF）。

完整参数：path/query/body：无；不得发送正文（包括{}）；请求无需有效登录cookie。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：设置过期的同名同Path cookie；即使cookie已过期/不存在也200，重复退出同结果。不实现撤销全部JWT或服务器会话管理。无业务状态、版本或幂等key。

请求示例：

```http
POST /api/v1/auth/logout HTTP/1.1
Origin: http://localhost:5173
X-CSRF-Guard: 1
```

请求正文：无。

成功示例：HTTP 200，data完整类型为`null`。

```json
{
  "data": null
}
```

失败范围：第2.3节适用的公共失败；无额外专属错误。

失败示例：HTTP 400。例如添加未声明的debug查询参数，或在无正文端点发送正文。

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "请求参数不符合接口契约",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


## 7 问卷编辑

### Q01 自己的问卷列表

**GET `/surveys`**，权限：登录用户。

完整参数：path/body：无；query：limit?和cursor?，完整约束见3.2；没有ownerId/status搜索参数。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：后端固定ownerId为当前账号，不能由query覆盖；title是编辑区标题。计数为累计及当前发布版，读取不切换版本，不产生写入。

请求示例：

```http
GET /api/v1/surveys HTTP/1.1
Cookie: survey_auth=<当前角色登录cookie>
```

请求正文：无。

成功示例：HTTP 200，data完整类型为`{items:SurveySummary[],nextCursor}`。

```json
{
  "data": {
    "items": [
      {
        "id": "670000000000000000000010",
        "publicId": "AbCdEfGhIjKlMnOpQrStUv",
        "title": "校园生活调查",
        "status": "published",
        "revision": 5,
        "currentPublishedVersion": 2,
        "cumulativeResponseCount": 1,
        "currentVersionResponseCount": 0,
        "createdAt": "2026-10-16T04:00:00.000Z",
        "updatedAt": "2026-10-16T04:06:00.000Z"
      }
    ],
    "nextCursor": null
  }
}
```

失败范围：第2.3节适用的公共失败；无额外专属错误。

失败示例：HTTP 401。例如未携带有效登录cookie。

```json
{
  "error": {
    "code": "AUTH_REQUIRED",
    "message": "请先登录",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


### Q02 创建问卷草稿

**POST `/surveys`**，权限：登录用户。

完整参数：path/query：无；body：CreateSurvey，只有title必填，其余缺省值见4.1。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：后端生成id/publicId/owner及时间，revision=0、编辑修订=1、当前发布号null、累计/当前计数0；questions=[]、未发布，创建不建发布快照。没有幂等key，结果未知先检查列表，不自动重复POST。

请求示例：

```http
POST /api/v1/surveys HTTP/1.1
Origin: http://localhost:5173
X-CSRF-Guard: 1
Cookie: survey_auth=<当前角色登录cookie>
Content-Type: application/json
```

请求JSON：

```json
{
  "title": "校园生活调查",
  "description": "课程项目示例",
  "allowAnonymous": true,
  "allowRepeat": false,
  "expiresAt": null
}
```

成功示例：HTTP 201，data完整类型为`Editor`。

```json
{
  "data": {
    "id": "670000000000000000000010",
    "publicId": "AbCdEfGhIjKlMnOpQrStUv",
    "status": "draft",
    "draftDefinition": {
      "title": "校园生活调查",
      "description": "课程项目示例",
      "questions": []
    },
    "settings": {
      "allowAnonymous": true,
      "allowRepeat": false,
      "expiresAt": null
    },
    "draftDefinitionRevision": 1,
    "revision": 0,
    "currentPublishedVersion": null,
    "hasUnpublishedChanges": true,
    "cumulativeResponseCount": 0,
    "currentVersionResponseCount": 0,
    "firstPublishedAt": null,
    "createdAt": "2026-10-16T04:00:00.000Z",
    "updatedAt": "2026-10-16T04:00:00.000Z",
    "validationIssues": [
      {
        "code": "NO_QUESTIONS",
        "field": "/questions",
        "questionId": null,
        "message": "至少需要一道题才能发布"
      }
    ],
    "capabilities": {
      "copySurvey": false
    }
  }
}
```

失败范围：第2.3节适用的公共失败；无额外专属错误。

失败示例：HTTP 400。例如添加未声明的debug查询参数，或在无正文端点发送正文。

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "请求参数不符合接口契约",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


### Q03 问卷编辑详情

**GET `/surveys/:surveyId`**，权限：创建者。

完整参数：path：surveyId:ObjectIdString；query/body：无。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：返回待编辑定义、设置、修订、发布指针和未发布改动，不把草稿当公开填写定义。hasUnpublishedChanges按内容比较；capabilities.copySurvey=false时隐藏可选复制入口。只读，无幂等key。

请求示例：

```http
GET /api/v1/surveys/670000000000000000000010 HTTP/1.1
Cookie: survey_auth=<当前角色登录cookie>
```

请求正文：无。

成功示例：HTTP 200，data完整类型为`Editor`。

```json
{
  "data": {
    "id": "670000000000000000000010",
    "publicId": "AbCdEfGhIjKlMnOpQrStUv",
    "status": "paused",
    "draftDefinition": {
      "title": "校园生活调查",
      "description": "课程项目示例",
      "questions": [
        {
          "id": "11111111-1111-4111-8111-111111111111",
          "type": "single",
          "title": "喜欢哪种水果？",
          "required": true,
          "jumpRules": [],
          "options": [
            {
              "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
              "label": "苹果"
            },
            {
              "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
              "label": "香蕉"
            }
          ]
        },
        {
          "id": "22222222-2222-4222-8222-222222222222",
          "type": "number",
          "title": "年龄",
          "required": true,
          "jumpRules": [],
          "validation": {
            "min": "0",
            "max": "120",
            "integerOnly": true
          }
        }
      ]
    },
    "settings": {
      "allowAnonymous": true,
      "allowRepeat": false,
      "expiresAt": null
    },
    "draftDefinitionRevision": 2,
    "revision": 3,
    "currentPublishedVersion": 1,
    "hasUnpublishedChanges": false,
    "cumulativeResponseCount": 1,
    "currentVersionResponseCount": 1,
    "firstPublishedAt": "2026-10-16T04:02:00.000Z",
    "createdAt": "2026-10-16T04:00:00.000Z",
    "updatedAt": "2026-10-16T04:04:00.000Z",
    "validationIssues": [],
    "capabilities": {
      "copySurvey": false
    }
  }
}
```

失败范围：第2.3节适用的公共失败；无额外专属错误。

失败示例：HTTP 404。例如访问不存在、从未发布的公开问卷，或不属于当前账号的管理资源（依该端点权限）。

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "资源不存在或不可访问",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


### Q04 保存元数据与运行配置

**PATCH `/surveys/:surveyId`**，权限：创建者。

完整参数：path：surveyId；query：无；body：PatchSurvey。缺省属性保持原值，description空串可清空，expiresAt=null可取消截止。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：title/description仅draft或paused保存；策略仅从未发布draft且尚未冻结时改变；expiresAt为运行配置，不能重开closed。CAS必须匹配revision；定义改变再增编辑修订，单改截止不增。无发布快照、不自动发布。重试旧expectedRevision遇409应GET核对。

请求示例：

```http
PATCH /api/v1/surveys/670000000000000000000010 HTTP/1.1
Origin: http://localhost:5173
X-CSRF-Guard: 1
Cookie: survey_auth=<当前角色登录cookie>
Content-Type: application/json
```

请求JSON：

```json
{
  "expectedRevision": 3,
  "expiresAt": "2026-10-20T10:00:00.000Z"
}
```

成功示例：HTTP 200，data完整类型为`SaveResult`。

```json
{
  "data": {
    "revision": 4,
    "draftDefinitionRevision": 2,
    "hasUnpublishedChanges": false,
    "validationIssues": []
  }
}
```

失败范围：第2.3节适用的公共失败；409 EDIT_CONFLICT、409 SURVEY_STATE_CONFLICT、409 POLICY_LOCKED。

失败示例：HTTP 409。例如expectedRevision已经落后于服务器当前修订。

```json
{
  "error": {
    "code": "EDIT_CONFLICT",
    "message": "编辑内容已变化，请重新加载并比较",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


当前实现补充（不改变协议）：数值字符串按十进制数学值规范化后比较，如1、1.0、1e0不造成无意义修订；对象字段顺序不构成变化，题序/选项序/规则序仍有意义。条件optionIds作为集合规范化。Q04仅实际标题/说明改变增加编辑修订；策略或截止改变只增加revision。过期expectedRevision即使内容相同仍返回409。

### Q05 整体保存题目

**PUT `/surveys/:surveyId/questions`**，权限：创建者。

完整参数：path：surveyId；query：无；body：SaveQuestions，必须包含完整questions数组，省略旧题即删除待编辑定义中的该题。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：仅draft/paused；有旧答卷照样可改。数组顺序决定显示题序和规则优先级。无变化返回原修订；有变化revision和编辑修订各+1。仅写编辑区，不创建发布版本；草稿的未完成跳转引用以validationIssues标出，发布前必须修复。

请求示例：

```http
PUT /api/v1/surveys/670000000000000000000010/questions HTTP/1.1
Origin: http://localhost:5173
X-CSRF-Guard: 1
Cookie: survey_auth=<当前角色登录cookie>
Content-Type: application/json
```

请求JSON：

```json
{
  "expectedRevision": 0,
  "questions": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "type": "single",
      "title": "喜欢哪种水果？",
      "required": true,
      "jumpRules": [],
      "options": [
        {
          "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          "label": "苹果"
        },
        {
          "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
          "label": "香蕉"
        }
      ]
    },
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "type": "number",
      "title": "年龄",
      "required": true,
      "jumpRules": [],
      "validation": {
        "min": "0",
        "max": "120",
        "integerOnly": true
      }
    }
  ]
}
```

成功示例：HTTP 200，data完整类型为`SaveResult`。

```json
{
  "data": {
    "revision": 1,
    "draftDefinitionRevision": 2,
    "hasUnpublishedChanges": true,
    "validationIssues": []
  }
}
```

失败范围：第2.3节适用的公共失败；409 EDIT_CONFLICT、409 SURVEY_STATE_CONFLICT、422 DEFINITION_INVALID。

失败示例：HTTP 409。例如在published直接保存题目，或对closed再次关闭（依该端点操作）。

```json
{
  "error": {
    "code": "SURVEY_STATE_CONFLICT",
    "message": "当前收集状态不允许此操作",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


草稿保存的错误边界：对象形状、字段类型和未声明字段不合法为400；重复ID、上下界和选择数量矛盾、非精确Decimal128为422 DEFINITION_INVALID。形状合法的缺失选项/缺失目标/向前或自身目标返回SaveResult.validationIssues，草稿可以保存；必答上限0或整数范围无整数同样作为发布前待完善项。新UI未选目标使用后端可识别的合法稳定引用字符串，并非创建题目。具体code由实现给出，前端不解析中文message。发布接口会拒绝任何未解决的定义问题；草稿保存的宽松引用规则不等于发布允许这些问题。

## 8 发布版本

### V01 正式发布

**POST `/surveys/:surveyId/publish`**，权限：创建者。

完整参数：path：surveyId；query：无；body：PublishCommand；另必填Publication-Key:Key。expectedDraftDefinitionVersion匹配Editor.draftDefinitionRevision。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：成功新发布201；同key同前提重放200且replayed=true。先按surveyId+Publication-Key找原成功操作，再检查当前状态/修订。新操作只在draft/paused，事务插不可变快照、切指针、当前计数归0、累计保留、revision+1，编辑修订不增。即使内容相同，新的显式重发也分配下一号。同key不同前提409；结果未知原key重试。原回执的status/revision是历史值，不改变现在状态，必要时GET编辑详情刷新。

请求示例：

```http
POST /api/v1/surveys/670000000000000000000010/publish HTTP/1.1
Origin: http://localhost:5173
X-CSRF-Guard: 1
Cookie: survey_auth=<当前角色登录cookie>
Content-Type: application/json
Publication-Key: publish-v1-example
```

请求JSON：

```json
{
  "expectedRevision": 1,
  "expectedDraftDefinitionVersion": 2
}
```

成功示例：HTTP 201，data完整类型为`PublishReceipt`。

```json
{
  "data": {
    "surveyId": "670000000000000000000010",
    "publishedVersion": 1,
    "status": "published",
    "revision": 2,
    "publishedAt": "2026-10-16T04:02:00.000Z",
    "firstPublishedAt": "2026-10-16T04:02:00.000Z",
    "shareUrl": "http://localhost:5173/survey/AbCdEfGhIjKlMnOpQrStUv",
    "replayed": false
  }
}
```

失败范围：第2.3节适用的公共失败；409 EDIT_CONFLICT、409 DRAFT_DEFINITION_CONFLICT、409 SURVEY_STATE_CONFLICT、422 DEFINITION_INVALID、409 SURVEY_EXPIRED、409 PUBLICATION_IDEMPOTENCY_CONFLICT、503 PUBLICATION_OUTCOME_UNKNOWN。

失败示例：HTTP 409。例如先用该Publication-Key成功发布，再用同key把expectedDraftDefinitionVersion改为3。

```json
{
  "error": {
    "code": "PUBLICATION_IDEMPOTENCY_CONFLICT",
    "message": "该发布key已用于不同操作前提",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


### V02 暂停收集

**POST `/surveys/:surveyId/pause`**，权限：创建者。

完整参数：path：surveyId；query：无；body：RevisionCommand。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：只接受published→paused，revision+1；发布指针、全部快照及计数不变。暂停成功后的新接受操作拒绝；旧成功幂等请求仍可重放。此接口无Publication-Key/Idempotency-Key；超时用GET核对，不用陈旧revision自动再次暂停。

请求示例：

```http
POST /api/v1/surveys/670000000000000000000010/pause HTTP/1.1
Origin: http://localhost:5173
X-CSRF-Guard: 1
Cookie: survey_auth=<当前角色登录cookie>
Content-Type: application/json
```

请求JSON：

```json
{
  "expectedRevision": 2
}
```

成功示例：HTTP 200，data完整类型为`StateResult`。

```json
{
  "data": {
    "surveyId": "670000000000000000000010",
    "status": "paused",
    "revision": 3,
    "currentPublishedVersion": 1
  }
}
```

失败范围：第2.3节适用的公共失败；409 EDIT_CONFLICT、409 SURVEY_STATE_CONFLICT。

失败示例：HTTP 409。例如expectedRevision已经落后于服务器当前修订。

```json
{
  "error": {
    "code": "EDIT_CONFLICT",
    "message": "编辑内容已变化，请重新加载并比较",
    "details": [
      {
        "expectedRevision": 3
      }
    ],
    "traceId": "trace-api-example"
  }
}
```


### V03 关闭收集

**POST `/surveys/:surveyId/close`**，权限：创建者。

完整参数：path：surveyId；query：无；body：RevisionCommand。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：仅published/paused→closed，revision+1，版本和计数不变；没有重开接口。重复close对closed返回状态冲突，客户端可GET确认最终状态；旧成功提交仍可重放。没有幂等key，不自动重放状态命令。

请求示例：

```http
POST /api/v1/surveys/670000000000000000000010/close HTTP/1.1
Origin: http://localhost:5173
X-CSRF-Guard: 1
Cookie: survey_auth=<当前角色登录cookie>
Content-Type: application/json
```

请求JSON：

```json
{
  "expectedRevision": 5
}
```

成功示例：HTTP 200，data完整类型为`StateResult`。

```json
{
  "data": {
    "surveyId": "670000000000000000000010",
    "status": "closed",
    "revision": 6,
    "currentPublishedVersion": 2
  }
}
```

失败范围：第2.3节适用的公共失败；409 EDIT_CONFLICT、409 SURVEY_STATE_CONFLICT。

失败示例：HTTP 409。例如在published直接保存题目，或对closed再次关闭（依该端点操作）。

```json
{
  "error": {
    "code": "SURVEY_STATE_CONFLICT",
    "message": "当前收集状态不允许此操作",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


### V04 可选复制问卷

**POST `/surveys/:surveyId/copy`**，权限：创建者；仅capabilities.copySurvey=true可用。

完整参数：path：surveyId；query：无；body：RevisionCommand，修订指源问卷。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：默认可不实现：认证和归属核对后返回501，不应让前端按钮尝试调用。若启用，201创建新id/publicId的独立draft；复制已保存编辑定义及策略，重生成题目/选项/规则ID并重写引用，截止重置null、计数0、不复制快照或答卷；原问卷无变化，内部copiedFromId由后端写。无幂等key，不自动重试。此成功示例仅用于可选功能启用后的契约。

请求示例：

```http
POST /api/v1/surveys/670000000000000000000010/copy HTTP/1.1
Origin: http://localhost:5173
X-CSRF-Guard: 1
Cookie: survey_auth=<当前角色登录cookie>
Content-Type: application/json
```

请求JSON：

```json
{
  "expectedRevision": 3
}
```

成功示例：HTTP 201，data完整类型为`Editor`。

```json
{
  "data": {
    "id": "670000000000000000000011",
    "publicId": "ZyXwVuTsRqPoNmLkJiHgFe",
    "status": "draft",
    "draftDefinition": {
      "title": "校园生活调查",
      "description": "课程项目示例",
      "questions": [
        {
          "id": "44444444-4444-4444-8444-444444444444",
          "type": "single",
          "title": "喜欢哪种水果？",
          "required": true,
          "jumpRules": [],
          "options": [
            {
              "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb1",
              "label": "苹果"
            },
            {
              "id": "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2",
              "label": "香蕉"
            }
          ]
        },
        {
          "id": "55555555-5555-4555-8555-555555555555",
          "type": "number",
          "title": "年龄",
          "required": true,
          "jumpRules": [],
          "validation": {
            "min": "0",
            "max": "120",
            "integerOnly": true
          }
        }
      ]
    },
    "settings": {
      "allowAnonymous": true,
      "allowRepeat": false,
      "expiresAt": null
    },
    "draftDefinitionRevision": 1,
    "revision": 0,
    "currentPublishedVersion": null,
    "hasUnpublishedChanges": true,
    "cumulativeResponseCount": 0,
    "currentVersionResponseCount": 0,
    "firstPublishedAt": null,
    "createdAt": "2026-10-16T04:08:00.000Z",
    "updatedAt": "2026-10-16T04:08:00.000Z",
    "validationIssues": [],
    "capabilities": {
      "copySurvey": true
    }
  }
}
```

失败范围：第2.3节适用的公共失败；501 FEATURE_NOT_ENABLED、409 EDIT_CONFLICT。

失败示例：HTTP 501。例如创建者有权访问，但可选复制功能未启用。

```json
{
  "error": {
    "code": "FEATURE_NOT_ENABLED",
    "message": "复制功能尚未启用",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


### V05 发布版本列表

**GET `/surveys/:surveyId/versions`**，权限：创建者。

完整参数：path：surveyId；body：无；query：limit?、cursor?。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：version降序分页；未发布问卷200 items=[]、latestPublishedVersion=null。历史迁移编号可以有间隙，不用数组下标推算；legacy的publishedAt可null。没有修改/删除版本接口，读取不切换发布指针。

请求示例：

```http
GET /api/v1/surveys/670000000000000000000010/versions HTTP/1.1
Cookie: survey_auth=<当前角色登录cookie>
```

请求正文：无。

成功示例：HTTP 200，data完整类型为`{surveyId,latestPublishedVersion,items:VersionSummary[],nextCursor}`。

```json
{
  "data": {
    "surveyId": "670000000000000000000010",
    "latestPublishedVersion": 2,
    "items": [
      {
        "publishedVersion": 2,
        "title": "校园生活调查",
        "publishedAt": "2026-10-16T04:06:00.000Z",
        "legacy": false
      },
      {
        "publishedVersion": 1,
        "title": "校园生活调查",
        "publishedAt": "2026-10-16T04:02:00.000Z",
        "legacy": false
      }
    ],
    "nextCursor": null
  }
}
```

失败范围：第2.3节适用的公共失败；无额外专属错误。

失败示例：HTTP 404。例如访问不存在、从未发布的公开问卷，或不属于当前账号的管理资源（依该端点权限）。

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "资源不存在或不可访问",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


### V06 读取历史发布定义

**GET `/surveys/:surveyId/versions/:version`**，权限：创建者。

完整参数：path：surveyId、version:PositiveVersion；query/body：无。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：只读指定不可变快照，不返回当前编辑内容；已知版本但定义损坏/待恢复503，完全不存在的版本404。legacy可能无可证实的发布时间，用null，不伪造迁移时刻。

请求示例：

```http
GET /api/v1/surveys/670000000000000000000010/versions/1 HTTP/1.1
Cookie: survey_auth=<当前角色登录cookie>
```

请求正文：无。

成功示例：HTTP 200，data完整类型为`VersionDetail`。

```json
{
  "data": {
    "surveyId": "670000000000000000000010",
    "publishedVersion": 1,
    "sourceDraftDefinitionRevision": 2,
    "definition": {
      "title": "校园生活调查",
      "description": "课程项目示例",
      "questions": [
        {
          "id": "11111111-1111-4111-8111-111111111111",
          "type": "single",
          "title": "喜欢哪种水果？",
          "required": true,
          "jumpRules": [],
          "options": [
            {
              "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
              "label": "苹果"
            },
            {
              "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
              "label": "香蕉"
            }
          ]
        },
        {
          "id": "22222222-2222-4222-8222-222222222222",
          "type": "number",
          "title": "年龄",
          "required": true,
          "jumpRules": [],
          "validation": {
            "min": "0",
            "max": "120",
            "integerOnly": true
          }
        }
      ]
    },
    "policy": {
      "allowAnonymous": true,
      "allowRepeat": false
    },
    "publishedAt": "2026-10-16T04:02:00.000Z",
    "legacy": false
  }
}
```

失败范围：第2.3节适用的公共失败；404 VERSION_NOT_FOUND、503 VERSION_DEFINITION_UNAVAILABLE。

失败示例：HTTP 404。例如将合法version改为当前问卷不存在的99。

```json
{
  "error": {
    "code": "VERSION_NOT_FOUND",
    "message": "所选发布版本不存在",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


## 9 填写提交

### F01 读取当前填写定义

**GET `/public/surveys/:publicId`**，权限：登录用户（非创建者也可）。

完整参数：path：publicId:PublicId；query/body：无，不接受version来请求历史填写。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：按currentPublishedVersion读快照，不读编辑区。首次未发布404。已发布过且paused/closed/expired仍可200返回最后发布定义，canSubmit=false；unavailableReason依次按closed、paused、expired、禁止重复且hasSubmitted判定，其余null。hasSubmitted是当前账号在整问卷是否有提交，不是参与人数。读取不保证后续一定可提交；新提交必须再查状态/版本。

请求示例：

```http
GET /api/v1/public/surveys/AbCdEfGhIjKlMnOpQrStUv HTTP/1.1
Cookie: survey_auth=<当前角色登录cookie>
```

请求正文：无。

成功示例：HTTP 200，data完整类型为`FillDefinition`。

```json
{
  "data": {
    "publicId": "AbCdEfGhIjKlMnOpQrStUv",
    "title": "校园生活调查",
    "description": "课程项目示例",
    "questions": [
      {
        "id": "11111111-1111-4111-8111-111111111111",
        "type": "single",
        "title": "喜欢哪种水果？",
        "required": true,
        "jumpRules": [],
        "options": [
          {
            "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
            "label": "苹果"
          },
          {
            "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
            "label": "香蕉"
          }
        ]
      },
      {
        "id": "22222222-2222-4222-8222-222222222222",
        "type": "number",
        "title": "年龄",
        "required": true,
        "jumpRules": [],
        "validation": {
          "min": "0",
          "max": "120",
          "integerOnly": true
        }
      }
    ],
    "publishedVersion": 1,
    "allowAnonymous": true,
    "allowRepeat": false,
    "expiresAt": null,
    "canSubmit": true,
    "unavailableReason": null,
    "hasSubmitted": false
  }
}
```

失败范围：第2.3节适用的公共失败；503 VERSION_DEFINITION_UNAVAILABLE。

失败示例：HTTP 404。例如访问不存在、从未发布的公开问卷，或不属于当前账号的管理资源（依该端点权限）。

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "资源不存在或不可访问",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


### F02 提交答卷或确认原成功结果

**POST `/public/surveys/:publicId/responses`**，权限：登录用户。

完整参数：path：publicId；query：无；body：SubmitCommand；另必填Idempotency-Key:Key。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：先做身份、受限请求结构检查，再查surveyId+当前账号+key的成功记录，使用原版本快照及hash算法比对。原版本同内容重放200且replayed=true，即使暂停/关闭/截止/已重发；同key换内容/anonymous/发布号409。无成功记录才按closed→paused→未发布→截止→版本不符→禁止重复顺序拒绝，再按当前快照校验答案。新成功201；旧版本新key409并提示重载，不能先用最新题目把旧合法选项报422。事务插答卷并累计/当前计数各+1，不写永久锁；并发冲突后的重复键仍要区分成功重放和拒绝重复。结果未知503或超时保留原key、原版本、原答案；不自动生成新key。

请求示例：

```http
POST /api/v1/public/surveys/AbCdEfGhIjKlMnOpQrStUv/responses HTTP/1.1
Origin: http://localhost:5173
X-CSRF-Guard: 1
Cookie: survey_auth=<当前角色登录cookie>
Content-Type: application/json
Idempotency-Key: answer-v1-example
```

请求JSON：

```json
{
  "publishedVersion": 1,
  "anonymous": true,
  "answers": [
    {
      "questionId": "11111111-1111-4111-8111-111111111111",
      "type": "single",
      "optionId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"
    },
    {
      "questionId": "22222222-2222-4222-8222-222222222222",
      "type": "number",
      "number": "20"
    }
  ]
}
```

成功示例：HTTP 201，data完整类型为`SubmitReceipt`。

```json
{
  "data": {
    "receiptId": "670000000000000000000020",
    "submittedAt": "2026-10-16T04:03:00.000Z",
    "publishedVersion": 1,
    "replayed": false
  }
}
```

失败范围：第2.3节适用的公共失败；409 SURVEY_NOT_PUBLISHED、409 SURVEY_PAUSED、409 SURVEY_CLOSED、409 SURVEY_EXPIRED、409 SURVEY_VERSION_CHANGED、409 ALREADY_SUBMITTED、409 IDEMPOTENCY_CONFLICT、422 ANSWER_VALIDATION_FAILED、422 ANONYMOUS_NOT_ALLOWED、503 VERSION_DEFINITION_UNAVAILABLE、503 SUBMISSION_OUTCOME_UNKNOWN。

失败示例：HTTP 409。例如请求仍为v1的新key提交，但问卷已发布v2。

```json
{
  "error": {
    "code": "SURVEY_VERSION_CHANGED",
    "message": "发布版本已变化，请重新加载",
    "details": [
      {
        "expectedPublishedVersion": 2,
        "reloadRequired": true
      }
    ],
    "traceId": "trace-api-example"
  }
}
```


## 10 历史答卷

### H01 按版本列出历史答卷

**GET `/surveys/:surveyId/responses`**，权限：创建者。

完整参数：path：surveyId；body：无；query：version?:PositiveVersion（首批省略取最新）、limit?、cursor?；有cursor时version必须显式给出。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：仅补足详情入口的responseId发现能力，不提供按账号/匿名身份检索，不返回答案全文；分页按提交时间/id降序。有版但零答卷200空数组；无已发布版409。默认版在本次请求固定，不跨版列举混合统计。

请求示例：

```http
GET /api/v1/surveys/670000000000000000000010/responses?version=1 HTTP/1.1
Cookie: survey_auth=<当前角色登录cookie>
```

请求正文：无。

成功示例：HTTP 200，data完整类型为`{surveyId,selectedVersion,latestPublishedVersion,items:ResponseSummary[],nextCursor}`。

```json
{
  "data": {
    "surveyId": "670000000000000000000010",
    "selectedVersion": 1,
    "latestPublishedVersion": 2,
    "items": [
      {
        "responseId": "670000000000000000000020",
        "publishedVersion": 1,
        "anonymous": true,
        "submittedAt": "2026-10-16T04:03:00.000Z"
      }
    ],
    "nextCursor": null
  }
}
```

失败范围：第2.3节适用的公共失败；409 NO_PUBLISHED_VERSION、404 VERSION_NOT_FOUND、503 VERSION_DEFINITION_UNAVAILABLE。

失败示例：HTTP 409。例如该问卷还只有编辑草稿。

```json
{
  "error": {
    "code": "NO_PUBLISHED_VERSION",
    "message": "问卷尚无可查看的发布版本",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


### H02 历史答卷详情

**GET `/surveys/:surveyId/responses/:responseId`**，权限：创建者。

完整参数：path：surveyId、responseId:ObjectIdString；query/body：无，不接受version覆盖答卷自身归属。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：先验证问卷归属且该responseId确属该问卷，再取答卷自身版本快照。返回当时定义及安全答案；新版本选项文字变化不能改变旧显示。缺失快照503，不套最新题。匿名/非匿名均无内部账号、提交key或hash；只读，无改答/删除能力。

请求示例：

```http
GET /api/v1/surveys/670000000000000000000010/responses/670000000000000000000020 HTTP/1.1
Cookie: survey_auth=<当前角色登录cookie>
```

请求正文：无。

成功示例：HTTP 200，data完整类型为`ResponseDetail`。

```json
{
  "data": {
    "surveyId": "670000000000000000000010",
    "responseId": "670000000000000000000020",
    "publishedVersion": 1,
    "anonymous": true,
    "submittedAt": "2026-10-16T04:03:00.000Z",
    "definition": {
      "title": "校园生活调查",
      "description": "课程项目示例",
      "questions": [
        {
          "id": "11111111-1111-4111-8111-111111111111",
          "type": "single",
          "title": "喜欢哪种水果？",
          "required": true,
          "jumpRules": [],
          "options": [
            {
              "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
              "label": "苹果"
            },
            {
              "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
              "label": "香蕉"
            }
          ]
        },
        {
          "id": "22222222-2222-4222-8222-222222222222",
          "type": "number",
          "title": "年龄",
          "required": true,
          "jumpRules": [],
          "validation": {
            "min": "0",
            "max": "120",
            "integerOnly": true
          }
        }
      ]
    },
    "answers": [
      {
        "questionId": "11111111-1111-4111-8111-111111111111",
        "type": "single",
        "optionId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"
      },
      {
        "questionId": "22222222-2222-4222-8222-222222222222",
        "type": "number",
        "number": "20"
      }
    ]
  }
}
```

失败范围：第2.3节适用的公共失败；503 VERSION_DEFINITION_UNAVAILABLE。

失败示例：HTTP 503。例如旧答卷关联的快照缺失，不能从最新定义补齐。

```json
{
  "error": {
    "code": "VERSION_DEFINITION_UNAVAILABLE",
    "message": "对应的历史发布定义暂不可用",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


## 11 分版本统计

### S01 整卷分版本统计

**GET `/surveys/:surveyId/statistics`**，权限：创建者。

完整参数：path：surveyId；body：无；query：version?:PositiveVersion，省略默认最新；无cursor/limit/merge参数。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：固定selectedVersion读该快照和该版答卷，缺省不取编辑修订；零答卷补全该版题/选项0和数字null。累计是所有版本份数总和，不合并题目结果；无去重人数。只读一致快照建议沿用版本计划。

请求示例：

```http
GET /api/v1/surveys/670000000000000000000010/statistics?version=1 HTTP/1.1
Cookie: survey_auth=<当前角色登录cookie>
```

请求正文：无。

成功示例：HTTP 200，data完整类型为`VersionContext + {questionSummaries:QuestionSummary[]}`。

```json
{
  "data": {
    "surveyId": "670000000000000000000010",
    "selectedVersion": 1,
    "latestPublishedVersion": 2,
    "cumulativeResponseCount": 1,
    "currentVersionResponseCount": 0,
    "selectedVersionResponseCount": 1,
    "generatedAt": "2026-10-16T04:07:00.000Z",
    "questionSummaries": [
      {
        "questionId": "11111111-1111-4111-8111-111111111111",
        "type": "single",
        "title": "喜欢哪种水果？",
        "answeredCount": 1,
        "optionCounts": [
          {
            "optionId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
            "label": "苹果",
            "count": 0
          },
          {
            "optionId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
            "label": "香蕉",
            "count": 1
          }
        ]
      },
      {
        "questionId": "22222222-2222-4222-8222-222222222222",
        "type": "number",
        "title": "年龄",
        "answeredCount": 1,
        "average": "20"
      }
    ]
  }
}
```

失败范围：第2.3节适用的公共失败；409 NO_PUBLISHED_VERSION、404 VERSION_NOT_FOUND、503 VERSION_DEFINITION_UNAVAILABLE。

失败示例：HTTP 404。例如将合法version改为当前问卷不存在的99。

```json
{
  "error": {
    "code": "VERSION_NOT_FOUND",
    "message": "所选发布版本不存在",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


### S02 单题分版本统计

**GET `/surveys/:surveyId/questions/:questionId/statistics`**，权限：创建者。

完整参数：path：surveyId、questionId:StableId；body：无；query：version?:PositiveVersion，省略默认最新。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：题目必须存在于所选快照，不从当前编辑区找同id补充；含选项完整标签和零次数。text只给answeredCount，number额外给average；不能把平均值缺省成0。

请求示例：

```http
GET /api/v1/surveys/670000000000000000000010/questions/11111111-1111-4111-8111-111111111111/statistics?version=1 HTTP/1.1
Cookie: survey_auth=<当前角色登录cookie>
```

请求正文：无。

成功示例：HTTP 200，data完整类型为`VersionContext + {questionSummary:QuestionSummary}`。

```json
{
  "data": {
    "surveyId": "670000000000000000000010",
    "selectedVersion": 1,
    "latestPublishedVersion": 2,
    "cumulativeResponseCount": 1,
    "currentVersionResponseCount": 0,
    "selectedVersionResponseCount": 1,
    "generatedAt": "2026-10-16T04:07:00.000Z",
    "questionSummary": {
      "questionId": "11111111-1111-4111-8111-111111111111",
      "type": "single",
      "title": "喜欢哪种水果？",
      "answeredCount": 1,
      "optionCounts": [
        {
          "optionId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          "label": "苹果",
          "count": 0
        },
        {
          "optionId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
          "label": "香蕉",
          "count": 1
        }
      ]
    }
  }
}
```

失败范围：第2.3节适用的公共失败；409 NO_PUBLISHED_VERSION、404 VERSION_NOT_FOUND、503 VERSION_DEFINITION_UNAVAILABLE、404 QUESTION_NOT_FOUND。

失败示例：HTTP 404。例如该questionId只在其他版本存在。

```json
{
  "error": {
    "code": "QUESTION_NOT_FOUND",
    "message": "所选版本不存在该题目",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


### S03 填空原文分版本分页

**GET `/surveys/:surveyId/questions/:questionId/answers`**，权限：创建者。

完整参数：path：surveyId、questionId；body：无；query：version?（首批可默认最新）、limit?、cursor?；有cursor时必须显式version。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：只接受所选版text/number，single/multiple由统计接口看次数；未答或被跳过不产生空记录。页内答案使用同版本，游标不能跨题/版复用；不输出账号，不提供下载/导出新功能。

请求示例：

```http
GET /api/v1/surveys/670000000000000000000010/questions/22222222-2222-4222-8222-222222222222/answers?version=1 HTTP/1.1
Cookie: survey_auth=<当前角色登录cookie>
```

请求正文：无。

成功示例：HTTP 200，data完整类型为`VersionContext + {question,items:[{responseId,anonymous,submittedAt,answer:Answer}],nextCursor}`。

```json
{
  "data": {
    "surveyId": "670000000000000000000010",
    "selectedVersion": 1,
    "latestPublishedVersion": 2,
    "cumulativeResponseCount": 1,
    "currentVersionResponseCount": 0,
    "selectedVersionResponseCount": 1,
    "generatedAt": "2026-10-16T04:07:00.000Z",
    "question": {
      "id": "22222222-2222-4222-8222-222222222222",
      "type": "number",
      "title": "年龄"
    },
    "items": [
      {
        "responseId": "670000000000000000000020",
        "anonymous": true,
        "submittedAt": "2026-10-16T04:03:00.000Z",
        "answer": {
          "questionId": "22222222-2222-4222-8222-222222222222",
          "type": "number",
          "number": "20"
        }
      }
    ],
    "nextCursor": null
  }
}
```

失败范围：第2.3节适用的公共失败；409 NO_PUBLISHED_VERSION、404 VERSION_NOT_FOUND、503 VERSION_DEFINITION_UNAVAILABLE、404 QUESTION_NOT_FOUND、422 UNSUPPORTED_QUESTION_TYPE。

失败示例：HTTP 422。例如把原文分页请求的questionId改为单选题。

```json
{
  "error": {
    "code": "UNSUPPORTED_QUESTION_TYPE",
    "message": "该接口仅支持文本或数字原文",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


## 12 健康检查

### Z01 存活探测

**GET `/health/live`**，权限：公开。

完整参数：path/query/body：无。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：只说明进程能响应，不连数据库、不代表迁移/事务或业务已通过。无版本、状态修改或幂等key。

请求示例：

```http
GET /api/v1/health/live HTTP/1.1
```

请求正文：无。

成功示例：HTTP 200，data完整类型为`{status:"live"}`。

```json
{
  "data": {
    "status": "live"
  }
}
```

失败范围：第2.3节适用的公共失败；无额外专属错误。

失败示例：HTTP 400。例如添加未声明的debug查询参数，或在无正文端点发送正文。

```json
{
  "error": {
    "code": "INVALID_REQUEST",
    "message": "请求参数不符合接口契约",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```


### Z02 就绪探测

**GET `/health/ready`**，权限：公开。

完整参数：path/query/body：无。 公共头按第2节；除显式声明的操作key外，无其他业务头。

状态、版本与幂等：检查MongoDB连通、可写primary、副本集/事务部署前提和四集合/验证器/索引/迁移门禁。通过不等于全部业务测试通过；不就绪503只返回稳定原因，不泄露内部环境。只读，不主动修复/初始化数据库。

请求示例：

```http
GET /api/v1/health/ready HTTP/1.1
```

请求正文：无。

成功示例：HTTP 200，data完整类型为`{status:"ready"}`。

```json
{
  "data": {
    "status": "ready"
  }
}
```

失败范围：第2.3节适用的公共失败；503 NOT_READY。

失败示例：HTTP 503。例如专用副本集尚未就绪或迁移门禁未通过。

```json
{
  "error": {
    "code": "NOT_READY",
    "message": "服务尚未就绪",
    "details": [],
    "traceId": "trace-api-example"
  }
}
```

## 13 页面覆盖与缺口处理

| 已设计页面/操作 | 契约支撑 | 检查结论 |
| --- | --- | --- |
| 登录、注册、会话恢复、退出 | A01—A04 | 满足；过期时可重新登录，未知提交的key与快照由当前页保留 |
| 自己的问卷列表、创建、分享 | Q01—Q03 | 满足；shareUrl由发布回执提供，列表已有publicId可构造本应用分享页面URL，不代表允许未发布填写 |
| 题目编辑、排序、删题、约束、跳转 | Q03—Q05 | 整体保存questions足够，不增加每题CRUD；validationIssues反馈发布前待修项 |
| 草稿预览 | Q03及共享路径纯函数 | 默认按原题序每页10题浏览，无需作答且不执行跳转；可切换模拟填写以执行校验和跳转。无需新增后端预览提交接口，两种方式均不写答卷和统计 |
| 发布、暂停、关闭、可选复制 | V01—V04 | 满足；草稿保存不生成版本，复制默认可不启用，不引入重开 |
| 查看发布版本、历史定义 | V05—V06 | 满足；版本列表分页不假定连续编号，迁移缺失时间允许null |
| 填写、返回改答、匿名选择、重试与完成页 | F01—F02 | 前端处理交互，后端最终路径核验；完成页用提交回执，无需增加公开答卷查询接口 |
| 历史答卷浏览与详情 | H01—H02 | **补充H01只读分页列表**，已有H02无法单独发现responseId；不是新业务范围，不新增账号过滤、修改或删除 |
| 整卷、单题、填空内容与版本切换 | S01—S03、V05 | 满足；原文页返回responseId可进入已有历史详情；跨版游标拒绝，无导出/合并/去重 |
| 开发就绪检查 | Z01—Z02 | 满足；readiness不执行建库、迁移或修复 |

### 普通细节与业务边界

本轮自主确定：统一错误命名、完整DTO包装、字段长度、key字符约束、健康返回形状、游标范围、保存无变化不增修订、无cookie退出可重复，以及复制启用后的默认重置截止时间。均在原设计允许范围内细化；复制本身仍可不实现。

没有改变已确认的D01—D18。以下只是继承此前技术建议，不能升级为用户正式业务决定：closed不重开、每次显式重发生成新号（同次key重放除外）、页面默认匿名、工程资源限额。若未来改变这些或改成每版本可填一次、重开closed、跨版合并/独立人数，需单独确认并同步决策/迁移；本契约不偷偷预留可调用接口。

契约细化发现并明确了两处原先未封闭的边界：发布回执是该次历史操作结果，旧发布重放不能覆盖当前状态；管理详情的编辑修订和填写发布号使用不同名称。二者沿用版本计划，不另起版本体系。

## 14 失败处理与验收关联

### 14.1 专属错误目录

所有未在此列出的公共错误见2.3。每个错误的message可调整文案，code/HTTP及数据结构不可随意变。除明确的已成功重放外，失败不得新增发布快照或答卷；结果未知的5xx不能宣称一定未写入。

| HTTP / code | 契约条件与前端处理 |
| --- | --- |
| 409 USERNAME_TAKEN；422 USERNAME_INVALID | 注册重名，或规范化后空/含控制字符等不合法；提示修改用户名 |
| 401 INVALID_CREDENTIALS | 登录凭据错误，统一提示 |
| 409 EDIT_CONFLICT | expectedRevision过期，GET编辑详情比较，保留本地编辑，不自动覆盖 |
| 409 DRAFT_DEFINITION_CONFLICT | 发布前提中的编辑修订不匹配；重新审阅待发布内容 |
| 409 SURVEY_STATE_CONFLICT | 保存/发布/暂停/关闭的状态不在允许集合；GET确认，不自动切状态 |
| 409 POLICY_LOCKED | 首次发布后试图改变匿名/重复策略；不新增策略迁移能力 |
| 422 DEFINITION_INVALID | 保存时基本定义无效，或发布时跳转/边界/必答/题数/定义大小检查未通过；details给字段与reason |
| 409 PUBLICATION_IDEMPOTENCY_CONFLICT | 同Publication-Key被用于不同发布前提；不能覆盖先前发布记录 |
| 503 PUBLICATION_OUTCOME_UNKNOWN | 发布提交结果未知，冻结原body/key重试，不能另发一次 |
| 501 FEATURE_NOT_ENABLED | 可选复制未启用；隐藏入口，不冒充已实现 |
| 409 NO_PUBLISHED_VERSION | 管理统计或按版答卷列表无任何发布版本；显示尚未发布空态 |
| 404 VERSION_NOT_FOUND；404 QUESTION_NOT_FOUND | 合法问卷下指定版或该版题不存在；不能用最新定义替代 |
| 503 VERSION_DEFINITION_UNAVAILABLE | 被引用的历史定义损坏/待恢复或迁移不完备；阻断读取/接受，不能编造快照 |
| 409 SURVEY_NOT_PUBLISHED / SURVEY_PAUSED / SURVEY_CLOSED / SURVEY_EXPIRED | 新提交不满足收集状态，提示对应原因；旧成功key先重放，不走这条新提交分支 |
| 409 SURVEY_VERSION_CHANGED | 新请求版本不是当前接受号，details给expectedPublishedVersion与reloadRequired=true；明确未接受该新提交，重新加载 |
| 409 ALREADY_SUBMITTED | 禁止重复时，同一账号整份问卷已有成功答卷，包括历史版本 |
| 409 IDEMPOTENCY_CONFLICT | 同提交key改发布号、anonymous或规范化后答案；原成功记录不被修改 |
| 422 ANSWER_VALIDATION_FAILED | 路径必答、选项合法性、选择数量、文本长度、数值范围、整数性不满足；reason建议REQUIRED/INVALID_OPTION/CHOICE_COUNT/TEXT_LENGTH/NUMBER_RANGE/INTEGER_REQUIRED |
| 422 ANONYMOUS_NOT_ALLOWED | anonymous=true但冻结策略不允许；前端不能自行切实名后默默重发 |
| 503 SUBMISSION_OUTCOME_UNKNOWN | 提交结果未知，原key/版本/快照确认，不更改内容或计数 |
| 422 UNSUPPORTED_QUESTION_TYPE | 对选择题请求填空原文分页；使用统计接口查看选项次数 |
| 503 NOT_READY | 就绪前提失败；探测不是修复任务 |

### 14.2 幂等、验证与输出优先级

请求大小、媒体、认证/CSRF、路由和有限基础结构检查先执行；不能接收任意未解析正文。进入业务后，提交优先寻找**该账号**相同key的成功记录，发布优先寻找**该创建者有权问卷**相同Publication-Key；绝不在未认证/越权时返回历史回执。

已成功提交使用原publishedVersion、原快照和原规范化算法核验，不能先拿最新题目校验旧选项。结构合法的同key改发布号/匿名/内容返回冲突；不是提供旧版本号就能获取别人的回执。成功重放只返回原回执，counts不变。

新提交按F02规定的收集状态/截止/版本/重复资格后再运行题目业务校验；版本变更不能误报为新版本题目的422错误。事务最后仍用服务器状态/当前指针/截止做实际条件写，处理读取后状态改变的竞态。发布也先识别成功key，回执重放不重新切换指针。

收到结构或已知业务拒绝400/409/422，可修改后创建新操作key；但发生结果未知时必须先确认原操作。改变key不是“重试同一次提交”。期限沿用服务器接受边界，不以页面点击或本机时钟确定。

### 14.3 测试关联与本轮状态

| 接口 | 现有需求与计划测试 |
| --- | --- |
| A01—A04、Q01—Q03 | R01—R04、T01—T04及T35越权 |
| Q04—Q05、V01—V03 | R22—R24、T22—T24、T28、T32，保存与正式发布分离 |
| V05—V06、H01—H02 | R25、T25、T33—T35，历史解释和不可恢复定义 |
| F01—F02 | R06—R17、R28—R29；T06—T17、T28—T32，旧版拒新和成功重放 |
| S01—S03 | R18—R21、R26—R27；T18—T21、T26—T27、T35，分版统计与匿名 |
| V04 | D17可选；未启用返回501，启用时需另记真实测试，不作为修改必需验收 |
| Z01—Z02 | 工程初始化门禁；不把探测成功当业务或迁移验收 |

以上为完整阶段验收映射，不能据此声称全部接口通过。当前账号/草稿与Q04/Q05已有真实API和浏览器验证，分别见[初版记录](implementation-verification.md)及[编辑增量](editor-verification.md)；发布、提交、统计已完成真实模块和浏览器验证，见[第一阶段结果](testing/phase1-results.md)；未知旧库迁移与数据库角色启用尚未落实，OpenAPI尚未生成。新版四集合初始化为npm run db:init，历史旧脚本及12项旧记录继续保留，不覆盖新版完整业务。


## 15 连贯生命周期示例

以下是一条独立、完整的预期流程；上面各端点的分支示例不按章节次序执行。创建者A与填写者X使用各自cookie。先通过账号接口注册/登录，再执行以下步骤。首次创建不填题目，保存题目后才发布；全过程surveyId/publicId不变。时间为2026-10-16 UTC，页面显示上海时区。

### 1 创建草稿

POST `/api/v1/surveys`。

请求正文：

```json
{
  "title": "校园生活调查",
  "description": "课程项目示例",
  "allowAnonymous": true,
  "allowRepeat": false,
  "expiresAt": null
}
```

成功201的完整data为Q02的Editor示例；下面仅列该步校验点，不是另一种响应DTO：

```json
{
  "checks": {
    "id": "670000000000000000000010",
    "publicId": "AbCdEfGhIjKlMnOpQrStUv",
    "revision": 0,
    "draftDefinitionRevision": 1,
    "currentPublishedVersion": null
  }
}
```

### 2 保存题目

PUT `/api/v1/surveys/670000000000000000000010/questions`。

请求正文：

```json
{
  "expectedRevision": 0,
  "questions": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "type": "single",
      "title": "喜欢哪种水果？",
      "required": true,
      "jumpRules": [],
      "options": [
        {
          "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          "label": "苹果"
        },
        {
          "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
          "label": "香蕉"
        }
      ]
    },
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "type": "number",
      "title": "年龄",
      "required": true,
      "jumpRules": [],
      "validation": {
        "min": "0",
        "max": "120",
        "integerOnly": true
      }
    }
  ]
}
```

成功响应：

```json
{
  "data": {
    "revision": 1,
    "draftDefinitionRevision": 2,
    "hasUnpublishedChanges": true,
    "validationIssues": []
  }
}
```

### 3 发布v1

POST `/api/v1/surveys/670000000000000000000010/publish`。 `Publication-Key: publish-v1-example`。

请求正文：

```json
{
  "expectedRevision": 1,
  "expectedDraftDefinitionVersion": 2
}
```

成功响应：

```json
{
  "data": {
    "surveyId": "670000000000000000000010",
    "publishedVersion": 1,
    "status": "published",
    "revision": 2,
    "publishedAt": "2026-10-16T04:02:00.000Z",
    "firstPublishedAt": "2026-10-16T04:02:00.000Z",
    "shareUrl": "http://localhost:5173/survey/AbCdEfGhIjKlMnOpQrStUv",
    "replayed": false
  }
}
```

### 4 X提交v1

POST `/api/v1/public/surveys/AbCdEfGhIjKlMnOpQrStUv/responses`。 `Idempotency-Key: answer-v1-example`。

请求正文：

```json
{
  "publishedVersion": 1,
  "anonymous": true,
  "answers": [
    {
      "questionId": "11111111-1111-4111-8111-111111111111",
      "type": "single",
      "optionId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2"
    },
    {
      "questionId": "22222222-2222-4222-8222-222222222222",
      "type": "number",
      "number": "20"
    }
  ]
}
```

成功响应：

```json
{
  "data": {
    "receiptId": "670000000000000000000020",
    "submittedAt": "2026-10-16T04:03:00.000Z",
    "publishedVersion": 1,
    "replayed": false
  }
}
```

提交后累计=1、当前v1=1；管理revision仍为2，提交没有偷偷增加CAS修订。

### 5 暂停

POST `/api/v1/surveys/670000000000000000000010/pause`。

请求正文：

```json
{
  "expectedRevision": 2
}
```

成功响应：

```json
{
  "data": {
    "surveyId": "670000000000000000000010",
    "status": "paused",
    "revision": 3,
    "currentPublishedVersion": 1
  }
}
```

### 6 已有答卷时修改并保存

PUT `/api/v1/surveys/670000000000000000000010/questions`。

请求正文：

```json
{
  "expectedRevision": 3,
  "questions": [
    {
      "id": "11111111-1111-4111-8111-111111111111",
      "type": "single",
      "title": "喜欢哪种水果？",
      "required": true,
      "jumpRules": [],
      "options": [
        {
          "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
          "label": "苹果"
        },
        {
          "id": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
          "label": "葡萄"
        }
      ]
    },
    {
      "id": "22222222-2222-4222-8222-222222222222",
      "type": "number",
      "title": "年龄",
      "required": true,
      "jumpRules": [],
      "validation": {
        "min": "0",
        "max": "100",
        "integerOnly": true
      }
    }
  ]
}
```

成功响应：

```json
{
  "data": {
    "revision": 4,
    "draftDefinitionRevision": 3,
    "hasUnpublishedChanges": true,
    "validationIssues": []
  }
}
```

仅编辑保存，没有v2快照；v1的“香蕉”和旧年龄规则完全保留。

### 7 发布v2

POST `/api/v1/surveys/670000000000000000000010/publish`。 `Publication-Key: publish-v2-example`。

请求正文：

```json
{
  "expectedRevision": 4,
  "expectedDraftDefinitionVersion": 3
}
```

成功响应：

```json
{
  "data": {
    "surveyId": "670000000000000000000010",
    "publishedVersion": 2,
    "status": "published",
    "revision": 5,
    "publishedAt": "2026-10-16T04:06:00.000Z",
    "firstPublishedAt": "2026-10-16T04:02:00.000Z",
    "shareUrl": "http://localhost:5173/survey/AbCdEfGhIjKlMnOpQrStUv",
    "replayed": false
  }
}
```

此时累计=1、当前v2=0；shareUrl和问卷id均未改变，v1答卷未删除。

### 8 查看v1统计

GET `/api/v1/surveys/670000000000000000000010/statistics?version=1`。

成功响应：

```json
{
  "data": {
    "surveyId": "670000000000000000000010",
    "selectedVersion": 1,
    "latestPublishedVersion": 2,
    "cumulativeResponseCount": 1,
    "currentVersionResponseCount": 0,
    "selectedVersionResponseCount": 1,
    "generatedAt": "2026-10-16T04:07:00.000Z",
    "questionSummaries": [
      {
        "questionId": "11111111-1111-4111-8111-111111111111",
        "type": "single",
        "title": "喜欢哪种水果？",
        "answeredCount": 1,
        "optionCounts": [
          {
            "optionId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1",
            "label": "苹果",
            "count": 0
          },
          {
            "optionId": "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa2",
            "label": "香蕉",
            "count": 1
          }
        ]
      },
      {
        "questionId": "22222222-2222-4222-8222-222222222222",
        "type": "number",
        "title": "年龄",
        "answeredCount": 1,
        "average": "20"
      }
    ]
  }
}
```

### 9 两种旧版本请求必须区分

发布v2后：X使用`answer-v1-example`和步骤4原body重放，200返回原receipt、publishedVersion=1、replayed=true，计数仍1/0；不是接受一份新的v1答卷。其他账号使用新key发送v1，409 SURVEY_VERSION_CHANGED并提示重载。X用新key发送v2且allowRepeat=false，409 ALREADY_SUBMITTED；新版本不解除整问卷限填一次。

### 10 修订与计数核对

| 操作后 | revision | 编辑修订 | 最新发布号 | 累计份数 | 当前版本份数 |
| --- | --- | --- | --- | --- | --- |
| 创建 | 0 | 1 | null | 0 | 0 |
| 保存题目 | 1 | 2 | null | 0 | 0 |
| 发布v1 | 2 | 2 | 1 | 0 | 0 |
| 提交v1 | 2 | 2 | 1 | 1 | 1 |
| 暂停 | 3 | 2 | 1 | 1 | 1 |
| 修改保存 | 4 | 3 | 1 | 1 | 1 |
| 发布v2 | 5 | 3 | 2 | 1 | 0 |
| v1成功重放 | 5 | 3 | 2 | 1 | 0 |

查看v1时selectedVersionResponseCount=1，但currentVersionResponseCount=0；v1仍显示“香蕉”、年龄平均20。查看v2只读“葡萄”与新校验定义，未收答卷时选项0、均值null，不把v1结果带过去。

## 2026-10-17 前端交互与分享地址补充

本轮未新增/修改业务接口、请求字段、答卷或发布版本结构。填写页每页最多10道当前路径题目，原始题号不随分页重排；翻页校验与答案清理属于前端交互，F02仍重新计算完整路径最终校验，不能信任客户端页码或路径。预览的分页浏览/模拟填写均无提交 API 调用。

V01 的 shareUrl 使用 PUBLIC_APP_URL（旧配置缺省时使用 APP_ORIGIN），二者必须相同且为完整 HTTP(S) Origin；页面复制链接使用同一配置，不再根据浏览器当前地址推测。`GET /app-config.js` 是非业务的公开运行配置脚本资产，仅包含 publicAppUrl，不暴露环境变量全集、数据库地址或密钥。Vite与构建后的同源服务都提供此资产；配置、Origin与部署边界见[部署说明](deployment.md)。现有严格 Origin/X-CSRF-Guard 检查不变。

图表取消自定义 palette 和 itemStyle 色彩覆盖，采用 ECharts 默认系列配色；饼图标签不使用 ECharts 自行四舍五入的 percent，而与表格、提示共用 count/answeredCount 的至多一位小数结果。已有数字均值开关及计算/显示范围保持不变。

[← 返回项目总 README](../README.md)


## W02-B基础实现说明（2026-10-23）

本轮仅实现内部回执编解码、固定scope/hash、事务和owner来源组合，未注册P2新增HTTP端点，不把上方36条目标接口标成上线。完整data+replayed及首次/重放状态已在内部测试验证；现有HTTP、错误合同和Publication-Key/提交幂等保持。内部未支持来源写返回SOURCE_WRITE_NOT_IMPLEMENTED，仅用于服务器组合边界，不宣布新增公开HTTP错误/路由。见[W02-B实现与证据](phase2/bindings-receipts-foundation.md)。


2026-10-25列表到期展示修正：SurveySummary新增expiresAt（未设置为null），列表结合时间显示已截止；持久化status枚举不增加expired。页面定时更新截止标记，不修改数据库状态、历史快照或答卷。旧客户端可忽略该新增字段。
