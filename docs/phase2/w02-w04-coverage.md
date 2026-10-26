# P2-008需求、端点、页面及测试覆盖

2026-10-23，真实执行由本窗口AI工具完成；不冒称人工操作或教师验收。原始输入/预期仍在[实施测试计划](implementation-test-plan.md)，这里记录本轮实际覆盖；HTTP脱敏响应及数据库断言均在对应artifacts，截图不替代事务证据。

| 段/需求 | 原实现与实际增量 | 文件/API/页面 | 验收 |
| --- | --- | --- | --- |
| W02剩余 | 四集合兼容路径保留；受控迁移/备份恢复及app_v2十三集合入口 | phase2-migration.ts、phase2-initialize.ts、config.ts、main-phase2.ts、migrate-phase2.ts | 非空真实恢复、固定计划、apply中断/重跑、旧key重放、配置/Schema/启动负例通过 |
| W03 / R01/R03/R04/R05/R07 | 独立草稿、显式正式版、任意父版、恢复新号保草稿、固定派生、多库及墓碑 | core/library.ts、library-routes.ts；L01—L09/B01—B06；4个新页面中的题目/编辑/题库 | HTTP版本/CAS/回滚/多库/分页/删库屏障及本人浏览器链通过 |
| W04 / R02/R05/R06 | 共享实际门闩、固定引用/替换/正式化/发布、撤销存量权、逐版Usage | survey-sources.ts、question-usage.ts、source-read.ts、publication/versions/submission；G/I/U；来源面板/使用页 | 4个真实屏障交错、撤销前未发布草稿首次发布填写、隐私/状态/容量、共享浏览器链通过 |
| 未完成 | R08跨卷答案统计、X01扩展模板/公开分发、真实P1切换及最终报告 | W05/W06/W07 | 未实现，不以Usage或Schema代替；S05/S06待确认 |

## 实际新增端点（24项）

| 编号 | 实际路径 | 页面入口 | 对应测试 | 状态 |
| --- | --- | --- | --- | --- |
| P2-L01 | `POST /api/v1/questions` | /questions、/questions/:questionId | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-L02 | `GET /api/v1/questions/:questionId/draft` | /questions、/questions/:questionId | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-L03 | `PUT /api/v1/questions/:questionId/draft` | /questions、/questions/:questionId | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-L04 | `POST /api/v1/questions/:questionId/versions` | /questions、/questions/:questionId | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-L05 | `GET /api/v1/questions/:questionId/versions` | /questions、/questions/:questionId | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-L06 | `GET /api/v1/questions/:questionId/versions/:versionId` | /questions、/questions/:questionId | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-L07 | `POST /api/v1/questions/:questionId/restorations` | /questions、/questions/:questionId | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-L08 | `POST /api/v1/question-versions/:versionId/forks` | /questions、/questions/:questionId | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-L09 | `GET /api/v1/questions` | /questions、/questions/:questionId | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-B01 | `POST /api/v1/question-banks` | /question-banks | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-B02 | `GET /api/v1/question-banks` | /question-banks | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-B03 | `PATCH /api/v1/question-banks/:bankId` | /question-banks | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-B04 | `POST /api/v1/question-banks/:bankId/deletion` | /question-banks | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-B05 | `GET /api/v1/question-banks/:bankId/members` | /question-banks | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-B06 | `PUT /api/v1/question-banks/:bankId/members/:questionId` | /question-banks | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-G01 | `GET /api/v1/questions/:questionId/shares` | 题目页指定用户共享 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-G02 | `PUT /api/v1/questions/:questionId/shares` | 题目页指定用户共享 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-G03 | `POST /api/v1/questions/:questionId/shares/:grantId/revocation` | 题目页指定用户共享 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-I00 | `GET /api/v1/surveys/:surveyId/question-sources` | /surveys/:surveyId 来源面板 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-I01 | `POST /api/v1/surveys/:surveyId/question-references` | /surveys/:surveyId 来源面板 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-I02 | `POST /api/v1/surveys/:surveyId/questions/:instanceId/replacement` | /surveys/:surveyId 来源面板 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-I03 | `GET /api/v1/surveys/:surveyId/question-updates` | /surveys/:surveyId 来源面板 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-U01 | `GET /api/v1/questions/:questionId/usage` | /questions/:questionId/usage | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |
| P2-I04 | `POST /api/v1/surveys/:surveyId/questions/:instanceId/formalization` | /surveys/:surveyId 来源面板 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log)；[浏览器](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) | 已实现 |

## 用例实际范围

| 用例 | 实际输出与范围 | 证据 |
| --- | --- | --- |
| P2-T01 | 通过：十三集合显式正式化后原六类功能，另保留四集合原断言 | [日志](../testing/phase2-runs/P2-008/2026-10-23T11-26-08-165Z-phase2compatibility-8ef0edad/output.log) |
| P2-T02 | 通过：十三集合显式正式化后原六类功能，另保留四集合原断言 | [日志](../testing/phase2-runs/P2-008/2026-10-23T11-26-08-165Z-phase2compatibility-8ef0edad/output.log) |
| P2-T03 | 通过：十三集合显式正式化后原六类功能，另保留四集合原断言 | [日志](../testing/phase2-runs/P2-008/2026-10-23T11-26-08-165Z-phase2compatibility-8ef0edad/output.log) |
| P2-T04 | 通过：十三集合显式正式化后原六类功能，另保留四集合原断言 | [日志](../testing/phase2-runs/P2-008/2026-10-23T11-26-08-165Z-phase2compatibility-8ef0edad/output.log) |
| P2-T05 | 通过：十三集合显式正式化后原六类功能，另保留四集合原断言 | [日志](../testing/phase2-runs/P2-008/2026-10-23T11-26-08-165Z-phase2compatibility-8ef0edad/output.log) |
| P2-T06 | 通过：十三集合显式正式化后原六类功能，另保留四集合原断言 | [日志](../testing/phase2-runs/P2-008/2026-10-23T11-26-08-165Z-phase2compatibility-8ef0edad/output.log) |
| P2-T07 | 通过：普通编辑不生版、任意父版/恢复、正式版并发及整事务回滚 | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log) |
| P2-T08 | 通过：普通编辑不生版、任意父版/恢复、正式版并发及整事务回滚 | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log) |
| P2-T09 | 通过：普通编辑不生版、任意父版/恢复、正式版并发及整事务回滚 | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log) |
| P2-T10 | 通过：普通编辑不生版、任意父版/恢复、正式版并发及整事务回滚 | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log) |
| P2-T11 | 通过：四型引用/正式化、共享/撤销存量/禁止扩权、真实门闩及Usage隐私 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log) |
| P2-T12 | 通过：四型引用/正式化、共享/撤销存量/禁止扩权、真实门闩及Usage隐私 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log) |
| P2-T13 | 通过：四型引用/正式化、共享/撤销存量/禁止扩权、真实门闩及Usage隐私 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log) |
| P2-T14 | 通过：四型引用/正式化、共享/撤销存量/禁止扩权、真实门闩及Usage隐私 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log) |
| P2-T15 | 通过：四型引用/正式化、共享/撤销存量/禁止扩权、真实门闩及Usage隐私 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log) |
| P2-T16 | 通过：四型引用/正式化、共享/撤销存量/禁止扩权、真实门闩及Usage隐私 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log) |
| P2-T17 | 通过：四型引用/正式化、共享/撤销存量/禁止扩权、真实门闩及Usage隐私 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log) |
| P2-T18 | 通过：四型引用/正式化、共享/撤销存量/禁止扩权、真实门闩及Usage隐私 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log) |
| P2-T19 | 通过：同题多库、改名/移出/墓碑、删除先提交与成员操作冲突 | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log) |
| P2-T20 | 未执行：W05跨问卷答案统计 | 后续任务 |
| P2-T21 | 未执行：W05跨问卷答案统计 | 后续任务 |
| P2-T22 | 未执行：W05跨问卷答案统计 | 后续任务 |
| P2-T23 | 未执行：W05跨问卷答案统计 | 后续任务 |
| P2-T24 | 未执行：W06公开授权/模板 | 后续任务 |
| P2-T25 | 未执行：W06公开授权/模板 | 后续任务 |
| P2-T26 | 未执行：W06公开授权/模板 | 后续任务 |
| P2-T27 | 未执行：W06公开授权/模板 | 后续任务 |
| P2-T28 | 未执行：W06公开授权/模板 | 后续任务 |
| P2-T29 | 通过：合成恢复副本，全历史/BSON/hash/跨卷不合并/未知格式阻断 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-44-57-928Z-migration-4f5dd79e/output.log) |
| P2-T30 | 通过：真实commit后journal前中断、丢journal恢复1skip/1commit、再次2skip/0commit、源漂移及目标行冲突不覆盖 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-44-57-928Z-migration-4f5dd79e/output.log) |
| P2-T31 | 通过：合成四集合BSON备份、两个真实恢复目标；逐字段逐类型/索引/元数据核验；未迁移P1 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-44-57-928Z-migration-4f5dd79e/output.log) |
| P2-T32 | 通过：双入口/连接前后实例与库保护、错误Schema/index拒绝，app_v2真实启动；app_v1不变 | [日志](../testing/phase2-runs/P2-008/2026-10-23T11-29-59-975Z-phase2targets-205ee2b6/output.log) |
| P2-T33 | 通过：新同题同版422且无写入、不同版共存、历史多发布保留；相似旧实例独立审计而不冒称已证同身份 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log) |
| P2-T34 | 部分：本轮回归/截图/文档/日志完成；完整第二阶段及最终报告尚待W05—W07 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) |
| P2-T35 | 部分：8类已实现业务均真实HTTP首次提交，删除实例/题库后完整DTO重放、资源读取哨兵0、DB指纹不变；10类基础codec已测；模板2类待W06 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-44-45-439Z-httpreceipts-a6e1685d/output.log) |
| P2-T36 | 未执行：模板并发选用属W06；保留独立accessFence设计 | 后续任务 |
| P2-T37 | 未执行：公开分发/模板全链授权属W06 | 后续任务 |
| P2-T38 | 部分：派生后save/restore均保留精确distributionSource；再次派生公开资格未实施 | [日志](../testing/phase2-runs/P2-008/2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log) |
| P2-T39 | 未执行：公开分发/模板全链授权属W06 | 后续任务 |
| P2-T40 | 未执行：公开分发/模板全链授权属W06 | 后续任务 |
| P2-T41 | 未执行：公开分发/模板全链授权属W06 | 后续任务 |
| P2-T42 | 部分：原生original、派生derived、旧导入unrecorded已实测；公开资格未实施 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-44-57-928Z-migration-4f5dd79e/output.log) |
| P2-T43 | 部分：Schema来源互斥/客户端伪造拒绝已测；公开proof全链服务待W06 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-38-09-796Z-schemafoundation-dbe1cf39/output.log) |
| P2-T44 | 未执行：公开分发/模板全链授权属W06 | 后续任务 |
| P2-T45 | 部分：撤销后的已有派生编辑/自用/重放已测；模板和跨卷统计未实施 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log) |
| P2-T46 | 通过：逐版混合/三态/非当前历史/先过滤，无匹配不返回空壳；暂停/关闭保最后指针 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log) |
| P2-T47 | 通过：逐版混合/三态/非当前历史/先过滤，无匹配不返回空壳；暂停/关闭保最后指针 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log) |
| P2-T48 | 通过：逐版混合/三态/非当前历史/先过滤，无匹配不返回空壳；暂停/关闭保最后指针 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log) |
| P2-T49 | 通过：逐版混合/三态/非当前历史/先过滤，无匹配不返回空壳；暂停/关闭保最后指针 | [日志](../testing/phase2-runs/P2-008/2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log) |
| P2-T50 | 通过：稳定分页/scope/每页验权/字段白名单；1001正式版容量422，限定版本正常；浏览器无他人标题 | [日志](../testing/phase2-runs/P2-008/2026-10-23T11-41-45-812Z-usagecapacity-bfb7bc59/output.log) |

## 测试解释与限制

并发采用真实27019/rs0事务和可控钩子屏障。attach/fork各测试新增先commit及撤销先commit，分别1次效果/0次效果；同key一次结果、不同key同修订一成功一409。故障钩子触发后查询真实数据库证明回滚或commit后回执可重放；未做断网、宕机或选主。

Usage容量用1001条符合严格Schema的合成历史/绑定构造边界，不声称1001次人工/浏览器操作。迁移未知格式使用新库精确format9验证器，未弱化已有验证器。保留失败库及所有原始非零记录，不drop。数据库认证角色仍只模板，真实P1迁移和公开功能不能据此标通过。
