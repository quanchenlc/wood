"""Build + validate D_fix_v2 manifest v3.1. No btn_icon_style, no drawer_vellum."""
import os, json
from PIL import Image

D = '/workspace/ui-minimal/D_fix_v2/'
TX = D + 'textures/'

# logical sizes and insets_pt from D_final + new
SPEC = {
  'btn_icon_ad': dict(logical=(52,52), insets=None, role='抽屉圆钮「看短片加速」(角标=今日剩余次数，代码绘制)', origin='v3.1'),
  'btn_icon_help': dict(logical=(52,52), insets=None, role='抽屉圆钮「玩法」(重看引导)', origin='v3.1'),
  'btn_icon_rank': dict(logical=(52,52), insets=None, role='抽屉圆钮「好友柴榜」→ 抽屉内第二页（非弹层）', origin='v3.1'),
  'btn_leather': dict(logical=(220,60), insets=[26,18,26,18], role='主 CTA：免费领取 / 看短片 / 引导确认', origin='v3.1'),
  'guide_bubble': dict(logical=(200,64), insets=[18,16,18,16], role='引导气泡 9-slice（文字运行时绘制）', origin='v3.1'),
  'guide_hand': dict(logical=(64,64), insets=None, role='引导手势', origin='v3.1'),
  'guide_ring': dict(logical=(96,96), insets=None, role='引导椭圆环（仅步骤1）', origin='v3.1'),
  'guide_tail': dict(logical=(28,18), insets=None, role='气泡尾巴', origin='v3.1'),
  'icon_check': dict(logical=(20,20), insets=None, role='风格列表勾选', origin='D_final'),
  'panel_vellum': dict(logical=(300,225), insets=[40,40,40,40], role='树根用尽弹层 9-slice（仅 @2x）', origin='v3.1', only2x=True),
  'ribbon_madder': dict(logical=(260,52), insets=[48,12,48,12], role='用尽面板飘带', origin='v3.1'),
  'roll_paper': dict(logical=(160,24), insets=[16,0,16,0], role='卷筒 3-slice（端头随直径缩放）', origin='D_final'),
  'roll_shadow': dict(logical=(2,16), insets=None, role='卷筒投影（横向拉伸）', origin='D_final'),
  'strip_parchment': dict(logical=(240,48), insets=[16,12,16,12], role='次级条：风格行 / 列表行', origin='v3.1'),
  'tag_parchment': dict(logical=(104,40), insets=[14,12,14,12], role='顶部小签常态（含 4pt 投影边）', origin='D_final'),
  'tag_madder': dict(logical=(104,40), insets=[14,12,14,12], role='顶部小签用尽态', origin='D_final'),
  'paper_tile': dict(logical=(512,512), insets=None, role='抽屉纸面无缝贴图（JPEG）。绘制：tile 或 cover，禁止 9-slice 中间。@2x=512² @3x=1024²', origin='D_fix_v2', jpg=True, logical3x=(1024,1024)),
  'tear_edge': dict(logical=(812,32), insets=[48,0,48,0], role='抽屉底撕口条。仅左右 9-slice；高度固定 32pt；宽按屏宽拉伸。覆盖横屏 812pt', origin='D_fix_v2'),
}

def entry(name):
    s = SPEC[name]
    jpg = s.get('jpg', False)
    ext = '.jpg' if jpg else '.png'
    f2 = f'{name}@2x{ext}'
    p2 = TX + f2
    im2 = Image.open(p2)
    b2 = os.path.getsize(p2)
    sc2 = 2
    log = list(s['logical'])
    # verify
    if jpg and name == 'paper_tile':
        assert im2.size == (512, 512), im2.size
    else:
        expect = (log[0] * sc2, log[1] * sc2)
        assert im2.size == expect, (name, im2.size, expect)
    insets_pt = s['insets']
    insets_2x = [v * 2 for v in insets_pt] if insets_pt else None
    e = {
        'file': f2,
        'width': im2.size[0], 'height': im2.size[1], 'bytes': b2,
        'scale': 2,
        'logical_size': log,
        'nine_slice_insets': insets_2x,
        'nine_slice_insets_pt': list(insets_pt) if insets_pt else None,
        'nine_slice_insets_2x': insets_2x,
        'role': s['role'],
        'png': ('JPEG q90, no alpha' if jpg else 'PNG8 pngquant, light dither, full alpha'),
        'origin': s['origin'],
        'variants': {
            '2x': {'file': f2, 'width': im2.size[0], 'height': im2.size[1], 'bytes': b2, 'scale': 2,
                   **({'nine_slice_insets': insets_2x} if insets_2x else {})}
        }
    }
    if s.get('only2x'):
        return e
    f3 = f'{name}@3x{ext}'
    p3 = TX + f3
    if not os.path.exists(p3):
        return e
    im3 = Image.open(p3); b3 = os.path.getsize(p3)
    if name == 'paper_tile':
        assert im3.size == (1024, 1024), im3.size
        # logical stays 512 for draw-size reference; note scale quirk: @3x file is 1024 for denser tile
        e['variants']['3x'] = {'file': f3, 'width': 1024, 'height': 1024, 'bytes': b3, 'scale': 3,
                               'note': '1024² tile for denser cover/tile; logical_size still 512pt reference for 1x tile cell'}
        e['logical_size_3x_tile_px'] = [1024, 1024]
    else:
        expect3 = (log[0] * 3, log[1] * 3)
        assert im3.size == expect3, (name, im3.size, expect3)
        insets_3x = [v * 3 for v in insets_pt] if insets_pt else None
        e['variants']['3x'] = {'file': f3, 'width': im3.size[0], 'height': im3.size[1], 'bytes': b3, 'scale': 3,
                               **({'nine_slice_insets': insets_3x} if insets_3x else {})}
    return e

textures = [entry(n) for n in SPEC]
# sort like before: icons, leather, guide, panel, ribbon, roll, strip, tags, paper, tear
order = list(SPEC.keys())
textures.sort(key=lambda t: order.index(t['file'].split('@')[0].replace('.png','').replace('.jpg','')))

man = {
  'name': 'ui-parchment-D-drawer-fix-v2',
  'version': '3.1-D-fix-v2',
  'based_on': 'D_final 3.1-D + seamless paper_tile/tear_edge',
  'design_space': 'portrait 375x812 pt; landscape 812x375 pt; specs rendered @2x',
  'density_note': 'scale = texels per pt. Top-level fields = the @2x file (scale 2). Draw size (pt) = px / scale = logical_size. 9-slice: source insets px = nine_slice_insets of the variant actually loaded; destination insets = nine_slice_insets_pt. Snap all dest rects to device pixels.',
  'variant_rule': 'dpr>=2.5 -> variants.3x if present else 2x; otherwise 2x. panel_vellum has 2x only. paper_tile@3x is 1024² (denser tile).',
  'nine_slice_convention': '[left, top, right, bottom]',
  'drawer_draw_note': 'DO NOT 9-slice paper body. Fill drawer rect with paper_tile (cover or tile), clip by height during unroll, composite tear_edge at bottom (9-slice L/R only, fixed height 32pt), place roll_paper on the revealed bottom edge.',
  'removed': ['drawer_vellum (was 200x140 9-slice — caused vertical seam + blur)', 'btn_icon_style (unused; style entry is strip row only)'],
  'textures': textures,
  'optional': [],
}
json.dump(man, open(D + 'manifest.json', 'w'), ensure_ascii=False, indent=1)
print('wrote manifest', len(textures), 'textures')

# validate
lines = ['# manifest validation — D_fix_v2', '']
ok = True
sum2 = sum3 = 0
for t in textures:
    name = t['file'].split('@')[0]
    for vk, v in t['variants'].items():
        p = TX + v['file']
        exists = os.path.exists(p)
        im = Image.open(p) if exists else None
        size_ok = exists and im.size == (v['width'], v['height'])
        bytes_ok = exists and os.path.getsize(p) == v['bytes']
        # insets
        insets_ok = True
        if t.get('nine_slice_insets_pt') and 'nine_slice_insets' in v:
            expect = [x * v['scale'] for x in t['nine_slice_insets_pt']]
            # paper_tile@3x special: skip logical check
            if name != 'paper_tile':
                insets_ok = v['nine_slice_insets'] == expect
            # also check source px vs image
            if insets_ok and name != 'paper_tile':
                L,T,R,B = v['nine_slice_insets']
                insets_ok = L+R < v['width'] and T+B < v['height']
        # logical
        if name == 'paper_tile':
            log_ok = True
        else:
            log_ok = (v['width'] / v['scale'] == t['logical_size'][0] and
                      v['height'] / v['scale'] == t['logical_size'][1])
        row_ok = exists and size_ok and bytes_ok and insets_ok and log_ok
        ok = ok and row_ok
        if vk == '2x': sum2 += v['bytes']
        if vk == '3x': sum3 += v['bytes']
        lines.append(f"- {'PASS' if row_ok else 'FAIL'} {v['file']} size={im.size if im else None} "
                     f"bytes={v['bytes']} log_ok={log_ok} insets_ok={insets_ok}")
    # forbidden
for bad in ('btn_icon_style', 'drawer_vellum'):
    found = any(bad in f for f in os.listdir(TX))
    lines.append(f"- {'FAIL' if found else 'PASS'} absent {bad}")
    ok = ok and not found

lines += ['', f'@2x set: {sum2/1024:.1f} KB', f'@3x set (files present): {sum3/1024:.1f} KB',
          f'total textures dir: {sum(os.path.getsize(TX+f) for f in os.listdir(TX))/1024:.1f} KB',
          '', f'## RESULT: {"PASS" if ok else "FAIL"}']
open(D + 'manifest_validation.md', 'w').write('\n'.join(lines))
print('validation', 'PASS' if ok else 'FAIL')
print(f'@2x {sum2/1024:.1f}KB  @3x {sum3/1024:.1f}KB')
