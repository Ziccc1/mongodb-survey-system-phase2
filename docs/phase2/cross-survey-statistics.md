# W05跨问卷同题同正式版本统计

执行[P2-009](prompts/P2-009-w05-cross-survey-statistics.md)。本轮先修复两项W04前端审阅问题，再增加X01—X03真实服务/页面。所有夹具只在新唯一project2_test_*；保留app_v1/app_v2和P1。W06由用户另行联合授权，W05验收后继续；W07不实施。

## 前后增量与实现

第一阶段reporting按问卷/发布号统计，W04提供固定题来源和Usage；本轮保留这两个入口，新增core/cross-statistics.ts、cross-statistics-routes.ts、shared/cross-statistics-types.ts与CrossStatisticsPage.vue。API为GET /api/v1/question-statistics/:questionId/versions/:versionId及/answers、/distribution，纳入原query白名单/重复参数拒绝/405/认证门禁。不新增集合、索引或应用库DDL。

题目编辑页正式保存成功且本地未发生新编辑时，adopt服务器新的草稿base/revision/dirty基准；恢复只更新服务器修订，保留未保存内容。useOperation保留原path/body/key，并在发请求前明确拒绝不同path或body；未知请求锁其他动作/版本/规则，处理结果与原动作对应。QuestionEditor、来源面板、题目列表和题库等全部消费者已核对，未丢弃未知操作换动作。单元mock网络失败和真实Edge“服务已commit但响应丢失”的恢复原key确认均有证据；不是只有禁用样式。

## 范围、完整性与算法

只统计本人publication，显式surveyIds最多100且全部须本人；默认选本人范围。先从当前所有权集合核权限，再在固定snapshot内枚举同一范围的全部问卷/全部发布，完整检查每份快照与来源，即使整个匹配来源组被删除也不能遗漏。显式范围外/其他用户的坏问卷不阻塞；默认全部本人范围内的坏历史会阻断，而不是少算后宣称完整。已撤销共享但保留本人publication仍可统计；源作者不能读他人问卷。未持有该固定版的作者/当前share/本人publication权利返回404。

readSourceSet核owner/正式版/Content/定义hash/publication binding，额外核publishedBy与问卷owner、当前指针及答卷发布引用。按response自身surveyDefinitionVersion匹配对应快照，再以instanceId重算evaluateAnswers路径；payloadHashVersion2/hash及规范化答案核验，非法历史503 REPORT_DATA_INVALID。缺映射503 QUESTION_MAPPING_INCOMPLETE；历史同题同版多个实例明确legacyMultiplicity阻断，不删旧实例/答案。计数为真实提交份数，eligible=answered+skipped+unanswered；跳过/可选未答不补0。

四型共用原校验/Unicode/Decimal：选择题补齐零选项，multiple每份每选项一次、百分比分母answered；文本原文分页；数值均值/min/max用真实MongoDB Decimal128聚合，频数按Decimal128值group/sort，数学同值1/1.0/1e0归一。区间2—21个严格递增Decimal，含欠界/超界、中间半开、最后给定区间闭右端。无数据count0/null均值/百分比，原文空。原分问卷各发布版与新结果共存。

受控容量：默认最多1000本人问卷、每次最多5000份快照及100000份匹配答卷；游标batchSize=200，聚合/返回BSON最大2MiB，超限422 REPORT_SCOPE_TOO_LARGE提示限定范围，绝不截样本当全量。相关快照与路径在应用中逐批重算，Decimal聚合在MongoDB执行；课程规模方案，不宣称无界吞吐。现有surveys.owner索引、survey_versions唯一(surveyId,version)、binding来源唯一/owner索引、responses发布/原文索引和_id聚合足够，不为本轮改应用库索引。

## 实际数据库快照分页

[MongoDB官方snapshot说明](https://www.mongodb.com/docs/manual/reference/read-concern-snapshot/)及已安装mongodb7.7.0源码sessions.ts均已核对。使用事务外snapshot session、causalConsistency=false；首个真实find由服务器选择并返回cursor.atClusterTime，驱动存于snapshotTime。该实际字段被@internal从发布.d.ts剥离，因此采用局部、版本锁定的类型桥；首批没有真实Timestamp则503 REPORT_SNAPSHOT_UNAVAILABLE，未猜operationTime或submittedAt。

X01短只读一致快照；X02/X03第一页保存真实Timestamp、显示asOf及5分钟到期，后页新建短session并固定相同snapshotTime，不跨HTTP保留事务。当前权限每页先复验；本人问卷集合从相同快照重读并与当前所有权核对，因此新建问卷不混入旧页，失去所有权拒绝。签名scope绑定actor/端点/题版/规范排序surveyIds的SHA256/排序，point只放Timestamp/asOf/到期/排序点，不嵌原文或无界ID数组，100问卷筛选和10000字符原文仍在2048游标门禁内。SnapshotTooOld/窗口失效及到期统一409 REPORT_SNAPSHOT_EXPIRED、reloadRequired；真实过老Timestamp命令已测，不静默改新时刻。

## 真实验收与页面

题目正式历史旁“跨问卷题目统计”，或本人问卷来源面板“统计本人问卷中的此版”；直接页面/question-statistics/:questionId?versionId=...。明确版本、全部/指定本人范围、区间、四型结果、统计时点、原文/数值频数翻页及错误重开。原“分版本统计”不改变。恢复默认phase2启动方法见README。

真实手算：A发布1/2、B发布1同题v1，0/10/20/30及一次合法跳过，surveyCount2、eligible5、answered4、skipped1、unanswered0、均值15，bins(0,18,30,121)=0/2/1/1/0；本人A限定范围均值10。派生99、其他正式版88和他人D100不纳入。single 2/1/0，multiple 2/2/0、每项2/3；文本两条。无数据、可选未答、真重复/key重放、频数0/1/2/10/20/30及1三种表示共计3、越界桶、9007199254740994精确均值均实测。

真实late-commit事务在第一页前insert但之后commit，接受时间故意早于asOf；后页固定旧Timestamp只四条，新第一页五条。记录真实commandStarted的snapshot/atClusterTime且无transaction；过老Timestamp真实返回过期，跨scope/actor/版本/端点、当前owner变化、损坏整组映射/答卷和已证历史同版重复均有负例。读请求前后业务库指纹相同。HTTP响应不含身份、requestId、hash；100范围及长文本cursor有真实长度证据。

完整原始命令、首次失败/修复与逐项用例关联在[本轮证据](../testing/phase2-runs/P2-009/README.md)、[机器汇总](evidence/P2-009-summary.json)。当前测试由AI工具实际执行，未代写人工认可。未安装依赖、未改锁或两个应用库业务数据、未连接P1、未提交推送。
