# 关键逻辑说明

[← 返回项目总 README](../README.md) · [API契约](api.md) · [数据库设计](database-design.md) · [测试结果](testing/submission-test-cases.md)

本文说明第一阶段当前实现，完整协议以API契约为准。

## 1 跳转与路径

题目、选项和规则使用稳定ID，规则数组顺序表示优先级。系统从首题计算，单选使用eq，多选使用containsAny/containsAll，数字使用eq、lt、lte、gt、gte。第一条命中决定目标，无命中进入下一题。仅允许向后跳，发布前检查目标和选项引用。

例如选择“不参加”跳到年龄题，或多选同时包含篮球和游泳跳到年龄题。多选按整个选择集合判断，不因一次勾选突然自动翻页。正式填写和模拟填写每页最多10道有效题，显示原题号。

实现：[answers.ts](../packages/shared/src/answers.ts)、[questions.ts](../packages/shared/src/questions.ts)。测试：TC09—TC12、TC35。

## 2 校验与改答清理

前端预检，后端按发布快照重算路径。未知题目、重复答案、类型不匹配、非法或重复选项拒绝。仅对实际路径检查必答和内容限制，跳过的必答题无须补填。可选未答允许通过，填写后执行约束。

纯空白文本视为未答，非空保留原文，按Unicode码点计数。数字0有效，API用字符串，经decimal.js比较后转换为Decimal128，不截断小数。手机号不额外校验11位或号段。

改答后清理失效分支，保留有效答案，切回分支时重新校验。最终仅保存路径内非空答案。草稿允许暂存失效引用等未完成配置，发布前必须修复；结构错误、重复ID、颠倒范围等直接拒绝。

实现：[共享校验](../packages/shared/src/answers.ts)、[定义检查](../packages/shared/src/questions.ts)、[填写页面](../apps/web/src/pages/FillPage.vue)。测试：TC07—TC17。

## 3 编辑与发布版本

surveys保存编辑区与运行状态，survey_versions保存发布快照，responses记录提交发布号。普通保存不生成快照，expectedRevision与服务器revision比较，冲突409且页面保留本地内容。

已发布先暂停再修改。发布事务新增快照、切指针、重置当前计数，保留累计、旧答卷和原链接。发布请求标识避免成功重试重复建版。历史按原快照解释，不能套用最新标签。快照仓储仅新增/读取，读取检查摘要，不等于数据库管理员无法直接修改。

实现：[发布](../apps/api/src/core/publication.ts)、[版本](../apps/api/src/core/versions.ts)、[编辑](../apps/api/src/survey-editing.ts)。测试：TC26—TC29。

## 4 提交、防重与幂等

新提交检查登录、收集状态、服务器截止时间、当前发布号、匿名策略、重复资格和答案。暂停/关闭/到期/旧版新请求拒绝，禁止重复跨整份问卷执行，匿名及重复策略首次发布后锁定。

网络重试冻结原发布号、匿名选择、答案及Idempotency-Key，服务端规范化答案并比较摘要。同key同内容返回原回执，不同内容冲突；主动再次填写使用新key并遵守重复策略。

服务端先判断已成功请求，再判断新提交资格，因此成功请求在关闭或重发后仍可原样确认，不代表允许新增。幂等唯一索引与部分唯一防重索引保证并发约束；新增答卷与两个计数同事务，异常全部回滚。

实现：[提交](../apps/api/src/core/submission.ts)、[索引](../apps/api/src/database/schema.ts)。测试：TC19—TC26、TC29。

## 5 统计、匿名与预览

统计默认最新，可切换历史，各题以实际回答份数为分母，跳过或未答不计入。零次选项保留，多选占比和可超过100%。数字0参与均值，无数字回答时均值null；手机号等题目默认隐藏均值。累计份数不代表去重人数或跨版本题目合并。

匿名内部保留账号关联，管理响应过滤身份、请求标识和摘要；不会自动消除答案正文中主动填写的身份信息。

浏览预览按原题序翻页、无需回答、不执行跳转；模拟填写执行校验与跳转。两种预览均不写正式答卷或计数。

实现：[统计](../apps/api/src/core/reporting.ts)、[图表](../apps/web/src/components/ChoiceChart.vue)、[预览](../apps/web/src/pages/FillPage.vue)。测试：TC17、TC20、TC28、TC30—TC35。

[← 返回项目总 README](../README.md)
