# R1/R2修正真实证据

[修正说明](../../../phase2/reviews/W05-W06-R1-R2-fix-2026-10-24.md) · [机器汇总](../../../phase2/evidence/P2-010-review-r1-r2-summary.json) · [静态保护](../../../phase2/evidence/P2-010-review-r1-r2-static-check.json)

先复现失败，再改代码，再运行新唯一合成库的定向/受影响回归；未覆盖旧审阅及P2-009/P2-010原件。前两条退出1为真实问题复现，不是通过；下列每项保留实际命令、UTC时间、输出和退出码。

| UTC开始 | 命令 | 退出码 | 证据 |
| --- | --- | --- | --- |
| 2026-10-24T12:47:24.747Z | node scripts/run-check.mjs crossaccessreview | 1 | [输出](2026-10-24T12-47-24-745Z-crossaccessreview-f1505239/output.log) · [结果](2026-10-24T12-47-24-745Z-crossaccessreview-f1505239/result.json) |
| 2026-10-24T12:47:39.089Z | node scripts/run-check.mjs crossretainedbrowser | 1 | [输出](2026-10-24T12-47-39-086Z-crossretainedbrowser-33ac54c0/output.log) · [结果](2026-10-24T12-47-39-086Z-crossretainedbrowser-33ac54c0/result.json) |
| 2026-10-24T12:48:46.776Z | node scripts/run-check.mjs typecheck | 0 | [输出](2026-10-24T12-48-46-774Z-typecheck-6d709f95/output.log) · [结果](2026-10-24T12-48-46-774Z-typecheck-6d709f95/result.json) |
| 2026-10-24T12:49:00.240Z | node scripts/run-check.mjs crossaccessreview | 0 | [输出](2026-10-24T12-49-00-238Z-crossaccessreview-102ad61f/output.log) · [结果](2026-10-24T12-49-00-238Z-crossaccessreview-102ad61f/result.json) |
| 2026-10-24T12:50:13.604Z | node scripts/run-check.mjs build | 0 | [输出](2026-10-24T12-50-13-602Z-build-81dca0bb/output.log) · [结果](2026-10-24T12-50-13-602Z-build-81dca0bb/result.json) |
| 2026-10-24T12:50:26.579Z | node scripts/run-check.mjs crossstatistics | 0 | [输出](2026-10-24T12-50-26-576Z-crossstatistics-12ebe3a5/output.log) · [结果](2026-10-24T12-50-26-576Z-crossstatistics-12ebe3a5/result.json) |
| 2026-10-24T12:50:41.311Z | node scripts/run-check.mjs crossboundaries | 0 | [输出](2026-10-24T12-50-41-309Z-crossboundaries-e7a3a881/output.log) · [结果](2026-10-24T12-50-41-309Z-crossboundaries-e7a3a881/result.json) |
| 2026-10-24T12:50:56.692Z | node scripts/run-check.mjs templates | 0 | [输出](2026-10-24T12-50-56-691Z-templates-eb4ccf07/output.log) · [结果](2026-10-24T12-50-56-691Z-templates-eb4ccf07/result.json) |
| 2026-10-24T12:51:15.620Z | node scripts/run-check.mjs domain | 0 | [输出](2026-10-24T12-51-15-617Z-domain-ace9c8e6/output.log) · [结果](2026-10-24T12-51-15-617Z-domain-ace9c8e6/result.json) |
| 2026-10-24T12:51:18.753Z | node scripts/run-check.mjs crossretainedbrowser | 0 | [输出](2026-10-24T12-51-18-751Z-crossretainedbrowser-bf803c96/output.log) · [结果](2026-10-24T12-51-18-751Z-crossretainedbrowser-bf803c96/result.json) |
| 2026-10-24T12:51:38.870Z | node scripts/run-check.mjs crossbrowser | 0 | [输出](2026-10-24T12-51-38-868Z-crossbrowser-edc2888a/output.log) · [结果](2026-10-24T12-51-38-868Z-crossbrowser-edc2888a/result.json) |

R1在3231真实HTTP，记录40组私有/不存在/边界错误响应矩阵、15组无关坏历史及坏题版，修复后均404且无统计snapshot进入。已授权题型错误仍422，边界错误400，存量数字三个端点200、均值5/桶0-1-0；现有完整publication证明权利后相关缺失组仍503。

R2在3232真实Edge，撤权share和模板窄权均一输入框，查询0,10、非法边界纠正、刷新、四宽度/键盘和源历史/未来版404。截图位于最终crossretainedbrowser的artifacts/retained_ui；旧缺失截图在首次失败目录同路径/failure.png。原W05浏览器亦重新实际运行。

所有业务fixture只写新唯一project2_test_*，不drop或降验证器；两个应用库前后验证器/索引/数量/BSON摘要一致，app_v2原有1个真实用户保留。测试端口释放，用户API/前端/Mongo保持运行，仅按已记录PID将旧API42252换为修复后API13160，HTTP就绪200，见runtime证据。没有启动W07或执行迁移/角色部署。Vite原构建警告保留。
