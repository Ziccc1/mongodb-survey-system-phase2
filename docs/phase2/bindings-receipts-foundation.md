# W02-B 来源绑定、完整回执与事务基础

> 本文记录该轮历史边界。2026-10-23 P2-008后续已完成W02—W04，新app_v2十三集合与业务/迁移实测见[当前实施说明](w02-w04-implementation.md)；baseline app_v1仍四集合。以下“未实现/本轮不做”仅指原轮次。


2026-10-23（Asia/Shanghai）。执行[原始P2-007 Prompt](prompts/P2-007-bindings-receipts-transactions.md)。**W02-B基础已完成，W02整体、迁移、W03及新增HTTP业务尚未完成。** 当前应用/ready/db:init继续baseline四集合，project2_app_v1前后指纹一致。S04—S06仍暂定。

## 增量关系与代码入口

第一阶段保留原不可变问卷快照、Publication-Key与提交回执及hash算法；W02-A提供Content/Config、BSON类型和十三集合结构；本轮在独立合成库增加来源事实校验与事务仓储，没有改写原发布/提交实现。十操作的回执编解码覆盖不等于十个业务服务已经实现。

| 实际文件 | 职责 |
| --- | --- |
| [operation-contract.ts](../../apps/api/src/database/operation-contract.ts) | 十操作固定请求/路径白名单、resourceKey、规范requestHash、按操作结果类型；不查当前资源 |
| [receipt-codec.ts](../../apps/api/src/database/receipt-codec.ts) | 严格整个回执与结果解码、版本/分支/状态/范围、BSON大小守卫；Long经BigInt安全范围检查再转JSON整数；结果深拷贝 |
| [binding-integrity.ts](../../apps/api/src/database/binding-integrity.ts) | Content规范摘要、bindingHash、严格实例/绑定/版内容/快照一致性；显式未正式化策略；BSON计数/Decimal边界 |
| [phase2-context.ts](../../apps/api/src/database/phase2-context.ts) | 唯一运行入口openPhase2Context、受信actor上下文、私有绑定仓储、完整回执插读和有界事务执行；不暴露任意Db工厂 |
| [bindings-receipts.test.ts](../../tests/bindings-receipts.test.ts) | 合成fixture、真实副本集并发/CAS/回滚、历史保护和隔离解码负例；测试不是新增业务产品 |
| [run-check.mjs](../../scripts/run-check.mjs) | 增加bindingsreceipts证据命令，保留原入口和原断言 |

未修改W01归属/端口保护、W02-A验证器/索引、原业务源码或shared依赖图。旧源码/编译四首入口共8个独立进程检查继续执行。

## 受控上下文、调用及session所有权

openPhase2Context只接受匹配URI的project2_test_*，连接前验证本机27019/rs0和OS实例归属，连接后核PID/实际目录/副本集身份，再复用十三集合初始化及核验。错误应用库目标以connect sentinel证明连接调用为0。没有环境模式切换，不接受任意Db，不返回MongoClient/Db。BindingRepository类为同模块私有实现。

forActor的actorId必须来自服务端既有认证结果；每次执行/查询仍检查账号存在，但**存在性检查不等于密码或Cookie认证**。没有新增HTTP入口可由客户端任意选择actor。所有问卷读取先核owner，不因题作者身份授予他人问卷管理权。

```typescript
const context = await openPhase2Context(syntheticTarget);
const actor = context.forActor(authenticatedUser._id);
const result = await actor.execute({
  operation: 'attachQuestion', path: {surveyId}, requestKey,
  body: {expectedRevision, questionVersionId, position: 0, required: false}
}, (session, fixed) => actor.bindings.attachOwned(
  new ObjectId(String(fixed.path.surveyId)), fixed.body, session
));
await context.close();
```

这是内部owner自用路径，未接入HTTP。执行器拥有session及begin/commit/abort/end；回调只能用提供的同一session，不能自己提交/结束、发消息、写文件或做不可回滚外部副作用。会重试的业务回调必须可重入。session写门禁同时检查本上下文登记、未结束及inTransaction；undefined和另一MongoClient的活动session实测拒绝。

actor.transaction是单次内部组合/一致读取助手，不承担完整幂等或有界自动重试；需幂等的写使用execute。后续服务仍须按固定请求正确选择业务回调、兑现对应operation结果并在同session中实现自己的权限/状态/并发门闩。通用执行器不会替共享、模板或题保存服务检查业务资格。

## 完整回执、重放和错误次序

固定请求解析及认证 → 按actorId/operation/resourceKey/requestKey查历史回执 → 若无回执才开启新事务并再次查回执 → 当前前提/业务写 → 完整成功结果守卫 → 插回执 → commit。

- createQuestion/createBank的resourceKey=create；saveVersion/restoreVersion为questionId；forkQuestion为源versionId；attach/replace/createTemplate为surveyId；adoptTemplate为templateId；saveInlineQuestion为surveyId+":"+instanceId。replace的instanceId仍在固定路径和hash中，不能同key换实例。
- 新requestHash固定为hash({operation,path,body})，使用原canonical。数字Content与数字规则沿用decimalValue规范化，多选条件排序；缺省实例ID仍缺省，服务端生成ID不放进请求摘要。旧definitionHash/payloadHash/发布与提交幂等算法不变。
- 同hash只读持久回执，返回原data+replayed=true/200；异hash409 OPERATION_IDEMPOTENCY_CONFLICT。重放测试让所有当前资源findOne及业务回调抛错，实测仅users认证读取和operation_receipts读取发生。实例删除、修订变化后仍回原实例ID、旧修订和问题列表。
- 回执版本、operation/kind/firstHttpStatus、顶层及嵌套字段、ID文本、安全整数、完整问题列表都严格检查；读取损坏503 OPERATION_RECEIPT_UNAVAILABLE，不当无回执重做。结果与响应深拷贝，调用方不能通过修改旧问题数组改变原结果。业务ID文本保持JSON，关联字段保留ObjectId，安全Long先检查BigInt范围再转number，Decimal不经过浮点。
- 调用原assertOperationReceiptBounds并新增整个信封守卫；result≤262144B、整文档≤1MiB，超限422 RECEIPT_TOO_LARGE并回滚，不截断问题。没有更新、覆盖、删除或TTL回执接口；数据库管理员仍可能绕过应用修改，读守卫会拒绝可检测的损坏。
- 事务snapshot/majority/primary，业务尝试最多3次，应用层commit调用最多3次（驱动内部自带重试另遵循驱动语义），单次maxCommitTimeMS=5000。TransientTransactionError重开事务；UnknownTransactionCommitResult在同事务重试commit，不直接重跑业务。无法确认时查原成功key，仍不能确认503 OPERATION_OUTCOME_UNKNOWN；竞争耗尽503 OPERATION_RETRY_LATER。原key不变。
- 11000需同时匹配operation_receipts的uq_operation、精确键型和当前scope值才按回执竞争处理；其他唯一冲突原样抛出，已中止事务不继续写。真实回执重复及publication重复分别验证分类。

## 来源查询、生命周期及保证层

readDraft/readPublication按已验owner的survey与准确scope/version查全范围，再检查一一映射；readPublicationInstance取特定实例；retainedDraft只匹配同survey/instance/questionVersion/acquisition四元组，错误/删除后的旧元组为null，不从publication复建。读取存量share/template/legacyImport只检查来源事实结构，不据此授新权或查当前grant active。

ContentHash为规范化Content的hash，不含required/jumpRules/实例ID。bindingHash与既有样例一致：按instanceId的ASCII字典序排序，hash([[instanceId,questionIdHex,questionVersionIdHex,contentHash,acquisitionIdHex],...])，保留固定数组次序。换版或换acquisition均改变它。新快照2必须匹配bindingHash；旧快照1不补字段，明确请求完整来源时未映射报QUESTION_MAPPING_INCOMPLETE，原baseline读取仍兼容。

| 不变量/操作 | 已保证层 | 仍需后续或调用方承担 |
| --- | --- | --- |
| 字段/BSON/范围、逐实例唯一 | W02-A strict/error Schema及索引；本轮读取守卫 | 不是外键/权限证明 |
| 问卷owner、冗余owner、实例存在、题版所属、内容hash、快照hash及映射齐备 | 绑定读取/纯完整性检查，503拒缺失/额外/重复/错版/损坏 | 旧数据来源须审计，不凭相同文字猜测 |
| 未正式化草稿 | requireComplete=false显式列unformalizedInstanceIds，requiredInstanceIds仍要求来源；已有坏行一律拒绝 | 单凭缺一行无法知道曾正式化还是本地题；需要来源的调用必须requireComplete或提供可信required集合，不能用宽松模式作发布门禁 |
| attachOwned/replaceOwned/updateConfig/removeDraft | 本人问卷draft/paused、expectedRevision CAS，定义修订同增；写绑定与回执同事务 | 完整HTTP/工作流、S04业务仍未实现 |
| owner新取得权 | 查实际正式版和题身份owner；服务端生成owner/authorization/acquisition/time/native/null evidence，严格拒客户端来源字段 | share/template/legacyImport新写入口未开放 |
| 同版保留/Config变化 | 保留原acquisitionId/时间/证明；真正换版新取得权；同题或本人直接派生v1限制 | 完整派生服务、规则审查UI未实现 |
| publication只插读 | 只有insertOwnerPublication，无update/delete/upsert；重复冲突不覆盖；draft删换不碰历史 | 新格式快照须已存在且匹配owner/sourceDefinitionVersion/hash；未来发布服务负责同事务快照/指针/问卷CAS，当前方法不是完整publish |
| 正式题版/来源公开限制 | 仓储仅查已有正式版，不写题身份/版/来源；不由自己持有派生判原创 | 版本不可变写权限、共享撤销门闩及公开全链授权留W03/W04/W06 |
| 跨集合一致提交 | 当前owner组合与回执以真实事务共同提交或回滚 | 不是完整授权系统；数据库角色尚未部署 |

## P2-007逐项实际覆盖

下列编号对应Prompt第六节的17组要求，不替代P2-T01—T50整项验收。最新TAP为12个子项/含父13通过。

| Prompt项 | 对应测试及真实结果 |
| --- | --- |
| 1 十操作存取 | R01，10种operation固定分支、首次200/201、重放200；空问题列表完整 |
| 2 作用域/hash | R02，四元组actor/operation/resource/key隔离，同key异hash409，Decimal等价hash相同，额外字段400 |
| 3 重放不读资源 | R03，业务回调及当前资源findOne设置抛错，重放只读账号/回执 |
| 4 旧结果不重建 | R03，实例删除后revision=2，仍返首次instanceId/revision=1/draftDefinitionRevision=2及非空问题 |
| 5 损坏结果 | R05，隔离解码fixture未知版/缺字段/错分支/额外字段/不安全Long均503；不关闭Mongo验证器；结果深拷贝 |
| 6 容量 | R06，约300KB结果和超过1MiB文档分别触发422；每次整个库指纹与写前一致 |
| 7 并发 | R07，屏障保证两个同key回调均到达，最后1业务效果/1绑定/1回执/revision1；不同key同修订1成功+1 EDIT_CONFLICT |
| 8 唯一键分类 | R02实际uq_operation重复分类true；R08实际uq_instance_binding重复分类false，错误传播且无覆盖/回执 |
| 9 两个故障点 | R09，业务CAS/绑定写后、回执插入后commit前分别注入异常，四集合相关数据及整库摘要完全回滚 |
| 10 丢响应/标签 | R10，真commit后钩子模拟丢响应，原key重试不多写；Transient钩子2次成功/3次耗尽回滚；同事务commit钩子3次、业务只1次；未知结果有回执确认/无回执503均覆盖 |
| 11 正常映射/Config | B11，完整draft、准确publication版本和实例查询；Config改动ContentHash不变，acquisition不变 |
| 12 映射损坏 | B12，owner/题版所属/缺题版/内容hash/快照hash/缺多重实例/未知Content字段均拒绝；实际损坏关系读拒绝前后DB指纹相同 |
| 13 hash兼容 | B13，bindingHash输入乱序不变、换版/取得ID可检出；旧快照及合成答卷原文/payloadHash在绑定删换后完全不变 |
| 14 owner原子路径 | R03/R06/R07，CAS+物化Question+绑定+完整instanceSave回执，首次、重放、冲突和故障核最终DB |
| 15 生命周期 | B15，实际replaceOwned及removeDraft不改两历史publication；同版replace保取得权；历史无修改/删除方法，重复插入不覆盖 |
| 16 session/新授权关闭 | B16，无session和外部活动session拒绝；owner不能管他人问卷，不能用他人题；伪造share/template/legacy及来源字段全部拒绝，DB不变 |
| 17 历史并存 | B17，同题同正式版在两个历史发布号正常并存，没有新增同题同版unique；未确认S04 |

补充真实BSON Long数量限制的正式题版可被owner选用，ContentHash保持。share/template/legacy存量证明分支只用隔离校验fixture保留结构；不以此宣称其授权服务完成。

**模拟与真实的区别：** 标签、commit异常和响应丢失由测试钩子模拟，没有制造真实网络中断或主节点切换；所有业务写入、session、事务提交/回滚、唯一索引冲突、并发CAS及最终查询均为真实rs0。未开放数据库验证器以插入本来会被拒绝的回执。映射关系损坏是测试库中Schema允许但需业务完整性层拒绝的合成fixture，保留用于审查。

## 结果、证据与复现

最终事务库：`project2_test_w02b_1792742329320_a82c2ec2`。保留合成数据：surveys=19、question_versions=3、survey_question_bindings=12、operation_receipts=26。其中包括合法历史、故意损坏关系/未映射旧快照fixture，不能当真实业务产物。

[汇总](evidence/P2-007-summary.json) · [事务原始结果](../../docs/testing/phase2-runs/P2-007-20261023/2026-10-23T07-58-46-536Z-bindingsreceipts-943da7db/artifacts/bindings-receipts/transactions.json) · [应用库前指纹](../../docs/testing/phase2-runs/P2-007-20261023/2026-10-23T07-58-46-536Z-bindingsreceipts-943da7db/artifacts/bindings-receipts/application-before.json) · [后指纹](../../docs/testing/phase2-runs/P2-007-20261023/2026-10-23T07-58-46-536Z-bindingsreceipts-943da7db/artifacts/bindings-receipts/application-after.json) · [全部命令、退出码、失败及截图入口](../testing/phase2-runs/P2-007-20261023/README.md) · [保护核对](evidence/P2-007-static-check.json)。


```powershell
$env:PHASE2_RUN_ROOT='docs/testing/phase2-runs/P2-007-review-new-run'
node scripts/run-check.mjs typecheck
node scripts/run-check.mjs build
node scripts/run-check.mjs domain
node scripts/run-check.mjs bindingsreceipts
node scripts/run-check.mjs schemafoundation
node scripts/run-check.mjs integration
node scripts/run-check.mjs phase1
```

类型、构建、领域12项（含8冷导入）、最新事务12子项、十三集合Schema、原账号13子项和原test:phase1七模块含浏览器均最终退出0。Schema实测仍69条接受/71条拒绝、28业务索引不变。verifyruntime退出0，应用仍四集合且当前0条；空库不是持续要求。原核心完整套件只跑一次，后续仅定向重跑新代码受影响项目。应用与测试进程已退出，专用MongoDB保留。

首次类型检查因泛型操作结果映射失败，使用显式操作类型参数修正；首次真实测试在Mongo没有监听时被归属守卫拒绝，原受控dbstart恢复专用实例后通过。一次临时只读hash命令受PowerShell的$oid展开影响产生SyntaxError，改用Python复算后与原样例完全相符，见补充核对证据。后续增加replace/保取得权、重放资源读取哨兵、未知commit、Long及结果深拷贝检查，只重跑关联测试，历史失败原件不覆盖。构建保留原app-config脚本及大图表分块警告。

未执行真实网络故障/故障切换、数据库角色部署、W01全部负例重造或完整UI改版；未安装/升级依赖，未修改第一阶段目录/冻结材料/原Prompt/历史证据，未迁移真实数据或提交/推送。下一子任务才是受控迁移inspect/dry-run，须独立审阅源只读身份、恢复副本/目标allowlist、旧映射期望范围和坏链阻断；本轮没有开始该任务。

## Content错误分类审阅修正（2026-10-23）

创建与派生题目的固定请求预处理曾将Content解析/归一化中的所有异常转成400。现通过共享层的`QuestionValidationError`区分结构与语义失败，保留原错误消息及叶模块依赖方向。结构不合法仍为`400 INVALID_REQUEST`；重复选项、上下界矛盾、无效或不精确Decimal等硬语义错误为`422 DEFINITION_INVALID`，返回全部`details`的`reason`及`/content/...`字段路径，不暴露内部临时实例ID。未知运行时异常继续传播，交由既有服务器错误处理。可保存的草稿软问题与请求hash归一化不变。

新增纯单元检查[operation-content-errors.test.ts](../../tests/operation-content-errors.test.ts)，同时纳入`node scripts/run-check.mjs domain`，也可单独执行`node scripts/run-check.mjs contenterrors`。先复现8项中4项失败，修正后domain共20项通过（原领域4项、新增8项、独立进程源码/编译产物导入8项），类型检查与构建退出0。此次未连接或写入数据库、未启动服务，未重跑数据库/浏览器业务测试。原W02-B验收证据保留，见[本次审阅证据](../testing/phase2-runs/P2-007-content-review-20261023/README.md)及[汇总](evidence/P2-007-content-review-summary.json)。
