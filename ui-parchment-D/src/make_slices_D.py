"""D_final new slices. Same PD vellum/leather sources + self-drawn ink as ui-parchment-v2 v3.
Generated at @3x (3 texel/pt), @2x = LANCZOS downscale of the @3x master; pngquant without heavy dither."""
import numpy as np, math, os, subprocess, shutil
from PIL import Image, ImageDraw, ImageFilter
src=open('/workspace/ui-parchment-v2/src/make_textures_v3.py').read()
head=src.split('# ---------------- bg_parchment.jpg')[0].replace("T=B+'textures_v3/'","T='/workspace/ui-minimal/D_final/src/_work/'")
exec(head)
exec('vel=Image.open'+src.split('vel=Image.open',1)[1].split('# ---------------- panel_vellum')[0])
inkpart=src.split('# ---------------- ink helpers for icons / guide ----------------')[1].split("for name,fn,col,role in")[0]
exec(inkpart)
OUT='/workspace/ui-minimal/D_final/textures/'
QD={'drawer_vellum':'65-88','roll_paper':'70-92'}
def ship(img3,name,logical):
    w2,h2=logical[0]*2,logical[1]*2
    assert img3.size==(logical[0]*3,logical[1]*3),(name,img3.size)
    for sc,im in ((3,img3),(2,img3.resize((w2,h2),Image.LANCZOS))):
        p=OUT+f'{name}@{sc}x.png'; im.save(p,optimize=True,compress_level=9); raw=os.path.getsize(p)
        q=p+'.q.png'
        r=subprocess.run([PNGQ,'--quality='+QD.get(name,'80-98'),'--floyd=0.15','--speed','1','--strip','--force','--output',q,p],capture_output=True)
        if r.returncode==0 and os.path.exists(q) and os.path.getsize(q)<raw*0.9: os.replace(q,p)
        elif os.path.exists(q): os.remove(q)
        print(f'{name}@{sc}x', im.size, os.path.getsize(p))

# ---------- tag_parchment 104x40pt (visual 96x32 + 4pt baked soft shadow pad) ----------
def tag(name,tint=None,seed=71):
    LW_,LH_=104,40; W_,H_=px(LW_),px(LH_); pad=px(4)
    iw,ih=W_-2*pad,H_-2*pad
    p,a,d=vellum((.18,.50,.70,.60),(iw,ih),3.2,0.85,seed,2.4,0.65,0.55)
    yy=np.linspace(0,1,ih)[:,None]; p=p+(np.exp(-((yy-0.5)*5)**2)*8)[...,None]
    # thin ink rim for contrast against beige fog (review P2-12)
    rim=np.exp(-((d-px(3.2)*0.55-px(1.1))**2)/(px(0.45)**2))
    p=stamp(p,rim,INK,0.55)
    if tint is not None:
        L_=p.mean(2,keepdims=True)/205.0; p=np.clip(np.array(tint,float)*L_*0.9+p*0.1,0,255)
    canvas=np.zeros((H_,W_,3)); A=np.zeros((H_,W_))
    # shadow: offset 1pt down, blur 2.5pt, 35%
    sh=Image.fromarray((a*255).astype(np.uint8)); shc=Image.new('L',(W_,H_),0); shc.paste(sh,(pad,pad+px(1)))
    sha=np.asarray(shc.filter(ImageFilter.GaussianBlur(px(2.5)/2)),float)/255*0.35
    canvas[:]=np.array([40,26,12],float); A=sha
    full=np.zeros((H_,W_)); full[pad:pad+ih,pad:pad+iw]=a
    col=canvas.copy(); col[pad:pad+ih,pad:pad+iw]=p
    outA=full+A*(1-full)
    outC=(col*full[...,None]+canvas*(A*(1-full))[...,None])/np.maximum(outA,1e-6)[...,None]
    ship(rgba(outC,outA),name,(LW_,LH_))
tag('tag_parchment')
tag('tag_madder',tint=(150,52,40),seed=73)

# ---------- btn_icon_style 52pt: palette + brush, ink ----------
def icon_style(w):
    m,k=ss_canvas(w,w); d=ImageDraw.Draw(m); W_=w*k; lw=int(W_*0.045)
    # palette: blob outline with thumb hole and 3 paint wells
    d.ellipse([0.14*W_,0.26*W_,0.74*W_,0.78*W_],outline=255,width=lw)
    d.ellipse([0.22*W_,0.56*W_,0.34*W_,0.68*W_],outline=255,width=int(lw*0.8))   # thumb hole
    for (x,y,r) in ((0.32,0.40,0.055),(0.47,0.36,0.05),(0.60,0.47,0.05)):
        d.ellipse([(x-r)*W_,(y-r)*W_,(x+r)*W_,(y+r)*W_],fill=255)
    # brush: diagonal handle + ferrule + tip, crossing lower-right
    import math as _m
    x0,y0,x1,y1=0.86*W_,0.16*W_,0.50*W_,0.70*W_
    d.line([(x0,y0),(x1+0.08*W_,y1-0.12*W_)],fill=255,width=int(W_*0.05))
    d.line([(x1+0.08*W_,y1-0.12*W_),(x1+0.03*W_,y1-0.045*W_)],fill=255,width=int(W_*0.075))
    d.polygon([(x1+0.055*W_,y1-0.075*W_),(x1+0.005*W_,y1-0.075*W_+0.0*W_),(x1-0.03*W_,y1+0.07*W_),(x1+0.06*W_,y1-0.02*W_)],fill=255)
    return mask_down(m,w,w)
p,a=disc_base(52,29); w=px(52); g=icon_style(int(w*0.84)); G=np.zeros((w,w)); o=(w-g.shape[0])//2; G[o:o+g.shape[0],o:o+g.shape[1]]=g
# madder dabs in wells
p=stamp(p,G,INK,0.9)
ship(rgba(p,a),'btn_icon_style',(52,52))

# ---------- icon_check 20pt ink tick (style list) ----------
w=px(20); m,k=ss_canvas(w,w); d=ImageDraw.Draw(m); W_=w*k
pts=[(0.14,0.52),(0.40,0.78),(0.88,0.20)]
for i in range(2):
    a0,b0=pts[i],pts[i+1]
    for t in np.linspace(0,1,30):
        x=(a0[0]+(b0[0]-a0[0])*t)*W_; y=(a0[1]+(b0[1]-a0[1])*t)*W_; r=W_*(0.07 if i==0 else 0.075*(1-0.55*t))
        d.ellipse([x-r,y-r,x+r,y+r],fill=255)
mk=mask_down(m,w,w); col=np.ones((w,w,3))*np.array(MAD,float)
ship(rgba(col,mk),'icon_check',(20,20))

# ---------- drawer_vellum 200x140pt, 9-slice; torn edge only on bottom; top/sides bleed off-screen ----------
DW,DH=px(200),px(140)
c=vel.crop((int(vw*.14),int(vh*.15),int(vw*.74),int(vh*.55))).resize((DW,DH),Image.LANCZOS)
pp=calm(gradmap(c,(140,104,64),(208,182,136),(236,220,184),(0.005,0.999)),0.55)
colm=np.asarray(Image.fromarray(np.clip(pp,0,255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(px(10))),float).mean(0,keepdims=True)
pp=pp-(colm-colm.mean((0,1),keepdims=True))*0.85
rowm=pp.mean(1,keepdims=True); pp=pp-(rowm-rowm.mean((0,1),keepdims=True))*0.6
yy,xx=np.mgrid[0:DH,0:DW]
n=fbm(DW,DH,6,6,81)-0.5; n2=fbm(DW,DH,3,40,90)-0.5
margin=px(9)
dist=(DH-1-yy).astype(float)+n*margin*1.6+n2*margin*0.5   # distance to bottom only
a=np.clip((dist-margin*0.55)/1.5,0,1)
pp=burn_rim(pp,dist,px(6.5),0.75,seed=82)
# soft darkening toward the very top (under status bar / capsule) to seat the paper
pp=pp*(1-0.10*np.clip(1-yy/px(30),0,1)[...,None])
ship(rgba(pp,a),'drawer_vellum',(200,140))

# ---------- roll_paper 160x24pt: rolled vellum cylinder edge-on (horizontal bar), 3-slice L/R 16pt ----------
RW,RH=px(160),px(24)
c=vel.crop((int(vw*.2),int(vh*.6),int(vw*.7),int(vh*.66))).resize((RW,RH),Image.LANCZOS)
pr=calm(gradmap(c,(150,112,70),(214,190,146),(240,228,198),(0.005,0.999)),0.7,3.0)
v=np.linspace(-1,1,RH)[:,None]
shade=0.55+0.55*np.sqrt(np.clip(1-v**2,0,1))-0.18*np.clip(v,0,1)  # cylinder: lit top-mid, dark underside
spec=np.exp(-((v+0.35)/0.18)**2)*0.12
pr=np.clip(pr*shade[...,None]+255*spec[...,None],0,255)
# end caps: rounded ends + spiral cross-section hint (ink arcs) within 16pt
m,k=ss_canvas(RW,RH); d=ImageDraw.Draw(m); Wk,Hk=RW*k,RH*k; r=Hk/2
d.rounded_rectangle([px(3)*k,0,Wk-px(3)*k,Hk-1],radius=r,fill=255)
am=mask_down(m,RW,RH)
s2,_=ss_canvas(RW,RH); d2=ImageDraw.Draw(s2); lw=max(2,int(px(0.6)*k))
for cxk in (px(3)*k+r, Wk-px(3)*k-r):
    for rr in (0.78,0.52,0.28):
        d2.arc([cxk-r*rr,Hk/2-r*rr,cxk+r*rr,Hk/2+r*rr],200 if cxk<Wk/2 else -20,340 if cxk<Wk/2 else 120,fill=255,width=lw)
# ink outline along top/bottom edges
d2.line([(px(3)*k+r,lw/2+k),(Wk-px(3)*k-r,lw/2+k)],fill=110,width=lw)
d2.line([(px(3)*k+r,Hk-lw/2-k),(Wk-px(3)*k-r,Hk-lw/2-k)],fill=200,width=lw)
ink=mask_down(s2,RW,RH)
pr=stamp(pr,ink,INK,0.75)
# paper edge feeding out the bottom (seam line where sheet leaves the roll)
ship(rgba(pr,am),'roll_paper',(160,24))

# ---------- roll_shadow 2x16pt: vertical gradient strip, stretch horizontally; draw directly under roll ----------
SW,SH=px(2),px(16)
t=np.linspace(0,1,SH)[:,None]*np.ones((1,SW)); al=(1-t)**2.2*0.55
ship(rgba(np.ones((SH,SW,3))*np.array([40,24,10],float),al),'roll_shadow',(2,16))
