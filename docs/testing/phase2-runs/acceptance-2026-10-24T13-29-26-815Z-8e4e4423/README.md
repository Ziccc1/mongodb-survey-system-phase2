# 第二阶段自动化验收

开始：2026-10-24T13:29:26.817Z；结束：2026-10-24T13:29:28.022Z；结果：failed；范围：targeted-checks。

| 检查 | 结果 | 退出码 |
| --- | --- | --- |


[机器汇总](summary.json)；各子目录保留原始输出、命令、时间和退出码。组数不是独立场景数。

保护检查：[{"stage":"execution","message":"Error: Command failed: powershell.exe -NoProfile -ExecutionPolicy Bypass -File D:\\大三\\数据库\\pj1_2\\scripts\\check-mongo-owner.ps1\nGet-NetTCPConnection : 拒绝访问 \r\nAt D:\\大三\\数据库\\pj1_2\\scripts\\phase2-instance.ps1:17 char:12\r\n+   return @(Get-NetTCPConnection -State Listen -ErrorAction Stop | Whe ...\r\n+            ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~\r\n    + CategoryInfo          : PermissionDenied: (MSFT_NetTCPConnection:ROOT/StandardCimv2/MSFT_NetTCPConnection) [Get- \r\n   NetTCPConnection], CimException\r\n    + FullyQualifiedErrorId : HRESULT 0x80041003,Get-NetTCPConnection\r\n \r\n\n    at genericNodeError (node:internal/errors:983:15)\n    at wrappedFn (node:internal/errors:537:14)\n    at checkExecSyncError (node:child_process:883:11)\n    at execFileSync (node:child_process:919:15)\n    at assertOwnedPhase2Instance (file:///D:/%E5%A4%A7%E4%B8%89/%E6%95%B0%E6%8D%AE%E5%BA%93/pj1_2/scripts/phase2-runtime.mjs:5:14)\n    at file:///D:/%E5%A4%A7%E4%B8%89/%E6%95%B0%E6%8D%AE%E5%BA%93/pj1_2/scripts/run-phase2-acceptance.mjs:24:14\n    at ModuleJob.run (node:internal/modules/esm/module_job:329:25)\n    at async onImport.tracePromise.__proto__ (node:internal/modules/esm/loader:644:26)\n    at async asyncRunEntryPointWithESMLoader (node:internal/modules/run_main:117:5)"}]

- Synthetic P2 databases only; no real P1 migration or DB authorization deployment.
- Existing application startup ports remain occupied by user services; dedicated browser servers and runtime target/ownership checks replace restarting those services.
- Controlled failure hooks are not a real network outage or primary failover.
- Manual acceptance remains unexecuted.
