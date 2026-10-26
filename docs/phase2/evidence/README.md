# P2-002文档核对证据

2026-10-22（Asia/Shanghai）。本目录仅证明文件读取、归档和文档静态一致性，不是业务测试、数据库查询或迁移/恢复成功证据。

当前P2-003修正另见[静态结果](P2-003-static-check.json)、[核对方法](P2-003-verification-method.md)、[修改前摘要](P2-003-before.json)、[合成契约数据](P2-003-review-fixtures.json)及[修正覆盖表](P2-003-coverage.json)。下列P2-002材料保留其原时点，不能用其中的文件摘要或34例计数冒称当前修正已运行验收。

- [修改前文件摘要](P2-002-before.json)：本轮写设计前的HEAD、Git状态、可见工程材料文件SHA-256。已有未跟踪文件保留；未读取.env或数据库文件。
- [最终静态结果](P2-002-static-check.json)：基线原始字节/hash、允许修改范围、历史文件保护、Prompt保护、AI旧条目前缀保护、设计链接/JSON/字段/接口/追踪和手算检查；以该JSON实际结果为准。
- [首次检查及待修项](P2-002-static-check-initial.json)：保留首次真实输出，最终修复结果另列。
- [检查方法与限制](verification-method.md)：实际检查口径、未覆盖项。
- [教师共同要求正文与表格](大作业一.docx.txt)：只读OOXML提取295正文段落、1表格，完整保留表格单元内容。
- [教师八项变更正文](大作业一：需求变更.docx.txt)：只读提取76段落、0表格。
- [本地完整报告读取文本](基于%20MongoDB%20的在线问卷系统设计与实现报告%20(2).docx.txt)：167段落、7表格，仅参考报告结构和原事实边界；不改原报告，不将本地补充材料冒称基线提交已跟踪。

主要实际核对材料：README、migration.md/migration-verification.json/工程manifest、原需求/决策/总体/数据库/API/关键逻辑/版本计划、第一阶段测试材料及AI规范/日志；关键源码包括实际Schema/索引/models/initialize、app/editing、core版本/发布/提交/统计/common、config/DTO/codec、shared四文件、router与编辑/版本/统计客户端、初始化/启动/副本集/角色/configure、环境模板/package/锁文件及phase1 harness/发布/提交/统计/边界/分页测试源码。未执行这些程序。

技术机制另只读核对MongoDB官方[验证器修改](https://www.mongodb.com/docs/manual/core/schema-validation/update-schema-validation/)、[唯一索引](https://www.mongodb.com/docs/manual/core/index-unique/)和[事务考虑](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/)。这些支持设计机制，不证明本项目已运行通过。

## P2-004 第3、4项静态核对

本轮原文见[P2-004 Prompt](../prompts/P2-004-distribution-lineage-and-usage.md)，本轮结果见[P2-004-static-check.json](P2-004-static-check.json)、[执行前摘要](P2-004-before.json)、[核对方法](P2-004-verification-method.md)和[追踪覆盖表](P2-004-coverage.json)。P2-003完整回执与模板独立门闩继续保留，上方旧证据不覆盖。原AI日志全部字节作为前缀保留，只追加P2-004。

本轮核对包括完整来源链/固定证明/当前授权的合成例、Usage逐版本状态手算、受影响摘要、API/JSON/白名单/链接/用例编号，以及写入范围和冻结归档保护。合成数据见[design-fixtures.json](../design-fixtures.json)及[完整集合样例](../collection-examples.json)。这些检查没有执行业务代码、HTTP请求、数据库查询或真实并发事务；50组业务/迁移计划均未执行。

## P2-005运行基线证据

[执行前状态](P2-005-before.json)、[真实运行汇总](P2-005-runtime-summary.json)、[保护与静态核对](P2-005-static-check.json)及[运行说明](../runtime-baseline.md)。日志/退出码/截图在独立phase2-runs目录，由汇总和运行说明链接。原P2-002/003/004证据不覆盖。P2-W01已完成实际运行与原功能兼容回归，但仍仅四集合、无新增P2业务和真实旧数据迁移；50组目标测试不据此标PASS。

## P2-005三项运行审阅修正

[复审前摘要](P2-005-review-before.json)、[真实执行汇总](P2-005-review-summary.json)、[最终保护核对](P2-005-review-static-check.json)与[当前运行说明](../runtime-baseline.md#w01-runtime-review)。原P2-005结果与失败原件不改写。针对性首轮4项通过、2个测试钩子加载错误保留；修复后仅定向重跑2项通过，正常启动PID前后核验/原集成与发布提交回归另有实跑证据。显式空库模式的预期退出1与测试加载失败分开记录，不冒充普通成功退出。


## P2-006 W02-A真实实现证据

[执行前保护](P2-006-before.json)、[真实结果](P2-006-summary.json)、[最终静态核对](P2-006-static-check.json)、[实现与矩阵](../schema-foundation.md)、[全部命令和失败原件](../../testing/phase2-runs/P2-006-20261023/README.md)。当前应用库未升级；13集合验收均使用合成库。历史证据不改写。


## P2-006共享模块循环导入复审

[执行前保护](P2-006-import-review-before.json)、[真实复现与修复汇总](P2-006-import-review-summary.json)、[静态核对](P2-006-import-review-static-check.json)、[说明](../schema-foundation.md#shared-import-review)。先保存源码/编译直接导入的4项失败，修复后8个独立进程全部通过，已并入常规domain命令。旧P2-006证据保持。


## P2-007 / W02-B真实事务证据

[执行前保护](P2-007-before.json)、[真实汇总](P2-007-summary.json)、[静态保护](P2-007-static-check.json)、[临时只读核对及错误](P2-007-ad-hoc-checks.json)、[实施与17项矩阵](../bindings-receipts-foundation.md)、[全部运行日志](../../testing/phase2-runs/P2-007-20261023/README.md)。回执/绑定真实事务与隔离解码fixture分别说明；应用指纹前后相同，既有材料不覆盖。
