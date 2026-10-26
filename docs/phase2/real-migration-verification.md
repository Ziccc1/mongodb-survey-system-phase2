# 真实一期数据迁移与恢复验证

2026-10-25本轮使用真实一期数据，而非合成fixture。原实例27018已停止；只核实进程及读取目录 `D:\大三\数据库\project1\.local\mongodb-rs0-v2`，没有启动或修改原目录。

## 源和恢复方法

`scripts/migrate-phase1-real.ts` 检查原实例不在运行、目录归属标记及非链接路径，给全部1179文件逐一SHA-256。先复制不可变冷备份，再复制独立工作副本；工作副本在本项目 `.local/w07/1792893806861_811aaed6/` 下以localhost:27020临时运行，原目录保持停止只读。只从工作副本提取 `project1_app_v2` 的真实四集合、验证器、索引及完整BSON类型，备份不包含P1的.env，也不将密码hash或原始答案写入公开证据。

| 真实源集合 | 文档数 |
| --- | ---: |
| users | 5 |
| surveys | 6 |
| survey_versions | 5 |
| responses | 8 |

逻辑备份导入现有工具新分配的准确源库 `project2_test_p2008_source_1792893806861_811aaed6`。这是**真实P1数据的隔离副本**，库名前缀是旧工具门禁约定，不代表数据是合成的。原迁移工具的inspect/backup/restore/dry-run/apply/verify流程与白名单未放宽。

## 两个真实恢复和升级目标

| 目标 | 首次apply | verify | 再次apply |
| --- | --- | --- | --- |
| project2_restore_1792893806861_811aaed6 | 6提交、0跳过 | 6卷、16正式题版、35绑定，通过 | 0提交、6跳过 |
| project2_test_p2008_migrated_1792893806861_811aaed6 | 6提交、0跳过 | 同上，通过 | 0提交、6跳过 |

原用户、问卷ID/publicId/策略/发布号、全部旧发布快照、原答卷、requestId/payloadHash及BSON类型按原迁移工具完整核对；只增量升级问卷格式及旁路来源映射。没有把相似题干跨问卷合并，也没有凭推测写原创/派生来源。每个独立计划保留其固定planId，重复apply由数据库事实判断跳过，不删除journal伪造首次执行。

认证部署后又运行 `scripts/verify-real-migration.ts`：使用明确维护身份复核真实迁移目标，二期应用可以启动且ready为200；未登录问卷管理列表为401；5份旧schemaVersion1发布快照和8份旧答卷保留。未重置旧网站密码，也没有伪造旧用户登录。

原迁移专项自动回归另在认证模式下通过，覆盖非空BSON备份、实际restore、固定计划、commit后journal前受控中断、丢journal恢复、重复apply、源漂移和冲突拒绝。受控中断不是实际断网或主节点切换。

## 数据保护及证据

- [真实迁移完整摘要](../testing/phase2-runs/delivery-20261025/real-p1-migration.json)
- [认证后应用启动与旧格式复核](../testing/phase2-runs/delivery-20261025/real-migration-runtime.json)
- [交付时再次核对一期1179文件及二期原记录](../testing/phase2-runs/delivery-20261025/preservation-final.json)
- 私有冷备份、工作副本及BSON逻辑备份在 `.local/w07/1792893806861_811aaed6/`；受控迁移备份、计划和journal在 `.local/p2-008/migrations/1792893806861_811aaed6/`，均Git忽略，不上传。

临时27020工作副本已正常停止，保留文件供恢复核验。原一期目录在备份、迁移完成及最终交付三次检查内容一致。

本轮完成**真实数据在隔离恢复库上的升级和可运行性验证**。当前网站仍使用原 `project2_app_v2` 二期人工验收数据；未把两套账号/问卷混合、未切换当前网站到旧数据副本、未清空现有17份答卷。若以后要将网站整体切到该迁移目标，需独立处理目标应用身份/配置及业务切换，不能把这里的恢复验证理解为已经完成生产切流。
