# P2-007 Content错误分类审阅证据

2026-10-23。仅修正创建/派生题目的Content错误分类，沿用API契约400结构错误、422语义错误的分界。

| 实际命令 | 退出码 | 结果与原始日志 |
| --- | --- | --- |
| `node scripts/run-check.mjs contenterrors`（修正前） | 1 | [8项中4项失败，复现400误分类及异常吞并](2026-10-23T08-22-39-798Z-contenterrors-4efa46ee/output.log) |
| `node scripts/run-check.mjs typecheck` | 0 | [类型检查](2026-10-23T08-23-17-285Z-typecheck-a2adb963/output.log) |
| `node scripts/run-check.mjs build` | 0 | [构建](2026-10-23T08-23-35-731Z-build-2c990f17/output.log)，原app-config脚本与大分块警告仍在 |
| `node scripts/run-check.mjs domain` | 0 | [20项通过](2026-10-23T08-23-48-940Z-domain-9cf74a34/output.log)，含新增创建/派生8项及源码/产物冷导入8项 |

每条命令目录同时保存runner生成的`result.json`。复跑时设置新的`PHASE2_RUN_ROOT`子目录，保留此次原件。

新增8项检查分别覆盖两种操作的结构400、语义422及字段/原因、数值归一化与草稿软问题、意外异常原样传播。语义夹具包括重复选项、文本/多选/数值上下界矛盾、NaN、Decimal范围越界、空白题干。没有连接数据库或启动服务，也没有执行数据库/浏览器业务测试。
