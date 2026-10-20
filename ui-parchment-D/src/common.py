"""D_fix_v2 shared helpers. Portrait 375x812pt; Landscape 812x375pt. Render @2x."""
import numpy as np, os, math, json
from PIL import Image, ImageDraw, ImageFont, ImageFilter

D = '/workspace/ui-minimal/D_fix_v2/'
TX = D + 'textures/'
K = 2
# portrait
PW, PH = 375, 812
# landscape
LW, LH = 812, 375
INK = (58, 42, 24); INK_SOFT = (92, 74, 50); CREAM = (243, 230, 200)
MADDER = (139, 46, 46); LEA_TXT = (246, 232, 204)
SANS = '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc'
SANSB = '/usr/share/fonts/opentype/noto/NotoSansCJK-Bold.ttc'
SERIF = '/usr/share/fonts/opentype/noto/NotoSerifCJK-Bold.ttc'
SERIFR = '/usr/share/fonts/opentype/noto/NotoSerifCJK-Regular.ttc'

def F(p, pt):
    return ImageFont.truetype(p, int(round(pt * K)), index=2)

# Capsule (iPhone X class). Portrait: right 7, top 48, 87x32
CAP_P = (281, 48, 368, 80)
# Landscape: capsule still top-right; approx right 7, top 18 (status thinner), 87x32
CAP_L = (812 - 7 - 87, 18, 812 - 7, 50)
STATUS_P, HOME_P = 44, 34
STATUS_L, HOME_L = 0, 21  # landscape often no big status bar; home indicator on the side/bottom

BASE_P = Image.open('/workspace/ui-minimal/src/scene_clean.png').convert('RGB')

def scene_portrait():
    return BASE_P.resize((PW * K, PH * K), Image.LANCZOS).convert('RGBA')

def scene_landscape():
    # crop a wide band from scene and letterbox-stretch to 812x375
    s = BASE_P
    # take center crop matching 812/375 aspect from portrait scene
    tw, th = s.size
    target_aspect = LW / LH
    src_aspect = tw / th
    if src_aspect > target_aspect:
        nw = int(th * target_aspect); x0 = (tw - nw) // 2
        crop = s.crop((x0, 0, x0 + nw, th))
    else:
        nh = int(tw / target_aspect); y0 = (th - nh) // 2
        crop = s.crop((0, y0, tw, y0 + nh))
    return crop.resize((LW * K, LH * K), Image.LANCZOS).convert('RGBA')

MAN = {}
def load_man():
    global MAN
    p = D + 'manifest.json'
    if os.path.exists(p):
        MAN = {t['file'].replace('@2x.png', '').replace('@2x.jpg', ''): t
               for t in json.load(open(p))['textures']}

def tex(n):
    for ext in ('.png', '.jpg'):
        p = TX + n + '@2x' + ext
        if os.path.exists(p):
            return Image.open(p).convert('RGBA')
    raise FileNotFoundError(n)

def tpt(n, w, h):
    return tex(n).resize((int(round(w * K)), int(round(h * K))), Image.LANCZOS)

def nine(n, w, h, dst=None):
    if not MAN: load_man()
    m = MAN[n]; im = tex(n)
    L, T_, R_, B_ = m['nine_slice_insets']
    Lp, Tp, Rp, Bp = dst or m['nine_slice_insets_pt']
    sw, sh = im.size; dw, dh = int(round(w * K)), int(round(h * K))
    dL, dT, dR, dB = [int(round(v * K)) for v in (Lp, Tp, Rp, Bp)]
    if dL + dR > dw:
        f = dw / (dL + dR + 2); dL = int(dL * f); dR = int(dR * f)
    if dT + dB > dh:
        f = dh / (dT + dB + 2); dT = int(dT * f); dB = int(dB * f)
    out = Image.new('RGBA', (dw, dh))
    xs = [0, L, sw - R_, sw]; ys = [0, T_, sh - B_, sh]
    X = [0, dL, dw - dR, dw]; Y = [0, dT, dh - dB, dh]
    for r in range(3):
        for c in range(3):
            if X[c+1] - X[c] > 0 and Y[r+1] - Y[r] > 0 and xs[c+1] - xs[c] > 0 and ys[r+1] - ys[r] > 0:
                out.paste(im.crop((xs[c], ys[r], xs[c+1], ys[r+1])).resize(
                    (X[c+1] - X[c], Y[r+1] - Y[r]), Image.LANCZOS), (X[c], Y[r]))
    return out

def put(c, im, x, y, shadow=0.3, alpha=1.0):
    X, Y = int(round(x * K)), int(round(y * K))
    if alpha < 1:
        im = im.copy(); im.putalpha(im.split()[3].point(lambda v: int(v * alpha)))
    if shadow:
        a = im.split()[3].filter(ImageFilter.GaussianBlur(3 * K / 2))
        sh = Image.new('RGBA', im.size, (30, 18, 8, 0)); sh.putalpha(a.point(lambda v: int(v * shadow)))
        c.alpha_composite(sh, (X + K, Y + 2 * K))
    c.alpha_composite(im, (X, Y))

def text(c, xy, s, font, fill=INK, anchor='la', halo=None, hw=2, alpha=255):
    lay = Image.new('RGBA', c.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    kw = dict(stroke_width=hw, stroke_fill=halo) if halo else {}
    d.text((xy[0] * K, xy[1] * K), s, font=font, fill=fill, anchor=anchor, **kw)
    if alpha < 255:
        lay.putalpha(lay.split()[3].point(lambda v: v * alpha // 255))
    c.alpha_composite(lay)

def badge(c, cx, cy, label, r=8):
    d = ImageDraw.Draw(c); R = r * K; w = max(R, (len(label) * 3.2 + 4) * K)
    d.rounded_rectangle([cx * K - w, cy * K - R, cx * K + w, cy * K + R],
                        radius=R, fill=MADDER + (255,), outline=CREAM + (255,), width=int(1.2 * K))
    text(c, (cx, cy + 0.3), label, F(SANSB, 11), fill=CREAM, anchor='mm')

def dot(c, cx, cy, r=4.5):
    d = ImageDraw.Draw(c)
    d.ellipse([(cx - r) * K, (cy - r) * K, (cx + r) * K, (cy + r) * K],
              fill=MADDER + (255,), outline=CREAM + (255,), width=int(1.2 * K))

def dim(c, a):
    c.alpha_composite(Image.new('RGBA', c.size, (30, 20, 10, int(255 * a))))

def chev(c, cx, cy, up, col=INK, w=1.8):
    d = ImageDraw.Draw(c)
    pts = [(cx - 5, cy - 2), (cx, cy + 3), (cx + 5, cy - 2)] if not up else [(cx - 5, cy + 2), (cx, cy - 3), (cx + 5, cy + 2)]
    d.line([(p[0] * K, p[1] * K) for p in pts], fill=col, width=int(w * K), joint='curve')

def chrome_p(c):
    lay = Image.new('RGBA', c.size, (0, 0, 0, 0)); dl = ImageDraw.Draw(lay)
    x0, y0, x1, y1 = [v * K for v in CAP_P]
    dl.rounded_rectangle([x0, y0, x1, y1], radius=16 * K, fill=(255, 255, 255, 170), outline=(0, 0, 0, 40), width=1)
    dl.line([((x0 + x1) / 2, y0 + 8 * K), ((x0 + x1) / 2, y1 - 8 * K)], fill=(0, 0, 0, 60), width=1)
    for k in (-6, 0, 6):
        dl.ellipse([x0 + 22 * K + k * K - 2 * K, (y0 + y1) / 2 - 2 * K,
                    x0 + 22 * K + k * K + 2 * K, (y0 + y1) / 2 + 2 * K], fill=(0, 0, 0, 170))
    dl.ellipse([x1 - 30 * K, (y0 + y1) / 2 - 8 * K, x1 - 14 * K, (y0 + y1) / 2 + 8 * K],
               outline=(0, 0, 0, 170), width=2 * K)
    dl.rounded_rectangle([(PW / 2 - 67) * K, (PH - 13) * K, (PW / 2 + 67) * K, (PH - 8) * K],
                         radius=3 * K, fill=(20, 20, 20, 200))
    c.alpha_composite(lay)
    text(c, (28, 24), '9:41', F(SANSB, 14), fill=(20, 20, 20), anchor='lm')

def chrome_l(c):
    lay = Image.new('RGBA', c.size, (0, 0, 0, 0)); dl = ImageDraw.Draw(lay)
    x0, y0, x1, y1 = [v * K for v in CAP_L]
    dl.rounded_rectangle([x0, y0, x1, y1], radius=16 * K, fill=(255, 255, 255, 170), outline=(0, 0, 0, 40), width=1)
    dl.line([((x0 + x1) / 2, y0 + 8 * K), ((x0 + x1) / 2, y1 - 8 * K)], fill=(0, 0, 0, 60), width=1)
    for k in (-6, 0, 6):
        dl.ellipse([x0 + 22 * K + k * K - 2 * K, (y0 + y1) / 2 - 2 * K,
                    x0 + 22 * K + k * K + 2 * K, (y0 + y1) / 2 + 2 * K], fill=(0, 0, 0, 170))
    dl.ellipse([x1 - 30 * K, (y0 + y1) / 2 - 8 * K, x1 - 14 * K, (y0 + y1) / 2 + 8 * K],
               outline=(0, 0, 0, 170), width=2 * K)
    # home indicator bottom-center in landscape
    dl.rounded_rectangle([(LW / 2 - 67) * K, (LH - 10) * K, (LW / 2 + 67) * K, (LH - 5) * K],
                         radius=3 * K, fill=(20, 20, 20, 200))
    c.alpha_composite(lay)
    text(c, (28, 14), '9:41', F(SANSB, 13), fill=(20, 20, 20), anchor='lm')

# ---- paper + tear compositing (NO 9-slice on paper body) ----
TEAR_H = 32  # pt
DRAWER_P = 400  # portrait drawer bottom y (incl tear)
DRAWER_L_TOP = 8
DRAWER_L_BOTTOM = LH - 8  # nearly full height in landscape

def paper_fill(w_pt, h_pt, mode='cover'):
    """Return RGBA paper body (no tear) sized w_pt x h_pt at @K."""
    tile = Image.open(TX + 'paper_tile@2x.jpg').convert('RGB')
    dw, dh = int(round(w_pt * K)), int(round(h_pt * K))
    tw, th = tile.size
    if mode == 'tile':
        reps = (dh // th + 2, dw // tw + 2, 1)
        arr = np.tile(np.asarray(tile), reps)[:dh, :dw]
        return Image.fromarray(arr).convert('RGBA')
    # cover
    s = max(dw / tw, dh / th)
    big = tile.resize((int(tw * s) + 2, int(th * s) + 2), Image.LANCZOS)
    x0 = (big.size[0] - dw) // 2; y0 = (big.size[1] - dh) // 2
    return big.crop((x0, y0, x0 + dw, y0 + dh)).convert('RGBA')

def tear_strip(w_pt):
    """9-slice L/R tear to width w_pt, height TEAR_H."""
    # tear_edge logical = 812 x 32, insets_pt [48,0,48,0]
    return nine('tear_edge', w_pt, TEAR_H, dst=[48, 0, 48, 0])

def drawer_paper(c, screen_w, body_h, x=-16, y=-8, mode='cover', clip_h=None):
    """Composite paper body + tear at bottom. body_h = paper body height (excl tear visual hang).
    Total visual bottom ≈ y + body_h + TEAR_H*0.55 (tear overlaps).
    """
    # paper body covers up to body_h; tear overlaps top ~10pt into body
    overlap = 10
    paper = paper_fill(screen_w - 2 * x, body_h, mode=mode)
    tear = tear_strip(screen_w - 2 * x)
    lay = Image.new('RGBA', c.size, (0, 0, 0, 0))
    # soft drop shadow
    sh_a = paper.split()[3].filter(ImageFilter.GaussianBlur(5 * K))
    sh = Image.new('RGBA', paper.size, (25, 15, 5, 0))
    sh.putalpha(sh_a.point(lambda v: int(v * 0.40)))
    X = int(round(x * K)); Y = int(round(y * K))
    lay.alpha_composite(sh, (X, Y + 3 * K))
    lay.alpha_composite(paper, (X, Y))
    # tear: top at y + body_h - overlap
    ty = int(round((y + body_h - overlap) * K))
    tlayer = Image.new('RGBA', lay.size, (0, 0, 0, 0))
    tlayer.paste(tear, (X, ty))
    lay = Image.alpha_composite(lay, tlayer)
    if clip_h is not None:
        m = Image.new('L', c.size, 0)
        ImageDraw.Draw(m).rectangle([0, 0, c.size[0], int(clip_h * K)], fill=255)
        lay.putalpha(Image.fromarray(np.minimum(np.asarray(lay.split()[3]), np.asarray(m))))
    c.alpha_composite(lay)

def roll(c, cy, d, width, alpha=1.0, shadow=True):
    if shadow:
        sh = tex('roll_shadow').resize((int(width * K), max(1, int(0.6 * d * K))), Image.BILINEAR)
        if alpha < 1:
            sh.putalpha(sh.split()[3].point(lambda v: int(v * alpha)))
        c.alpha_composite(sh, (int(-10 * K), int((cy + d * 0.35) * K)))
    e = 16 * d / 24
    im = nine('roll_paper', width, d, dst=[e, 0, e, 0])
    put(c, im, -10, cy - d / 2, 0, alpha)

def tag(c, rem='288', state='idle', y=48, screen_w=PW, reddot=True, up=False, alpha=1.0):
    n = 'tag_madder' if state == 'exhausted' else 'tag_parchment'
    w = 96 if state == 'idle' else 112; x = (screen_w - w) / 2
    put(c, nine(n, w + 8, 40), x - 4, y - 4, 0, alpha)
    if state == 'idle':
        text(c, (screen_w / 2 - 8, y + 16), '余 ' + rem, F(SANSB, 13), fill=INK, anchor='mm', alpha=int(255 * alpha))
        chev(c, screen_w / 2 + 30, y + 16, up)
        if reddot: dot(c, x + w - 3, y + 3)
    else:
        text(c, (screen_w / 2 - 7, y + 16), '树根用尽', F(SANSB, 13), fill=CREAM, anchor='mm', alpha=int(255 * alpha))
        chev(c, screen_w / 2 + 38, y + 16, up, col=CREAM)
    return (x, y, w, 32)

# ---- content: portrait main / style / rank ----
STATS_P = [('今日已砍', '12'), ('剩余树根', '288'), ('下一根', '00:50 · 加速中')]
ICONS_P = [('btn_icon_rank', '好友柴榜', None), ('btn_icon_ad', '看短片加速', '8'), ('btn_icon_help', '玩法', None)]

def drawer_content_portrait(c, alpha=1.0, dy=0, pending=40):
    lay = Image.new('RGBA', c.size, (0, 0, 0, 0))
    for i, (l, v) in enumerate(STATS_P):
        cx = PW / 6 * (2 * i + 1)
        text(lay, (cx, 104 + dy), l, F(SANS, 11), fill=INK_SOFT, anchor='mm')
        text(lay, (cx, 128 + dy), v, F(SERIF, 18 if i == 2 else 22), fill=INK, anchor='mm')
    ImageDraw.Draw(lay, 'RGBA').line([(24 * K, (152 + dy) * K), ((PW - 24) * K, (152 + dy) * K)], fill=INK + (80,), width=1)
    put(lay, nine('btn_leather', PW - 64, 48), 32, 164 + dy, 0.3)
    text(lay, (PW / 2, 188 + dy), '免费领取 柴棚 %d 根' % pending, F(SERIF, 16), fill=LEA_TXT, anchor='mm', halo=(52, 30, 14), hw=1)
    for i, (ic, l, bd) in enumerate(ICONS_P):
        cx = PW / 6 * (2 * i + 1)
        put(lay, tpt(ic, 46, 46), cx - 23, 228 + dy, 0.3)
        if bd: badge(lay, cx + 18, 232 + dy, bd, 8)
        text(lay, (cx, 288 + dy), l, F(SANSB, 11), fill=INK, anchor='mm', halo=CREAM + (255,), hw=2)
    put(lay, nine('strip_parchment', 230, 36), (PW - 230) / 2, 306 + dy, 0.2)
    text(lay, (PW / 2 - 6, 324 + dy), '风格：羊皮纸', F(SANS, 13), fill=INK, anchor='mm')
    text(lay, (PW / 2 + 58, 324 + dy), '〉', F(SANS, 13), fill=INK_SOFT, anchor='mm')
    if alpha < 1:
        lay.putalpha(lay.split()[3].point(lambda v: int(v * alpha)))
    c.alpha_composite(lay)

def drawer_content_landscape(c, alpha=1.0, pending=40):
    """Reflow for 812x375 nearly-full drawer. Avoid capsule (top-right) and home bar."""
    lay = Image.new('RGBA', c.size, (0, 0, 0, 0))
    # left safe: 20; right safe before capsule: CAP_L[0]-16 ≈ 702
    left = 24; right = CAP_L[0] - 20; mid = (left + right) / 2
    top = 56  # below capsule bottom (50) + 6
    # stats as one horizontal row
    labels = STATS_P
    for i, (l, v) in enumerate(labels):
        cx = left + (right - left) * (i + 0.5) / 3
        text(lay, (cx, top), l, F(SANS, 11), fill=INK_SOFT, anchor='mm')
        text(lay, (cx, top + 22), v, F(SERIF, 17 if i == 2 else 20), fill=INK, anchor='mm')
    y = top + 44
    ImageDraw.Draw(lay, 'RGBA').line([(left * K, y * K), (right * K, y * K)], fill=INK + (80,), width=1)
    y += 12
    # free collect - wide but not under capsule
    bw = min(420, right - left); bx = left + (right - left - bw) / 2
    put(lay, nine('btn_leather', bw, 44), bx, y, 0.3)
    text(lay, (bx + bw / 2, y + 22), '免费领取 柴棚 %d 根' % pending, F(SERIF, 15), fill=LEA_TXT, anchor='mm', halo=(52, 30, 14), hw=1)
    y += 56
    # three icons centered
    gap = 140
    start = mid - gap
    for i, (ic, l, bd) in enumerate(ICONS_P):
        cx = start + i * gap
        put(lay, tpt(ic, 44, 44), cx - 22, y, 0.3)
        if bd: badge(lay, cx + 17, y + 4, bd, 8)
        text(lay, (cx, y + 56), l, F(SANSB, 11), fill=INK, anchor='mm', halo=CREAM + (255,), hw=2)
    y += 78
    # style row
    sw = 260
    put(lay, nine('strip_parchment', sw, 34), mid - sw / 2, y, 0.2)
    text(lay, (mid - 6, y + 17), '风格：羊皮纸', F(SANS, 13), fill=INK, anchor='mm')
    text(lay, (mid + 58, y + 17), '〉', F(SANS, 13), fill=INK_SOFT, anchor='mm')
    if alpha < 1:
        lay.putalpha(lay.split()[3].point(lambda v: int(v * alpha)))
    c.alpha_composite(lay)

def rank_content_portrait(c):
    """In-drawer friend leaderboard page."""
    lay = Image.new('RGBA', c.size, (0, 0, 0, 0))
    # back
    text(lay, (24, 100), '‹ 返回', F(SANSB, 14), fill=INK, anchor='lm')
    text(lay, (PW / 2, 100), '好友柴榜', F(SERIF, 17), fill=INK, anchor='mm')
    ImageDraw.Draw(lay, 'RGBA').line([(24 * K, 118 * K), ((PW - 24) * K, 118 * K)], fill=INK + (70,), width=1)
    # fake open-data rows
    rows = [('1', '林间樵夫', '1280'), ('2', '我', '960'), ('3', '雾里砍柴', '740'),
            ('4', '晚风', '510'), ('5', '小斧头', '380')]
    y0 = 132
    for i, (rk, name, sc) in enumerate(rows):
        y = y0 + i * 44
        # avatar circle
        d = ImageDraw.Draw(lay)
        ax, ay = 40, y + 14
        d.ellipse([(ax - 14) * K, (ay - 14) * K, (ax + 14) * K, (ay + 14) * K],
                  fill=(180, 150, 110, 255), outline=INK + (120,), width=1)
        text(lay, (ax, ay), rk, F(SANSB, 11), fill=INK, anchor='mm')
        text(lay, (66, y + 14), name, F(SANS, 14), fill=INK, anchor='lm')
        text(lay, (PW - 28, y + 14), sc + ' 根', F(SERIF, 14), fill=INK_SOFT, anchor='rm')
        if i < len(rows) - 1:
            d.line([(66 * K, (y + 36) * K), ((PW - 28) * K, (y + 36) * K)], fill=INK + (40,), width=1)
    # open-data note
    text(lay, (PW / 2, 360), '列表在开放数据域绘制 · sharedCanvas@dpr', F(SANS, 11), fill=INK_SOFT, anchor='mm')
    c.alpha_composite(lay)

def rank_content_landscape(c):
    lay = Image.new('RGBA', c.size, (0, 0, 0, 0))
    left = 24; right = CAP_L[0] - 20
    text(lay, (left, 58), '‹ 返回', F(SANSB, 14), fill=INK, anchor='lm')
    text(lay, ((left + right) / 2, 58), '好友柴榜', F(SERIF, 17), fill=INK, anchor='mm')
    ImageDraw.Draw(lay, 'RGBA').line([(left * K, 74 * K), (right * K, 74 * K)], fill=INK + (70,), width=1)
    rows = [('1', '林间樵夫', '1280'), ('2', '我', '960'), ('3', '雾里砍柴', '740'),
            ('4', '晚风', '510'), ('5', '小斧头', '380'), ('6', '松果', '220')]
    # two columns in landscape
    col_w = (right - left - 20) / 2
    for i, (rk, name, sc) in enumerate(rows):
        col = i % 2; row = i // 2
        x0 = left + col * (col_w + 20)
        y = 88 + row * 40
        d = ImageDraw.Draw(lay)
        ax = x0 + 16; ay = y + 12
        d.ellipse([(ax - 12) * K, (ay - 12) * K, (ax + 12) * K, (ay + 12) * K],
                  fill=(180, 150, 110, 255), outline=INK + (120,), width=1)
        text(lay, (ax, ay), rk, F(SANSB, 11), fill=INK, anchor='mm')
        text(lay, (x0 + 36, y + 12), name, F(SANS, 13), fill=INK, anchor='lm')
        text(lay, (x0 + col_w - 4, y + 12), sc, F(SERIF, 13), fill=INK_SOFT, anchor='rm')
    text(lay, ((left + right) / 2, LH - 36), '开放数据域 · sharedCanvas 按设备 dpr 创建', F(SANS, 11), fill=INK_SOFT, anchor='mm')
    c.alpha_composite(lay)

def style_content_portrait(c):
    lay = Image.new('RGBA', c.size, (0, 0, 0, 0))
    text(lay, (24, 100), '‹ 返回', F(SANSB, 14), fill=INK, anchor='lm')
    text(lay, (PW / 2, 100), '选择风格', F(SERIF, 17), fill=INK, anchor='mm')
    styles = [('羊皮纸', True), ('原版', False), ('冬日', False), ('墨韵', False)]
    y0 = 130
    for i, (name, on) in enumerate(styles):
        y = y0 + i * 48
        put(lay, nine('strip_parchment', PW - 48, 42), 24, y, 0.15)
        # color dot
        d = ImageDraw.Draw(lay)
        cols = [(214, 190, 148), (120, 140, 90), (180, 200, 220), (60, 60, 70)]
        d.ellipse([(40) * K, (y + 10) * K, (62) * K, (y + 32) * K], fill=cols[i] + (255,), outline=INK + (100,), width=1)
        text(lay, (74, y + 21), name, F(SANS, 15), fill=INK, anchor='lm')
        if on:
            put(lay, tpt('icon_check', 20, 20), PW - 56, y + 11, 0)
    c.alpha_composite(lay)

# annotation helpers
AC = (225, 0, 130); SC = (0, 160, 215)

def ann_box(c, r, label=None, side='r', col=AC):
    x, y, w, h = r; d = ImageDraw.Draw(c, 'RGBA')
    d.rectangle([x * K, y * K, (x + w) * K, (y + h) * K], outline=col + (255,), width=2)
    if label:
        f = ImageFont.truetype(SANSB, 20, index=2); tw = f.getlength(label)
        pos = {'r': ((x + w) * K + 6, (y + h / 2) * K - 13),
               'l': (x * K - tw - 14, (y + h / 2) * K - 13),
               'b': (x * K, (y + h) * K + 4),
               't': (x * K, y * K - 30)}[side]
        d.rectangle([pos[0] - 3, pos[1] - 1, pos[0] + tw + 5, pos[1] + 27], fill=(255, 255, 255, 225))
        d.text(pos, label, font=f, fill=col)

def ann_h(c, y, x0, x1, label, col=AC, above=True):
    d = ImageDraw.Draw(c, 'RGBA'); d.line([(x0 * K, y * K), (x1 * K, y * K)], fill=col, width=2)
    for xx in (x0, x1):
        d.line([(xx * K, (y - 4) * K), (xx * K, (y + 4) * K)], fill=col, width=2)
    if not label: return
    f = ImageFont.truetype(SANSB, 20, index=2); tw = f.getlength(label)
    px_ = ((x0 + x1) / 2) * K - tw / 2; py_ = (y * K - 32 if above else y * K + 4)
    d.rectangle([px_ - 3, py_ - 1, px_ + tw + 5, py_ + 27], fill=(255, 255, 255, 225))
    d.text((px_, py_), label, font=f, fill=col)

def ann_v(c, x, y0, y1, label, col=AC):
    d = ImageDraw.Draw(c, 'RGBA'); d.line([(x * K, y0 * K), (x * K, y1 * K)], fill=col, width=2)
    for yy in (y0, y1):
        d.line([((x - 4) * K, yy * K), ((x + 4) * K, yy * K)], fill=col, width=2)
    f = ImageFont.truetype(SANSB, 20, index=2); tw = f.getlength(label)
    px_, py_ = x * K + 8, ((y0 + y1) / 2) * K - 13
    d.rectangle([px_ - 3, py_ - 1, px_ + tw + 5, py_ + 27], fill=(255, 255, 255, 225))
    d.text((px_, py_), label, font=f, fill=col)

def safe_overlay_p(c):
    lay = Image.new('RGBA', c.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    d.rectangle([0, 0, PW * K, STATUS_P * K], fill=SC + (45,))
    d.rectangle([0, (PH - HOME_P) * K, PW * K, PH * K], fill=SC + (45,))
    x0, y0, x1, y1 = CAP_P
    d.rectangle([(x0 - 8) * K, (y0 - 4) * K, (x1 + 7) * K, (y1 + 8) * K], outline=SC + (255,), width=2)
    c.alpha_composite(lay)

def safe_overlay_l(c):
    lay = Image.new('RGBA', c.size, (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    d.rectangle([0, (LH - HOME_L) * K, LW * K, LH * K], fill=SC + (45,))
    x0, y0, x1, y1 = CAP_L
    d.rectangle([(x0 - 8) * K, (y0 - 4) * K, (x1 + 7) * K, (y1 + 8) * K], outline=SC + (255,), width=2)
    # notch / dynamic island left side approx
    d.rectangle([0, 0, 44 * K, LH * K], fill=SC + (30,))
    c.alpha_composite(lay)

def sheet(path, title, sub, phone, legend, phone_size=None):
    if phone_size is None:
        pw, ph = phone.size
    else:
        pw, ph = phone_size
    gap = 30; lw_ = 560
    out = Image.new('RGB', (pw + lw_ + 3 * gap, ph + 150), (40, 28, 18))
    d = ImageDraw.Draw(out)
    d.text((gap, 22), title, font=ImageFont.truetype(SANSB, 36, index=2), fill=CREAM)
    d.text((gap, 72), sub, font=ImageFont.truetype(SANS, 20, index=2), fill=(214, 196, 160))
    out.paste(phone.convert('RGB'), (gap, 120))
    y = 120; fx = ImageFont.truetype(SANS, 20, index=2); fh = ImageFont.truetype(SANSB, 22, index=2)
    for ln in legend:
        if ln.startswith('#'):
            y += 8; d.text((pw + 2 * gap, y), ln[1:].strip(), font=fh, fill=(240, 214, 160)); y += 34; continue
        # wrap
        cur = ''
        for ch in ln:
            if fx.getlength(cur + ch) > lw_ and cur:
                d.text((pw + 2 * gap, y), cur, font=fx, fill=CREAM); y += 28; cur = ch
            else:
                cur += ch
        if cur:
            d.text((pw + 2 * gap, y), cur, font=fx, fill=CREAM); y += 28
    out.save(path, optimize=True, quality=90)
    return out
