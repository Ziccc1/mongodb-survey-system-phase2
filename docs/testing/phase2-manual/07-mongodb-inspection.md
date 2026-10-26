# MongoDB只读核对命令：按实际题卷ID检查

本文件提供只读查询命令。初版仅用Node语法检查，实际mongosh 2.11.1的load解析失败；已修正最外层await写法，并以本机mongosh真实运行清单与指定对象查询，均退出0。[修正及实际查询记录](../phase2-runs/manual-inspection-fix-20261024/README.md)单列结论与限制。脚本只读集合与连接信息，不写库、不修复数据、不重跑人工样例。核对期间先不继续填答或改问卷，避免前后查询的计数发生变化。

## 1　在PowerShell连接正确实例

```powershell
mongosh "mongodb://localhost:27019/project2_app_v2?replicaSet=rs0"
```

应为第二阶段27019/rs0、十三集合应用库project2_app_v2；不是第一阶段27018，也不是兼容基线project2_app_v1或自动化project2_test_*。

**2026-10-25起已启用认证。** 在项目根目录打开上述mongosh后，先执行下面三行再加载查询脚本。它读取本机私有应用凭据并调用正常认证，不打印密码，也不关闭认证。不要把私有JSON粘到聊天或提交材料中。

```javascript
var p2LocalAuth = JSON.parse(require('fs').readFileSync('D:/大三/数据库/pj1_2/.local/security/application.json','utf8'));
db.getSiblingDB(p2LocalAuth.authSource).auth(p2LocalAuth.username,p2LocalAuth.password);
p2LocalAuth = null;
```

当前受限应用身份有查询所需的find/list和实例只读诊断权限。认证后的原44项样例检查已真实重跑通过，见[结果](../phase2-runs/delivery-20261025/original-acceptance-after-auth.json)。没有认证时find返回Unauthorized属于正确部署行为。

## 2　进入mongosh后，先列出真实对象

下面是mongosh中的JavaScript，不直接粘到PowerShell：

```javascript
var P2_MANUAL_AUDIT = {};
load("D:/大三/数据库/pj1_2/database/inspect-phase2-manual.mongosh.js");
```

脚本先核对服务器端口/副本集，再列集合、用户名、问卷清单和题目清单。`_id`为真实对象ID；`usageNumber`为独立问卷编号。所有问卷按实际数据列出，不强制匹配文档标题/前缀。账号只输出ID、用户名和创建时间，不输出passwordHash。

从清单复制：本次要核对的题目ID、相关甲/乙/草稿问卷ID、统计所有者实际用户名。当前草稿题干可能是“待保存草稿”，不要仅凭它判断旧正式版内容；题目清单也给出latestVersionId/latestTitle。

## 3　仍在mongosh中配置实际ID后重载

```javascript
var P2_MANUAL_AUDIT = {
  surveyIds: ["替换成实际问卷ID1", "替换成实际问卷ID2", "替换成实际W07问卷ID"],
  questionId: "替换成实际复用题目ID",
  ownerUsername: "替换成实际B用户名"
};
load("D:/大三/数据库/pj1_2/database/inspect-phase2-manual.mongosh.js");
```

ID填24位十六进制字符串，去掉不需要的问卷项；这些占位文本不能原样执行。支持只配置surveyIds或只配置questionId；提供questionId与ownerUsername才生成该所有者的独立数值汇总。若surveyIds也提供，数值汇总限定所选问卷中属于该所有者的部分。

## 输出怎样判断

| 输出 | 正确性检查 |
| --- | --- |
| Current drafts | surveys.questions是当前草稿，required/jumpRules按各卷设置；不能拿它冒充历史发布题目 |
| Publication snapshots | survey_versions.version是问卷发布版；definition内旧题干/选项/限制应符合当时发布内容；旧答案仍对应自己的发布版 |
| Counter comparison | 每卷totalMatches、currentMatches均应true，包括0答卷草稿；实际值按本轮真实提交核对，不套用17份计划 |
| Actual answers | responses.surveyDefinitionVersion对应问卷发布版；answers.questionId对应卷内实例ID，不是复用题目ID。Decimal128/NumberDecimal是预期数值存储 |
| Instance mappings | 每条formalVersionFound、questionMatches、hashMatches应true；scope=draft/publication区分草稿/发布，publicationVersion区分发布号 |
| S04 duplicates | 新建人工样例预期[]；同题同版在不同卷、不同发布版中正常重复，不跨历史误判 |
| Broken response references | 预期[]；每份答卷应有唯一发布快照，存储答案实例都属于那份快照 |
| Current question＋formal history | 草稿内容与baseVersionId单独保留；正式版按version递增；restore行有restoredFromVersionId及新号；latestVersionId指向最新正式版 |
| Private share state | 本轮被撤销题对B的记录应state=revoked，revokedAt非空；不是要求删掉授权行 |
| Acquired references | 撤权后已有draft/publication绑定继续存在。authorization.kind=share及旧grantRevision是当时取得事实，不要求改成revoked或同步最新revision |
| Bank membership | 目录删/移出不删除原题；已撤权共享题仍在目录中不等于当前可选用，页面还需检查现行授权 |
| Numeric oracle | 只按所选所有者＋同题ID＋同正式版分组，按答卷自身发布版和实例绑定关联；未答/跳过不补0；派生独立题ID不会混入 |

数值查询只核算实际存储的有效数值，不靠“缺答案”猜跳过还是未答；跳转计数应结合历史问卷规则与应用统计核对。若出现重复绑定或其他完整性异常，先分析异常，不用受其影响的汇总证明正确。

这套查询用于当前00—03；模板/分发授权可等04实际完成后按真实模板ID继续核对。数据库管理连接可读取底层数据，本查询不是验证B/C/D页面权限的替代；匿名答卷中的内部respondentId用于去重等应用逻辑，本脚本不输出它，页面是否匿名仍以接口和页面检查为准。

单看当前快照和hash不能证明过去从未被修改。若要证明前后不变，需要与先前截图、导出或hash记录对照。把实际输出与对应操作一起保存，才作为最终报告证据。
