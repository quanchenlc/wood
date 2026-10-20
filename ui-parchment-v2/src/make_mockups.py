import numpy as np, os, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops
B='/workspace/ui-parchment-v2/'; T=B+'textures/'; M=B+'mockups/'; F=B+'fonts/'
W,H=750,1334
INK=(52,32,18); INK2=(92,62,38); CREAM=(236,222,190)
FT=F+'MaShanZheng-Regular.ttf'; FB=F+'LXGWWenKai-Regular.ttf'
FN='/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc'
rng=np.random.default_rng(3)
def font(p,s,idx=0): return ImageFont.truetype(p,s,index=idx)
def tex(n): return Image.open(T+n).convert('RGBA')

def background():
    return tex('bg_parchment.jpg').resize((W,H),Image.BICUBIC)

def noise(w,h,scale=6,seed=0):
    r=np.random.default_rng(seed); g=r.random((h//scale+2,w//scale+2))
    return np.asarray(Image.fromarray((g*255).astype(np.uint8)).resize((w,h),Image.BICUBIC),float)/255

def place(canvas,im,xy,shadow=True,angle=0):
    if angle: im=im.rotate(angle,Image.BICUBIC,expand=True)
    if shadow:
        a=np.asarray(im.split()[3],float)/255
        pad=24; sh=Image.new('L',(im.width+pad*2,im.height+pad*2),0)
        sh.paste(Image.fromarray((a*255).astype(np.uint8)),(pad,pad))
        sh=sh.filter(ImageFilter.GaussianBlur(7))
        n=noise(sh.width,sh.height,23,int(xy[0]+xy[1]))
        sa=np.asarray(sh,float)*(0.25+0.25*n)      # uneven, not a perfect drop shadow
        layer=Image.new('RGBA',sh.size,(60,36,18,0)); layer.putalpha(Image.fromarray(sa.astype(np.uint8)))
        canvas.alpha_composite(layer,(int(xy[0])-pad+2,int(xy[1])-pad+5))
    canvas.alpha_composite(im,(int(xy[0]),int(xy[1])))

def nine(im,w,h,i=48):
    """9-slice scale"""
    sw,sh=im.size; out=Image.new('RGBA',(w,h))
    xs=[0,i,sw-i,sw]; ys=[0,i,sh-i,sh]; X=[0,i,w-i,w]; Y=[0,i,h-i,h]
    for r in range(3):
        for c in range(3):
            piece=im.crop((xs[c],ys[r],xs[c+1],ys[r+1])).resize((X[c+1]-X[c],Y[r+1]-Y[r]),Image.BICUBIC)
            out.paste(piece,(X[c],Y[r]))
    return out

def ink_text(canvas,xy,text,fnt,color=INK,anchor='la',opacity=0.92,bleed=True,paper=None):
    """text that sits IN the parchment: soft bleed, uneven density, multiplied"""
    L=Image.new('L',canvas.size,0); d=ImageDraw.Draw(L)
    d.text(xy,text,font=fnt,fill=255,anchor=anchor)
    a=np.asarray(L,float)/255
    if bleed: a=np.maximum(a,np.asarray(L.filter(ImageFilter.GaussianBlur(1.2)),float)/255*0.55)
    n=noise(canvas.width,canvas.height,3,len(text)+int(xy[1]))
    n2=noise(canvas.width,canvas.height,40,7)
    a=a*(0.72+0.22*n+0.12*n2)*opacity        # ink density varies like a quill stroke
    a=np.clip(a,0,1)
    base=np.asarray(canvas,float)
    col=np.array(color,float)
    mix=0.4 if col.mean()<128 else 0.0
    base[...,:3]=base[...,:3]*(1-a[...,None])+ (base[...,:3]*col/255)*a[...,None]*mix + col*a[...,None]*(1-mix)
    canvas.paste(Image.fromarray(base.clip(0,255).astype(np.uint8),'RGBA'))

def emboss_text(canvas,xy,text,fnt,anchor='mm',color=(238,222,188)):
    """lettering pressed into leather and filled with pale pigment"""
    sh=Image.new('RGBA',canvas.size,(0,0,0,0)); ImageDraw.Draw(sh).text((xy[0],xy[1]-2),text,font=fnt,fill=(30,16,8,170),anchor=anchor)
    canvas.alpha_composite(sh.filter(ImageFilter.GaussianBlur(0.8)))
    ink_text(canvas,xy,text,fnt,color=color,anchor=anchor,opacity=1.0,bleed=False)

def quill_line(canvas,x0,y,x1,seed=0,w=2.6,color=INK2,dots=True):
    r=np.random.default_rng(seed)
    L=Image.new('L',canvas.size,0); d=ImageDraw.Draw(L)
    n=int((x1-x0)/6); xs=np.linspace(x0,x1,n)
    wob=np.cumsum(r.normal(0,0.35,n)); wob-=np.linspace(wob[0],wob[-1],n); ys=y+wob+np.sin(np.linspace(0,math.pi,n))*r.uniform(-2,2)
    for k in range(n-1):
        t=k/(n-1); ww=w*(0.35+0.9*math.sin(math.pi*t)**0.6)*r.uniform(0.8,1.15)
        d.line([(xs[k],ys[k]),(xs[k+1],ys[k+1])],fill=int(255*r.uniform(0.75,1)),width=max(1,int(round(ww))))
    if dots:
        for xx in (x0-10, x1+10):
            rr=r.uniform(1.6,2.6); d.ellipse([xx-rr,y-rr,xx+rr,y+rr],fill=230)
    L=L.filter(ImageFilter.GaussianBlur(0.6))
    lay=Image.new('RGBA',canvas.size,color+(0,)); lay.putalpha(L.point(lambda v:int(v*0.85)))
    canvas.alpha_composite(lay)

def ink_ring(canvas,cx,cy,r,seed=0,w=2):
    rr=np.random.default_rng(seed); L=Image.new('L',canvas.size,0); d=ImageDraw.Draw(L)
    a0=rr.uniform(0,6.28); pts=[]
    for k in range(70):
        a=a0+k/64*2*math.pi; q=r+rr.normal(0,0.5)+math.sin(a*2)*1.2
        pts.append((cx+q*math.cos(a),cy+q*math.sin(a)))
    for k in range(len(pts)-1):
        d.line([pts[k],pts[k+1]],fill=int(255*min(1,0.5+0.6*math.sin(k/70*math.pi))),width=w)
    lay=Image.new('RGBA',canvas.size,INK2+(0,)); lay.putalpha(L.filter(ImageFilter.GaussianBlur(0.5)))
    canvas.alpha_composite(lay)

def leather_btn(canvas,cx,cy,w,h,text,size=40,angle=0):
    b=tex('btn_leather.png').resize((w,h),Image.LANCZOS)
    place(canvas,b,(cx-w/2,cy-h/2),angle=angle)
    emboss_text(canvas,(cx,cy+2),text,font(FB,size))

def strip_btn(canvas,cx,cy,w,h,text,size=32,angle=0,seed=0):
    s=tex('strip_parchment.png').resize((w,h),Image.LANCZOS)
    place(canvas,s,(cx-w/2,cy-h/2),angle=angle)
    ink_text(canvas,(cx,cy+2),text,font(FB,size),anchor='mm')

def ribbon(canvas,cx,cy,w,h,text,size=36):
    r=tex('ribbon_madder.png').resize((w,h),Image.LANCZOS)
    place(canvas,r,(cx-w/2,cy-h/2))
    d=ImageDraw.Draw(canvas)
    d.text((cx,cy+1),text,font=font(FB,size),fill=(238,220,186,235),anchor='mm')

def seal(canvas,cx,cy,s=96,angle=-12):
    im=tex('seal_wax.png').resize((s,s),Image.LANCZOS)
    place(canvas,im,(cx-s/2,cy-s/2),angle=angle)

# ======================= 1. HOME =======================
def home():
    c=background()
    ink_text(c,(W/2,250),'来我的花园砍柴',font(FT,104),anchor='mm',opacity=0.95)
    quill_line(c,190,330,560,seed=1,w=3)
    ink_text(c,(W/2,372),'一斧一木 · 日日有柴',font(FB,30),color=INK2,anchor='mm',opacity=0.8)
    seal(c,640,136,96,-14)
    # scene placeholder: faint pencil note, not a frame
    ink_text(c,(W/2,680),'（ 树桩 · 3D 场景区 ）',font(FB,26),color=(120,96,70),anchor='mm',opacity=0.45)
    leather_btn(c,W/2,960,420,124,'开 始 砍 柴',46,angle=0.8)
    strip_btn(c,W/2-150,1110,250,74,'好友柴榜',30,angle=-1.2)
    strip_btn(c,W/2+150,1112,250,74,'每日签到',30,angle=1.0)
    ink_text(c,(W/2,1270),'v0.3 · 羊皮纸稿',font(FB,20),color=(120,96,70),anchor='mm',opacity=0.5)
    c.convert('RGB').save(M+'01_home.png'); return c

# ======================= 2. DAILY / AD =======================
def daily():
    c=background()
    # HUD strips (top)
    s=tex('strip_parchment.png').resize((330,86),Image.LANCZOS)
    place(c,s,(28,60),angle=-1.0); place(c,s,(392,64),angle=0.8)
    ink_text(c,(66,104),'今日已砍',font(FB,26),anchor='lm',color=INK2)
    ink_text(c,(312,102),'37',font(FN,40),anchor='rm')
    ink_text(c,(430,108),'剩余树根',font(FB,26),anchor='lm',color=INK2)
    ink_text(c,(676,106),'0',font(FN,40),anchor='rm',color=(120,36,26))
    # popup panel
    p=nine(tex('panel_vellum.png'),620,560,60)
    place(c,p,(65,380),angle=0.6)
    ribbon(c,W/2,392,400,80,'树根用尽')
    ink_text(c,(W/2,520),'今天的树根已经砍完了',font(FB,34),anchor='mm')
    ink_text(c,(W/2,572),'明日卯时，林中自会再生',font(FB,28),anchor='mm',color=INK2,opacity=0.8)
    quill_line(c,170,630,580,seed=4,w=2.4)
    ink_text(c,(W/2,700),'或 观看一段广告',font(FB,28),anchor='mm',color=INK2,opacity=0.85)
    leather_btn(c,W/2+20,800,380,116,'再领 +5 根',42,angle=-0.6)
    seal(c,W/2-178,796,92,-18)
    ink_text(c,(W/2,1010),'明 日 再 来',font(FB,30),anchor='mm',color=INK2,opacity=0.75)
    quill_line(c,300,1036,450,seed=9,w=1.6,dots=False)
    c.convert('RGB').save(M+'02_daily_ad.png'); return c

# ======================= 3. RANKING =======================
def ranking():
    c=background()
    p=nine(tex('panel_vellum.png'),660,1030,64)
    place(c,p,(45,170),angle=-0.4)
    ribbon(c,W/2,180,440,86,'好友柴榜 · 本周',36)
    rows=[('壹','林间老樵','1,284'),('贰','阿菜','1,102'),('叁','松下客','987'),('肆','小满','640'),('伍','我','512'),('陆','北山','433'),('柒','青禾','301'),('捌','木木','188')]
    y0=300; rh=104
    for k,(rk,name,cnt) in enumerate(rows):
        y=y0+k*rh
        me = name=='我'
        if me:
            hl=tex('strip_parchment.png').resize((600,96),Image.LANCZOS); place(c,hl,(75,y-48),shadow=True,angle=0.5)
        col = (128,38,28) if k<3 else INK
        ink_text(c,(130,y),rk,font(FT,50),anchor='mm',color=col)
        ink_ring(c,215,y,30,seed=k)
        ink_text(c,(215,y+1),name[0],font(FB,30),anchor='mm',color=INK2,opacity=0.8)
        ink_text(c,(268,y),name,font(FB,34),anchor='lm')
        ink_text(c,(600,y),cnt,font(FN,32),anchor='rm')
        ink_text(c,(640,y+3),'根',font(FB,24),anchor='rm',color=INK2,opacity=0.8)
        if k<len(rows)-1 and not me and rows[k+1][1]!='我':
            quill_line(c,120,y+rh/2,630,seed=20+k,w=1.6,dots=False)
    seal(c,664,232,84,-20)
    ink_text(c,(W/2,1150),'— 邀请好友同砍，柴多者居上 —',font(FB,24),anchor='mm',color=INK2,opacity=0.7)
    strip_btn(c,W/2,1262,300,80,'返 回',32,angle=-0.8)
    c.convert('RGB').save(M+'03_ranking.png'); return c

# ======================= 4. LOADING (pure canvas, no textures) =======================
def loading():
    # emulates what a 2D canvas can draw before any asset loads:
    # flat fill + cheap value noise + uneven edge burn + wobbly quill progress
    yy,xx=np.mgrid[0:H,0:W]
    base=np.array([214,192,148],float)
    n1=noise(W,H,90,1); n2=noise(W,H,18,2); n3=noise(W,H,3,3)
    v=(n1-0.5)*26+(n2-0.5)*12+(n3-0.5)*10
    img=base+v[...,None]*np.array([1,0.9,0.75])
    d=np.minimum.reduce([xx,yy,W-1-xx,H-1-yy]).astype(float)
    e=np.clip(1-(d+(n2-0.5)*24+(n1-0.5)*16)/70,0,1)**1.8
    img=img*(1-0.45*e[...,None])+np.array([90,58,30])*0.45*e[...,None]
    # sparse foxing dots
    r=np.random.default_rng(5)
    c=Image.fromarray(img.clip(0,255).astype(np.uint8)).convert('RGBA'); dr=ImageDraw.Draw(c,'RGBA')
    for _ in range(140):
        x,y=r.uniform(0,W),r.uniform(0,H); s=r.uniform(0.6,2.6)
        dr.ellipse([x-s,y-s,x+s,y+s],fill=(140,90,50,int(r.uniform(30,110))))
    ink_text(c,(W/2,560),'来我的花园砍柴',font(FT,88),anchor='mm')
    # progress: empty pencil guide + inked stroke to 62%
    quill_line(c,140,760,610,seed=31,w=1.2,color=(140,112,84),dots=False)
    quill_line(c,140,758,140+470*0.62,seed=32,w=5,color=INK,dots=False)
    dr=ImageDraw.Draw(c,'RGBA'); x=140+470*0.62
    dr.ellipse([x-5,758-5,x+5,758+5],fill=INK+(220,))   # ink pooling at nib
    ink_text(c,(W/2,830),'正在磨斧…  62%',font(FB,30),anchor='mm',color=INK2,opacity=0.85)
    c.convert('RGB').save(M+'04_loading_canvas.png'); return c

ims=[home(),daily(),ranking(),loading()]

# ======================= OVERVIEW =======================
sc=0.5; tw,th=int(W*sc),int(H*sc); gap=30
OW=gap+4*(tw+gap); OH=110+th+60+300
ov=Image.new('RGB',(OW,OH),(44,30,20)); d=ImageDraw.Draw(ov)
d.text((gap,30),'羊皮纸 UI v2 · 真实纸张扫描为底（去 AI 味）',font=font(FB,40),fill=CREAM)
labels=['首页','每日次数 / 广告+5','好友柴榜','加载（纯 canvas 绘制）']
for k,im in enumerate(ims):
    x=gap+k*(tw+gap); ov.paste(im.convert('RGB').resize((tw,th),Image.LANCZOS),(x,110))
    d.text((x,110+th+14),labels[k],font=font(FB,26),fill=CREAM)
y=110+th+70; x=gap
d.text((x,y),'textures/',font=font(FB,26),fill=(200,180,150)); y+=40
for f in ['bg_parchment.jpg','panel_vellum.png','strip_parchment.png','btn_leather.png','ribbon_madder.png','seal_wax.png']:
    im=Image.open(T+f).convert('RGBA'); s_=min(170/im.height, 230/im.width); im=im.resize((int(im.width*s_),int(im.height*s_)))
    ov.paste(im,(x,y),im); d.text((x,y+180),f,font=font(FB,17),fill=(200,180,150)); d.text((x,y+202),f'{im0.size[0] if (im0:=Image.open(T+f)) else 0}x{im0.size[1]} · {os.path.getsize(T+f)/1024:.0f} KB',font=font(FB,17),fill=(170,150,120))
    x+=max(im.width,190)+28
ov.save(M+'overview.png')
for f in sorted(os.listdir(M)): print(M+f, os.path.getsize(M+f))
