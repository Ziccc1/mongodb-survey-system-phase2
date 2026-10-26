# 问卷发布版本设计变更与迁移计划

状态更新：2026-10-19。第一阶段核心功能已实现，代码、技术文档、AI材料及对应测试证据已推送GitHub。当前运行方式和功能范围以[项目README](../README.md)为准；本文件保留各阶段设计与验证背景，未执行的迁移、数据库角色及部署验证不标为完成。

日期：2026-10-15。关联正式决定：D06 修订、D13—D18；关联新增需求：R22—R29。当前实施状态：四集合初始化、账号/草稿、题目编辑、发布版本、提交与分版本统计已完成，实际证据见[正式测试用例](testing/submission-test-cases.md)。未知旧库迁移仍未执行；后文保留原设计步骤，不将迁移计划写成已完成。本文件替代“首次提交后永久锁定结构”的现行设计用途，不改写历史测试或旧 AI 日志。

## 1 正式变化与技术选择

用户明确决定：暂停后即使有答卷也可编辑；同 ID 同链接重新发布；不可变发布版本；答卷关联提交版本；统计分版本、默认最新且不合并；区分累计与当前版本份数；暂停拒绝新提交、旧版本新提交拒绝、成功幂等重试保留；复制改为可选；匿名与重复策略不扩展。

推荐新增 survey_versions，保留 users、surveys、responses。嵌入全部历史版本会持续撑大 surveys；按发布独立存文档便于唯一键、历史读取及权限隔离，代价是发布和提交须使用事务，历史查询多一次版本读取。字段字典见[数据库设计](database-design.md)，本文件重点描述流程和迁移。

技术细节由 AI 提出，不冒充用户逐项指定：每次显式从 draft/paused 成功发布生成一个新版本，即使内容相同；正常新问卷从 1 编号，失败不消耗号，历史迁移允许保留编号间隙。发布请求使用独立幂等 key，重试同一次发布不新建版本；已经 published 时用新 key 再发布返回状态冲突，先暂停才能再发布。

重复限制不改为每版本一次。allowRepeat=false 时仍按整份 surveyId + respondentId 限一份，发布 v2 不解锁已经提交过 v1 的账号。匿名仍内部关联、对创建者隐藏；allowAnonymous/allowRepeat 首次发布后沿用原设计锁定，不提供切换接口。

## 2 草稿与发布版本的分工

| 数据 | 唯一维护位置 | 谁读取 |
| --- | --- | --- |
| 待编辑标题、说明、题目、选项、校验、跳转 | surveys.title/description/questions | 管理编辑、草稿预览、下一次发布 |
| 当前发布版本编号 | surveys.currentPublishedVersion，首次发布前 null | 填写入口、默认统计、提交接受检查 |
| 不可变的每次发布定义 | survey_versions 的 (surveyId, version) | 当前填写、历史答卷解释、选定版本统计 |
| 答卷实际归属 | responses.surveyId + surveyDefinitionVersion | 历史读取、版本过滤、幂等重放 |

surveys.questions 明确作为待编辑题目，不能替代发布快照。surveys.status 是收集状态，不等于有没有编辑内容。首次发布前为 draft；暂停后仍为 paused，管理端可反复保存编辑内容。currentPublishedVersion 在编辑保存期间继续指向最后一次成功发布，不随着保存变化，也不设 null；未发布的改动不出现在填写定义或统计标签中。

区分创建者的“编辑草稿”与填写者可选的“未提交答卷草稿”：前者是此次必需的定义编辑区，后者仍是 D08 的可选功能。不要因 D08 可选而取消编辑保存。

现有 definitionVersion 保留为可编辑定义的修订号（旧字段名不再作为发布版本 API 名称）；有实际标题/说明/题目定义变化的保存才递增。revision 仍用于管理并发 CAS。发布快照记录 sourceDefinitionVersion 便于追溯来自哪次保存；显示未发布改动可比较快照的 sourceDefinitionVersion/definitionHash 与当前编辑内容。

保存编辑内容仅要求 owner、status 为 draft/paused、预期 revision 正确，不检查 submissionCount=0，不检查 structureLocked=false；不会插入 survey_versions，不分配发布编号，不更新发布指针或版本答卷计数。发布中状态仍为 published，必须先暂停再修改定义。截止时间是问卷的运行配置，不属于历史题目定义，仍可独立设置。

### 示例时间线

1. 编辑保存 A、B、C：definitionVersion 增长，发布版本仍为 null。
2. 正式发布：插入 v1，指针为 1；随后收 2 份答卷，累计/当前均为 2。
3. 暂停、修改并保存两次：v1 字节内容不变，指针仍为 1，累计/当前仍为 2；暂停不接收新的提交。
4. 正式重新发布：插入 v2，原 surveyId/publicId 不变；累计仍为 2，当前变 0。
5. v2 收 1 份答卷：累计 3、当前 1；查看 v1 得 2、查看 v2 得 1。v1 成功请求重试仍返回原回执，不增加任一计数。

## 3 原子发布与不可变性

发布接口接收 expectedRevision、expectedDraftDefinitionVersion 与 Publication-Key。请求指纹只基于这些客户端本次操作前提及固定操作类型，不根据重试时已变化的当前草稿重新计算。

先以 (surveyId, publicationRequestId) 查成功发布记录：同指纹返回原发布结果并注明replayed，即使随后已暂停或又发布了其他版本，不自动再次切换状态或指针；同 key 异指纹返回 PUBLICATION_IDEMPOTENCY_CONFLICT。重放的是历史发布回执，当前管理状态另行GET刷新，前端不能拿旧回执的status/revision覆盖当前状态。无记录才执行新发布。

在副本集事务中：核对创建者、draft/paused 状态、两个预期修订号、当前截止时间与政策锁定；验证编辑定义及规则；从 currentPublishedVersion（首次为 null）分配下一号并与历史最大号核对；深拷贝定义及策略事实，插入不可变快照；对 surveys 做带 _id/ownerId/status/revision/旧指针条件的实际更新，设置新指针、published、currentVersionSubmissionCount=0、revision+1，并仅首次设置 firstPublishedAt。全部提交或全部回滚。

同一问卷两人并发发布，问卷写冲突与 (surveyId,version) 唯一索引只允许一项成功；另一项返回版本/编辑冲突，不自动发布未经用户确认的新草稿。快照和指针不会只保存一半。对同一 Publication-Key 的提交结果未知，继续用原 key 确认；不要自动换 key 产生第二个版本。

快照只保存定义与审计信息，不存会递增的答卷数，不通过更新快照计数破坏不可变性。正常应用账户对 survey_versions 只授予 find/insert，不授予 update/remove；维护账户受控使用。验证器只检查结构，不能自动知道“插入后不得修改”，因此还需仓储接口不提供修改/删除方法、权限配置和测试。定义 hash 用于核查完整性，不替代权限与事务。

## 4 提交、幂等与旧版本拒绝

新填写入口先读问卷指针，再读取对应快照，返回 publishedVersion，不再用可编辑 definitionVersion 代表发布编号。新提交 body 为 publishedVersion、anonymous、answers，Idempotency-Key 映射现有 requestId；客户端不可指定 respondentId、repeatAllowed 或写入的版本字段。

1. 认证后，优先按原唯一键 (surveyId, respondentId, requestId) 查成功答卷，不能先用当前状态/最新题目拒绝。
2. 已存在时，读取该答卷 surveyDefinitionVersion 对应的快照，按其历史题目、选项、校验和原 hash 算法规范化请求。必须带原 publishedVersion；同 key 改版本、改匿名或改内容均冲突。同内容返回原 receiptId、submittedAt、publishedVersion，replayed=true；暂停、关闭、过期或已发布新版本不影响这一成功重放。不读取现行草稿解释旧答卷。
3. 不存在时才检查新提交资格：status 必须 published，未截止，publishedVersion 等于 currentPublishedVersion；暂停返回 SURVEY_PAUSED，重新发布后的旧号返回 SURVEY_VERSION_CHANGED（409，含 expectedPublishedVersion 和 reloadRequired=true）。历史快照存在不代表它可接收新答卷。
4. 在事务内读问卷和当前快照，完整验证最终路径；按该快照的策略事实构造 anonymous/repeatAllowed，并检查与冻结的问卷策略一致；实际更新问卷须匹配 status、revision、指针及截止时间，递增 submissionCount 与 currentVersionSubmissionCount；随后插入答卷，关联该 publishedVersion。事务内计数与答卷一起提交或回滚，不再设置永久结构锁。
5. 正常重复填写唯一索引保持跨版本作用域。幂等唯一索引也不增加版本维度；同 key 改版本不能偷偷成为一次新操作。驱动重试与重复键处理仍按原方案区分成功重放、重复填写和内容冲突。

若暂停/重新发布与提交竞态：两者写同一问卷。先完成的有效提交归旧版本并保留；暂停成功返回后新的接受操作不能越过 status 条件；发布切换后的请求不能以旧指针写入。事务实际完成可能晚于接受边界，沿用既有截止语义，不能用客户端点击时间决定归属。

## 5 历史读取、统计与计数

创建者读取历史答卷：先 owner 验权，再按答卷版本加载快照，将答案映射到当时的标题/选项；即使同一个 questionId 在 v2 改过文字或选项，v1 仍按 v1 解释。快照缺失必须报 VERSION_DEFINITION_UNAVAILABLE，不能静默套最新题目。匿名字段仍按原白名单过滤，不能在历史接口恢复内部账号。

统计请求先解析 version；未指定时，在请求起点把最新 currentPublishedVersion 固定为 selectedVersion，后续所有题目、答案、游标和输出都绑定该版本。没有发布过时返回 NO_PUBLISHED_VERSION/明确空态，不把编辑草稿当一个可统计版本。暂停期间默认仍是最后发布版，而不是编辑内容。

汇总及原文分页均以 {surveyId, surveyDefinitionVersion:selectedVersion} 过滤。返回 selectedVersion、latestPublishedVersion、selectedVersionResponseCount、currentVersionResponseCount、cumulativeResponseCount，前端分别标注“所选版本”“当前发布版本”“累计答卷”；不做跨版本题目合并，不输出去重人数。累计只是份数总计，不是跨版本合并统计。所选版本可能是历史版本，其份数不等于当前版本份数。

不同请求和分页间可以有新提交/发布，返回值注明生成时刻；同一次统计中的指针、选定版本及累计/当前计数建议使用 snapshot 只读事务取得一致快照，避免新指针配旧计数。游标签名绑定 surveyId、selectedVersion、questionId 和排序点；后续页必须显式传回该版本，不能重新默认到新发布版。不增加去重人数查询或跨版本题目聚合接口。

surveys.submissionCount 保持累计含义，新增 currentVersionSubmissionCount 只对应当前指针。发布切换重置后者，暂停/编辑保存/重试不重置；历史版本数量由索引过滤 countDocuments 获取，不在不可变快照累加。展示与校验以 responses 的准确计数为准，维护计数与实际不一致时报警并用审计修复，不向快照偷偷写字段。

## 6 非破坏性迁移计划

本轮不执行迁移、不修改脚本或数据库。后续先盘点真实运行库、备份并演练恢复；不能把现有 examples.js 的密码/hash 占位数据当真实业务数据。

### 6.1 字段与索引策略

字段变更详表见[数据库设计第 4 节](database-design.md#4-surveys-字段)与第 7—8 节：users 不变；surveys 增加 currentPublishedVersion/currentVersionSubmissionCount 并升 schemaVersion=2；保留 definitionVersion、structureLocked、submissionCount；responses 原字段保留，新写入可用 schemaVersion=2 增加 payloadHashVersion=2，老答卷不强制改格式或重算 hash；新增 survey_versions 的 schemaVersion 为 1。

structureLocked 老值逐条原样保留，仅作 legacy 信息，新应用不再读取它限制编辑，也不再因提交更新它。新建问卷保留 false 作为兼容占位。迁移不能把所有老值清成 false，更不能让旧应用继续上线执行永久锁定语义；切换期间采用维护窗口或明确版本门禁。

现有全部索引先保留；新增版本唯一索引、发布 key 部分唯一索引、responses 的按版本时间排序索引。原防重复索引不加版本，原幂等索引不加版本。不先 drop 旧索引，不依靠重建库完成迁移。

### 6.2 旧版本编号与快照恢复

旧 responses.surveyDefinitionVersion 曾引用编辑定义修订号，不能假定都等于 1，也不能把所有旧答卷重写为最新版本。迁移按每个 surveyId 盘点所有实际引用号，并从已证实的原始定义、备份或阶段一发布存档重建对应快照，保留这些数值作为兼容发布版本号；允许历史间隙。下次发布取当前历史最大号+1，新问卷仍从 1 起。

- 从未发布且无答卷：保留当前编辑定义，指针 null，当前计数 0，不凭空生成发布快照。
- 已发布且定义来源可证实：按真实原编号建立快照，设置指针；有旧答卷时仅在原锁定规则、版本值及定义一致性都得到验证后，才可用保存的定义回填。
- 暂停后曾保存未发布内容、存在多个旧定义号或快照来源缺失：当前 questions 可能不是旧发布定义，不能给每个历史号复制同一份最新 questions。保留原文档/答卷、列入待恢复清单，阻止该问卷切换至新写入流程；找回证据后再继续，不能编造历史。
- 正式 publishedAt 仅填可验证的原发布时间；迁移快照允许 publishedAt=null 并标明来源未知，另存 migratedAt。迁移时刻不是原发布时间，所有 legacy 例外在新验证器中显式区分。

旧幂等 hash 算法要盘点实际代码或存档。新 payloadHashVersion=2 将发布版本加入规范化输入；已存在答卷继续用其原算法和原 hash，不覆盖。若无法确定旧算法或只有占位 hash，先标记待核查，不把任意同 key 内容都当成功重试；需要恢复真实证据后才能声称兼容重放通过。当前项目尚无业务代码，不虚构已经存在可复用的旧服务算法。

### 6.3 执行顺序与门禁

1. 维护窗口停止业务写入，备份 users/surveys/responses 及集合选项/索引，记录旧计数与文件 hash；先在独立副本库演练。
2. 编写并审阅独立 migration-002，扩展验证器显式允许旧 schemaVersion=1 与新 schemaVersion=2；现有 additionalProperties=false 必须先扩展，不能直接写新字段。新快照集合及索引提前建立。
3. 幂等地插入有来源证据的旧快照；唯一键存在时核对内容/hash，冲突停止，绝不 replace 覆盖历史。记录映射与恢复来源。
4. 逐问卷 CAS 回填发布指针、精确累计/当前计数；不改 surveyId/publicId/答案/旧关联号/旧 hash/structureLocked 原值。不存在或歧义的版本引用是切换阻断项。
5. 校验：每份答卷恰有对应版本；版本定义可解释其答案；索引与政策一致；累计=所有版本实际份数、当前=指针版本份数；迁移前后历史原字段与答卷数量保持。
6. 新应用就绪门禁检查四集合、验证器、指针和版本索引；只对已核验问卷开放新逻辑。集成回归通过后才解除维护。迁移重跑不重复插版本、不重置已收的新答卷计数；回填必须带旧版本/迁移标记条件。
7. 回滚先停写、保留新快照与新答卷，优先修复向前；一旦出现多个发布版本，旧三集合应用不能安全降级读取。不能删除新版答卷、退回旧备份丢弃新数据，也不能把 pointer 改回去让历史混义。具体回滚/补偿脚本待下一轮设计并演练。

## 7 新增测试计划与完成条件

详细步骤、输入和期望见[版本测试计划](test-plan.md)。R22—R29对应T22—T35，原表是计划而非执行结果；核心场景已有正式用例中的实际证据，但不逐项改写原计划为通过，迁移专项仍未执行；T01—T21 在新版本读取/过滤上下文下继续回归。历史 12 项数据库检查只证明旧三集合结构，不能证明 survey_versions、发布事务或迁移通过。

重点门禁包括：保存多次不建版本、已有答卷暂停编辑、发布快照不变、同 ID 链接、历史解释、分版统计、累计/当前计数、旧版本新提交拒绝、成功幂等重试跨版本返回、发布请求幂等、并发切换/回滚、原政策不变、迁移可重跑且缺失证据不乱回填。

## 8 原实施步骤与当前落实情况

截至2026-10-19，工程、专用副本集、四集合初始化、认证API及发布/提交/统计页面已完成。下表保留原工作拆解和完成标准，不是当前待办清单；其中migration-002及未知旧库兼容验证仍待落实，数据库级快照角色仍未启用验收。

| 顺序 | 下一轮工作 | 完成标准 |
| --- | --- | --- |
| 1 | 正式目录建 Git、npm workspaces 与锁文件，延用总体设计栈 | web/api/domain 可构建，配置有示例，无密钥入库 |
| 2 | 专用单节点副本集与测试库隔离 | ready 识别副本集，跨集合事务提交/回滚真实验证 |
| 3 | 版本化领域类型和四集合验证器 v2 方案落地 | 不再用旧 definitionVersion 当发布编号；严格类型和不可变仓储边界；新增初始化与迁移分工明确 |
| 4 | migration-002 dry-run/校验与旧格式兼容测试 | 在副本数据上保留旧字段、编号、hash、份数和索引；缺失来源阻断，未触及真实库 |
| 5 | 最小认证/应用骨架与 API 契约 | 显式 publishedVersion、版本选择与错误码；不在骨架阶段宣称全部问卷业务完成 |
| 后续 | 发布、提交、统计与页面逐模块实现 | 按 T22—T35 和旧 T01—T21 给出真实执行证据，再更新交付状态 |

原设计阶段没有创建工程；后续已完成package.json、锁文件、前后端及核心业务实现。下一步仅按实际需求继续处理尚未执行的迁移、数据库权限和部署验证，不重新初始化已完成工程。单个版本指针+定义快照的方案属于 AI 技术建议；用户本轮八项行为已正式确认，不再把它们写成待确认。

## 9 技术依据

- [MongoDB 事务](https://www.mongodb.com/docs/manual/core/transactions/)用于发布快照与指针、答卷与计数的跨集合原子提交。
- [修改验证器](https://www.mongodb.com/docs/manual/core/schema-validation/update-schema-validation/)用于显式迁移新增字段；验证器不提供时间维度的插入后不可变保证。
- [部分唯一索引](https://www.mongodb.com/docs/manual/core/index-partial/)仅约束满足筛选的答卷，repeatAllowed 快照仍须后端可信构造。
- [Schema 版本演化](https://www.mongodb.com/docs/manual/data-modeling/design-patterns/data-versioning/schema-versioning/)用于区分存储格式版本与业务发布版本；本项目发布快照编号是独立设计。
