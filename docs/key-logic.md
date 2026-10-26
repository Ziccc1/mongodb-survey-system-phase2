# 关键逻辑与增量事务设计

更新日期：2026-10-26。第二阶段八项需求及公开模板扩展均已实现并完成对应验证，当前主应用为 `localhost:27019/rs0` 的十三集合 `project2_app_v2`，通过 `:phase2` 命令启动；`project2_app_v1`仅保留四集合兼容基线。题目、题库、共享、固定引用、使用查询、跨问卷统计和模板均已接入API及页面。

2026-10-25已完成界面收尾、真实第一阶段数据的隔离恢复升级及当前本机数据库认证部署；应用使用受限账号，20项权限检查通过。真实迁移结果保存在独立目标库，当前网站继续使用第二阶段验收数据。S04/S05/S06均已确认实施。见[最终交付核对](phase2/delivery-verification.md)、[认证部署](phase2/authorization-deployment.md)和[真实迁移验证](phase2/real-migration-verification.md)。完整34组自动验收对应10月24日，收尾后的定向复测对应10月25日；原提示词、冻结材料及执行证据保留其历史日期。

当前代码：`LibraryService`处理版本/题库/共享与实际accessFence；`SurveySourcesService`处理正式化/选版/替换/Q05及发布，复用原完整回执执行器；`QuestionUsageService`按同session先筛版本再分组；`source-read.ts`核持久来源。旧owner内部组合也实施S04。来源覆盖当前为课程规模全量扫描，不宣称生产吞吐。故障标签/响应丢失是明示钩子；真实事务commit/rollback/屏障有本轮证据，未执行真实断网/选主。

## 1 第一阶段已实现且继续保留

questions.ts/answers.ts使用稳定实例、选项、规则ID；单选eq、多选containsAny/All、数字比较，规则顺序首条命中、只向后跳，无命中下一题。后端重算路径，不信任visitedQuestionIds；先拒绝未知题、重复答案、非法类型/选项，再校验路径上的必答、数量、Unicode码点长度、精确十进制范围和整数。合法形状的失效分支答案清理，未答不入库，数字0有效。

survey-editing.ts以owner+revision保存编辑区；普通保存不发布，已发布须先暂停。publication.ts通过事务插不可变快照、切指针、重置当前计数而保留累计。submission.ts先找当前账号的成功key，使用其旧快照及hashVersion2重放；新提交才检查状态、服务器截止、当前发布号和整卷重复策略。答卷及两个计数同事务。匿名/重复策略首次发布冻结，closed终态。

reporting.ts已经用只读事务按问卷及发布号查询，保留零次选项、null均值、原文分页和匿名白名单。旧接口不自动跨卷合并。浏览预览/模拟填写均不新增答卷或计数。[第一阶段测试](testing/submission-test-cases.md)保留原日期；对应原功能已在第二阶段完整自动验收及十三集合兼容测试中回归，见[完整验收](testing/phase2-automated-acceptance.md)。

## 2 内容与实例适配

Content剥离id/required/jumpRules；materialize(content,config,instanceId)生成旧扁平Question，DecimalString↔Decimal128继续经过question-codec。规则阈值属于Config也用Decimal128。选项ID属于正式内容，同一正式版进入其他卷不能重生选项ID；实例ID、规则ID属于新问卷，模板选用重生并映射targetQuestionId。

客户端只传正式versionId及配置；后端读正式版、核取得权并计算contentHash，拒绝自填origin、grantId、sourceQuestionId或“同versionId不同题干”。保存和发布分别复核物化内容去配置后与正式版相同。配置修改不派生，内容修改走作者新正式版或接收者派生。

Q05继续普通保存未正式化本地题。用户显式保存正式题版本时调用P2-I04原子正式化，或独立题目L04；publish只检查绑定齐备，不隐式建题版。新UI明确列出哪些题还没保存正式版，不能点普通保存就产生历史。

## 3 正式版本、恢复与派生

正式保存事务先按actor+operation+resource+key查回执，同hash重放原结果；否则核item revision及draft revision，取任意同题draft.baseVersionId，分配nextVersion，插不可变question_versions，更新latest/nextVersion/item revision并写回执。保留草稿内容、base改新正式版、draft revision+1；正式版不受后续草稿修改影响。并发不同key过期修订返回409，不自动把新草稿发布。

所有新增幂等写按操作保存完整有限成功DTO，而非只存三个资源字段。instanceSave分支必须记录原revision、draftDefinitionRevision、自动instanceId、questionVersionId和完整validationIssues。与业务同事务生成、校验大小和保存；提交后的首次响应也使用该DTO。resultVersion负责历史编解码；重放只取回执加replayed=true，不从当前问卷/绑定重算。原成功后实例换版/删除、管理修订变化、共享撤销或模板下架也不改原回执；响应里的旧修订/问题是历史事实，前端另GET当前状态。损坏回执503 OPERATION_RECEIPT_UNAVAILABLE，超大小在提交前422 RECEIPT_TOO_LARGE整体回滚；不补造、不截断、不重做。字段与上限见[数据库回执字典](database-design.md#8-通用幂等事实)。

恢复明确旧sourceVersionId，取其内容新建正式号，parentVersionId和restoredFromVersionId都指所选旧版，operation=restore。恢复不覆盖当前未正式草稿，界面提示可选择将恢复版作为草稿基线。v1→v2→v3恢复v1得到v4，v2/v3保留；图按parent边画，版本号不证明来源。

派生事务核正式源和当前新增权，创建自己身份及v1，origin记跨题源、v1.parent=null；操作明确“派生并保存正式v1”。撤销share后通用fork禁止；模板生成实例有窄版本派生权，必须sourceInstance且后端核该实例归属/绑定，不变成任意问卷新增权。派生不参与原题统计。派生身份与每个正式版的distributionSource固定精确源版；后续save/restore保持来源，二次fork保留链。自用权与公开权分开，公开失败不阻正常编辑、自用或本人统计。

## 4 撤销与新增使用的并发

不能只find(grant active)再写另一集合。attach/fork、share变更、模板发布/选用及分发权撤销，在同事务对涉及question_items按OID排序执行accessFence实际$inc，再同session核grant状态和revision。撤销也写同门闩，因此发生写冲突/重读，防止write skew。模板公开创建/上架/选用先从不可变版本预计算来源锁集合，已有模板先取模板门闩，再对全体叶及上游题OID去重有序加门闩，同session重读链/证明/当前授权；遗漏或变化须中止重算，不能半程追加乱序锁。源作者撤销其题授权写同上游门闩。新增先提交为应保留存量；撤销先提交则新增重读拒绝。重试key不变、次数有界，callback无外部副作用；结果未知503原key确认。

存量只复用同surveyId+instanceId+questionVersionId+acquisitionId已保存draft绑定及当前问卷owner；允许原版配置维护和发布，不要求grant active。不能复制到别卷、加第二实例、换后续版、删除后再添或新派生。历史publication绑定只解释历史，不兑换新使用权。成功key重放只回原完整成功DTO，不再创建对象或授权。

## 5 替换与发布

owner、draft/paused、expectedRevision正确后替换，保留实例ID、题序、必答和规则。选项变化失效返回validationIssues，阻正式发布。题型变化导致旧规则形状不能进入当前严格QuestionSchema时，先422 RULE_REVIEW_REQUIRED列问题，要求用户显式提交修正规则后再替换，不能默默删除或保存半份。API补充定义reviewedJumpRules。由自己派生新题替换原实例须源匹配，任意不相干身份不能伪称版本替换。

publish同事务核全部绑定及Content、Config、策略、体积，插snapshot+所有publication绑定、bindingHash，CAS切指针/计数。只采用已有题版，不再插question_versions；share撤销不阻存量draft原版发布。定义修订在固定来源改变时也递增；loadEditor比较内容/策略及绑定元组，不能仅凭扁平题内容相同报告无未发布改动。definitionHash沿用P1算法，bindingHash单独核来源；旧格式1快照和旧答卷完全不写。

## 6 使用情况与模板

usage先按questionId及可选versionId过滤，再group(surveyId,questionVersionId)计算版本isDraft/isCurrent/hasHistorical；历史必须是非当前发布快照。同版去重，按version降序/ID升序；再group surveyId，问卷draft/current取版本OR，onlyHistorical=无draft且无current且有历史。无匹配不输出空行；过滤v1不得混入v2草稿。多历史快照不算多问卷；本人可标题/入口，他人仅用户名、稳定usageNumber编号（不能反推出分享publicId）、题版和状态，不能复用Editor DTO。派生从items.origin单列，不计直接引用。每页重验权限。

模板创建只读明确发布快照，不从草稿或客户端Content生成。无受限来源的原创题对作者可公开；自己的派生题也要沿distributionSource逐层核验所有上游。每个非实际publisher作者的具体源版都须有给该publisher的当前template_grant；定向share或模板实例窄权不能替代。中间作者只授自身层权，不转授上游。固定distributionProof含全链义务和lineageHash；实时核当前state，历史grantRevision只作审计。M01/M06/M04及M02/M03资格计算均用同一全链规则，未知、缺失、循环、伪造不放行；错误/修复/容量见数据库第7节。模板内容不变，status独立；更新创建新模板ID、需时下架旧模板，不覆盖已选用问卷。

选用先查原成功回执，再以模板_id、status=listed、revision=expectedTemplateRevision为条件实际$inc模板accessFence，随后按全部叶/上游题OID全局去重有序写accessFence并核每层当前分发权。普通选用不改变模板管理revision/updatedAt/内容摘要，也不把旧accessFence当请求前提。产生新survey/publicId、instanceMap和ruleMap；选项ID不变，规则ID及targetQuestionId重建。策略默认匿名/重复false、截止null、计数0、发布指针null、originTemplate固定，取得权kind=template且仅固定题版。不复制答卷、统计、填写者、源owner或密钥。完整TemplateAdoption回执与新草稿同事务保存；S06已确认撤销/下架只阻未来选用，已生成实例仍正常填写。

真实上下架写同模板accessFence并使管理revision+1，保证与选用互斥的接受边界；已有相同目标状态且修订匹配的空操作不增号。两用户均持revision=0、不同key选用，只会竞争内部门闩；可重试写冲突在新事务重读后管理revision仍0，应分别创建独立草稿。临时冲突重试耗尽503 OPERATION_RETRY_LATER，结果未知用OPERATION_OUTCOME_UNKNOWN；不能因别人选用过就返回管理EDIT_CONFLICT。真实下架/上下架往返使revision变化或授权被撤销时，仍拒绝相应旧请求。重复原key不再写门闩或再建草稿。

## 7 跨问卷统计

R1/R2复审修正：目标owner/当前share或本人精确题版publication事实先构成权限门禁，无权404先于正式版/题型/边界/历史细节；只有授权后才作完整性扫描，相关坏历史继续503。页面从已授权summary的average分支为固定题版保留数值类型证据，撤权或模板窄权时不依赖源历史列表，也不开放其他版。见[修正证据](phase2/reviews/W05-W06-R1-R2-fix-2026-10-24.md)。

1. 登录后先取本人surveys；显式surveyIds每个都须归本人，不因题作者身份扩展范围。按questionId+versionId取publication绑定，不取draft；题内容可来自本人已有窄权实例，不能因此读其他题版。
2. 校验binding.snapshotHash、ContentHash、owner、实例和正式题版一致；缺失/重复映射或损坏503 QUESTION_MAPPING_INCOMPLETE，不少算后宣称完整。
3. 唯一(surveyId,publicationVersion,instanceId)关联答卷原发布号和答案实例，先按(response._id,instanceId)去重再聚合，防止同卷多个发布快照join相乘。主动重复不同response分别计，幂等重放无新增文档只算一次。
4. eligibleResponseCount是范围内含该题版的答卷数；以对应快照及原答案重算路径，未到达为skipped，到达可选未答为unanswered，非空有效为answered；eligible=answered+skipped+unanswered。分母answered，跳过/未答不补0；非法历史报错不能当空。
5. single补齐0选项；multiple每份每选项一次、合计可超100%；text计数及X02原文分页；number含0、精确均值/最小最大、X03数值频数分页、X01固定区间含欠界超界桶。无数据计数0、均值null、原文空、百分比null。都不是去重人数。
6. 汇总短snapshot session；原文/频数第一页取实际atClusterTime，后页新session固定同Timestamp，scope绑定规范排序筛选hash，每页重验当前owner。5分钟到期或SnapshotTooOld返回409重开。容量/底层命令/零写入证据见W05说明。

[手算样例](phase2/implementation-test-plan.md)：A发布1、2与B发布1共同Q/v1，0/10/20/30均值15；派生C、其他题版、他人问卷排除。仅设计数据，不是查询结果。

## 8 兼容边界

旧(surveyId,instanceId)保守建身份，不能跨卷同文字自动合并；不可证明来源parent=null、legacyImport留证。不改旧快照hash和答卷幂等事实。旁路映射是来源事实，不能当可丢弃缓存。[升级计划](phase2/data-migration-plan.md)定义重跑/中断/恢复。验证器不保证跨集合权限或不可变性；必须共同冲突点及同session，[MongoDB事务考虑](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/)为机制依据。真实旧数据已在两个独立目标完成升级、重跑及应用启动验证，当前本机已启用认证和受限角色；分别见[迁移](phase2/real-migration-verification.md)与[认证](phase2/authorization-deployment.md)。


## 操作回执与业务事务顺序

固定解析+可信认证→只查成功回执→无回执才事务内再查→业务owner/状态/CAS与绑定→完整DTO及大小守卫→同session插回执→commit。同key历史重放不进入当前资源读取；驱动Transient重开事务、Unknown只重试commit并核原key，应用层次数有限。当前执行器已接入题目、题库、引用换版和模板等新增业务，动态共享与公开授权在同事务内复查。迁移通过独立工具按问卷事务执行并核对完成事实。基础回滚证据见[W02-B](phase2/bindings-receipts-foundation.md)，后续共享及模板并发验证见[W02—W04](phase2/w02-w04-implementation.md)和[模板实现](phase2/template-square.md)，不将受控异常等同真实网络故障或主节点切换。
