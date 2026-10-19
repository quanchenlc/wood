from common import *
O=D+'spec/'
# ---------- a) idle + idle-exhausted ----------
def idle():
    c=scene(); r=tag(c); chrome(c); clean=c.copy()
    a=c.copy(); safe_overlay(a)
    ann_box(a,r,'小签 96×32pt',side='l')
    hx,hy,hw,hh=LW/2-64,40,128,48; ann_box(a,(hx,hy,hw,hh),None,col=(255,140,0))
    ann_h(a,hy+hh+6,hx,hx+hw,'热区 128×48pt (≥44)',col=(255,140,0),above=False)
    ann_h(a,64,r[0]+r[2],CAPSULE[0],'≥45pt',above=True)
    ann_v(a,84,0,TAG_Y,'y=48 (=胶囊 top)',ly=20)
    ann_box(a,(r[0]+r[2]-8,r[1]-5,10,10),None)
    text(a,(LW/2,112),'红点 r4.5pt（代码绘制）· 文字 13pt 粗 · 中线对齐胶囊中线 y64',F(SANSB,10),fill=AC,anchor='mm',halo=(255,255,255,230),hw=2)
    return clean,a
def idle_exhausted():
    c=scene(); r=tag(c,state='exhausted'); chrome(c)
    # gentle pulse ring around tag (one frame)
    d=ImageDraw.Draw(c,'RGBA'); x,y,w,h=r
    d.rounded_rectangle([(x-5)*K,(y-5)*K,(x+w+5)*K,(y+h+5)*K],radius=14*K,outline=MADDER+(110,),width=3)
    # bubble near stump
    bx,by,bw,bh=72,214,232,72
    put(c,nine('guide_bubble',bw,bh),bx,by,0.35)
    t=tex('guide_tail').resize((24*K,15*K),Image.LANCZOS); put(c,t,LW/2-12,by+bh-2,0)
    text(c,(bx+16,by+22),'今日蓄养中 · 00:50 后长出',F(SERIFR,13),fill=INK,anchor='lm')
    put(c,nine('tag_madder',136,36),bx+12,by+34,0.15)
    text(c,(bx+80,by+52),'▶ 看短片 +20 根',F(SANSB,12),fill=CREAM,anchor='mm')
    clean=c.copy(); a=c.copy(); safe_overlay(a)
    ann_box(a,r,'用尽态小签 112×32 (tag_madder)',side='b')
    ann_box(a,(bx,by,bw,bh),'气泡 232×72 · 13pt / 12pt',side='t')
    ann_box(a,(bx+16,by+38,128,28),'按钮 128×28 (热区 44)',side='r')
    return clean,a
ic,ia=idle(); ec,ea=idle_exhausted()
for n,im in (('a1_idle.png',ia),('a2_idle_exhausted.png',ea)): pass
def combo(*ims):
    out=Image.new('RGBA',(W*len(ims)+30*(len(ims)-1),H),(40,28,18,255))
    for i,im in enumerate(ims): out.alpha_composite(im,(i*(W+30),0))
    return out
def sheet2(path,title,sub,phones,caps,legend):
    gap=30; lw_=600; n=len(phones)
    out=Image.new('RGB',(n*W+(n-1)*gap+lw_+3*gap,H+190),(40,28,18)); d=ImageDraw.Draw(out)
    d.text((gap,22),title,font=ImageFont.truetype(SANSB,40,index=2),fill=CREAM)
    d.text((gap,80),sub,font=ImageFont.truetype(SANS,22,index=2),fill=(214,196,160))
    for i,(p,cp) in enumerate(zip(phones,caps)):
        x=gap+i*(W+gap); d.text((x,128),cp,font=ImageFont.truetype(SANSB,26,index=2),fill=(240,214,160)); out.paste(p.convert('RGB'),(x,170))
    y=170; fx=ImageFont.truetype(SANS,22,index=2); fh=ImageFont.truetype(SANSB,24,index=2); X=gap+n*(W+gap)+gap
    for ln in legend:
        if ln.startswith('#'): y+=10; d.text((X,y),ln[1:].strip(),font=fh,fill=(240,214,160)); y+=38; continue
        for s_ in wrap(ln,fx,lw_): d.text((X,y),s_,font=fx,fill=CREAM); y+=32
    out.save(path,optimize=True); return out
sheet2(O+'a_idle.png','D · a) 常态：顶部小签「余 N」+ 红点','场景首帧即可砍（无开始按钮）；常驻 UI 只有这张小签',[ia,ea],['a1 常态（有可领柴 → 红点）','a2 树根用尽常态（茜红小签 + 木头旁气泡）'],[
 '# 小签 tag_parchment','视觉 96×32pt，水平居中 x=139.5，y=48（与胶囊同高、中线 y=64）；切片含 4pt 透明边+投影 → 按 104×40 绘制在 (135.5,44)。','文字「余 N」13pt 粗（PingFang SC 600），墨色 #3a2a18；箭头 v 形箭头 10×5pt 1.8pt 线宽，x=中心+30。N≥1000 时显示「余 1.2k」，宽度固定 96 不随数字变。','热区 128×48pt（y 40–88），大于 44pt；只有这里能开始下拉。','右缘 235.5 → 胶囊左 281，留 45pt；胶囊禁区 8pt 不碰。','红点：r=4.5pt，#8b2e2e + 1.2pt 奶油描边，圆心 = 小签右上角内收 3pt。规则见 interaction.md §3。',
 '# 用尽态 tag_madder','宽 112pt「树根用尽 v 形箭头」13pt 奶油字；进入用尽时 2 次轻脉冲（scale 1→1.06→1，600ms×2），之后静止；红点不显示。','木头旁气泡：guide_bubble 232×72pt，尾巴朝下指木头顶面；第一行 serif 13pt，按钮 tag_madder 136×36 绘制（可见 128×28），12pt 粗「▶ 看短片 +20 根」，热区补到 44pt 高。','气泡在玩家点木头被拦下时出现，6s 后淡出；用尽面板首次自动弹出一次，之后只通过小签/气泡打开。',
 '# 安全区','状态栏 0–44pt、底部 Home 34pt 不放 UI；胶囊用 wx.getMenuButtonBoundingClientRect() 实时取，小签 y = 胶囊 top，高度对齐胶囊中线。'])
# ---------- b) drawer expanded ----------
c=scene(); drawer_open(c); chrome(c); b=c.copy(); safe_overlay(b)
ann_v(b,6,0,DRAWER_BOTTOM,'抽屉 0–400pt（撕边 356–400）',ly=426)
ann_box(b,(24,94,LW-48,46),None)
text(b,(LW/2,89),'统计 3 列：标签 11pt / 数值 serif 22pt',F(SANSB,10),fill=AC,anchor='mm',halo=(255,255,255,230),hw=2)
ann_box(b,(32,164,LW-64,48),None); ann_h(b,159,32,LW-32,'',above=True)
text(b,(LW/2,157),'皮革钮 311×48 · serif 16pt',F(SANSB,10),fill=AC,anchor='mm',halo=(255,255,255,230),hw=2)
for i in range(4): ann_box(b,(col_cx(i)-23,228,46,46))
ann_h(b,226,col_cx(2)-23,col_cx(2)+23,'',above=False)
text(b,(LW/2,366),'圆钮 46pt · 列宽 93.75 · 标签 11pt',F(SANSB,10),fill=AC,anchor='mm',halo=(255,255,255,230),hw=2)
text(b,(LW/2,300),'',F(SANS,11))
ann_box(b,((LW-230)/2,306,230,36),None)
text(b,(LW/2,352),'风格行 230×36 · 13pt',F(SANSB,10),fill=AC,anchor='mm',halo=(255,255,255,230),hw=2)
ann_box(b,(TAG_X,DRAWER_BOTTOM-16,TAG_W,TAG_H),'小签随纸边：top = 底边−16',side='r')
sheet2(O+'b_drawer.png','D · b) 抽屉展开','点小签或在小签上下拉 → 羊皮纸从顶部展开到 y=400pt；内容从 y≥94（胶囊底 80 + 14）开始排',[c,b],['b 成品','b 标注'],[
 '# 纸面 drawer_vellum（9-slice）','绘制矩形 x=−28, y=−24, w=431, h=424（上/左/右边画到屏外，只露底部撕口）；insets pt [28,24,28,44]。','下方暗遮罩 30%（#1e140a）。投影：纸 alpha 模糊 5pt、45%、下移 3pt（代码 shadowBlur 即可）。',
 '# 内容（全部运行时绘制，pt）','统计：三列中心 x=62.5/187.5/312.5；标签 11pt #5c4a32 y=104，数值 serif 22pt y=128；分隔线 y=152，左右 24pt 边距，墨色 30%。','主钮：btn_leather 9-slice，x=32 y=164 311×48；「免费领取 柴棚 N 根」serif 16pt 奶油字 1pt 深描边。N=0 时整行换成灰字「柴棚空了 · 下一批 05:12」并去掉皮革底。','圆钮：46pt，四列中心 x=46.9/140.6/234.4/328.1，y=228；标签 11pt 粗 + 2pt 奶油描边，y=288：好友柴榜 / 看短片加速 / 玩法 / 风格。看短片角标 = 今日剩余次数（r8 茜红胶囊，11pt）。','风格行：strip_parchment 230×36，y=306，「风格：羊皮纸 〉」13pt，点开 = 抽屉第二页（d）。','小签跟着纸边：top = 抽屉底 −16，箭头变 倒 v，红点清除。','收起提示 11pt 奶油字 + 黑色 60% 描边，y=440，只在头 3 次打开时显示。',
 '# 最小字号','全页最小 11pt；文字 ≥ 胶囊底 +14pt；纸面右上 281–368×48–80 被胶囊覆盖属正常（无内容）。'])
# ---------- c) exhausted panel ----------
c=scene(); tag(c,state='exhausted',reddot=False); geo=exhausted_panel(c); chrome(c); x=c.copy(); safe_overlay(x)
px_,py_,pw,ph=geo['panel']; ann_box(x,geo['panel'],None)
ann_h(x,py_+ph+8,px_,px_+pw,f'面板 {pw}×{ph:.0f}pt（按内容算高）',above=False)
ann_h(x,geo['body_y']+geo['body_lines']*18.2+10,px_+24,px_+pw-24,f'内宽 {geo["inner"]}pt（左右 24）· 行高 18.2',above=False)
ann_box(x,geo['claim'],'① 免费领取（N>0 才有）',side='b'); ann_box(x,geo['ad'],None); ann_box(x,geo['close'],None)
ann_v(x,px_-14,py_-20,py_+20,'飘带 40pt 中线=顶边')
sheet2(O+'c_exhausted.png','D · c) 树根用尽面板','一套文案 · 按内宽折行 · 行高 1.4em · 免费领取排在广告前 · 暗遮罩 42%',[c,x],['c 成品','c 标注'],[
 '# 结构（从上到下）','飘带 ribbon_madder 210×40，中线 = 面板顶边，标题严格「树根用尽」serif 17pt 奶油字。','主句「今天的树根已经砍完了」serif 17pt 居中。','副文（唯一一套）「明日卯时，林中自会再生。也可以看一支短片，今天多砍 20 根。」sans 13pt #5c4a32，左对齐，measureText 折到内宽 252pt（300−2×24），行高 18.2pt（1.4em），标点不出现在行首。','分隔线 → ① 纸条钮「免费领取 柴棚 N 根」strip_parchment 252×44 serif 15pt（N>0 才出现，不需看广告）→ ② 皮革钮「▶ 看短片 再砍 20 根」252×48 → ③「知道了」13pt，热区 80×44。','面板高度 = 内容累加 + 上 34 / 下 20pt，不固定拉高；panel_vellum 9-slice insets 40pt。',
 '# 状态','暗遮罩 42%（35–50 区间）；遮罩之下的小签变 tag_madder，红点隐藏，抽屉不可开；任何「领取」入口只留面板里的 ①。','只画一套文案：删除旧 exhausted 绘制路径（0.3.3 P0-1 的根因）。','点遮罩 = 知道了。今日首次用尽自动弹 1 次，之后由小签/木头旁气泡打开。','看完广告：面板淡出 180ms，小签恢复 tag_parchment「余 20」并闪一下。'])
# ---------- d) style list (drawer page 2) ----------
STY=[('原版',(180,150,110)),('晨林写实',(96,128,82)),('卡通低多边形',(214,140,70)),('手绘温馨',(196,120,120)),('羊皮纸',(206,182,136))]
def style_page(c):
    bottom=420; dim(c,0.30); drawer_bg(c,bottom=bottom)
    text(c,(24,108),'〈',F(SANS,15),fill=INK_SOFT,anchor='lm'); text(c,(LW/2,108),'风格',F(SERIF,17),fill=INK,anchor='mm')
    ImageDraw.Draw(c,'RGBA').line([(24*K,128*K),((LW-24)*K,128*K)],fill=INK+(80,),width=1)
    for i,(n,col) in enumerate(STY):
        y=136+i*48
        if n=='羊皮纸': put(c,nine('strip_parchment',LW-48,44),24,y+2,0.15)
        d=ImageDraw.Draw(c); d.ellipse([44*K,(y+13)*K,66*K,(y+35)*K],fill=col+(255,),outline=INK+(255,),width=2)
        text(c,(80,y+24),n,F(SANS,15),fill=INK,anchor='lm')
        if n=='羊皮纸': put(c,tpt('icon_check',20,20),LW-60,y+14,0)
        elif i<4: ImageDraw.Draw(c,'RGBA').line([(40*K,(y+47)*K),((LW-40)*K,(y+47)*K)],fill=INK+(40,),width=1)
    text(c,(LW/2,388),'切换即时生效，下次启动保留',F(SANS,11),fill=INK_SOFT,anchor='mm')
    tag(c,y=bottom-16,reddot=False,up=True)
    return bottom
c=scene(); bt=style_page(c); chrome(c); s=c.copy(); safe_overlay(s)
ann_box(s,(16,92,44,32),'返回 热区 44×32→44',side='b'); ann_box(s,(24,138,LW-48,44),None)
ann_v(s,10,136,136+48*5,'5 行 × 48pt')
ann_box(s,(44,149,22,22),None); ann_box(s,(LW-60,150,20,20),'icon_check 20pt',side='l')
sheet2(O+'d_style.png','D · d) 风格列表（抽屉第二页）','点「风格：羊皮纸 〉」或圆钮「风格」→ 抽屉内容左滑换页（200ms），纸面高度动画 400→420',[c,s],['d 成品','d 标注'],[
 '# 布局','页头：「〈」15pt（热区 44×44，x=16 y=86）+ 标题「风格」serif 17pt 居中 y=108；分隔线 y=128。','5 行，每行 48pt，从 y=136：色样圆点 22pt（代码绘制，1pt 墨线）x=44；名称 15pt x=80；当前项 strip_parchment 327×44 高亮 + icon_check 20pt 右侧（x=315）。','顺序固定：原版 / 晨林写实 / 卡通低多边形 / 手绘温馨 / 羊皮纸；色样颜色取各套主色，代码里配表。','底注 11pt「切换即时生效，下次启动保留」y=388。抽屉底 420，小签随纸边。',
 '# 交互','点一行：勾立即移动，场景在背后切换（显示 loading 进度在小签里：「余 N」→「切换中…」），切完不自动收起抽屉。','「〈」或右滑 → 回到第一页。上推/点外部 → 整个抽屉收起（下次打开回到第一页）。','存储：wx.setStorageSync(\'fw_style\', id)。'])
# ---------- e) friend leaderboard ----------
def rank_panel(c):
    dim(c,0.42); pw,ph=315,456; x0=(LW-pw)/2; y0=176
    put(c,nine('panel_vellum',pw,ph),x0,y0,0.45)
    put(c,nine('ribbon_madder',210,40),LW/2-105,y0-20,0.3); text(c,(LW/2,y0-1),'好友柴榜',F(SERIF,17),fill=LEA_TXT,anchor='mm')
    text(c,(LW/2,y0+36),'今日 · 微信好友',F(SANS,11),fill=INK_SOFT,anchor='mm')
    rows=[('壹','林间老樵','1,284'),('贰','阿菜','1,102'),('叁','松下客','987'),('4','小满','640'),('5','北山','433'),('6','青禾','402')]
    for i,(r,nm,v) in enumerate(rows):
        y=y0+70+i*44
        text(c,(x0+34,y),r,F(SERIF,17 if i<3 else 15),fill=MADDER if i<3 else INK,anchor='mm')
        d=ImageDraw.Draw(c); d.ellipse([(x0+54)*K,(y-14)*K,(x0+82)*K,(y+14)*K],fill=(214,194,152,255),outline=INK+(255,),width=2)
        text(c,(x0+68,y),nm[0],F(SANSB,12),fill=INK_SOFT,anchor='mm')
        text(c,(x0+92,y),nm,F(SANS,14),fill=INK,anchor='lm'); text(c,(x0+pw-28,y),v+' 根',F(SERIF,14),fill=INK,anchor='rm')
        if i<5: ImageDraw.Draw(c,'RGBA').line([((x0+24)*K,(y+22)*K),((x0+pw-24)*K,(y+22)*K)],fill=INK+(40,),width=1)
    y=y0+70+6*44+6
    put(c,nine('strip_parchment',pw-40,44),x0+20,y-22,0.15)
    text(c,(x0+34,y),'23',F(SERIF,14),fill=INK,anchor='mm')
    d=ImageDraw.Draw(c); d.ellipse([(x0+54)*K,(y-14)*K,(x0+82)*K,(y+14)*K],fill=(214,194,152,255),outline=MADDER+(255,),width=2)
    text(c,(x0+68,y),'我',F(SANSB,12),fill=MADDER,anchor='mm'); text(c,(x0+92,y),'我',F(SANSB,14),fill=INK,anchor='lm'); text(c,(x0+pw-28,y),'12 根',F(SERIF,14),fill=INK,anchor='rm')
    put(c,nine('btn_leather',pw-80,44),x0+40,y+34,0.3); text(c,(LW/2,y+56),'邀请好友同砍',F(SERIF,15),fill=LEA_TXT,anchor='mm',halo=(52,30,14),hw=1)
    text(c,(LW/2,y0+ph+24),'点空白处关闭',F(SANS,11),fill=CREAM,anchor='mm',halo=(0,0,0,150),hw=2)
    return (x0,y0,pw,ph),y
c=scene(); tag(c,reddot=False); geo,my=rank_panel(c); chrome(c); r_=c.copy(); safe_overlay(r_)
ann_box(r_,geo,None); ann_h(r_,geo[1]+geo[3]+40,geo[0],geo[0]+geo[2],'面板 315×456pt',above=False)
ann_v(r_,geo[0]-10,geo[1]+48,geo[1]+48+44,'行高 44')
ann_box(r_,(geo[0]+20,my-22,geo[2]-40,44),'「我」行固定在底部',side='t')
sheet2(O+'e_rank.png','D · e) 好友柴榜','从抽屉点「好友柴榜」：抽屉先卷起（250ms），再弹出面板（200ms 淡入 + 0.96→1 缩放）',[c,r_],['e 成品','e 标注'],[
 '# 布局','panel_vellum 315×456pt，x=30 y=176；飘带 210×40 骑顶边，标题「好友柴榜」serif 17pt。','副标题 11pt「今日 · 微信好友」。行 44pt × 6：名次 壹贰叁 serif 17pt 茜红，4 起 serif 15pt 墨色；头像 28pt 圆（真头像，圆形裁切 + 1pt 墨线）；昵称 14pt（超过 7 字截断…）；数值 serif 14pt 右对齐。','「我」行 strip_parchment 275×44 固定在列表下方（不滚走），名次可为 23 / 99+。','主钮「邀请好友同砍」btn_leather 235×44（分享卡，不送奖励，避免诱导分享）。列表 >6 行时纸内滚动，上下 12pt 渐隐。',
 '# 开发注意','好友数据只能在开放数据域（wx.getOpenDataContext + sharedCanvas）里画：主域画面板/飘带/按钮，开放域按同样 pt 规格画行；开放域也要按 dpr 建 sharedCanvas，否则又会糊。','点空白处 / 系统返回 → 关闭，回到场景（不重新打开抽屉）。'])
print('specs done')
