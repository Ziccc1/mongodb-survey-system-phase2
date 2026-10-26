# P2-002静态核对方法

使用捆绑Python标准库，所有检查只读取项目普通文件/Git对象，输出限定本目录。未import业务模块、未读取.env、未连接MongoDB或执行npm/test/build。

1. 对baseline/phase1/manifest.json的14条记录，逐项git show指定commit:path取bytes，与归档bytes、manifest SHA-256和长度比较。检查源码快照后缀.txt，非执行入口。
2. 对写文档前保存的P2-002-before.json摘要核对现在文件；只允许README和设计Markdown、第二阶段AI追加与本轮静态证据/设计数据/归档变化。特别核对apps/packages/scripts/tests/database/配置/锁文件以及旧日志/旧测试/原Word/PDF/图表不变。原phase2日志旧内容必须是当前文件精确前缀，Prompt字节/hash不变。原project1本轮没有写操作或数据库访问；未对原目录进行全量审计，不声称核验其当前数据库内容。
3. 解析新/修改Markdown的本地链接（忽略代码块中的示例链接），URL解码后按文档目录解析文件，核对目标存在及本轮文档/原API的显式锚点和标题锚点。冻结原文相对链接不改字节，归档覆盖外目标在baseline/link-map.json说明；它们单列不当当前导航全部可达。
4. 解析设计JSON及新文档JSON代码块，检查13集合样例完整字段白名单、EJSON标识/数值/hash基本形状、正式ContentHash/definitionHash/bindingHash/templateHash和答卷payloadHash重算；检查36新增端点编号/方法路径唯一、每项权限/query/body/结果/幂等/错误/示例齐备且出现在API主文档。
5. 检查P2-R01—R08与扩展P2-X01分开，A—H已确认、S04—S06暂定、34计划用例均列前提/步骤输入/预期/将来证据且统一未执行；覆盖映射保存为coverage.json。
6. 从合成design-fixtures.json用Decimal手算复核本人同题同版来源，校验均值15、5份范围/4份回答/1跳过、两问卷、频数和区间。不是执行数据库聚合或业务测试。

检查脚本的实际结果保存在P2-002-static-check.json，包含失败/修正后状态与统计。它不证明数据库验证器可部署、权限事务竞态、HTTP接口实现、迁移可恢复或页面可用；上述须实施后独立真实测试。
