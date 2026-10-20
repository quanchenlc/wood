from common import *
from motion_math import *
O=D+'motion/'
def frame(frac):
    s=state_open(frac); c=scene()
    dim(c,s['dim']); drawer_bg(c,clip_h=s['h'])
    if s['ca']>0:
        lay=Image.new('RGBA',c.size,(0,0,0,0)); drawer_content(lay,alpha=s['ca'],dy=6*(1-s['ca']))
        m=Image.new('L',c.size,0); ImageDraw.Draw(m).rectangle([0,0,W,int(s['h']*K)],fill=255)
        lay.putalpha(Image.fromarray(np.minimum(np.asarray(lay.split()[3]),np.asarray(m)))); c.alpha_composite(lay)
    if s['ra']>0: roll(c,s['roll_y'],s['d'],alpha=s['ra'])
    tag(c,y=s['tag'],reddot=(frac==0),up=frac>0)
    chrome(c); a=c.copy()
    # annotations
    ann_v(a,8,0,s['h'],f"clip h={s['h']:.0f}",ly=min(s['h']/2,s['h']-20) if s['h']>40 else 60)
    if s['ra']>0:
        ann_v(a,322,s['roll_y']-s['d']/2,s['roll_y']+s['d']/2,f"d={s['d']:.1f}",ly=s['roll_y']+s['d']/2+14)
        ann_h(a,s['roll_y'],200,300,f"roll y={s['roll_y']:.0f}",above=False if s['roll_y']<60 else True)
    lab=f"t={s['ms']:.0f}ms ({frac*100:.0f}%)  p={s['p']:.3f}\nroll α={s['ra']:.2f}  内容 α={s['ca']:.2f}  遮罩 {s['dim']*100:.0f}%  小签 top={s['tag']:.0f}"
    d=ImageDraw.Draw(a,'RGBA'); f=ImageFont.truetype(SANSB,24,index=2)
    d.rectangle([20,H-210,W-20,H-110],fill=(255,255,255,230)); d.multiline_text((36,H-200),lab,font=f,fill=AC,spacing=10)
    return a,s
frames=[]
for fr in (0,.3,.6,1.0):
    a,s=frame(fr); a.convert('RGB').save(O+f'kf_{int(fr*100):03d}.png',optimize=True); frames.append((a,s,fr))
# strip
sc=0.5; tw,th=int(W*sc),int(H*sc); gap=24
out=Image.new('RGB',(gap+4*(tw+gap),th+300),(40,28,18)); d=ImageDraw.Draw(out)
d.text((gap,18),'D 抽屉 · 展开动效关键帧（羊皮纸展开：裁切 + 滚筒定位，无序列帧）',font=ImageFont.truetype(SANSB,30,index=2),fill=CREAM)
d.text((gap,62),f'open {OPEN_MS}ms cubic-bezier{OPEN_EASE} · close {CLOSE_MS}ms cubic-bezier{CLOSE_EASE} · d = √(14² + (40²−14²)(1−p)) · clip h = 20 + 380·p',font=ImageFont.truetype(SANS,18,index=2),fill=(214,196,160))
for i,(a,s,fr) in enumerate(frames):
    x=gap+i*(tw+gap); out.paste(a.convert('RGB').resize((tw,th),Image.LANCZOS),(x,100))
    d.text((x,100+th+10),f"{int(fr*100)}% · {s['ms']:.0f}ms",font=ImageFont.truetype(SANSB,24,index=2),fill=(240,214,160))
    d.text((x,100+th+44),f"clip h {s['h']:.0f}pt · roll y {s['roll_y']:.0f}pt\nroll d {s['d']:.1f}pt · roll α {s['ra']:.2f}\n内容 α {s['ca']:.2f} · 遮罩 {s['dim']*100:.0f}%",font=ImageFont.truetype(SANS,19,index=2),fill=CREAM,spacing=6)
# curve plot (small, code-drawn)
px0,py0,pw_,ph_=gap+3*(tw+gap)-0,0,0,0
out.save(O+'keyframes_strip.png',optimize=True)
# curves chart
cw,ch=900,470; cv=Image.new('RGB',(cw,ch),(40,28,18)); d=ImageDraw.Draw(cv); m=60
d.rectangle([m,30,cw-30,ch-m-50],outline=(120,100,70))
f=ImageFont.truetype(SANS,16,index=2)
series=[('p 展开进度 / clip h',(240,214,160),lambda t:state_open(t)['p']),('roll d (40→14) 归一',(230,90,90),lambda t:(state_open(t)['d']-14)/26),
        ('roll α',(120,190,240),lambda t:state_open(t)['ra']),('内容 α',(140,220,140),lambda t:state_open(t)['ca']),('遮罩/0.30',(200,160,240),lambda t:state_open(t)['dim']/0.3)]
for j,(nm,col,fn) in enumerate(series):
    pts=[(m+(cw-30-m)*t/200,(ch-m-50)-(ch-m-80)*fn(t/200)) for t in range(201)]
    d.line(pts,fill=col,width=3); d.text((m+j*170,ch-30),nm,font=f,fill=col)
for t in (0,.3,.6,1): x=m+(cw-30-m)*t; d.line([(x,30),(x,ch-m-50)],fill=(90,75,55)); d.text((x-12,ch-m-42),f'{int(t*350)}ms',font=f,fill=CREAM)
d.text((m,6),'展开曲线（横轴时间 0–350ms，纵轴 0–1）',font=f,fill=CREAM)
cv.save(O+'curves_open.png',optimize=True)
for fr in (0,.3,.6,1): s=state_open(fr); print(fr,{k:round(v,2) for k,v in s.items()})
