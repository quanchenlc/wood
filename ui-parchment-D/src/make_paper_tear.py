"""D_fix_v2 paper_tile + tear_edge generator (periodic FBM = seamless by construction).
Re-run: python3 make_paper_tear.py
Outputs: textures/paper_tile@{2,3}x.jpg, textures/tear_edge@{2,3}x.png
"""
import numpy as np, os, subprocess, shutil
from PIL import Image, ImageFilter

OUT = '/workspace/ui-minimal/D_fix_v2/textures/'
WORK = '/workspace/ui-minimal/D_fix_v2/_work/'
R = '/workspace/ui-parchment-v2/raw/'
os.makedirs(OUT, exist_ok=True); os.makedirs(WORK, exist_ok=True)
PNGQ = shutil.which('pngquant') or os.path.expanduser('~/.local/bin/pngquant')

def fbm_periodic(w, h, octaves=5, base=8, seed=0):
    r = np.random.default_rng(seed)
    acc = np.zeros((h, w)); amp = 1.0; tot = 0.0
    for o in range(octaves):
        nw = max(2, base * 2 ** o)
        nh = max(2, int(round(h * nw / w)))
        g = r.random((nh, nw))
        g3 = np.tile(g, (3, 3))
        im = Image.fromarray((g3 * 255).astype(np.uint8)).resize((w * 3, h * 3), Image.BICUBIC)
        patch = np.asarray(im, float)[h:2 * h, w:2 * w] / 255.0
        acc += patch * amp; tot += amp; amp *= 0.5
    return acc / tot

def highpass_periodic(arr, radius):
    h, w = arr.shape
    base = arr - arr.mean()
    tmp = np.tile(base, (3, 3))
    lo, hi = tmp.min(), tmp.max(); span = max(hi - lo, 1e-6)
    im = Image.fromarray(((tmp - lo) / span * 255).astype(np.uint8))
    sm = np.asarray(im.filter(ImageFilter.GaussianBlur(radius)), float)
    sm = sm / 255.0 * span + lo
    return base - sm[h:2 * h, w:2 * w]

def paper(N, seed=11):
    BASE = np.array([216.0, 192.0, 152.0])
    d = np.zeros((N, N))
    d += (fbm_periodic(N, N, 6, max(12, N // 48), seed) - 0.5) * 16
    d += (fbm_periodic(N, N, 5, max(24, N // 24), seed + 1) - 0.5) * 11
    d += (fbm_periodic(N, N, 4, max(48, N // 12), seed + 2) - 0.5) * 7
    d += (fbm_periodic(N, N, 3, max(96, N // 6), seed + 3) - 0.5) * 4
    vel = Image.open(R + 'towneley2.jpg').convert('L')
    vw, vh = vel.size
    crop = vel.crop((int(vw * .22), int(vh * .18), int(vw * .62), int(vh * .52))).resize((N, N), Image.LANCZOS)
    hp = np.clip(highpass_periodic(np.asarray(crop, float), max(20, N // 22)), -10, 10)
    d = highpass_periodic(d + hp * 0.30, max(28, N // 16))
    d = np.clip(d, -18, 18)
    m = (fbm_periodic(N, N, 4, max(16, N // 32), seed + 5) - 0.5) * 5
    rgb = BASE + d[..., None] * np.array([1.0, 0.93, 0.80]) + m[..., None] * np.array([1.05, 0.88, 0.55])
    rgb = np.clip(rgb, 0, 255)
    h, w, _ = rgb.shape
    t = np.tile(rgb, (3, 3, 1))
    im = Image.fromarray(t.astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.5))
    return np.clip(np.asarray(im, float)[h:2 * h, w:2 * w], 0, 255)

def save_png(im, path):
    im.save(path, optimize=True, compress_level=9)
    raw = os.path.getsize(path); q = path + '.q.png'
    r = subprocess.run([PNGQ, '--quality=72-90', '--floyd=0.1', '--speed', '1', '--strip', '--force', '--output', q, path], capture_output=True)
    if r.returncode == 0 and os.path.exists(q) and os.path.getsize(q) < raw * 0.98:
        os.replace(q, path)
    elif os.path.exists(q):
        os.remove(q)
    return os.path.getsize(path)

def make_tear(Wpx, Hpx, seed=82):
    yy, xx = np.mgrid[0:Hpx, 0:Wpx]
    ribbon = np.asarray(Image.open(OUT + 'paper_tile@3x.jpg').resize((Wpx, Hpx), Image.LANCZOS), float)
    n = fbm_periodic(Wpx, Hpx, 6, 10, seed) - 0.5
    n2 = fbm_periodic(Wpx, Hpx, 3, 40, seed + 9) - 0.5
    cap = max(56, int(Wpx * 0.04))
    edge_w = np.array([1.0 + 0.65 * max(0, 1 - min(i, Wpx - 1 - i) / cap) for i in range(Wpx)])
    margin = Hpx * 0.40
    dist = (Hpx - 1 - yy).astype(float) + n * margin * 1.8 * edge_w[None, :] + n2 * margin * 0.5
    a = np.clip((dist - margin * 0.28) / 2.0, 0, 1)
    top_solid = max(10, int(Hpx * 0.32)); a[:top_solid, :] = 1.0
    t = np.clip(1 - (dist - margin * 0.28) / (margin * 0.95), 0, 1) ** 2.2
    tn = fbm_periodic(Wpx, Hpx, 5, 16, seed + 1)
    t = t * np.clip(0.15 + 1.5 * (tn - 0.28), 0, 1.35)
    tint = np.array([88, 55, 28], float)
    rgb = np.clip(ribbon * (1 - 0.72 * t[..., None]) + tint * 0.72 * t[..., None] * 0.5, 0, 255)
    mid = np.array([216, 192, 152], float)
    fade = np.linspace(0.0, 1.0, top_solid)[:, None]
    rgb[:top_solid] = mid * (1 - fade)[..., None] * 0.2 + rgb[:top_solid] * (0.8 + 0.2 * fade)[..., None]
    return rgb, a

if __name__ == '__main__':
    master = paper(1024, 11)
    Image.fromarray(master.astype(np.uint8)).save(OUT + 'paper_tile@3x.jpg', quality=90, optimize=True, progressive=True, subsampling=0)
    Image.fromarray(paper(512, 11).astype(np.uint8)).save(OUT + 'paper_tile@2x.jpg', quality=90, optimize=True, progressive=True, subsampling=0)
    np.tile(master, (2, 2, 1)).astype(np.uint8)
    Image.fromarray(np.tile(master, (2, 2, 1)).astype(np.uint8)).resize((1024, 1024), Image.LANCZOS).save(WORK + 'paper_tile_2x2_preview.png')
    for sc, W, H in ((3, 2436, 96), (2, 1624, 64)):
        rgb, a = make_tear(W, H, 82)
        im = Image.fromarray(np.dstack([rgb.astype(np.uint8), (a * 255).astype(np.uint8)]), 'RGBA')
        print(f'tear@{sc}x', save_png(im, OUT + f'tear_edge@{sc}x.png'))
    print('paper', os.path.getsize(OUT + 'paper_tile@2x.jpg'), os.path.getsize(OUT + 'paper_tile@3x.jpg'))
