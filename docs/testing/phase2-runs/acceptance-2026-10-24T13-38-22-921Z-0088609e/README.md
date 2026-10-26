# 第二阶段自动化验收

开始：2026-10-24T13:38:22.923Z；结束：2026-10-24T13:49:28.067Z；结果：passed；范围：complete-automated-regression。

| 检查 | 结果 | 退出码 |
| --- | --- | --- |
| typecheck | passed | 0 |
| build | passed | 0 |
| domain | passed | 0 |
| operationretry | passed | 0 |
| schemafoundation | passed | 0 |
| bindingsreceipts | passed | 0 |
| isolation | passed | 0 |
| phase2targets | passed | 0 |
| runtimereviewapi | passed | 0 |
| versionsbanks | passed | 0 |
| surveyssharingusage | passed | 0 |
| httpreceipts | passed | 0 |
| crossstatistics | passed | 0 |
| crossboundaries | passed | 0 |
| crossaccessreview | passed | 0 |
| templates | passed | 0 |
| templatelineage | passed | 0 |
| templateraces | passed | 0 |
| usagecapacity | passed | 0 |
| phase2compatibility | passed | 0 |
| migration | passed | 0 |
| migratedapi | passed | 0 |
| integration | passed | 0 |
| acceptancejourney | passed | 0 |
| acceptancepermissions | passed | 0 |
| acceptancescale | passed | 0 |
| phase2browser | passed | 0 |
| crossbrowser | passed | 0 |
| crossretainedbrowser | passed | 0 |
| templatebrowser | passed | 0 |
| phase1 | passed | 0 |
| existingregression | passed | 0 |
| verifyruntime | passed | 0 |
| verifyphase2 | passed | 0 |

[机器汇总](summary.json)；各子目录保留原始输出、命令、时间和退出码。组数不是独立场景数。

保护检查：两个应用库的数据、验证器、索引一致；源文件摘要一致；现有监听PID保留；临时测试端口已释放。

- Synthetic P2 databases only; no real P1 migration or DB authorization deployment.
- Existing application startup ports remain occupied by user services; dedicated browser servers and runtime target/ownership checks replace restarting those services.
- Controlled failure hooks are not a real network outage or primary failover.
- Manual acceptance remains unexecuted.
