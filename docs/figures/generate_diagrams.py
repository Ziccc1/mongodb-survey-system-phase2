"""Reproduce three report diagrams as editable SVG/PDF and 300-dpi PNG.

Run with Python containing Pillow and reportlab. No database connection is used.
The optional icarus preset/gate scripts are absent from the installed skill package;
this shared drawing adapter keeps typography and geometry identical across formats.
"""
import csv
import json
import math
from pathlib import Path
from xml.sax.saxutils import escape

from PIL import Image, ImageDraw, ImageFont
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont

ROOT = Path(__file__).resolve().parent
DATA = json.loads((ROOT / 'diagram-data.json').read_text(encoding='utf-8'))
FONT = Path('C:/Windows/Fonts/msyh.ttc')
BOLD = Path('C:/Windows/Fonts/msyhbd.ttc')
INK = '#25384B'
MUTED = '#53677A'
LINE = '#60778A'
BLUE = ('#EAF4FE', '#79A8D0')
YELLOW = ('#FFF5D7', '#C5A34D')
GREEN = ('#ECF6F0', '#78AA91')
PURPLE = ('#F2EEFA', '#A393C7')
SCALE = 3
pdfmetrics.registerFont(TTFont('YaHei', str(FONT), subfontIndex=0))
pdfmetrics.registerFont(TTFont('YaHeiBold', str(BOLD), subfontIndex=0))


class Drawing:
    def __init__(self, name, width, height):
        self.name, self.w, self.h = name, width, height
        self.img = Image.new('RGB', (width*SCALE, height*SCALE), 'white')
        self.draw = ImageDraw.Draw(self.img)
        self.pdf = canvas.Canvas(str(ROOT / (name+'.pdf')), pagesize=(width*.5, height*.5))
        self.svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}">', '<rect width="100%" height="100%" fill="white"/>']
        self.bounds = []

    def rect(self, x, y, w, h, fill, stroke, radius=14, lw=2):
        self.draw.rounded_rectangle((x*SCALE,y*SCALE,(x+w)*SCALE,(y+h)*SCALE), radius=radius*SCALE, fill=fill, outline=stroke, width=lw*SCALE)
        self.pdf.setFillColor(fill); self.pdf.setStrokeColor(stroke); self.pdf.setLineWidth(lw*.5)
        self.pdf.roundRect(x*.5,(self.h-y-h)*.5,w*.5,h*.5,radius*.5,fill=1,stroke=1)
        self.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{radius}" fill="{fill}" stroke="{stroke}" stroke-width="{lw}"/>')

    def polygon(self, points, fill, stroke):
        self.draw.polygon([(x*SCALE,y*SCALE) for x,y in points],fill=fill)
        self.draw.line([(x*SCALE,y*SCALE) for x,y in points+[points[0]]],fill=stroke,width=2*SCALE)
        p=self.pdf.beginPath();p.moveTo(points[0][0]*.5,(self.h-points[0][1])*.5)
        for x,y in points[1:]:p.lineTo(x*.5,(self.h-y)*.5)
        p.close();self.pdf.setFillColor(fill);self.pdf.setStrokeColor(stroke);self.pdf.drawPath(p,fill=1,stroke=1)
        self.svg.append(f'<polygon points="{" ".join(f"{x},{y}" for x,y in points)}" fill="{fill}" stroke="{stroke}" stroke-width="2"/>')

    def text(self, x, y, content, size=28, bold=False, anchor='middle', color=INK):
        # y is the first line's baseline. Preserve editable text in SVG and PDF.
        font=ImageFont.truetype(str(BOLD if bold else FONT),size*SCALE)
        pdf_font='YaHeiBold' if bold else 'YaHei'
        for i,line in enumerate(content.split('\n')):
            baseline=y+i*size*1.48
            width=self.draw.textlength(line,font=font)/SCALE
            left=x-width/2 if anchor=='middle' else x
            self.draw.text((left*SCALE,baseline*SCALE),line,font=font,fill=color,anchor='ls')
            self.pdf.setFillColor(color);self.pdf.setFont(pdf_font,size*.5)
            self.pdf.drawString(left*.5,(self.h-baseline)*.5,line)
            self.svg.append(f'<text x="{x}" y="{baseline}" text-anchor="{anchor if anchor=="middle" else "start"}" font-family="Microsoft YaHei, sans-serif" font-size="{size}" font-weight="{700 if bold else 400}" fill="{color}">{escape(line)}</text>')
            assert left>=15 and left+width<=self.w-15,(self.name,line,'horizontal overflow',left,width)
            assert baseline-size>=0 and baseline<=self.h-10,(self.name,line,'vertical overflow')
            self.bounds.append((left,baseline-size,width,size))

    def arrow(self, points, color=LINE, dashed=False):
        for (x1,y1),(x2,y2) in zip(points,points[1:]):
            if dashed:
                dist=math.hypot(x2-x1,y2-y1)
                for start in range(0,int(dist),15):
                    a=start/dist;b=min((start+8)/dist,1)
                    self.draw.line(((x1+(x2-x1)*a)*SCALE,(y1+(y2-y1)*a)*SCALE,(x1+(x2-x1)*b)*SCALE,(y1+(y2-y1)*b)*SCALE),fill=color,width=2*SCALE)
            else:self.draw.line((x1*SCALE,y1*SCALE,x2*SCALE,y2*SCALE),fill=color,width=2*SCALE)
        self.pdf.setStrokeColor(color);self.pdf.setLineWidth(1.2);self.pdf.setDash(4,3) if dashed else self.pdf.setDash()
        p=self.pdf.beginPath();p.moveTo(points[0][0]*.5,(self.h-points[0][1])*.5)
        for x,y in points[1:]:p.lineTo(x*.5,(self.h-y)*.5)
        self.pdf.drawPath(p)
        self.pdf.setDash()
        self.svg.append(f'<polyline points="{" ".join(f"{x},{y}" for x,y in points)}" fill="none" stroke="{color}" stroke-width="2.4"'+(' stroke-dasharray="8 7"' if dashed else '')+'/>')
        x,y=points[-1];px,py=points[-2];a=math.atan2(y-py,x-px)
        head=[(x,y),(x-13*math.cos(a-.45),y-13*math.sin(a-.45)),(x-13*math.cos(a+.45),y-13*math.sin(a+.45))]
        self.polygon(head,color,color)

    def card(self,x,y,w,h,title,lines,palette):
        self.rect(x,y,w,h,palette[0],palette[1])
        self.text(x+25,y+49,title,31,True,'start')
        for i,line in enumerate(lines):self.text(x+25,y+96+i*43,line,25,anchor='start',color=MUTED)

    def save(self):
        self.svg.append('</svg>')
        (ROOT/(self.name+'.svg')).write_text('\n'.join(self.svg),encoding='utf-8')
        self.img.save(ROOT/(self.name+'.png'),dpi=(300,300))
        self.pdf.showPage();self.pdf.save()
        return {'figure':self.name,'textLines':len(self.bounds),'textWithinCanvas':True,'formats':['png','svg','pdf']}


def fig2():
    d=Drawing('fig2_mongodb_relations',1440,1060)
    d.text(720,55,DATA['fig2']['title'],35,True)
    d.text(720,98,'四个集合分工存储；题目与答案采用嵌入结构',27,color=MUTED)
    d.card(65,155,455,220,'users  用户账号',['_id · ObjectId','usernameKey · 唯一用户名','passwordHash · 密码哈希'],BLUE)
    d.card(880,155,490,310,'surveys  当前问卷',['_id · 问卷ID','ownerId → users._id','currentPublishedVersion','questions[] · 可编辑题目','累计 / 当前版本答卷计数'],YELLOW)
    d.card(65,610,620,300,'responses  正式答卷',['surveyId · 所属问卷','respondentId → users._id','surveyDefinitionVersion · 发布号','answers[] · 有效路径答案','submittedAt · 提交时间'],PURPLE)
    d.card(880,610,490,300,'survey_versions  发布快照',['surveyId → surveys._id','version · 发布号','definition · 完整问卷定义','policySnapshot · 策略快照','(surveyId, version) 唯一'],GREEN)
    d.arrow([(520,245),(880,245)])
    d.text(700,198,'1 : N  创建问卷',27)
    d.text(700,232,'ownerId',25,color=MUTED)
    d.arrow([(290,375),(290,610)])
    d.text(440,476,'1 : N  提交答卷',27)
    d.text(440,515,'respondentId',25,color=MUTED)
    d.arrow([(1125,465),(1125,610)])
    d.text(1260,524,'1 : N',26)
    d.text(1260,560,'发布版本',25,color=MUTED)
    d.arrow([(880,385),(780,385),(780,650),(685,650)])
    d.text(772,453,'1 : N',25)
    d.text(772,490,'问卷答卷',24)
    d.text(772,527,'surveyId',23,color=MUTED)
    d.arrow([(880,795),(685,795)],dashed=True)
    d.text(782,718,'1 : N',26)
    d.text(782,754,'按版解释',25)
    d.text(720,965,'复合关联：(surveyId, surveyDefinitionVersion) → (surveyId, version)',27,True)
    d.text(720,1010,'当前发布指针定位最新快照；引用有效性由后端检查，MongoDB不自动提供外键。',25,color=MUTED)
    return d.save()


def fig3():
    d=Drawing('fig3_version_lifecycle',1440,960)
    d.text(720,55,DATA['fig3']['title'],35,True)
    d.text(720,100,'人工测试样例：第一版2份答卷，第二版1份答卷',27,color=MUTED)
    d.rect(65,140,1310,80,BLUE[0],BLUE[1])
    d.text(720,190,'问卷身份保持不变：同一 surveyId ＋ 同一 publicId / 分享链接',29,True)
    steps=[(65,'准备草稿',BLUE),(330,'发布 v1',BLUE),(595,'暂停收集',YELLOW),(860,'修改并保存',YELLOW),(1125,'发布 v2',GREEN)]
    for i,(x,label,palette) in enumerate(steps):
        d.rect(x,275,240,105,palette[0],palette[1])
        d.text(x+120,337,label,30,True)
        if i<4:d.arrow([(x+240,327),(steps[i+1][0],327)])
    d.arrow([(450,380),(450,490)])
    d.arrow([(1245,380),(1245,440),(1150,440),(1150,490)])
    d.text(980,430,'保存不生成快照',25,color=MUTED)
    d.card(210,490,480,145,'v1 发布快照',['保留原题目、选项与规则'],BLUE)
    d.card(900,490,480,145,'v2 发布快照',['保存修改后的完整定义'],GREEN)
    d.arrow([(450,635),(450,700)])
    d.arrow([(1140,635),(1140,700)])
    d.rect(210,700,480,125,BLUE[0],BLUE[1])
    d.text(450,750,f"v1 答卷：{DATA['fig3']['v1_count']}份",31,True)
    d.text(450,794,'始终按照v1定义查看和统计',26)
    d.rect(900,700,480,125,GREEN[0],GREEN[1])
    d.text(1140,750,f"v2 答卷：{DATA['fig3']['v2_count']}份",31,True)
    d.text(1140,794,'当前发布指针 → v2',26)
    d.rect(65,870,1310,60,YELLOW[0],YELLOW[1])
    d.text(720,910,'累计答卷：3份    ｜    当前版本：1份    ｜    旧定义不覆盖，旧答卷不删除',28,True)
    return d.save()


def fig4():
    d=Drawing('fig4_survey_branching',1200,1450)
    d.text(600,55,DATA['fig4']['title'],34,True)
    d.text(600,100,'按原题号展示；跳过题目不参与本次必答校验和答案保存',26,color=MUTED)
    d.polygon([(430,145),(685,225),(430,305),(175,225)],*BLUE)
    d.text(430,218,'Q1  是否参加运动？',29,True)
    d.text(430,257,'必答单选',25,color=MUTED)
    d.arrow([(430,305),(430,385)])
    d.text(475,354,'参加',26)
    d.polygon([(430,385),(685,470),(430,555),(175,470)],*BLUE)
    d.text(430,460,'Q2  喜欢哪些运动？',29,True)
    d.text(430,505,'必答多选，选择1—2项',25,color=MUTED)
    d.arrow([(430,555),(430,675)])
    d.text(430,617,'未命中跳转规则',26)
    d.rect(215,675,430,105,'#FFFFFF',BLUE[1])
    d.text(430,720,'Q3  活动建议',29,True)
    d.text(430,760,'可选文本，最多10个字符',25,color=MUTED)
    d.arrow([(430,780),(430,900)])
    d.rect(215,900,430,115,GREEN[0],GREEN[1])
    d.text(430,948,'Q4  年龄',29,True)
    d.text(430,990,'必答整数，0—120',25)
    d.arrow([(685,225),(990,225),(990,955),(645,955)],color='#7F6A32')
    d.text(1010,355,'不参加',28,True)
    d.text(1010,400,'跳过Q2、Q3',25)
    d.arrow([(685,470),(800,470),(800,955),(645,955)],color='#386D94')
    d.text(807,648,'同时包含',26)
    d.text(807,691,'篮球和游泳',26,True)
    d.text(807,734,'跳过Q3',25)
    d.arrow([(430,1015),(430,1090)])
    d.rect(215,1090,430,105,'#FFFFFF',GREEN[1])
    d.text(430,1135,'Q5  手机号',29,True)
    d.text(430,1175,'可选，填写时须为整数',25,color=MUTED)
    d.arrow([(430,1195),(430,1270)])
    d.rect(215,1270,430,80,YELLOW[0],YELLOW[1])
    d.text(430,1320,'确认并提交',30,True)
    d.rect(755,1080,390,265,PURPLE[0],PURPLE[1])
    d.text(950,1130,'返回修改前题时',28,True)
    d.text(950,1180,'重新计算实际路径\n清理失效分支答案\n保留仍有效的回答',27)
    d.text(600,1410,'规则仅向后跳转；返回改答属于页面操作，不是规则向前跳转。',25,color=MUTED)
    return d.save()


if __name__=='__main__':
    reports=[fig2(),fig3(),fig4()]
    (ROOT/'quality-check.json').write_text(json.dumps({'checks':reports,'scope':'Design schematics; no inferential statistics or uncertainty intervals apply. Text bounds checked automatically; visual inspection required.','skillGate':'Unavailable: installed skill has no scripts/critique.py or paperfig preset.'},ensure_ascii=False,indent=2),encoding='utf-8')
    with (ROOT/'figure_manifest.csv').open('w',encoding='utf-8-sig',newline='') as f:
        writer=csv.writer(f);writer.writerow(['id','path','claim','source','generator'])
        for k,name in [('fig2','fig2_mongodb_relations'),('fig3','fig3_version_lifecycle'),('fig4','fig4_survey_branching')]:
            writer.writerow([k,name+'.svg',DATA[k]['claim'],DATA[k]['source'],'generate_diagrams.py'])
    print(json.dumps(reports,ensure_ascii=False))
