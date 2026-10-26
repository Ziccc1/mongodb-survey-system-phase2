# W06 公开模板广场与完整来源授权

2026-10-24，执行[P2-010](prompts/P2-010-w06-template-square.md)，在已完成的[W05](cross-survey-statistics.md)上增量实现。S05/S06为用户已确认规则。第一阶段原目录、冻结材料、原Prompt及历轮测试证据保留；未进入W07。

## 实际增量与入口

第一阶段只有私有问卷和公开填写；W04增加题身份、正式版本、私人共享和固定绑定；W05按本人问卷的同题同版本统计。本轮增加A01—A03公开分发授权、M01—M06模板生命周期，以及L08模板实例窄权派生。普通copy仍501，不能当作模板选用。

后端代码：`core/distribution-grants.ts`、`distribution-lineage.ts`、`templates.ts`、`template-routes.ts`；固定结构纯校验在`database/template-integrity.ts`。由phase2-context创建带同一session及写事务门禁的服务；source-read保留模板取得事实，library只为经严格核验的本人模板实例开放窄权派生。shared/template-types提供白名单DTO；baseline不注册新API。

| API | 实际动作 | 页面 |
| --- | --- | --- |
| PUT /api/v1/questions/:questionId/distribution-grants | 题owner给指定注册发布者精确正式版公开权 | 题目页“具体版本公开分发授权” |
| GET 同上 | 作者本人授权分页 | 同上 |
| POST 同上/:grantId/revocation | item/grant CAS及共同题门闩撤权 | 同上 |
| POST /api/v1/templates | 从明确发布版创建不可变结构 | 本人问卷发布页选择“源问卷发布版” |
| GET /api/v1/templates?scope=square\|mine | 实时完整资格与扫描游标 | /templates 可选用/我的模板 |
| GET /api/v1/templates/:templateId | 固定预览，失效访客统一不可用 | /templates/:templateId |
| POST /api/v1/templates/:templateId/adoptions | 原子生成本人新问卷与完整回执 | 固定预览“选用并生成我的草稿” |
| POST 同上/listing、/unlisting | 本人上下架，实际变化增加管理revision | 我的模板 |
| POST /api/v1/question-versions/:versionId/forks | sourceInstance限定本人模板生成实例 | 编辑器“修改并派生自己的题目” |

所有新路由沿用登录、Origin/CSRF、限流、strict body、query白名单/重复参数拒绝、405及稳定错误DTO。模板预览仅含summary、questions和固定来源题版ID，无答案、统计、填写者、源问卷内部ID、grant或proof。非发布者不显示管理动作；我的模板可查看不可用摘要并下架。

## 完整链、证明及撤权语义

每次公开操作从正式版沿固定distributionSource逐层到original，核版/题所属、createdBy=owner、Content摘要及item.origin一致；自己只免自己层，每个其他作者版本都需要给实际publisher的当前active grant。A→B授权不能供C使用。unrecorded为409 DISTRIBUTION_PROVENANCE_UNVERIFIED；缺版、循环、源对/owner/hash/证明损坏为503；缺授权403。列表过滤失效项，非发布者预览统一409 TEMPLATE_UNAVAILABLE，不泄露祖先原因。

固定DistributionProof按叶→根包含全部节点，含自身层；自身grantId/revision均null，外部层非null。lineageHash为数据库主契约规定的完整节点数组canonical摘要，模板contentHash覆盖完整proof。新建、上架、选用、广场eligible、预览共用该核验服务。历史grantRevision仅审计；撤销/重授同grantId递增revision后，旧模板可重新合格，无需重写内容/hash。

上限为单链32、模板去重版本并集500、实际BSON 2097152字节；完整遍历，超限422，绝不截链。选用重生成UUID后再次检查新问卷BSON，避免原模板刚好合格而新问卷膨胀超限。既有Content/definitionHash/bindingHash/payloadHash算法未改。

## 门闩、回执与独立新问卷

已有模板操作先实际写模板accessFence，再只读预计算全部叶/祖先题集合，按OID全局去重排序实际写所有题accessFence，然后在同session重新核全链/hash/当前授权。发现未锁节点中止，不能乱序追加。新建模板没有已有模板锁。撤权只写其控制的题门闩，不反向锁模板。

普通选用按_id+listed+expectedTemplateRevision实际$inc accessFence，不将旧fence当CAS，不改变管理revision/updatedAt/hash。真正上下架写共同模板门闩并增管理revision；同目标且修订匹配不增管理revision。交易采用snapshot/majority/primary，业务/模板/新卷/绑定/回执同事务提交或回滚。沿用有界Transient重开与Unknown commit确认，不换key、不无事务重做。

createTemplate/adoptTemplate补全两类真实业务回执。首次成功保存有限完整data；旧key先只读原回执，即使下架、撤权、新问卷后来变化，也返回原成功DTO且不写门闩。异正文/path/hash冲突。测试用禁止当前资源读取的隔离断言证明未从当前问卷拼接历史结果。

新卷schemaVersion3，独立surveyId/publicId/usageNumber；新实例ID、规则ID和目标映射，选项ID保留；默认匿名/重复false、截止null、计数0、发布指针null。originTemplate固定ID/hash/取得时间。未改Content保留原身份和版，authorization.kind=template仅授本次实例维护，不扩成整题历史/未来版读取或任意新attach。

只改Config保持原身份。Content需显式L08 sourceInstance创建本人新题/v1，再明确采用直接派生首版；来源义务保留。sourceInstance必须指向本人、确由模板生成且仍绑定所请求版的已保存实例，不能凭任意模板versionId伪造。下架/撤权后旧草稿仍可配置、首次发布/重发、填写、窄权派生；公开派生题仍检查全部祖先授权。源卷暂停/关闭不控制模板。W05可统计本人模板生成问卷的合法回答，题作者/模板发布者不能读接收者统计。

## 页面与未知结果

新增TemplateSquarePage、TemplatePreviewPage、TemplatePublisher、DistributionGrants和TemplateInstanceFork，沿用现有Vue组件与样式。固定预览显示原题序与跳转，选用生成草稿后明确配置和发布。窄权派生拆为“保存本人正式v1”与“采用首版”，保持原实例及Config。

useOperation固定原path/body/key。创建/选用结果未知时只允许确认原动作，锁发布版/标题及其他管理动作；派生未知时锁其他编辑和发布。真实浏览器以route.fetch使请求完成提交后abort响应，再用原key确认；这是浏览器拦截造成的真实HTTP响应丢失，未冒称Mongo宕机。另有明确标记的合成UnknownTransactionCommitResult标签，验证已提交原回执确认及未提交整体回滚。

## 真实验收与证据

[覆盖表](template-square-coverage.md) · [全部命令/原失败/退出码](../testing/phase2-runs/P2-010/README.md) · [机器汇总](evidence/P2-010-summary.json) · [静态保护](evidence/P2-010-static-check.json)。所有业务fixture均在新唯一project2_test_*，没有给两个应用库插样例。

- 精确版/指定发布者、自身原创隐式、私人share不足、多作者H/F/Q完整证明，修改/恢复/二次派生不洗来源；动态eligible、过滤空页nextCursor、跨actor/scope和逐页撤权复验。
- 32/33链、500/501并集、未知源/缺版/循环/源对/owner/hash/不完整证明。大规模图为明确合成存储夹具，经真实strict验证器插入，再走真实HTTP发布/模板操作，不声称数百次UI操作。
- 模板BSON恰好2097152可创建，2097153拒绝；规则/目标UUID膨胀后的新问卷超限同样拒绝，指纹证明无模板/新卷/绑定/回执残留。
- 同key并发一份新卷和回执；不同账号同管理修订不同key均成功，管理revision/updatedAt/hash不变。受控屏障核十种提交顺序：选用对下架/直接撤权/深祖先撤权各两种，创建及重新上架对深祖先撤权各两种。先停分发则零新增，先分发则成为存量。
- 四账号真实Edge：A给B授权→B选择发布v2创建固定模板→C广场预览/选用/配置/发布/填写→A撤权→D不可新选用而旧卷仍收回答→C窄权派生采用/重发、公开仍403→A原grant重授→B上下架→D重新可预览。创建与选用均实际丢失响应后同key确认。320/768/1024/1440截图、键盘Tab、页面无异常及HTTP/DB断言保留。
- typecheck/build、领域与错误/冷导入、13集合Schema、事务回执、W03/W04、W05 API/快照边界/浏览器、十三集合等价、baseline集成/发布页面及编译API/Vite真实启动探针均保留独立结果。

## 运行及边界

使用既有锁定依赖，在项目根目录运行`npm.cmd run db:start`、`npm.cmd run db:verify:phase2`；两个终端分别`npm.cmd run dev:api:phase2`和`npm.cmd run dev:web:phase2`，访问http://localhost:5200。首次环境才显式configure/init，已有环境不用重复初始化。编译后`npm.cmd run build`和`npm.cmd run start:phase2`；实际Origin/公开URL设置见[部署说明](../deployment.md)。默认baseline入口及app_v1四集合保持；两模式不能同时占用3200/5200。验收启动前后核监听PID，临时应用进程结束释放，专属Mongo保留。

十三集合及索引复用W02可执行Schema，无新增集合或DDL。模板查询使用ix_template_square/ix_template_owner；精确授权用uq_distribution，作者分页用ix_author_distribution；来源版按_id查，门闩按item._id查。精确验证器和索引由verifyphase2核验。角色模板新增survey_templates/template_grants的find/insert/update，无remove；内容不可变仍由应用仓储边界约束，Mongo角色不能按字段限制。未创建角色、未启用认证，不冒称强制部署验收。

原构建app-config与图表chunk警告保留。未做多节点高可用或真实数据库故障切换。W07真实P1迁移、角色强制部署、最终Word/PDF及人工最终审查仍未完成；本轮未安装依赖、改锁、清库或提交推送。
