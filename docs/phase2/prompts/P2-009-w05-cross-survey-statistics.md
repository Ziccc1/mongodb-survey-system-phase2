# P2-009 / W05 跨问卷同题同版本统计执行 Prompt

请在 `D:\大三\数据库\pj1_2` 现有 W02—W04 基础上实际完成 W05，包括统计算法、MongoDB查询、API、可用前端、真实测试、增量文档及AI日志，不只交设计。先完成下列两项审阅修正，再推进统计；段间自行继续。

## 1. 状态、必读材料和范围

W02—W04/P2-008已有真实实现：十三集合应用 `project2_app_v2`、baseline四集合 `project2_app_v1`，共用项目专属localhost:27019/rs0。来源事实、正式题版本、共享撤销门闩、问卷发布/提交、Usage和迁移合成演练已存在。保留它们，不重做项目。

先检查适用AGENTS.md、Git差异，保留已有更改；读：

- `docs/phase2/w02-w04-implementation.md`、`w02-w04-coverage.md`及P2-008最新原始结果/汇总。
- `docs/phase2/requirements-decisions.md`、`implementation-test-plan.md`、`design-fixtures.json`、`collection-examples.json`。
- `docs/database-design.md`、`docs/api.md`（重点X01—X03、CrossStatistics/CrossAnswer/分页）、`docs/key-logic.md`、`docs/system-design.md`。
- `apps/api/src/core/question-usage.ts`、`survey-sources.ts`、`library.ts`、`reporting.ts`、`versions.ts`、`submission.ts`；database的source-read/binding-integrity/phase2-context/models/schema/receipt相关文件。
- shared的answers/questions/content/decimal/类型及原canonical；app路由/query/405门禁；前端现有统计页、API客户端、QuestionEditorPage.vue、library-client.ts和路由；tests/phase2及隔离运行器。

业务以需求主维护文档为准，字段/hash以数据库主契约、HTTP以API为准。S04已确认：单卷同题同正式版最多一实例，不同版允许；历史publication多版不受此限制。模板公开规则S05/S06也已在当前讨论确认，但W06实现不属于本Prompt。

保留原分问卷/分发布版统计，不改成默认跨卷。W06广场、公开授权和W07真实P1迁移/最终报告留后续；不连接27018/P1数据库，不修改P1目录/冻结档/旧Prompt/历史证据，不提交推送，不升级依赖或清库。

## 2. 先修正并验收两项 W04 前端问题

实施前核现状，若别的窗口已修复则检查对应测试，不覆盖其修改。

1. `QuestionEditorPage.vue` 正式保存后，refreshRevision仅更新editor，没有同步本地base/saved。v1保存后继续改内容再保存草稿，会把旧base（最初可能为null）重新发给后端，使下一正式版父边错误。正式保存成功且本地没有新编辑时，采用服务器新的草稿基线/修订并更新dirty基准；“恢复旧版保留未保存编辑”必须继续有效，不可统一adopt覆盖用户输入。浏览器验证连续v1→编辑→v2，v2.parent=v1；从用户明确选定旧基线保存仍按所选父边；恢复保留本地未保存内容。
2. `useOperation` 在pending存在时忽略新path/body并重发旧请求，而题目编辑页仍能点击其他操作。结果未知的恢复请求之后点派生，实际重试恢复，调用方却按派生解释回执。修正为明确绑定动作身份的重试状态：只允许原动作确认，其他按钮和相关选项锁定；错误动作调用应显式拒绝，不能静默发送旧请求并当成新动作完成。保留原key/body，不能为了切动作丢弃未知操作。检查所有useOperation调用页，含问卷正式化/替换；按钮成功文案、跳转和结果处理对应原动作。用mock网络失败单元检查及至少一条真实页面交互验证，不能只检查禁用样式。

这两项修改要写进本轮增量记录，不篡改P2-008历史结论。当前审阅窗口仅指出问题，没有实施修复。

## 3. 统计范围、完整性与计数定义

实现 X01/X02/X03。统计对象严格为 questionId + questionVersionId，同身份不同正式版、派生新身份不合并。

- 仅本人创建问卷的publication绑定参与，draft排除。源题作者/共享者/模板作者不因身份得到他人答案权限。
- surveyIds可选，最多100且每个须本人；不能静默丢掉非法/越权ID后给部分成功。不传时选择本人问卷，不隐含全部用户。
- 即便共享已撤销，当前账号已保存的本人publication仍可统计固定版；不要用LibraryService.requireAccess的当前共享条件误阻存量，也不能因此读取源题其他版本或他人问卷。
- 范围内核对survey owner、snapshot、binding.snapshotHash/contentHash、版本所属、实例及完整映射。不能只查已有匹配binding后漏掉整组缺失的来源映射；也不要复用全库verifySourceCoverage让无关用户的坏问卷阻塞本人的统计。明确相关范围的完整性门禁及失败语义。
- 历史多发布版按response自己的surveyDefinitionVersion精确匹配对应publication，再按answers.questionId=instanceId关联；去重键(responseId,instanceId)，避免多发布映射与答卷join相乘。
- surveyCount按实际统计范围的问卷去重，回答计真实提交份数，非去重人数。幂等重放不多算，允许重复的另一次真实提交另计。
- eligibleResponseCount为含目标题版的合法答卷数；用对应完整历史快照及原答案重算路径：未到达skipped，到达可选未答unanswered，非空有效answered。eligible=answered+skipped+unanswered；不能只凭答案缺省猜跳过，不能将缺失/空白补0。非法历史/未知答案/损坏映射显式报错，不少算后声称完整。
- 迁移审计发现同版历史重复实例时，按已有legacyMultiplicity策略阻断进入未经确认的统一统计并列明原因；不要偷偷按人或按答卷合并，也不新增含糊分母。

## 4. 四题型和数值精度

- single：固定正式版选项，补齐0次选项；百分比分母answered。
- multiple：每份每选项至多计一次，分母answered；合计百分比可以超过100%，不改成总勾选次数百分比。
- text：有效回答数及X02原文分页，Unicode边界沿原规则。
- number：0有效，Decimal128精确均值/最小/最大、X02原文及X03按数值升序的频数。禁止Number/parseFloat后计算或用字符串字典序排列0/2/10。规范化1、1.0、1e0为同数学值，Long安全范围处理保持。
- boundaries为2—21个严格递增可精确Decimal字符串；按合同处理欠界、半开区间、最后闭区间和超界桶，不猜“年龄”等业务语义，不重复计边界。
- 无数据计数0、均值/min/max为null、原文空、百分比null，选项仍齐全；具体DTO以主契约为准，不自创字段。
- 查询应按MongoDB索引/聚合和受控路径计算；若路径重算需应用处理，明确容量/批次及一致快照策略，禁止无提示截断样本当全量。索引新增需证明查询需要并同步Schema精确核验，不无故新增业务集合或冗余缓存。

## 5. 真实快照分页和权限

X01短一致只读快照。X02/X03跨HTTP页使用首次实际MongoDB snapshot时刻：首批取得真实atClusterTime，cursor签名绑定它、actor、endpoint、题/版、规范排序surveyIds、排序点、过期时间；后批按同atClusterTime读，causalConsistency=false，不跨HTTP持有长事务，不在事务中强塞atClusterTime。

按现有API契约和实际驱动验证底层命令及时间戳提取，不猜不存在的驱动字段。不得用submittedAt<=asOf替代数据库快照，必须覆盖首批前接受但之后才提交的写入。asOf仅显示时间。每页先按当前权限验本人问卷，再读固定历史数据。

数值频数游标用Decimal数值位置；相同值/时间的稳定次序完整。跨actor/版本/筛选/端点cursor拒绝。过期或SnapshotTooOld统一409 REPORT_SNAPSHOT_EXPIRED+reloadRequired，提示重开第一页；不静默换新快照。错误details沿用白名单，匿名响应无账号、requestId/hash等内部字段。

## 6. API、页面和验收

注册X01—X03及query白名单、405/Allow、认证、strict参数/重复query拒绝、错误和DTO。前端新增清晰“跨问卷题目统计”入口，明确选固定版和本人问卷范围、空态/加载/错误、数值区间及频数/原文翻页；显示统计时点和按回答份数口径。原统计入口保持。页面刷新/直接导航可用，不用假数据/localStorage保存业务结果。

至少实测：

1. P2-T20—T23手算fixture：本人A发布1/2和B发布1同Q/v1回答0/10/20/30，另一次合法跳过，均值15，answered4/eligible5/skipped1；派生F/v1、Q/v2及他人D排除。boundaries=0,18,30,121桶0/2/1/1/0。
2. 再添到达可选未答、无数据、真重复与同key重放，三项恒等及分母正确；多选a,b数据每选项2/3，文本和数字分页手算。
3. 越权surveyIds、源题作者读他人答案拒绝；共享撤销后的本人旧publication仍可统计；匿名字段白名单；相关坏映射拒绝、无关坏问卷不扩大统计范围。
4. limit1跨页无重复漏项，数字0/2/10、同值频数；并发新提交、早接受晚提交、历史窗口过期、旧cursor跨scope和当前权限复验。mock不能替代真实快照查询验证。
5. 原分版统计与新跨卷结果并存；旧快照/答卷/hash指纹不变，统计请求零业务写入。
6. 浏览器完整范围选择/四型统计/区间/原文翻页/错误刷新；两项前端审阅修正的真实检查。

运行typecheck/build、shared领域/错误/冷导入、受影响W03/W04测试、十三集合原功能等价回归和新增统计测试/浏览器；baseline套件适当回归，不能仅跑四集合证明新版可用。所有写fixture只在新唯一project2_test_*，不改两个应用库业务数据、不drop。保留失败和有意义定向重跑。

新增 `docs/phase2/cross-survey-statistics.md`，同步需求—数据库/索引—API—算法—页面—实际测试的第一阶段到本轮变更链、机器契约、当前状态和README；P2-009证据保存命令/退出码/目标/原始失败和手算对照。AI日志只追加，保留前缀。不得把W06/W07或全部50用例标完成。

最终给出真实文件入口、启动/页面操作、精确手算及权限/分页结果、旧数据零变动证据、测试退出码与未执行项；完成W05后停止，不自动实施W06，除非用户另行把两份Prompt一并授权执行。
