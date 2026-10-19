"""shared helpers for D_final mockups (375x812pt, rendered @2x)."""
import numpy as np, os, math, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter
D='/workspace/ui-minimal/D_final/'; TX=D+'textures/'
K=2; LW,LH=375,812; W,H=LW*K,LH*K
INK=(58,42,24); INK_SOFT=(92,74,50); CREAM=(243,230,200); MADDER=(139,46,46); LEA_TXT=(246,232,204)
SANS='/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'; SANSB='/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
SERIF='/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc'; SERIFR='/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc'
def F(p,pt): return ImageFont.truetype(p,int(round(pt*K)),index=2)
MAN={t['file'].replace('@2x.png',''):t for t in json.load(open(D+'manifest.json'))['textures']}
BASE=Image.open('/workspace/ui-minimal/src/scene_clean.png').convert('RGB').resize((W,H),Image.LANCZOS)
CAPSULE=(281,48,368,80)       # right 7pt, top = statusBar 44 + 4, 87x32
STATUS=44; HOME=34
TAG_W,TAG_H=96,32; TAG_X=(LW-TAG_W)/2; TAG_Y=48     # visual tag rect, vertically centred with capsule
def scene(): return BASE.copy().convert('RGBA')
def tex(n): return Image.open(TX+n+'@2x.png').convert('RGBA')
def tpt(n,w,h): return tex(n).resize((int(round(w*K)),int(round(h*K))),Image.LANCZOS)
def nine(n,w,h,dst=None):
    m=MAN[n]; im=tex(n); L,T_,R_,B_=m['nine_slice_insets']; Lp,Tp,Rp,Bp=dst or m['nine_slice_insets_pt']
    sw,sh=im.size; dw,dh=int(round(w*K)),int(round(h*K)); dL,dT,dR,dB=[int(round(v*K)) for v in (Lp,Tp,Rp,Bp)]
    if dL+dR>dw: f=dw/(dL+dR+2); dL=int(dL*f); dR=int(dR*f)
    if dT+dB>dh: f=dh/(dT+dB+2); dT=int(dT*f); dB=int(dB*f)
    out=Image.new('RGBA',(dw,dh)); xs=[0,L,sw-R_,sw]; ys=[0,T_,sh-B_,sh]; X=[0,dL,dw-dR,dw]; Y=[0,dT,dh-dB,dh]
    for r in range(3):
        for c in range(3):
            if X[c+1]-X[c]>0 and Y[r+1]-Y[r]>0 and xs[c+1]-xs[c]>0 and ys[r+1]-ys[r]>0:
                out.paste(im.crop((xs[c],ys[r],xs[c+1],ys[r+1])).resize((X[c+1]-X[c],Y[r+1]-Y[r]),Image.LANCZOS),(X[c],Y[r]))
    return out
def put(c,im,x,y,shadow=0.3,alpha=1.0):
    X,Y=int(round(x*K)),int(round(y*K))
    if alpha<1: im=im.copy(); im.putalpha(im.split()[3].point(lambda v:int(v*alpha)))
    if shadow:
        a=im.split()[3].filter(ImageFilter.GaussianBlur(3*K/2)); sh=Image.new('RGBA',im.size,(30,18,8,0)); sh.putalpha(a.point(lambda v:int(v*shadow)))
        c.alpha_composite(sh,(X+K,Y+2*K))
    c.alpha_composite(im,(X,Y))
def text(c,xy,s,font,fill=INK,anchor='la',halo=None,hw=2,alpha=255):
    lay=Image.new('RGBA',c.size,(0,0,0,0)); d=ImageDraw.Draw(lay)
    kw=dict(stroke_width=hw,stroke_fill=halo) if halo else {}
    d.text((xy[0]*K,xy[1]*K),s,font=font,fill=fill,anchor=anchor,**kw)
    if alpha<255: lay.putalpha(lay.split()[3].point(lambda v:v*alpha//255))
    c.alpha_composite(lay)
def badge(c,cx,cy,label,r=8):
    d=ImageDraw.Draw(c); R=r*K; w=max(R,(len(label)*3.2+4)*K)
    d.rounded_rectangle([cx*K-w,cy*K-R,cx*K+w,cy*K+R],radius=R,fill=MADDER+(255,),outline=CREAM+(255,),width=int(1.2*K))
    text(c,(cx,cy+0.3),label,F(SANSB,11),fill=CREAM,anchor='mm')
def dot(c,cx,cy,r=4.5):
    d=ImageDraw.Draw(c); d.ellipse([(cx-r)*K,(cy-r)*K,(cx+r)*K,(cy+r)*K],fill=MADDER+(255,),outline=CREAM+(255,),width=int(1.2*K))
def dim(c,a): c.alpha_composite(Image.new('RGBA',c.size,(30,20,10,int(255*a))))
def chev(c,cx,cy,up,col=INK,w=1.8):
    d=ImageDraw.Draw(c); pts=[(cx-5,cy-2),(cx,cy+3),(cx+5,cy-2)] if not up else [(cx-5,cy+2),(cx,cy-3),(cx+5,cy+2)]
    d.line([(p[0]*K,p[1]*K) for p in pts],fill=col,width=int(w*K),joint='curve')
def chrome(c):
    lay=Image.new('RGBA',c.size,(0,0,0,0)); dl=ImageDraw.Draw(lay); x0,y0,x1,y1=[v*K for v in CAPSULE]
    dl.rounded_rectangle([x0,y0,x1,y1],radius=16*K,fill=(255,255,255,170),outline=(0,0,0,40),width=1)
    dl.line([((x0+x1)/2,y0+8*K),((x0+x1)/2,y1-8*K)],fill=(0,0,0,60),width=1)
    for k in (-6,0,6): dl.ellipse([x0+22*K+k*K-2*K,(y0+y1)/2-2*K,x0+22*K+k*K+2*K,(y0+y1)/2+2*K],fill=(0,0,0,170))
    dl.ellipse([x1-30*K,(y0+y1)/2-8*K,x1-14*K,(y0+y1)/2+8*K],outline=(0,0,0,170),width=2*K)
    dl.rounded_rectangle([(LW/2-67)*K,(LH-13)*K,(LW/2+67)*K,(LH-8)*K],radius=3*K,fill=(20,20,20,200))  # home indicator
    c.alpha_composite(lay)
    text(c,(28,24),'9:41',F(SANSB,14),fill=(20,20,20),anchor='lm')
def tag(c,rem='288',state='idle',y=TAG_Y,reddot=True,up=False,alpha=1.0):
    """state idle|exhausted. tag slice has 4pt pad; visual rect = (TAG_X,y,96,32)"""
    n='tag_madder' if state=='exhausted' else 'tag_parchment'
    w=TAG_W if state=='idle' else 112; x=(LW-w)/2
    put(c,nine(n,w+8,TAG_H+8),x-4,y-4,0,alpha)
    if state=='idle':
        text(c,(LW/2-8,y+16),'余 '+rem,F(SANSB,13),fill=INK,anchor='mm',alpha=int(255*alpha))
        chev(c,LW/2+30,y+16,up)
        if reddot: dot(c,x+w-3,y+3)
    else:
        text(c,(LW/2-7,y+16),'树根用尽',F(SANSB,13),fill=CREAM,anchor='mm',alpha=int(255*alpha))
        chev(c,LW/2+38,y+16,up,col=CREAM)
    return (x,y,w,TAG_H)
def wrap(txt,font,maxw_px):
    lines=[]; cur=''
    for ch in txt:
        if font.getlength(cur+ch)>maxw_px and cur:
            if ch in '，。、；！？）」': cur+=ch; ch=''
            lines.append(cur); cur=ch
        else: cur+=ch
    if cur: lines.append(cur)
    return [l for l in lines if l]
# ---------------- drawer ----------------
DRAWER_BOTTOM=400
def roll(c,cy,d,width=LW+20,alpha=1.0,shadow=True):
    """roll_paper 3-slice, diameter d pt centred at y=cy; roll_shadow strip below"""
    if shadow:
        sh=tex('roll_shadow').resize((int(width*K),max(1,int(0.6*d*K))),Image.BILINEAR)
        if alpha<1: sh.putalpha(sh.split()[3].point(lambda v:int(v*alpha)))
        c.alpha_composite(sh,(int(-10*K),int((cy+d*0.35)*K)))
    e=16*d/24
    im=nine('roll_paper',width,d,dst=[e,0,e,0]); put(c,im,-10,cy-d/2,0,alpha)
def drawer_bg(c,clip_h=None,bottom=DRAWER_BOTTOM):
    """drawer paper drawn at final size; clipped to [0,clip_h] while animating"""
    im=nine('drawer_vellum',LW+56,bottom+24)
    lay=Image.new('RGBA',c.size,(0,0,0,0))
    sh=im.split()[3].filter(ImageFilter.GaussianBlur(5*K)); s=Image.new('RGBA',im.size,(25,15,5,0)); s.putalpha(sh.point(lambda v:int(v*0.45)))
    lay.alpha_composite(s,(int(-28*K),int(-24*K+3*K))); lay.alpha_composite(im,(int(-28*K),int(-24*K)))
    if clip_h is not None:
        m=Image.new('L',c.size,0); ImageDraw.Draw(m).rectangle([0,0,W,int(clip_h*K)],fill=255)
        lay.putalpha(Image.fromarray(np.minimum(np.asarray(lay.split()[3]),np.asarray(m))))
    c.alpha_composite(lay)
STATS=[('今日已砍','12'),('剩余树根','288'),('下一根','00:50')]
ICONS=[('btn_icon_rank','好友柴榜',None),('btn_icon_ad','看短片加速','8'),('btn_icon_help','玩法',None),('btn_icon_style','风格',None)]
def col_cx(i): return LW/8*(2*i+1)
def drawer_content(c,alpha=1.0,dy=0,pending=40):
    lay=Image.new('RGBA',c.size,(0,0,0,0))
    for i,(l,v) in enumerate(STATS):
        cx=LW/6*(2*i+1)
        text(lay,(cx,104+dy),l,F(SANS,11),fill=INK_SOFT,anchor='mm'); text(lay,(cx,128+dy),v,F(SERIF,22),fill=INK,anchor='mm')
    ImageDraw.Draw(lay,'RGBA').line([(24*K,(152+dy)*K),((LW-24)*K,(152+dy)*K)],fill=INK+(80,),width=1)
    put(lay,nine('btn_leather',LW-64,48),32,164+dy,0.3)
    text(lay,(LW/2,188+dy),'免费领取 柴棚 %d 根'%pending,F(SERIF,16),fill=LEA_TXT,anchor='mm',halo=(52,30,14),hw=1)
    for i,(ic,l,bd) in enumerate(ICONS):
        cx=col_cx(i); put(lay,tpt(ic,46,46),cx-23,228+dy,0.3)
        if bd: badge(lay,cx+18,232+dy,bd,8)
        text(lay,(cx,288+dy),l,F(SANSB,11),fill=INK,anchor='mm',halo=CREAM+(255,),hw=2)
    put(lay,nine('strip_parchment',230,36),(LW-230)/2,306+dy,0.2)
    text(lay,(LW/2-6,324+dy),'风格：羊皮纸',F(SANS,13),fill=INK,anchor='mm'); text(lay,(LW/2+58,324+dy),'〉',F(SANS,13),fill=INK_SOFT,anchor='mm')
    if alpha<1: lay.putalpha(lay.split()[3].point(lambda v:int(v*alpha)))
    c.alpha_composite(lay)
def drawer_open(c,content=True,dimv=0.30,hint=True):
    dim(c,dimv); drawer_bg(c)
    if content: drawer_content(c)
    tag(c,y=DRAWER_BOTTOM-16,reddot=False,up=True)
    if hint: text(c,(LW/2,DRAWER_BOTTOM+40),'上推 / 点空白处 / 点小签 收起',F(SANS,11),fill=CREAM,anchor='mm',halo=(0,0,0,150),hw=2)
# ---------------- exhausted panel ----------------
def exhausted_panel(c,pending=40):
    dim(c,0.42)
    pw=300; pad=24; inner=pw-2*pad; x0=(LW-pw)/2
    fT=F(SERIF,17); fB=F(SANS,13)
    body=wrap('明日卯时，林中自会再生。也可以看一支短片，今天多砍 20 根。',fB,inner*K)
    lh=13*1.4; y=34; items=[('title',y)]; y+=17*1.4+8
    for ln in body: items.append(('body',y,ln)); y+=lh
    y+=10; items.append(('rule',y)); y+=14
    if pending: items.append(('claim',y)); y+=44+10
    items.append(('ad',y)); y+=48+8; items.append(('close',y)); y+=22; ph=y+20
    y0=round((LH-ph)/2)
    put(c,nine('panel_vellum',pw,ph),x0,y0,0.45)
    rw=210; rh=40; put(c,nine('ribbon_madder',rw,rh),LW/2-rw/2,y0-rh/2,0.3)
    text(c,(LW/2,y0-1),'树根用尽',F(SERIF,17),fill=LEA_TXT,anchor='mm')
    d=ImageDraw.Draw(c,'RGBA'); geo={'panel':(x0,y0,pw,ph),'body_lines':len(body),'inner':inner}
    for it in items:
        k=it[0]; yy=y0+it[1]
        if k=='title': text(c,(LW/2,yy+12),'今天的树根已经砍完了',fT,fill=INK,anchor='mm'); geo['title_y']=yy
        elif k=='body': text(c,(x0+pad,yy+lh/2),it[2],fB,fill=INK_SOFT,anchor='lm'); geo.setdefault('body_y',yy)
        elif k=='rule': d.line([((x0+pad)*K,yy*K),((x0+pw-pad)*K,yy*K)],fill=INK+(80,),width=1)
        elif k=='claim':
            put(c,nine('strip_parchment',inner,44),x0+pad,yy,0.2); geo['claim']=(x0+pad,yy,inner,44)
            text(c,(LW/2,yy+22),'免费领取 柴棚 %d 根'%pending,F(SERIF,15),fill=INK,anchor='mm')
        elif k=='ad':
            put(c,nine('btn_leather',inner,48),x0+pad,yy,0.3); geo['ad']=(x0+pad,yy,inner,48)
            text(c,(LW/2,yy+24),'▶ 看短片 再砍 20 根',F(SERIF,15),fill=LEA_TXT,anchor='mm',halo=(52,30,14),hw=1)
        elif k=='close': text(c,(LW/2,yy+11),'知道了',F(SANS,13),fill=INK_SOFT,anchor='mm'); geo['close']=(LW/2-40,yy-6,80,34)
    return geo
# ---------------- annotation layer ----------------
AC=(225,0,130); SC=(0,160,215)
def ann_box(c,r,label=None,side='r',col=AC,dash=False):
    x,y,w,h=r; d=ImageDraw.Draw(c,'RGBA'); d.rectangle([x*K,y*K,(x+w)*K,(y+h)*K],outline=col+(255,),width=2)
    if label:
        f=ImageFont.truetype(SANSB,20,index=2); tw=f.getlength(label)
        pos={'r':((x+w)*K+6,(y+h/2)*K-13),'l':(x*K-tw-14,(y+h/2)*K-13),'b':(x*K,(y+h)*K+4),'t':(x*K,y*K-30)}[side]
        d.rectangle([pos[0]-3,pos[1]-1,pos[0]+tw+5,pos[1]+27],fill=(255,255,255,225)); d.text(pos,label,font=f,fill=col)
def ann_v(c,x,y0,y1,label,col=AC,ly=None):
    d=ImageDraw.Draw(c,'RGBA'); d.line([(x*K,y0*K),(x*K,y1*K)],fill=col,width=2)
    for yy in (y0,y1): d.line([((x-4)*K,yy*K),((x+4)*K,yy*K)],fill=col,width=2)
    f=ImageFont.truetype(SANSB,20,index=2); tw=f.getlength(label); px_,py_=x*K+8,((ly if ly is not None else (y0+y1)/2))*K-13
    d.rectangle([px_-3,py_-1,px_+tw+5,py_+27],fill=(255,255,255,225)); d.text((px_,py_),label,font=f,fill=col)
def ann_h(c,y,x0,x1,label,col=AC,above=True):
    d=ImageDraw.Draw(c,'RGBA'); d.line([(x0*K,y*K),(x1*K,y*K)],fill=col,width=2)
    for xx in (x0,x1): d.line([(xx*K,(y-4)*K),(xx*K,(y+4)*K)],fill=col,width=2)
    if not label: return
    f=ImageFont.truetype(SANSB,20,index=2); tw=f.getlength(label); px_,py_=((x0+x1)/2)*K-tw/2,(y*K-32 if above else y*K+4)
    d.rectangle([px_-3,py_-1,px_+tw+5,py_+27],fill=(255,255,255,225)); d.text((px_,py_),label,font=f,fill=col)
def safe_overlay(c):
    lay=Image.new('RGBA',c.size,(0,0,0,0)); d=ImageDraw.Draw(lay)
    d.rectangle([0,0,W,STATUS*K],fill=SC+(45,)); d.rectangle([0,(LH-HOME)*K,W,H],fill=SC+(45,))
    x0,y0,x1,y1=CAPSULE; d.rectangle([(x0-8)*K,(y0-4)*K,(x1+7)*K,(y1+8)*K],outline=SC+(255,),width=2)
    c.alpha_composite(lay)
    f=ImageFont.truetype(SANSB,18,index=2); d=ImageDraw.Draw(c)
    d.text((W-12,6),'状态栏 44pt',font=f,fill=SC,anchor='ra'); d.text((W-12,H-6),'Home 指示条 34pt',font=f,fill=SC,anchor='rd')
    d.text((W-12,30*K),'胶囊 87×32 (右 7 / top 48) · 禁区 8pt',font=f,fill=SC,anchor='ra')
def sheet(path,title,sub,phone,legend,extra=None):
    gap=30; lw_=640
    out=Image.new('RGB',(W+lw_+3*gap,H+150),(40,28,18)); d=ImageDraw.Draw(out)
    d.text((gap,22),title,font=ImageFont.truetype(SANSB,40,index=2),fill=CREAM)
    d.text((gap,80),sub,font=ImageFont.truetype(SANS,22,index=2),fill=(214,196,160))
    out.paste(phone.convert('RGB'),(gap,130))
    y=130; fx=ImageFont.truetype(SANS,22,index=2); fh=ImageFont.truetype(SANSB,24,index=2)
    for ln in legend:
        if ln.startswith('#'): y+=10; d.text((W+2*gap,y),ln[1:].strip(),font=fh,fill=(240,214,160)); y+=38; continue
        for sub_ in wrap(ln,fx,lw_): d.text((W+2*gap,y),sub_,font=fx,fill=CREAM); y+=32
    if extra: extra(out,W+2*gap,y+20)
    out.save(path,optimize=True); return out
