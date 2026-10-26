# 第二阶段实现与增量设计

更新日期：2026-10-26。第二阶段八项需求和公开模板扩展均已实现；2026-10-25另已完成界面修复、多尺寸与键盘检查、真实旧数据隔离升级及本机数据库认证部署。当前结果见[最终交付核对](delivery-verification.md)，运行与提交材料总入口见[项目README](../../README.md)。

| 范围 | 当前完成情况 | 说明与证据 |
| --- | --- | --- |
| 原工程与独立环境 | 沿用第一阶段代码、四集合核心及原算法；第二阶段使用专用27019/rs0 | [运行基线历史](runtime-baseline.md)、[前后变更](change-analysis.md) |
| 题目、版本、题库、共享、来源与使用查询 | 正式API及页面已实现，支持恢复新增版本、主动换版和撤权存量保留 | [W02—W04实现](w02-w04-implementation.md) |
| 跨问卷统计 | 本人有权问卷内同题同版汇总，四型结果与数据库快照分页已验证 | [统计实现](cross-survey-statistics.md) |
| 模板与公开授权 | 固定模板、选用、上下架及具体题版对发布者授权已实现 | [模板实现](template-square.md) |
| 自动与人工验证 | 10月24日完整34组通过；人工及浏览器辅助选定8卷17答卷、44项存储检查；10月25日完成相关收尾复测 | [自动验收](../testing/phase2-automated-acceptance.md)、[收尾记录](../testing/phase2-runs/delivery-20261025/README.md) |
| 真实旧数据迁移 | 两个独立目标均完成6卷升级，生成16正式题版和35绑定，验证与重跑通过 | [真实迁移](real-migration-verification.md) |
| 认证与角色 | 当前本机MongoDB已启用认证/keyFile，API使用受限身份，20项权限检查通过 | [认证部署](authorization-deployment.md) |
| 报告及AI材料 | 根目录已有作者整合的第二阶段报告；AI提交日志与提示词索引已整理 | [报告](../../PJ1_2.docx)、[AI日志](../ai/phase2-submission-log.md)、[输入来源](../ai/phase2-submission-prompts.md) |

主应用为十三集合 `project2_app_v2`，使用 `.env.phase2` 和 `:phase2` 命令；`project2_app_v1`及原命令仅保留四集合兼容基线。启动与ready只检查，不自动初始化或迁移。真实迁移数据保存在独立目标，当前网站继续使用第二阶段验收数据；S04/S05/S06均已确认实施。

## 阅读顺序与主维护位置

1. [教师共同要求](../../大作业一.docx)、[教师八项变更](../../大作业一：需求变更.docx)、[实际执行Prompt](prompts/P2-002-incremental-design.md)。[正文表格提取证据](evidence/README.md)。
2. [第一阶段冻结索引](../baseline/phase1/INDEX.md)：14份原文，基线提交、来源路径、SHA-256；不是从本轮修改后的文档倒推。
3. [需求与决策](requirements-decisions.md)：P2-R01—R08、扩展P2-X01、已确认规则、已实施S04/S05/S06。
4. [前后变更对照](change-analysis.md)：原来是什么、为何改、改哪里、如何兼容与验证。
5. [数据库主契约](../database-design.md)、[API主契约](../api.md)、[系统职责](../system-design.md)、[事务和统计算法](../key-logic.md)。示例数据见[设计样例](design-fixtures.json)。
6. [数据库与旧数据升级](data-migration-plan.md)：独立实例、预检、备份恢复、旁路映射、重跑/失败路径；与已有[工程迁移记录](migration.md)分别阅读。
7. [实施与测试计划](implementation-test-plan.md)：依赖、完成条件、每例前提/步骤/输入/预期/将来证据；当前逐项执行状态见覆盖表。
8. [二期提交版AI日志](../ai/phase2-submission-log.md)、[提示词来源](../ai/phase2-submission-prompts.md)、[完整过程日志](../ai/phase2-usage-log.md)、[静态核对证据](evidence/README.md)。

第一阶段原始报告继续保留；第二阶段报告为根目录 `PJ1_2.docx`，由作者负责最终内容和排版。第一阶段原测试证据保留原执行日期，第二阶段另有原功能回归与十三集合兼容检查。[回到项目入口](../../README.md)。

## 交付边界

第一阶段实际四集合、不可变问卷发布、提交幂等和分版本统计均沿用。新增独立题身份/正式版本/题库/共享、固定实例来源、模板及跨问卷统计；题目版本与问卷发布版本独立。当前实际使用13集合，独立绑定记录补充来源而不改写旧快照hash。新增使用和撤权在事务中更新共同记录并复查权限，确定并发操作先后结果。

W01—W06及后续界面、真实迁移和认证收尾均有实际记录。网站尚未切换到真实迁移数据；跨设备、公网、真实宕机和主节点切换未验收。第二阶段独立仓库为[Ziccc1/mongodb-survey-system-phase2](https://github.com/Ziccc1/mongodb-survey-system-phase2)，沿用第一阶段Git历史；报告最终确认及课程提交由作者处理。


W02-A导入循环复审（2026-10-23）：用户问题复现并修复，底层改依赖无循环叶模块；新增源码/编译四入口共8个冷进程检查并纳入domain，修复后8项与原领域4项通过，类型/构建/flow均退出0。见[说明与真实证据](schema-foundation.md#shared-import-review)。未访问数据库或重跑完整浏览器；历史结果不覆盖。
