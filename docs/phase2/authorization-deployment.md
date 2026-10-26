# 二期数据库认证与角色实际部署

2026-10-25已在当前 `localhost:27019/rs0`、`.local/mongodb-phase2-rs0` 实例启用认证及内部keyFile，保持仅回环监听。当前 `project2_app_v2` 的API使用受限数据库用户 `project2_application_user`，不是管理员身份。应用网站的A/B/C/D账号与MongoDB数据库账号是两层独立身份，原网站密码未更改。

## 角色与私有配置

`project2_application` **定义在admin数据库**，其业务资源只指向 `project2_app_v2`，再授予必要的集群只读诊断。之前未运行过的模板把含cluster权限的角色建在业务库中，首次实测收到InvalidRoleModification；本轮已修正 `scripts/app-role.mongosh.js` 和实际部署工具，不放宽到readWriteAnyDatabase或dbOwner。

| 集合 | 应用账号权限 |
| --- | --- |
| users / question_versions / survey_versions / responses / operation_receipts | listIndexes、find、insert；禁止update/delete |
| surveys / question_items / question_banks / question_grants / survey_templates / template_grants | listIndexes、find、insert、update；禁止remove |
| question_bank_members / survey_question_bindings | listIndexes、find、insert、update、remove |
| 当前业务库 | listCollections |
| 集群 | getCmdLineOpts、serverStatus、replSetGetConfig，用于现有实例归属门禁 |

管理员 `project2_administrator` 单独保存在 `.local/security/admin.json`，只给维护脚本、备份和独立合成库测试使用。受限账号配置在 `.local/security/application.json`；副本集密钥在同目录的 `mongodb-keyfile`。这些文件及认证前完整BSON备份均被Git忽略，不复制到docs、不打印密码、不放URI或进程参数。当前私有目录和文件授权仅当前本机用户与SYSTEM，无CodexSandboxUsers扩权。

`.env.phase2`增加 `MONGODB_AUTH_FILE=.local/security/application.json`。数据库URI仍保持原先严格的localhost、27019、rs0及库名门禁，未为了支持密码而允许URI带凭据、任意端口或任意authSource。服务器从受保护的文件读凭据，客户端 `/app-config.js` 继续仅暴露白名单配置。凭据文件必须在本项目 `.local/security` 的直接子级，绑定准确业务库，格式或读取错误会拒绝启动。

## 实际强制检查

[20项实际结果](../testing/phase2-runs/delivery-20261025/authorization-enforcement.json)确认：未认证读、错误密码均拒绝；应用可读13集合及用户；5个只插读集合的update/delete共10个负例均Unauthorized；建集合、collMod、删除快照集合、读取baseline库均拒绝；允许的surveys更新在真实事务中执行后主动回滚；角色权限与清单一致；全业务数据/验证器/索引摘要不变。

认证后的实际API ready、网页原B账号重新登录、创建独立零答卷样例、正式化及发布均成功。原主流程及权限矩阵、迁移回归和账号问卷集成亦在认证模式下通过。测试夹具显式读取维护凭据，仍只写各自独立合成库，生产应用路径不会自动回退到管理员身份；原MongoClient原型探针保留。

## 后续启动与检查

在本项目目录使用：

```powershell
npm.cmd run db:start
npm.cmd run db:verify:phase2
npm.cmd run dev:api:phase2
# 另一个终端；原Web仍在运行时不要重复占用端口
npm.cmd run dev:web:phase2
```

启动脚本检测已部署keyFile后以认证方式启动；副本集初始化、正常停止和检查脚本从私有管理文件读凭据。正常停止为 `powershell.exe -NoProfile -ExecutionPolicy Bypass -File scripts/stop-mongo.ps1`；会先核对当前实例、目录、PID和端口，不按历史PID杀数据库。认证后的完整stop/start已实际验证，API也已重新启动并ready。不要删除keyFile或凭据文件来处理连接问题。

维护检查：`node scripts/secure-phase2.mjs verify`；最终数据保护检查：`node scripts/delivery-inventory.mjs`。当前权限检查使用既有问卷做真实更新回滚探针，因此应在已经有问卷的部署上执行。普通查询现需先认证，见[更新后的MongoDB只读操作](../testing/phase2-manual/07-mongodb-inspection.md)。

首次部署工具 `node scripts/secure-phase2.mjs provision` 会先保存认证前应用备份、生成独立强密码及keyFile，再创建账号/角色，并只增加配置引用；它不会自行杀进程或改P1。实际启用仍需受控正常重启与verify，不能仅执行provision便宣布验收通过。

本机维护账号与应用账号运行在同一Windows用户下，本轮验证的是MongoDB身份和权限强制，不宣称已实现独立操作系统服务账号隔离。publication/draft共用绑定集合的行权限、模板更新字段约束仍由应用层保证。
