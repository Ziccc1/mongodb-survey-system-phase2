# MongoDB 四集合关联与嵌入结构

建议放在报告“MongoDB设计／集合划分”小节开头。PNG为4200×3030像素、300dpi；PDF/SVG是矢量版本，SVG保留文字便于编辑。图内不固定图号，方便Word自动编号。

建议图题：**图2 MongoDB四集合关联与嵌入结构**。

建议配文：系统使用users、surveys、survey_versions与responses四个集合组织数据。题目嵌入问卷编辑区及发布快照，答案嵌入答卷；答卷通过问卷ID和提交发布号定位对应快照，使历史答案按提交时定义解释。虚线框表示嵌入结构，不是独立集合。1:N表示一对多，允许尚无子记录；集合间引用由后端保证，MongoDB不提供自动外键检查。匿名答卷的内部账号关联不代表向创建者公开身份。

运行：在本目录执行 `python generate_collection_relations.py`，需要Pillow、reportlab和Windows微软雅黑字体，并复用上级现有绘图适配器。输入数据为relation-data.json，来源为项目当前模型和业务源码，未连接数据库，不修改历史图片、AI日志或业务代码。

本地安装的Icarus技能缺少自动critique脚本和样式预设，因此不能声称通过该技能的自动门禁；实际检查见quality-check.json，并另行目视检查成图。该图是数据结构示意，不涉及样本量、置信区间或实验统计。
