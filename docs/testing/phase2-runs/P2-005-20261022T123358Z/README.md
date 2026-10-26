# P2-005 / P2-W01 实际运行证据

运行目录：P2-005-20261022T123358Z。UTC起止时间以各result.json为准，退出码来自真实进程；失败保留。

[运行说明](../../../phase2/runtime-baseline.md) · [机器汇总](../../../phase2/evidence/P2-005-runtime-summary.json) · [结束服务状态](final-service-state.json)

| 命令/模块 | 退出码 | 结果与输出 |
| --- | --- | --- |
| npm-ci-initial.result | 1 | [result](npm-ci-initial.result.json) · [output](npm-ci-initial.log) |
| npm-ci.result | 0 | [result](npm-ci.result.json) · [output](npm-ci.log) |
| configure | 0 | [result](2026-10-22T12-42-33-808Z-configure-ee35b3d9/result.json) · [output](2026-10-22T12-42-33-808Z-configure-ee35b3d9/output.log) |
| dbstart | 1 | [result](2026-10-22T12-42-44-143Z-dbstart-0f5fe540/result.json) · [output](2026-10-22T12-42-44-143Z-dbstart-0f5fe540/output.log) |
| typecheck | 0 | [result](2026-10-22T12-43-09-216Z-typecheck-73825ff2/result.json) · [output](2026-10-22T12-43-09-216Z-typecheck-73825ff2/output.log) |
| dbstart | 0 | [result](2026-10-22T12-44-23-707Z-dbstart-232810db/result.json) · [output](2026-10-22T12-44-23-707Z-dbstart-232810db/output.log) |
| isolation | 0 | [result](2026-10-22T12-44-30-428Z-isolation-bc91f319/result.json) · [output](2026-10-22T12-44-30-428Z-isolation-bc91f319/output.log) |
| build | 0 | [result](2026-10-22T12-44-38-906Z-build-342d1ef4/result.json) · [output](2026-10-22T12-44-38-906Z-build-342d1ef4/output.log) |
| dbinit | 0 | [result](2026-10-22T12-45-03-787Z-dbinit-b2e44f41/result.json) · [output](2026-10-22T12-45-03-787Z-dbinit-b2e44f41/output.log) |
| dbinit | 0 | [result](2026-10-22T12-45-06-603Z-dbinit-52b3dadd/result.json) · [output](2026-10-22T12-45-06-603Z-dbinit-52b3dadd/output.log) |
| phase1 | 0 | [result](2026-10-22T12-45-37-902Z-phase1-0057dd9d/result.json) · [output](2026-10-22T12-45-37-902Z-phase1-0057dd9d/output.log) |
| publish | 0 | [result](2026-10-22T12-45-38-194Z-publish-1d5f6a02/result.json) · [output](2026-10-22T12-45-38-194Z-publish-1d5f6a02/output.log) |
| flow | 0 | [result](2026-10-22T12-45-45-861Z-flow-c9beca2b/result.json) · [output](2026-10-22T12-45-45-861Z-flow-c9beca2b/output.log) |
| submit | 0 | [result](2026-10-22T12-45-46-074Z-submit-b4f04fe7/result.json) · [output](2026-10-22T12-45-46-074Z-submit-b4f04fe7/output.log) |
| statistics | 0 | [result](2026-10-22T12-45-49-647Z-statistics-9d3762a4/result.json) · [output](2026-10-22T12-45-49-647Z-statistics-9d3762a4/output.log) |
| edges | 0 | [result](2026-10-22T12-45-53-127Z-edges-28b3ae1d/result.json) · [output](2026-10-22T12-45-53-127Z-edges-28b3ae1d/output.log) |
| pagination | 0 | [result](2026-10-22T12-45-56-628Z-pagination-464e4b10/result.json) · [output](2026-10-22T12-45-56-628Z-pagination-464e4b10/output.log) |
| browser | 0 | [result](2026-10-22T12-46-00-047Z-browser-94fe6679/result.json) · [output](2026-10-22T12-46-00-047Z-browser-94fe6679/output.log) |
| existingregression | 0 | [result](2026-10-22T12-46-14-146Z-existingregression-cb2c889f/result.json) · [output](2026-10-22T12-46-14-146Z-existingregression-cb2c889f/output.log) |
| regression | 0 | [result](2026-10-22T12-46-14-412Z-regression-09941de9/result.json) · [output](2026-10-22T12-46-14-412Z-regression-09941de9/output.log) |
| verifyruntime | 0 | [result](2026-10-22T12-48-21-729Z-verifyruntime-c3fbf9cc/result.json) · [output](2026-10-22T12-48-21-729Z-verifyruntime-c3fbf9cc/output.log) |
| startup | 0 | [result](2026-10-22T12-48-24-230Z-startup-3faa6fc7/result.json) · [output](2026-10-22T12-48-24-230Z-startup-3faa6fc7/output.log) |
| configure | 0 | [result](2026-10-22T12-50-22-034Z-configure-3da60550/result.json) · [output](2026-10-22T12-50-22-034Z-configure-3da60550/output.log) |
| ownership-guards.result | 0 | [result](ownership-guards.result.json) · [output](ownership-guards.log) |
| mongo-stop.result | 1 | [result](mongo-stop.result.json) · [output](mongo-stop.log) |
| dbstart | 0 | [result](2026-10-22T12-51-55-634Z-dbstart-1846981a/result.json) · [output](2026-10-22T12-51-55-634Z-dbstart-1846981a/output.log) |
| mongo-stop-confirmed.result | 1 | [result](mongo-stop-confirmed.result.json) · [output](mongo-stop-confirmed.log) |
| dbstart | 0 | [result](2026-10-22T12-53-11-992Z-dbstart-7dffecbb/result.json) · [output](2026-10-22T12-53-11-992Z-dbstart-7dffecbb/output.log) |
| mongo-stop-verified.result | 0 | [result](mongo-stop-verified.result.json) · [output](mongo-stop-verified.log) |
| dbstart | 0 | [result](2026-10-22T12-53-23-601Z-dbstart-fa882fb9/result.json) · [output](2026-10-22T12-53-23-601Z-dbstart-fa882fb9/output.log) |
| verifyruntime | 0 | [result](2026-10-22T12-53-30-971Z-verifyruntime-fe555f23/result.json) · [output](2026-10-22T12-53-30-971Z-verifyruntime-fe555f23/output.log) |

本轮原核心7模块与原补充4子脚本通过；14项配置、6项目录、10项HTTP检查通过。初始npm/启动/停止适配错误已修复，4份非0尝试原件保留。

浏览器截图位于browser与regression命令目录的artifacts子目录；使用本轮合成账号，不代表真实业务数据。测试浏览器和API/Vite均已释放，专用P2 MongoDB保留。当前仍为P1四集合兼容基线，P2新增业务/13集合/真实旧数据迁移未实施。
