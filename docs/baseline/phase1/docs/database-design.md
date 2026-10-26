# 第一阶段 MongoDB Schema 设计

[← 返回项目总 README](../README.md)

状态更新：2026-10-19。第一阶段核心功能已实现，代码、技术文档、AI材料及对应测试证据已推送GitHub。当前运行方式和功能范围以[项目README](../README.md)为准；本文件保留各阶段设计与验证背景，未执行的迁移、数据库角色及部署验证不标为完成。


设计日期：2026-10-15，按本轮正式修改规则修订。依据：requirements.md R01—R29、decisions.md 当前 D06 与 D13—D18。目标为三核心集合加 survey_versions；本文说明现行四集合Schema；init-schema.js保留为旧三集合脚本，不作为新版初始化入口。1.0.0已在专用库实现四集合验证器、索引及账号/草稿/Q04/Q05编辑业务，新入口为npm run db:init（apps/api/src/database/）；第一阶段发布/答卷/统计已实现，未知旧库迁移尚未执行，不能仅运行旧脚本得到下述能力。详见[实现边界](implementation-verification.md)。

## 1 集合与关系

| 集合 | 一份文档代表什么 | 关系 |
| --- | --- | --- |
| users | 一个账号 | 一名用户可创建多份问卷，也可提交多份答卷 |
| surveys | 问卷身份、收集状态、待编辑定义及当前发布指针 | ownerId 引用 users._id；内嵌待编辑 questions，currentPublishedVersion 指向发布快照 |
| responses | 一次成功提交 | surveyId + surveyDefinitionVersion 引用对应发布快照；respondentId 内部引用 users._id |
| survey_versions | 一次不可变发布快照 | (surveyId,version) 唯一；深拷贝标题、说明、完整题目与策略事实 |

题目整体嵌入编辑定义和各自发布快照；公开填写只读取发布快照，管理编辑只改 surveys。历史版本独立文档，避免将全部版本追加到同一问卷；版本间重复定义是保护历史语义所需的有意冗余。答卷独立存储，不随重新发布删除。MongoDB 单文档有 16 MiB 限制，发布前必须检查文档大小并设置合理题数和文本长度上限；不能无限制嵌入。

这不是说关系数据库不能完成问卷系统。本项目采用 MongoDB，是课程要求，也利用了不同题型可有不同字段和问卷整体原子更新的特点。代价是引用完整性、跨文档业务校验和统计需要显式设计。

暂不建立 questions、options、statistics 集合，不存未经需要的统计冗余；统计从 responses 聚合得到。草稿答卷、登录会话如后续实现，可增加独立集合，避免将半成品混入已提交统计。

## 2 类型和通用约定

- 集合文档主键及跨集合引用使用 ObjectId；题目、选项、规则 ID 使用稳定字符串（后端可生成 UUID），不能使用会变化的显示题号。
- questions 数组顺序就是显示顺序；jumpRules 数组顺序就是优先级。不重复保存 order/priority，避免两种顺序冲突。
- 时间使用 BSON Date，存储统一时刻，页面按 Asia/Shanghai 显示；不存“2026年10月15日”这样的日期字符串。
- 业务数值及数字规则统一用 BSON Decimal128，包括整数，保证手机号等数值不被 32 位整数截断。整数性由 integerOnly 控制，后端使用十进制计算验证，不通过截断或四舍五入把小数变合法。
- 计数、版本使用 BSON int 或 long。users 继续 schemaVersion=1；目标 surveys 与新写 responses 为 2，survey_versions 初始为 1，迁移期明确兼容旧 1。业务发布号与 schemaVersion 不同；初始化脚本不填默认值，默认值由后端构造。
- 基础字符串字段非空；用户名、题干等还需后端去除不合法空白及限制长度。下面未列为可选的字段均为必填。
- 现有旧验证器拒绝未知字段；本轮目标字段及第二阶段新增字段都要经过显式迁移更新验证器。MongoDB 可演化，不等于可以随意写入任意字段。

## 3 users 字段

| 字段 | BSON 类型 | 含义与规则 |
| --- | --- | --- |
| _id | ObjectId | 用户主键 |
| schemaVersion | 数字，值为 1 | 文档结构版本 |
| username | string | 用户名显示值 |
| usernameKey | string | 登录唯一键；建议 NFKC 规范化、首尾去空白、统一大小写后生成，注册和登录用同一算法 |
| passwordHash | string | 密码哈希，保存算法参数与盐对应的编码结果；不保存明文密码 |
| createdAt / updatedAt | date | 创建与最后修改时间 |

usernameKey 由后端生成，唯一索引防止并发注册重名。用户接口不返回 passwordHash。示例用户名规范化只是展示，后端实现必须统一。

## 4 surveys 字段

保留现有集合及其字段，仅新增发布指针与当前版计数；所有已有 ID、publicId 和答卷关联不删除。目标 schemaVersion=2 与旧版兼容的升级流程见 [迁移计划](versioning-change-plan.md#6-非破坏性迁移计划)。

| 字段 | BSON 类型 | 当前目标含义与迁移 |
| --- | --- | --- |
| _id / ownerId / publicId | ObjectId / ObjectId / string | 问卷身份、创建者和唯一分享标识；重新发布全部保留 |
| schemaVersion | int，值 2 | 文档格式；旧值1在迁移期兼容，不能与发布号混用 |
| title / description | string | 待编辑标题和说明，填写和历史展示改从快照取 |
| questions | array | 待编辑完整题目定义；已有答卷时暂停也可改，不直接覆盖快照 |
| status | string | draft/published/paused/closed；沿用状态，不把保存草稿当发布 |
| allowAnonymous / allowRepeat | bool | 原匿名和重复策略，默认false；首次发布后保持冻结，不扩展修改能力 |
| expiresAt | date 或 null | 当前收集截止，运行配置，不借此覆盖旧题目定义 |
| definitionVersion | int/long，至少1 | 保留旧字段为待编辑定义修订号；成功改变标题/说明/题目内容的保存递增，不是发布编号 |
| revision | int/long，非负 | 管理 CAS，保存、暂停、发布、关闭等管理变更递增 |
| currentPublishedVersion | int/long 或 null，新增 | 当前/最后一次成功发布号；初始null，只有正式发布切换，暂停保存不变 |
| currentVersionSubmissionCount | int/long，非负，新增 | 当前指针对应版答卷计数，初始0；发布切换归零，成功新答卷递增，编辑/暂停/重试不改 |
| submissionCount | int/long，非负 | 累计所有版本成功答卷数，保持旧含义，发布不清零 |
| structureLocked | bool，legacy | 原有值保留，仅作兼容历史；新应用不据此判编辑资格，不再因提交设true；新文档可保留false占位 |
| copiedFromId | ObjectId 或 null | 保留复制来源字段；复制功能现在可选，非新版本关系 |
| firstPublishedAt | date 或 null | 首次发布时间保留，不因重发覆盖；新快照各有publishedAt |
| createdAt / updatedAt | date | 保留创建与管理修改时间 |

编辑资格：owner正确、status为draft/paused、预期revision正确；删除 submissionCount=0 和 structureLocked=false 作为准入条件。这里的“删除”指取消旧业务谓词，不删除数据库字段或数据。published 不允许直接改定义，须先暂停；暂停后允许多次保存，正式重发沿用同ID/链接。

匿名“允许选择”及默认值沿用旧方案；本轮不增加策略切换能力。禁止重复仍按整份问卷跨版本限一次。新字段尚未进入现有严格验证器，后续必须先迁移后写入。

## 5 questions 题目结构

共同必填字段：id、type、title、required、jumpRules。type 为 single、multiple、text、number。jumpRules 无规则时用空数组。基础四种题型都可设 required。

| type | 特有字段 | 限制 |
| --- | --- | --- |
| single | options: [{id, label}] | 至少两个选项；答案为一个选项 ID |
| multiple | options、validation | validation.minChoices / maxChoices 可选非负整数；恰好选 N 个用 minChoices=maxChoices=N |
| text | validation | minLength / maxLength 可选非负整数 |
| number | validation | min / max 可选 Decimal128，integerOnly 必填 bool |

当前Q04/Q05已实现题目编辑保存，见[编辑验证](editor-verification.md)；本轮不修改现有验证器、不迁移旧库。

后端保存或发布前检查：题目 ID 唯一、各题选项 ID 唯一、规则 ID 唯一；最小限制不大于最大限制；选择数量不超过选项数。唯一多键索引不能代替这些数组内的 ID 唯一校验。

可选题为空时不执行内容限制，提交中不存空答案；数值 0 不算空。文本以去除首尾空白后是否为空判空，非空文本保留其原始内容，以 Unicode 码点计长度；前后端采用一致口径。空数组为未回答。必答的多选至少选一个，即使未设置 minChoices。年龄示例使用整数且 0—120；手机号示例按用户决定启用整数校验，不额外暗加手机号位数或运营商规则。其他数字题仍可允许小数。

## 6 jumpRules 跳转结构

每条规则保存 id、condition、targetQuestionId。条件中的答案来源固定为当前题，不需要再保存 sourceQuestionId。

| 适用题型 | condition 示例 | 解释 |
| --- | --- | --- |
| single | {op: "eq", optionId: "no"} | 单选答案等于 no |
| multiple | {op: "containsAny", optionIds: ["a", "b"]} | 至少包含 a、b 中的一个 |
| multiple | {op: "containsAll", optionIds: ["a", "b"]} | 同时包含 a 和 b，允许还选其他项 |
| number | {op: "gte", number: Decimal128("18")} | 大于等于 18；还支持 eq、lt、lte、gt |

文本题的 jumpRules 必须为空；本版不实现文本跳转。规则按数组顺序执行，第一条满足即确定下一题；未命中或可选题未回答，进入下一题。仅允许目标位于当前题后面，最后一道题之后进入提交页面，不用伪造结束题 ID。

数据库验证器检查规则对象形状；后端拒绝不适用的运算符及空条件集合。按现行API，保存草稿时检查选项/目标引用和向后关系并以validationIssues反馈，形状合法的失效引用允许保存；正式发布前须全部修复（发布接口已实现，并在发布前执行完整检查）。规则使用受控运算符解释，不能把用户配置当作 JavaScript、eval 或任意 MongoDB 查询执行。

## 7 responses 字段

| 字段 | BSON 类型 | 含义 |
| --- | --- | --- |
| _id / surveyId | ObjectId | 答卷 ID、问卷 ID |
| schemaVersion | 数字，旧1/新2 | 旧答卷保留，新格式显式增加hash算法版本 |
| surveyDefinitionVersion | int/long，至少1 | 关联survey_versions.version；新提交须等于currentPublishedVersion；已成功旧请求重放使用原值，旧迁移号不重写 |
| respondentId | ObjectId | 从登录会话取得，内部保存，不能相信前端传来的用户 ID |
| anonymous | bool | 本次是否匿名；问卷不允许匿名时只能为 false |
| repeatAllowed | bool | 后端复制问卷 allowRepeat，用于部分唯一索引；不能由客户端决定 |
| requestId | string | 一次提交操作的幂等 ID；网络重试复用，主动重新填写另建 ID |
| payloadHash | string | 后端规范化发布号、匿名与有效答案后的SHA-256；旧hash不覆盖，旧算法兼容需审计 |
| payloadHashVersion | int，新增新格式值2 | 标识规范化算法，旧答卷缺失时走已核实的legacy算法；不能直接当2 |
| answers | array | 最终路径中的非空有效回答 |
| submittedAt | date | 后端接受本次提交时的服务器时间 |

answers 的四种互斥形状如下，不使用一个任意类型的 value 字段：

```javascript
{questionId: "q1", type: "single", optionId: "no"}
{questionId: "q3", type: "multiple", optionIds: ["basketball", "swim"]}
{questionId: "q4", type: "text", text: "建议适当增加晚间活动的开放场次"}
{questionId: "q5", type: "number", number: NumberDecimal("17")}
```

所有题目解释、校验、路径和hash规范化使用答卷关联的发布快照，不能使用surveys.questions当前编辑区。单题至多一个答案；多选 optionIds 不重复。answers 按最终路径顺序规范化；多选集合按固定选项顺序规范化后再算 hash，防止集合排列不同产生不同摘要。被跳过及改答后失效分支不存储；后端须先拒绝未知题目、非法类型和选项，再重算路径并剔除合法但失效的旧分支答案。

匿名性是接口授权规则，不是 MongoDB 自带的字段隐私。创建者查询必须先验证 surveys.ownerId，再用该答卷版本读取快照并按白名单输出答卷；匿名时不得输出 respondentId、requestId、payloadHash，或其他能关联账号的字段。不可直接返回完整 MongoDB 文档，不能靠前端隐藏。公开填写接口也只能输出问卷定义，不输出答卷。

## 8 索引

| 集合 | 索引键 | 用途 |
| --- | --- | --- |
| users | usernameKey，unique | 注册及登录唯一键 |
| surveys | publicId，unique | 分享链接定位 |
| surveys | ownerId, createdAt desc, _id desc | 当前用户问卷列表和稳定分页 |
| responses | surveyId, submittedAt desc, _id desc | 问卷答卷分页，支持按 surveyId 聚合 |
| responses | surveyId, respondentId，unique，部分条件 repeatAllowed=false | 保留原索引，跨所有发布版本限一次，包括匿名；不加版本键 |
| responses | surveyId, respondentId, requestId，unique | 保留原索引，跨版本识别同一次提交；不加版本键 |
| survey_versions | surveyId, version，unique，新增 | 每问卷发布编号唯一，同时支持历史列表按version排序 |
| survey_versions | surveyId, publicationRequestId，unique，部分条件字段为string，新增 | 新发布请求去重；没有原请求记录的迁移快照不伪造key |
| responses | surveyId, surveyDefinitionVersion, submittedAt desc, _id desc，新增 | 所选版本统计与答卷分页；原按surveyId索引先保留 |

部分唯一索引仅约束满足筛选条件的文档。因此 repeatAllowed 必填，并须在后端从问卷复制且发布后锁定策略。它不自动证明问卷与答卷两处的值相同。每个集合自带 _id 唯一索引，不再重复建。

不对正式答卷建 TTL 索引，不通过截止时间删除问卷或答卷。过期只是禁止新的提交，历史数据和统计保留。

## 9 状态与并发提交

状态沿用 draft→published、published→paused/closed、paused→published/closed。closed终态仍为此前技术建议，本轮不扩展重开。暂停编辑已有答卷现在正式允许；原“首次提交后永久锁定结构”仅作为废止历史，不再进入当前准入条件。

保存只更新编辑区和修订号；显式发布以事务插入新survey_versions快照并切换currentPublishedVersion，累计计数不变、当前版计数归零。即使定义未变化，新的显式重发也生成新号；同次发布请求重试通过publicationRequestId返回原结果，不增版本。完整流程见[版本变更计划第3节](versioning-change-plan.md#3-原子发布与不可变性)。

新提交先查已成功幂等记录；存在时用其原快照及hash算法核验，原版本同内容返回原回执，不受暂停/截止/重发影响，计数不变。无记录才要求status=published、请求publishedVersion等于当前指针、未截止，并从当前快照验证最终路径。

在同一事务中，条件匹配_id/revision/currentPublishedVersion/status及数据库$$NOW截止边界，实际更新surveys的累计与当前计数，再插入responses，surveyDefinitionVersion由后端确定。快照本身不更新，不写structureLocked永久锁。事务失败所有写入回滚，重复键区分幂等/策略/冲突。

暂停、发布与提交写同一问卷，确保并发切换可检测；编辑保存只在draft/paused做CAS，不要求零答卷。数据库仍需副本集及snapshot/majority事务；单节点副本集适合课程规模但不提供高可用。同问卷计数写竞争的代价沿用原设计。

新旧版本竞态和截止仍以服务器接受操作为边界，可能先被接受的旧版事务稍后完成；暂停/切换成功后新接受请求不得绕过状态/指针检查。细则、错误码和幂等重放见[版本变更计划第4节](versioning-change-plan.md#4-提交幂等与旧版本拒绝)。

## 10 统计口径和示例查询

先验证owner；省略version时固定本次请求的currentPublishedVersion为selectedVersion，明确传回后续分页。按surveyId + surveyDefinitionVersion过滤responses，从对应survey_versions读取题目/选项并补0，不从编辑区或其他版本补题。

单选按该版实际答题份数；多选按选择次数；文本/数字原文按所选版分页；数字平均只含实际数值，0有效，无答案为null。重复允许时每份成功主动提交分别计入，幂等重试不新增。不合并不同版本的题目、选项或均值，不增加去重人数。

返回cumulativeResponseCount（整份问卷累计）、currentVersionResponseCount（当前发布指针版本）、selectedVersionResponseCount（当前查看版本）并带latestPublishedVersion/selectedVersion。累计只是总份数，不是跨版本题目合并统计；维护计数与实际responses核对。

```javascript
// 后端已核对owner，并固定所选发布号；这里的7只是历史版本示例，不是草稿修订号。
db.responses.aggregate([
  {$match: {surveyId: ObjectId("670000000000000000000010"), surveyDefinitionVersion: 7}},
  {$unwind: "$answers"},
  {$match: {"answers.questionId": "q5", "answers.type": "number"}},
  {$group: {_id: null, answeredCount: {$sum: 1}, average: {$avg: "$answers.number"}}}
]);
```

暂停时默认最后发布版；未发布改动不进入统计。多页游标绑定surveyId/version/questionId；统计请求跨指针/答卷/计数读取建议使用只读snapshot事务保持一致，不以最新指针重解释上一页。详见[版本变更计划第5节](versioning-change-plan.md#5-历史读取统计与计数)。

## 11 脚本与验证边界

> 当前新版入口：npm run db:init。只接受全新或验证器一致的专用库，不覆盖旧验证器、不迁移未知旧库。新版snapshot验证器暂仅支持新publication，legacyMigration及迁移仍待落实；历史脚本和历史12项记录保留。

- `database/init-schema.js`：mongosh 初始化三个集合的严格验证器和索引，不插入数据，不删除或覆盖已有数据；已存在但验证器不同则报错，要求迁移。
- `database/examples.js`：所有基础题型和三类跳转的完整 BSON 示例，只定义变量，不自动入库；密码与 hash 为明确占位符，不能用于真实登录或真实幂等校验。
- `database/verify-schema.js`：只接受名称以 survey_schema_check_ 开头的空数据库，验证字段、类型、重复限制、幂等索引和数字聚合。测试样例保留供查看，不清库。

以下命令仅初始化现存旧三集合，不包含survey_versions和新增字段；在新设计下不得把其成功当成新版就绪。当前新版初始化入口已实现为`npm run db:init`；独立migration-002及未知旧库迁移仍未落实，不要直接以旧脚本覆盖新验证器。旧格式检查的用法保留供复核：

```powershell
mongosh 'mongodb://127.0.0.1:27017/survey_project' --file database/init-schema.js
```

Schema 验证器不会自动实现外键、所有权、题目引用、规则方向、状态迁移、字段不可变性、跨集合快照一致性或按题配置校验。后端必须落实第 5—9 节；初始化完成不等于完成业务功能。

## 12 第二阶段演化

同链接发布版本已从“未来可选”提前成为本阶段正式需求，不再延后。schemaVersion是存储格式；definitionVersion保留为编辑修订；currentPublishedVersion及responses.surveyDefinitionVersion是发布号；revision是管理并发版本。

本轮只设计、不执行迁移。保留三个核心集合，增量增加survey_versions和指针/计数/算法版本字段；现有脚本及历史12项记录保持原文。迁移不得删库、删除旧字段、重写旧答案或把所有旧版本强改为1。旧不可恢复定义需从备份/发布存档找回，无法证实时阻断切换，不编造快照。详细[迁移门禁](versioning-change-plan.md#6-非破坏性迁移计划)是下一轮准备工作。

第二阶段继续在该结构上扩展更多题型或功能，策略切换、跨版合并、改答和重开仍不在此次范围；先写变更与兼容方案，保留旧版本与回归证据。

## 13 survey_versions 字段

新库已经按该结构保存发布快照；一个文档是一份完整不可变发布快照。

| 字段 | BSON 类型 | 规则 |
| --- | --- | --- |
| _id / surveyId | ObjectId | 自身ID、所属问卷ID |
| schemaVersion | int，1 | 版本文档存储格式，不是业务发布号 |
| version | int/long，至少1 | 问卷内唯一发布号；新问卷1起，历史映射可有间隙 |
| sourceDefinitionVersion | int/long，至少1 | 本次发布所用surveys.definitionVersion编辑修订，不能用来替代version |
| definition | object | 深拷贝title、description、完整questions；题型/选项/校验/规则形状沿用第5—6节 |
| policySnapshot | object | allowAnonymous、allowRepeat发布事实，沿用冻结策略，后端检查与问卷一致 |
| definitionHash | string，SHA-256 | 规范化完整定义与策略的摘要，辅助完整性检查，不替代权限 |
| publishedAt | date；仅legacy可null | 新发布必填真实服务器发布时间；旧来源未知不能伪造当前时间 |
| publishedBy | ObjectId；仅legacy可null | 新发布创建者身份，管理审计字段不通过公开填写返回 |
| publicationRequestId / publicationRequestHash | string | 新发布必填key与操作前提摘要；已成功同次发布重试返回原结果；legacy无原请求时可缺省 |
| origin | object | 新发布kind=publication；迁移kind=legacyMigration并记录证据来源、migratedAt及缺失项，严格验证器区分两种形状 |

不存会变的submissionCount，不在发布后改题、改策略或更新快照计数。不提供普通应用的update/delete版本方法；数据库角色正常仅find/insert，验证器本身无法保证时间上的不可变。发布事务保证插快照和更新指针一起完成，历史答卷引用缺失时报错，不能自动套用最新定义。

## 官方依据

- [MongoDB JSON Schema 验证](https://www.mongodb.com/docs/manual/reference/operator/query/jsonschema/)：对象结构、类型、oneOf 与 BSON 类型支持。
- [MongoDB 部分索引与唯一约束](https://www.mongodb.com/docs/manual/core/index-partial/)：唯一约束只作用于匹配部分筛选条件的文档。
- [MongoDB 事务](https://www.mongodb.com/docs/manual/core/transactions/)：多文档原子性及部署要求。
- [MongoDB 文档大小限制](https://www.mongodb.com/docs/manual/reference/limits/#bson-document-size)：16 MiB 限制。

[← 返回项目总 README](../README.md)
