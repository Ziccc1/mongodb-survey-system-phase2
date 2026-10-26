# P2-006 W02-A 领域类型与可执行Schema基础执行 Prompt

请推进第二阶段的P2-W02，先完成子任务W02-A：题目Content/问卷Config领域适配、13集合类型与可执行Schema、受控注册表及独立测试库验证。

这是实际代码实现任务。请完成代码、真实测试、文档和AI记录，不要只交设计或计划。本轮只实施数据结构基础，不一次实现题库、授权、模板、统计及旧数据迁移。

## 一 当前状态和本轮边界

- 工作目录：`D:\大三\数据库\pj1_2`。
- 第一阶段原目录`D:\大三\数据库\project1`及冻结归档只读；第一阶段基线提交`c48cb67c723d1d966fccfd5b1ba117d3c70b3d3c`。
- P2-002/003/004总体设计及审阅修正已完成。P2-W01/P2-005独立环境与三项复审修正已完成：API连接前后核实例、冒烟核端口及PID、日常核验与首次空库验收分开。
- 当前独立实例为localhost:27019/rs0，当前`project2_app_v1`仍运行第一阶段四集合。依赖已按原锁安装，可用Node22/npm10、MongoDB和Edge。实际执行先核现状，不因文档说已运行就跳过归属检查。
- 本轮新增13集合Schema只在新建的`project2_test_*`合成测试库初始化与验证。**不升级、不改验证器、不增加集合、不插入样例到当前应用库project2_app_v1。**
- 原应用及第一阶段测试继续默认四集合兼容模式；新13集合走显式、受控的独立入口。不能替换常量后让当前应用无法启动。
- 旧数据审计/备份恢复/映射/inspect/dry-run工具、来源绑定和回执业务仓储放到W02后续子任务，本轮不实施。

## 二 必读文件与优先级

路径相对工作目录。先检查适用AGENTS.md、Git差异和已有其他窗口工作，保留所有现有更改。

### 业务与设计主契约

1. `docs/phase2/README.md`
2. `docs/phase2/requirements-decisions.md`：已确认规则与仍暂定S04—S06要区分。
3. `docs/database-design.md`：全部字段、BSON类型、验证器草案、索引、来源、回执及快照兼容。
4. `docs/api.md`：Content/Config、严格DTO、原接口兼容、错误语义。
5. `docs/key-logic.md`、`docs/system-design.md`。
6. `docs/phase2/collection-examples.json`、`docs/phase2/design-fixtures.json`、`docs/phase2/api-contracts.json`。
7. `docs/phase2/change-analysis.md`、`docs/phase2/data-migration-plan.md`、`docs/phase2/implementation-test-plan.md`。
8. 根目录两份教师Word及`docs/phase2/prompts/P2-002-incremental-design.md`按需核对原要求；不改原件或历史Prompt。

### 当前已运行实现

9. `docs/phase2/runtime-baseline.md`及P2-005-review-summary/static-check证据，核对W01三项修正。
10. `apps/api/src/database/schema.ts`、`models.ts`、`initialize.ts`、`instance-ownership.ts`。
11. `apps/api/src/app.ts`、`config.ts`、`dto.ts`、`question-codec.ts`。
12. `apps/api/src/core/versions.ts`、`publication.ts`、`submission.ts`、`reporting.ts`，了解原定义/答案摘要和不可变发布语义。
13. `packages/shared/src/questions.ts`、`answers.ts`、`core-types.ts`、`index.ts`及两级tsconfig/package声明。
14. `scripts/init-db.ts`、`verify-runtime-baseline.ts`、`phase2-runtime.mjs`、`run-check.mjs`。
15. `tests/runtime-environment.ts`、`tests/phase1/harness.ts`、`tests/integration.test.ts`及原核心测试入口。
16. `docs/ai/README.md`、`docs/ai/phase2-usage-log.md`，冻结基线索引和现有保护证据。

设计主契约优先使用P2-003/P2-004修正后的当前版本，不照抄早期Prompt或基线中的已替换设计。

## 三 必须保留的语义

1. 题身份、正式题版、问卷实例、问卷发布版互相区分。Content含题干/题型/选项/输入限制；Config含必答和跳转，题序属于问卷数组。
2. 显式正式保存才生成题版本，恢复生成新版本；本轮只实现相关数据类型，不写这些业务操作或隐式创建题版。
3. 正式版含不可变distributionSource，派生不自动获得来源公开分发权；模板证明覆盖完整来源义务，不能退回单个publicGrantId或自有派生免授权。
4. operation_receipts保存按operation区分的完整有限历史成功DTO，保留resultVersion/firstHttpStatus与P2-003结果联合类型，不能退回三字段回执。
5. 模板accessFence与管理revision分别存在，普通选用不推进管理修订；本轮不实现选用事务。
6. Usage逐题版isDraft/isCurrent/hasHistorical，再做问卷汇总；本轮可以定义类型，但不实现使用查询端点。
7. 原Question/Answer、校验/路径、Decimal128、Unicode码点、发布定义hash、答卷payloadHash和原幂等算法不能因拆分而改变。
8. S04重复实例、S05授权粒度、S06公开撤权仍按现有状态暂定。本轮的数据载体可按当前设计草案实现并标注，但不实施这些待定业务分支或把它们改成用户已确认。

## 四 实现任务A 领域类型与适配

### 1 新类型及接口兼容

- 在shared适当新增模块，清楚定义JSON层的QuestionContent/QuestionInstanceConfig等判别联合，避免与API现有运行配置Config重名混用。
- 保留现有Question、Answer及导出兼容；旧前后端和测试可以继续使用扁平Question。
- JSON数字使用原DecimalString口径。MongoDB ObjectId、Date、Decimal128、Long等只在后端存储层使用，不把mongodb依赖引入浏览器shared包。
- 不通过新增any或任意对象字段掩盖完整模型缺失。可对领域模型使用精确联合和可复用类型，避免复制两套不一致定义。

### 2 提取、物化、规范化与校验

- 提供从旧扁平Question提取可复用Content、提取问卷Config，以及Content+Config+instanceId物化为旧Question的明确函数；名称按工程习惯选择。
- Content严格排除id/required/jumpRules及未知字段；物化不能用未经检查的对象展开让Content覆盖实例ID或Config。
- 同一正式版保持选项ID；实例ID和规则ID不属于Content。适配本身不自动生成题身份/版本，也不擅自重编号。
- 输入输出深层独立，修改物化后的options/validation/jumpRules不反向污染正式内容或其他问卷实例；支持现有Vue可用的JSON值，不要求调用者先转内部BSON。
- 继续复用原normalizeQuestions、validateQuestions及答案路径引擎，不重写第二套跳转/Decimal规则。
- 校验区分可保存草稿问题和阻止发布的问题；不要把原来允许暂存的失效跳转一律变成无法编辑，也不要把非法Content默默截断成合法内容。
- 处理所有四题型、空可选限制、数字0、负数/小数/科学计数、整数要求及Unicode边界。

### 3 BSON边界与摘要兼容

- 后端分别处理Content与实例Config中的数值字段（数字校验及规则阈值）的DecimalString↔Decimal128转换。
- 不把ObjectId/Date当普通对象递归拆散，也不把所有看起来像数字的字符串都转Decimal128。
- 对旧Question进行提取再物化后，规范化含义与原来相同；旧definitionHash/payloadHash用现有样本可复算且不变。
- 只有新增Content/来源证明摘要使用其独立规范；不得修改旧canonical函数行为来适配新对象，从而重解释历史。

## 五 实现任务B 完整模型与13集合Schema

### 1 模型覆盖

对照现行字段表和样例，建立后端完整存储模型，不止空接口占位。需要覆盖：

```text
users
surveys
survey_versions
responses
question_items
question_versions
question_banks
question_bank_members
question_grants
survey_question_bindings
survey_templates
template_grants
operation_receipts
```

原四集合模型及旧导出可以保留或兼容扩展，新增可拆文件，避免一个文件过长。重点落实：

- surveys旧格式2与新格式3，旧格式不能混入新字段，新格式的originTemplate/usageNumber按契约必填。
- survey_versions旧格式1与新格式2，bindingHash只在新格式必填，不能为了统一而补写旧快照。
- responses格式与原答案形状保持。
- 正式题版distributionSource的original/derived/unrecorded互斥结构，与父版/恢复来源分别建模。
- draft/publication绑定的publicationVersion和snapshotHash互斥规则、authorization的不同来源证明。
- 题库墓碑、授权状态、模板元数据与distributionProof/lineageHash、完整有限回执联合类型。
- 字段的nullable、可缺省、不可变和服务端构造不能混淆；MongoDB验证器不自动补默认值。

### 2 可执行验证器和索引

- 将设计伪代码落实为真正可提交给MongoDB的strict/error JSON Schema，而不是把伪代码字符串或宽松object塞进初始化。
- 每个嵌套对象都落实additionalProperties=false、required、互斥oneOf、枚举、数组/字符串长度、数字范围和BSON类型，避免仅限制顶层。
- 非负/正安全整数的int/long类型、Decimal128与字符串边界明确。测试使用正确BSON构造，不能为让JSON示例通过而放开数字或OID类型。
- 完整回执按operation/result.kind/result.data约束对应，落实大小及版本等可由Schema表达的部分；跨字段或大小需应用守卫的，提供明确验证函数或记录后续边界，不能假称Schema已经全部保证。
- 新老索引完整保留、名称/顺序/unique/partial过滤与主契约一致，不随意drop原索引。
- S04单卷同题同版限制本来是待定应用规则，不提前增加会破坏历史的唯一索引。
- 明确JSON Schema能够保证的结构与不能独立保证的题ID唯一、引用外键、hash真实性、所有权、来源授权、版本不可变及跨集合一致性。必要纯结构守卫可以本轮实现；业务仓储/权限/事务留下一步，不能冒称已实现。

## 六 实现任务C 受控注册表与四集合过渡

这是本轮必须正确处理的兼容点。

### 1 推荐结构

- 保存精确的baseline四集合注册表，再新增phase2十三集合注册表，复用公共小类型但不改变baseline实际验证器/索引语义。
- 现有`initialize(db)`、`verifySchema(db)`及应用启动默认继续使用baseline，现有调用方和原测试无需自动切换。
- 新增明确的`initializePhase2Schema/verifyPhase2Schema`或等价显式入口；本轮调用入口仅供受控合成测试库使用，不让普通应用或db:init根据集合数量自动选模式。
- 可以实现显式注册表参数，但默认和调用范围必须安全；不得允许任意字符串模式、从客户端选择、接受任意集合或只检查“至少四个”。

### 2 初始化必须非迁移

- phase2入口连接前/写入前复用P2实例归属和目标校验；本轮额外强制只允许`project2_test_*`。
- 新测试库可创建13集合并建索引；对精确一致的库可安全重跑。
- 对baseline四集合库的旧验证器、未知集合、缺失/不符索引或部分升级状态，按清楚的策略预检并报告。不能通过collMod、drop、清库或自动补映射把初始化变迁移。
- 在检查所有已有对象之前不先写其他集合；出现不匹配时证明没有先创建半套新对象。
- 空新库因多集合DDL中途失败可能保留已创建对象，如实记录，不谎称整个初始化是一个原子事务；精确匹配的安全重跑策略必须明确。
- baseline入口遇13集合或未知结构仍拒绝，phase2入口遇未升级baseline不能自动改造；仅凭启用新注册表不能给旧数据库盖已升级标记。
- 如需后续迁移专用入口，在文档记录，不本轮实现或开放。

### 3 应用保持可运行

- 当前`project2_app_v1`保持四集合、原验证器/索引和原数据不变；不为测试删用户或要求库为空。
- 保留P2-W01及复审的URI保护、实例标记、连接后PID/目录/副本集核验；不能通过新初始化入口绕过。
- 日常verifyruntime继续接受非空四集合应用库；verifyinitial保留显式空库验收。新的13集合核验用新入口和独立测试数据，不误用原核验脚本。
- API/ready本轮仍表示四集合兼容应用就绪，不得显示新增业务已就绪；未来切换到13集合需专门版本化升级任务。

## 七 实际测试与证据

优先使用已安装依赖、现有独立27019实例和现成harness能力。所有写操作只进新创建、名字唯一的`project2_test_*`库，保留测试数据，不drop任何库。不得写当前应用库或P1库。

### 1 领域适配测试

- 四题型提取/物化往返、ID与选项稳定、Config不进入Content。
- 深拷贝隔离、未知字段拒绝、必填/可选字段与单选无validation等形状。
- Decimal128/DecimalString精确往返、0/负数/小数/边界/Unicode，ObjectId/Date不被误拆。
- 原有效路径、跳转、必答和草稿软问题语义保持；旧hash样本不变。

### 2 真实MongoDB Schema测试

- 在新库初始化13集合，真实查询核对集合选项、验证器和完整索引；一致性重跑。
- 每个集合有真实合法文档插入样例；对关键互斥分支分别覆盖。设计样例只是输入来源，按字段类型可信转换后才能测试，不把“JSON能解析”当数据库接受。
- 负例覆盖额外顶层/嵌套字段、缺必填字段、null与缺省区别、OID/Date/Decimal类型错误、错误枚举/版本、source结构不符、draft/publication字段冲突、模板证明结构及回执分支不符。
- 真实验证关键unique索引拒重复，非unique不误拒正常历史关系；每个拒绝操作检查未插入非法文档。
- 对只有应用层能保证的跨集合授权/来源合法性，不伪造“数据库自动拒绝”的结论；明确后续仓储测试范围。
- 另建baseline四集合测试库，证明baseline可重跑、原API可用；phase2初始化在不匹配旧验证器时拒绝且原对象不变，baseline检查也拒13集合/未知对象。
- 通过本轮入口尝试错误库名/不受控目标时，在连接/写入前拒绝；不实际把应用库当负例写目标。

### 3 回归与构建

- 运行typecheck/build。
- 对初始化/共享题类型适配涉及的原功能，实际跑原核心`test:phase1`及账号/四集合初始化集成测试，证明旧四集合模式继续可用。原核心浏览器只需随套件正常跑，不扩大为UI改版或全图表专项。
- 本轮如未修改W01守卫，不必无理由重新制造全部进程/端口负例；如果确有影响，则只重跑受影响检查。
- 不删除/弱化原业务断言凑通过。保留真实失败、修正原因和后续重跑，不多次无意义全套重测。
- 独立保存本轮命令、时间、退出码、测试目标和输出，使用现有受控phase2-runs证据机制。可向package.json增加必要测试脚本，但不改依赖声明、版本或锁文件。

## 八 文档交付与日志

1. 新增`docs/phase2/schema-foundation.md`或等价明确入口，说明：
   - 第一阶段原扁平Question/四集合到本轮领域适配/双注册表的具体变化与理由。
   - 实际新增/修改文件及职责，两个Schema模式的调用方式和初始化边界。
   - 13集合在测试库验证了什么、业务层仍未保证什么、当前应用库为何仍是四集合。
   - 每个集合/关键分支和索引的实际检查矩阵，真实结果/证据入口。
   - 后续来源/回执仓储和迁移工具要接哪些接口，哪些暂定规则仍未实施。
2. 同步数据库设计、关键逻辑、总体设计、phase2入口、变更对照和实施计划的真实状态。不要把整个设计稿改成“第二阶段已实现”，不要删除将来的13集合目标。
3. 若发现Schema设计细节不可能按原伪代码部署，先用实际错误证明并做最小等价调整，写清原因及影响；普通技术修正自行处理，改变已确认业务的决定仍需明确标注而不能擅自改。
4. 新证据建议任务P2-006，包含执行前保护摘要、真实测试日志、运行结果和静态链接/模型/字段核对；不输出.env、密钥、数据库原始文件或真实个人数据。
5. 在`docs/ai/phase2-usage-log.md`追加P2-006，引用本原始Prompt，记录工具、产出、真实错误/修复、修改者、实际验证和未执行项；保留旧日志字节前缀、历史证据、原Prompt和冻结基线。
6. 不提交/推送Git，不修改第一阶段原目录，不生成最终Word/PDF，不自行进入W02后续任务。

## 九 完成后回复

- 实际文件入口、领域转换与注册表结构，哪些旧接口保持。
- 13集合及关键分支/索引实际接受与拒绝结果，测试库名称及证据；别只给总计PASS。
- baseline原应用及旧核心回归结果，当前应用库保持四集合、未升级或导入真实数据。
- 实际修改范围、设计调整理由、仍未保证的业务权限/不可变性/跨集合事务。
- typecheck/build/回归的真实退出码、失败与未执行项。
- 下一步建议：先实现受控来源绑定和完整回执仓储，再做迁移inspect/dry-run；不把本轮Schema通过当成对应新业务已实现。

现在开始完成W02-A。
