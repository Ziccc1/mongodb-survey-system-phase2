# Figure contract

- core_claim: 问卷身份与发布定义分离，答卷关联对应发布版本；题目和答案嵌入所属文档。
- hero: 四集合关联图，重点为发布版本到答卷的一对多关系与题目/答案嵌入边界。
- audience: 数据库课程报告读者；16—17cm宽的报告插图。
- style: 白色底、淡蓝/淡绿/淡紫/淡黄集合框；虚线嵌入边界，实线业务关系，统一微软雅黑。
- source_data: relation-data.json；事实对照当前models/schema/versions/submission源码。
- exports: PNG（300dpi）、PDF、SVG（文字保留）。
- statistics: 概念数据结构，不展示统计量、样本量或置信区间；N仅表示多。
- exclusions: 不绘制不存在的questions/answers独立集合、不声称MongoDB自动外键、不披露匿名身份。
- fallback: 安装的技能无_style.py/paperfig和critique.py；复用现有绘图适配器，执行边界/文字重叠/导出结构检查后目视核查，不声称技能自动门禁通过。
