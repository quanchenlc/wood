import numpy as np
from PIL import Image, ImageFilter, ImageOps, ImageChops, ImageEnhance
import os
R='/workspace/ui-parchment-v2/raw/'; T='/workspace/ui-parchment-v2/textures/'
rng=np.random.default_rng(7)

def fbm(w,h,octaves=5,base=8,seed=0):
    r=np.random.default_rng(seed); acc=np.zeros((h,w)); amp=1; tot=0
    for o in range(octaves):
        n=base*2**o
        g=r.random((max(2,int(h*n/w))+1,n+1))
        im=Image.fromarray((g*255).astype(np.uint8)).resize((w,h),Image.BICUBIC)
        acc+=np.asarray(im,float)/255*amp; tot+=amp; amp*=0.5
    return acc/tot

def torn_alpha(w,h,margin,rough=1.0,seed=1,soft=1.2):
    """irregular torn-edge alpha: distance-to-edge perturbed by fbm"""
    yy,xx=np.mgrid[0:h,0:w]
    d=np.minimum.reduce([xx,yy,w-1-xx,h-1-yy]).astype(float)
    n=fbm(w,h,6,6,seed)-0.5
    n2=fbm(w,h,3,40,seed+9)-0.5  # fine fibre nibble
    d=d+n*margin*1.6*rough+n2*margin*0.5
    a=np.clip((d-margin*0.55)/soft,0,1)
    return a, d

def burn_rim(rgb,d,margin,strength=0.55,seed=3):
    """darken towards torn edge like aged/singed rim"""
    t=np.clip(1-(d-margin*0.55)/(margin*0.9),0,1)**2.2
    n=fbm(rgb.shape[1],rgb.shape[0],5,14,seed)
    t=t*np.clip(0.2+1.6*(n-0.3),0,1.4)
    tint=np.array([92,58,30],float)
    out=rgb*(1-strength*t[...,None])+tint*(strength*t[...,None])*0.6
    return np.clip(out,0,255)

def warm(im,target=(214,190,146),amt=0.55):
    """map grey vellum to warm sheepskin via luminance-preserving tint"""
    a=np.asarray(im.convert('RGB'),float)
    L=a.mean(2,keepdims=True)
    t=np.array(target,float)/np.array(target,float).mean()
    w=L*t
    return np.clip(a*(1-amt)+w*amt,0,255)

def gradmap(im,lo=(120,88,52),mid=(206,180,136),hi=(240,226,196),stretch=(0.02,0.995)):
    L=np.asarray(im.convert('L'),float)
    a,b=np.quantile(L,stretch); t=np.clip((L-a)/(b-a),0,1)[...,None]
    lo,mid,hi=[np.array(c,float) for c in (lo,mid,hi)]
    return np.where(t<0.5, lo+(mid-lo)*(t/0.5), mid+(hi-mid)*((t-0.5)/0.5))

def save_png(arr,alpha,path,size=None):
    im=Image.fromarray(np.dstack([arr.astype(np.uint8),(alpha*255).astype(np.uint8)]),'RGBA')
    if size: im=im.resize(size,Image.LANCZOS)
    q=im.quantize(colors=256,method=Image.FASTOCTREE,dither=Image.FLOYDSTEINBERG)
    q.save(path,optimize=True)
    return os.path.getsize(path)

# ---------- 1. full-screen background (750x1334 target -> 576x1024 jpg) ----------
base=Image.open(R+'oldpaper1.jpg').convert('RGB')           # real aged sheet, PD
W,H=base.size; tw=int(H*750/1334)
base=base.crop(((W-tw)//2,0,(W-tw)//2+tw,H)).resize((576,1024),Image.LANCZOS)
b=np.asarray(base,float)
# fold in real vellum grain/creases from Towneley Lectionary (PD) as high-pass overlay
v=Image.open(R+'towneley2.jpg').convert('L')
vw,vh=v.size; v=v.crop((int(vw*.24),int(vh*.08),int(vw*.74),int(vh*.92))).resize((576,1024),Image.LANCZOS)
va=np.asarray(v,float); hp=va-np.asarray(v.filter(ImageFilter.GaussianBlur(18)),float)
b=b+hp[...,None]*0.9
# gentle uneven edge darkening (not a symmetric vignette): fbm-weighted
yy,xx=np.mgrid[0:1024,0:576]
d=np.minimum.reduce([xx/576,yy/1024*1.78,(575-xx)/576,(1023-yy)/1024*1.78])
n=fbm(576,1024,5,5,11)
e=np.clip(1-d/0.16,0,1)**2*(0.5+0.9*n)
b=b*(1-0.35*e[...,None])+np.array([70,45,25])*0.35*e[...,None]
# muted, slightly desaturate
img=Image.fromarray(np.clip(b,0,255).astype(np.uint8))
img=ImageEnhance.Color(img).enhance(0.82)
img.save(T+'bg_parchment.jpg',quality=80,optimize=True,progressive=True)

# ---------- 2. panel (torn vellum leaf), 9-slice ready ----------
v=Image.open(R+'towneley2.jpg').convert('RGB'); vw,vh=v.size
crop=v.crop((int(vw*.14),int(vh*.12),int(vw*.74),int(vh*.57))).resize((640,480),Image.LANCZOS)
p=gradmap(crop,(140,104,64),(208,182,136),(236,220,184),(0.005,0.999))
p=np.asarray(ImageEnhance.Contrast(Image.fromarray(p.astype(np.uint8))).enhance(1.0),float)

a,d=torn_alpha(640,480,28,1.0,seed=5)
p=burn_rim(p,d,20,0.75,seed=4)
s=save_png(p,a,T+'panel_vellum.png',(400,300))

# ---------- 3. long strip (list row / secondary button) ----------
strip=v.crop((int(vw*.14),int(vh*.62),int(vw*.74),int(vh*.75))).resize((720,160),Image.LANCZOS)
sp=gradmap(strip,(140,104,64),(208,182,136),(236,220,184),(0.005,0.999))
a,d=torn_alpha(720,160,14,1.1,seed=21)
sp=burn_rim(sp,d,9,0.65,seed=22)
save_png(sp,a,T+'strip_parchment.png',(360,80))

# ---------- 4. leather tab button ----------
L=Image.open(R+'leather.jpg').convert('RGB').crop((300,40,900,252)).resize((680,240),Image.LANCZOS)
la=np.asarray(ImageEnhance.Color(L).enhance(0.7),float)*0.92
a,d=torn_alpha(680,240,10,0.35,seed=31,soft=1.5)   # cut leather: mild irregularity
# rounded corners
yy,xx=np.mgrid[0:240,0:680]; r=34
cx=np.clip(xx,r,679-r); cy=np.clip(yy,r,239-r)
a*=np.clip(r-np.hypot(xx-cx,yy-cy)+1,0,1)
# worn edge darkening (oil / handling)
t=np.clip(1-d/30,0,1)**1.4; la=la*(1-0.45*t[...,None])
# pressed groove line ~14px in, irregular (tooled crease, not perfect)
n=fbm(680,240,3,8,33)
groove=np.exp(-((d-16-(n-0.5)*3)**2)/3.0)
la=la*(1-0.22*groove[...,None])
save_png(la,a,T+'btn_leather.png',(340,120))

# ---------- 5. ribbon (madder-dyed vellum strip, forked ends) ----------
rb=Image.open(R+'leather.jpg').convert('RGB').crop((320,200,940,322)).resize((760,150),Image.LANCZOS)
rbl=np.asarray(rb.convert('L'),float)
rbl=(rbl-rbl.mean())*1.3+128
col=np.array([118,38,30],float)
ra=np.clip(col*(rbl[...,None]/128),0,255)
a,d=torn_alpha(760,150,8,0.9,seed=41)
yy,xx=np.mgrid[0:150,0:760]
notch=60; cut=np.abs(yy-75)/75*notch      # swallowtail
a*=np.clip(xx-(notch-cut)+1,0,1)*np.clip((759-xx)-(notch-cut)+1,0,1)
# soft fold shading near ends
fold=np.exp(-((xx-110)**2)/900)+np.exp(-((xx-650)**2)/900)
ra=ra*(1-0.3*fold[...,None])
ra=burn_rim(ra,d,8,0.4,seed=42)
save_png(ra,a,T+'ribbon_madder.png',(380,75))

# ---------- 6. wax seal (real 1778 guild seal, PD) ----------
sl=Image.open(R+'seal_merchant.jpg').convert('RGB')
sa=np.asarray(sl,float)
sat=sa.max(2)-sa.min(2); lum=sa.mean(2)
alpha=np.clip((sat-40)/30,0,1)*np.clip((250-lum)/20,0,1)
alpha=np.asarray(Image.fromarray((alpha*255).astype(np.uint8)).filter(ImageFilter.MedianFilter(5)).filter(ImageFilter.GaussianBlur(1)),float)/255
# mute to brick red
g=sa.mean(2,keepdims=True); sa=sa*0.7+g*np.array([1.25,0.55,0.45])*0.3
sa=sa*np.array([0.86,0.8,0.8])
save_png(sa,alpha,T+'seal_wax.png',(128,129))

for f in sorted(os.listdir(T)): print(f, Image.open(T+f).size, os.path.getsize(T+f))
print('total',sum(os.path.getsize(T+f) for f in os.listdir(T)))
