# P2-007 / W02-B 实际命令与证据

[实施说明](../../../phase2/bindings-receipts-foundation.md) · [机器汇总](../../../phase2/evidence/P2-007-summary.json)

每次调用独立目录，不覆盖失败。首轮类型检查及实例归属拒绝保留；后续先核对专用目录和监听再由原dbstart恢复实例。新增覆盖或修正后仅重跑相关类型/构建/领域/事务检查，没有重复整套业务或浏览器。

| 命令 | 开始UTC | 退出码 | 真实原件 |
| --- | --- | --- | --- |
| typecheck | 2026-10-23T07:30:33.625Z | 2 | [result](2026-10-23T07-30-33-623Z-typecheck-b12db96f/result.json) / [output](2026-10-23T07-30-33-623Z-typecheck-b12db96f/output.log) |
| typecheck | 2026-10-23T07:35:24.495Z | 0 | [result](2026-10-23T07-35-24-493Z-typecheck-e71596ce/result.json) / [output](2026-10-23T07-35-24-493Z-typecheck-e71596ce/output.log) |
| bindingsreceipts | 2026-10-23T07:36:09.938Z | 1 | [result](2026-10-23T07-36-09-935Z-bindingsreceipts-e0db5ddf/result.json) / [output](2026-10-23T07-36-09-935Z-bindingsreceipts-e0db5ddf/output.log) |
| dbstart | 2026-10-23T07:37:03.638Z | 0 | [result](2026-10-23T07-37-03-636Z-dbstart-ca4bb899/result.json) / [output](2026-10-23T07-37-03-636Z-dbstart-ca4bb899/output.log) |
| bindingsreceipts | 2026-10-23T07:37:11.543Z | 0 | [result](2026-10-23T07-37-11-541Z-bindingsreceipts-889ed7c9/result.json) / [output](2026-10-23T07-37-11-541Z-bindingsreceipts-889ed7c9/output.log) |
| build | 2026-10-23T07:37:14.791Z | 0 | [result](2026-10-23T07-37-14-789Z-build-0616886f/result.json) / [output](2026-10-23T07-37-14-789Z-build-0616886f/output.log) |
| domain | 2026-10-23T07:37:21.240Z | 0 | [result](2026-10-23T07-37-21-238Z-domain-ecce9613/result.json) / [output](2026-10-23T07-37-21-238Z-domain-ecce9613/output.log) |
| schemafoundation | 2026-10-23T07:40:08.534Z | 0 | [result](2026-10-23T07-40-08-533Z-schemafoundation-a50c43a7/result.json) / [output](2026-10-23T07-40-08-533Z-schemafoundation-a50c43a7/output.log) |
| integration | 2026-10-23T07:40:44.249Z | 0 | [result](2026-10-23T07-40-44-247Z-integration-6efb98ab/result.json) / [output](2026-10-23T07-40-44-247Z-integration-6efb98ab/output.log) |
| phase1 | 2026-10-23T07:40:51.707Z | 0 | [result](2026-10-23T07-40-51-704Z-phase1-909a7032/result.json) / [output](2026-10-23T07-40-51-704Z-phase1-909a7032/output.log) |
| publish | 2026-10-23T07:40:51.991Z | 0 | [result](2026-10-23T07-40-51-989Z-publish-eef3c32a/result.json) / [output](2026-10-23T07-40-51-989Z-publish-eef3c32a/output.log) |
| flow | 2026-10-23T07:40:57.446Z | 0 | [result](2026-10-23T07-40-57-444Z-flow-16f6fcea/result.json) / [output](2026-10-23T07-40-57-444Z-flow-16f6fcea/output.log) |
| submit | 2026-10-23T07:40:57.656Z | 0 | [result](2026-10-23T07-40-57-654Z-submit-26113b72/result.json) / [output](2026-10-23T07-40-57-654Z-submit-26113b72/output.log) |
| statistics | 2026-10-23T07:41:03.203Z | 0 | [result](2026-10-23T07-41-03-202Z-statistics-a630bb70/result.json) / [output](2026-10-23T07-41-03-202Z-statistics-a630bb70/output.log) |
| edges | 2026-10-23T07:41:08.836Z | 0 | [result](2026-10-23T07-41-08-833Z-edges-f8ac2fc0/result.json) / [output](2026-10-23T07-41-08-833Z-edges-f8ac2fc0/output.log) |
| pagination | 2026-10-23T07:41:14.445Z | 0 | [result](2026-10-23T07-41-14-443Z-pagination-fd6917aa/result.json) / [output](2026-10-23T07-41-14-443Z-pagination-fd6917aa/output.log) |
| browser | 2026-10-23T07:41:20.290Z | 0 | [result](2026-10-23T07-41-20-288Z-browser-7d5300a1/result.json) / [output](2026-10-23T07-41-20-288Z-browser-7d5300a1/output.log) |
| typecheck | 2026-10-23T07:44:07.736Z | 0 | [result](2026-10-23T07-44-07-734Z-typecheck-1ee59833/result.json) / [output](2026-10-23T07-44-07-734Z-typecheck-1ee59833/output.log) |
| build | 2026-10-23T07:44:13.275Z | 0 | [result](2026-10-23T07-44-13-273Z-build-cbf60ec5/result.json) / [output](2026-10-23T07-44-13-273Z-build-cbf60ec5/output.log) |
| bindingsreceipts | 2026-10-23T07:44:43.753Z | 0 | [result](2026-10-23T07-44-43-751Z-bindingsreceipts-0cfb82f3/result.json) / [output](2026-10-23T07-44-43-751Z-bindingsreceipts-0cfb82f3/output.log) |
| typecheck | 2026-10-23T07:50:11.928Z | 0 | [result](2026-10-23T07-50-11-926Z-typecheck-0d66ab48/result.json) / [output](2026-10-23T07-50-11-926Z-typecheck-0d66ab48/output.log) |
| build | 2026-10-23T07:50:17.803Z | 0 | [result](2026-10-23T07-50-17-801Z-build-4ec82da1/result.json) / [output](2026-10-23T07-50-17-801Z-build-4ec82da1/output.log) |
| domain | 2026-10-23T07:50:24.596Z | 0 | [result](2026-10-23T07-50-24-592Z-domain-978c0fc6/result.json) / [output](2026-10-23T07-50-24-592Z-domain-978c0fc6/output.log) |
| bindingsreceipts | 2026-10-23T07:51:14.978Z | 0 | [result](2026-10-23T07-51-14-976Z-bindingsreceipts-084ed25f/result.json) / [output](2026-10-23T07-51-14-976Z-bindingsreceipts-084ed25f/output.log) |
| typecheck | 2026-10-23T07:54:54.572Z | 0 | [result](2026-10-23T07-54-54-570Z-typecheck-dc4e6ae0/result.json) / [output](2026-10-23T07-54-54-570Z-typecheck-dc4e6ae0/output.log) |
| build | 2026-10-23T07:55:01.194Z | 0 | [result](2026-10-23T07-55-01-192Z-build-7f650636/result.json) / [output](2026-10-23T07-55-01-192Z-build-7f650636/output.log) |
| domain | 2026-10-23T07:55:09.030Z | 0 | [result](2026-10-23T07-55-09-027Z-domain-346931f9/result.json) / [output](2026-10-23T07-55-09-027Z-domain-346931f9/output.log) |
| bindingsreceipts | 2026-10-23T07:55:14.849Z | 0 | [result](2026-10-23T07-55-14-847Z-bindingsreceipts-b4e8add1/result.json) / [output](2026-10-23T07-55-14-847Z-bindingsreceipts-b4e8add1/output.log) |
| verifyruntime | 2026-10-23T07:55:27.303Z | 0 | [result](2026-10-23T07-55-27-301Z-verifyruntime-f21a25e8/result.json) / [output](2026-10-23T07-55-27-301Z-verifyruntime-f21a25e8/output.log) |
| typecheck | 2026-10-23T07:58:12.875Z | 0 | [result](2026-10-23T07-58-12-873Z-typecheck-85969ea7/result.json) / [output](2026-10-23T07-58-12-873Z-typecheck-85969ea7/output.log) |
| build | 2026-10-23T07:58:18.467Z | 0 | [result](2026-10-23T07-58-18-464Z-build-d13b6765/result.json) / [output](2026-10-23T07-58-18-464Z-build-d13b6765/output.log) |
| domain | 2026-10-23T07:58:24.944Z | 0 | [result](2026-10-23T07-58-24-942Z-domain-f8bf136c/result.json) / [output](2026-10-23T07-58-24-942Z-domain-f8bf136c/output.log) |
| bindingsreceipts | 2026-10-23T07:58:46.537Z | 0 | [result](2026-10-23T07-58-46-536Z-bindingsreceipts-943da7db/result.json) / [output](2026-10-23T07-58-46-536Z-bindingsreceipts-943da7db/output.log) |

最终事务数据：[transactions.json](2026-10-23T07-58-46-536Z-bindingsreceipts-943da7db/artifacts/bindings-receipts/transactions.json)；同目录有application-before/after.json。标签/响应丢失为明确的合成钩子，实际业务写、事务提交和回滚均操作真实rs0。
