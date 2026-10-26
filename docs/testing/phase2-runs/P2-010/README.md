# P2-010真实运行证据

[W06实施](../../../phase2/template-square.md) · [需求覆盖](../../../phase2/template-square-coverage.md) · [机器汇总](../../../phase2/evidence/P2-010-summary.json) · [最终保护](../../../phase2/evidence/P2-010-static-check.json)

每条为本轮真实执行；合成库保留、不drop。验证器/索引核验是读应用库，phase2startup只读应用库并核真实监听PID；其他业务夹具写新唯一project2_test_*。runner通用databaseScope文字不替代各命令实际目标。旧P2-008/P2-009运行证据未覆盖。

| UTC开始 | 命令 | 退出码 | 原始证据 |
| --- | --- | --- | --- |
| 2026-10-23T15:51:42.667Z | node scripts/run-check.mjs typecheck | 0 | [日志](2026-10-23T15-51-42-664Z-typecheck-81acad72/output.log) · [结果](2026-10-23T15-51-42-664Z-typecheck-81acad72/result.json) |
| 2026-10-24T03:56:00.936Z | node scripts/run-check.mjs typecheck | 0 | [日志](2026-10-24T03-56-00-929Z-typecheck-a3688deb/output.log) · [结果](2026-10-24T03-56-00-929Z-typecheck-a3688deb/result.json) |
| 2026-10-24T03:59:39.191Z | node scripts/run-check.mjs templates | 1 | [日志](2026-10-24T03-59-39-188Z-templates-4227f171/output.log) · [结果](2026-10-24T03-59-39-188Z-templates-4227f171/result.json) |
| 2026-10-24T04:00:54.194Z | node scripts/run-check.mjs templates | 0 | [日志](2026-10-24T04-00-54-192Z-templates-8fa7919d/output.log) · [结果](2026-10-24T04-00-54-192Z-templates-8fa7919d/result.json) |
| 2026-10-24T04:01:07.159Z | node scripts/run-check.mjs templateraces | 0 | [日志](2026-10-24T04-01-07-157Z-templateraces-48e60e51/output.log) · [结果](2026-10-24T04-01-07-157Z-templateraces-48e60e51/result.json) |
| 2026-10-24T04:02:31.515Z | node scripts/run-check.mjs templatelineage | 0 | [日志](2026-10-24T04-02-31-513Z-templatelineage-a713c1e6/output.log) · [结果](2026-10-24T04-02-31-513Z-templatelineage-a713c1e6/result.json) |
| 2026-10-24T04:02:42.652Z | node scripts/run-check.mjs typecheck | 0 | [日志](2026-10-24T04-02-42-650Z-typecheck-a038f75a/output.log) · [结果](2026-10-24T04-02-42-650Z-typecheck-a038f75a/result.json) |
| 2026-10-24T04:03:17.085Z | node scripts/run-check.mjs build | 0 | [日志](2026-10-24T04-03-17-083Z-build-b51d1986/output.log) · [结果](2026-10-24T04-03-17-083Z-build-b51d1986/result.json) |
| 2026-10-24T04:03:39.516Z | node scripts/run-check.mjs templatelineage | 0 | [日志](2026-10-24T04-03-39-514Z-templatelineage-c5590f56/output.log) · [结果](2026-10-24T04-03-39-514Z-templatelineage-c5590f56/result.json) |
| 2026-10-24T04:04:32.418Z | node scripts/run-check.mjs templatebrowser | 1 | [日志](2026-10-24T04-04-32-417Z-templatebrowser-12408296/output.log) · [结果](2026-10-24T04-04-32-417Z-templatebrowser-12408296/result.json) |
| 2026-10-24T04:05:36.368Z | node scripts/run-check.mjs domain | 0 | [日志](2026-10-24T04-05-36-366Z-domain-3b1d70fd/output.log) · [结果](2026-10-24T04-05-36-366Z-domain-3b1d70fd/result.json) |
| 2026-10-24T04:05:37.757Z | node scripts/run-check.mjs schemafoundation | 0 | [日志](2026-10-24T04-05-37-755Z-schemafoundation-d9351ef7/output.log) · [结果](2026-10-24T04-05-37-755Z-schemafoundation-d9351ef7/result.json) |
| 2026-10-24T04:05:51.658Z | node scripts/run-check.mjs crossstatistics | 0 | [日志](2026-10-24T04-05-51-656Z-crossstatistics-4400f858/output.log) · [结果](2026-10-24T04-05-51-656Z-crossstatistics-4400f858/result.json) |
| 2026-10-24T04:06:06.546Z | node scripts/run-check.mjs crossboundaries | 0 | [日志](2026-10-24T04-06-06-545Z-crossboundaries-d6e9933c/output.log) · [结果](2026-10-24T04-06-06-545Z-crossboundaries-d6e9933c/result.json) |
| 2026-10-24T04:06:18.954Z | node scripts/run-check.mjs bindingsreceipts | 0 | [日志](2026-10-24T04-06-18-951Z-bindingsreceipts-b57be780/output.log) · [结果](2026-10-24T04-06-18-951Z-bindingsreceipts-b57be780/result.json) |
| 2026-10-24T04:06:21.819Z | node scripts/run-check.mjs phase2compatibility | 0 | [日志](2026-10-24T04-06-21-817Z-phase2compatibility-13249d05/output.log) · [结果](2026-10-24T04-06-21-817Z-phase2compatibility-13249d05/result.json) |
| 2026-10-24T04:06:27.751Z | node scripts/run-check.mjs templatebrowser | 1 | [日志](2026-10-24T04-06-27-749Z-templatebrowser-15300825/output.log) · [结果](2026-10-24T04-06-27-749Z-templatebrowser-15300825/result.json) |
| 2026-10-24T04:06:33.247Z | node scripts/run-check.mjs versionsbanks | 0 | [日志](2026-10-24T04-06-33-245Z-versionsbanks-d878c483/output.log) · [结果](2026-10-24T04-06-33-245Z-versionsbanks-d878c483/result.json) |
| 2026-10-24T04:06:36.547Z | node scripts/run-check.mjs integration | 0 | [日志](2026-10-24T04-06-36-545Z-integration-8465d451/output.log) · [结果](2026-10-24T04-06-36-545Z-integration-8465d451/result.json) |
| 2026-10-24T04:06:48.944Z | node scripts/run-check.mjs surveyssharingusage | 0 | [日志](2026-10-24T04-06-48-942Z-surveyssharingusage-5a44a1d0/output.log) · [结果](2026-10-24T04-06-48-942Z-surveyssharingusage-5a44a1d0/result.json) |
| 2026-10-24T04:08:13.871Z | node scripts/run-check.mjs build | 0 | [日志](2026-10-24T04-08-13-869Z-build-b52c2fc2/output.log) · [结果](2026-10-24T04-08-13-869Z-build-b52c2fc2/result.json) |
| 2026-10-24T04:08:26.271Z | node scripts/run-check.mjs templates | 0 | [日志](2026-10-24T04-08-26-270Z-templates-ef1d8aea/output.log) · [结果](2026-10-24T04-08-26-270Z-templates-ef1d8aea/result.json) |
| 2026-10-24T04:09:04.122Z | node scripts/run-check.mjs templatebrowser | 0 | [日志](2026-10-24T04-09-04-060Z-templatebrowser-5036b3dd/output.log) · [结果](2026-10-24T04-09-04-060Z-templatebrowser-5036b3dd/result.json) |
| 2026-10-24T04:09:17.555Z | node scripts/run-check.mjs templateraces | 0 | [日志](2026-10-24T04-09-17-551Z-templateraces-ff1562de/output.log) · [结果](2026-10-24T04-09-17-551Z-templateraces-ff1562de/result.json) |
| 2026-10-24T04:09:41.448Z | node scripts/run-check.mjs verifyruntime | 0 | [日志](2026-10-24T04-09-41-445Z-verifyruntime-872ed6ff/output.log) · [结果](2026-10-24T04-09-41-445Z-verifyruntime-872ed6ff/result.json) |
| 2026-10-24T04:09:44.235Z | node scripts/run-check.mjs verifyphase2 | 0 | [日志](2026-10-24T04-09-44-233Z-verifyphase2-b554bf99/output.log) · [结果](2026-10-24T04-09-44-233Z-verifyphase2-b554bf99/result.json) |
| 2026-10-24T04:09:47.087Z | node scripts/run-check.mjs phase2startup | 0 | [日志](2026-10-24T04-09-47-085Z-phase2startup-f21342f8/output.log) · [结果](2026-10-24T04-09-47-085Z-phase2startup-f21342f8/result.json) |
| 2026-10-24T04:10:06.585Z | node scripts/run-check.mjs publicationpage | 0 | [日志](2026-10-24T04-10-06-583Z-publicationpage-ec6d4c2c/output.log) · [结果](2026-10-24T04-10-06-583Z-publicationpage-ec6d4c2c/result.json) |
| 2026-10-24T04:10:16.022Z | node scripts/run-check.mjs crossbrowser | 0 | [日志](2026-10-24T04-10-16-020Z-crossbrowser-ab61fd01/output.log) · [结果](2026-10-24T04-10-16-020Z-crossbrowser-ab61fd01/result.json) |
| 2026-10-24T04:12:55.196Z | node scripts/run-check.mjs typecheck | 0 | [日志](2026-10-24T04-12-55-194Z-typecheck-7f3f51e3/output.log) · [结果](2026-10-24T04-12-55-194Z-typecheck-7f3f51e3/result.json) |
| 2026-10-24T04:13:01.627Z | node scripts/run-check.mjs build | 0 | [日志](2026-10-24T04-13-01-625Z-build-eda87b35/output.log) · [结果](2026-10-24T04-13-01-625Z-build-eda87b35/result.json) |
| 2026-10-24T04:13:46.707Z | node scripts/run-check.mjs templatebrowser | 0 | [日志](2026-10-24T04-13-46-703Z-templatebrowser-9c0cf0ac/output.log) · [结果](2026-10-24T04-13-46-703Z-templatebrowser-9c0cf0ac/result.json) |
| 2026-10-24T04:15:06.684Z | node scripts/run-check.mjs httpreceipts | 0 | [日志](2026-10-24T04-15-06-682Z-httpreceipts-e1bbfed6/output.log) · [结果](2026-10-24T04-15-06-682Z-httpreceipts-e1bbfed6/result.json) |

首次templates失败：测试把既有cross-statistics实际路由和answeredCount写错，并用缺正文的copy探测得到400；修正为真实契约，copy分别验证他人404/本人501。失败导致同父用例后续状态断言连带失败，原件保留。两次browser失败：按钮实际名为“下架此模板”，以及派生替换异步重载时定位到即将卸载的编辑卡、过早点发布；修正按指定题干定位和等组件卸载/新问卷刷新，再补齐编辑/发布跨动作锁，完整流程复跑通过。最后增加固定模板标题和表单间距后重新构建、四宽度及键盘检查通过。

完整新业务：templates为7子项、templatelineage为多作者/分页2子项+精确BSON用例+链/并集2子项，templateraces为10个受控交错子项。统计/回执/其他原功能各保留原TAP，不把父项和子项相加冒充独立业务案例数量。构建退出0仍有原app-config.js及图表chunk警告。

浏览器route.fetch后abort为明确的HTTP响应丢失实验；MongoError标签为合成钩子。所有业务写与回滚均在实际本地MongoDB事务内验证；未做Mongo宕机或选主。大容量图和恰好BSON大小为明确存储夹具，经strict验证器插入，再走真实API，不宣称人工UI输入数百次。

最终两个应用库验证器/索引/数量/BSON摘要逐项一致（4/13集合，均空）；[实例与释放状态](../../../phase2/evidence/P2-010-runtime-final.json)仅27019/PID32420保留，API/Vite和浏览器测试端口释放。角色模板修改未执行。未安装依赖、改锁、修改P1、清库或提交推送；W07未开始。
