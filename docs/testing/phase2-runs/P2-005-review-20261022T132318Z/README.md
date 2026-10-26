# P2-W01 三项审阅修正实际证据

[运行说明](../../../phase2/runtime-baseline.md) · [审阅汇总](../../../phase2/evidence/P2-005-review-summary.json) · [结束服务状态](final-service-state.json)

| 模块 | 退出码 | 输出 |
| --- | --- | --- |
| typecheck | 0 | [result](2026-10-22T13-24-24-026Z-typecheck-a7847a75/result.json) · [log](2026-10-22T13-24-24-026Z-typecheck-a7847a75/output.log) |
| build | 0 | [result](2026-10-22T13-24-51-587Z-build-a4a932d5/result.json) · [log](2026-10-22T13-24-51-587Z-build-a4a932d5/output.log) |
| runtimereview | 1 | [result](2026-10-22T14-31-51-724Z-runtimereview-2fcbf996/result.json) · [log](2026-10-22T14-31-51-724Z-runtimereview-2fcbf996/output.log) |
| runtimereviewapi | 0 | [result](2026-10-22T14-36-07-375Z-runtimereviewapi-edec2171/result.json) · [log](2026-10-22T14-36-07-375Z-runtimereviewapi-edec2171/output.log) |
| startup | 0 | [result](2026-10-22T14-36-11-930Z-startup-0f043e05/result.json) · [log](2026-10-22T14-36-11-930Z-startup-0f043e05/output.log) |
| integration | 0 | [result](2026-10-22T14-37-32-769Z-integration-2542a52a/result.json) · [log](2026-10-22T14-37-32-769Z-integration-2542a52a/output.log) |
| publish | 0 | [result](2026-10-22T14-37-41-773Z-publish-5af6d798/result.json) · [log](2026-10-22T14-37-41-773Z-publish-5af6d798/output.log) |
| submit | 0 | [result](2026-10-22T14-37-47-910Z-submit-177b2462/result.json) · [log](2026-10-22T14-37-47-910Z-submit-177b2462/output.log) |
| verifyruntime | 0 | [result](2026-10-22T14-37-54-825Z-verifyruntime-d9f09408/result.json) · [log](2026-10-22T14-37-54-825Z-verifyruntime-d9f09408/output.log) |

runtimereview首次退出1：4项通过，2个编译API负例因Windows测试钩子路径加载失败；修正为file URL后仅定向重跑这2项，runtimereviewapi退出0、两项通过。没有把首次失败覆盖或把未运行项改为通过。

review-cases内各command-result.json的非0可能是预期拒绝，须连同expected-rejection.json或used-database-result.json判断；首轮缺失标记/异目录用例的加载错误是非预期失败。

[正常使用后核验及只读证明](2026-10-22T14-31-51-724Z-runtimereview-2fcbf996/artifacts/review-cases/used-database-result.json) · [正常启动监听PID前后证据](2026-10-22T14-36-11-930Z-startup-0f043e05/artifacts/startup-probes.json)

正常注册和建卷仅发生在专用project2_test_*合成库；应用库日常核对为只读。API/Vite与合成HTTP监听均已释放，原P2 MongoDB未停机、未重配。
