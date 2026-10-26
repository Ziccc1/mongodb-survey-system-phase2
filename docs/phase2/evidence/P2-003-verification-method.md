# P2-003静态核对方法与范围

本轮只修正文档与静态设计数据，未执行HTTP请求、业务测试或真实并发事务，未连接数据库/安装依赖/启动服务。以下核对用捆绑Python标准库与Git只读命令完成；结果保存为[P2-003-static-check.json](P2-003-static-check.json)。

1. [修改前摘要](P2-003-before.json)覆盖本轮可见405份普通工程材料；按摘要逐个检查未授权文件没有变化、没有删除、没有范围外新增。phase2-usage-log.md必须以修改前所有原始字节为精确前缀。P2-002旧证据、Prompt、第一阶段冻结原文/manifest、业务源码/配置/测试/锁文件均保持原样。
2. 冻结14份文件继续与指定Git历史原始字节及SHA-256核对；检查`git diff --check`，新增设计Markdown的本地链接/锚点和JSON代码块能解析，机器可读36接口与API逐项示例一致。
3. 对10种新增幂等操作逐项检查operation→result.kind→完整data字段→首次状态/重放状态。校验resultVersion、严格字段白名单、OID字符串、实例结果含全部修订/实例ID/问题列表、结果无replayed且大小有限。三个完整BSON设计文档覆盖resourceReceipt/instanceSave/templateAdoption，非空validationIssues另覆盖自动实例ID。
4. [合成回执与并发序列](P2-003-review-fixtures.json)只做契约数据核对：删除/修改资源后的预期重放严格等于持久化data加replayed=true，检查不需lookup当前资源的预期；同模板两次选用序列期望revision=0/accessFence=2，两份不同key草稿，成功key重放不加门闩。真实写冲突处理尚待T35/T36运行，静态序列不是数据库事务测试。
5. 复算原Content/问卷定义/来源绑定/模板/答卷五种设计样例摘要，确认accessFence不进模板contentHash。确认当前计划36例均未执行，新增T35/T36在[修正覆盖表](P2-003-coverage.json)中有对应需求；原P2-002覆盖表和检查结果不被覆盖。

问题判断来自修改前数据库第8节只存三个资源字段、API的InstanceSaveResult完整字段、关键逻辑的选用递增模板revision与expectedTemplateRevision联用；原文结论及修正见[变更对照](../change-analysis.md#p2-003-用户审阅后的设计修正)。同文档写冲突/实际写锁机制仅参考[MongoDB官方事务说明](https://www.mongodb.com/docs/manual/core/transactions-production-consideration/#in-progress-transactions-and-stale-reads)，不外推为已验证的驱动重试或本地运行结果。
