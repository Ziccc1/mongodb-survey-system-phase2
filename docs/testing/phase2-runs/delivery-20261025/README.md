# 第二阶段收尾修复与交付验证

2026-10-25实际执行。用户授权解决两处界面问题、多尺寸/键盘检查、真实一期迁移与数据库认证部署；随后明确Word报告自行撰写。本轮没有创建或修改Word/PDF、没有提交Git或课程平台。

## 最终结果

- 原两处问题已修复：到期列表结合expiresAt显示已截止并定时更新；行内派生有独立DOM ID前缀，原业务实例ID不变。
- 第一轮33个页面尺寸组合只发现320像素跨卷均值长小数溢出，已增加断行而不改变精度。最终33/33无页面横向溢出、重复ID或未标注表单控件，均有一个main和h1。覆盖工作台、问卷列表、题目列表、题库、模板广场、固定预览、编辑、发布、填写预览、分版统计、跨卷统计11页。
- 键盘专项验证Tab/Shift Tab顺序与3px可见焦点、Enter展开/登录/操作、空格单选多选、错误定位首题、预览确认/完成。发现并修复skip-link不聚焦main及hash变化重建页面的问题，实测未保存文字保留且已还原本地输入，没有点击保存。
- 真实P1源5用户、6问卷、5快照、8答卷，在两个独立二期目标各6提交后verify通过，重跑各0提交/6跳过；一期原目录1179文件最终摘要一致。当前网站未切换或混入旧数据。
- 当前二期MongoDB已启用认证/keyFile，API使用受限账号；20/20实际权限检查通过，正常stop/start和API ready通过。应用账号在真实页面成功登录、建卷、正式化和发布。
- 原人工8卷17份答卷的44/44只读检查仍通过；认证前所有二期已有文档逐字节未变。仅新增零答卷的到期状态复测卷6add675ac62b15cb7bd796a1，已到期并保留。

[机器汇总](summary.json)、[33组最终尺寸核对](ui-final-pass.json)、[认证20项](authorization-enforcement.json)、[历史44项](original-acceptance-after-auth.json)、[原数据保护](preservation-final.json)。这些是不同粒度，不能相加称同一类测试用例数。

## 本轮实际回归

| 检查组 | 结果 | 退出码 | 最后完成时间 UTC |
| --- | --- | --- | --- |
| typecheck | 通过 | 0 | 2026-10-25T02:33:04.477Z |
| build | 通过 | 0 | 2026-10-25T02:33:11.568Z |
| acceptancejourney | 通过 | 0 | 2026-10-25T02:19:31.564Z |
| acceptancepermissions | 通过 | 0 | 2026-10-25T02:19:46.928Z |
| migration | 通过 | 0 | 2026-10-25T02:25:59.808Z |
| databaseauth | 通过 | 0 | 2026-10-25T02:32:58.069Z |

原账号/问卷集成测试14个TAP测试通过，见[integration-result.json](integration-result.json)；原始输出在本会话执行回显，未冒称另存了该次完整raw log。其余run-check子目录保留output.log/result.json以及各组实际fixture证据。旧34组自动化没有在本轮整套重跑。

## 界面与键盘证据

第一轮：[ui-first-pass.json](ui-first-pass.json)；所有截图按ui-320/768/1440命名。修复确认：[ui-final-pass.json](ui-final-pass.json)，截图按final-ui-宽度-页面命名。已人工查看手机工作台/编辑、桌面模板等图像；其余逐页尺寸/标签/ID核对为真实浏览器DOM测量，不冒称逐屏人工审美评分。

- [到期列表修复](expired-list-fixed.png)、[最终桌面](delivery-final-desktop.png)
- [派生三种宽度与唯一ID](fixed-fork-checks.json)、[手机派生](fixed-fork-320.png)
- [跳过导航最终焦点及未保存输入](skip-navigation-fixed.json)
- [Tab可见焦点记录](keyboard-proof.json)：该文件保留第一轮skip焦点落BODY的问题，不能将其当最终通过；上方fixed记录显示最终MAIN#main。
- [键盘预览](keyboard-preview.json)、[预览不入库完成页](keyboard-preview.png)
- [Tab/Shift Tab与Enter真实登录](keyboard-login.json)
- [机械检测结果](ui-detector.json)：无命中；不等同完整WCAG、屏幕阅读器或性能认证。

## 迁移与权限证据

[真实一期迁移摘要](real-p1-migration.json)、[认证后旧格式应用ready](real-migration-runtime.json)。原用户不重置密码、不伪造登录；旧BSON/hash/全部字段由迁移verify检查。

[配置与角色创建](authorization-provision.json)只表示准备完毕，认证完成须结合[强制检查](authorization-enforcement.json)及[最终运行](runtime-final.json)。私有管理员/应用凭据、keyFile、认证前BSON备份在Git忽略的.local/security；一期冷备份/逻辑备份在.local/w07，计划/journal在.local/p2-008/migrations，不放公开docs。

角色定义的首次尝试被MongoDB拒绝（业务库角色不能含cluster权限），修正为admin定义、业务资源仍限app_v2。凭据文件ACL首次设置清除了继承权限导致客户端读取失败；扩大给CodexSandboxUsers的提议被自动审批拒绝且未执行。最后仅恢复现有用户/SYSTEM的文件权限，认证与正常停机均通过。没有强杀数据库或修改P1。

最初普通沙箱构建遇到已有生成文件EPERM，保留其失败目录；正常权限重跑后类型检查/构建通过。首次API重启的第一次health探测早于监听建立，后续已改为等待ready并实际通过；不将中间拒绝隐藏成首次立即成功。构建中原app-config.js脚本与图表chunk体积提示仍为非零warning，构建退出0，不声称没有任何提示。

## 交付边界

当前网站继续使用project2_app_v2原二期样例，真实迁移数据保存在独立目标；没有进行两套业务数据合并或网站整体切流。Word由用户自行写，引用事实见[交付核对](../../../phase2/delivery-verification.md)。未做公网发布、第二设备、真实断网/主节点故障或正式辅助技术认证。
