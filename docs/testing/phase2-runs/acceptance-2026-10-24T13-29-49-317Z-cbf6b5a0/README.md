# 第二阶段自动化验收

开始：2026-10-24T13:29:49.319Z；结束：2026-10-24T13:32:15.466Z；结果：failed；范围：targeted-checks。

| 检查 | 结果 | 退出码 |
| --- | --- | --- |
| acceptancejourney | failed | 1 |
| acceptancepermissions | failed | 1 |
| acceptancescale | failed | 1 |

[机器汇总](summary.json)；各子目录保留原始输出、命令、时间和退出码。组数不是独立场景数。

保护检查：两个应用库的数据、验证器、索引一致；源文件摘要一致；现有监听PID保留；临时测试端口已释放。

- Synthetic P2 databases only; no real P1 migration or DB authorization deployment.
- Existing application startup ports remain occupied by user services; dedicated browser servers and runtime target/ownership checks replace restarting those services.
- Controlled failure hooks are not a real network outage or primary failover.
- Manual acceptance remains unexecuted.
