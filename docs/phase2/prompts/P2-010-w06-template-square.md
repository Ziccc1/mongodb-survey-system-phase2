# P2-010 / W06 公开模板广场和完整来源授权执行 Prompt

请在 `D:\大三\数据库\pj1_2` 现有W02—W04（若W05已完成，也必须保留W05）基础上，实际完成W06：公开分发授权、不可变模板、广场/预览/上下架、选用生成本人新问卷、来源窄权派生，以及API/页面/真实测试/文档和AI日志。不止交设计或静态页面。

## 1. 已确认业务、范围与必读文件

用户已在2026-10-23经详细解释后明确回复“两条都采用”，确认：

- S05：公开授权限定“具体题目正式版本＋指定模板发布者账号”，不含未来版、不可转授。无受限来源的原创作者仅自身层隐式可公开；派生作者不能代替上游授权。
- S06：撤销公开分发授权立即阻止该模板的未来新选用，已生成问卷继续保留维护/发布/填写及历史；不会删除旧答卷。下架也只影响未来选用。

不再重复询问这两条。S04已确认单卷同题同版最多一个实例。广场只提供可复用模板结构，不是他人统计/答案展示，也不是公开招募填写入口。指定用户共享不等于公开分发授权。

先检查适用AGENTS、Git现状和其他窗口更改；读：requirements-decisions、database-design第7/8节及事务、api中A01—A03/M01—M06/L08和DTO、key-logic/system-design、P2-004来源修正、schema/bindings/w02-w04实施说明、W05最新说明（若有）、implementation-test-plan的T24—T28/T37—T45、design-fixtures与机器契约。

读现有library/survey-sources/source-read/binding-integrity/phase2-context/operation-contract/receipt-codec/guards/models/schema、API/query/405门禁、前端题目/共享/编辑/重试状态、迁移unrecorded来源规则、P2-008和W05最新测试证据。复用十三集合与现有完整回执，不另建不一致授权模型。

更新S05/S06当前暂定表述为已确认，历史Prompt/日志保留当时状态。使用现有project2_app_v2、27019/rs0和W01身份保护；保留app_v1基线。所有写fixture在新唯一测试库，不写P1/27018、不给现有应用插演示样例、不清库、不提交推送、不升级栈、不做W07真实迁移/最终Word/PDF。若W05审阅修正尚未落地，先修复其两项前端状态问题及测试，不能在模板选用中复制未知请求串动作的问题。

## 2. 公开授权与不可变来源链

实现A01—A03，严格本题owner、精确源版所属、注册用户名和item/grant修订；一条grant只控制该作者该版本给该publisher，不能替上游签字。沿用同grantId撤销/重授并递增revision；应用写共同item accessFence，读写同session。

实现一个共享的完整来源核验服务，供创建、重新上架、新选用、广场eligible和预览调用，避免某条路只查叶节点。

- 从所用正式版沿distributionSource固定源版本逐层走到original；每步核文档存在、题/版所属、owner=createdBy、Content摘要、item.origin与正式版来源一致。
- 叶→根的每个非实际template.publisher作者节点，都需精确(questionVersionId,publisherId)且grantedBy正确的当前active template_grant。自身仅免自身层，不免祖先。
- A/Qv1→B/Fv1→C/Hv1：C公开H须A对Qv1→C和B对Fv1→C；A→B不能抵用。修改F产生Fv2、恢复旧版或再次派生都保留固定源义务，不追Q最新，也不能以改了少量文字清除来源。
- unrecorded不自动当原创，正常自用不受影响，公开409 DISTRIBUTION_PROVENANCE_UNVERIFIED；缺失/循环/源对错误/hash/证明不符503 DISTRIBUTION_LINEAGE_INVALID；缺授权403 PUBLIC_DISTRIBUTION_REQUIRED。访客统一不可用，不暴露祖先详情/内部reason。
- 每链最多32节点、全模板并集最多500题版本节点，超限422，不截链后放行。检查真实BSON大小和现有2MiB模板上限。
- DistributionProof严格保存lineageHash和完整有序obligations，含自己层；grantId/revision自己层null、外部层非null。lineageHash按主契约固定节点数组含contentHash/distributionSource规范计算，OID文本化；模板contentHash覆盖完整proof。旧Content/definitionHash/bindingHash/payloadHash不改变。
- 证明固定不等于授权永远有效。每次公开操作核当前grant身份和state；历史grantRevision仅审计，不要求等于当前revision。重新授权后可以重新合格，不重写旧模板内容/hash。
- 不开放普通业务“声明原创”或改旧distributionSource的后门；来源修复仍走维护证据/替代身份审阅方案，不能通过删除旧链或原样派生洗掉限制。

## 3. 模板生命周期与广场

实现M01—M06及完整DTO/权限/错误：

- 创建仅由源问卷owner选择明确publishedVersion，取不可变发布定义及完整publication绑定，不取当前草稿、不信客户端questions/proof。源问卷有更新/暂停/关闭不回写模板，也不控制模板上架状态。
- 模板保存固定title/description/questions/bindings/proof/contentHash，后续只允许受控状态/管理修订/fence变化；更新结构应创建新模板ID，必要时下架旧模板，不能覆盖已被使用内容。
- square为登录用户可用模板；仅listed且当前完整来源授权有效。mine可见本人不可用摘要，原因仅管理者受控显示。预览不含答案、统计、填写者、源问卷内部ID/链接、内部grant/proof/evidence或其他未授权题版。
- eligible实时计算，不能依赖异步下架或缓存active状态。筛选后游标按扫描边界继续前进；空页但有nextCursor不得误作末页，不能先limit再过滤后把后续合格模板永久漏掉。
- 下架不要求来源授权仍有效；重新上架须完整复核。状态空操作且revision匹配不增管理修订，状态实际变化才revision/updatedAt相应更新。

## 4. 选用、窄权与发布兼容

M04只对listed且当前全链授权有效模板执行。生成自己的新survey/publicId/usageNumber，格式3、独立draft、计数0/发布指针null；默认匿名/重复false、截止null，title可按合同覆盖。originTemplate保存固定模板ID/hash/取得时间。

- 不复制答案、统计、填写者、旧owner、旧策略/截止、密码或密钥。全量新实例ID和规则ID映射，targetQuestionId随实例映射，选项ID保持正式版原值；跨题跳转不丢失。
- 未改Content仍绑定原题身份及明确版，authorization为模板窄权，仅模板所含版和本次生成实例；不给整个题库/其他历史/未来版读取或任意新问卷attach权。
- 仅改Config不派生；改Content需显式生成自己的派生身份/v1，L08 sourceInstance必须归本人且确由该模板生成并绑定所请求源版。保留完整distributionSource；不能借一个模板versionId在任意实例或其他问卷派生。
- 将此前故意拒绝模板sourceInstance的占位分支替换为严格核验；不要全面开放任意sourceInstance。
- 下架/撤权后既有生成实例仍可配置维护、首次发布/重发、填写，历史保留；其既有模板实例的窄权派生按已确认主契约执行，不重新要求整题share。新选用被拒。
- 成功旧key先重放完整TemplateAdoption历史data，不再创建问卷/写fence；即使当前模板下架、授权撤销或新问卷后来变更，原成功结果可确认。createTemplate/adoptTemplate两个剩余operation必须完成真实业务同事务回执，不只codec测试。

## 5. 共同门闩和修订：必须真实处理竞态

按主契约：已有模板先模板fence，再所有叶/上游题OID全局去重有序fence；新建模板无已有模板锁。先只读不可变版预计算锁集合，取得全部锁后同session重新完整核链/hash/授权；发现新增未锁节点中止重算，不能半程追加乱序锁。

- 普通选用按_id+listed+expectedTemplateRevision实际$inc accessFence，不把fence当前值作为CAS前提，不增加管理revision或updatedAt。两用户同revision、不同key选用可以分别成功，物理写冲突重试不能误报管理EDIT_CONFLICT。
- 真上下架同事务写模板fence及revision，确保和选用有共同冲突点；授权撤销写其所控源题同fence，不用反向乱序锁模板。上游撤权也必须阻未来选用，不能只锁叶题。
- snapshot/majority/primary，同session，业务/模板/绑定/问卷/回执一起提交或回滚；回调无外部副作用。沿现有有界Transient重开/Unknown commit确认策略，key不变，不能捕获所有异常无事务重做。
- 尺寸/来源/授权/CAS失败不能留下半份模板、问卷或回执。公开证据中的grantRevision变化不能被当作修改模板内容的理由。

## 6. 前端、HTTP和实际验收

沿现有样式增加“模板广场/我的模板”、固定预览、选用生成草稿、源问卷选发布版发布模板、上下架管理、题作者给指定发布者的具体版本公开授权/撤销。明确区分私人共享与公开分发，说明派生仍可能有来源义务，避免误导为修改就能公开。

所有按钮调用真实API，刷新/直接导航正常；未知操作只能重试原动作，不把旧结果当新操作。非本人模板不见管理动作；撤权不可用项不泄露结构或内部原因。注册query/405/strict请求/认证/CSRF/限流/DTO，不放宽原门禁。W05已存在则新模板生成问卷的合法回答可纳入本人同版统计，模板作者不能读接收者统计。

至少实测T24—T28、T37—T45及新增边界：

1. 本人原创正常公开；只有share无公开授权拒绝；授权v1给B不含v2或C；修改/恢复/多次派生不清祖先，A给B不能抵C。
2. 完整链/固定proof/hash；未知源、缺文档、循环、伪造owner/源对、缺祖先grant、链32及并集500边界、BSON容量均准确拒绝且零残留。
3. 真授权→模板创建→预览→C选用，固定版绑定、实例/规则/目标映射、选项ID、默认策略、独立链接和原模板不变；同key并发一份问卷/回执。
4. 两账号同管理revision不同key并发选用均成功，revision不变、fence变；真实上下架使旧revision失效；同目标空操作不增revision。
5. 可控屏障交错：新选用与下架、直接源撤权、深层祖先撤权；两种提交顺序均核DB结果。撤销先提交不能新增；选用先提交成为存量，不仅Promise.all碰运气。
6. 下架/撤权阻新选用，已有草稿可维护/发布/填写/窄权派生；源问卷暂停/关闭不控制模板；重新授权沿同grantId后合格，不因历史grantRevision不同永远拒绝。
7. 来源窄权只用于本人模板生成实例；其他卷/实例/其他版、任意sourceInstance、普通copy绕过均拒绝；改Content自己派生、仅Config身份不变。
8. 广场分页夹杂大量不可用项，空页nextCursor正确；当前权限逐页复验，跨scope/actor cursor拒绝；summary/preview/失败响应字段扫描无答案统计/源内部信息。
9. createTemplate/adoptTemplate真实历史回执、下架/撤权后重放、未知提交/容量/中途故障全回滚；输入正文/路径/hash不同冲突。
10. 浏览器A授权B→B发布固定模板→C广场预览/选用/配置发布填写→A撤权→D不能新选用而C仍可填写；再验证C修改后公开仍需上游授权。配合真实HTTP/DB断言，截图不代替权限证明。

使用新唯一P2测试库；typecheck/build、领域/错误/冷导入、受影响W03/W04/W05、Schema/事务、十三集合原功能及W06新增API/竞态/浏览器验收。保留失败，mock标签与真实网络故障分别标注；不改两个应用库业务数据来凑测试。

新增 `docs/phase2/template-square.md` 和需求—API—页面—测试覆盖表，说明第一阶段→W04→W06的实际增量；同步主契约/机器API/索引精确核验/角色权限模板/启动入口和当前状态。角色未认证强制的事实不伪装为部署验收。P2-010证据保存命令/时间/退出码/合成库/并发顺序/失败原件，AI日志追加保留前缀。

最终回复列实际文件、API/页面、启动操作、来源链/授权/并发和窄权的精确结果、测试退出码及限制。仅据真实结果判W06完成；W07真实P1迁移、角色强制部署和最终完整报告仍未完成，不自动执行。
