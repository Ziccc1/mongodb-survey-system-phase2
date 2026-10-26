# 第一阶段冻结基线索引

基线提交：`c48cb67c723d1d966fccfd5b1ba117d3c70b3d3c`。冻结日期：2026-10-22。14份文本均由git show commit:path读取原始字节，早于现行文档更新；不是从工作树复制。源码快照加.txt后缀避免作为可执行Schema入口，内容字节不变。每份SHA-256和字节数见[manifest.json](manifest.json)。

[第二阶段阅读入口](../../phase2/README.md) · [当前项目入口](../../../README.md)

| 历史来源路径 | 冻结原文 | SHA-256 |
| --- | --- | --- |
| `README.md` | [查看](README.md) | `90cfdf9d39435ad35dcaf5b78902a91fd3a7efb35fcd088795e5bcc13f2fb281` |
| `docs/requirements.md` | [查看](docs/requirements.md) | `5f859196472615c21404886432e98107a595f3a3612da18b5cb0e1a5b01d2fe0` |
| `docs/decisions.md` | [查看](docs/decisions.md) | `f7dabc4725f63de3193e5d264a8a79ded20bd2a820ad966a57d76b7b06fe6a5c` |
| `docs/system-design.md` | [查看](docs/system-design.md) | `f173f9007c4b92cacb0edf91133c29a8a0a3ea3f7d751434a9a3ab02519010e3` |
| `docs/database-design.md` | [查看](docs/database-design.md) | `78e98dc3a2eecd2d40bc54c9da5b157ffa7f5b3f871c1c856f88c707adfe0b8c` |
| `docs/api.md` | [查看](docs/api.md) | `fe08896d989f556d62ec13944753fa5b060a162e9d0934ed5857ece3281e8ab1` |
| `docs/key-logic.md` | [查看](docs/key-logic.md) | `9a4a7e2268d24ca26351f928c7171702ff5d769dab37b6cb08eb8a65b9df9cdf` |
| `docs/versioning-change-plan.md` | [查看](docs/versioning-change-plan.md) | `31dff3a7625bf30b47bda18c3173da22bf89363f74fbf36ae25f5be57c41e129` |
| `apps/api/src/database/schema.ts` | [查看](apps/api/src/database/schema.ts.txt) | `c3e75d8584ffd8b7279b06555082d0ce6a8a2f8c928173326baacca2740900e2` |
| `apps/api/src/database/models.ts` | [查看](apps/api/src/database/models.ts.txt) | `961d4075d1e2af2029031d51fdc79192a805f05148e4e61372bc8b95e1f1952e` |
| `packages/shared/src/questions.ts` | [查看](packages/shared/src/questions.ts.txt) | `5598e007fa9fddf26a5093fa3371c690cd40d409a577e781db5e1963105184ad` |
| `packages/shared/src/core-types.ts` | [查看](packages/shared/src/core-types.ts.txt) | `af2a145f72b19a010b8672303b30714f3ca9a51b6ede711424574792d712d758` |
| `packages/shared/src/index.ts` | [查看](packages/shared/src/index.ts.txt) | `30bcadbe845689a6f57b0419eb799cbef6c689c639b84e05aeef540b725e204d` |
| `packages/shared/src/answers.ts` | [查看](packages/shared/src/answers.ts.txt) | `d3e9150d7d497ac67b73c49e66cb4ddc76633ead1357b476887472cca51c7abc` |

## 归档覆盖与历史相对链接

归档只覆盖上表14份对照材料，未复制全部仓库、截图、旧测试或脚本。原文内部相对链接原样保留，未为了导航重写基线字节。部分链接目标不在本次归档范围；[历史链接清单](link-map.json)逐条标出，并在当前工作区有对应文件时列出fallback（该fallback属于当前材料，不能冒充冻结版本）。需严格核对其他历史文件时仍以同commit的git对象为准。

## 本地补充来源

根目录完整报告“基于 MongoDB 的在线问卷系统设计与实现报告 (2).docx”及图表是工程迁移时补齐的本地材料，不能冒称该提交已跟踪。原件保留、未改；本轮只读提取的报告结构见[阅读证据](../../phase2/evidence/README.md)。教师变更文档亦为目标目录原有文件。工程来源与405文件清单见[工程迁移记录](../../phase2/migration.md)。

[第一阶段需求](docs/requirements.md) · [决策](docs/decisions.md) · [总体](docs/system-design.md) · [数据库](docs/database-design.md) · [API](docs/api.md) · [关键逻辑](docs/key-logic.md)
