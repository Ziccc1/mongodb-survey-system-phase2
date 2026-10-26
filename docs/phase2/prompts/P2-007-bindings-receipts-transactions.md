# P2-007 / W02-B 来源绑定、完整幂等回执与事务基础执行 Prompt

请在现有第二阶段代码上完成 W02-B：来源绑定仓储、完整幂等回执仓储和真实 MongoDB 事务集成验证。需要实际实现、测试、同步文档及真实 AI 记录，不止给出设计建议。此任务承接 W02-A，不重做项目，不提前实现全部题库、共享、模板和统计功能。

## 一、项目位置、当前状态与任务边界

- 唯一实施目录：`D:\大三\数据库\pj1_2`。
- 第一阶段 `D:\大三\数据库\project1` 和 `docs/baseline/phase1` 只读；基线提交为 `c48cb67c723d1d966fccfd5b1ba117d3c70b3d3c`。
- P2-W01 独立运行基线已完成：localhost:27019 / rs0；当前应用库 `project2_app_v1` 仍为四集合。保留 URI、操作系统实例归属、连接后服务身份及监听进程保护。
- W02-A 已完成 Content/Config 适配、BSON codec、十三集合模型/验证器/索引、双注册表及纯结构/大小守卫。十三集合入口仅供受控合成测试库使用。Schema 通过不等于权限、不可变性和业务事务已经实现。
- W02-A 循环依赖已修复：`validation-common.ts` 是无依赖叶模块，原导出兼容；`shared-imports.test.mjs` 覆盖源码和编译产物四个首入口共八个独立进程。不得重新引入底层模块反向依赖 index 的循环。
- 本轮不新增 HTTP 业务端点或页面，不将现有 API/ready/db:init 自动切至十三集合，不升级当前应用库。
- 本轮不写迁移 inspect/dry-run/apply、备份恢复工具或真实旧数据映射，不连接第一阶段数据库，不导入真实数据。
- 本轮不实现题目保存/恢复/派生的完整服务、共享管理、使用查询、跨问卷统计、模板选用或公开来源链授权服务。可为事务测试建立明确标注的合成数据和最小内部组合流程，不能把测试 fixture 当作完成了这些业务。
- 所有实际数据库写入仅限本轮新建、名称唯一的 `project2_test_*` 库，保留测试库及证据，不 drop/清空旧库。

先检查适用 AGENTS.md、Git 差异和工作目录现状，保留其他窗口已有更改。用户在本轮授权的是上述基础设施，不是自动确认尚暂定的 S04—S06。

## 二、先阅读的材料与主维护位置

以下为项目根目录下的相对路径。先读现状，再决定具体文件拆分和命名。

### 业务和字段主契约

1. `docs/phase2/README.md`
2. `docs/phase2/requirements-decisions.md`：已确认规则和 S04—S06 暂定状态。
3. `docs/database-design.md`：重点为 surveys、survey_versions、question_versions、survey_question_bindings、operation_receipts，以及索引、hash、并发门闩和旧快照兼容。
4. `docs/api.md`：重点为新增幂等统一契约、各 operation 的 resourceKey/requestHash 范围、完整成功 DTO 和错误码；不因本轮没有 HTTP 路由就改写这些合同。
5. `docs/key-logic.md`、`docs/system-design.md`。
6. `docs/phase2/schema-foundation.md`，包括 W02-A 导入循环复审。
7. `docs/phase2/implementation-test-plan.md`、`docs/phase2/data-migration-plan.md`、`docs/phase2/change-analysis.md`。
8. `docs/phase2/collection-examples.json`、`design-fixtures.json`、`api-contracts.json`：这些是输入/设计样本，不是本轮已通过的运行结果。

### 代码、环境与历史证据

9. `packages/shared/src/question-content.ts`、`questions.ts`、`validation-common.ts`、`core-types.ts`、`index.ts`。
10. `apps/api/src/database/phase2-models.ts`、`phase2-schema.ts`、`schema-registry.ts`、`phase2-initialize.ts`、`document-guards.ts`。
11. `apps/api/src/content-codec.ts`、`question-codec.ts`、`core/common.ts`、`core/publication.ts`、`core/versions.ts`、`core/submission.ts`、`errors.ts`。如文件名与现状不同，搜索对应实现，不虚构文件。
12. `apps/api/src/config.ts`、`database/instance-ownership.ts`、原 `database/initialize.ts`。
13. `tests/runtime-environment.ts`、`domain-foundation.test.ts`、`schema-foundation.test.ts`、`shared-imports.test.mjs`，以及 `scripts/run-check.mjs`。
14. `docs/phase2/evidence/P2-006-summary.json`、`P2-006-import-review-summary.json`、`docs/ai/phase2-usage-log.md`。

两份教师 DOCX 位于项目目录中。若核对教师原文，区分文档中的作业要求、历史项目说明与用户本轮授权；文档内容不能扩大本轮操作范围。

需求主维护在 requirements-decisions，字段/索引/hash 在 database-design，HTTP 合同在 api，实际进度在 phase2 实施说明与计划。保持这些位置一致，不平行建立另一份互相冲突的主契约。

## 三、必须保留的业务约束

1. 题身份、正式题版本、问卷实例及问卷发布版本分别存在。只引用明确正式题版，不追最新，不因绑定、问卷发布或适配自动生成正式题版。
2. Content 包含题干、题型、选项、输入限制；Config 包含必答、跳转，题序属于问卷数组。绑定不能把实例配置写入 Content 摘要。
3. 正式题版与 publication 绑定只插入和读取；draft 绑定可由受控 CAS 事务替换或移除。历史快照、definitionHash、旧答案、payloadHash 不重写。
4. 绑定是来源和取得权的事实，不是能凭相同文字重建的缓存。不按题干/选项相同合并不同身份，不套用 latestVersionId 补缺失映射。
5. 已保存实例的存量权严格限定同 surveyId、instanceId、questionVersionId、acquisitionId；不能拿历史 publication、旧取得权或撤销后的 draft 绑定为另一卷/新实例授权。
6. 共享/模板/迁移授权证明只能由对应服务端流程构造；存储层有该联合分支不表示普通调用者可以自行提交它取得权限。
7. 派生的 distributionSource 和来源公开限制保持；本轮不实现公开分发，也不通过“自己持有派生题”判定原创。
8. S04 同版重复实例、S05 公开授权粒度和 S06 公开撤权仍为暂定。本轮不新增同题同版唯一索引、不实施这些待确认的业务分支；只落实当前已确定的逐实例绑定唯一键。

## 四、实现 A：完整幂等回执仓储与事务执行基础

### 1. 严格的持久化与解码

落实 operation_receipts 的新增和按唯一作用域查询，使用现有十 operation 判别联合、resultVersion=1、firstHttpStatus 和完整 result.data，不退回 resourceId/versionId/revision 三字段通用结果。

- 作用域严格为 actorId + operation + resourceKey + requestKey；actorId 来自可信认证上下文，不从请求正文获取。
- 依照 API 的每种 operation 规范构造 resourceKey；不得把不同资源或不同操作误合并。
- requestHash 覆盖规范化后的固定请求及路径前提，排除重试时的当前易变资源状态。复用现有 canonical/Decimal 口径，不修改旧发布/提交的幂等算法。
- 持久化前调用现有结构及 BSON 大小守卫；读取后也校验受支持版本、operation/kind/status、严格字段及必要范围，不能仅作 TypeScript 强转。
- ID 的存储位置区分：回执业务 DTO 中为小写 OID 文本，关联字段仍为 BSON ObjectId；返回 JSON 时不得泄漏 Long/ObjectId 内部对象。规范处理安全整数和 BSON 数值，不经过浮点转换处理 Decimal。
- result 保留自动生成的实例 ID、原 revision、draftDefinitionRevision、全部 validationIssues，包括空数组。返回加 replayed，持久化内容不含 replayed。
- result <=262144 字节，整个回执 <=1MiB。超限以 422 RECEIPT_TOO_LARGE 中止整个事务，不截断问题列表。
- 仓储不暴露更新/删除/覆盖回执、TTL 或事后从业务资源补造成功回执的方法。不要声称 Mongo 管理员也无法修改。

### 2. 新执行与成功重放的次序

提供能被后续业务组合的内部事务执行入口，名称按现有工程约定选择。要求清楚区分：固定请求解析/认证 → 查历史成功结果 → 无回执时执行新的业务前提与写入。

有匹配回执时：

- 同 hash 返回原 data，加 replayed=true、HTTP 语义为 200。
- 异 hash 返回 409 OPERATION_IDEMPOTENCY_CONFLICT，不执行业务回调。
- 不读取当前问卷/题版/绑定/模板/授权来重新计算历史结果，不因当前 revision 已变、实例已移除、授权已撤销或模板下架而重新执行。
- 损坏或不受支持的成功结果返回 503 OPERATION_RECEIPT_UNAVAILABLE；既不补字段伪造成功，也不将其视为无回执重新执行。
- 身份认证和固定请求结构检查仍必须存在；回执不授予新的内容访问权。仓储只面向受信任的服务端调用，不公开为任意用户读取他人回执的接口。

无回执时：

- 在事务内完成当前权限/状态/CAS、业务写入和回执插入；全部查询/写使用同一个 session。
- 使用 snapshot / majority / primary。事务回调可能重跑，不在其中发消息、写文件或执行不可回滚的外部副作用。
- 并发相同 key 最终只提交一份业务变更和一份回执，所有成功调用返回相同历史 data；首次状态按 operation 保留，重放状态为 200。
- 11000 必须识别是否来自对应回执唯一键；不要吞掉其他唯一索引冲突。已中止事务不能继续写，必要时退出后重新读取已提交回执或有界重试。
- TransientTransactionError 和 UnknownTransactionCommitResult 按驱动语义区分；提交结果不明时优先核对原 key，不能随意换 key 重新执行业务。没有可确认结果时用现有 OPERATION_OUTCOME_UNKNOWN/OPERATION_RETRY_LATER 语义，保留原 key 重试。
- 禁止无界重试；不要简单捕获所有错误后一律运行一次非事务业务回调。
- 明确失败、回滚和新的执行不产生成功回执；与原 Publication-Key/提交回执实现分别维护，不借此重构第一阶段完整流程。

事务执行器可以接受内部类型化业务回调以供后续组合，但回调不是权限替代品，不能接受客户端传入函数/查询/集合名。写明调用方必须承担的当前权限、状态和 CAS 责任，不伪称通用仓储已完成十个业务端点。

## 五、实现 B：来源绑定仓储与完整性检查

### 1. 查询和不变量

实现明确的 draft/publication 查询及内部写入原语，沿用现有字段和唯一键。读取范围必须体现可信 actor/owner/问卷上下文，不提供拿任意 bindingId 就绕过问卷归属的外部能力。

至少核对以下一致性：

- survey 存在，ownerId 与绑定冗余 owner 相同；instanceId 对应当前草稿或指定发布快照里的 Question.id。
- questionVersionId 存在且属于 questionId；不只核“两个 ID 都存在”。
- 正式版 Content 规范化摘要与 version.contentHash、binding.contentHash 一致，且与物化实例去配置后内容一致。
- 规范化时复用 W02-A 适配和数字规则；不同 required/jumpRules 不应误报 Content 改动；未知字段、非法 Content 不静默剥离后放行。
- draft 的 publicationVersion=0、snapshotHash=null；publication 指定版本真实存在且 snapshotHash 等于原 definitionHash。
- 新格式快照的 bindingHash 依照主契约：按 instanceId 稳定排序的固定元组 instanceId/questionId/questionVersionId/contentHash/acquisitionId；OID 使用小写文本，数组顺序及 canonical 固定。旧格式1没有 bindingHash，不向其补写。
- 完整性检查覆盖目标范围中实例与绑定的一一对应，重复、额外、缺失、错版及内容不匹配不能静默过滤。需要完整正式映射的调用失败为 QUESTION_MAPPING_INCOMPLETE；不要因此宣称尚未正式化的普通草稿不能保存。
- 新建/未正式化本地题与“应有正式来源却缺失/损坏绑定”要明确区分；不能为了让检查通过临时创建题版。
- 旧格式快照若尚无迁移映射，保持旧读取兼容；当后续调用明确要求来源时，报映射未完成，不回填、不猜测。

### 2. 写入权限与生命周期边界

- 写入原语必须要求有效事务 session；给出无事务调用被拒绝的真实检查，不保留可被业务误用的默认 session=undefined 写路径。
- publication 绑定不提供 update/delete/upsert 覆盖方法；冲突不能通过 replaceOne/retry 覆盖历史。
- draft 变更必须由同事务的问卷 owner/状态/expectedRevision CAS 约束。可将 CAS 与绑定变更放在明确的内部组合方法中，或由事务执行器中的受控调用方完成，但不能只先读 revision 再无条件写。
- 保留同一实例同版本时不无故重生成 acquisitionId/取得时间/证明；真实新增取得权或替换需由对应业务流程决定，不因重放改变来源事实。
- 移除 draft 绑定不能删 publication 历史；历史 publication 不能作为新实例的自动凭证。缺少 draft 绑定时不得偷偷从历史复建存量权。
- 普通写路径不接受任意 ownerId、authorization、mappingKind、evidenceKey、acquisitionId 等客户端来源字段。字段由受控服务端上下文生成或核实。
- 本轮提供并真实验证最小“题作者把自己的已有正式题版用于本人问卷”的内部组合路径，证明问卷 CAS、绑定和完整回执能同事务提交/回滚；不要求完成 attach/replace/publish 的 HTTP 业务服务。
- owner 也不允许越权操作他人的问卷；自己持有题并不授予他人问卷管理权。
- share/template/legacyImport 结构和已有事实可以按场景读取、校验和保留，但本轮不开放新的这些来源写入通路。新共享取得权门闩、模板动态全链授权及迁移角色入口分别留到 W04/W06/迁移任务；未实现分支应明确拒绝，不能默认当 owner 或 active grant 放行。
- 若保留内部低层插入能力，须隔离为不可直接由普通业务调用的实现细节；不要通过一个任意 authorization 参数就绕过上述受控路径。

本轮不通过“callback 是内部的”掩盖所有越权风险，也不把一套未接入 HTTP 的内部组合路径宣称为完整授权系统。文档列清已保证、调用方负责、后续未实现三类边界。

## 六、实现 C：受控上下文和真实事务验证

### 1. 环境入口

- 继续使用现有归属校验、目标校验和 phase2 初始化。新仓储测试上下文在连接前核目标、连接后核服务身份，再初始化/核对十三集合。
- 不给普通应用增加任意运行时 schema 模式；不根据集合数量自动升级；不得为测试改写应用库验证器。
- 不让“仓储工厂接收一个 Db”成为绕过本轮实例/库保护的实际运行入口。代码可以依赖受信任 Db/session，但入口要明确建立并验证上下文。
- 新合成账号、题身份、正式版、问卷/快照都只作为测试 fixture 插入本轮测试库，不复用旧真实数据。测试数据与待实现业务产物分别标注。

### 2. 必须有的实际测试

尽量使用现有依赖和证据运行器。重点是数据库最终状态和错误语义，不以日志写了 PASS 代替断言。

**回执：**

1. 十种 operation 的现有结果分支合法存取/解码、首次状态和重放状态；完整保留字段及空/非空 validationIssues。
2. actor/operation/resourceKey/requestKey 作用域隔离；同 key 同 hash 重放、异 hash 冲突。
3. 已有回执时传入会抛错的业务回调，证明不会执行；用会抛错的当前资源读取依赖证明重放不依赖当前资源。
4. 后续问卷修订、原实例移除后，仍返回首次实例 ID、原修订及原问题列表，不从现在对象重建。
5. 未知 resultVersion、缺少结果字段、错误分支等历史损坏被读取守卫拒绝；Schema 本身拒写的情况用隔离解码 fixture 验证，不关闭数据库验证器伪造“真实数据库负例”。
6. 结果/文档超限导致业务写和回执全部回滚，无截断、无半成功。
7. 同 key 并发使用可控屏障或明确数据库断言，只有一次实际业务效果/一份回执；不同 key 同 expectedRevision 竞争，按 CAS 一成功一冲突，不混用幂等冲突与编辑冲突。
8. 非回执唯一键冲突不能被误当历史成功。
9. 业务写之后、回执插入之前，以及回执插入之后但 commit 之前注入异常，前后比较集合和修订，证明都回滚。
10. 成功提交后模拟响应丢失，再用原 key 重试返回原结果且不重复写。仅靠测试钩子模拟的错误标签要明确说明，不冒称发生过真实网络断开/主节点切换。

**绑定：**

11. draft/publication 正常映射及按准确 survey/version/instance 读取；不同 Config、相同 Content 摘要一致。
12. 错误 owner/越权问卷、题版不属于该题、缺题版、Content 摘要错、快照 hash 错、缺/多/重复实例映射均拒绝且无残留写。
13. 新格式 bindingHash 对乱序输入稳定，换 questionVersionId/acquisitionId 能检出；旧快照 definitionHash/payloadHash 不因新增旁路变动。
14. owner 自用最小路径实际联动 CAS、绑定及完整 instanceSave 回执，首次成功、重放、冲突和中途故障均核数据库最终状态。
15. draft 删除/替换不改历史 publication；publication 仓储没有修改/删除公开方法，重复插入不会覆盖历史。
16. 无事务写拒绝；未实现的新 share/template/legacyImport 写入不能借伪造证明通过 owner 路径。
17. 同一 question/version 在不同历史 publication 有合法绑定，不能被误加唯一限制；不以本轮确认 S04。

可以合并测试组织，但要逐项说明覆盖到哪里。内部 callback、大小守卫、错误标签的单元验证与真实副本集事务验证分别描述，不能拿 mock 替代原子性测试。

### 3. 回归范围

- typecheck、build；注意现有 typecheck 会构建 shared，属于实际执行记录。
- 领域测试及八个独立进程导入检查，保留循环依赖修复。
- 十三集合 Schema 测试和原账号/四集合集成测试；原 test:phase1 核心套件按现有方式实际执行，保留 HTTP、事务、路径、统计及浏览器结果，不重复扩为全套 UI 改版测试。
- 当前应用库前后只读指纹核对：集合选项、索引、计数和内容摘要一致。不要求应用库永久为空，不改它来凑通过。
- 若本轮没有改动 W01 保护，不重复制造完整进程/端口负例；有影响则针对受影响部分重跑。
- 不删旧断言或修改已冻结文件让测试变绿。保留首次失败、修正原因及后续重跑。

## 七、文档、变更对照与 AI 日志

1. 新增 `docs/phase2/bindings-receipts-foundation.md` 或同等清晰入口，写明：
   - 第一阶段原快照/提交回执 → W02-A 数据结构 → 本轮来源事实仓储/完整回执事务的增量关系。
   - 实际文件和调用关系、事务/session 所有权、读取校验、重放次序、CAS 与故障处理、未来业务如何接入。
   - 已完成的 owner 内部路径与尚未实现的共享/模板/迁移授权边界，避免把内部方法当公开 API。
   - 每个不变量由 Schema、仓储、事务、调用方或后续服务哪一层保证；不可变性的应用边界。
   - 精确测试清单、合成库、并发次序/故障点、最终记录数/修订与证据；未执行项明确。
2. 同步 database-design、key-logic、system-design、phase2 README、change-analysis、implementation-test-plan 的实际状态；API 本轮仅同步基础实现说明，不把未注册端点写成已上线。
3. W02-B 完成不能把 W02 及 P2-T01—T50 全部标 PASS。下一子任务才是受控迁移 inspect/dry-run 设计和实现；W03 也尚未完成。
4. 本轮证据使用 `P2-007`，保留执行前文件摘要、原应用库前后只读指纹、命令/时间/退出码/目标库、失败原件、真实事务及最终汇总。不要输出 .env、密钥或原数据库文件。
5. 在 `docs/ai/phase2-usage-log.md` 追加本轮实际条目，引用本 Prompt，记录 AI 实施范围、真实工具和失败/修复、实际验证及待人工复核；保留旧日志字节前缀，不编造模型、人工贡献或教师认可。
6. 若需要普通技术细化，可据现有契约自行落地并记录理由；若发现改变已确认业务或 S04—S06 才能继续的依赖，先推进不依赖部分，并明确列出待决策项，不静默改规则。
7. 不升级依赖/锁文件、不提交或推送 Git、不修改第一阶段目录、冻结归档、原 Prompt 和历史证据，不生成最终 Word/PDF，不自动进入下一子任务。

## 八、完成后回复

- 实际新增/修改文件入口及各自职责。
- 回执完整存取/重放和来源完整性如何实现，事务/CAS/不可变性具体保证到哪一层。
- 同 key 并发、不同 key CAS、故障回滚、成功响应丢失的实际数据库结果及证据。
- 类型、构建、领域/冷导入、Schema、原核心回归及集成测试的真实退出码；首次失败和未执行项。
- 当前应用仍四集合且指纹未变，所有写入仅本轮合成测试库；新 HTTP/页面、迁移和完整授权业务仍未实现。
- W02-B 是否达到完成条件，以及下一步迁移 inspect/dry-run 的依赖和注意事项；不要继续执行下一步。

现在开始完成 W02-B。
