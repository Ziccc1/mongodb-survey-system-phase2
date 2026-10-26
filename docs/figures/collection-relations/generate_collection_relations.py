"""Generate an editable PDF/SVG and 300-dpi PNG from relation-data.json.

Run from this folder with Python + Pillow + reportlab. Uses the project's existing
three-format drawing adapter; no business database connection or old-file rewrite.
The installed Icarus package lacks scripts/critique.py and its style preset.
"""
from pathlib import Path
import importlib.util,json,csv,re,hashlib,sys
ROOT=Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('report_drawing',ROOT.parent/'generate_diagrams.py')
adapter=importlib.util.module_from_spec(spec);spec.loader.exec_module(adapter)
adapter.ROOT=ROOT
DATA=json.loads((ROOT/'relation-data.json').read_text(encoding='utf-8'))
W,H=1400,1010
INK='#25384B';MUTED='#52677B';EDGE='#7E92A6'
palettes={'users':('#EAF2FC','#8CA6C0'),'surveys':('#EDF5F1','#8DAA9C'),'responses':('#F1EDF8','#A197B6'),'survey_versions':('#FFF8E8','#BDAB7F')}
d=adapter.Drawing(DATA['figure_id'],W,H)
boxes={'users':(85,55,355,150),'surveys':(900,55,415,270),'responses':(85,565,485,270),'survey_versions':(900,565,415,270)}
def embed(x,y,w,h,label,field,color):
    # Dashed boundary encodes actual containment, independent of color.
    k=adapter.SCALE
    d.draw.rounded_rectangle((x*k,y*k,(x+w)*k,(y+h)*k),radius=7*k,fill='white')
    for a,b in [((x+8,y),(x+w-8,y)),((x+8,y+h),(x+w-8,y+h)),((x,y+8),(x,y+h-8)),((x+w,y+8),(x+w,y+h-8))]:
        import math
        length=math.hypot(b[0]-a[0],b[1]-a[1])
        for start in range(0,int(length),15):
            t=start/length;u=min((start+8)/length,1)
            d.draw.line(((a[0]+(b[0]-a[0])*t)*k,(a[1]+(b[1]-a[1])*t)*k,(a[0]+(b[0]-a[0])*u)*k,(a[1]+(b[1]-a[1])*u)*k),fill=color,width=2*k)
    d.pdf.setFillColor('white');d.pdf.setStrokeColor(color);d.pdf.setLineWidth(.8);d.pdf.setDash(4,3)
    d.pdf.roundRect(x*.5,(H-y-h)*.5,w*.5,h*.5,4,fill=1,stroke=1);d.pdf.setDash()
    d.svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="7" fill="white" stroke="{color}" stroke-width="1.6" stroke-dasharray="8 7"/>')
    d.text(x+w/2,y+35,label,27,color=INK)
    d.text(x+w/2,y+68,field,23,color=MUTED)
for key,(x,y,w,h) in boxes.items():
    node=DATA['nodes'][key];fill,stroke=palettes[key]
    d.rect(x,y,w,h,fill,stroke,radius=9,lw=2)
    d.text(x+w/2,y+56,node['title'],38)
    d.text(x+w/2,y+95,node['name'],27,color=MUTED)
    if 'embedded_field' in node:embed(x+22,y+135,w-44,100,node['embedded_title'],node['embedded_field'],stroke)
# Semantic arrow directions: one parent to its many child records, not wire traffic.
d.arrow([(440,130),(900,130)],color=EDGE);d.text(670,102,DATA['relations'][0]['label'],30)
d.arrow([(262,205),(262,565)],color=EDGE);d.text(365,390,DATA['relations'][1]['label'],30)
d.arrow([(1107,325),(1107,565)],color=EDGE);d.text(1220,458,DATA['relations'][2]['label'],30)
d.arrow([(900,300),(570,565)],color=EDGE);d.text(628,428,DATA['relations'][3]['label'],30)
d.arrow([(900,650),(570,650)],color=EDGE);d.text(735,620,DATA['relations'][4]['label'],30)
d.text(735,701,'按提交版本解释',25,color=MUTED)
# Concise legend and schema boundary notes; statistical N/CI do not apply.
d.text(700,885,DATA['notes'][0],25,color=MUTED)
d.text(700,925,DATA['notes'][1],23,color=MUTED)
d.text(700,960,DATA['notes'][2],23,color=MUTED)
metadata=d.save()
# Export one caption-free version so Word can number the figure automatically.
project=ROOT.parents[2]
sources={name:hashlib.sha256((project/name).read_bytes()).hexdigest() for name in DATA['source_files']}
overlaps=[]
for i,a in enumerate(d.bounds):
    for j,b in enumerate(d.bounds[:i]):
        if min(a[0]+a[2],b[0]+b[2])-max(a[0],b[0])>2 and min(a[1]+a[3],b[1]+b[3])-max(a[1],b[1])>2:overlaps.append([j,i])
assert not overlaps,('Text overlap',overlaps)
svg=(ROOT/(DATA['figure_id']+'.svg')).read_text(encoding='utf-8')
assert svg.count('<text ')==len(d.bounds)
assert svg.count('stroke-dasharray="8 7"')==3
checks={**metadata,'width':W*3,'height':H*3,'dpi':300,'textOverlaps':overlaps,'collectionCount':4,'embeddedBoxCount':3,'relationCount':5,'textEditableInSVG':True,'sourceFilesSha256':sources,'skillGate':'Not run: installed skill has no scripts/critique.py or preset. Text bounds/overlap/vector structure checks actually executed instead.','judgment':{'mechanism':'Composite version reference and containment are drawn explicitly.','composition':'Four parent collections, three embedded subdocuments; relation labels do not rely on color.','faithfulness':'Matches current code; anonymous association is internal, not public disclosure.','clarity':'White background, restrained four-color nodes, consistent CJK and edge labels.'},'statistics':'Conceptual schema diagram; N denotes many, not sample size. CI/units not applicable.'}
(ROOT/'quality-check.json').write_text(json.dumps(checks,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
with (ROOT/'figure_manifest.csv').open('w',encoding='utf-8-sig',newline='') as f:
    w=csv.writer(f);w.writerow(['id','claim','data','generator','formats']);w.writerow([DATA['figure_id'],DATA['core_claim'],'relation-data.json',Path(__file__).name,'PNG/PDF/SVG'])
print(json.dumps(metadata,ensure_ascii=False))
