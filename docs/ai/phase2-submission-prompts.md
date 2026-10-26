# 第二阶段提示词与来源索引

整理日期：2026-10-26（Asia/Shanghai）。与[二期提交版AI日志](phase2-submission-log.md)配套使用。下表链接已经保存的执行任务原件，不将其复制或改写为事后版本。

## 主要执行提示词

这些较长提示词由讨论窗口AI协助组织，经用户确认并转交执行窗口。用户参与业务选择和任务范围确定，具体技术要求包含AI建议。

| 编号 | 原件 | 主要用途 | 提交日志对应项 |
| --- | --- | --- | --- |
| P2-002 | [增量设计](../phase2/prompts/P2-002-incremental-design.md) | 阅读原要求和基线，形成业务、数据库、API及迁移设计 | [L02](phase2-submission-log.md#p2-l02) |
| P2-004 | [来源与使用查询修订](../phase2/prompts/P2-004-distribution-lineage-and-usage.md) | 明确派生公开来源限制及逐版本使用状态 | [L02](phase2-submission-log.md#p2-l02) |
| P2-005 | [独立运行基线](../phase2/prompts/P2-005-runtime-baseline.md) | 二期独立实例、配置及原功能回归 | [L03](phase2-submission-log.md#p2-l03) |
| P2-006 | [领域与可执行Schema](../phase2/prompts/P2-006-domain-schema-foundation.md) | 内容/配置拆分、十三集合及索引 | [L04](phase2-submission-log.md#p2-l04) |
| P2-007 | [来源绑定、回执与事务](../phase2/prompts/P2-007-bindings-receipts-transactions.md) | 固定来源、首次成功结果及事务验证 | [L06](phase2-submission-log.md#p2-l06) |
| P2-008 | [合并实施W02—W04](../phase2/prompts/P2-008-w02-w03-w04-integrated.md) | 题目、题库、共享、问卷接入、使用查询和合成迁移 | [L07](phase2-submission-log.md#p2-l07)—[L09](phase2-submission-log.md#p2-l09) |
| P2-009 | [跨问卷统计](../phase2/prompts/P2-009-w05-cross-survey-statistics.md) | 本人问卷同题同版统计、分页及前端审阅修正 | [L10](phase2-submission-log.md#p2-l10) |
| P2-010 | [公开模板广场](../phase2/prompts/P2-010-w06-template-square.md) | 精确公开授权、固定模板、选用及派生 | [L11](phase2-submission-log.md#p2-l11) |

P2-003等修正任务没有在本目录保存独立编号原件，具体输入以[完整过程日志](phase2-usage-log.md)注明的摘要和本会话消息为依据。编号不连续不表示缺少同名文件，应按实际保存情况查阅。

## 用户设计意见和修改反馈原文

提交日志的Prompt栏直接保留以下消息正文，按原用词记录；设计讨论中的待定语气也保留当时状态。表中仅作位置导航，意见本身不在此重复缩写。

| 用户意见或请求 | 原文位置 |
| --- | --- |
| 正式保存、恢复、题目更新和复用范围 | [L02完整消息](phase2-submission-log.md#p2-l02) |
| 指定用户共享及他人使用情况字段 | [L08完整消息](phase2-submission-log.md#p2-l08) |
| 统计沿用现有权限 | [L10确认回答](phase2-submission-log.md#p2-l10) |
| 模板广场展示结构及授权规则确认 | [L11原文](phase2-submission-log.md#p2-l11) |
| 先审阅已完成部分，再运行自动化测试 | [L12完整消息](phase2-submission-log.md#p2-l12) |
| 自动化覆盖偏少及执行补充测试 | [L13完整消息](phase2-submission-log.md#p2-l13) |
| 人工测试清单不清楚、实际执行差异及撤权入口 | [L14两条完整反馈](phase2-submission-log.md#p2-l14) |
| 公开授权异常及辅助测试请求 | [L15完整消息](phase2-submission-log.md#p2-l15) |
| 界面、多尺寸、真实迁移和认证收尾 | [L16完整请求](phase2-submission-log.md#p2-l16)；[L17](phase2-submission-log.md#p2-l17)、[L18](phase2-submission-log.md#p2-l18)按范围引用 |

消息中提及的报告或截图是当时输入上下文，完整聊天及所有附件没有单独导出。本索引不包含测试账号密码、Cookie、令牌和数据库私有凭据。未保存独立原文的审阅修正，以提交日志注明的过程记录为依据。

## 如何查阅输出与修改

执行任务的输入直接查看上表8份全文，再阅读对应提交日志的Result、修改责任和验证证据。提交版不以“请求生成或转交提示词”替代实现输入，原准备过程继续保存在完整历史日志中。用户报告文字及图代码的多轮交流以本会话为来源，未单独导出的文件不标为已保存原件。
