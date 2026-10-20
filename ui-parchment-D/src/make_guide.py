from common import *
O=D+'guide/'
def spotlight(c,shapes,a=0.58):
    """dim with soft-edged cutouts. shapes: ('ell',x0,y0,x1,y1) | ('rr',x,y,w,h,r)"""
    m=Image.new('L',c.size,0); d=ImageDraw.Draw(m)
    for s in shapes:
        if s[0]=='ell': d.ellipse([s[1]*K,s[2]*K,s[3]*K,s[4]*K],fill=255)
        else: x,y,w,h,r=s[1:]; d.rounded_rectangle([x*K,y*K,(x+w)*K,(y+h)*K],radius=r*K,fill=255)
    m=m.filter(ImageFilter.GaussianBlur(1.5*K))
    lay=Image.new('RGBA',c.size,(20,13,6,int(255*a))); al=np.asarray(lay.split()[3],float)*(1-np.asarray(m,float)/255)
    lay.putalpha(Image.fromarray(al.astype(np.uint8))); c.alpha_composite(lay)
def rr_stroke(c,x,y,w,h,r=10):
    d=ImageDraw.Draw(c,'RGBA'); d.rounded_rectangle([x*K,y*K,(x+w)*K,(y+h)*K],radius=r*K,outline=(243,226,186,255),width=2*K)
def bubble(c,x,y,w,title,body,step,tail=None,cont=None):
    """left-aligned serif 16 title, sans 12 body, step counter top-right; tail=(cx,'up'|'down')"""
    fB=F(SANS,12); lines=wrap(body,fB,(w-36-0)*K)
    h=16+22+6+len(lines)*12*1.5+(20 if cont else 0)+14
    put(c,nine('guide_bubble',w,h),x,y,0.35)
    if tail:
        cx,dirn=tail; t=tex('guide_tail').resize((24*K,15*K),Image.LANCZOS)
        if dirn=='up': t=t.rotate(180); put(c,t,cx-12,y-13,0)
        else: put(c,t,cx-12,y+h-2,0)
    text(c,(x+18,y+16+11),title,F(SERIF,16),fill=INK,anchor='lm')
    text(c,(x+w-18,y+16+11),f'{step}/3',F(SANSB,11),fill=INK_SOFT,anchor='rm')
    yy=y+16+22+6
    for ln in lines: text(c,(x+18,yy+9),ln,fB,fill=INK_SOFT,anchor='lm'); yy+=18
    if cont: text(c,(x+18,yy+10),cont,F(SANS,11),fill=MADDER,anchor='lm')
    return h
def skip(c):
    put(c,nine('strip_parchment',84,32),(LW-84)/2,712,0.25); text(c,(LW/2,728),'跳过 〉',F(SANS,13),fill=INK,anchor='mm')
def step1():
    c=scene(); tag(c,reddot=False)
    spotlight(c,[('ell',104,292,272,500)])
    ring=tex('guide_ring').resize((int(176*K),int(216*K)),Image.LANCZOS); put(c,ring,100,288,0)
    # fingertip hotspot (30,3)pt -> top-face centre (187,330)
    put(c,tpt('guide_hand',64,64),187-30,334-3,0.2)
    lay=Image.new('RGBA',c.size,(0,0,0,0)); d=ImageDraw.Draw(lay)
    for r,a in ((8,220),(15,140),(22,70)): d.ellipse([(187-r)*K,(334-r*0.5)*K,(187+r)*K,(334+r*0.5)*K],outline=(58,42,24,a),width=2*K)
    c.alpha_composite(lay)
    bubble(c,52,170,271,'点一下木头，劈开它','按住左右拖动，可以转着看。',1,tail=(187,'down'))
    skip(c); chrome(c); return c
def step2():
    c=scene(); r=tag(c,reddot=True)
    x,y,w,h=r; spotlight(c,[('rr',x-4,y-4,w+8,h+8,12)]); rr_stroke(c,x-4,y-4,w+8,h+8,12)
    tag(c,reddot=True)  # tag stays fully visible & tappable in the cutout
    bubble(c,40,108,295,'这里是今天剩下的树根','砍完会慢慢长回来。点它或在它上面往下拉，可以打开抽屉。',2,tail=(LW/2,'up'),cont='轻点任意处继续')
    skip(c); chrome(c); return c
def step3():
    c=scene(); drawer_open(c,hint=False)
    targets=[(28,160,LW-56,56),((LW-230)/2-4,302,238,44)]
    spotlight(c,[('rr',*t,12) for t in targets],a=0.5)
    for t in targets: rr_stroke(c,*t,12)
    h=bubble(c,40,448,295,'免费领柴，换个风格','柴棚里的柴点「免费领取」就能拿，不用看广告；「风格」可以换成别的画风。点空白处收起抽屉。',3,tail=(LW/2,'up'))
    put(c,nine('btn_leather',200,48),(LW-200)/2,448+h+12,0.3)
    text(c,(LW/2,448+h+36),'知道了，开砍！',F(SERIF,16),fill=LEA_TXT,anchor='mm',halo=(52,30,14),hw=1)
    skip(c); chrome(c); return c
ims=[step1(),step2(),step3()]
for i,im in enumerate(ims): im.convert('RGB').save(O+f'guide_step{i+1}.png',optimize=True)
gap=30; out=Image.new('RGB',(gap+3*(W+gap),H+260),(40,28,18)); d=ImageDraw.Draw(out)
d.text((gap,20),'D · 新手引导 3 步（首帧即 3D 场景，无开始按钮；wx.setStorageSync(\'fw_guide_v1\')）',font=ImageFont.truetype(SANSB,34,index=2),fill=CREAM)
d.text((gap,72),'0.3.3 复核 P0–P2 已改：只框目标 · 圆角矩形（椭圆仅第 1 步）· 步骤 n/3 · serif 16pt 左对齐 · 尾巴指目标 · 小签不隐藏 · 开砍钮紧贴气泡',font=ImageFont.truetype(SANS,22,index=2),fill=(214,196,160))
caps=['1/3 点木头（椭圆 ring，仅此步）','2/3 只框顶部小签（圆角矩形）','3/3 抽屉自动展开：框「免费领取」+「风格」']
for i,im in enumerate(ims):
    x=gap+i*(W+gap); d.text((x,120),caps[i],font=ImageFont.truetype(SANSB,26,index=2),fill=(240,214,160)); out.paste(im.convert('RGB'),(x,160))
out.save(O+'guide_strip.png',optimize=True); print('ok')
