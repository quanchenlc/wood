#!/usr/bin/env python3
"""Generate log albedo/normal maps matching original mean colours & resolutions.

Sources (see CREDITS.md):
- Optional ambientCG Bark007 / Wood* (CC0) recolored to target means
- Procedural rings / fibres / crack when CC0 tiles absent
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
DATE = "2026-10-19"

BARK_MEAN = np.array([115.0, 107.0, 98.0])
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


def to_normal(height: np.ndarray, strength=4.0) -> Image.Image:
    """Central difference height → tangent-space normal RGB."""
    dy, dx = np.gradient(height)
    nx = -dx * strength
    ny = -dy * strength
    nz = np.ones_like(height)
    length = np.sqrt(nx * nx + ny * ny + nz * nz) + 1e-8
    nx, ny, nz = nx / length, ny / length, nz / length
    rgb = np.stack(
        [(nx + 1) * 0.5 * 255, (ny + 1) * 0.5 * 255, (nz + 1) * 0.5 * 255],
        axis=-1,
    )
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))


def recolor_to_mean(rgb: np.ndarray, target: np.ndarray) -> np.ndarray:
    cur = rgb.mean(axis=(0, 1))
    scale = target / np.maximum(cur, 1.0)
    out = rgb * scale
    # mild contrast preserve
    mean = out.mean(axis=(0, 1), keepdims=True)
    out = mean + (out - mean) * 1.05
    return np.clip(out, 0, 255)


def load_acg_color(zip_name: str, prefer=("Color", "color", "diff")) -> np.ndarray | None:
    zpath = ACG / zip_name
    if not zpath.exists() or zpath.stat().st_size < 1000:
        return None
    try:
        with zipfile.ZipFile(zpath) as zf:
            names = zf.namelist()
            pick = None
            for p in prefer:
                for n in names:
                    if p.lower() in n.lower() and n.lower().endswith((".jpg", ".jpeg", ".png")):
                        if "normal" in n.lower() or "rough" in n.lower() or "metal" in n.lower():
                            continue
                        pick = n
                        break
                if pick:
                    break
            if not pick:
                return None
            with zf.open(pick) as f:
                im = Image.open(f).convert("RGB")
            return np.asarray(im, dtype=np.float64)
    except Exception as e:
        print("acg load fail", zip_name, e)
        return None


def gen_bark(w=2048, h=1024) -> tuple[Image.Image, Image.Image]:
    src = load_acg_color("Bark007.zip")
    if src is not None:
        im = Image.fromarray(src.astype(np.uint8)).resize((w, h), Image.LANCZOS)
        rgb = np.asarray(im, dtype=np.float64)
        # tile vertically for 2:1 aspect if needed
        rgb = recolor_to_mean(rgb, BARK_MEAN)
        # add vertical fissures
        n = fbm(h, w, 6, 6.0, 2.0)
        fissure = (value_noise(h, w, 18, 8.0) > 0.72).astype(np.float64)
        fissure = Image.fromarray((fissure * 255).astype(np.uint8)).filter(
            ImageFilter.GaussianBlur(1.2)
        )
        fissure = np.asarray(fissure, dtype=np.float64) / 255.0
        rgb = rgb * (1 - 0.18 * fissure[..., None])
        height = fbm(h, w, 5, 10.0, 1.0) * 0.6 + fissure * 0.5
    else:
        n = fbm(h, w, 6, 8.0, 1.0)
        v = fbm(h, w, 4, 22.0, 5.0)
        rgb = np.zeros((h, w, 3), dtype=np.float64)
        for c, m in enumerate(BARK_MEAN):
            rgb[..., c] = m + (n - 0.5) * 42 + (v - 0.5) * 18
        # vertical cracks
        xs = np.linspace(0, 1, w)
        cracks = np.zeros((h, w))
        for k in range(14):
            cx = (0.07 + 0.86 * hash2(k * 1.3, 2.1)) % 1.0
            wobble = 0.01 * np.sin(np.linspace(0, 18, h) + k)
            d = np.abs(xs[None, :] - (cx + wobble[:, None]))
            cracks += np.exp(-((d * w) ** 2) / 8.0)
        rgb *= 1 - 0.22 * np.clip(cracks, 0, 1)[..., None]
        height = n * 0.7 + cracks * 0.6
        rgb = recolor_to_mean(np.clip(rgb, 0, 255), BARK_MEAN)
    albedo = Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8))
    return albedo, to_normal(height, strength=6.0)


def gen_end(size=1024) -> tuple[Image.Image, Image.Image]:
    """End grain: rings + radial crack, mean ~ (201,178,144)."""
    yy, xx = np.mgrid[0:size, 0:size]
    cx = cy = size / 2
    dx = (xx - cx) / (size / 2)
    dy = (yy - cy) / (size / 2)
    r = np.sqrt(dx * dx + dy * dy)
    ang = np.arctan2(dy, dx)
    # growth rings
    rings = 0.5 + 0.5 * np.sin(r * 42 + fbm(size, size, 3, 3.0, 0.5) * 3.5)
    rings = rings * (r < 1.02)
    grain = fbm(size, size, 4, 14.0, 2.2)
    rgb = np.zeros((size, size, 3), dtype=np.float64)
    for c, m in enumerate(END_MEAN):
        rgb[..., c] = m + (rings - 0.5) * 38 + (grain - 0.5) * 16
    # radial crack
    crack_ang = 0.35
    dang = np.minimum(np.abs(ang - crack_ang), np.abs(ang - crack_ang + 2 * math.pi))
    crack = (dang < 0.045) & (r > 0.08) & (r < 0.98)
    crack_f = Image.fromarray((crack.astype(np.uint8) * 255)).filter(ImageFilter.GaussianBlur(1.0))
    crack_f = np.asarray(crack_f, dtype=np.float64) / 255.0
    rgb *= 1 - 0.45 * crack_f[..., None]
    rgb[crack] = rgb[crack] * 0.55
    # soft disk mask edge
    edge = np.clip((1.05 - r) * 8, 0, 1)
    rgb = rgb * edge[..., None] + END_MEAN * (1 - edge[..., None]) * 0.85
    # optional wood tile modulate
    src = load_acg_color("Wood062.zip")
    if src is None:
        src = load_acg_color("Wood048.zip")
    if src is not None:
        tile = np.asarray(
            Image.fromarray(src.astype(np.uint8)).resize((size, size), Image.LANCZOS),
            dtype=np.float64,
        )
        tile = recolor_to_mean(tile, END_MEAN)
        rgb = 0.55 * rgb + 0.45 * tile
        rgb = recolor_to_mean(rgb, END_MEAN)
    height = rings * 0.35 + grain * 0.25 - crack_f * 0.8
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)), to_normal(height, 5.0)


def gen_inner(size=1024) -> tuple[Image.Image, Image.Image]:
    """Split face: longitudinal fibres."""
    src = load_acg_color("Wood048.zip")
    if src is None:
        src = load_acg_color("Wood062.zip")
    n = fbm(size, size, 5, 6.0, 3.0)
    # long fibres along X
    fibre = fbm(size, size, 4, 40.0, 7.0)
    ys = np.linspace(0, 1, size)[:, None]
    stretch = np.sin(ys * math.pi * 28 + fibre * 4)
    rgb = np.zeros((size, size, 3), dtype=np.float64)
    for c, m in enumerate(INNER_MEAN):
        rgb[..., c] = m + (n - 0.5) * 22 + stretch * 10
    if src is not None:
        tile = np.asarray(
            Image.fromarray(src.astype(np.uint8)).resize((size, size), Image.LANCZOS),
            dtype=np.float64,
        )
        # stretch vertically for fibre look
        tile = recolor_to_mean(tile, INNER_MEAN)
        rgb = 0.4 * rgb + 0.6 * tile
        rgb = recolor_to_mean(rgb, INNER_MEAN)
    height = n * 0.4 + stretch * 0.15
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8)), to_normal(height, 4.5)


def save_jpg(im: Image.Image, path: Path, quality=88):
    path.parent.mkdir(parents=True, exist_ok=True)
    im.save(path, "JPEG", quality=quality, optimize=True)
    print("wrote", path, path.stat().st_size, im.size)


def main():
    bark, bark_n = gen_bark()
    end, end_n = gen_end()
    inner, inner_n = gen_inner()
    save_jpg(bark, OUT / "outsidebark.jpg", 90)
    save_jpg(bark_n, OUT / "outsidebark_n.jpg", 88)
    save_jpg(end, OUT / "top.jpg", 90)
    save_jpg(end_n, OUT / "top_n.jpg", 88)
    save_jpg(inner, OUT / "insidegrain.jpg", 90)
    save_jpg(inner_n, OUT / "insidegrain_n.jpg", 88)
    # report means
    for name in [
        "outsidebark.jpg",
        "top.jpg",
        "insidegrain.jpg",
    ]:
        a = np.asarray(Image.open(OUT / name).convert("RGB"), dtype=np.float64)
        print(name, "mean", tuple(a.mean(axis=(0, 1)).round(1)))


if __name__ == "__main__":
    main()
