# 第一阶段到第二阶段变更对照

更新日期：2026-10-26。W01—W06、界面收尾、真实旧数据隔离升级和本机认证角色均有实际验证；当前完成范围见[最终交付核对](delivery-verification.md)。下表对照第一阶段实际设计与第二阶段实现，具体维护文件见[系统设计](../system-design.md#2-已实现文件与职责)。[冻结原文](../baseline/phase1/INDEX.md)保留原设计与来源。后续按P2编号排列的章节记录各轮当时的修改范围，“未迁移”“仅设计”等表述只对应相应历史轮次，不作为当前状态。

| 需求 | 第一阶段实际设计 | 新问题与为什么改 | 第二阶段设计 | 受影响模块与接口 | 旧数据兼容 | 原验证编号 |
| --- | --- | --- | --- | --- | --- | --- |
| P2-R01 | surveys.questions和发布definition内嵌Question，id仅问卷内身份 | 同内容复制无共同身份，无法可靠复用或聚合 | 题身份+正式版独立；实例继续扁平快照+旁路固定绑定 | shared/questions、question-codec、editing、dto；L、I接口 | 旧实例按surveyId+实例ID分配身份，不按文字跨卷合并 | T07、T11、T29 |
| P2-R02 | own只判断问卷owner，没有题共享 | 共享题不应授予问卷读权；撤销有存量与新增差异 | 独立grant，新增引用事务加锁，存量绑定保留 | 新core/questions、grants、binding；G、L07、I01 | 没有旧共享不造授权；旧题owner取问卷owner | T12—T15、T18 |
| P2-R03 | survey_versions已不可变，普通保存不建问卷版 | 可复用题另需不可变历史，不能覆盖被多问卷使用的内容 | 正式题版只插；问卷更新先暂停+替换+重发 | versions/publication/definitionOf；L04、I02、V01 | 不修改旧definition/policy/hash；来源关联用bindings | T08、T16、T29 |
| P2-R04 | 问卷版本只有来源编辑修订，没有题父子 | 版本号不证明来源，恢复不能删除历史 | parentVersionId、restoredFromVersionId、origin、legacyImport来源证据 | 新题仓储/服务；L03—L07 | 不能证明的旧父子=null并注明unproven，不推断 | T08—T10、T29 |
| P2-R05 | 发布号固定问卷定义，不能选独立题版 | 最新题版不应自动改变现问卷 | 绑定questionVersionId；新版提示需验权；替换保实例/配置并重校规则 | EditorPage、VersionsPage、新选题组件；I02—I03 | 实例ID、publicId不变，旧答卷按旧发布号 | T09、T16 |
| P2-R06 | 无跨问卷题使用查询 | 不能多快照算多问卷，不能泄露他人标题/正文 | 按题版找binding，聚合surveyId，currentPublishedVersion区分使用状态，派生分支单列 | 新usage服务、安全DTO；U01 | 旧映射覆盖率不足时明确incomplete不猜数据 | T17—T18 |
| P2-R07 | 无题库与独立题历史 | 一个题多库不能复制历史，无界成员不适合内嵌 | bank元数据和member分页，唯一(bankId,questionId) | 新题库服务/页面；B01—B06 | 旧题迁入默认不自动加库，用户自行整理 | T19 |
| P2-R08 | reporting按surveyId+surveyDefinitionVersion，数字均值和原文分页 | 同题跨卷无法聚合；只有均值不能覆盖年龄分布 | 先owner筛选快照固定题版，再唯一response+instance关联；频数和区间 | 新cross-reporting、保留reporting；X01—X03 | 旧快照侧映射，缺失/不符阻断统计，不按草稿套旧答卷 | T20—T23、T29 |
| P2-X01 扩展 | copy路由存在但501，公开填写≠模板 | 定向共享不含公开分发；复制不能串实例/规则 | 不可变模板内容，具体题版作者分发grant，选用新草稿重建实例/规则/目标映射 | 新templates/public-grants/页面；M、P2-A | 不启用原V04假装模板完成，不复制答卷/用户/统计 | T24—T28 |

## P2-008阶段增量记录（2026-10-23）

| 第一阶段原样 | 本轮修改及原因 | 兼容及真实验证 |
| --- | --- | --- |
| 四集合/默认入口 | 增加明确app_v2十三集合入口，复用原app/core，不按集合数量猜模式 | app_v1前后选项、索引、计数、BSON摘要一致；原七模块、账号/隔离/启动负例通过 |
| 本地扁平Question | Content/Config分离；题身份、草稿、不可变正式版；保留原Question DTO | baseline发布不变；phase2未正式化发布422，须I04或选版，不隐式生版 |
| 无题库/共享 | LibraryService、题库分页墓碑、grant及实际accessFence | 真实API/UI；任意父版、恢复留草稿、多库和删库竞态通过 |
| 不可变发布/答卷 | phase2快照格式2+bindingHash，旧格式1旁路映射 | 原hash算法、旧BSON、计数/旧key及分版统计不改；撤销后存量发布填写通过 |
| 无Usage | 先筛题版，再按卷/版去重及三态、白名单 | W04 API/浏览器、分页/容量1001版负例通过；不等于W05跨卷答案统计 |
| 无升级工具 | 受控合成源BSON备份/恢复、固定计划、逐卷事务、journal与重跑 | 两卷六快照六答卷实际恢复；坏格式和sourceHash漂移阻断；未连接P1 |

具体文件、API/页面、原始失败/修复及检查结果见[覆盖表](w02-w04-coverage.md)。未改变旧Prompt/历史证据，没有依赖升级、真实P1迁移或Git提交。

## 配套工程变更（最初设计时点）

| 当前源码事实 | 后续必要调整与理由 | 本轮状态 |
| --- | --- | --- |
| initialize.verifySchema拒绝未知集合/索引、固定existing.length===4；不collMod | 使用受审阅的13集合注册表+按格式oneOf验证器，独立迁移命令，ready校验映射覆盖及代际标记 | 仅设计 |
| config仅project1_app_v2/test_*与rs0，init-replica硬编码27018；start脚本绑定marker/dbpath | P2专用27019/rs0/project2库、专用标记/路径；不得放开成任意库 | 仅设计 |
| app.onRequest全局query白名单及手写405正则 | 同步所有新GET的分页、过滤、统计参数与DELETE/POST方法，保持未知query拒绝及CSRF | 仅设计 |
| questionSchema additionalProperties=false，DTO直接fromBson题目，toBson假设扁平Question | 外部题库Content与内部实例转换；原扁平Question维持，来源独立DTO/绑定，不直接塞未声明字段 | 仅设计 |
| definitionOf固定旧hash/格式1；response replay只支持hashVersion2 | 明确双快照格式但旧hash路径不变，新绑定摘要单独核查；不声称未知legacy支持 | 仅设计 |
| core/common游标可传scope；旧survey列表security游标仅owner | 新列表独立完整scope，旧列表不用它签新端点；模板/共享撤销后每页重新验权 | 仅设计 |
| role模板仅四集合且快照只find/insert，启用认证尚未验收 | 为新集合分动作，question_versions/发布绑定只插读；draft绑定更新删除需领域守卫，不能仅靠collection role区分同集合scope | 仅设计 |

后续文件级职责和完成门禁见[系统设计](../system-design.md)，升级步骤见[迁移计划](data-migration-plan.md)。本轮不修改表内源码、锁文件、配置或测试。

## P2-003 用户审阅后的设计修正

两项均是尚未实现设计的真实缺陷，不能用“已经有幂等/事务”解释为无需调整。

| 问题 | 原P2-002设计及反例 | 修正 | 同步影响与验证 |
| --- | --- | --- | --- |
| 成功回执不完整 | result只有resourceId/versionId/revision，I01却返回自动instanceId、编辑修订及validationIssues；成功响应丢失且实例随后改删，当前卷无法还原原结果 | 按operation保存resourceReceipt/instanceSave/templateAdoption完整有限DTO，resultVersion及首次状态同事务保存；重放只读回执、不得重算或重新执行，超限整体回滚 | 数据库字段/验证器、API全部10类幂等操作、集合样例、关键逻辑、T35；不改原P1发布/提交回执 |
| 模板选用污染管理修订 | 每选用改模板revision，另一个expectedTemplateRevision相同用户因此无故409 | 增加accessFence，选用只增门闩；上下架实际变化才增管理revision并共同写门闩，保留真实状态竞争保护 | TemplateV1/字段/摘要排除项、M04—M06、迁移预检、样例、T36；物理写冲突重试后复查真实修订/授权，不能当编辑过期 |

P2-003当时仅修正文档与静态设计数据，不增加集合/路由，不修改已确认业务规则或S04—S06暂定状态。原P2-002静态证据是修正前的历史结果，当前修正与保护核对另见[P2-003证据](evidence/P2-003-static-check.json)。

## P2-004 第3、4项审阅修正

执行原文：[P2-004 Prompt](prompts/P2-004-distribution-lineage-and-usage.md)。第1、2项的完整有限历史回执及模板accessFence/管理revision分离继续有效，未重写P2-003证据或AI日志。

| 问题与原设计 | 原因与本次修订 | 兼容与验证追踪 |
| --- | --- | --- |
| 3：共享后派生成自有题，套用“自有题可公开”；单个授权字段不能表达上游 | 用户确认派生保留来源限制；AI推荐正式版distributionSource不可变，save/restore继承；distributionProof保存全链节点义务与摘要，各层具体版本都须向实际publisher授权且每次查当前状态；全体叶/上游题纳入有序门闩 | 自用、独立版本/统计及窄实例派生保留；不改原题内容hash/旧快照/答卷；S05/S06现已确认。L08/A01—A03/M01—M06、T37—T45 |
| 4：Usage只有问卷层状态，无法判断草稿v2/当前历史v1 | versions各项增加isDraft/isCurrent/hasHistorical，先版本过滤，按卷+题版及卷两次聚合；历史是非当前发布快照；问卷状态按过滤后的版本OR计算 | 不新增集合；他人字段仍仅用户名/独立编号/题版/状态；派生另列；保留每卷一行。U01、T46—T50 |

P2-004当时新增字段仍处于未实现设计，question_versions/survey_templates的schemaVersion=1表示未来初次落地目标，不宣称对已运行P2库无迁移成本。若未来发现按旧设计试写的P2数据，须先预检/停写并显式转换，不能靠默认null绕过来源核验。旧P1格式及冻结基线不变。字段/索引/白名单主维护在数据库文档，HTTP主维护在API及机器契约；静态全链及Usage样例在design-fixtures，完整EJSON在collection-examples。真实静态结果见[P2-004-static-check.json](evidence/P2-004-static-check.json)，不代表业务测试通过。

## P2-005 / P2-W01环境与兼容基线实施

按[原始Prompt](prompts/P2-005-runtime-baseline.md)完成有限环境实现，详见[运行基线](runtime-baseline.md)和[真实输出](../testing/phase2-runs/P2-005-20261022T123358Z/README.md)。原P1→P2设计链及P2-003/P2-004修正完整保留；本轮未提前落地13集合或新增业务。

- 配置：P1库名/27018→独立project2_app_v1或project2_test_*/27019/rs0；新随机密钥，API3200/前端5200同源代理，严格连接前拒绝与直接buildApp保护。
- 实例：独立目录/JSON标记/端口及实际进程参数核验，隐藏启动；rs0已有配置不reconfig；明确四集合阶段，不改schema.ts或initialize.ts。新增受控stop脚本，已实际停止、重启并核持久化。
- 测试：只修改环境构造和证据路径，原业务断言不变；原两大回归入口实际通过。配置14、目录6、HTTP10项及原Schema/索引、工作区链接、前端密钥检查通过。锁依赖声明/锁文件/引擎范围未改。
- 保留失败：受限npm错误、启动参数字段误判及两次shutdown/PowerShell断连适配错误均保存原退出码；修复后仅重跑受影响步骤。构建0但保留运行配置脚本、分块及耗时诊断。
- 兼容界限：旧业务算法、四集合/数据形状不变；12个测试库全为新合成数据，应用库为空；未连接/修改原P1库，不代表已审计/迁移/恢复旧数据。50组P2目标仍未整项验收，S04—S06暂定。

保护核对见[P2-005-static-check.json](evidence/P2-005-static-check.json)，既有Prompt、冻结字节和AI旧前缀保留，未提交或推送。下一轮仅建议W02领域适配、Schema/注册表、来源/回执及inspect/dry-run，未在本轮开始。

## P2-005复审 三项运行边界修正

三项审查均成立。API此前仅验证URI，再直接连接；归属只在脚本/测试辅助层，npm start可绕过。现buildApp自身先验证本地标记/规范目录/OS监听进程，连接后复核服务PID、实际选项和rs0，再访问应用Schema；验证失败关闭连接。新增instance-ownership模块并复用原PowerShell归属定义，无关闭保护的测试开关。

启动冒烟此前将目标地址200视为就绪，不能证明是新子进程。现先拒绝占用端口，启动后核所有目标监听PID与本轮存活子进程一致，HTTP前后再核；错误时只清理自己创建的句柄。新增真实已有200服务及PID不符反例，不停止既有服务。

verifyruntime此前硬断言各集合count=0，正常使用后误报。现日常检查报告真实count/totalDocuments，空库限制独立为verifyinitial/--expect-empty；明确初轮空库只是历史验收事实。合成专用库通过原注册/建卷接口写2条后，日常核验0，显式空库验收预期1，前后数据摘要不变；未向实际应用库写样例。

新验证包括6项针对性用例、带PID证据的正常冒烟及原账号/发布/提交回归，类型和构建退出0。首次两个测试钩子加载错误保留，修复后只重跑相关用例；原业务断言/Schema/依赖和P2-003/004设计不改。具体文件、退出码与失败说明见[运行说明](runtime-baseline.md#w01-runtime-review)及[复审结果](evidence/P2-005-review-summary.json)。未重跑完整浏览器/图表，不把历史PASS冒充本次；没有安装依赖、迁移旧数据、提交/推送。


## P2-006 / W02-A 实施状态（历史时点，2026-10-23）

[领域与Schema基础](schema-foundation.md)已完成：Content/Config严格适配、BSON边界、13集合完整模型/验证器/28业务索引及baseline/phase2双注册表。默认应用及db:init/ready仍四集合，phase2只允许新合成测试库；初始化预检所有对象、不collMod、不迁移。真实接受69条/拒绝71条（每次核计数不变），13个唯一业务索引分别拒重复，所有索引键序/unique/partial实查。旧格式/互斥来源/完整回执/证明均保留P2-003/004。

类型/构建、领域4项、Schema、原test:phase1七模块（含浏览器）、账号四集合13子项及日常核验均最终退出0；应用库前后选项/索引/数据摘要不变。初始类型错误、Decimal大小写差异及实例未运行的失败原件保留，修复与重跑详见[真实汇总](evidence/P2-006-summary.json)。本轮不实现业务仓储/授权/不可变性/跨集合事务或迁移工具，不将T01—T50整体标PASS；W02其余部分未完成，S04—S06仍暂定。

| 前 | 本轮后 | 理由与兼容 |
| --- | --- | --- |
| 只有扁平Question和未知存储数组 | 保留原接口，新增精确Content/Config及BSON模型 | 实例配置不进入正式内容，复用原校验/hash |
| 固定四集合无可执行P2注册表 | 精确baseline与显式测试phase2注册表 | 当前应用不升级，拒绝把初始化变迁移 |
| 来源/完整回执/模板门闩仅伪代码 | 可执行结构及纯大小守卫 | 保留分发限制和完整历史DTO，但业务运行时保证待仓储 |


W02-A导入循环复审（2026-10-23）：用户问题复现并修复，底层改依赖无循环叶模块；新增源码/编译四入口共8个冷进程检查并纳入domain，修复后8项与原领域4项通过，类型/构建/flow均退出0。见[说明与真实证据](schema-foundation.md#shared-import-review)。未访问数据库或重跑完整浏览器；历史结果不覆盖。


## P2-007 / W02-B 实际增量（历史时点）

**W02-B / P2-007已完成（2026-10-23）：** [来源绑定、完整回执与事务基础](bindings-receipts-foundation.md)及[真实汇总](evidence/P2-007-summary.json)。新owner内部组合、同session/CAS、完整回执重放和故障回滚已验证；当前应用仍四集合。共享/模板新授权、迁移及新增HTTP/页面未实现，W02整体尚未完成。

| W02-A之前/之后 | 本轮变化 | 验证与兼容 |
| --- | --- | --- |
| 原快照/提交幂等不承担P2来源；W02-A仅载体 | 新十操作完整DTO仓储+固定scope/hash+有界事务执行器 | 原发布/提交源码及摘要不变，新回执重放不读当前资源 |
| 来源字段/索引只有结构保证 | 绑定全范围完整性、owner内部attach/replace/config/remove及只插publication | 12个事务子项；缺失/额外/错版/hash/owner均拒，历史保留 |
| 任何Db工厂可能绕过新环境边界 | 独立openPhase2Context、私有仓储及本上下文活动session门禁 | 连接前拒应用库，归属前后核验；应用指纹一致 |

首次类型错误和实例未运行的拒绝原件保留，代码修复与补充检查详见实施说明；未迁移或提交。S04—S06状态不改。

## P2-009 W05实际增量

原按单卷/发布号统计与W04 Usage保留；新增本人固定题版跨卷聚合、真实atClusterTime分页和页面。修复正式保存未同步本地base以及未知请求串动作；原有界事务重试增加50/150ms退避、次数仍3。未新增Schema/索引或改两个应用库数据。真实手算/权限/损坏历史/并发/浏览器与原功能回归见[W05说明](cross-survey-statistics.md)。不改P2-008历史报告。

## P2-010 W06实际增量

第一阶段私有问卷/公开填写→W04独立题版及私人共享→W05本人同版跨卷统计→W06精确公开授权、全链证明、不可变模板、实时广场、独立新卷及窄权派生。共同模板/全部祖先题门闩与管理修订分离；两个剩余完整历史回执实际同事务落地。复用十三集合与现有索引，无应用库DDL/演示写入。页面/接口/并发/容量边界/历史保护见[W06说明](template-square.md)和[需求覆盖](template-square-coverage.md)。W07及角色强制部署未做。
