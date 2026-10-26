# W02剩余、W03、W04实际实施与验收

2026-10-23，执行[P2-008原始Prompt](prompts/P2-008-w02-w03-w04-integrated.md)。**W02剩余、W03、W04已完成本轮授权范围。** [逐项覆盖](w02-w04-coverage.md) · [全部原始命令结果](../testing/phase2-runs/P2-008/README.md) · [机器汇总](evidence/P2-008-summary.json) · [最终保护核对](evidence/P2-008-static-check.json)。未进入W05/W06/W07。

## 实际增量与文件入口

| 段 | 第一阶段原样 → 本轮修改及原因 | API/页面与兼容 | 真实验收 |
| --- | --- | --- | --- |
| W02剩余 | 复用领域/十三集合/来源回执基础；新增独立phase2应用入口及受控升级工具 | config.ts、app.ts、main-phase2.ts、phase2-initialize/context/migration.ts；独立app_v2，不升级app_v1 | 非空BSON备份恢复/计划/中断重跑/旧key、双模式启动/Schema/隔离通过 |
| W03 | 本地Question → 独立题身份/编辑草稿/不可变正式版，复用Content codec和完整回执 | core/library.ts、library-routes.ts、shared/library-types.ts；L01—L09/B01—B06；QuestionLibrary/Editor/BanksPage | 任意父版、恢复保草稿、派生保源、CAS、回滚、题库墓碑竞态、分页通过 |
| W04 | owner内部组合 → 指定用户共享、实际共同写门闩、问卷来源工作流、Usage | survey-sources.ts、question-usage.ts、source-read.ts；G01—G03/I00—I04/U01；编辑器来源面板、picker/share组件、UsagePage | 真实4交错、撤销存量/禁止扩权、旧历史不变、三态/隐私/容量、共享浏览器链通过 |
| 原功能 | 原四集合路径保留；新十三集合显式正式化后原六类行为继续可用 | 原Q03/Q05/V01、versions/submission/reporting/editing和原Vue填写/统计复用 | baseline七模块+账号集成，phase2六类等价回归、两条浏览器链通过 |

`question_versions`只显式保存建版；普通草稿编辑不建版，无变化不增revision。恢复新号，parent/restoredFrom指所选旧版，保留当前草稿和全部中间历史。派生建自己的身份/v1，父边不跨身份，固定来源及后续正式保存/恢复不清除distributionSource；公开分发资格服务仍待W06。

新引用、换版、派生与授予/撤销对同question_items实际$inc accessFence，在同session核授权并写业务，OID顺序稳定。门闩不作为客户端修订。撤销先提交拒新扩权；新增先提交成为存量，包含未发布草稿，仍能配置维护、首次发布、重发和填写。删实例后不能借历史重新添回。成功旧key先重放历史完整回执，不读取当前题/卷/授权，也不恢复已删实例。

正式绑定的Q05只允许Config/顺序/删除，改Content返回409 QUESTION_CONTENT_REQUIRES_VERSION。本地题须显式I04正式化或选正式版，发布未正式化内容422 UNSAVED_QUESTION_CONTENT，绝不偷偷建题版。新版只提示，收集中先暂停，用户明确替换；规则不兼容要求reviewedJumpRules，失效选项返回问题且阻发布。相同Content换正式版仍增加定义修订/dirty。新survey格式3，独立usageNumber；新snapshot格式2+bindingHash；旧snapshot1和responses不补来源、不改hash。

S04已确认并统一到新HTTP与旧owner内部组合：单草稿/单新发布中同题同版最多一实例，另一正式版允许；不增加误伤历史多发布的unique。Usage先versionId过滤，按卷/版去重计算草稿/当前/非当前历史，再卷汇总；派生另列、仅题owner可查。他人输出只用户名/独立编号/版本/三态，不含surveyId/publicId/标题/管理填写链接/答卷量或答案。

## 启动及页面完整流程

当前独立实例`localhost:27019/rs0`；四集合`project2_app_v1`原状保留，十三集合`project2_app_v2`已显式初始化且未写入样例账号/业务。`.env`字节不变并有私有备份；`.env.phase2`为独立密钥，受Git忽略。本轮使用既有锁依赖，没有安装/升级。

```powershell
Set-Location -LiteralPath 'D:\大三\数据库\pj1_2'
npm.cmd run db:start
npm.cmd run configure:phase2
npm.cmd run db:init:phase2
# 两个终端分别启动
npm.cmd run dev:api:phase2
npm.cmd run dev:web:phase2
```

浏览器`http://localhost:5200`注册/登录。导航“题目”创建四型草稿→保存编辑草稿→明确保存正式版→版本历史选基线/恢复/派生；“题库”新建/改名/加移成员/删除。新建问卷→从本人/共享/题库选明确正式版→配置必答/规则→发布→填写→原分版统计。编辑器本地题先保存，再点“保存为正式题目”。题目页按注册用户名授权；B用“共享给我”选用，A保存v2后B暂停/主动换版/重发；撤销后B保留旧实例、新引用和派生被拒。题目“查看使用情况”支持版本筛选/翻页/派生分支。

baseline仍用原`dev:api/dev:web/start`与`.env`；两个模式共用3200/5200，不同时启动，先核空闲及进程归属。`npm.cmd run build`后可`npm.cmd run start:phase2`；直接3200静态同源访问须同步修改仅.env.phase2的Origin/PublicURL为3200，Vite则5200。配置/初始化不会覆盖不匹配旧结构，应用/ready只验不修。

日常核验`node scripts/run-check.mjs verifyruntime`报告app_v1实际数量，无永久空库要求；`node scripts/run-check.mjs verifyphase2`核app_v2精确Schema/索引和来源覆盖。`verifyinitial`仅首次空库验收。回退只切回独立baseline入口，不能用旧入口写十三集合。

## 非空合成迁移与恢复

最新成功run `1792766698494_aee58e9b`：源`project2_test_p2008_source_1792766698494_aee58e9b`；实际恢复目标`project2_restore_1792766698494_aee58e9b`及`project2_test_p2008_migrated_1792766698494_aee58e9b`。精确manifest绑定本项目marker代际，普通API拒restore、迁移拒app_v1/app_v2/P1。备份/固定计划/journal只在`.local/p2-008/migrations/<runId>`；可执行命令与受控目标见[迁移说明](data-migration-plan.md)。

两用户、两问卷、六发布快照、六答卷、四题型与历史相似文本多实例、BSON Long。BSON逻辑备份恢复完整文档类型、选项/索引；snapshot一致读取+元数据复核，不是mongodump/文件复制。固定计划`edb383bf-e599-480c-916f-aaadf5dd013b`，sourceHash `37a9a418c6815af1de9f7d3128efc119932c5ba4bf41e89e6ad3016f6ce9ef82`。dry-run前后源/目标指纹相等；Config变化共Content版，不同卷不合并；共10身份/12正式版/40绑定，来源unrecorded/null父边，本地新题仍未正式化。

真实事务commit后journal前注入中断；丢journal重跑1skip/1commit，第三次2skip/0commit且指纹不变。两恢复目标均实写；另一个恢复目标故意改可变题revision后apply目标行冲突阻断，指纹不变；保留负例不覆盖。正向验收后只在合成源注入漂移，固定sourceHash阻断且目标不变。缺快照/owner及精确未知格式9均阻断，坏目标不建对象。所有旧快照/答卷BSON、原ID/publicId/字段/策略/hash/累计及当前计数不变。另新十三集合迁移应用读旧快照/统计，原Publication-Key及提交key重放200、原结果和整库指纹不变。

## 实际验证与可复现命令

统一设置`$env:PHASE2_RUN_ROOT='docs/testing/phase2-runs/P2-008'`，执行`node scripts/run-check.mjs NAME`。下表为各检查最后成功记录，所有exitCode=0；全部重复、首次非零与修复说明保留于[证据目录](../testing/phase2-runs/P2-008/README.md)。

| NAME | 实际结果 | 原始证据 |
| --- | --- | --- |
| migration | 非空备份/两个真实恢复/固定计划/中断重跑/目标冲突/源漂移/未知格式 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-44-57-928Z-migration-4f5dd79e/output.log) |
| migratedapi | 迁移后旧快照/统计及原发布/提交key，整库无写入 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-39-01-036Z-migratedapi-e91d2a3a/output.log) |
| versionsbanks | 7子项+父；草稿、版本父边/恢复、CAS/回滚、派生、多库/删除屏障 | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log) |
| surveyssharingusage | 12子项+父；四型、共享、4个真实门闩交错、存量首次发布、Usage/规则/容量 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log) |
| httpreceipts | 8类真实HTTP原成功DTO，实例/题库删除后重放、当前资源读取0、指纹不变 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-44-45-439Z-httpreceipts-a6e1685d/output.log) |
| phase2compatibility | 6子项+父；十三集合原六类、Decimal/Unicode/匿名/重复/状态/历史/分页 | [日志](../testing/phase2-runs/P2-008/2026-10-23T11-26-08-165Z-phase2compatibility-8ef0edad/output.log) |
| usagecapacity | 1001合成正式版容量422、精确版本筛选200、无写入 | [日志](../testing/phase2-runs/P2-008/2026-10-23T11-41-45-812Z-usagecapacity-bfb7bc59/output.log) |
| phase2browser | 本人链/共享链；320/768/1024/1440无溢出、无pageerror；HTTP/DB核验 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) |
| phase2targets | 2项；双入口/app库/restore/P1拒绝，connect哨兵0 | [日志](../testing/phase2-runs/P2-008/2026-10-23T11-29-59-975Z-phase2targets-205ee2b6/output.log) |
| phase2startup | 实际app_v2 API/Vite十探针、前后监听PID归属、子进程释放 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-39-34-113Z-phase2startup-0d9a46c1/output.log) |
| schemafoundation | 13集合接受69/拒绝71/13业务唯一索引/全部28业务索引及门禁 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-38-09-796Z-schemafoundation-dbe1cf39/output.log) |
| bindingsreceipts | 13子项+父；完整回执、CAS、真实事务/回滚、S04内部无写入负例 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-40-13-008Z-bindingsreceipts-ef36706d/output.log) |
| phase1 | 原publish/flow/submit/statistics/edges/pagination/browser七模块 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-38-11-748Z-phase1-8dc91ad1/output.log) |
| integration | 原账号/草稿/隔离/事务13子项+父 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-39-02-346Z-integration-d9fc6185/output.log) |
| isolation | 原配置与误连负例14项 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-39-11-553Z-isolation-131d919d/output.log) |
| runtimereview | 6项；编译API实例归属、已有服务拒测、PID错误及正常非空日常核验 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-39-12-362Z-runtimereview-1e87b550/output.log) |
| verifyruntime | app_v1精确四集合、实际数量0、日常不要求空库 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-39-55-725Z-verifyruntime-8fb2b8d8/output.log) |
| verifyphase2 | app_v2精确十三集合、来源覆盖 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-39-58-553Z-verifyphase2-b16fa149/output.log) |
| typecheck | shared/api/vue-tsc全部退出0 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-40-26-939Z-typecheck-bf8ef0d5/output.log) |
| build | shared/api/web构建退出0；保留既有Vite警告 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-40-32-891Z-build-53a6394b/output.log) |
| domain | 领域4+Content400/422/异常8+源/编译冷导入8，共20项 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-40-39-579Z-domain-20de1e6b/output.log) |

真实并发：不同key同revision一成功一409，同key一份正式版/回执；题库删除先提交阻止并发加成员；attach/fork新增先commit成存量、撤销先commit零新增。保存题版后、答卷后、回执前故障均在真实事务中回滚，指纹/计数核验；响应丢失/未知提交标签是明确钩子，不声称真实断网。八类业务回执全部历史DTO保持，W06两类模板仅基础codec覆盖。

最终截图实际查看320及1440题目编辑与共享Usage：窄屏无横向溢出、表单和主要动作可达，恢复后未保存编辑仍保留；使用页无他人标题。复用蓝色tokens/原QuestionCard/RuleEditor，未重做原工作台。

## 失败、修复与分段检查点

先完成保护摘要779文件、app_v1只读指纹与.env私有备份。检查点1完成迁移算法/恢复；检查点2完成W03/W04服务/API/页面；检查点3完成双模式等价回归、两条浏览器链、角色/文档/日志和最终保护。原始失败文件不删除，不把检查点当当时整轮完成。

1. 类型首次失败：BSON.serialize返回Uint8Array，显式Buffer包装后通过。
2. 迁移首次夹具科学计数法未走原normalizeQuestions，hash不一致正确被阻；修正夹具后通过，未改原hash。
3. W04首次库名64字符被Mongo拒绝；缩短测试前缀并初始化异常关连接，仅清理确认属于本轮的失败Node进程树。
4. W04末例触发原每IP限流；harness按逻辑客户端用不同回环地址，生产限流未放宽。
5. 浏览器首次断言对准预览未显示的标题；改验实际选中版本和预览内容。
6. 浏览器随后发现来源组件重挂载未释放编辑锁；修正即时锁watch/adopt与待确认离开提示，受影响全链复跑通过。后续窄屏padding及“内容校验”文案调整后两链再次通过。

## 权限与部署限制

`scripts/app-role.mongosh.js`已更新P2专用app_v2/test模板：users/正式题版/快照/答卷/回执只插读；surveys/items/banks/grants按需更新；成员与绑定允许应用受控增改删，publication行仅应用层只插读；模板相关集合暂只读。只提供归属门禁必需的getCmdLineOpts/serverStatus/replSetGetConfig诊断和listCollections/listIndexes。用户认证记录本轮无更新需求，因此users无update。

迁移使用另身份：合成源四集合find/listCollections/listIndexes只读；精确恢复目标拥有createCollection/createIndex/collMod及计划所需insert/update/find；不需要dropDatabase/dropCollection/remove旧事实，不能把DDL给应用身份。跨库备份/恢复权限只列manifest精确目标，不能全project2前缀授权。当前本地实例未开启认证，未创建角色/认证用户，也未实测MongoDB角色强制；API应用权限和模板不能冒充部署安全验收。后续部署需管理员按本机版本实际验证账号分权，不能本轮重启重配实例。

## 保留边界及剩余事项

原P1目录/27018未修改或连接；旧Prompt、冻结14文档、历史证据和AI日志旧字节前缀保留；锁文件/.env不变。新app_v2独立空业务库可注册使用，app_v1仍四集合且前后元数据/索引/内容摘要一致。测试库/恢复库全部保留，无清库、无Git提交推送。最终测试API/Vite已释放，仅专用Mongo27019保留；[实际监听记录](evidence/P2-008-processes-after.json)。静态默认diff检查把CRLF当行尾空白，原始非零输出[保留](evidence/P2-008-diff-check.log)；仅命令级按cr-at-eol复核为0，不改全局Git配置或批量换行。

W05跨问卷答案统计、W06公开模板全链授权/广场、W07真实P1迁移及最终Word/PDF仍未完成；S05/S06仍待确认。Usage覆盖门禁当前全量扫描问卷及全部历史，适用于课程规模，不宣称生产吞吐；单节点无高可用/故障切换测试；既有构建app-config脚本和图表chunk警告保留。实际验收供另一个窗口审查，未代写人工认可。
