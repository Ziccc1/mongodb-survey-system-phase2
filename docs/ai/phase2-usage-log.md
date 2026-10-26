# 第二阶段 AI 使用日志

第一阶段日志保留在 [原日志入口](README.md)，不改写既有过程或测试事实。本文件从第二阶段需求讨论和工程迁移开始追加。

## P2-001 需求阅读与第一阶段工程迁移

日期：2026-10-22（Asia/Shanghai）。

**工具：** Codex 桌面应用；辅助工具为 PowerShell、Git、Python 标准库。未额外核实界面所示模型名称，不推测具体模型版本。

**用户提示词与决策：** 用户先要求仔细阅读两阶段要求与现有实现，讨论第二阶段应该实现什么，并明确先不修改任何文件。只读核对完成后，用户说“我们先把需要迁移的内容都迁移了”，随后提出“https://github.com/Ziccc1/mongodb-survey-system，是不是可以直接把这一部分的内容拉取到D:\大三\数据库\pj1_2”。最终按用户后续指定的 GitHub 来源与目标目录执行。此处为任务消息记录及原文短摘，不冒充完整会话导出。

**AI 输出及代码：** 分析新增题目复用、共享、版本、题库和跨问卷统计需求；从 GitHub 获取第一阶段基线并检出到 `pj1_2`，补齐本地未上传的报告、配图和历史证据。没有生成或修改业务代码。新增 [迁移记录](../phase2/migration.md)、[逐文件清单](../../phase2-migration-manifest.json) 和本条日志。

**是否修改及执行者：** 文件迁移、完整性核对与迁移记录由 AI 执行。用户选择先迁移，并指定从 GitHub 获取代码和使用 `pj1_2`。第一阶段源码、历史文档与旧目录未改动。此前建议的 `pj1_2/survey-system` 未创建，用户后续指定直接使用 `pj1_2`。共享规则、统计权限等设计建议仍待讨论，不能记录为用户已确认。

**实际验证：** GitHub `main` 和本地第一阶段 HEAD 均为 `c48cb67c723d1d966fccfd5b1ba117d3c70b3d3c`。文件清单核对405个文件，其中71个本地补充材料；97个仓库文件只有换行形式差异，内容归一化后相同，无内容冲突。原需求变更文档的 SHA-256 保持不变。迁移后已跟踪文件相对 HEAD 无差异。没有运行依赖安装、构建、业务测试或数据库迁移。

**遇到的问题与处理：** 沙箱内首次 GitHub 连接失败；经工具权限审批后连接成功。目标目录已经有需求变更文档，因此采用在该目录初始化 Git、获取远端并检出跟踪分支的方式，保留已有文件。既有运行日志与进程文件按历史材料归档，不作为新目录的当前进程状态。

**尚未完成：** 目标目录运行环境初始化、数据库隔离与旧数据迁移验证、第二阶段设计确认及实现。未提交或推送这次新增材料。人工贡献说明由用户最终复核。

## P2-PREP-001 业务规则讨论与首轮设计 Prompt

日期：2026-10-22（Asia/Shanghai）。

**工具：** Codex 桌面应用；PowerShell用于只读核对路径和源码，未额外核实界面模型名称。

**Prompt：** 用户要求在本窗口讨论第二阶段流程和业务规则，由本窗口生成Prompt，交给另一个窗口执行。最近一次实际请求为：“好的，按照这个流程现在给我第一个部分的prompt，以及我需要提供给另一个窗口的信息，比如xx文件，其需要先阅读xx文件中的内容这种”。此前多轮确认了正式题目版本、恢复生成新版、固定引用与主动替换、问卷内必答与跳转、指定共享和派生、撤销共享后的存量保留、使用查询字段、多题库、公开模板与分发授权、模板内固定版本使用权及本人问卷统计范围。这里是过程摘要，不是完整多轮聊天原文。

**Result：** 生成 [P2-002增量设计执行Prompt](../phase2/prompts/P2-002-incremental-design.md)，包含必读文件、完整已确认规则、Schema/索引/API/旧数据兼容设计要求、第一阶段基线归档、阶段变更对照、文档交付、静态核对与本轮操作边界。该文件是转交执行窗口的任务文本，不是已经完成的设计。

**是否修改及执行者：** AI新增Prompt文件并追加本记录；用户作出业务选择并指定两个窗口的工作方式。没有修改业务源码、可执行Schema、配置、旧日志条目或数据库，没有创建基线归档，也没有执行Prompt中的设计任务。

**实际验证与未执行项：** 只读核对Prompt涉及的主要现有路径均存在，代码HEAD仍为`c48cb67c723d1d966fccfd5b1ba117d3c70b3d3c`；Prompt文件和本条记录另做文件及链接静态检查。没有运行依赖安装、构建、业务测试或数据库操作。P2-002设计交付留待执行窗口完成，不能标记为已设计或已实现。

## P2-002 需求确认与增量设计实际交付

日期：2026-10-22（Asia/Shanghai）。

**工具及模型：** Codex桌面应用；PowerShell、Git只读历史查询、.NET ZIP/XML与捆绑Python标准库提取/文档生成/静态核对；浏览器检索工具查阅MongoDB官方验证器、唯一索引与事务说明。具体界面模型名称未核实，不猜测。参考documents技能仅用于只读Word正文与表格提取，没有创建Word/PDF。

**实际Prompt：** 用户要求执行第二阶段第一部分，工作目录pj1_2，并完整遵循[P2-002原任务文件](../phase2/prompts/P2-002-incremental-design.md)。该文件原文保持，未用事后总结替代执行输入。当前用户明确只交设计、基线和对照，不改业务代码/数据库、不安装或启动。

**输出及修改者：** AI从指定Git提交冻结14份原文（源码为.txt，字节/hash保留），新增第二阶段阅读入口、业务决策、前后对照、数据库升级、实施测试方案、静态契约/样例和核对证据；增量更新现行数据库/API/总体/关键逻辑及README导航，requirements/decisions只加第二阶段入口。没有生成业务代码或可执行Schema/测试/迁移脚本。文档与静态数据由AI撰写和修正，未记录用户直接改源码或代签人工贡献；未提交/推送。

**业务与建议界限：** 用户转交Prompt第三节A—H是本轮已确认业务依据，不再重复询问。AI推荐集合拆分、字段、索引、事务门闩、旁路映射、HTTP路径和独立P2环境；S04同题同版重复实例限制、S05公开授权粒度、S06撤销对模板未来选用影响仍标暂定，需相应实现前确认。P2-PREP-001与P2-001原记录保留，不把其中当时“待确认”倒写成已确认。

**实际核对与证据：** 先确认HEAD/main跟踪origin/main且已跟踪文件无差异，保留所有已有未跟踪迁移/图表/教师变更文件。两份教师Word提取包括295/76正文段落、1/0表格；本地完整报告提取167段落/7表格，仅参考结构。现有四集合Schema/索引、初始化固定4检查、库名白名单/27018/rs0、query白名单/严格请求、DTO、游标、版本/提交/统计与相关测试源码已交叉核对。最终真实静态核对结果以[evidence入口](../phase2/evidence/README.md)和P2-002-static-check.json为准。

**发现及修正：** 旧设计混有未建工程/三集合历史状态，现行稿按真实源码区分；补充本地题显式正式化端点，避免发布隐式建题版；题型替换的旧规则可能不符合严格Schema，明确RULE_REVIEW_REQUIRED与用户显式修正；使用查询编号改为独立usageNumber，避免展示publicId可反推他人填写内容；创建题/题库幂等改用固定回执，避免重放读取变化后的当前DTO。一次apply_patch因同补丁对同文件delete/add被工具拒绝，随后分开操作完成；无业务文件受影响。教师变更文件第一次普通ZIP读取遇文件共享锁，改为只读共享方式/只读提取，原件未改。

**未执行与事实边界：** 未安装依赖、生成.env、构建、业务测试、启动前后端/MongoDB、连接数据库、备份恢复、Schema升级或数据迁移。34组计划均未执行；静态手算/JSON/链接核对不是业务测试通过。原第一阶段日志/测试/完整报告、工程迁移事实保留；实际保护hash结果见最终静态证据。人工最终复核、功能实现与迁移验收仍待后续。

**最终设计复核补充：** 跨HTTP分页采用固定atClusterTime的事务外snapshot读与快照过期错误，避免仅用提交时间截止造成早接受晚提交的漏页；只读核对MongoDB官方snapshot说明，未实际运行。原需求文档修复一处历史失效锚点，第一阶段冻结字节仍保持。

**最终静态结果：** 14份冻结文本与Git原始字节/SHA-256一致；196个本地文档链接及对应锚点无失效；36新增接口、13集合样例、34未执行用例与8必做+1扩展追踪齐备；5类样例hash和均值15/分布手算一致；363个原有文件摘要保持。PASS仅指文档静态检查。修改的Git跟踪文档换行恢复为基线LF，旧AI日志4770字节前缀保持精确原样。

## P2-003 用户审阅后的回执与模板并发设计修正

日期：2026-10-22（Asia/Shanghai）。

**工具与模型：** Codex桌面应用，PowerShell/Git只读检查、捆绑Python标准库生成/核对设计JSON和文档；只读查阅MongoDB官方事务写冲突/读锁说明。界面具体模型名称未核实，不猜测。

**用户实际请求摘要与原文短摘：** 用户指出“回执目前只保存 resourceId、versionId、revision”，但添加题目还返回自动instanceId、编辑修订和校验问题，要求按操作保存完整有限成功回执；又指出多人选用同模板会因每次递增revision无故冲突，建议独立并发门闩。用户要求先核实是否真实存在，需要则实际修正；此为摘要与短摘，不冒充完整聊天导出。

**核对结论及采纳：** 两项均成立：数据库回执字典/验证器与InstanceSaveResult不相容，当前资源不能还原丢失的历史结果；关键逻辑/模板门禁把普通选用写入revision与expectedTemplateRevision联用，导致有效旧请求无故过期。采纳用户两项建议。具体result.kind/data白名单、resultVersion/firstHttpStatus、有限大小及错误码、accessFence字段/锁顺序/有界重试是AI技术细化；原S04—S06业务暂定状态不变。

**实际产出及修改者：** AI同步数据库字段/验证器草案、API与36接口静态契约、关键逻辑、系统职责、集合样例、迁移兼容注意、需求决策/变更对照与阅读入口。回执分resourceReceipt/instanceSave/templateAdoption，保存完整历史data，重放不查当前资源；模板选用只增accessFence，实际上下架才改变管理revision，保留真实撤权/状态竞态保护。新增T35/T36计划，现36组均未执行；另保存合成契约样例和本轮静态证据，不覆盖P2-002历史验证结果或旧日志。

**验证和边界：** 以[P2-003静态证据](../phase2/evidence/P2-003-static-check.json)为准：检查三种结果分支和10类幂等操作契约、删除/修改后从持久回执重放的合成样例、模板管理修订/门闩区分、文档/JSON/链接及既有文件保护。合成状态序列核对不是真实MongoDB并发或HTTP测试。原第一阶段归档/原Prompt/旧AI条目前缀保持。没有修改业务源码、可执行Schema/测试/迁移脚本、配置或数据库，没有安装依赖、构建、启动服务、业务测试、提交或推送。

**仍需实施验证：** 真实事务写冲突/驱动重试、回执同事务原子性和有界大小行为留到实现后。独立门闩消除的是无意义的管理修订冲突，不宣称消除了同模板写竞争；当前资源删除后原成功key仍应返回原有限结果且不恢复使用权。


## P2-PREP-002 派生分发与引用状态修订 Prompt

日期：2026-10-22（Asia/Shanghai）。

**用户请求及新确认：** 用户同意“派生获得独立编辑和版本管理权，不自动获得公开分发权，保留来源公开分发限制”，并要求“同意，给我一个prompt用来修改你上面提到的3和4”。第3项为派生题公开授权绕行，第4项为使用情况中的版本和状态缺少对应关系。

**工具及产出：** Codex桌面应用，PowerShell/捆绑Python只读核对现行文档和路径；AI生成[P2-004修订执行Prompt](../phase2/prompts/P2-004-distribution-lineage-and-usage.md)。现有P2-003已记录前两项修正，Prompt明确保留完整历史回执及模板accessFence与revision分离。Prompt包含来源限制、多级派生/授权、模板资格检查、逐版本Usage状态、相关设计契约和未执行用例的同步要求。

**修改与验证边界：** 本轮只新增Prompt并追加本条记录，尚未执行P2-004设计修订，没有修改现行设计正文、业务代码或数据库。核对Prompt文件、必读路径、范围及此前修正保留要求；没有安装、构建、启动、业务测试或数据库操作。多级授权字段/检查方案和Usage字段命名是Prompt中的技术推荐，具体设计由执行窗口完成，不能记录为已实现或用户逐字段指定。


## P2-004 第3、4项设计审阅修订（2026-10-22，Asia/Shanghai）

- 用户转交原文：[P2-004-distribution-lineage-and-usage.md](../phase2/prompts/P2-004-distribution-lineage-and-usage.md)，保留原件；此前P2-PREP-002、P2-003及更早日志均未改写。用户本轮明确确认的是“派生获得编辑/版本/自用权但保留来源公开限制”，并要求Usage状态关联正式题版本。
- AI实际工作：完整阅读指定主契约、样例及既有证据，确认自有派生免权和问卷层状态两处缺口；修订需求/数据库Schema草案/API与机器契约/关键逻辑/总体设计、完整集合JSON及合成fixture、迁移与变更对照、计划及导航。新建P2-004执行前摘要、方法、覆盖和静态结果。
- 技术方案由AI提出：正式版不可变distributionSource；沿精确源版逐层检查实际publisher的当前授权；固定有限distributionProof和lineageHash；叶题及所有上游题有序门闩；未知/损坏链fail-closed及审计修复；Usage先版本过滤再版/卷两层聚合和最小披露。32节点/500节点、1000版本/响应2MiB、错误码/索引/字段细节均为技术推荐，非用户逐字段指定。S04—S06保留业务暂定，不冒充新增确认。
- P2-003保留：按10种操作保存完整有限历史成功DTO、重放不查当前资源；模板accessFence与管理revision分离、普通选用不增管理revision；T35/T36原文及旧证据保留。新增T37—T50，全50组业务/迁移计划均未执行。
- 实际验证：使用捆绑Python标准库处理静态JSON/文本/摘要，Git仅只读检查；具体结果以[P2-004-static-check.json](../phase2/evidence/P2-004-static-check.json)为准。合成来源授权和Usage计算只是设计数据核对，不是HTTP/数据库测试。旧日志原字节前缀、源码/配置/测试/锁文件、原Prompt和14份冻结文件均列入保护核对。
- 未执行：业务代码与可执行Schema改动、数据库访问/迁移、依赖安装、.env生成、服务启动、构建、业务/并发测试、Word/PDF生成、Git提交/推送。人工贡献和教师认可不由AI补写。


## P2-PREP-003 独立运行与兼容基线执行 Prompt

日期：2026-10-22（Asia/Shanghai）。

**用户请求与范围：** 审阅P2-004后，本窗口建议进入P2-W01独立运行环境及第一阶段兼容基线，用户回复“可以，给我prompt”。本轮是生成转交指令，不是实施P2-W01。

**产出及执行者：** AI生成[P2-005运行基线Prompt](../phase2/prompts/P2-005-runtime-baseline.md)，明确独立27019/rs0/project2库、锁依赖安装、配置及测试环境最小调整、原四集合初始化和原功能真实回归；13集合/新增业务和旧业务数据迁移留到后续。用户授权下一执行窗口按该范围工作，不代表本轮已经安装或运行。

**核对及未执行项：** 只读检查实际配置/启动/副本集脚本、harness/运行器、package脚本和现有阶段材料，核对Prompt范围与关键路径。新增Prompt并追加本条，原日志前缀保留；未修改业务源码/配置或数据库，未安装依赖、生成.env、启动、构建、测试、迁移、提交或推送。S04—S06依旧暂定。


## P2-005 / P2-W01独立环境与第一阶段兼容基线（2026-10-22）

**实际输入：** 用户转交[P2-005原始Prompt](../phase2/prompts/P2-005-runtime-baseline.md)，要求实际安装/配置独立环境、原四集合初始化、运行/原功能回归和真实交付。旧Prompt只读保留，不以此摘要替代原文。

**工具及执行者：** AI使用Codex桌面工具、PowerShell、Git只读命令、Node22.17/npm10.9.2、MongoDB8.3.11/mongosh2.11.1、原Playwright+Edge155.0.4283.62以及捆绑Python标准库。未核实具体界面模型名，不猜测；源码/脚本/文档修改均由AI实施，未编造组员贡献或教师认可。

**实际修改：** 配置及模板限定本机27019/rs0/project2_app_v1和合成project2_test_*；生成新随机密钥，已有.env校验且不覆盖。新增实例归属检查、隐藏启动及受控停止，更新副本集/初始化输出；API只加连接前目标保护，Vite端口跟随公开同源地址。原测试仅调整连接/库名/来源和证据路径，新增少量隔离/启动核对；原Schema/initialize/领域算法/依赖声明和锁文件未改。运行说明、README/部署、阶段状态、对照与证据导航同步，保留P2-003/004主契约。

**真实结果：** 独立P2 rs0可写primary；四集合初始化及一致性重跑0；typecheck/build均0；配置14/14、目录6项、HTTP10项通过；原test:phase1七模块及test:regression四子脚本实跑通过，包含真实事务/并发/浏览器闭环；12个合成测试库保留，应用库0条，三工作区链接均属pj1_2。测试应用/浏览器已释放，仅保留专用MongoDB，停止/重启已验证。命令时间、退出码及截图索引见[运行基线](../phase2/runtime-baseline.md)和[真实汇总](../phase2/evidence/P2-005-runtime-summary.json)。

**错误及修复：** 初次npm ci在受限环境Exit handler never called，保留失败后工具审批重试成功；启动getCmdLineOpts实际replSet字段与初稿replSetName不符，经只读核对修复；mongosh正常shutdown触发ECONNRESET/exit1，首次误判及随后PowerShell重定向stderr提前中止共两次非0记录保留，最终以隐藏.NET子进程收集输出并核原PID退出/端口关闭后才接受断连。共4次非0尝试均不覆盖；构建仍有经典运行配置脚本、>500kB图表分块及plugin timing诊断。只重跑受影响环境步骤，没有改业务断言或删除数据凑通过。补丁工具一次因同文件delete/add拒绝，未写入，拆为更新后完成。

**边界与后续：** 未连接或写原P1实例/目录，不读取其.env；未审计/导入/恢复真实旧数据；未落地13集合、新授权/来源/模板/Usage/跨卷统计，未将50组P2目标整批PASS；S04/S05/S06仍暂定。未跑独立图表/全布局专项、未验第二设备/公网、未提交或推送。下一轮建议W02领域Content/Config、可执行Schema/注册表、来源/回执和inspect/dry-run，本轮未开始。旧日志所有原字节作为前缀保留；保护核对见[P2-005-static-check.json](../phase2/evidence/P2-005-static-check.json)。


## P2-005复审：API归属、冒烟PID与日常运行核验（2026-10-22）

**用户实际意见摘要：** 用户指出API直接启动未核实数据库归属、冒烟可能误测已有服务、verifyruntime要求应用库永远为空，要求核查后修复；用户中途明确“继续完成”。这是本轮聊天摘要，不冒充独立原始Prompt；P2-005原任务文件和此前日志只读保留。

**核对与实际修改者：** 三项均成立，AI完成修正。buildApp连接前复用PowerShell归属检查，连接后在应用Schema访问前核服务器PID/实际目录端口/rs0主节点/member，失败关闭客户端；源码/编译版按模块位置定位资源。startup先拒占用端口，核本轮子进程存活与OS监听PID，HTTP前后留证，不探测/接管已有服务。verifyruntime报告实际数量，verifyinitial/--expect-empty单独承担首次空库前提，移除永久空库断言及不能从核验推断的旧数据导入结论。同步运行说明、导航/部署/变更对照和真实证据。

**工具与真实验证：** PowerShell、Node/npm原锁环境、现有MongoDB、TypeScript/Vite、捆绑Python标准库和Git只读核对；未猜测界面模型名或编造人工贡献。typecheck/build退出0，构建保留原警告。针对性6项首轮4通过、两个编译API负例因Windows --import绝对路径未转file URL而加载失败；保留原输出，改测试钩子路径后仅重跑这2项均通过。负例使用.local中新建编译API副本及合成标记，不移动实际标记、不停止/重配MongoDB；钩子证明拒绝前未调用MongoClient.connect。已有HTTP200服务预先占用/API和Vite两目标均被拒、零探测请求/零子进程且原服务保留；真实OS PID不符被拒。正常编译API/Vite10项HTTP及监听PID前后匹配通过并释放。原账号集成13子项、发布及提交回归均退出0。

**有数据场景：** 只在新project2_test_runtime_review_*合成库通过原API正常注册并建卷，users1/surveys1；日常核验0、显式空库验收预期1，两次核验前后数据摘要相同；实际project2_app_v1未写入样例，日常报告真实0条。原P2 MongoDB仍为同一进程，未重启；本次测试应用/合成监听已释放。

**中断和审批事实：** 中断前typecheck/build已保存，恢复时只读确认没有遗留测试进程后继续。一次自动权限审批未在期限内完成、命令未启动，工具说明不是安全性判定；按允许重试一次后成功，不新增用户确认或绕过保护。

**保护与边界：** 旧AI日志原始字节前缀保持；原业务断言、四集合Schema/初始化、包声明/锁文件、冻结归档、旧证据/Prompt及P2-003/004修订保持。未安装或升级依赖、未接入P1、未迁移旧数据、未实现13集合/新业务、未重复全套浏览器/图表、未提交/推送。结果见[复审汇总](../phase2/evidence/P2-005-review-summary.json)和[保护核对](../phase2/evidence/P2-005-review-static-check.json)；S04—S06仍暂定，P2目标50例不据此整批通过。


## P2-PREP-004 W02-A领域类型与Schema执行 Prompt

日期：2026-10-23（Asia/Shanghai）。

**用户请求及范围：** 本窗口核对W01三项复审修正后建议进入W02-A，用户要求“给我下一个部分的prompt”。本轮仅生成后续执行指令，不实施Schema或业务代码。

**产出与执行者：** AI生成[P2-006领域与Schema基础Prompt](../phase2/prompts/P2-006-domain-schema-foundation.md)，要求落实Content/Config适配、BSON边界、13集合类型/验证器/索引及受控双注册表，在新project2_test_*库真实验证。原应用和默认初始化保持四集合，禁止直接升级当前应用库；来源/回执业务仓储和迁移inspect/dry-run留到后续。用户未因此确认S04—S06，仍为暂定。

**实际核对与未执行项：** 只读核对现有initialize/schema/models、共享包构建声明、初始化脚本、主契约和Prompt路径；新增Prompt及本条记录，原日志字节前缀保持。未改动业务源码、配置、可执行Schema或数据库，未安装/启动/构建/测试/迁移/提交或推送。领域类型、双注册表等具体落地是给执行窗口的技术要求，不写成已经完成。


## P2-006 / W02-A 领域与可执行Schema基础（2026-10-23）

**实际输入与范围：** 用户要求执行[原始Prompt](../phase2/prompts/P2-006-domain-schema-foundation.md)，中途多次要求继续；仅实施领域/数据结构基础。当前应用保持四集合，不实现新API/页面、迁移或来源/回执业务仓储。

**工具与执行者：** AI使用Codex工具、PowerShell、原锁定Node22/npm10、TypeScript/Vite、MongoDB8.3.11、现有Playwright/Edge、Python标准库与只读Git。未猜测具体模型名，未编造人工贡献或教师认可；源码与文档修改均由AI实施。

**实际产出：** shared新增Content/Config严格类型、提取/物化/规范化/校验适配，旧Question/Answer/路径/hash保留；API新增精确BSON模型/显式Decimal codec，旧fromBson保留ObjectId/Date。13集合strict/error验证器与28业务索引、冻结双注册表、仅合成测试库的安全入口；完整回执分支/大小守卫与模板节点守卫。默认initialize/verifySchema/应用/ready仍baseline。同步[实施说明](../phase2/schema-foundation.md)、主设计/变更/计划/导航；保留P2-003/004及S04—S06暂定。

**真实验证：** 最新Schema轮69条接受、71条拒绝且每次拒绝核数量不变；28业务索引与13个_id_核查，13业务唯一键各拒重复；旧/新格式、四Content及物化规则/答案、来源三分支、授权证明、十操作回执与模板证明有真实插入。独立baseline API/ready可用；旧Schema、未知集合、缺/错索引拒绝且原对象未变，精确完整子集可续建。错误目标在connect调用前拒绝。应用库前后四集合选项/索引/内容摘要相同，当前0条不作为永久约束。typecheck/build、领域4项、Schema、原test:phase1七模块含浏览器、原账号集成13子项和verifyruntime最终均退出0，完整证据见[汇总](../phase2/evidence/P2-006-summary.json)。

**真实失败与修复：** 首次类型检查options可能undefined，改显式可空访问；领域首轮Decimal128大写E输出与原规范不同，新codec解码复用decimalValue；首次Schema受实例归属保护拒绝，核实27019没监听后以W01受控脚本启动原专用实例。一次启动自动审批超时未执行，按工具允许重试一次成功。首轮Schema通过后补四型物化/答案/非null模板来源/外部grant证明覆盖，再只重跑Schema。所有失败原件保留，构建保留原警告；不弱化断言凑通过。

**边界：** Mongo Schema不保证跨集合外键/授权/来源链真实性/hash/不可变性/事务，纯大小守卫需后续仓储调用。不将50组P2目标整批PASS；下一步先来源绑定/完整回执仓储，再迁移inspect/dry-run。未安装或升级依赖，未改P1目录/冻结文件/原Prompt/历史证据、未迁移真实数据、未提交推送。旧日志字节前缀保留，人工复核待用户完成。

静态收尾补记：1264项最终核对通过，含14份冻结原文与Git字节、原日志前缀、既有文件保护、13集合/28索引/13唯一键和交付链接/密钥扫描。首轮词法检查把英文注释中的any误判为类型，原结果另存P2-006-static-check-initial.json；改为检查显式any类型语法后通过，未因此改业务代码。


## P2-006复审：源码/编译直接导入的循环依赖（2026-10-23）

**用户实际意见：** 用户指出questions→index→question-content→questions循环，直接导入源码和编译产物均报Cannot access questionSchema before initialization，要求拆循环并补独立进程检查。本条为本轮对话摘要，无另存原始Prompt，不冒充完整对话原件。

**核查与修改者：** AI先加入同一组8项冷进程测试复现：src/dist的questions/answers四项失败，question-content/index四项通过，证明旧barrel入口测试漏检。新增validation-common叶模块放原codePointLength/DefinitionIssue，questions/answers改为直接依赖叶模块，index保留原名导出。原Schema/校验/Decimal/canonical/路径逻辑不变。新增shared-imports.test.mjs逐个入口启动新Node，不预热shared；domain常规命令纳入该检查，避免只靠人工专项。同步实施说明、变更和测试导航。

**工具与真实结果：** Codex工具、PowerShell、原Node22/tsx/TypeScript/Vite及Python标准库、只读Git；模型名未知不猜测，修改均由AI完成，不补造人工贡献。保留修复前4失败/4通过，修复后冷导入8/8、合并domain12/12、原flow通过，typecheck/build退出0；构建原app-config与图表大块警告保留。完整日志见[复审结果](../phase2/evidence/P2-006-import-review-summary.json)。

**边界与保护：** 未修改数据库Schema、W01保护或新业务，未连接数据库/启动服务/安装依赖/提交推送；未重复Mongo及完整浏览器回归。保留原W02-A/历史证据，不把旧全套通过当成本轮重跑。旧AI日志原字节前缀保留；组员复核待用户完成。


## P2-PREP-005 W02-B 来源绑定与完整回执事务执行 Prompt

日期：2026-10-23（Asia/Shanghai）。

**用户请求及范围：** 用户告知 W02-A 循环依赖已经修复，要求开始下一阶段设计并提供具体提示词。本轮仅生成转交执行指令，不实施 W02-B 业务或数据库变更。

**实际核对：** AI只读检查 validation-common 依赖修复、冷导入测试、W02-A实施说明、字段/API/决策主契约、原事务及证据入口。实际独立运行 tests/shared-imports.test.mjs，源码/编译四首入口共8项全部通过，退出码0；未运行构建或数据库测试，不将历史完整回归当成本轮重跑。

**产出与执行者：** AI生成[P2-007来源绑定、回执与事务基础Prompt](../phase2/prompts/P2-007-bindings-receipts-transactions.md)。要求完整历史成功DTO存取与重放、同事务业务/回执、来源映射完整性与摘要、受控owner自用内部组合及并发/故障真实验证。共享/模板/迁移新增写分支不在本轮开放，S04—S06仍暂定；原应用四集合及W01保护保留。下一步才是迁移inspect/dry-run。

**边界及未执行项：** 本轮仅新增Prompt、追加本条日志，保留原日志字节前缀。未修改业务源码、配置、验证器或数据库，未连接数据库、安装依赖、启动服务、迁移、提交或推送；W02-B尚未实施。具体实现及测试结果由执行窗口另行据实记录。


## P2-007 / W02-B 来源绑定、完整回执与事务基础（2026-10-23）

**实际输入：** 用户要求完整执行[P2-007原始Prompt](../phase2/prompts/P2-007-bindings-receipts-transactions.md)，在已有实现增量完成代码、真实测试、文档和AI日志，保留当前应用四集合，不进入迁移。

**工具及执行者：** AI使用Codex桌面工具、PowerShell、原锁定Node22/npm10/tsx/TypeScript/Vite、MongoDB8.3.11单节点rs0、现有Playwright/Edge、Python标准库与只读Git。具体模型名未知不猜测。代码、fixture和文档由AI修改，不编造人工贡献或教师认可。

**实际实现：** 新operation-contract/receipt-codec/binding-integrity/phase2-context，固定十operation scope/hash与完整DTO、严格读写解码及BSON大小/Long/深拷贝、私有来源仓储、受控合成库与session、owner/状态/revision CAS及有界事务。成功重放只读账号认证和回执，不查当前资源。owner attach/replace/Config/删除及只插publication有实测，未开放share/template/legacy新授权写路径。新增bindingsreceipts证据命令及真实测试；现有Schema、原业务/摘要/循环依赖修复保持。

**真实验证：** 最新事务12子项/含父13通过，十操作完整存取/重放及作用域隔离；同key屏障并发最终1效果/1绑定/1回执/revision1，不同key同修订1成功1 EDIT_CONFLICT。约300KB结果及超1MiB文档、业务写后/回执插入后commit前共四种回滚均核整库指纹一致。真实commit后钩子模拟丢响应可原key重放，Transient合成标签两次成功或三次耗尽回滚、commit合成异常3次而业务仅1次、未知结果原key可确认及无可确认503均覆盖。标签不是实际网络/主节点故障。旧实例删除后仍回原自动ID/修订/完整问题；codec损坏fixture503而不关Schema。publication两历史并存、draft替换/删除不改快照/答卷payloadHash、同版保取得权；无session/外部活动session/越权及伪造来源拒绝。合成库最终19问卷、3题版、12绑定、26回执，含刻意损坏关系fixture，不冒充新业务服务产物。

类型/构建、领域4+8冷导入、Schema、原账号集成13子项、原test:phase1七模块含浏览器及verifyruntime最终均退出0，原核心完整套件仅执行一次。应用库前后四集合选项/索引/计数/内容摘要一致，当前0条不作为永久要求。证据和测试库见[W02-B实施说明](../phase2/bindings-receipts-foundation.md)及[真实汇总](../phase2/evidence/P2-007-summary.json)。

**真实错误及修正：** 首次类型检查因泛型操作结果映射失败，改显式操作类型参数；首次事务测试被实例归属保护拒绝，确认专用27019未运行后原受控dbstart恢复实例，再通过。一次临时只读hash核对的node --eval受PowerShell展开$oid影响报SyntaxError，改Python复算与现有数组元组hash一致。后续按Prompt补齐替换、资源读取哨兵、commit边界、BSON Long及回执深拷贝的遗漏检查，只定向重跑相关项目；失败原件不覆盖。构建原app-config/大图表块警告保留。

**边界：** 回调只用于受信服务端组合，不能替代后续业务权限/状态/门闩或正确的operation服务；调用方负责既有认证并遵守同session/无外部副作用。publication快照/指针CAS仍待完整发布服务，新共享/模板/迁移授权和数据库角色未实现；S04—S06暂定。未安装或升级依赖、未改P1目录/冻结材料/原Prompt/历史证据，未迁移真实数据、未新增HTTP/页面、未提交推送。下一步才是迁移inspect/dry-run，本轮未开始。旧AI日志字节前缀保留，人工复核待用户完成。

静态收尾：1485项核对最终通过，含678份原文件保护、14份冻结原文与Git字节、旧AI日志前缀、原应用五轮前后指纹、真实命令与交付链接/密钥扫描。首次静态脚本错误地把npm类型检查失败预期为1，而真实runner保存的是2；仅修正核对预期并保留P2-007-static-check-initial.json，未改真实失败日志或业务代码。


## P2-007 Content错误分类审阅修正（2026-10-23）

用户指出创建/派生将全部Content校验异常转成400。核对operation-contract、共享Content边界及原API契约后确认存在：结构错误应400，硬语义错误应422 DEFINITION_INVALID。共享层新增有类型的QuestionValidationError（shape/content及完整DefinitionIssue），保留旧消息与无循环依赖；请求预处理仅映射已知校验异常，语义details保留全部原因并将路径改为/content/...，省略内部临时实例ID；未知异常继续抛出。未改变可保存的草稿软问题或hash归一化。

先增加8项纯回归：修正前4通过/4失败，真实日志保留；修正后domain共20项通过（原领域4、新增8、冷进程导入8），typecheck/build均退出0。具体日志与复跑入口见[Content审阅证据](../testing/phase2-runs/P2-007-content-review-20261023/README.md)。构建保留既有app-config与大分块警告。

此次没有连接数据库、启动服务、安装依赖、变更锁文件或Schema，也未执行数据库/浏览器业务测试。未改第一阶段目录、既有审阅修正、历史Prompt/证据，未进入迁移任务，未提交/推送Git。旧AI日志以字节追加方式保留。


## P2-PREP-006 合并实施W02剩余、W03、W04执行Prompt与S04确认

日期：2026-10-23（Asia/Shanghai）。

**用户实际请求：** 用户表示前次错误分类问题已经修复，要求“直接把W02、3、4都一起做掉，给我提示词”。本轮是生成合并转交指令，不在本窗口实施这三个阶段。

**本轮新增业务确认：** AI通过异步问题询问此前暂定S04，用户明确选择“同题同版最多一个实例（推荐）”，即单个问卷草稿/发布定义内同题同正式版最多一实例，不同正式版可并存。已更新requirements-decisions主维护行及待决策说明；历史publication不受跨发布唯一索引误限，历史重复保留并审计。S05/S06仍待模板阶段确认，不在本轮范围。

**实际核对与产出：** AI只读核对最新Content错误分类修复、W02-B仓储与事务边界、主契约、API门禁、前端路由、角色模板与迁移计划；独立复跑operation-content-errors.test.ts，8项全部通过，退出码0，未连接数据库。生成[P2-008合并执行Prompt](../phase2/prompts/P2-008-w02-w03-w04-integrated.md)，涵盖受控迁移检查/恢复演练/固定计划及隔离apply重跑、十三集合真实应用入口、题目版本与题库、问卷引用/显式正式化/更新/共享/撤销/使用查询、API与页面、双模式兼容回归、增量文档和真实日志。按依赖分段持续执行，不在W02/W03收尾后等用户再次催促。

**环境技术建议及边界：** 推荐固定project2_app_v2作为新十三集合业务目标，保留project2_app_v1四集合原状；执行窗口需实际核定、实现并验证明确allowlist与独立入口，这不是本轮已经新建的库。迁移只在新P2合成源/恢复副本演练，不授权写P1或就地升级现有应用库；跨问卷统计、模板/公开分发及最终真实P1切换仍在后续。

**修改范围与未执行项：** 本窗口仅新增Prompt、登记已确认S04并追加日志，原日志字节前缀保留。未修改业务源码、Schema、配置或数据库，未安装依赖、启动服务、构建、运行数据库/浏览器回归、迁移、提交或推送。未将生成Prompt记为W02/W03/W04已经实施；具体完成状态与证据由执行窗口据实记录。


## P2-008 W02剩余、W03、W04合并实施与真实验收

日期：2026-10-23（Asia/Shanghai）。用户要求完整执行[P2-008原始Prompt](../phase2/prompts/P2-008-w02-w03-w04-integrated.md)，在既有实现上增量交付代码、API、页面、合成迁移演练、真实测试、文档，并在分段验收后继续；后续“继续完成”沿用同一任务。S04已由用户确认，S05/S06仍待后续模板阶段确认。

**AI实际工作与工具：** 完整阅读指定需求/主契约、教师只读提取、冻结基线、代码及旧测试/AI记录；执行前保存779文件指纹、app_v1元数据/数据摘要及.local旧.env备份。使用PowerShell/rg、apply_patch、既有Node/tsx/TypeScript、MongoDB驱动真实27019/rs0、Playwright本机Edge、截图查看、Python文档/静态核对和只读Git差异。前端采用[frontend-ui-engineering技能](C:/Users/37905/.codex/skills/frontend-ui-engineering/SKILL.md)，复用既有Vue/tokens/QuestionCard/RuleEditor；未调用其他窗口发消息、未使用子代理。CIM/专用实例连接/浏览器执行按环境工具权限核验，沙箱首次归属读取受限后以授权工具执行，未绕过实例保护或杀未知进程。

**实际产出：** 保留W01与W02-A/B全部基础和Content400/422细分、shared无循环叶模块。新增受控BSON逻辑备份/恢复/inspect/固定dry-run/apply/verify与逐卷事务重跑；独立.env.phase2及project2_app_v2十三集合入口，原project2_app_v1四集合/.env不升级。新增LibraryService/SurveySourcesService/QuestionUsageService、24个L/B/G/I/U端点、4个新页面及来源/选版/共享组件；原Q05/V01、新旧快照/答卷/统计复用。显式正式版本、任意父版、恢复保草稿、派生保源、多题库墓碑、实际accessFence撤销竞态、固定引用/替换/规则审查及逐版本Usage隐私已接入。最后将S04同步到旧owner组合并加无写入负例。角色模板改P2权限清单，未创建角色、开启认证或改实例配置。更新数据库/API/系统/算法主维护文档、机器契约及样例状态、需求/变更/部署/README/测试计划、实施报告和逐项覆盖，不改原Prompt/历史证据。

**真实失败及修复：** 首次类型检查因Uint8Array与Buffer方法不符失败，显式Buffer包装后通过；首次迁移夹具科学计数法定义未规范化被hash门禁拒绝，改fixture复用原normalizeQuestions。W04测试库名64字符超Mongo上限，缩短前缀并初始化异常关闭client；仅清理已核实本轮失败Node进程树。W04末例触发原限流，按不同逻辑客户端用不同回环IP，生产限流未放宽。浏览器先有断言指向未展示的标题，改核实际选版/预览；随后发现来源组件重挂载未解除编辑锁，修正即时watch/adopt和待确认离开提示，受影响两条链通过。窄屏内嵌padding/校验标题调整后全链再次验证。全部6份非零原件及其成功复跑保留，不编造首次PASS。

**真实验证：** 类型/构建、领域4+Content错误8+源码/编译冷进程导入8=20项、十三集合接受69/拒绝71及28业务索引、来源回执事务13子项+父、W03 HTTP7子项+父、W04 HTTP12子项+父、十三集合原六类6子项+父、原baseline七模块含浏览器、账号集成13子项+父、配置14项、运行复审6项、双入口误连2项、app_v2 API/Vite十探针、两个日常库核验全部退出0。八类真实业务提交后改变/删除当前资源，完整历史DTO逐字段重放，资源读取哨兵0且DB指纹不变；模板2类仅基础codec覆盖。四个真实attach/fork×新增先/撤销先门闩屏障分别1效果/0效果；版本CAS/题库删除竞态及真实事务回滚有数据库断言。故障/响应丢失为明确钩子，未做真实断网或主节点切换。

迁移最新非空run、源/两个恢复库、计划与sourceHash见[实际实施报告](../phase2/w02-w04-implementation.md)和[机器汇总](../phase2/evidence/P2-008-summary.json)。2用户/2卷/6快照/6答卷、四题型及BSON Long；10身份/12题版/40绑定，固定计划dry-run零写，真实恢复和apply。commit后journal前中断/丢journal恢复1skip+1commit，重复2skip+0commit；源漂移与另一个恢复目标行冲突不覆盖，未知格式9/缺快照阻断。正向核验原BSON/hash/字段不变后再故意改变合成源为漂移负例，不能称最终坏夹具仍等于原源。另独立迁移十三集合应用读取原历史/统计并重放原发布/提交key，整库无写入。

两条真实Edge链为本人草稿→正式v1→入库→问卷引用/配置→发布/填写/旧统计，以及A共享→B引用→A新v2→B暂停替换重发→A撤销→B存量维护重发/填写且新引用/派生拒绝。HTTP/DB断言结合截图，320/768/1024/1440无横向溢出、pageerror为0；实际查看320/1440编辑页与Usage隐私截图。Usage1001合成合法历史条目的容量负例422、限定版200且无写入，不声称1001次人工操作。

**证据/人工复核待办：** [命令原始日志与退出码](../testing/phase2-runs/P2-008/README.md)、[逐项覆盖](../phase2/w02-w04-coverage.md)、[保护核对](../phase2/evidence/P2-008-static-check.json)。当前测试应用进程已释放，专用Mongo保留；app_v1四集合前后摘要一致，app_v2为空业务库可由用户注册使用。未连接或修改P1/27018、未迁移真实数据、未安装升级依赖或改锁、未提交推送、未生成最终Word/PDF。旧日志字节前缀保留。W05跨问卷统计、W06公开模板/授权、W07真实迁移及最终报告未完成；S05/S06待确认。数据库认证未启用，角色强制未测；Usage全量来源检查是课程规模方案。请人工从另一个窗口审查代码、证据、页面/错误反馈及后续业务选择；没有编造姓名、模型版本、人工贡献或教师认可。


P2-008最终静态补记：核对779份已有文件，385份历史Prompt/证据/归档均未改，14份冻结原字节hash一致；旧AI日志38153字节前缀不变，.env等于私有备份、锁文件/.env.example不变；app_v1前后完全一致，app_v2十三集合0业务文档；219处新交付链接有效，扫描公开文本无实际配置密钥。默认git diff --check将CRLF识别为行尾空白，首次静态检查因此非零；保留[实际输出](../phase2/evidence/P2-008-diff-check.log)，以命令级core.whitespace=cr-at-eol复核退出0，没有修改Git全局配置或批量换行。角色模板node --check退出0，不等于权限强制验收。最终监听证据见[P2-008-processes-after.json](../phase2/evidence/P2-008-processes-after.json)，测试应用端口已释放，只有本项目Mongo27019保留。


## P2-PREP-007 W02—W04审阅及W05/W06执行Prompt、S05/S06确认

日期：2026-10-23（Asia/Shanghai）。

**用户实际请求及确认：** 用户表示前一部分已经完成，要求审查小问题并提供W05/W06提示词。AI询问S05/S06，用户先要求详细解释；AI用A/Qv1授权B及C选用的例子解释具体版/发布者、不可转授、撤权阻未来选用而保既有问卷，未把解释当同意。随后用户明确回复“两条都采用”。已在requirements-decisions登记S05/S06确认，S04保持已确认。

**本轮审阅：** AI只读查看W02—W04实现/覆盖、关键服务/来源/迁移/路由、题目编辑与重试组件及测试。核对P2-008的21项requiredChecks对应原始result退出码，全为0且与摘要一致；这是核对保存证据，不是本轮重跑数据库/浏览器。发现两项前端状态问题：正式保存后仅刷新editor而未同步本地base/saved，下一次草稿保存可能回写旧父版本；pending未知操作时其他动作仍可触发，共用useOperation会重发旧请求而调用方按新动作解释。第二项用实际useOperation及内存mock fetch复现：恢复失败后请求派生，实际第二次仍发送原恢复路径/正文。未连接数据库或修复源码。

**产出：** AI生成[P2-009 W05跨问卷统计Prompt](../phase2/prompts/P2-009-w05-cross-survey-statistics.md)及[P2-010 W06模板广场Prompt](../phase2/prompts/P2-010-w06-template-square.md)。W05先修上述两项再实现本人问卷同题同版统计、四型/路径分母、真实atClusterTime分页及页面；W06实现已确认公开授权、完整多级来源、模板fence与管理revision分离、广场/选用/窄权和竞态。两份均要求实际代码/页面/API/测试/增量文档/日志，保留原业务和历史数据，不自动进入W07。

**边界与修改范围：** 本轮只新增两份Prompt、更新需求中的已确认业务状态、追加本日志，原日志字节前缀保留。未修改业务源码、配置、Schema、实际数据库，未安装依赖/启动服务/构建/迁移/提交推送；不将提示词写成W05/W06已实施。原P1目录/27018、冻结文件、旧Prompt与历史证据保持。

审阅收尾补记：独立执行现有domain-foundation、operation-content-errors及shared-imports三份纯测试，共20项通过、退出0；未重跑MongoDB/浏览器验收，未修改源码。


## P2-009 W04前端审阅修正与W05真实实施

用户联合授权顺序完整执行[P2-009](../phase2/prompts/P2-009-w05-cross-survey-statistics.md)、[P2-010](../phase2/prompts/P2-010-w06-template-square.md)，W05验收后自行继续W06，不进入W07。此条仅记录W05完成时点，不提前称W06完成。

AI实际工具：PowerShell/rg/apply_patch、既有Node/tsx/TypeScript、真实27019/rs0原生MongoDB驱动、Edge/Playwright、Python文档/指纹工具及只读Git；使用frontend-ui-engineering技能复用原Vue/样式，未调用子代理。执行前保存1075文件指纹和两应用库摘要，保留既有脏更改。核对Mongo官方snapshot页面和mongodb7.7.0源码：服务器cursor.atClusterTime实际存到@internal snapshotTime，其类型声明被剥离，采用局部版本锁定桥并实测实际底层命令与Timestamp，不猜不存在字段。

修复正式保存后本地base/saved不同步：无新编辑才adopt新服务器草稿，恢复保未保存内容；useOperation固定原path/body/key、明确拒不同请求、锁其他动作/版本/规则并保证结果按原动作处理。单元mock网络失败2项，真实页面连续v1→v2父v1、明确旧基线、恢复已commit但响应丢失后原key确认与未保存输入保留均通过；人工解除DOM disabled也不发另一个派生请求。

新增CrossStatisticsService/routes、shared DTO和CrossStatisticsPage，X01—X03接原query/405/认证门禁。仅本人publication，相关范围完整性核验、旧定义/答案hash/路径重算，撤销保留本人旧publication统计，源作者不越权；不改旧hash及分卷统计，不新增Schema/索引。Decimal128真实聚合和数值频数；事务外snapshot跨HTTP短session固定真实时刻，签名绑定规范过滤hash/actor/题版/端点及排序位置；当前owner每页复验，过期和真实SnapshotTooOld统一409重开。容量显式限定1000卷/5000快照/100000匹配答卷/2MiB，batch200，超限422不截样本。

真实结果：2卷/eligible5/answered4/skipped1/未答0、均值15及区间桶0/2/1/1/0；派生99/其他版88/他人100排除；single2/1/0、multiple2/2/0且分母3、文本两条。数值1/1.0/1e0同频数3，0/2/10数值升序，大整数均值9007199254740994精确。首批前insert、首批后commit且接受时间远早于asOf的真实事务，旧页4条/新页5条；真实命令记录固定atClusterTime且无transaction。100问卷及10000字符原文cursor小于2048、当前owner变化、跨scope/actor/端点、相关整组映射丢失、legacy同版多实例和损坏答案均有负例。读请求前后指纹不变；app_v1/app_v2元数据/索引/内容逐项一致。

真实失败保留：驱动内部字段TS类型失败后局部桥修复；Vue代理不可structuredClone的单元夹具改JSON克隆；统计fixture误用latestPublishedVersion改回Editor.currentPublishedVersion；晚提交fixture误选跳过记录改明确数字记录，并修复撤销后整组映射丢失被提前404掩盖的问题。W04交错回归曾因立即三次重试耗尽503失败，增加50/150ms短退避、仍3次有界，受影响W04及事务基础复跑通过。全部原件和修复后定向复跑保留，无限重试/放宽权限均未采用。

类型/构建、领域/Content/冷导入20项、W03/W04、十三集合原六类、baseline账号集成13子项、来源回执13子项、统计4子项、边界3子项、真实浏览器四型范围/区间/原文翻页/错误恢复与320/768/1024/1440最终退出0。原Vite警告保留；没有真实宕机/断网或选主测试。完整日期/命令/退出码/数据库/失败见[P2-009原始记录](../testing/phase2-runs/P2-009/README.md)、[W05实施](../phase2/cross-survey-statistics.md)及[机器汇总](../phase2/evidence/P2-009-summary.json)。主契约、机器状态、需求/变更/README/测试计划同步，旧P2-008报告/Prompt/证据及日志前缀不改。

W05已完成，继续已授权W06；不进入W07。未安装升级依赖、改锁、写应用库演示数据、连接P1/27018、清库或提交推送。权限强制部署、真实P1迁移和最终Word/PDF未做。人工审查待用户另窗口执行，未编造姓名、贡献、模型版本或教师认可。


## P2-010 W06公开模板与完整来源授权实际实施

2026-10-24（Asia/Shanghai）。继续用户联合授权的P2-009→P2-010；W05已验收，保留其代码与历史原件，本轮完成W06，不自行进入W07。用户已确认S05/S06，不重复索取确认。执行前P2-010-before保存1235文件摘要和两应用库元数据/内容指纹，保留既有脏工作区；没有提交或推送。

完整阅读Prompt、现有主契约及服务/Schema/回执/前端状态实现，使用PowerShell/rg/apply_patch、现有Node/tsx/TypeScript、原生MongoDB驱动与真实27019/rs0、Edge/Playwright、Python文档/摘要工具和只读Git。应用frontend-ui-engineering技能延续原Vue组件、样式、错误与加载处理，未调用子代理、未安装升级依赖、未改锁或写P1。全部业务fixture仅新唯一project2_test_*；容量/损坏图明确标为合成存储夹具，经过strict验证器，没有弱化验证器或修改旧不可变事实。

新增DistributionGrantService、DistributionLineageService、TemplateService、template-integrity及template-routes和shared DTO。A01—03限定题owner、精确正式版、实际注册发布者、item/grant修订；同grantId撤销/重授revision递增。完整叶→根核文档、源对、owner/createdBy、Content及origin，不把派生或unrecorded洗成原创。固定证明包含自身和所有祖先；hash规范沿主契约，当前grant每次动态复核，历史grantRevision不要求等于重新授权后的修订。新建、上架、选用、eligible和预览共用同一服务。超32链/500并集/2MiB拒绝；新卷UUID映射后再次BSON容量检查。

已有模板先写模板fence，再按所有叶/上游题OID去重排序写fence，同session重新核全链/资格；普通选用不改管理revision/updatedAt/contentHash，也不CAS旧fence。沿用snapshot/majority/primary、有界Transient和Unknown commit原回执确认。新卷独立ID/链接/usageNumber/实例/规则及target映射，选项ID不变，默认匿名/重复false、截止null、计数0/无发布指针。authorization仅模板固定实例窄权；source-read核originTemplate/固定模板hash/所含题版，存量不重验当前公开权。L08严格核本人模板实例后显式创建本人派生v1，再I02采用；公开仍保全部上游义务。两类模板实际业务回执补全，旧key只读原成功完整DTO，不从当前资源重建。

新增广场/我的模板、固定预览及选用、源问卷选择发布版创建、题作者精确公开授权/撤权、实例窄派生编辑。未知操作保持原path/body/key，锁其他发布/编辑/版本/标题，原动作明确确认。真实四账号浏览器执行A授权B→B选择发布v2模板→C选用/Config/发布填写→A撤权→D新选用拒绝而旧卷继续收答→C派生/采用/重发、公开仍403→A原grant重授→B上下架→D可重新预览。创建和选用均先真实提交后由浏览器拦截丢失响应，再同key确认；并非数据库断网。另两类业务以明确合成UnknownTransactionCommitResult标签核实际commit后回执确认、callback不重做、未提交整体回滚。320/768/1024/1440截图、键盘Tab、无pageerror及真实HTTP/DB断言保留，最终图已打开检查。

实测精确版/发布者不含未来或转授、share不足403、H/F/Q三义务及摘要、修改/恢复固定源、未知409/坏链503、32通过33拒绝、500通过501拒绝。模板实际BSON恰2097152可创建、2097153及UUID膨胀后的问卷超限422，指纹无残留。同key并发一份新卷/回执，不同actor同管理revision均201且revision/updatedAt/hash不变。十个可控屏障顺序核DB结果：选用对下架/直接撤权/深祖先撤权六种；创建/重新上架对深祖先撤权四种。停止先commit零新增；分发先commit成为可发布填写存量。广场连续不可用空页仍推进cursor，最终到达合格模板，跨scope/actor和逐页撤权复核通过。

真实失败保留：初次templates测试路由/DTO及copy正文断言不符契约，导致后续依赖状态失败；修正测试契约。browser按钮名称不符和异步替换重载过早点击发布分别失败，修正按题干定位与等待组件卸载/问卷刷新，并补齐跨动作禁用保护。旧原件未覆盖；最终固定标题/间距微调后再build和browser通过。不是删除失败或放宽权限。

typecheck/build、领域20项含Content错误和8冷导入、精确Schema、事务回执、W03/W04、W05手算/真实快照/边界/浏览器、十三集合等价、baseline集成/发布页、编译API/Vite启动前后PID及所有W06套件最终退出0；原八类历史业务回执另实跑，结合本轮两类形成十类真实业务证据。完整命令、UTC时间、目标库、退出码、合成边界/故障与原失败见[P2-010原始目录](../testing/phase2-runs/P2-010/README.md)、[机器汇总](../phase2/evidence/P2-010-summary.json)。

同步主维护需求/API/数据库/算法/系统/机器契约/JSON样例/测试计划/运行入口/变更对照和W06覆盖文档。复用十三集合和原精确索引，无应用库DDL，两个应用库4/13集合仍均空、验证器/索引/内容摘要一致。历史781份材料及AI旧字节前缀保留。角色模板增模板/公开grant的find/insert/update，无remove；未执行创建角色、启用认证或重启Mongo，不称数据库角色强制部署。测试API/Vite释放，专属Mongo32420保留。W07真实P1迁移、维护来源修复、最终Word/PDF和人工最终审查仍未完成；未伪造人工认可、姓名贡献或模型版本。


## W05/W06独立审阅与自动化复跑（2026-10-24）

**用户授权：** 先审查已经完成的W05/W06，再执行自动化测试。本轮不修改业务代码，不执行W07真实迁移、角色认证部署或人工验收。

**工具及实际执行：** AI使用只读代码/文档检查、现有Node22/npm/tsx/TypeScript/Vite、真实27019单节点rs0及无界面Edge/Playwright。原有21组主检查最后均退出0：类型/构建、领域与冷导入、operationretry、W05统计/边界/浏览器、W06模板/竞态/来源边界/浏览器、W03/W04、十三集合等价/Schema/来源回执、原账号集成和第一阶段七模块、双应用核验。类型首次受沙箱EPERM阻止写已有dist，批准后重跑通过；OS监听读取也先受限后批准核验，未绕过保护，首次失败保留。既有Vite警告保留。

**新增发现：** 补充真实HTTP复现无关账号访问私有单选题answers/distribution返回422而非统一404；补充真实Edge复现共享撤销后本人publication数值统计仍200且带区间API正常，但页面区间控件缺失。现有套件通过不覆盖两项；复现脚本正常退出不代表其passed=false断言通过。未修复源码。详细建议与证据见[审阅报告](../phase2/reviews/W05-W06-review-2026-10-24.md)。

**保护与产出：** [本轮证据](../testing/phase2-runs/W05-W06-review-20261024-201650/README.md)包含全部原始日志/退出码、补充脚本/JSON/截图、前后应用指纹、源码摘要及监听记录。170份源码/配置/测试/锁文件摘要不变；app_v1四集合0条、app_v2十三集合1条前后元数据/索引/数量/BSON摘要完全一致。写入仅新独立project2_test_*，数据保留，不清库。临时端口3110/3219/3220/3225已释放，专属Mongo保留。只新增测试/审阅证据及说明并追加本日志，原日志字节前缀保留；编译产物按测试需要生成。未安装升级依赖、连接P1/27018、改业务/Schema配置、提交推送或代写人工认可。


## W05/W06 R1、R2审阅修正（2026-10-24）

用户提供原审阅的两项问题并要求核对修复。核对现有源码及[原审阅报告](../phase2/reviews/W05-W06-review-2026-10-24.md)，先写新增回归，在新唯一合成库真实复现后才改业务代码。首轮crossaccessreview退出1，明确复现私有题型422、非法边界400及无关坏历史503先于权限；首轮crossretainedbrowser真实Edge均值5可见但控件数量0，退出1并留图。原审阅及旧P2-009/P2-010证据未覆盖。

R1将allowed门禁移到统计snapshot session及正式版读取前：当前owner/有效且作者匹配的share/本人精确题版publication事实仍三条授权来源；无权404先于版本、题型、边界、游标到期与历史详细检查。撤权存量不改成只认active share。授权后仍作完整历史核验，缺映射503；若全部取得事实也丢失且无其他权利则404，不凭坏历史猜权限。为保留原缺整组映射503回归，在撤权前补另一份真实publication独立证明存量权，删除其中一组时依然503。新增真实HTTP覆盖40组题型/资源/端点/边界组合及15组无关坏数据，全部先404且未进入统计snapshot；有权422/400保留；存量三个端点200、mean5/bins0-1-0、answers5/频数5×1；历史/未来版未开放，源作者仍不能读接收者答案。

R2沿frontend-ui-engineering技能复用原控件和状态：从已成功授权的统计summary是否含average判别数值联合分支，作为精确questionId/versionId范围的页面类型证据。源历史列表404无需放宽；平均0/null也按字段存在性识别，不用truthy均值。保留类型证据使查询清空summary/边界错误后控件仍可纠正；换版不串用。原DTO及源题读取权限未变。真实Edge验证撤权share和模板窄权各一条，区间输入均1，0,10分桶0/1/0，非法10,0后纠正、刷新、320/768/1024/1440无溢出和Tab均通过，无pageerror，历史/未来版仍404。原W05四型/范围/原文/未知恢复浏览器亦通过。

实际工具为PowerShell/rg/apply_patch、现有Node/TypeScript/tsx、真实27019原生MongoDB、Edge/Playwright及Python文档/指纹；无子代理、依赖安装升级、Schema修改、P1访问或Git提交推送。typecheck/build、domain含Content和冷导入、crossstatistics真实手算/快照/旧数据完整性、crossboundaries、templates及两个新增定向测试/原浏览器最终退出0。原始失败及修复后新目录见[本轮索引](../testing/phase2-runs/P2-010-review-r1-r2/README.md)、[机器汇总](../phase2/evidence/P2-010-review-r1-r2-summary.json)。

主API/算法、机器契约、当前文档入口和独立修正说明同步。AI旧字节前缀保留。两个应用库前后验证器/索引/数量/BSON摘要完全一致（baseline4集合0条；phase2十三集合、原有1用户保留）。fixture不写应用库，不清测试库。临时3231/3232及原W05测试端口结束释放。为使用户当前网页实际加载修复，只在核对本会话原记录PID42252和完整命令/监听归属后重启该API为13160，保留前端12592及Mongo33144；页面及API ready实测200，服务继续运行。没有进入W07真实迁移、角色强制部署或最终报告任务，未代写人工认可。


## 第二阶段自动验收补强与完整回归（2026-10-24）

用户请求：“可以，把前面的测试做完，然后我们就可以开始人工测试的部分了”。范围为此前讨论的跨模块流程、权限矩阵、统一回归入口、适量规模验证，以及人工验收准备；不自动执行真实P1迁移、角色强制部署或代替用户签署人工通过。

新增tests/phase2/acceptance-journey.test.ts、acceptance-permissions.test.ts、acceptance-scale.test.ts，扩展scripts/run-check.mjs，增加scripts/run-phase2-acceptance.mjs与npm run test:phase2:acceptance；原npm test仍只集成检查。新增自动化覆盖/结果说明及待执行人工清单，README/实施计划增加入口。没有修改apps/packages业务源码、Schema、依赖锁、P1目录或Git配置，没有提交推送，也没有子代理。

使用PowerShell、rg、apply_patch、现有Node/tsx/MongoDB驱动、真实27019/rs0及现有Edge/Playwright。首轮沙箱监听查询拒绝后受控重跑；新增脚本首次有两处测试辅助错误（填写者误读管理接口、参数顺序）和同源HTTP触发现有限流429，保留失败原件后修正测试。规模测试使用24个真实不同回环源地址模拟填写者，不伪造转发头或关闭限流；另1探测账号前180次正常、第181次429。没有通过修改业务预期掩盖失败。

三项定向重跑通过后，于北京时间21:38—21:49统一运行34组全部退出0，保护检查无失败。四账号连续旅程贯穿题库、共享、两卷、换版、模板、双撤权、存量统计和恢复，旧快照/答卷BSON不变；五类身份61条权限组合；36问卷/3所有者/24填写者/2160真实HTTP答卷/12并发，各卷60份，三所有者的四型统计/全页ID/频数与独立预期一致，12次原key重放不写库。提交阶段37.71秒，2172个提交/重放请求P95约879ms；只作为本机单节点实测，不宣称生产吞吐。新旧真实浏览器、合成升级/恢复/中断重跑及第一阶段原测试均通过。Vite原有构建提示未修复且退出0。

两应用库验证器/索引/数量/BSON摘要前后一致（baseline四集合0条，phase2十三集合原1用户保留）；应用/共享源码、测试、脚本及包文件摘要一致。用户API13160、前端12592、Mongo33144监听PID保留，13个临时测试端口全释放，网页5200及API3200 ready实测200。所有夹具进入独立新合成测试库；未清库、未重启现有服务，未触碰27018第一阶段实例。

证据：[完整34组及机器汇总](../testing/phase2-runs/acceptance-2026-10-24T13-38-22-921Z-0088609e/README.md)、[覆盖与失败说明](../testing/phase2-automated-acceptance.md)、[人工待执行清单](../testing/phase2-manual-acceptance.md)。人工测试未执行，账号仅列建议由用户注册；真实网络断开/宕机/选主、真实P1数据迁移、认证角色部署和最终课程报告仍不在本轮完成结论中。AI旧字节前缀原样保留，追加摘要另存本轮证据。


## 按完整问卷重写人工测试方案（2026-10-24）

用户指出旧清单按功能检查、没有讲清需要几份问卷和各卷题目配置。本轮只修改人工方案文档，没有操作页面、注册账号、创建问卷、提交答卷或修改业务源码。保留原清单phase2-manual-acceptance-v1.md；新总表与v2副本按6份手建卷＋2份模板生成卷组织，7个分册列账号、三道复用题/题库、各题内容/限制/必答/跳转、17行固定答卷、分阶段统计、授权顺序、失败尝试和实际记录表。W01基础、W02/W03跨卷、W07草稿规则、W04源模板/W05保留使用/W06派生、W08状态测试彼此分开，避免后续操作污染统计样例。使用新前缀-02，不删除此前-01数据。

实际工具：PowerShell/rg/apply_patch、Node现有shared纯函数、Python文档链接/算术核对；无技能、子代理或外部服务调用，无应用库访问、无服务重启、无提交推送。一次apply_patch删除并新建同路径的写法被工具拒绝，未改动文件；随后正常创建v2并更新入口。用现有validateQuestions/evaluateAnswers静态核对所有配方与17份计划输入，基础4条跳转路径、年龄20/评分1.75/跨卷20/模板3.5等算术及总份数一致；结果标为manual-plan-static-validation-only，不能作为真实人工或端到端通过证据。新版Markdown本地链接全部存在，总表与v2副本一致。

新增[问卷总表](../testing/phase2-manual-acceptance.md)、[逐卷分册](../testing/phase2-manual/00-prepare.md)、[计划静态核算](../testing/phase2-manual/plan-check.json)、[待填台账](../testing/phase2-manual/06-results.md)。注意原分问卷统计不显示独立跳过字段，方案明确需从固定来源的跨卷统计查看；题目正式版与问卷发布版分开编号，新增恢复v3不覆盖草稿。人工结果全部未执行，未把此前34组自动通过转换成人工PASS。AI历史字节前缀保留并追加本条。


## 人工反馈00—03与撤权入口判定澄清

用户确认00正确可行、01正常，02验证点正常但实际题目/修改问卷与配方存在出入；03撤权后看不到新增v3/派生入口，询问是否正常。读取SurveyQuestionSources/QuestionPicker/QuestionLibrary及LibraryService、既有共享撤权回归源码，确认retained普通共享实例隐藏源历史/一般派生/换版入口，选用器不再列出已撤权题，属于预期页面行为；已有模板实例的窄权派生是另一独立分支。原有自动回归另外验证直接新增/派生/升级请求409，不能据页面入口隐藏推导本次人工发送过API。

只更新总表、03分册和06结果表：按页面观察判定，不要求点不存在的按钮或绕过界面；仍需核对已保存实例、配置保存和固定版统计。00/01标用户口述确认正常；02记验证点正常但ID/数据需据实记录，不套用20/90/17份预设，不重做/清理数据凑配方；03只确认入口隐藏观察项，其他项不自动标PASS。未查看应用数据、未操作页面、未改业务源码、未重跑测试；本地文档链接核对通过。AI原字节前缀保留并追加本条。


## 提供人工测试MongoDB只读核对命令

用户要求查询命令，检查实际保存数据。读取当前phase2-models/Schema/问卷来源/正式保存恢复/答卷模型后，新增database/inspect-phase2-manual.mongosh.js和docs/testing/phase2-manual/07-mongodb-inspection.md，并在06台账加入口。显式27019/rs0和project2_app_v2；首次只列真实账号（不含密码哈希）、问卷与题目ID，再由用户配置实际ID/统计所有者。聚合检查计数对账、历史发布快照、答案发布号/实例、正式绑定及hash对齐、单一定义同版重复、失效回答引用、正式版本/恢复/待保存草稿、共享撤权与存量绑定、目录成员；数值汇总按所有者＋题身份＋正式版并以答卷发布版/实例关联，不用同名题或当前版本替代历史。明确原grantRevision作为取得审计无需随撤权改写；缺答不能直接判断分支跳过；单看当前hash不能证明历史不变。

仅生成查询脚本和说明，未访问应用库、未读取实际业务账号或答卷、未执行MongoDB查询、未修改业务源码/数据或服务。Node --check语法检查通过，不冒称MongoDB管道已实测或数据已正确。用户执行后再按真实输出判断，不套用20/90/17份计划。AI旧字节前缀保留并追加本条。


## 修正mongosh加载兼容并核对当前人工数据（2026-10-24）

用户贴出load查询脚本后的SyntaxError Unexpected token ','。读取附件及脚本后，使用本机D:/Programmer/bin/mongosh.exe --nodb最小复现，确认2.11.1的async_rewriter对最外层await(async()=>{})()写法报错；之前只有Node --check，验证不足。仅把查询脚本最外层改为直接调用async function，内部只读查询不变。实际对localhost27019/rs0/project2_app_v2清单、5卷/实际AT02指定查询、同会话两次load均退出0；无业务数据/授权写入、无服务重启，未重跑34组业务回归。执行沙箱的mongosh AppData日志EPERM警告保留且查询退出0，不修改用户配置来消警告。

真实数据核对：5卷/8答卷计数一致，23条绑定formalVersionFound/questionMatches/hashMatches全true，单一定义同题同版重复和失效答卷快照/实例引用均空。用户实际使用AT02每周次数（6adcc3f3ba826d37d9e2d1f0），乙场从发布v1到v2，甲场保持v1；正式题v1有效2/4均值3，v2值5均值5。v3为恢复v1且同contentHash，待保存草稿base仍v2；B共享已revoked、旧share绑定仍存。当前AT01没有B私人共享记录，AT02对B已撤销，公开模板及分发授权均0。W01当前allowRepeat=true，不能据此确认禁止重复子场景通过，记录需补测；不把差异判为数据损坏，也不修改现有记录来凑配方。

修正07查询说明的实际验证状态，补实际只读证据目录manual-inspection-fix-20261024（inventory/focused/grants/same-session日志及输出核对JSON）；06追加实查及证据限制。04前提适配实际题身份：开始模板测试前由A给B授予/恢复AT01、AT02私人共享，明确选v1，保留已有v2/v3/草稿，不替用户操作授权。文档链接存在性检查通过。仅确认当前存储一致性，不凭当前hash声称历史从未被改，不将脚本修正误写成业务bug修复。AI日志旧字节前缀保留并追加本条。


## 公开授权仍缺失的只读定位（2026-10-24）

用户问为何已经授权仍无法创建公开模板。只读检查DistributionLineageService/分发授权/模板创建源码，以及当前MongoDB问卷、template_grants、源发布v1的survey_question_bindings。确认B源卷6adcd02bba826d37d9e2d259的AT01正式v1已有A→B active公开权；AT02实际固定v1（6adcc3ffba826d37d9e2d1f2），但A授权的是恢复所得v3（6adcc8c6ba826d37d9e2d24d）。其余两题均B原创、无需第三方公开权，无额外派生链。故为具体正式版本不匹配，不能按同内容/hash放行。建议A只选AT02历史v1并给B补授权，然后B刷新修订再创建；不恢复题、不改草稿、不替换源卷、不要求撤掉现有v3授权。未替用户执行任何写操作。实际只读两轮均退出0，证据存template-grant-diagnosis-20261024，mongosh日志目录警告原样保留。未修改业务代码/权限规则，AI原字节前缀保留。


## 浏览器辅助执行剩余人工验收与只读对账（2026-10-24—25）

用户请求代为完成后续测试，并提供A/B/C/D现有本地测试账号登录信息，后续要求继续完成。使用computer-use技能和cua_repl操作localhost:5200正常页面；登录信息仅用于正常登录，不写入仓库，不伪造JWT、不绕过鉴权、不直接写MongoDB业务数据。沿用用户已创建的源卷W04和固定模板T01，保留B额外同名模板草稿和11草稿，新建C/D模板生成卷W05/W06及单题收集状态W08。本次通过页面新增8份真实答卷，原9份保留，实际选定8卷合计17份；不凭总数相同套用旧计划身份/数值。

实际完成：C/D独立选用、默认策略/实例与跳转重编号、C独立必答配置；W05禁止重复补测、D访问C管理统计拒绝；W04暂停改Q2可选并重发v2，T01仍固定源v1；同T01下架/重新上架；A撤销AT01/AT02私人共享与v1公开分发权，C旧模板入口拒绝，但已有W05可继续采集和统计；W07撤权后两实例保存及B历史统计；C非法区间纠正、有效2跳过1均值3.5；D窄权派生保存并明确采用替换、重发v2，原题4与派生题6分开；D公开模板前后均拒绝，恢复给B的两题v1公开权可恢复原T01资格，私人共享仍撤销，AT02/v3旧公开权不动。W08实际匿名2/8、旧v1页在重发v2后拒绝且DB计数仍2、刷新后B真实再次提交4；10-25 09:36设置未来截止09:38并先成功发布v3，D保留页到期后提交9被拒，新访问显示截止；A关闭成功且无重新开放入口，D访问关闭页拒绝。关闭后历史均值v1=5/v2=4/v3暂无，跨发布有效3、均值14/3。

MongoDB仅27019/rs0/project2_app_v2只读核对：新增本次证据目录assisted-manual-20261024、可复查只读audit.mongosh.js、基线/撤权/旧版拒绝计数/完整快照/最终输出、summary.json、页面截图。最终44/44存储断言通过，58条目标绑定题身份/正式版/hash一致，无同定义同题同版重复或失效答卷引用；重复填写断言明确B两份不同requestId分属发布v1/v2。没有把44项当作重跑原34组业务回归。原MongoDB/API/Vite进程33144/13160/12592仍存活，未重启；Get-NetTCPConnection权限拒绝后只读Get-Process替代，未更改系统权限；mongosh AppData自身日志EPERM保留，查询退出0。关闭确认时原浏览器标签焦点读取超时，未重复点击关闭；数据库closed及新标签管理页/D填写页复核成功。

两处小问题只记录未修：工作台列表对到期published问卷仍显示收集中，发布页/提交拦截正确；行内派生与外层卡片重复DOM ID，题干/数字上下限辅助名称重复。在B原草稿仅展开派生编辑、只读DOM检查并关闭，无保存/新题创建。重复ID JSON/DOM快照/截图留证。更新人工总表、04统计范围说明、06最新实际结果，保留旧计划为历史模板并链接实际执行记录；B全部本人AT02/v1实际2/4/7均值13/3，只有限定W04才是7。

本轮没有修改业务源码、权限规则、P1数据、数据库认证部署或服务配置，未提交/推送Git。原00—02用户操作、未手发的隐藏API、多视口/全键盘/辅助技术、第二设备、真实故障与选主、真实P1迁移及最终报告均不冒称本轮通过。执行日期按实际跨午夜/中断后续行分段记录。证据本地链接与44项结果核验通过；本AI日志旧字节前缀保留并追加。


## 收尾修复、真实一期迁移与认证部署（2026-10-25）

用户要求解决两处界面问题、多尺寸及键盘检查、真实一期数据迁移、数据库认证与角色部署、最终报告；随后明确“word报告让我自己来写”。本轮执行已授权代码修复、部署、测试及事实性Markdown记录，没有创建或修改Word/PDF，没有代替用户撰写或提交课程报告，没有Git提交/推送，没有子代理或对外消息。

使用impeccable与computer-use技能；文档技能初期只读取，用户排除Word后未执行文档生成或渲染。工具为PowerShell/rg/apply_patch、现有Node/tsx/MongoDB驱动、Python证据整理、cua_repl真实浏览器操作。浏览器登录只使用用户提供的本地测试账号正常流程，不伪造JWT，不打印密码或将登录信息写入仓库。

两处原问题：SurveySummary/DTO增加兼容的可选expiresAt，SurveyRows定时结合截止时间显示已截止，数据库status枚举不变；QuestionCard支持可选domIdPrefix，TemplateInstanceFork使用独立前缀，业务question.id/data-question-id不变。320/768/1440共11页33组合首轮发现跨卷均值13/3的长小数溢出，CrossStatisticsPage增加断行而不舍入；最终33组合无横向溢出、重复ID或无标签启用控件，均有一个main/h1。Tab/Shift Tab、Enter、空格、错误定位、真实登录与填写预览实际检查；skip-link首次落BODY，修正App/main及router hash处理后焦点进入MAIN#main、未保存输入保留，再还原本地输入而未保存。行内派生三宽度另行展开核对唯一ID后取消，不产生新题。机械检测仅执行一次，ui-detector.json为空，不宣称完整WCAG或屏幕阅读器认证。

真实一期：确认27018原实例已停止、原目录标记正确后冷复制1179文件，保留冷备份并只启动独立工作副本27020，提取project1_app_v2真实5用户/6问卷/5快照/8答卷。复用已有inspect/backup/restore/dryrun/apply/verify流程，runId为1792893806861_811aaed6；两个独立目标project2_restore_1792893806861_811aaed6及project2_test_p2008_migrated_1792893806861_811aaed6分别6卷提交、verify通过，新增16正式题版/35绑定，重复apply各0提交/6跳过。认证后的旧格式目标应用ready200、未认证管理请求401、5快照/8答卷保留；未重置旧用户密码或冒称旧用户登录通过。最终原一期1179文件摘要完全一致，原实例未启动。冷备份/逻辑数据保存在Git忽略.local/w07，迁移plan/journal在.local/p2-008/migrations；公开只存汇总。当前网站继续使用原project2_app_v2，没有将两套业务数据合并或切流。

认证：新增受约束凭据读取、应用MongoClient认证参数、维护客户端、provision/verify与真实迁移/库存核对脚本，调整init/start/stop流程及app-role模板。原严格URI/数据库/端口限制保留，应用凭据只允许.local/security内直接文件并拒绝符号链接、未知字段和目标错配。管理员与应用账号分离；角色定义于admin，资源限project2_app_v2，正式历史集合insert-only，API只使用受限应用用户。私有随机凭据/keyFile及认证前BSON备份仅Git忽略本地文件，ACL最终仅当前Windows用户/SYSTEM，不写公开证据。首次业务库定义含cluster权限角色被MongoDB拒绝后修正；首次ACL操作移除继承导致维护端EPERM，扩大给CodexSandboxUsers的建议被自动审核拒绝且未执行，随后仅恢复当前用户/SYSTEM权限成功。正常stop/start经过实际验证，stop helper显式工作目录且校验所属实例，没有强杀数据库；最终Mongo14688/API40944/Web12592，API ready200。进程号仅当时记录，不作为以后停机依据。

20/20真实认证强制检查：未认证/错误密码拒绝；应用正常读、真实survey更新事务回滚；5类insert-only集合update/delete拒绝；DDL/越库拒绝；角色精确权限及数据/索引/选项前后指纹一致。通过正常页面实际登录、建卷、正式保存、发布新增零答卷复测卷6add675ac62b15cb7bd796a1，截止后列表已截止并保留。原8人工卷17答卷44/44只读检查通过，认证前所有原二期文档BSON逐字节不变；仅新增本轮复测卷及其必要题版/绑定/回执等记录，没有清理已有业务数据。

为认证环境兼容调整既有测试MongoClient构造及隔离测试配置：tests/database-client.ts重新导出原MongoClient并提供显式维护选项，保留原prototype守卫；应用没有管理员自动回退。测试维护权限仅用于独立夹具和迁移目标。实际重跑typecheck/build、acceptancejourney、acceptancepermissions、migration、databaseauth均退出0；原tests/integration.test.ts共14个TAP测试通过，原始输出仅在本会话exec session 8546，不伪称另存完整raw log。没有在本轮重跑旧完整34组，33页面组合/20权限断言/44存储断言不能相加当同一粒度用例。最初普通沙箱构建因已有生成文件EPERM失败，正常权限重跑通过；首次health探测早于监听就绪，后续等待ready成功，失败原始证据保留。Vite原有脚本/chunk提示保留，构建退出0。

更新README、部署/API/迁移计划及人工结果/查询入口，新增delivery-verification、authorization-deployment、real-migration-verification和完整证据索引。公开文本/构建产物扫描未含实际私有密码或key；Git忽略范围核对通过。最终结论限本机单节点、已执行页面与权限/存储核对，不宣称公网、多节点故障或第二设备通过。Word及课程平台提交由用户完成。

证据：[本轮索引](../testing/phase2-runs/delivery-20261025/README.md)、[机器汇总](../testing/phase2-runs/delivery-20261025/summary.json)、[报告引用事实](../phase2/delivery-verification.md)、[真实迁移](../phase2/real-migration-verification.md)、[认证部署](../phase2/authorization-deployment.md)。本日志原字节前缀保留并追加本条。


## 报告正文、Mermaid配图与报告审阅补记（2026-10-26整理）

本条为事后补记，依据本会话中收尾部署之后至本次日志整理之前的实际用户消息和工具输出。各次消息的独立时间未逐条核实，不将整理日期冒充全部原任务日期。此前“Word报告自行写”的记录保留当时范围；用户后续明确要求“模仿第一阶段的报告的语言风格，然后帮我输出第二阶段报告的文字部分内容”，由此新增报告文字辅助范围。

AI使用Codex、PDF/documents/icarus-figures技能、PowerShell、捆绑Python及ZIP/XML提取、图片查看、只读源码核对。只读查阅Mermaid官方ER语法。AI阅读一期PDF并提取、查看其页面，讨论二期报告组织，生成正文初稿和后续改写；按用户要求生成架构图和ER图Mermaid代码，压缩表格，并在反馈行数限制后缩短图代码。文字及代码主要在会话中给出，未另存完整往返或每轮独立稿，不将本条摘要称作完整对话导出，也未确认缩短版已在用户图编辑器通过。

用户的实际参与包括提供一期报告和当前Word，选择重新组织完整报告，要求仿照原语言，提出合并小标题、减少绕口词及否决式论述、具体说明并发控制、扩展个人收获、按段落或序号组织文字等反馈；用户将内容整合排版并保存为PJ1_2.docx。AI据反馈修改建议稿，没有将Word整合或最终定稿记为AI已经完成，也没有代签用户采纳全部建议。

后续用户要求对照教师两份要求审阅当前报告。AI只读提取PJ1_2.docx及两份需求，检查正文、表格和嵌入图片，核对八项需求及修改过程的对应位置，建议补MongoDB与关系模型比较、实际索引、测试/AI记录入口，并指出具体漏字、重复案例及架构图尺寸问题。用户继续要求细化这些建议，AI提供可替换文字与对应章节。原Word及教师文件未修改。

报告渲染工具实际因缺少LibreOffice soffice.exe失败，因此未完成逐页版面检查；这一限制已经告知用户。未以已提取正文或已查看嵌图代替整份Word分页通过。上述报告辅助没有修改应用代码、数据库、原Prompt或旧测试结果，没有生成Word/PDF交付件，没有提交或推送。

对应整理见[提交日志L19](phase2-submission-log.md#p2-l19)、[L20](phase2-submission-log.md#p2-l20)和[提示词来源](phase2-submission-prompts.md)。本条只是追加补记，旧日志字节原样保留。

## 二期AI提交材料整理（2026-10-26）

用户先要求“我们现在来看ai日志的部分”，经只读检查后明确“现在整理第二阶段的提交版日志”。AI检查完整二期日志、一期入口及8份主要执行提示词，原二期30条记录共62处本地链接目标文件存在。发现入口仍主要指一期、报告文字/配图/审阅尚未补记，以及部分转交任务的技术建议需要与用户独立设计区分。

使用Codex、PowerShell、捆绑Python、rg和apply_patch整理材料。新增[二期提交版日志](phase2-submission-log.md)，将原过程及本会话补记归并为20项；新增[提示词来源索引](phase2-submission-prompts.md)，链接8份原件并标注后续短摘与摘要。更新docs/ai/README、项目README及二期阅读入口，区分一期历史、二期提交版和完整过程。各项保留工具、输入、AI产出、人工参与、修改及验证，明确未知模型不猜测、未保存完整往返不补造、测试时点及真实迁移隔离边界。

用户的贡献是授权整理并在前期提出使用规则和审阅反馈；此次文件整理与链接检查由AI完成。没有把转交AI审阅建议写作用户独立提出技术实现，没有把报告修改建议写作已全部采纳。

整理前保存原日志字节和受保护文件摘要，后续检查旧日志前缀、一期日志、Prompt原件、Word/教师文件及源码摘要，逐项核对新材料链接和显式索引。结果见[本轮静态核对](evidence/phase2-submission-check-20261026.json)。本轮仅整理日志与导航，不运行应用业务测试，不访问或修改数据库，不改Word/源码/提示词原件，不提交推送。


## 按第一阶段写法调整二期提交日志（2026-10-26）

用户实际请求：“你可以看下我们第一阶段的ai使用日志的部分，然后根据之前的写法调整一下我们这次的写法”。AI先只读一期submission-log.md的任务索引及前后期条目，再对照刚整理的二期提交版。工具为Codex、PowerShell、捆绑Python和apply_patch，没有使用子代理。

一期特点为每项单列日期及来源，依次列“使用工具、Prompt、Result／得到的代码、是否修改、修改了什么、由谁修改、验证及证据”；Prompt与工具分开，长任务节选并链接原文，验证作简短佐证。AI据此重排二期20项：拆开合并栏目、增加明确是否修改和执行者、索引补原记录来源，保留编号和锚点。结果/代码链接沿用原提交版事实；修改过程和验证文字按已有记录重新组织，未改写提示词原件。

用户指定参照一期写法，AI完成Markdown调整、补充简短原文引用并更新AI入口。未把摘要写成完整原文，报告补记的时间边界、人工与AI分工、真实迁移隔离及各轮测试范围继续保留。修改前保存提交版和完整日志快照，以核对原日志追加前缀；一期提交日志、提示词、报告和业务源码保持不变。

本次仅进行文档格式、链接、引用和受保护文件检查，未运行应用测试、未访问数据库、未修改Word或业务代码，未提交或推送。最终检查见[按一期格式调整核对](evidence/phase2-submission-style-check-20261026.json)。历史完整过程日志保留字节前缀并追加本条。


## 按执行任务和用户原文调整提交版Prompt（2026-10-26）

用户附当前日志截图，实际消息正文：“这种给提示词的不要写进去，然后同时一些比如是我提出来的那种修改意见的部分可以放原文prompt不用摘抄”。AI据此只调整提交材料中的Prompt表达和来源导航，不删除准备任务的原始过程记录。

使用Codex、PowerShell、捆绑Python及apply_patch。提交版保留20项实现、验证和报告任务，去掉其中仅要求生成/转交下一阶段提示词的引文，实际开发项改为链接已保存的执行任务全文。来源栏移除P2-PREP准备编号，保留相应实际设计/实施记录。

用户业务意见和修改反馈改用本会话可核实的完整消息正文，包括正式版本/恢复/复用边界、指定共享和使用查询字段、模板用途、自动化覆盖、人工清单及实际差异、收尾请求、报告文字和术语反馈。原文用词保持，包括口语和笔误；确认回答与完整请求分别标注。原消息附有文件或图片时只引用其消息正文，不将正文称为完整附件导出。未单独保存输入原文的修正任务注明现存过程记录，未虚构完整Prompt。

同步提示词索引和AI入口，Result、实现责任及测试结论继续采用既有记录。原8份执行任务、一期日志、Word和业务代码保持不变，完整二期日志以原字节前缀保留并追加本条。未运行应用测试、访问数据库或提交推送。检查结果见[执行任务与用户原文核对](evidence/phase2-submission-prompt-check-20261026.json)。
