# P2-W01 独立运行与第一阶段兼容基线

> 本文记录该轮历史边界。2026-10-23 P2-008后续已完成W02—W04，新app_v2十三集合与业务/迁移实测见[当前实施说明](w02-w04-implementation.md)；baseline app_v1仍四集合。以下“未实现/本轮不做”仅指原轮次。


2026-10-22（Asia/Shanghai）。按[P2-005原始Prompt](prompts/P2-005-runtime-baseline.md)实际实施。**P2隔离环境已可运行第一阶段业务，仍是四集合兼容基线。** P2-003/P2-004的回执、模板门闩、来源分发和逐版本Usage设计保留，13集合及新增业务尚未实现；没有迁移真实旧数据。S04—S06继续暂定。

<a id="w01-runtime-review"></a>

## 三项运行审阅修正（P2-005复审）

用户指出的三项均成立并已修复：[真实结果](evidence/P2-005-review-summary.json)、[本次日志](../testing/phase2-runs/P2-005-review-20261022T132318Z/README.md)、[保护核对](evidence/P2-005-review-static-check.json)。下方原P2-005运行表中的0条应用记录、12个测试库等是初轮验收快照，**不是应用使用后的持续约束**；旧日志/证据不改写。

1. **API自身归属检查**：buildApp在创建MongoClient/连接前调用database/instance-ownership.ts，复用既有PowerShell归属定义，核专属标记、规范项目路径、实际数据目录及27019监听mongod进程。连接后在读应用Schema/数据前复核serverStatus.pid、getCmdLineOpts、rs0主节点和唯一member；与先前OS归属不符即关闭客户端并拒绝。npm start、dev:api及直接buildApp都走此路径；资源路径基于模块位置，源码/编译版均有效，不依赖cwd。无法获取CIM/实例信息就拒绝，不能退化为只查URI。当前为Windows本机隔离环境；将来启用数据库认证时需审阅相应只读诊断权限，不能绕过保护。
2. **冒烟只验证本轮子进程**：startup在创建子进程/HTTP前确认API与Vite端口均空闲；启动后从OS查询所有相关监听PID，必须与仍存活的直接子进程一致；HTTP前及结束前再次核验，失败不输出成功，finally只释放自己创建的进程。已有服务即使对所有路径返回200，也会提前拒绝并保持它运行。正常通过证据包含listenerBeforeHTTP/listenerAfterHTTP；这补足初轮HTTP200本身不能证明监听归属的局限。
3. **日常核对与空库验收分离**：verifyruntime继续检查归属、primary、四集合Schema/索引、工作区链接及前端资产，输出真实每集合count及totalDocuments，不要求为0，也不再硬编码“未导入旧数据”的不可推断结论。仅verifyinitial或显式--expect-empty要求所选库为空；有数据报P2_INITIAL_BASELINE_NOT_EMPTY，不删数据。

```powershell
# 日常运行检查：正常注册、建卷后仍可执行
node scripts/run-check.mjs verifyruntime
# 只在首次新库验收时使用；正常使用后失败是该前提不满足
node scripts/run-check.mjs verifyinitial
# 等价底层选项，需通过证据运行器提供输出目录
# scripts/verify-runtime-baseline.ts --expect-empty
```

针对性6项：首轮4项通过、2个编译API负例因测试钩子Windows绝对路径的ESM加载错误失败；改用file URL后仅重跑这2项，均通过，原失败输出保留。正常API/Vite 10项HTTP及前后PID匹配通过并释放；原账号/四集合集成13个子项、发布与提交回归均退出0。新有数据样例只写project2_test_runtime_review_*：通过原接口正常注册并创建问卷后users=1/surveys=1，日常核验退出0，空库模式按预期退出1，两种核验前后数据摘要相同。实际应用库未写入，目前日常核验报告0条；数量会随正常使用变化。

本次未重跑完整浏览器/图表套件，初轮证据仍只代表其原时点；没有改业务断言/Schema/锁文件、安装依赖、迁移真实数据或提交Git。首次工具审批超时的命令未执行，随后重试成功，不是安全性判定。P2 MongoDB未停止/重配；本次API/Vite/合成HTTP监听已释放。

## 实际环境与服务状态（P2-005初轮快照）

| 项目 | 本轮实际值 |
| --- | --- |
| 项目 | D:\大三\数据库\pj1_2；HEAD仍为c48cb67c723d1d966fccfd5b1ba117d3c70b3d3c，保留既有未提交设计 |
| Node / npm | C:\Program Files\nodejs\node.exe，22.17.0 / npm.cmd 10.9.2；符合原engines，未放宽范围 |
| MongoDB / mongosh | D:\Programmer\bin\mongod.exe 8.3.11 / mongosh.exe 2.11.1 |
| 浏览器 | 本机Edge 155.0.4283.62，原Playwright 1.64.1实际无头运行 |
| 实例 | localhost:27019，独立单节点rs0，member=localhost:27019，可写primary |
| 数据目录 | pj1_2\.local\mongodb-phase2-rs0，project2-instance.json记录项目绝对路径/27019/rs0及专属kind |
| 应用库 | project2_app_v1：users、surveys、survey_versions、responses；原strict/error验证器及9业务索引+4个_id_索引；各集合0条 |
| 测试库 | 本轮12个project2_test_*合成测试库保留；其中一个_unknown库是原初始化拒绝负例，不是旧业务库 |
| 访问入口 | 开发前端http://localhost:5200，代理API到http://127.0.0.1:3200；默认写请求Origin为5200 |
| 交回状态 | API/Vite与测试浏览器已释放，相关应用端口空闲；仅保留本轮P2 MongoDB。核验时PID=13860，**停止时仍须实时核归属，不能照旧PID杀进程** |

[实时服务状态](../testing/phase2-runs/P2-005-20261022T123358Z/final-service-state.json)记录核验时间、监听及进程归属；[机器结果汇总](evidence/P2-005-runtime-summary.json)与[本轮完整日志目录](../testing/phase2-runs/P2-005-20261022T123358Z/README.md)保存退出码、开始结束时间和原始失败。当前未启用MongoDB认证或角色强制保护；仅回环监听，角色工作留后续阶段，不能把角色脚本说成已部署。

## 实际变更与原因

| 文件 | 前→后与边界 |
| --- | --- |
| .env.example、scripts/configure.mjs | P1 27018/app_v2→P2 27019/app_v1，开发端口3200/5200；首次生成独立随机JWT/CURSOR，已有.env只校验不覆盖，文件值优先校验；不输出密钥 |
| apps/api/src/config.ts、app.ts | 连接前严格校验mongodb协议、本机、明确27019、唯一rs0、URI/库名一致、project2_app_v1或受控project2_test_*；直接传Config的buildApp也不能绕过。JWT issuer/audience等既有业务语义保持 |
| scripts/phase2-instance.ps1、check-mongo-owner.ps1、phase2-runtime.mjs、start-mongo.ps1 | 启动先查端口、独立标记、绝对目录及实际mongod参数；不能访问进程信息就拒绝，不能当端口空闲；拒绝链接目录/未知非空目录/错标记，不覆盖标记伪装归属。后台隐藏窗口，不杀未知进程 |
| scripts/init-replica.ts、init-db.ts、stop-mongo.ps1 | 仅已核实P2实例才能初始化rs0/四集合；已有正确配置只核查、不reconfig。stop只向实时确认的实例发shutdown，并核原进程退出及端口关闭；不删除数据 |
| apps/web/vite.config.ts | 前端端口从PUBLIC_APP_URL读取，与APP_ORIGIN相同；代理读取API_PORT。公开配置仍仅publicAppUrl，不注入数据库或密钥 |
| tests/runtime-environment.ts、phase1/harness.ts及4个原回归入口 | 首次MongoClient前验证P2实例，使用唯一project2_test_*；仅调整连接/来源/输出路径，原业务断言不变。旧证据路径改为本轮独立目录 |
| scripts/run-check.mjs、tests/phase1/redesign.ts | 保留原模块，受控P2证据根、每命令唯一子目录、时间/退出码及浏览器截图；不覆盖docs/testing/runs、screenshots或.local/evidence历史 |
| tests/runtime-isolation.test.ts、runtime-ownership.ps1、runtime-startup.ts、scripts/verify-runtime-baseline.ts | 少量真实配置/目录拒绝、启动/代理/清理及实际Schema/索引/工作区链接核对；不替代原业务测试 |

package.json、package-lock.json、各workspace依赖声明未改，npm ci按原锁安装147个包（审计151个，报告0漏洞）；3个@survey链接均指向pj1_2本身。schema.ts、initialize.ts、models/shared及发布/提交/校验/统计领域代码未改；app.ts在初轮增加连接前目标断言；复审进一步加入API自身归属与连接后实例身份检查。原P1目录、.env、数据库未用于写入或连接；本轮未做P1数据全量审计。

## 首次安装与启动复现

在普通Windows PowerShell中执行；若工具沙箱不允许下载、CIM或后台进程，应按工具审批处理，不能跳过归属检查。项目要求原Node22/npm10，避免使用其他工具附带的新版Node。

```powershell
Set-Location -LiteralPath 'D:\大三\数据库\pj1_2'
node --version
npm.cmd --version
npm.cmd ci
npm.cmd run configure
npm.cmd run build
npm.cmd run db:start
npm.cmd run db:init
```

先build可提供共享包产物；本轮首次执行中也先由typecheck构建shared，再完成db:init及完整build。db:init再次执行只查一致或创建缺失四集合；不collMod/drop/迁移。configure重复执行保持.env原字节；若已有P1/不符配置会报错，绝不连接旧库试验。

开发运行分别在两个终端：

```powershell
npm.cmd run dev:api
```

```powershell
npm.cmd run dev:web
```

访问http://localhost:5200，不混用127.0.0.1作为前端Origin。3200是默认API监听地址；直接用3200页面写入会与默认5200 Origin不同。若单独使用构建版，将.env的APP_ORIGIN和PUBLIC_APP_URL均显式改为http://localhost:3200，再只执行npm.cmd start，不同时启动占用同端口的Vite；切回开发时恢复两项5200并重启相关服务。

前台API/Vite用Ctrl+C停止；MongoDB独立停止/重启：

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/stop-mongo.ps1
npm.cmd run db:start
```

上述stop/start已经实际验证。mongosh在正常shutdown断连时本机返回ECONNRESET/exit1；脚本仅在**原归属进程已退出且27019已关闭**后接受这类断连，其他错误仍失败，不强杀数据库进程。数据目录和测试库保留。

## 可复现检查与真实结果

带日志的重跑入口会新建唯一P2证据目录；如需同一组目录，可将PHASE2_RUN_ROOT设为docs/testing/phase2-runs/下的新runId子目录，不得指向历史目录。

```powershell
node scripts/run-check.mjs isolation
powershell.exe -NoProfile -ExecutionPolicy Bypass -File tests/runtime-ownership.ps1
node scripts/run-check.mjs typecheck
node scripts/run-check.mjs build
node scripts/run-check.mjs phase1
node scripts/run-check.mjs existingregression
node scripts/run-check.mjs verifyruntime
node scripts/run-check.mjs startup
```

phase1实际调用原npm run test:phase1，existingregression调用原npm run test:regression；本轮保留这两个原入口。startup只短时启动已构建API和实际Vite；复审后先检查空闲端口，再核监听PID属于本轮子进程，结束释放自己创建的子进程，不保留长期测试应用。

| 检查 | 实际结果与退出码 | 原始记录 |
| --- | --- | --- |
| 锁依赖安装 | 最终成功，0；首次受限环境失败保留 | [npm ci日志](../testing/phase2-runs/P2-005-20261022T123358Z/npm-ci.log) |
| 配置隔离 | 14/14通过，0；负例不连接P1/27018 | [isolation](../testing/phase2-runs/P2-005-20261022T123358Z/2026-10-22T12-44-30-428Z-isolation-bc91f319/result.json) |
| 目录归属 | 6项合成文件负例通过，0；不改实际数据库目录 | [ownership](../testing/phase2-runs/P2-005-20261022T123358Z/ownership-guards.log) |
| 类型检查 | 原typecheck成功，0 | [typecheck](../testing/phase2-runs/P2-005-20261022T123358Z/2026-10-22T12-43-09-216Z-typecheck-73825ff2/result.json) |
| 构建 | 原build成功，0；有下述警告 | [build](../testing/phase2-runs/P2-005-20261022T123358Z/2026-10-22T12-44-38-906Z-build-342d1ef4/result.json) |
| 四集合初始化 | 初始及一致性重跑均0 | [dbinit](../testing/phase2-runs/P2-005-20261022T123358Z/2026-10-22T12-45-06-603Z-dbinit-52b3dadd/result.json) |
| 原核心回归 | publish/flow/submit/statistics/edges/pagination/browser均0，整体0 | [phase1](../testing/phase2-runs/P2-005-20261022T123358Z/2026-10-22T12-45-37-902Z-phase1-0057dd9d/result.json) |
| 原补充回归 | accounts/integration 13个子项、editor 11个具名检查、字符边界、基础浏览器均通过；整体0 | [regression](../testing/phase2-runs/P2-005-20261022T123358Z/2026-10-22T12-46-14-412Z-regression-09941de9/result.json) |
| 真实应用与代理 | 10项HTTP检查通过，0；API/Vite均已释放 | [startup](../testing/phase2-runs/P2-005-20261022T123358Z/2026-10-22T12-48-24-230Z-startup-3faa6fc7/result.json) |
| 运行实物核对 | 真实primary、4集合及验证器/索引一致，空应用库，12个测试库、3工作区链接、前端资产密钥检查通过，0；重启后复核仍通过 | [runtime](../testing/phase2-runs/P2-005-20261022T123358Z/2026-10-22T12-53-30-971Z-verifyruntime-fe555f23/result.json) |

浏览器真实运行Edge：核心闭环包括四型添加/保存刷新、路径与分页填写、真实发布、丢响应后原key重试只一份、重发与历史；补充回归包括编辑冲突/本地输入保留/字符边界/登录退出。没有新增镜像业务测试替代原套件。regression.ts按顺序检查4个spawnSync.status，任一非0立即退出；本轮末尾完成标记及父退出0证明4个子进程都为0，未补造各子进程未记录的起止时间。editor原测试的历史fixture元数据仍提到早期接口未实现，仅描述其直接DB fixture做法；本轮publish/submit实测以独立模块为准。

## 失败、修复与未执行范围

本轮保留4次非0尝试：npm ci受限环境Exit handler never called→工具审批后原锁安装成功；初次实例启动参数误用replSetName→只读getCmdLineOpts确认实际字段为replSet后修复；两次停止适配分别遇shutdown连接重置、Windows PowerShell将重定向stderr提升为错误→使用隐藏.NET子进程收集输出，再验证原进程退出/端口关闭，第三次停止与随后重启成功。失败日志不覆盖，完整索引见本轮日志目录。没有通过删数据、重配未知实例或改业务断言解决。

build仍报告经典/app-config.js不能按module打包、ChoiceChart分块超过500kB及plugin timing诊断；不是类型/构建失败，本轮未为环境任务改UI分块。没有单独运行图表渲染/全布局专项；原核心浏览器内已有响应式断言仍照常执行。原套件的同机LAN接口探测通过，不等于第二台设备或公网可访问。

P2目标T01—T50仍未整项验收：本轮只提供原功能兼容证据。T01/T03—T06有原业务覆盖，T02仅原四型、不含I04正式化，T32仅隔离环境与四集合，均不据此将P2计划整批标PASS。13集合/新接口/授权来源/模板/跨卷统计、旧数据审计/备份恢复/迁移均未执行；旧Prompt、旧日志前缀和冻结基线保持，不提交/推送。

## 下一步P2-W02

建议在当前基线之上实施Content/Config适配、受控13集合注册表及可执行验证器/索引、不可变来源与完整回执基础、独立inspect/dry-run迁移工具；正式apply/真实旧数据恢复另安排。本轮到此结束，不提前开始新增业务。原S04—S06待对应业务阶段确认。


## P2-006 / W02-A 实施状态（2026-10-23）

[领域与Schema基础](schema-foundation.md)已完成：Content/Config严格适配、BSON边界、13集合完整模型/验证器/28业务索引及baseline/phase2双注册表。默认应用及db:init/ready仍四集合，phase2只允许新合成测试库；初始化预检所有对象、不collMod、不迁移。真实接受69条/拒绝71条（每次核计数不变），13个唯一业务索引分别拒重复，所有索引键序/unique/partial实查。旧格式/互斥来源/完整回执/证明均保留P2-003/004。

类型/构建、领域4项、Schema、原test:phase1七模块（含浏览器）、账号四集合13子项及日常核验均最终退出0；应用库前后选项/索引/数据摘要不变。初始类型错误、Decimal大小写差异及实例未运行的失败原件保留，修复与重跑详见[真实汇总](evidence/P2-006-summary.json)。本轮不实现业务仓储/授权/不可变性/跨集合事务或迁移工具，不将T01—T50整体标PASS；W02其余部分未完成，S04—S06仍暂定。
