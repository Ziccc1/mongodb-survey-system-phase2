# W02-A 领域类型与可执行 Schema 基础

> 本文记录该轮历史边界。2026-10-23 P2-008后续已完成W02—W04，新app_v2十三集合与业务/迁移实测见[当前实施说明](w02-w04-implementation.md)；baseline app_v1仍四集合。以下“未实现/本轮不做”仅指原轮次。


2026-10-23（Asia/Shanghai）。按[原始 P2-006 Prompt](prompts/P2-006-domain-schema-foundation.md)完成代码与真实验证。**仅基础设施完成；新增业务 API、页面、来源/回执仓储和迁移均未实现。** 当前应用与 ready 默认 baseline 四集合，project2_app_v1 未升级。

## 领域与文件职责

| 文件 | 实际变化 |
| --- | --- |
| [question-content.ts](../../packages/shared/src/question-content.ts) | JSON Content 四分支、按题型 Config、提取/物化/规范化/结构与语义校验；结构从原 questionSchema 派生，旧 Question/Answer 导出保持 |
| [content-codec.ts](../../apps/api/src/content-codec.ts) | 仅 Content 数值限制与 Config 数字条件转 Decimal128，解码按原 decimalValue 规范化；不转换 ID、标题或普通数字文本 |
| [question-codec.ts](../../apps/api/src/question-codec.ts) | 旧递归 fromBson 增加 ObjectId/Date 保留，旧 Question 数字转换及 canonical/hash 算法不改 |
| [phase2-models.ts](../../apps/api/src/database/phase2-models.ts) | 完整13集合 BSON 类型，双格式问卷/快照、来源、证明与分操作回执；Usage 逐版本状态仅类型 |
| [phase2-schema.ts](../../apps/api/src/database/phase2-schema.ts) | 13个 strict/error 验证器及28个业务索引；所有嵌套对象严格白名单 |
| [schema-registry.ts](../../apps/api/src/database/schema-registry.ts) | baseline/phase2 闭合常量及递归冻结；无环境或集合数量自动模式选择 |
| [initialize.ts](../../apps/api/src/database/initialize.ts) | 仅改为引用 baselineRegistry；默认校验/建库语义保持，原 schema.ts 字节未改 |
| [phase2-initialize.ts](../../apps/api/src/database/phase2-initialize.ts) | 独立测试入口；目标校验→OS归属→连接后PID/目录/副本集核验→全部对象预检→DDL |
| [document-guards.ts](../../apps/api/src/database/document-guards.ts) | 完整结果分支与大小守卫、模板500个不同版本节点及2MiB大小守卫；不持久化或重放业务 |
| [领域测试](../../tests/domain-foundation.test.ts)、[Schema测试](../../tests/schema-foundation.test.ts) | Vue代理深拷贝、四题型、草稿软问题、旧hash固定样例、精确Decimal、真实Mongo正反例/索引/双模式 |

Content 严格排除 id/required/jumpRules 和未知字段；物化显式选择字段，不允许覆盖 instanceId。输入输出深层独立，选项 ID 保留，适配不生成任何身份/版本。空可选限制、0、负数、小数、科学计数和 Unicode 沿用原函数。失效目标/选项仍可保存草稿，validateQuestions 的 errors 与 validationIssues 保持分离；发布需同时无两类问题。

## 两种入口与非迁移边界

```typescript
// 原应用、db:init、ready、P1测试：仍为原四集合
await initialize(db);
await verifySchema(db);
// 仅新建合成测试库；uri和dbName必须一致
await initializePhase2Schema({uri, dbName});
await verifyPhase2Schema({uri, dbName});
```

phase2 入口只允许本机27019/rs0的 project2_test_*，在连接前拒绝应用库、P1库和其他名称；连接后先验证真实实例再访问 Schema。没有模式环境变量，没有传入任意 Db 的 phase2 写入口。测试用 connect sentinel 证实错误名称拒绝前连接调用为0，未向应用库尝试写入。

预检完整遍历所有已有集合和索引，拒绝旧验证器、未知集合、额外选项/索引及缺失/不符业务索引；拒绝前不创建其他集合。**已有集合必须连索引一起完全匹配**，允许缺整个集合的精确子集安全续跑；已有集合缺索引则停下人工审阅，不自动修复。全空库或安全子集创建剩余集合；一致库可重跑。多集合 DDL 不原子，中途失败可能保留对象，尤其新集合尚未建齐索引时会在下次被拒绝，不自动 collMod/drop/清库。这不是迁移入口。

baseline 仍精确使用原验证器/9业务索引；phase2 对四核心载体另落实字典的长度/整数上界等约束，并支持 surveys=2|3、survey_versions=1|2，旧格式不能混入新字段。它不会覆盖现行四集合验证器。未来旧数据必须先专门审计与受审阅升级，不能直接重新 initialize。

## 真实验证矩阵

下表每次拒绝均核对插入前后总数不变。额外字段、缺schemaVersion、错误OID是每集合的独立负例。样例通过 EJSON 可信转换为 ObjectId/Date/Decimal128 后写入，不直接导入原设计 JSON。

| 集合 | 实际接受 | 实际拒绝（121结构或11000唯一键） |
| --- | --- | --- |
| users | 3：design primary；design supporting | 4：extra top field；missing schemaVersion；wrong OID type；duplicate uq_username_key |
| surveys | 7：design primary；legacy format2；materialized single rule；materialized multiple rule；materialized text rule；materialized number rule；originTemplate object | 7：extra top field；missing schemaVersion；wrong OID type；old format cannot mix new field；new format origin required nullable；duplicate uq_survey_public_id；duplicate uq_survey_usage_number |
| survey_versions | 2：design primary；legacy snapshot1 | 6：extra top field；missing schemaVersion；wrong OID type；legacy snapshot cannot mix bindingHash；duplicate uq_survey_version；duplicate uq_publication_request |
| responses | 5：design primary；answer single；answer multiple；answer text；answer number | 5：extra top field；missing schemaVersion；wrong OID type；duplicate uq_one_response_per_user；duplicate uq_submission_request |
| question_items | 6：design primary；design supporting；origin fork；origin legacyImport；safe Long max | 5：extra top field；missing schemaVersion；wrong OID type；unsafe integer；double not int/long |
| question_versions | 17：design primary；design supporting；source original；source unrecorded；source derived；operation save；operation restore；operation fork；operation legacyImport；content single；content multiple；content text；content number | 9：extra top field；missing schemaVersion；wrong OID type；derived without source；original with source；content instance leakage；Decimal string instead of BSON；unknown nested field；duplicate uq_question_version |
| question_banks | 2：design primary；tombstone | 4：extra top field；missing schemaVersion；wrong OID type；date/string bound |
| question_bank_members | 1：design primary | 4：extra top field；missing schemaVersion；wrong OID type；duplicate uq_bank_question |
| question_grants | 2：design primary；revoked branch | 5：extra top field；missing schemaVersion；wrong OID type；state enum；duplicate uq_question_recipient |
| survey_question_bindings | 6：design primary；draft/auth owner；draft/auth share；draft/auth template；draft/auth legacyImport；normal history same question/version | 6：extra top field；missing schemaVersion；wrong OID type；draft publication conflict；publication null hash；duplicate uq_instance_binding |
| survey_templates | 2：design primary；paired external grant proof | 5：extra top field；missing schemaVersion；wrong OID type；grant pair mismatch；obsolete single grant |
| template_grants | 4：design primary；design supporting；revoked branch | 4：extra top field；missing schemaVersion；wrong OID type；duplicate uq_distribution |
| operation_receipts | 12：design primary；design supporting；receipt createQuestion；receipt saveVersion；receipt restoreVersion；receipt forkQuestion；receipt createBank；receipt createTemplate；receipt attachQuestion；receipt replaceQuestion；receipt saveInlineQuestion | 7：extra top field；missing schemaVersion；wrong OID type；unknown result version；operation result mismatch；receipt nested unknown；duplicate uq_operation |

全部13集合验证器、strict/error 与完整索引由真实 listCollections/indexes 核对；包含13个 _id_ 加28业务索引。每个业务索引的名称、键顺序、unique 与 partialFilterExpression 都核对；13个业务 unique 各做隔离其他唯一键后的重复插入拒绝。非unique允许同题版不同发布历史关系，未落实暂定 S04 唯一限制。各索引实际列表：

| 集合 | 已核对索引（不含_id_） |
| --- | --- |
| users | uq_username_key unique |
| surveys | uq_survey_public_id unique、ix_owner_list、uq_survey_usage_number unique |
| survey_versions | uq_survey_version unique、uq_publication_request unique |
| responses | ix_survey_responses、uq_one_response_per_user unique、uq_submission_request unique、ix_version_responses |
| question_items | ix_question_owner、ix_fork_source |
| question_versions | uq_question_version unique、ix_question_parent、ix_distribution_source |
| question_banks | ix_bank_owner |
| question_bank_members | uq_bank_question unique、ix_bank_members |
| question_grants | uq_question_recipient unique、ix_received |
| survey_question_bindings | uq_instance_binding unique、ix_question_usage、ix_owned_question |
| survey_templates | ix_template_square、ix_template_owner |
| template_grants | uq_distribution unique、ix_author_distribution |
| operation_receipts | uq_operation unique |

Mongo不能自动保证题/规则/选项ID唯一、min≤max、题型引用/前向目标、hash真实性、外键、owner、动态授权、来源链真实性、不可变性及跨集合事务。适配复用原语义校验；新增大小守卫需未来仓储在事务提交前调用，直接Mongo插入不会自动执行它。Schema只保证 proof 的有限结构和 grant 配对；不会因派生自动授予公开权。source/origin只读类型也不是运行时写保护。

回执保存10操作对应的完整 resourceReceipt/instanceSave/templateAdoption DTO，含首次自动ID、修订和全部问题；Schema按operation/kind/status对应，resultVersion=1。纯守卫检查白名单及result≤262144B/整回执≤1MiB，不截断。不实现读取历史重放、授权门闩或仓储。模板保留revision/accessFence；来源original/derived/unrecorded及全链proof保持，S04—S06仍暂定。

## 运行结果与证据

真实汇总：[P2-006-summary.json](evidence/P2-006-summary.json)，逐条矩阵：[matrix.json](../../docs/testing/phase2-runs/P2-006-20261023/2026-10-23T05-08-42-135Z-schemafoundation-02263d5d/artifacts/schema-foundation/matrix.json)，完整命令与失败原输出：[运行目录](../testing/phase2-runs/P2-006-20261023/README.md)。最新Schema轮接受69条、拒绝71条，所有计数断言通过。

Schema轮新库（数据保留；另有首轮Schema和原回归独立库，详见日志）：

- `project2_test_schema_foundation_1792732125132_d7e4dabf`
- `project2_test_schema_baseline_1792732134991_131bb867`
- `project2_test_schema_unknown_1792732142043_436fd404`
- `project2_test_schema_missingindex_1792732146334_8f98b1b1`
- `project2_test_schema_wrongindex_1792732150624_5c50310c`
- `project2_test_schema_partial_1792732154796_52035c19`

typecheck、build、领域4项、真实Schema、test:phase1原七模块（含Edge浏览器）、账号/四集合13子项及verifyruntime全部最终退出0。构建保留原app-config脚本、图表大块及plugin timing诊断。没有放宽原业务断言。应用库前后四集合选项、索引、记录数及内容摘要一致，日常核验0条只是当前事实，不是永久空库要求。

真实失败保留：首轮类型检查因collection.options可缺省而失败，补显式可空访问；领域边界首轮因Decimal128科学计数大写E而与原规范不一致，新增解码复用decimalValue；首次Schema被归属检查拒绝，核实27019无监听后用原受控脚本启动专用Mongo，未改实例配置。一次启动工具审批超时未执行，按允许重试一次成功。Schema首轮通过后补四型物化/答案、非null模板来源和外部grant证明覆盖，再针对Schema重跑通过，未重复全套业务。测试进程已退出，专用Mongo保留。

未安装/升级依赖、未迁移真实数据、未改P1目录/冻结档/原Prompt/历史证据、未提交或推送。下一步先实现受控来源绑定与完整回执仓储及真实事务，再单独做迁移inspect/dry-run；不能据本轮Schema通过宣称新业务完成。


<a id="shared-import-review"></a>

## W02-A复审：共享模块直接导入循环（2026-10-23）

用户指出的问题成立。此前questions/answers从index反向导入codePointLength，新增question-content在模块求值时立即读取questionSchema，形成questions → index → question-content → questions，直接导入questions或answers会在questionSchema初始化前读取它。旧领域测试从@survey/shared入口进入，加载顺序恰好绕过该报错；原先PASS仅覆盖该入口，不能证明直接模块导入可用。

新增无依赖叶模块[validation-common.ts](../../packages/shared/src/validation-common.ts)，放置原码点工具与DefinitionIssue类型；questions/answers直接依赖它，index保留同名导出以兼容原调用方。没有改变questionSchema、canonical、Decimal、校验和路径算法，也没有用调整export顺序或延迟读取掩盖循环。

新增[shared-imports.test.mjs](../../tests/shared-imports.test.mjs)：源码src和编译dist各覆盖questions、answers、question-content、index四种首入口，共8个独立Node进程。父测试不导入shared，子进程先直接导入指定入口，再核Schema、原导出身份、物化/提取与Unicode答案边界，避免模块缓存或预热掩盖错误。src用tsx加载，dist用原生Node ESM。常规run-check domain已同时纳入本检查；sharedimports可单独执行（先typecheck/build生成最新dist）。

真实修复前8项中4失败/4通过，源码和编译questions/answers均复现原ReferenceError；修复后8项全部通过。合并领域测试12/12，原路径flow通过，typecheck/build退出0；原失败输出保留在[本轮日志](../testing/phase2-runs/P2-006-import-review-20261023/README.md)，见[汇总](evidence/P2-006-import-review-summary.json)与[保护核对](evidence/P2-006-import-review-static-check.json)。未修改验证器/数据库或新业务，没有重跑Mongo及整套浏览器；原W02-A证据保留其历史时点。
