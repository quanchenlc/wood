import json, os, shutil
from PIL import Image
D='/workspace/ui-minimal/D_final/'; T=D+'textures/'
SRC='/workspace/ui-parchment-v2/export/textures/'; MS='/workspace/ui-minimal/slices/'
old=json.load(open('/workspace/ui-parchment-v2/export/manifest.json'))
OLD={t['file'].replace('@2x.png',''):t for t in old['textures']}
SHIP_OLD={'btn_icon_ad':'抽屉圆钮「看短片加速」(角标=今日剩余次数，代码绘制)',
 'btn_icon_help':'抽屉圆钮「玩法」(重看引导)',
 'btn_icon_rank':'抽屉圆钮「好友柴榜」',
 'btn_leather':'主 CTA：抽屉「免费领取 柴棚 N 根」/ 用尽面板「▶ 看短片 再砍 20 根」/ 引导「知道了，开砍！」',
 'guide_bubble':'引导气泡 9-slice（文字运行时绘制）',
 'guide_hand':'引导点按手；指尖热点 (30,3)pt',
 'guide_ring':'引导第 1 步木头椭圆描边（仅第 1 步）',
 'guide_tail':'气泡尾巴，默认朝下；旋转/翻转指向目标，压气泡边 2pt',
 'panel_vellum':'用尽面板 / 好友柴榜面板 9-slice（仅 @2x：纸面本身柔和，控包体；dpr3 也用 @2x）',
 'ribbon_madder':'标题飘带，骑在面板上沿（中线=面板顶边）',
 'strip_parchment':'次级按钮/列表行高亮：用尽面板「免费领取」、风格行、风格列表当前行、柴榜「我」行、引导「跳过 〉」'}
OPT_OLD={'chip_parchment':'D 不用（顶部小签改用 tag_parchment）','chip_boost':'D 不用（加速中状态写在抽屉统计里）','seal_wax':'D 不用；若审核要求印面无字需换空白火漆'}
NEW=[('tag_parchment',(104,40),[14,12,14,12],'顶部正中小签「余 N ⌄」9-slice。含 4pt 透明边+烘焙投影：可见纸面=外框内缩 4pt；文字/红点由代码绘制',{'visual_pad_pt':4}),
 ('tag_madder',(104,40),[14,12,14,12],'小签用尽态「树根用尽」（茜红纸，奶油色字）；同 tag_parchment 规则',{'visual_pad_pt':4}),
 ('btn_icon_style',(52,52),None,'抽屉圆钮「风格」（调色板+画笔，无字）',{}),
 ('icon_check',(20,20),None,'风格列表当前项勾（茜红墨）',{}),
 ('drawer_vellum',(200,140),[28,24,28,44],'下拉抽屉纸面 9-slice。只有底边撕口；上/左/右边画到屏外（x=-28..403, y=-24..）。开合时按高度裁切，见 interaction.md §动效',{'torn_edge':'bottom only; bottom inset 44pt contains torn band + burn rim','draw_rect_pt':'x=-28, y=-24, w=431, h=drawerBottom+24'}),
 ('roll_paper',(160,24),[16,0,16,0],'卷轴滚筒（侧视横条，3-slice：左右 16pt 端头不拉伸，中段横向拉伸）。直径 d 时整体纵向缩放到 d，端头目标宽 = 16*d/24 pt',{'slice_mode':'3-slice horizontal; dest L/R insets scale with diameter: 16*d/24 pt'}),
 ('roll_shadow',(2,16),None,'滚筒下方投影渐变条（上深下浅），横向拉伸到抽屉宽，纵向 = 0.6*d',{'slice_mode':'stretch'}),
]
OPT_NEW=[('btn_icon_menu',(52,52),'D 不用（第 4 个圆钮改为 btn_icon_style）'),('btn_icon_menu_s',(40,40),'D 不用（B/C 方案用）')]

for n in SHIP_OLD:
    for sc in (2,3):
        f=f'{n}@{sc}x.png'
        if os.path.exists(SRC+f): shutil.copy2(SRC+f,T+f)
def sz(p): im=Image.open(p); return im.size
def entry(n,logical,ins,role,extra,folder=T,relprefix=''):
    e={'file':relprefix+f'{n}@2x.png'}
    w,h=sz(folder+f'{n}@2x.png'); e.update(width=w,height=h,bytes=os.path.getsize(folder+f'{n}@2x.png'),scale=2,logical_size=list(logical),
        nine_slice_insets=[v*2 for v in ins] if ins else None,nine_slice_insets_pt=list(ins) if ins else None)
    if ins: e['nine_slice_insets_2x']=[v*2 for v in ins]
    e['role']=role; e.update(extra)
    v={'2x':{'file':e['file'],'width':w,'height':h,'bytes':e['bytes'],'scale':2}}
    if ins: v['2x']['nine_slice_insets']=[v_*2 for v_ in ins]
    p3=folder+f'{n}@3x.png'
    if os.path.exists(p3):
        w3,h3=sz(p3); v['3x']={'file':relprefix+f'{n}@3x.png','width':w3,'height':h3,'bytes':os.path.getsize(p3),'scale':3}
        if ins: v['3x']['nine_slice_insets']=[x*3 for x in ins]
    e['variants']=v; return e
tex=[]
OPTD=D+'optional/'
for n in OPT_OLD:
    for sc in (2,3): shutil.copy2(SRC+f'{n}@{sc}x.png',OPTD)
for n,_,_ in OPT_NEW:
    for sc in (2,3): shutil.copy2(MS+f'{n}@{sc}x.png',OPTD)
for n,role in SHIP_OLD.items():
    o=OLD[n]; tex.append(entry(n,o['logical_size'],o['nine_slice_insets_pt'],role,{'png':'PNG8 pngquant, light dither, full alpha','origin':'ui-parchment-v2 v3.1 (unchanged file)'}))
for n,lg,ins,role,ex in NEW:
    tex.append(entry(n,lg,ins,role,dict(ex,png='PNG8 pngquant q80-98 floyd 0.15 (drawer 65-88), full alpha',origin='D_final new')))
opt=[]
for n,why in OPT_OLD.items():
    o=OLD[n]; opt.append(entry(n,o['logical_size'],o['nine_slice_insets_pt'],o['role']+' — '+why,{'shipped':False},OPTD,'../optional/'))
for n,lg,why in OPT_NEW:
    opt.append(entry(n,lg,None,why,{'shipped':False},OPTD,'../optional/'))
t2=sum(e['bytes'] for e in tex); t3=sum(e['variants'].get('3x',e['variants']['2x'])['bytes'] for e in tex)
both=sum(os.path.getsize(T+f) for f in os.listdir(T) if f.endswith('.png'))
man={'name':'ui-parchment-D-drawer','version':'3.1-D','based_on':'ui-parchment-v2 manifest 3.1',
 'design_space':'375x812 logical pt; specs rendered @2x = 750x1624',
 'density_note':'scale = texels per pt. Top-level fields = the @2x file (scale 2). Draw size (pt) = px / scale = logical_size. 9-slice: source insets px = nine_slice_insets of the variant actually loaded (@2x: pt*2, @3x: pt*3); destination insets = nine_slice_insets_pt. Snap all dest rects to device pixels.',
 'variant_rule':'dpr>=2.5 -> variants.3x if present else 2x; otherwise 2x. panel_vellum has 2x only.',
 'nine_slice_convention':'[left, top, right, bottom]',
 'textures':tex,'optional':opt,
 'code_drawn':['红点 (r=4.5pt, #8b2e2e + 1.2pt 奶油描边)','角标数字 (茜红胶囊)','小签箭头 ⌄/⌃','风格色样圆点','柴榜头像占位圆','引导圆角矩形高亮描边 (2pt 奶油)','暗遮罩'],
 'total_2x_bytes':t2,'total_3x_set_bytes':t3,'total_textures_dir_bytes':both,
 'naming':'name@2x.png default, name@3x.png for dpr3 where present'}
json.dump(man,open(D+'manifest.json','w'),ensure_ascii=False,indent=1)
# ---- validation ----
rep=['# manifest.json 校验报告','',f'脚本：src/build_manifest.py（生成+校验同一次运行）','','| file | variant | exists | px | expected (pt×scale) | insets px | expected | OK |','|---|---|---|---|---|---|---|---|']
bad=0
def chk(e,folder):
    global bad
    for k,v in e['variants'].items():
        p=os.path.normpath(os.path.join(folder,v['file'])); ex=os.path.exists(p)
        sc=v['scale']; expw=[int(round(x*sc)) for x in e['logical_size']]
        real=list(Image.open(p).size) if ex else None
        ins=v.get('nine_slice_insets'); expi=[x*sc for x in e['nine_slice_insets_pt']] if e['nine_slice_insets_pt'] else None
        ok=ex and real==expw and ins==expi and (k!='2x' or (e['width'],e['height'])==tuple(real) and e['scale']==2 and e['nine_slice_insets']==expi) and (not ex or os.path.getsize(p)==v['bytes'])
        bad+=not ok
        rep.append(f"| {os.path.basename(v['file'])} | {k} | {'✓' if ex else '✗'} | {real} | {expw} | {ins} | {expi} | {'✓' if ok else '✗'} |")
for e in tex: chk(e,T)
rep+=['','可选（不进包，放在 optional/，路径相对 textures/）：','','| file | variant | exists | px | expected (pt×scale) | insets px | expected | OK |','|---|---|---|---|---|---|---|---|']
for e in opt: chk(e,T)
listed={os.path.basename(v['file']) for e in tex for v in e['variants'].values()}
extra=sorted(set(f for f in os.listdir(T) if f.endswith('.png'))-listed)
rep+=['',f'textures/ 里未登记的文件：{extra or "无"}',f'结果：**{"PASS" if bad==0 and not extra else "FAIL"}**（{bad} 项不符）',
 f'@2x 套 {t2/1024:.1f} KB · @3x 套（panel 用 @2x）{t3/1024:.1f} KB · textures/ 合计（两套都放）{both/1024:.1f} KB']
open(D+'manifest_validation.md','w').write('\n'.join(rep)+'\n'); print('\n'.join(rep))
