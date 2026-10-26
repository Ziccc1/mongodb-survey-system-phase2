# 数据库及旧数据升级设计

**2026-10-25实际进展：** 已对真实一期停机目录完成冷备份与独立工作副本读取，在两个准确二期恢复目标完成真实6卷/5快照/8答卷升级、全量校验和再次apply零提交；认证后的二期应用ready也已验证。一期原目录1179文件摘要保持一致。当前二期人工样例库未混入或替换。详见[真实一期迁移实测](real-migration-verification.md)。以下“真实P1待W07”保留为原设计和P2-008历史状态，以本段最新证据为准。

2026-10-23：**P2-008已实现受控迁移工具，并对非空P2合成源完成真实备份、恢复、固定计划、apply、verify、中断和重跑。** 未连接27018/P1，真实P1审计/切换仍待W07。不是用空库代替迁移。证据见[实施说明](w02-w04-implementation.md)及[P2-008日志](../testing/phase2-runs/P2-008/README.md)。

## 本轮可执行工具与边界

代码`apps/api/src/database/phase2-migration.ts`，入口`scripts/migrate-phase2.ts`。使用既有Node/驱动，无mongodump/mongorestore；BSON逻辑备份在snapshot事务一致读四集合文档，前后比对选项/索引，完整BSON二进制base64保留类型，每集合128MiB上限。备份、计划、journal、manifest仅`.local/p2-008/migrations/<runId>/`。公开证据只含摘要/hash和合成编号。

```powershell
$env:PHASE2_RUN_ROOT='docs/testing/phase2-runs/P2-008'
node scripts/run-check.mjs migration
# 使用本次结果manifest中的RUN_ID及EXACT_TARGET，不自行拼任意库名
node --import tsx scripts/migrate-phase2.ts inspect RUN_ID
node --import tsx scripts/migrate-phase2.ts backup RUN_ID
node --import tsx scripts/migrate-phase2.ts restore RUN_ID EXACT_TARGET
node --import tsx scripts/migrate-phase2.ts dry-run RUN_ID EXACT_TARGET
node --import tsx scripts/migrate-phase2.ts apply RUN_ID EXACT_TARGET
node --import tsx scripts/migrate-phase2.ts verify RUN_ID EXACT_TARGET
```

`new-run`只建精确白名单manifest，不构造合成源或宣称验收。上面的migration测试构造有意义非空源并实际运行全链。每次run精确绑定source/restore/applicationTest及marker代际SHA；source只读，目标必须不同且为该run两个确切名字。普通API拒绝restore，迁移拒app_v1/app_v2/P1；URI/端口/rs0/目录/进程和连接后身份均核。不能借前缀接受任意project2库。

inspect审计完整格式/字段/索引/所有历史引用/hash/计数/指针；未知严格格式9、缺快照、owner缺失已测阻断。dry-run只写私有计划文件，不写源/目标/验证器；固定planId、sourceKey/sourceHash、预分配targetId、contentHash、evidenceKey和action。按(surveyId,instanceId)及可证明连续片段映射，同Content的Config差异共版，不同卷不合并；题型突变/缺失间隔另身份审计，父边null、来源unrecorded。相似题干的历史多实例独立保留，不当作已证明同身份。

apply先全量冲突预检，再DDL：只接受原/目标精确已知验证器及索引，新增9集合，必要时显式collMod为受审目标；DDL不声称原子。每卷小事务插身份/版本/旁路绑定并只升级survey格式及usageNumber/originTemplate；原快照/答卷不写。相同行skip，不同阻断；已升级但缺映射阻断。journal仅审计，commit后journal前钩子中断、删除journal后的重跑依DB事实恢复。源漂移/目标行冲突均不覆盖、不清库。

verify核全部BSON/元数据/索引、十三集合存储合法、完整来源覆盖、原计数/指针/ID/策略/旧hash。新业务应用上再读旧快照/统计，原Publication-Key/提交key重放原结果且整库指纹不变。实际网络断线/主节点切换未测试；中断为明确钩子，真实事务已commit。

以下第1—6节保留真实P1升级的后续方案；其P1维护窗口/授权尚未执行，不把合成演练当真实迁移。

## 1 独立运行环境

| 项目 | 第一阶段事实 | P2推荐及门禁 |
| --- | --- | --- |
| 数据目录 | project1/.local/mongodb-rs0-v2 | pj1_2/.local/mongodb-phase2-rs0，全新独立，绝不指旧目录 |
| 端口/副本集 | localhost:27018 / rs0 | localhost:27019 / rs0，不同进程；先核监听归属，冲突停止，不杀未知进程 |
| 库名 | project1_app_v2/test_* | project2_app_v1（四集合）/project2_app_v2（十三集合）/project2_test_*；project2_restore_<runId>仅精确运行白名单接受，P2业务拒project1_* |
| URI | 旧configure/.env.example固定27018 | mongodb://localhost:27019/project2_app_v1?replicaSet=rs0，URI与MONGODB_DB一致，独立密钥 |
| 归属标记 | start-mongo固定project1-instance.txt | 新marker包含phase2/规范绝对路径/27019/rs0/代际，路径+cmdline双查，拒未知非空目录 |
| 副本集初始化 | init-replica.ts硬编码member localhost:27018 | 同步27019，不符setName/member停止，不自动reconfig |
| Schema/ready | verifySchema固定4，拒未知索引/集合及不匹配验证器 | 受审13集合注册表、strict/error、双格式，初始化不自动collMod，ready不自动修复 |
| role | 四集合模板，认证尚未验收 | P2独立角色，新版本/快照/回执只插读；draft/publication绑定同集合须应用限制行操作；迁移DDL另身份 |
| harness/run-check | project1_test_*继承旧URI | 新P2前缀/27019、防误连断言，旧历史结果不覆盖 |

W01已实测四集合；P2-008已实测独立app_v2十三集合，角色模板已更新但未启用认证。原设计需要配套调整的清单为config.ts、.env.example、configure.mjs、start-mongo.ps1、init-replica.ts、init-db.ts（含Four collections输出）、app-role.mongosh.js、initialize.ts及harness/run-check。单节点课程副本集不宣称高可用。P2独立实例端口/版本/未启用认证及合成数据量已实测，P1旧实例/数据/FCV未连接审计；后续旧数据流程仍须另核实。

## 2 新库与升级分开

全新库：先建立独立实例及13集合精确验证器/索引，再角色和API合成数据验收。无旧数据时映射为空且完整，不虚构legacy。初始化可对一致结构重跑；多集合DDL不称整段原子事务，失败保留已建对象、报告。

旧数据：只在独立恢复副本演练，保留P1原目录/数据库只读。现initialize拒validator不符，不能作为升级程序；单独migrate-phase2提供inspect/dry-run/apply/verify及目标库断言，未知更老格式单独审计适配，不能放宽为任意object。

## 3 源审计、备份及隔离恢复

1. 经后续数据库实施授权，先只读确认真实源实例/库/版本/FCV/rs0/集合选项/索引、数量/格式分布、快照与答卷引用、hash算法、策略/计数。额外集合、schema1答卷或缺失快照列阻断，不能从历史文档假定支持。
2. 在获准维护窗口停止业务写，逻辑备份全部四集合及metadata，记录工具版本、一致性方法和起止时间；不复制运行中的WiredTiger目录。计划位置pj1_2/.local/backups/phase1-<runId>/dump，逐文件SHA-256。此路径本轮未创建。内部身份/passwordHash备份不放公开docs。
3. 若不停写必须另设计一致性/oplog窗口验证，不能前后不同时间拼集合。恢复到27019/project2_restore_<runId>，不改原P1进程/数据；核数量、类型、hash、索引、引用、计数并留实际restore结果。未restore过不能声称备份可恢复。

## 4 dry-run与映射

dry-run在恢复副本读并生成固定计划。必须保持旧用户/问卷/快照/答卷ID、publicId/链接、发布号、definition/policy/definitionHash、responses所有原字段（含answers及BSON类型、requestId、payloadHash/hashVersion、匿名/重复、内部账号、submittedAt）、两个计数、firstPublishedAt、structureLocked原值。

按(surveyId,instanceId)保守创建旧题身份；该身份内相同规范化Content可映射同导入正式版，不同Content另建版；Config差异不生题内容版。不跨卷因题干/hash相同归并。父子/复制/派生无证据则parent/source=null、审计unproven，不用版本号猜。疑似删除重建或类型突变列审计；无法证实时保守新身份并明确不可追溯，不能误报原题延续。

写operation=legacyImport题版及publication绑定，关联键(surveyId,publicationVersion,instanceId)，snapshotHash等原definitionHash，contentHash等旧题去配置规范摘要。旧snapshot不补字段/格式/hash，旧response一条不写。草稿匹配导入内容可绑定；不匹配保持待显式正式保存本地题。缺失历史定义阻断对应问卷，不能套当前questions。

计划每行含planId、sourceKey/sourceHash、目标预分配OID、targetContentHash、evidenceKey、action；计划固定后重跑用同OID，禁止每次new ObjectId重复导入。审计覆盖所有发布快照（含无答卷版）及草稿，不能只扫responses。

## 5 验证器与apply顺序

1. 审计、备份恢复演练先过，目标停业务写；保存原四集合验证器/索引，逐文档预检目标oneOf、unique冲突、空间预算。
2. 建9新增集合与索引，原9业务索引保留不drop。surveys允许格式2/3，snapshot允许1/2，responses支持已审计基线2；更老格式未证明不假装支持。修改strict验证器不会自动证明历史文档有效，必须另全量扫描。[官方验证器修改说明](https://www.mongodb.com/docs/manual/core/schema-validation/update-schema-validation/)。
3. 按每问卷小事务写题身份/导入题版/来源绑定，surveys升3并originTemplate=null、usageNumber为计划预分配独立随机稳定编号，其他字段原样。旧快照留1。目标行已存在时比对sourceHash/全部语义，相同skip，不同停，不replace覆盖。
4. 本轮checkpoint放受保护.local/p2-008/migrations/<runId>/plan-<target>.json及append-only journal，每问卷事务提交后记录。它是工具审计文件，业务事实全在MongoDB。journal写失败通过目标唯一键/sourceHash重读核定，再重跑；不能以文件单方当成功凭据。
5. 中断/权限/索引/验证器失败立即停止，保留journal/备份，不drop整库。完成全量verify才允许新app启动及ready，后者只查不迁移。迁移期间不开放业务写，避免checkpoint与新数据冲突。

## 6 逐项不变量与恢复路径

| 不变量 | 未来验证方法 | 失败处理 |
| --- | --- | --- |
| ID/publicId/链接/策略/旧字段不变 | 源/目标按_id全量字段及BSON类型摘要比较 | 阻切换 |
| 旧快照原样及hash可复算 | 数量/_id匹配、原字段逐值逐类型比对、原算法复算 | 找回证据，不猜定义 |
| 答卷/幂等/匿名事实原样 | 按_id逐字段/类型hash核对；原unique完整存在 | 任何差异阻切换 |
| 两计数与答卷相符 | cumulative=count所有response，current=count指针版；源已错列源缺陷 | 独立决定修复并记录，不悄悄改旧计数 |
| 映射完整唯一 | 每publication实例恰好binding，owner/hash/正式版一致，无悬空 | 阻对应问卷上线及跨卷统计 |
| 不误归并/猜父子 | 不同survey导入不同identity，不可证明来源null | 计划审核失败 |
| 原成功请求可重放 | 在隔离副本用旧body+key回原回执、不增计数；异内容冲突 | 不开放写 |
| 新旧功能可用 | 独立P2库实际Schema/索引/事务、六类回归+P2用例 | 以新日志判，历史PASS不替代 |

开放P2新写前失败：停目标P2服务、保留失败库，另建恢复库从已验证备份restore、核hash/数量，再用固定计划重跑，不清原P1。已有P2题版/新答卷后：不能直接P1备份覆盖或旧app降级写13集合；先停写/备份现状态，优先向前修复，必要时新数据重放合并另设计验收与切换授权，不丢新版数据。

实际完成证据须runId、备份manifest hash、真实目标环境/代码版本、批次重跑日志、全量不变量、恢复演练及回归。公开docs只脱敏摘要/索引，原备份不上传。合成演练已按上文实际执行；真实P1维护窗口/数据库授权及S05/S06仍在相应实施轮核实。

## P2-003 设计修正对初始化与升级的影响（历史时点）

当前新增集合仍未实现，无已运行P2数据需要本轮迁移。未来新库初始化和Schema精确比对须采用修正后的TemplateV1（accessFence默认0）及完整OperationReceiptV1（resultVersion/firstHttpStatus/按操作的完整result），而不是此前简化回执。门闩无索引和公开字段，不进模板contentHash；角色沿用模板update能力，普通选用只改内部门闩、不改管理revision/updatedAt。

若实施轮发现已有人按旧设计写入P2原型数据，应列为另一次显式迁移：模板只在核定管理revision语义后回填accessFence=0，不能把过往选用导致的revision猜回某个值；旧简化回执无法凭当前资源补出已丢失instanceId/校验问题，也不能伪称完整。缺少原成功响应的回执先隔离/阻断该历史key重执行，报告待恢复证据；只有可证明的原DTO才能受审转换。不能改requestHash/key或删回执让重试变成新增。原P1四集合、旧快照hash和答卷幂等事实完全不受本次设计修正影响。

## P2-004 来源核验与Usage兼容补充（设计沿革）

保持旧快照、旧答卷、原ID、definitionHash/payloadHash及原统计事实不变；不凭题干相似或相同hash推断作者/派生。迁移plan逐正式版本记录distributionSource分类依据与evidenceKey：明确源questionId+versionId的派生才能写derived；经审计证明原创才写original；没有来源记录写unrecorded（不是自动认定他人派生），null源对不得被公开流程默认为原创。缺失/循环/伪造已知源链单列阻断清单，保留所有旧证据；自用映射和统计仍按原权利设计，不能为公开资格改写历史答案。

同身份后续版本/恢复必须继承已证来源义务，不因导入排序、operation=legacyImport或新parent清除上游。既有未知来源按审计维护流程提供真实证据和可核验替代版本/映射；保留旧不可变文档，不能普通API声明原创。若修正来源需替代身份，须保留所有已知上游义务及原审计联系；没有充分证据继续禁止公开。已有模板若按旧单授权结构试写，预检列为不兼容，禁止自动上架；只有完整核验后新建模板及多级distributionProof，不伪造旧批准记录或覆盖旧内容hash。当前功能未实现，本轮未执行任何转换。

新增版本/模板字段使用未来初始V1目标白名单；无P2线上库假设，不能据此跳过未来真实数据预检。Content摘要算法未变，新lineageHash和受影响模板contentHash另算；旧问卷definitionHash、bindingHash和答卷payloadHash不跟随来源证明改变。S04已确认实施，S05/S06仍暂定，来源继承本身已确认。

Usage仅为binding+当前指针的查询，不新建usage集合、不回填客户端状态。先版本过滤再按题版/问卷聚合，历史按非当前publication判定，暂停/关闭指针不变；原旁路映射可用，缺失映射按既有错误阻断，不凭答案猜来源。验收扩展T42/T43及T46—T50；当前T46—T50已实测，公开链仍待W06。


## P2-006 / W02-A 实施状态（2026-10-23）

[领域与Schema基础](schema-foundation.md)已完成：Content/Config严格适配、BSON边界、13集合完整模型/验证器/28业务索引及baseline/phase2双注册表。默认应用及db:init/ready仍四集合，phase2只允许新合成测试库；初始化预检所有对象、不collMod、不迁移。真实接受69条/拒绝71条（每次核计数不变），13个唯一业务索引分别拒重复，所有索引键序/unique/partial实查。旧格式/互斥来源/完整回执/证明均保留P2-003/004。

类型/构建、领域4项、Schema、原test:phase1七模块（含浏览器）、账号四集合13子项及日常核验均最终退出0；应用库前后选项/索引/数据摘要不变。初始类型错误、Decimal大小写差异及实例未运行的失败原件保留，修复与重跑详见[真实汇总](evidence/P2-006-summary.json)。本轮不实现业务仓储/授权/不可变性/跨集合事务或迁移工具，不将T01—T50整体标PASS；W02其余部分未完成，S04—S06仍暂定。


## W02-B提供的后续依赖（非迁移实施）

[W02-B](bindings-receipts-foundation.md)现提供严格来源完整性、完整回执与受控事务，但新legacyImport写入口仍关闭，原格式1快照不自动补bindingHash。未来inspect/dry-run须先审阅独立恢复目标/只读源allowlist、已知应映射实例范围、证据键及坏来源阻断；不得复用本轮owner写路径冒充迁移。本轮未实施任何迁移工具/真实数据映射/备份恢复。
