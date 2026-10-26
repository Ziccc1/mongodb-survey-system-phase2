# W06 需求—API—页面—实际测试覆盖

实际结果以[P2-010原始运行目录](../testing/phase2-runs/P2-010/README.md)和[机器汇总](evidence/P2-010-summary.json)为准。表中源码均位于项目根目录；API前缀/api/v1。未把静态样例当真实测试，也不改P2-008/P2-009历史报告。

| 需求/用例 | 实际API与职责 | 页面 | 真实测试及断言 |
| --- | --- | --- | --- |
| T24、T37、T40；S05 | A01—03 / M01，精确版+实际发布者，全链当前授权 | DistributionGrants、TemplatePublisher | templates.test：share不足403，v1→B不含v2/C，自身原创可用；template-lineage：需完整祖先 |
| T25、T36；S10 | M04，模板fence与管理revision分离，新卷/规则/目标映射 | TemplatePreview | templates.test：同key并发一份；双actor同revision均201且revision不变；template-browser：rule/target全重映射 |
| T26、T39 | L08精确本人sourceInstance / I02直接派生v1 | TemplateInstanceFork、来源面板 | templates.test及template-browser：Config原身份；撤权后窄派生/采用/重发，越卷越实例拒绝；通用copy501 |
| T27、T44；S06 | M05/M06/M04、A03共同门闩 | 我的模板、授权页 | template-races：选用与下架/直接/深祖先撤权六种；创建及重新上架与深祖先撤权四种，实际提交次序/DB计数 |
| T28 | M02/M03白名单、失效访客统一不可用 | 广场/固定预览 | templates.test字段扫描、作者/发布者越权统计拒绝；template-browser撤权后D无结构；无答案复制 |
| T35；S09 | createTemplate/adoptTemplate完整历史回执 | 结果未知仅重试原动作 | templates.test禁止当前资源findOne仍原样重放、异body409；提交后标签确认和未提交回滚；browser真实HTTP响应拦截丢失各两次原key |
| T38、T41 | 共享完整lineage服务，固定源版本 | 派生警示/公开授权页 | template-lineage：H/F/Q三义务含自己null，A→B不能供C；编辑/恢复保固定源；W03回归保父边/派生 |
| T42 | original、unrecorded、derived区分 | 公共失败/本人正常维护 | template-lineage：原创通过、unknown409；迁移旧来源基础及自用由既有migration/W03覆盖；不新增声明原创接口 |
| T43 | 来源文档/owner/hash/源对/proof、32/500/BSON门禁 | 通用稳定错误 | template-lineage：缺文档/循环/错源对503，伪造叶owner/hash在获取阶段503，不完整proof503；32/33及500/501；2MiB±1和UUID膨胀回滚 |
| T45；W05兼容 | source-read存量取得事实；本人publication同版统计 | 来源面板、跨卷统计页 | templates.test：撤权后旧草稿首次发布/填/派生、自用重发、本人跨卷answered1；crossstatistics/crossboundaries/crossbrowser原W05回归 |
| 广场分页与隐私 | M02按扫描边界签名cursor，动态资格 | 空页“继续加载模板” | template-lineage：连续5条不可用模板空页仍next、最终找到合格项；跨scope/actor400、撤权后下一页过滤 |
| 独立环境与基线 | API自身实例归属、Schema精确核对/explicit phase2 | baseline入口保留 | schemafoundation、bindingsreceipts、domain、versionsbanks、surveyssharingusage、phase2compatibility、integration、publicationpage、verifyruntime、verifyphase2、phase2startup |

T34仅本轮回归与增量交付完成；真实P1迁移、最终完整报告和人工审查仍属W07。T42的真实旧数据来源修复和维护授权方案没有执行，不把合成来源分支当作真实历史证明。Unknown commit标签是明确标记的故障钩子；浏览器响应丢失是网络拦截实验；均不等同数据库宕机/选主。
