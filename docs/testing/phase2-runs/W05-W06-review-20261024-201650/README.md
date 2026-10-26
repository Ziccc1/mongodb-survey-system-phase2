# W05/W06审阅与自动化复跑（2026-10-24）

本轮审查与自动化测试已完成，现有21组检查通过；补充检查确认两处待修正问题，不能据已有套件通过宣称无缺陷。未修改业务代码/配置，不执行W07真实迁移或人工验收。

[机器汇总](summary.json) · [补充检查结果](review-probes.json) · [补充检查源码](review-probes.ts) · [补充日志](review-probes.log) · [页面截图](retained-numeric-boundaries.png)

## 实际命令结果

| 检查 | 最后退出码 | 原始日志 |
| --- | --- | --- |
| typecheck | 0 | [输出](2026-10-24T12-18-14-401Z-typecheck-9e70c2b5/output.log) / [结果](2026-10-24T12-18-14-401Z-typecheck-9e70c2b5/result.json) |
| build | 0 | [输出](2026-10-24T12-19-16-823Z-build-6bd86458/output.log) / [结果](2026-10-24T12-19-16-823Z-build-6bd86458/result.json) |
| domain | 0 | [输出](2026-10-24T12-20-23-330Z-domain-bdbd914e/output.log) / [结果](2026-10-24T12-20-23-330Z-domain-bdbd914e/result.json) |
| operationretry | 0 | [输出](2026-10-24T12-20-24-611Z-operationretry-6b6eaa40/output.log) / [结果](2026-10-24T12-20-24-611Z-operationretry-6b6eaa40/result.json) |
| crossstatistics | 0 | [输出](2026-10-24T12-20-25-210Z-crossstatistics-69433f46/output.log) / [结果](2026-10-24T12-20-25-210Z-crossstatistics-69433f46/result.json) |
| crossboundaries | 0 | [输出](2026-10-24T12-20-44-193Z-crossboundaries-9ca55a6f/output.log) / [结果](2026-10-24T12-20-44-193Z-crossboundaries-9ca55a6f/result.json) |
| templates | 0 | [输出](2026-10-24T12-20-16-500Z-templates-bd5ace78/output.log) / [结果](2026-10-24T12-20-16-500Z-templates-bd5ace78/result.json) |
| templateraces | 0 | [输出](2026-10-24T12-20-50-577Z-templateraces-8a777cd2/output.log) / [结果](2026-10-24T12-20-50-577Z-templateraces-8a777cd2/result.json) |
| templatelineage | 0 | [输出](2026-10-24T12-21-06-033Z-templatelineage-93ab8e0d/output.log) / [结果](2026-10-24T12-21-06-033Z-templatelineage-93ab8e0d/result.json) |
| versionsbanks | 0 | [输出](2026-10-24T12-22-07-077Z-versionsbanks-913ab348/output.log) / [结果](2026-10-24T12-22-07-077Z-versionsbanks-913ab348/result.json) |
| surveyssharingusage | 0 | [输出](2026-10-24T12-22-22-123Z-surveyssharingusage-1bed3b96/output.log) / [结果](2026-10-24T12-22-22-123Z-surveyssharingusage-1bed3b96/result.json) |
| phase2compatibility | 0 | [输出](2026-10-24T12-22-39-026Z-phase2compatibility-7413e41d/output.log) / [结果](2026-10-24T12-22-39-026Z-phase2compatibility-7413e41d/result.json) |
| schemafoundation | 0 | [输出](2026-10-24T12-22-54-519Z-schemafoundation-f0b98d11/output.log) / [结果](2026-10-24T12-22-54-519Z-schemafoundation-f0b98d11/result.json) |
| bindingsreceipts | 0 | [输出](2026-10-24T12-23-40-708Z-bindingsreceipts-4ab87145/output.log) / [结果](2026-10-24T12-23-40-708Z-bindingsreceipts-4ab87145/result.json) |
| httpreceipts | 0 | [输出](2026-10-24T12-23-56-716Z-httpreceipts-c5d8f8c1/output.log) / [结果](2026-10-24T12-23-56-716Z-httpreceipts-c5d8f8c1/result.json) |
| integration | 0 | [输出](2026-10-24T12-24-13-483Z-integration-1a840607/output.log) / [结果](2026-10-24T12-24-13-483Z-integration-1a840607/result.json) |
| crossbrowser | 0 | [输出](2026-10-24T12-22-07-467Z-crossbrowser-41a6ab1c/output.log) / [结果](2026-10-24T12-22-07-467Z-crossbrowser-41a6ab1c/result.json) |
| templatebrowser | 0 | [输出](2026-10-24T12-22-49-038Z-templatebrowser-8d3abc22/output.log) / [结果](2026-10-24T12-22-49-038Z-templatebrowser-8d3abc22/result.json) |
| phase1 | 0 | [输出](2026-10-24T12-23-12-773Z-phase1-e3098a1c/output.log) / [结果](2026-10-24T12-23-12-773Z-phase1-e3098a1c/result.json) |
| verifyruntime | 0 | [输出](2026-10-24T12-25-20-920Z-verifyruntime-667a6e2e/output.log) / [结果](2026-10-24T12-25-20-920Z-verifyruntime-667a6e2e/result.json) |
| verifyphase2 | 0 | [输出](2026-10-24T12-25-23-825Z-verifyphase2-b77d1d7b/output.log) / [结果](2026-10-24T12-25-23-825Z-verifyphase2-b77d1d7b/result.json) |

typecheck首次受沙箱权限阻止、退出2，批准后重跑通过；原失败目录和输出保留。未放宽类型/测试断言。既有Vite app-config脚本及图表chunk警告保留。

保护核对：170份源码/配置/锁文件摘要不变；两应用库的集合/验证器/索引/数量/文档BSON摘要不变；测试端口3110/3219/3220/3225已释放。编译产物按授权更新，测试数据只写独立project2_test_*并保留。

补充检查脚本退出0仅表示复现脚本正常完成，其passed=false项是真实发现的问题，不作为PASS计入现有套件。所有浏览器操作是自动化，不冒充人工测试。
