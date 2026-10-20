#!/usr/bin/env python3
"""0.4.1 — remake log maps from CC0 bark scans with vertical furrows.

Prefer Poly Haven bark_brown_02 / ambientCG Bark001 (OpenGL normals).
Warm grey-brown grade, no blue/lilac cast, no blotch overlays.
"""
from __future__ import annotations

import math
import zipfile
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

ROOT = Path("/workspace")
OUT = ROOT / "public/assets"
ACG = Path("/tmp/ip-clean-dl/acg")
PH = Path("/tmp/ip-clean-dl/ph")

# Original mood targets (warm grey-brown — not a hard mean match)
BARK_MEAN = np.array([118.0, 108.0, 92.0])  # warmer than cool grey
END_MEAN = np.array([201.0, 178.0, 144.0])
INNER_MEAN = np.array([213.0, 190.0, 157.0])


def hash2(x, y):
    n = np.sin(x * 127.1 + y * 311.7) * 43758.5453
    return n - np.floor(n)


def value_noise(h, w, scale, seed=0.0):
    ys = np.linspace(0, scale, h, endpoint=False)
    xs = np.linspace(0, scale, w, endpoint=False)
    x, y = np.meshgrid(xs, ys)
    x = x + seed * 17.3
    y = y + seed * 9.1
    x0 = np.floor(x)
    y0 = np.floor(y)
    xf = x - x0
    yf = y - y0
    u = xf * xf * (3 - 2 * xf)
    v = yf * yf * (3 - 2 * yf)
    n00 = hash2(x0, y0)
    n10 = hash2(x0 + 1, y0)
    n01 = hash2(x0, y0 + 1)
    n11 = hash2(x0 + 1, y0 + 1)
    nx0 = n00 * (1 - u) + n10 * u
    nx1 = n01 * (1 - u) + n11 * u
    return nx0 * (1 - v) + nx1 * v


def fbm(h, w, octaves=5, scale=4.0, seed=0.0):
    total = np.zeros((h, w), dtype=np.float64)
    amp = 0.5
    s = scale
    for i in range(octaves):
        total += amp * value_noise(h, w, s, seed + i * 3.7)
        s *= 2.0
        amp *= 0.5
    return total


def to_normal_gl(height: np.ndarray, strength=5.0) -> Image.Image:
    """OpenGL tangent-space normal (Y+ up in map = green)."""
    dy, dx = np.gradient(height)
    nx = -dx * strength
    ny = dy * strength  # OpenGL: +Y in green
    nz = np.ones_like(height)
    length = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-8
    nx, ny, nz = nx / length, ny / length, nz / length
    rgb = np.stack(
        [(nx + 1) * 0.5 * 255, (ny + 1) * 0.5 * 255, (nz + 1) * 0.5 * 255],
        axis=-1,
    )
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))


def strip_blue_cast(rgb: np.ndarray) -> np.ndarray:
    """Kill lilac/blue cast: pull B down toward warm grey-brown."""
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    # where blue exceeds red, blend B toward min(R,G)*0.92
    excess = np.maximum(b - r, 0)
    b2 = b - excess * 0.85
    # slight warm push
    r2 = r * 1.02 + 2.0
    g2 = g * 1.0
    out = np.stack([r2, g2, b2], axis=-1)
    return np.clip(out, 0, 255)


def grade_warm(rgb: np.ndarray, target: np.ndarray, contrast=1.25) -> np.ndarray:
    """Contrast around luminance, then shift mean toward warm target; strip blue."""
    rgb = strip_blue_cast(rgb)
    lum = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    lum_m = lum.mean()
    rgb = (rgb - lum_m) * contrast + lum_m
    # per-channel mean shift (preserves relative detail better than uniform scale)
    cur = rgb.reshape(-1, 3).mean(0)
    shift = target - cur
    rgb = rgb + shift
    # rein in any remaining blue cast after shift
    rgb = strip_blue_cast(rgb)
    # final soft mean nudge
    cur2 = rgb.reshape(-1, 3).mean(0)
    rgb = rgb * (target / np.maximum(cur2, 1.0))
    return np.clip(rgb, 0, 255)


def load_jpg(path: Path) -> np.ndarray | None:
    if not path.exists() or path.stat().st_size < 1000:
        return None
    return np.asarray(Image.open(path).convert("RGB"), dtype=np.float64)


def load_acg(zip_name: str, kind="Color") -> np.ndarray | None:
    zpath = ACG / zip_name
    if not zpath.exists():
        return None
    with zipfile.ZipFile(zpath) as zf:
        names = zf.namelist()
        if kind == "Color":
            picks = [n for n in names if "Color" in n and n.lower().endswith((".jpg", ".jpeg", ".png"))]
        else:
            picks = [
                n
                for n in names
                if "NormalGL" in n and n.lower().endswith((".jpg", ".jpeg", ".png"))
            ]
            if not picks:
                picks = [n for n in names if "Normal" in n and "DX" not in n]
        if not picks:
            return None
        with zf.open(picks[0]) as f:
            return np.asarray(Image.open(f).convert("RGB"), dtype=np.float64)


def tile_to(rgb: np.ndarray, w: int, h: int) -> np.ndarray:
    """Cover 2:1 bark atlas by repeating the scan along U (vertical furrows stay vertical)."""
    im = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    # bark scans are usually square; for cylinder U wraps around → width=2048, height=1024
    # Keep furrows vertical on the log: V = up the trunk (h), U = around (w)
    src_w, src_h = im.size
    # Scale so height fills h, then tile horizontally
    scale = h / src_h
    nw = max(1, int(src_w * scale))
    im = im.resize((nw, h), Image.Resampling.LANCZOS)
    canvas = Image.new("RGB", (w, h))
    x = 0
    while x < w:
        canvas.paste(im, (x, 0))
        x += nw
    return np.asarray(canvas, dtype=np.float64)


def height_from_albedo(rgb: np.ndarray) -> np.ndarray:
    lum = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    # invert: dark fissures = deep
    h = 1.0 - lum / 255.0
    h = np.asarray(
        Image.fromarray((h * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)),
        dtype=np.float64,
    ) / 255.0
    return h


def gen_bark(w=2048, h=1024) -> tuple[Image.Image, Image.Image]:
    # Prefer Bark001 (high-contrast vertical furrows, fewer unique knots → cleaner wrap)
    # then bark_brown_02, Bark012
    src = load_acg("Bark001.zip", "Color")
    nrm_src = load_acg("Bark001.zip", "Normal")
    label = "Bark001"
    if src is None:
        src = load_jpg(PH / "bark_brown_02_diff_1k.jpg")
        nrm_src = load_jpg(PH / "bark_brown_02_nor_gl_1k.jpg")
        label = "bark_brown_02"
    if src is None:
        src = load_acg("Bark012.zip", "Color")
        nrm_src = load_acg("Bark012.zip", "Normal")
        label = "Bark012"
    if src is None:
        raise SystemExit("no CC0 bark source found")

    rgb = tile_to(src, w, h)
    # Kill moss/green cast (common on PH bark_brown_02) → warm grey-brown
    r, g, b = rgb[..., 0], rgb[..., 1], rgb[..., 2]
    green_excess = np.maximum(g - np.maximum(r, b), 0)
    g = g - green_excess * 0.85
    # Also pull cyan/blue moss remnants
    rgb = np.stack([r, g, b], axis=-1)
    rgb = strip_blue_cast(rgb)

    # Avoid obvious tile seams: cross-blend a horizontally shifted copy
    shift = w // 3
    rgb2 = np.roll(rgb, shift, axis=1)
    mix = 0.5 + 0.5 * np.sin(np.linspace(0, 2 * np.pi, w)[None, :])
    rgb = rgb * (1 - 0.35 * mix[..., None]) + rgb2 * (0.35 * mix[..., None])

    # boost local contrast in fissures (no rectangular blotch overlay)
    lum = 0.299 * rgb[..., 0] + 0.587 * rgb[..., 1] + 0.114 * rgb[..., 2]
    blur = np.asarray(
        Image.fromarray(np.clip(lum, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(2.5)),
        dtype=np.float64,
    )
    detail = (lum - blur) * 1.55
    rgb = rgb + detail[..., None]
    # warm reddish flecks in midtones
    fleck = (value_noise(h, w, 40, 3.0) > 0.82) & (lum > 80) & (lum < 150)
    rgb[fleck, 0] = np.minimum(rgb[fleck, 0] + 22, 255)
    rgb[fleck, 1] = np.minimum(rgb[fleck, 1] + 6, 255)
    rgb[fleck, 2] = np.maximum(rgb[fleck, 2] - 8, 0)

    rgb = grade_warm(rgb, BARK_MEAN, contrast=1.4)
    # Soft-wrap left/right so ClampToEdge seam (u=0↔u=1) is not a dark stripe
    blend = 96
    for x in range(blend):
        t = (x + 0.5) / blend
        t = t * t * (3 - 2 * t)
        left = rgb[:, x].copy()
        right = rgb[:, w - 1 - x].copy()
        mid = 0.5 * (left + right)
        # Pull both edges toward their average so u=0 and u=1 match
        rgb[:, x] = left * (1 - t) + mid * t
        rgb[:, w - 1 - x] = right * (1 - t) + mid * t
    # Kill ultra-dark furrows in the seam neighborhood (common on bark scans)
    edge_w = 24
    for x in list(range(edge_w)) + list(range(w - edge_w, w)):
        lum_c = 0.299 * rgb[:, x, 0] + 0.587 * rgb[:, x, 1] + 0.114 * rgb[:, x, 2]
        lift = np.clip(110 - lum_c, 0, 55)[:, None]
        rgb[:, x] = np.clip(rgb[:, x] + lift, 0, 255)

    albedo = Image.fromarray(rgb.astype(np.uint8))

    if nrm_src is not None:
        nrm = tile_to(nrm_src, w, h)
        # Ensure OpenGL Y (already from nor_gl); strip any sRGB-ish encoding by keeping linear
        # Re-normalize channels around 128
        n = (nrm / 255.0) * 2 - 1
        # Flip green if source was DX (bark_brown is GL)
        length = np.sqrt((n**2).sum(-1, keepdims=True)) + 1e-8
        n = n / length
        nrm_img = Image.fromarray(np.clip((n + 1) * 0.5 * 255, 0, 255).astype(np.uint8))
    else:
        nrm_img = to_normal_gl(height_from_albedo(rgb), strength=7.0)

    print(f"[bark] source={label} mean={tuple(rgb.reshape(-1,3).mean(0).round(1))} warm(R-B)={rgb[:,:,0].mean()-rgb[:,:,2].mean():.1f}")
    return albedo, nrm_img


def gen_end(size=1024) -> tuple[Image.Image, Image.Image]:
    """End grain: irregular rings, eccentric pith, pore noise — not a bullseye target."""
    yy, xx = np.mgrid[0:size, 0:size]
    # Clearly eccentric pith (offset ~18% of radius)
    cx = size / 2 + size * 0.16
    cy = size / 2 - size * 0.12
    dx = (xx - cx) / (size / 2)
    dy = (yy - cy) / (size / 2)
    # Strong elliptical + lobed warp so rings aren't a bullseye
    ang0 = np.arctan2(dy, dx)
    ecc = 1.0 + 0.22 * np.cos(2 * ang0 + 0.6) + 0.12 * np.sin(3 * ang0 - 0.4) + 0.06 * np.cos(5 * ang0 + 1.2)
    r = np.sqrt(dx * dx + dy * dy) * ecc
    # Domain-warp radius + angle so rings wobble
    warp = fbm(size, size, 4, 1.6, 1.3) - 0.5
    r = r + 0.09 * warp + 0.04 * (fbm(size, size, 5, 5.0, 2.1) - 0.5)
    ang = np.arctan2(dy, dx) + 0.35 * (fbm(size, size, 3, 1.4, 0.7) - 0.5)
    ring_phase = fbm(size, size, 6, 2.0, 0.4) * 14.0
    ring_freq = 28 + 18 * fbm(size, size, 5, 1.6, 0.9) + 9 * np.sin(ang * 2 + 1.1) + 5 * np.sin(ang * 5 - 0.3)
    rings = 0.5 + 0.5 * np.sin(r * ring_freq + ring_phase)
    rings = rings * (0.55 + 0.45 * fbm(size, size, 4, 3.8, 1.5))
    # Break perfect periodicity with secondary ring set
    rings2 = 0.5 + 0.5 * np.sin(r * (ring_freq * 0.37 + 4) + ring_phase * 0.6 + 1.7)
    rings = 0.72 * rings + 0.28 * rings2
    grain = fbm(size, size, 7, 22.0, 2.6)
    pores = (value_noise(size, size, 90, 1.0) > 0.74).astype(np.float64)
    pores = np.asarray(
        Image.fromarray((pores * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)),
        dtype=np.float64,
    ) / 255.0
    rgb = np.zeros((size, size, 3), dtype=np.float64)
    for c, m in enumerate(END_MEAN):
        rgb[..., c] = m + (rings - 0.5) * 44 + (grain - 0.5) * 24 - pores * 18
    # Heartwood around eccentric pith
    heart = np.clip(1.0 - r * 1.35, 0, 1)[..., None]
    rgb = rgb * (1 - 0.18 * heart) + np.array([168, 142, 108]) * 0.18 * heart
    # A few irregular checks (not one laser crack)
    crack_f = np.zeros((size, size), dtype=np.float64)
    for crack_ang, ww, r0, r1 in (
        (0.35, 0.04, 0.06, 0.98),
        (-1.8, 0.028, 0.15, 0.75),
        (2.4, 0.022, 0.12, 0.6),
        (1.1, 0.016, 0.25, 0.85),
    ):
        dang = np.minimum(np.abs(ang - crack_ang), 2 * math.pi - np.abs(ang - crack_ang))
        crack = (dang < ww) & (r > r0) & (r < r1)
        crack_f = np.maximum(
            crack_f,
            np.asarray(
                Image.fromarray((crack.astype(np.uint8) * 255)).filter(ImageFilter.GaussianBlur(1.0)),
                dtype=np.float64,
            )
            / 255.0,
        )
    rgb = rgb * (1 - 0.55 * crack_f[..., None])
    # Fill full square with wood — no circular grey fade (that caused the stump-top grey rim)
    rgb = strip_blue_cast(rgb)
    rgb = grade_warm(rgb, END_MEAN, contrast=1.15)
    height = rings * 0.35 + grain * 0.25 - crack_f * 0.85 - pores * 0.15
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)), to_normal_gl(height, 5.5)


def gen_inner(size=1024) -> tuple[Image.Image, Image.Image]:
    src = load_acg("Wood048.zip")
    if src is None:
        src = load_acg("Wood062.zip")
    n = fbm(size, size, 5, 6.0, 3.0)
    fibre = fbm(size, size, 4, 48.0, 7.0)
    ys = np.linspace(0, 1, size)[:, None]
    stretch = np.sin(ys * math.pi * 36 + fibre * 5)
    rgb = np.zeros((size, size, 3), dtype=np.float64)
    for c, m in enumerate(INNER_MEAN):
        rgb[..., c] = m + (n - 0.5) * 24 + stretch * 12
    if src is not None:
        tile = np.asarray(
            Image.fromarray(src.astype(np.uint8)).resize((size, size), Image.Resampling.LANCZOS),
            dtype=np.float64,
        )
        # stretch along fibre axis
        tile = np.asarray(
            Image.fromarray(tile.astype(np.uint8)).resize((size, int(size * 1.4)), Image.Resampling.LANCZOS)
            .crop((0, int(size * 0.2), size, int(size * 0.2) + size)),
            dtype=np.float64,
        )
        rgb = 0.35 * rgb + 0.65 * tile
    rgb = strip_blue_cast(rgb)
    rgb = grade_warm(rgb, INNER_MEAN, contrast=1.2)
    height = n * 0.45 + stretch * 0.2
    return Image.fromarray(rgb.astype(np.uint8)), to_normal_gl(height, 5.0)


def save_jpg(im: Image.Image, path: Path, quality=90):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "JPEG", quality=quality, optimize=True)
    a = np.asarray(im.convert("RGB"), dtype=np.float64)
    print("wrote", path.name, path.stat().st_size, im.size, "mean", tuple(a.mean((0, 1)).round(1)),
          "R-B", round(float(a[:, :, 0].mean() - a[:, :, 2].mean()), 1))


def main():
    bark, bark_n = gen_bark()
    end, end_n = gen_end()
    inner, inner_n = gen_inner()
    save_jpg(bark, OUT / "outsidebark.jpg", 91)
    save_jpg(bark_n, OUT / "outsidebark_n.jpg", 88)
    save_jpg(end, OUT / "top.jpg", 91)
    save_jpg(end_n, OUT / "top_n.jpg", 88)
    save_jpg(inner, OUT / "insidegrain.jpg", 91)
    save_jpg(inner_n, OUT / "insidegrain_n.jpg", 88)


if __name__ == "__main__":
    main()
