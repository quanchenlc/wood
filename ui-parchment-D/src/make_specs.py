"""Portrait + landscape annotated specs for D_fix_v2."""
import os, sys
sys.path.insert(0, '/workspace/ui-minimal/D_fix_v2/src')
from common import *

SPEC = D + 'spec/'
os.makedirs(SPEC, exist_ok=True)
load_man()

# ---- portrait drawer ----
def make_portrait_drawer():
    c = scene_portrait()
    dim(c, 0.30)
    # body height: DRAWER_P - TEAR visual. Paper body ~ 400 - 22 = 378, tear hangs below
    body_h = DRAWER_P - 22
    drawer_paper(c, PW, body_h, x=-16, y=-8, mode='cover')
    drawer_content_portrait(c)
    tag(c, y=DRAWER_P - 16, reddot=False, up=True)
    chrome_p(c)
    # clean product shot
    c.convert('RGB').save(SPEC + 'portrait_drawer_clean.png', optimize=True)
    # annotated
    a = c.copy()
    safe_overlay_p(a)
    ann_h(a, DRAWER_P, 0, PW, f'抽屉底 {DRAWER_P}pt（含撕口）')
    ann_h(a, TEAR_H, 8, 120, f'撕口高 {TEAR_H}pt', above=False)
    ann_box(a, (32, 164, PW - 64, 48), '皮革 CTA 48pt', 'b')
    ann_box(a, ((PW - 230) / 2, 306, 230, 36), '风格行（唯一风格入口）', 'b')
    ann_box(a, (PW / 6 - 23, 228, 46, 46), '46pt 圆钮', 'l')
    ann_v(a, 8, 94, DRAWER_P, '内容区 y≥94')
    ann_box(a, ((PW - 96) / 2, DRAWER_P - 16, 96, 32), '小签 96×32', 'b')
    sheet(SPEC + 'portrait_drawer.png',
          'D_fix_v2 · 竖屏抽屉',
          '375×812pt @2x · paper_tile cover + tear_edge · 无 drawer_vellum 九宫格',
          a,
          [
            '# 纸面合成（客户端必读）',
            '1. paper_tile：cover 或 tile 填充纸身矩形，禁止对纸心做九宫格。',
            '2. tear_edge：贴在纸身底边（上叠约 10pt），仅左右九宫格，高度固定 32pt。',
            '3. roll_paper：动画时盖在裁切边 / 撕口上沿；100% 时滚筒淡出，露出撕口。',
            '4. 裁切高度驱动展开，纸面本身不拉伸。',
            '# 布局',
            '统计三列 → 免费领取 → 三个圆钮（榜/加速/玩法）→ 风格行。',
            '已删除 btn_icon_style；风格只走「风格：… 〉」行。',
            '加速中写在统计第三列「下一根 00:50 · 加速中」。',
            '# 安全区',
            '状态栏 44 · 胶囊右7/top48/87×32 · Home 34。内容从 y≥94。',
            '字号 ≥11pt。',
          ])

def make_landscape_drawer():
    c = scene_landscape()
    dim(c, 0.28)
    # nearly full screen
    body_h = DRAWER_L_BOTTOM - DRAWER_L_TOP - 18
    drawer_paper(c, LW, body_h, x=-12, y=DRAWER_L_TOP, mode='tile')  # tile for landscape width
    drawer_content_landscape(c)
    tag(c, y=DRAWER_L_BOTTOM - 28, screen_w=LW, reddot=False, up=True)
    chrome_l(c)
    c.convert('RGB').save(SPEC + 'landscape_drawer_clean.png', optimize=True)
    a = c.copy()
    safe_overlay_l(a)
    ann_h(a, DRAWER_L_TOP, 0, LW, f'顶 {DRAWER_L_TOP}pt')
    ann_h(a, DRAWER_L_BOTTOM, 0, LW, f'底 {DRAWER_L_BOTTOM}pt · 近铺满', above=False)
    ann_box(a, (CAP_L[0] - 8, CAP_L[1] - 4, 87 + 16, 32 + 12), '胶囊禁区', 'l', SC)
    ann_v(a, 24, 56, 300, '左安全 24')
    ann_v(a, CAP_L[0] - 20, 56, 300, '右避让胶囊')
    sheet(SPEC + 'landscape_drawer.png',
          'D_fix_v2 · 横屏抽屉（铺满）',
          '812×375pt @2x · paper_tile 平铺 + tear_edge 满宽 · 内容重排避胶囊',
          a,
          [
            '# 画幅',
            '逻辑尺寸 812×375pt（iPhone X 横屏档）。微信小游戏横屏以运行时 windowWidth/Height 为准。',
            '抽屉接近铺满：顶 8 / 底 8，撕口+小签压在底边。',
            '# 内容重排',
            '统计横排三列 → 宽皮革领取（避开胶囊）→ 三圆钮横排 → 风格行居中。',
            '左侧避刘海约 24–44pt；右侧内容不超过胶囊左 −20pt。',
            '# 纸面',
            '横屏宽 812pt，paper_tile 建议 tile（@3x 1024² 约 0.8 次重复），勿把单张 cover 放大超过 ~1.5×。',
            'tear_edge 源宽 812pt，横屏可 1:1 或九宫格左右微拉。',
          ])

def make_portrait_rank():
    c = scene_portrait()
    dim(c, 0.30)
    body_h = DRAWER_P - 22
    drawer_paper(c, PW, body_h, x=-16, y=-8, mode='cover')
    rank_content_portrait(c)
    tag(c, y=DRAWER_P - 16, reddot=False, up=True)
    chrome_p(c)
    c.convert('RGB').save(SPEC + 'portrait_rank_clean.png', optimize=True)
    a = c.copy()
    safe_overlay_p(a)
    ann_box(a, (16, 88, 80, 28), '‹ 返回', 'r')
    ann_box(a, (24, 132, PW - 48, 220), '开放数据域列表（可滚动）', 'b')
    ann_h(a, DRAWER_P, 0, PW, '同一抽屉纸面 · 非弹层')
    sheet(SPEC + 'portrait_rank.png',
          'D_fix_v2 · 竖屏 · 好友柴榜（抽屉内页）',
          '点「好友柴榜」→ 同纸面换页，顶栏「‹ 返回」· 无二次弹层/遮罩',
          a,
          [
            '# 交互（与风格页对齐）',
            '点「好友柴榜」：内容层翻页 200ms（同风格页），纸面不收起、不加第二层 dim。',
            '「‹ 返回」或右滑：回到抽屉首页。',
            '抽屉收起后再打开：回到首页。',
            '# 开放数据域',
            '列表行在 sharedCanvas 绘制；创建时 width/height = 布局 pt × 设备 dpr。',
            'sharedCanvas 嵌在抽屉内容区裁切矩形内，随抽屉滚动/裁切。',
            '# 不要',
            '不要先收起抽屉再弹 panel_vellum 榜单（旧 D_final e_rank 已废弃）。',
          ])

def make_landscape_rank():
    c = scene_landscape()
    dim(c, 0.28)
    body_h = DRAWER_L_BOTTOM - DRAWER_L_TOP - 18
    drawer_paper(c, LW, body_h, x=-12, y=DRAWER_L_TOP, mode='tile')
    rank_content_landscape(c)
    tag(c, y=DRAWER_L_BOTTOM - 28, screen_w=LW, reddot=False, up=True)
    chrome_l(c)
    c.convert('RGB').save(SPEC + 'landscape_rank_clean.png', optimize=True)
    a = c.copy()
    safe_overlay_l(a)
    ann_box(a, (16, 46, 80, 28), '‹ 返回', 'r')
    ann_box(a, (24, 80, CAP_L[0] - 44, 200), '双列榜 · 避胶囊', 'b')
    sheet(SPEC + 'landscape_rank.png',
          'D_fix_v2 · 横屏 · 好友柴榜（抽屉内页）',
          '812×375pt 近铺满 · 双列列表 · 同纸面返回',
          a,
          [
            '# 横屏重排',
            '双列好友行，右侧不超过胶囊左 −20pt。',
            '顶栏「‹ 返回」+ 标题「好友柴榜」。',
            '仍是抽屉内页，不是 modal。',
          ])

def make_portrait_style():
    c = scene_portrait()
    dim(c, 0.30)
    body_h = DRAWER_P - 22
    drawer_paper(c, PW, body_h, x=-16, y=-8, mode='cover')
    style_content_portrait(c)
    tag(c, y=DRAWER_P - 16, reddot=False, up=True)
    chrome_p(c)
    a = c.copy(); safe_overlay_p(a)
    ann_box(a, (16, 88, 80, 28), '‹ 返回', 'r')
    sheet(SPEC + 'portrait_style.png',
          'D_fix_v2 · 竖屏 · 风格列表（抽屉内页）',
          '与柴榜同交互模型：同纸面翻页，无弹层',
          a,
          [
            '点风格行进入；‹ 返回 / 右滑回首页。',
            '选中打勾（icon_check）；存储键 fw_style。',
            '无 btn_icon_style 圆钮。',
          ])

if __name__ == '__main__':
    make_portrait_drawer(); print('portrait_drawer')
    make_landscape_drawer(); print('landscape_drawer')
    make_portrait_rank(); print('portrait_rank')
    make_landscape_rank(); print('landscape_rank')
    make_portrait_style(); print('portrait_style')
    print('done')
