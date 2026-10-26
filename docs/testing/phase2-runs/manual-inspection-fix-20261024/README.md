# mongosh加载修正与人工数据只读检查

日期：2026-10-24（Asia/Shanghai），实际查询约23:22—23:25。用户粘贴的错误为SyntaxError/Unexpected token ','，发生于mongosh async_rewriter，尚未输出数据；不能据此判断数据库损坏。

## 原因和修正

本机 `D:\Programmer\bin\mongosh.exe` 为用户实际mongosh入口。`--nodb --quiet --eval 'await (async () => { print("probe-explicit-await"); })()'`退出1，SyntaxError Unexpected token ','；去掉最外层await、改为直接返回async function调用退出0。修正`database/inspect-phase2-manual.mongosh.js`的外层包裹，内部查询保持不变；Node语法检查不能替代mongosh实际load验证。

实际使用localhost:27019/rs0/project2_app_v2运行清单与指定题卷完整查询均退出0。[清单原输出](inventory.log)、[完整指定对象输出](focused.log)、[授权与模板现状](grants-and-template-state.log)、[输出布尔字段核对](output-checks.json)保留真实结果。执行工具沙箱中mongosh自身AppData日志写入产生EPERM警告，但这些查询进程退出0且输出完整；这不是数据库查询失败，不据此改变用户配置或放宽权限。

同一个mongosh会话内先加载清单，再设置真实ID重复load也退出0，见[重载原输出](same-session-reload.log)末尾SAME_SESSION_RELOAD_PASSED；无需重启数据库或应用服务。

所有数据库命令仅find/aggregate/countDocuments/只读adminCommand。未执行写操作、修改授权、重启服务或运行业务测试；本轮修正不需要重跑34组业务回归。

## 实际对象，区别于原配方

| 对象 | 实际ID | 当前状态/计数 |
| --- | --- | --- |
| 四型与跳转／A | 6adcc529ba826d37d9e2d205 | 发布v1，累计4、当前4；当前allowRepeat=true |
| 满意度甲场／B | 6adcc6e9ba826d37d9e2d229 | 发布v1，累计1、当前1 |
| 满意度乙场／B | 6adcc770ba826d37d9e2d236 | 发布v2，累计3、当前1 |
| 引用规则草稿／B | 6adcc924ba826d37d9e2d24f | 2题草稿，无发布/答卷 |
| 额外草稿“11”／B | 6adcc4e5ba826d37d9e2d201 | 1题草稿，无发布/答卷 |
| 实际被换版/恢复/撤权的题／A | 6adcc3f3ba826d37d9e2d1f0 | 每周可参加几次活动；v1/v2/v3 |

实际复用数值题是原配方中的AT02，R01满意度并未因此自动变为v2。乙场发生主动换版，而非原计划甲场。用户已说明样例有出入，按当前真实身份/版本核算，不重做数据凑20/90。

## 本次可确认的数据库结果

- 13集合、5用户（admin与4个手动测试账号）、5份问卷清单已读取；原输出未含密码哈希。
- 5卷totalMatches/currentMatches均true；选定范围共有8份答卷，当前维护计数与实际记录一致。
- 23条所选题卷绑定的formalVersionFound/questionMatches/hashMatches均true；同一定义内同题同版重复为[]，答卷到发布快照/实例失效引用为[]。
- 实际AT02的v1有效数值2/4，均值3，分别来自甲/乙旧发布；v2有效值5、均值5，仅来自乙场新发布。新旧正式版分组正常。
- AT02正式v3的operation=restore，parent/restoredFrom均指v1，contentHash与v1相同；v1/v2仍在；待保存的“（草稿）”仍独立存在，baseVersionId仍为v2。
- AT02对B的共享state=revoked、revision=1、revokedAt非空；已取得的草稿/发布绑定仍保留原share证明与grantRevision=0，属于正常历史取得事实。
- 现有公开模板、公开分发授权均0；04尚无这些数据。本轮没有验证04功能完成。

## 限制与后续

当前W01允许重复，与原配方“禁止重复”不同；这不是数据损坏，但不能据此把当前卷的禁止重复场景标已通过。其他条目是当前存储一致性核对，不能凭当前hash证明过去从未被修改，也不自动替代全部UI权限/分支/匿名测试。

后续04需要AT01/AT02都私人共享给B；目前question_grants只有AT02对B的revoked记录。因此需A分别授予/重新授予这两题私人共享，并明确选用v1；保留AT02现有v2/v3及草稿。不由助手直接修改授权或现有数据。
