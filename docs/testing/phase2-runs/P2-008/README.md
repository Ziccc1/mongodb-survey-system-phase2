# P2-008真实运行证据

每个目录的output.log/result.json保留真实命令、UTC起止时间、退出码；artifacts含脱敏HTTP、数据库断言和截图。测试使用专用27019/rs0的合成库；配置/初始化/启动/日常核验会按命令访问固定P2应用目标，不把runner通用databaseScope文案当精确数据库清单。实际目标以artifacts/对应日志为准。

[实施报告](../../../phase2/w02-w04-implementation.md) · [覆盖表](../../../phase2/w02-w04-coverage.md) · [机器汇总](../../../phase2/evidence/P2-008-summary.json)。原始非零记录均保留，故障钩子与真实断网明确区分。全部检查为本窗口AI工具执行，未经人工签认。

| UTC开始 | 检查 | 退出码 | 原始记录 |
| --- | --- | --- | --- |
| 2026-10-23T09:46:57.916Z | typecheck | 2 | [日志](2026-10-23T09-46-57-905Z-typecheck-b45701e0/output.log) · [结果](2026-10-23T09-46-57-905Z-typecheck-b45701e0/result.json) |
| 2026-10-23T09:48:14.348Z | typecheck | 0 | [日志](2026-10-23T09-48-14-344Z-typecheck-4c393304/output.log) · [结果](2026-10-23T09-48-14-344Z-typecheck-4c393304/result.json) |
| 2026-10-23T10:27:56.938Z | migration | 1 | [日志](2026-10-23T10-27-56-631Z-migration-314ad535/output.log) · [结果](2026-10-23T10-27-56-631Z-migration-314ad535/result.json) |
| 2026-10-23T10:29:58.907Z | migration | 0 | [日志](2026-10-23T10-29-58-905Z-migration-2209c50f/output.log) · [结果](2026-10-23T10-29-58-905Z-migration-2209c50f/result.json) |
| 2026-10-23T10:31:02.202Z | configurephase2 | 0 | [日志](2026-10-23T10-31-02-200Z-configurephase2-3a568742/output.log) · [结果](2026-10-23T10-31-02-200Z-configurephase2-3a568742/result.json) |
| 2026-10-23T10:32:09.669Z | initphase2 | 0 | [日志](2026-10-23T10-32-09-667Z-initphase2-9d5ebc27/output.log) · [结果](2026-10-23T10-32-09-667Z-initphase2-9d5ebc27/result.json) |
| 2026-10-23T10:37:45.089Z | typecheck | 0 | [日志](2026-10-23T10-37-45-087Z-typecheck-a96c827e/output.log) · [结果](2026-10-23T10-37-45-087Z-typecheck-a96c827e/result.json) |
| 2026-10-23T10:42:38.423Z | typecheck | 0 | [日志](2026-10-23T10-42-38-421Z-typecheck-bde6634f/output.log) · [结果](2026-10-23T10-42-38-421Z-typecheck-bde6634f/result.json) |
| 2026-10-23T10:44:44.468Z | versionsbanks | 0 | [日志](2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/output.log) · [结果](2026-10-23T10-44-44-466Z-versionsbanks-20fb4623/result.json) |
| 2026-10-23T10:50:33.601Z | typecheck | 0 | [日志](2026-10-23T10-50-33-599Z-typecheck-0e781397/output.log) · [结果](2026-10-23T10-50-33-599Z-typecheck-0e781397/result.json) |
| 2026-10-23T10:53:28.846Z | typecheck | 0 | [日志](2026-10-23T10-53-28-844Z-typecheck-1afb9c3d/output.log) · [结果](2026-10-23T10-53-28-844Z-typecheck-1afb9c3d/result.json) |
| 2026-10-23T11:11:01.126Z | surveyssharingusage | 4294967295 | [日志](2026-10-23T11-11-01-124Z-surveyssharingusage-6a91efe3/output.log) · [结果](2026-10-23T11-11-01-124Z-surveyssharingusage-6a91efe3/result.json) |
| 2026-10-23T11:12:15.473Z | surveyssharingusage | 1 | [日志](2026-10-23T11-12-15-471Z-surveyssharingusage-f7b822e3/output.log) · [结果](2026-10-23T11-12-15-471Z-surveyssharingusage-f7b822e3/result.json) |
| 2026-10-23T11:13:19.877Z | surveyssharingusage | 0 | [日志](2026-10-23T11-13-19-875Z-surveyssharingusage-e4875511/output.log) · [结果](2026-10-23T11-13-19-875Z-surveyssharingusage-e4875511/result.json) |
| 2026-10-23T11:16:13.136Z | build | 0 | [日志](2026-10-23T11-16-13-125Z-build-3ca12409/output.log) · [结果](2026-10-23T11-16-13-125Z-build-3ca12409/result.json) |
| 2026-10-23T11:21:01.421Z | phase2browser | 1 | [日志](2026-10-23T11-21-01-419Z-phase2browser-2befad68/output.log) · [结果](2026-10-23T11-21-01-419Z-phase2browser-2befad68/result.json) |
| 2026-10-23T11:24:32.940Z | phase2browser | 1 | [日志](2026-10-23T11-24-32-938Z-phase2browser-cdbb6002/output.log) · [结果](2026-10-23T11-24-32-938Z-phase2browser-cdbb6002/result.json) |
| 2026-10-23T11:26:08.167Z | phase2compatibility | 0 | [日志](2026-10-23T11-26-08-165Z-phase2compatibility-8ef0edad/output.log) · [结果](2026-10-23T11-26-08-165Z-phase2compatibility-8ef0edad/result.json) |
| 2026-10-23T11:28:16.339Z | build | 0 | [日志](2026-10-23T11-28-16-337Z-build-1f977948/output.log) · [结果](2026-10-23T11-28-16-337Z-build-1f977948/result.json) |
| 2026-10-23T11:28:25.939Z | phase2browser | 0 | [日志](2026-10-23T11-28-25-938Z-phase2browser-60df61f1/output.log) · [结果](2026-10-23T11-28-25-938Z-phase2browser-60df61f1/result.json) |
| 2026-10-23T11:29:59.288Z | domain | 0 | [日志](2026-10-23T11-29-59-286Z-domain-fa189421/output.log) · [结果](2026-10-23T11-29-59-286Z-domain-fa189421/result.json) |
| 2026-10-23T11:29:59.978Z | phase2targets | 0 | [日志](2026-10-23T11-29-59-975Z-phase2targets-205ee2b6/output.log) · [结果](2026-10-23T11-29-59-975Z-phase2targets-205ee2b6/result.json) |
| 2026-10-23T11:30:18.764Z | migratedapi | 0 | [日志](2026-10-23T11-30-18-753Z-migratedapi-ef13582f/output.log) · [结果](2026-10-23T11-30-18-753Z-migratedapi-ef13582f/result.json) |
| 2026-10-23T11:33:51.685Z | typecheck | 0 | [日志](2026-10-23T11-33-51-683Z-typecheck-930afdb6/output.log) · [结果](2026-10-23T11-33-51-683Z-typecheck-930afdb6/result.json) |
| 2026-10-23T11:38:34.772Z | migration | 0 | [日志](2026-10-23T11-38-34-770Z-migration-78df956e/output.log) · [结果](2026-10-23T11-38-34-770Z-migration-78df956e/result.json) |
| 2026-10-23T11:41:45.814Z | usagecapacity | 0 | [日志](2026-10-23T11-41-45-812Z-usagecapacity-bfb7bc59/output.log) · [结果](2026-10-23T11-41-45-812Z-usagecapacity-bfb7bc59/result.json) |
| 2026-10-23T11:42:24.869Z | build | 0 | [日志](2026-10-23T11-42-24-867Z-build-b9faaec1/output.log) · [结果](2026-10-23T11-42-24-867Z-build-b9faaec1/result.json) |
| 2026-10-23T14:37:55.097Z | surveyssharingusage | 0 | [日志](2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/output.log) · [结果](2026-10-23T14-37-55-095Z-surveyssharingusage-929deda7/result.json) |
| 2026-10-23T14:38:09.802Z | schemafoundation | 0 | [日志](2026-10-23T14-38-09-796Z-schemafoundation-dbe1cf39/output.log) · [结果](2026-10-23T14-38-09-796Z-schemafoundation-dbe1cf39/result.json) |
| 2026-10-23T14:38:11.750Z | phase1 | 0 | [日志](2026-10-23T14-38-11-748Z-phase1-8dc91ad1/output.log) · [结果](2026-10-23T14-38-11-748Z-phase1-8dc91ad1/result.json) |
| 2026-10-23T14:38:12.066Z | publish | 0 | [日志](2026-10-23T14-38-12-064Z-publish-6bbc8433/output.log) · [结果](2026-10-23T14-38-12-064Z-publish-6bbc8433/result.json) |
| 2026-10-23T14:38:17.583Z | flow | 0 | [日志](2026-10-23T14-38-17-582Z-flow-a1c11f36/output.log) · [结果](2026-10-23T14-38-17-582Z-flow-a1c11f36/result.json) |
| 2026-10-23T14:38:17.799Z | submit | 0 | [日志](2026-10-23T14-38-17-791Z-submit-1ea99d05/output.log) · [结果](2026-10-23T14-38-17-791Z-submit-1ea99d05/result.json) |
| 2026-10-23T14:38:23.531Z | statistics | 0 | [日志](2026-10-23T14-38-23-528Z-statistics-a80c88f6/output.log) · [结果](2026-10-23T14-38-23-528Z-statistics-a80c88f6/result.json) |
| 2026-10-23T14:38:29.358Z | edges | 0 | [日志](2026-10-23T14-38-29-357Z-edges-28ea6c38/output.log) · [结果](2026-10-23T14-38-29-357Z-edges-28ea6c38/result.json) |
| 2026-10-23T14:38:35.422Z | pagination | 0 | [日志](2026-10-23T14-38-35-420Z-pagination-1c227064/output.log) · [结果](2026-10-23T14-38-35-420Z-pagination-1c227064/result.json) |
| 2026-10-23T14:38:41.129Z | browser | 0 | [日志](2026-10-23T14-38-41-127Z-browser-5d1df099/output.log) · [结果](2026-10-23T14-38-41-127Z-browser-5d1df099/result.json) |
| 2026-10-23T14:38:47.612Z | bindingsreceipts | 0 | [日志](2026-10-23T14-38-47-610Z-bindingsreceipts-de812881/output.log) · [结果](2026-10-23T14-38-47-610Z-bindingsreceipts-de812881/result.json) |
| 2026-10-23T14:38:50.960Z | phase2browser | 0 | [日志](2026-10-23T14-38-50-957Z-phase2browser-824ddad2/output.log) · [结果](2026-10-23T14-38-50-957Z-phase2browser-824ddad2/result.json) |
| 2026-10-23T14:39:01.038Z | migratedapi | 0 | [日志](2026-10-23T14-39-01-036Z-migratedapi-e91d2a3a/output.log) · [结果](2026-10-23T14-39-01-036Z-migratedapi-e91d2a3a/result.json) |
| 2026-10-23T14:39:02.350Z | integration | 0 | [日志](2026-10-23T14-39-02-346Z-integration-d9fc6185/output.log) · [结果](2026-10-23T14-39-02-346Z-integration-d9fc6185/result.json) |
| 2026-10-23T14:39:11.555Z | isolation | 0 | [日志](2026-10-23T14-39-11-553Z-isolation-131d919d/output.log) · [结果](2026-10-23T14-39-11-553Z-isolation-131d919d/result.json) |
| 2026-10-23T14:39:12.366Z | runtimereview | 0 | [日志](2026-10-23T14-39-12-362Z-runtimereview-1e87b550/output.log) · [结果](2026-10-23T14-39-12-362Z-runtimereview-1e87b550/result.json) |
| 2026-10-23T14:39:34.115Z | phase2startup | 0 | [日志](2026-10-23T14-39-34-113Z-phase2startup-0d9a46c1/output.log) · [结果](2026-10-23T14-39-34-113Z-phase2startup-0d9a46c1/result.json) |
| 2026-10-23T14:39:55.727Z | verifyruntime | 0 | [日志](2026-10-23T14-39-55-725Z-verifyruntime-8fb2b8d8/output.log) · [结果](2026-10-23T14-39-55-725Z-verifyruntime-8fb2b8d8/result.json) |
| 2026-10-23T14:39:58.554Z | verifyphase2 | 0 | [日志](2026-10-23T14-39-58-553Z-verifyphase2-b16fa149/output.log) · [结果](2026-10-23T14-39-58-553Z-verifyphase2-b16fa149/result.json) |
| 2026-10-23T14:40:13.010Z | bindingsreceipts | 0 | [日志](2026-10-23T14-40-13-008Z-bindingsreceipts-ef36706d/output.log) · [结果](2026-10-23T14-40-13-008Z-bindingsreceipts-ef36706d/result.json) |
| 2026-10-23T14:40:26.941Z | typecheck | 0 | [日志](2026-10-23T14-40-26-939Z-typecheck-bf8ef0d5/output.log) · [结果](2026-10-23T14-40-26-939Z-typecheck-bf8ef0d5/result.json) |
| 2026-10-23T14:40:32.893Z | build | 0 | [日志](2026-10-23T14-40-32-891Z-build-53a6394b/output.log) · [结果](2026-10-23T14-40-32-891Z-build-53a6394b/result.json) |
| 2026-10-23T14:40:39.582Z | domain | 0 | [日志](2026-10-23T14-40-39-579Z-domain-20de1e6b/output.log) · [结果](2026-10-23T14-40-39-579Z-domain-20de1e6b/result.json) |
| 2026-10-23T14:44:45.440Z | httpreceipts | 0 | [日志](2026-10-23T14-44-45-439Z-httpreceipts-a6e1685d/output.log) · [结果](2026-10-23T14-44-45-439Z-httpreceipts-a6e1685d/result.json) |
| 2026-10-23T14:44:57.930Z | migration | 0 | [日志](2026-10-23T14-44-57-928Z-migration-4f5dd79e/output.log) · [结果](2026-10-23T14-44-57-928Z-migration-4f5dd79e/result.json) |

失败原因及后续复跑对照见实施报告。备份、密钥和完整原BSON仅受保护.local；不在公开docs。
