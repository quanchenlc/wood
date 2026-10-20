"""Sealed chopping-block stump mesh + glTF (ClampToEdge samplers, UV seam column).

ClampToEdge (33071) forbids U outside [0,1]. Rotate the *geometry* so the
u=0/u=1 seam faces away from camera; keep UVs strictly in [0,1].
"""
import json, math, numpy as np, sys
from pathlib import Path

out = Path(sys.argv[1])
R_TOP = float(sys.argv[2])
R_BOT = float(sys.argv[3])
H = float(sys.argv[4])
segs = int(sys.argv[5])
stacks = int(sys.argv[6])
uneven = float(sys.argv[7])
seed = int(sys.argv[8])
oval = float(sys.argv[9])
ridge = float(sys.argv[10])
rng = np.random.default_rng(seed)

CLAMP = 33071  # GL_CLAMP_TO_EDGE

# Geometric seam faces away from default gameplay camera (front ≈ +Z).
# UVs stay in [0, 1] so ClampToEdge does not collapse the last strip.
# a=0 → +X; a=π/2 → +Z (camera front). Put seam at −Z (back).
SEAM_YAW = -0.5 * math.pi

verts = []
uvs = []
norms = []
idx = []


def add_v(x, y, z, u, v, nx, ny, nz):
    verts.extend([float(x), float(y), float(z)])
    uvs.extend([float(u), float(v)])
    norms.extend([float(nx), float(ny), float(nz)])
    return len(verts) // 3 - 1


def radius_at(t, a):
    flare = t * t
    r = R_TOP * (1 - flare) + R_BOT * flare
    r *= 1 + 0.02 * math.sin(t * math.pi * 2)
    rw = r * (1 + ridge * math.sin(a * 5 + t * 2) * (0.35 + 0.65 * t))
    rx = rw * (1 + oval * math.cos(a * 2))
    rz = rw * (1 - oval * math.sin(a * 2))
    return rx, rz


# Side grid with DUPLICATE seam column at u=0 and u=1 (both in [0,1]).
side = [[None] * (segs + 1) for _ in range(stacks + 1)]
for j in range(stacks + 1):
    t = j / stacks
    y = -t * H
    for i in range(segs + 1):
        a = 2 * math.pi * (i % segs) / segs + SEAM_YAW
        rx, rz = radius_at(t, a)
        x, z = rx * math.cos(a), rz * math.sin(a)
        nx, nz = math.cos(a), math.sin(a)
        u = i / segs  # 0 .. 1 inclusive on last column
        side[j][i] = add_v(x, y, z, u, t * 0.42, nx, 0, nz)

for j in range(stacks):
    for i in range(segs):
        a, b, c, d = side[j][i], side[j][i + 1], side[j + 1][i], side[j + 1][i + 1]
        idx.extend([a, c, b, b, c, d])

# Top disk — UV deep inside end-grain atlas half (v≳0.58), away from bark boundary at v=0.5
# Atlas: bark v∈[0,0.5), end grain v∈[0.5,1]. Keep radius ≤0.18 around (0.5, 0.78).
center = add_v(0, 0.001, 0, 0.5, 0.78, 0, 1, 0)
top_ring = []
for i in range(segs):
    a = 2 * math.pi * i / segs + SEAM_YAW
    rx, rz = radius_at(0, a)
    bump = uneven * (math.sin(a * 3) + 0.5 * math.cos(a * 5))
    x, z = rx * math.cos(a), rz * math.sin(a)
    u = 0.5 + 0.18 * math.cos(a)
    v = 0.78 + 0.18 * math.sin(a)
    top_ring.append(add_v(x, 0.001 + bump, z, u, v, 0, 1, 0))
for i in range(segs):
    idx.extend([center, top_ring[(i + 1) % segs], top_ring[i]])

# Thin lid seal: end-grain UVs (same as top_ring) — avoids grey bark rim on the top edge
for i in range(segs):
    i2 = (i + 1) % segs
    a_ang = 2 * math.pi * i / segs + SEAM_YAW
    a_ang2 = 2 * math.pi * i2 / segs + SEAM_YAW
    rx, rz = radius_at(0.004, a_ang)
    rx2, rz2 = radius_at(0.004, a_ang2)
    # inherit top-ring UVs so the bevel stays wood-colored
    ua, va = 0.5 + 0.18 * math.cos(a_ang), 0.78 + 0.18 * math.sin(a_ang)
    ub, vb = 0.5 + 0.18 * math.cos(a_ang2), 0.78 + 0.18 * math.sin(a_ang2)
    skirt_a = add_v(
        rx * math.cos(a_ang),
        -0.002,
        rz * math.sin(a_ang),
        ua,
        va,
        math.cos(a_ang) * 0.2,
        0.98,
        math.sin(a_ang) * 0.2,
    )
    skirt_b = add_v(
        rx2 * math.cos(a_ang2),
        -0.002,
        rz2 * math.sin(a_ang2),
        ub,
        vb,
        math.cos(a_ang2) * 0.2,
        0.98,
        math.sin(a_ang2) * 0.2,
    )
    c, d = side[0][i], side[0][i2]
    # side-to-bevel uses bark UVs on side verts; bevel itself is end-grain
    idx.extend([skirt_a, c, skirt_b, skirt_b, c, d])
    idx.extend([top_ring[i], skirt_a, top_ring[i2], top_ring[i2], skirt_a, skirt_b])

# Bottom cap
bc = add_v(0, -H - 0.001, 0, 0.5, 0.58, 0, -1, 0)
bot_ring = []
for i in range(segs):
    a = 2 * math.pi * i / segs + SEAM_YAW
    rx, rz = radius_at(1.0, a)
    x, z = rx * math.cos(a), rz * math.sin(a)
    bot_ring.append(add_v(x, -H - 0.001, z, 0.15, 0.58, 0, -1, 0))
for i in range(segs):
    idx.extend([bc, bot_ring[i], bot_ring[(i + 1) % segs]])
for i in range(segs):
    i2 = (i + 1) % segs
    a, b = bot_ring[i], bot_ring[i2]
    c, d = side[stacks][i], side[stacks][i2]
    idx.extend([a, b, c, b, d, c])

# Opaque plug under top — deeper in end-grain half
plug_c = add_v(0, -0.02, 0, 0.5, 0.78, 0, 1, 0)
plug_ring = []
for i in range(segs):
    a = 2 * math.pi * i / segs + SEAM_YAW
    rx, rz = radius_at(0.05, a)
    x, z = rx * math.cos(a) * 0.98, rz * math.sin(a) * 0.98
    u = 0.5 + 0.16 * math.cos(a)
    v = 0.78 + 0.16 * math.sin(a)
    plug_ring.append(add_v(x, -0.02, z, u, v, 0, 1, 0))
for i in range(segs):
    idx.extend([plug_c, plug_ring[(i + 1) % segs], plug_ring[i]])

pos = np.array(verts, np.float32)
nrm = np.array(norms, np.float32)
uv = np.array(uvs, np.float32)
ix = np.array(idx, np.uint16)
parts = [pos.tobytes(), nrm.tobytes(), uv.tobytes(), ix.tobytes()]
blob = b""
bv = []
off = 0
for raw, is_idx in zip(parts, [False, False, False, True]):
    bv.append(
        {
            "buffer": 0,
            "byteOffset": off,
            "byteLength": len(raw),
            "target": 34963 if is_idx else 34962,
        }
    )
    blob += raw
    off += len(raw)
    while off % 4:
        blob += b"\x00"
        off = len(blob)
(out / "stump.bin").write_bytes(blob)
gltf = {
    "asset": {"version": "2.0", "generator": "firewood-sealed-block"},
    "buffers": [{"byteLength": len(blob), "uri": "stump.bin"}],
    "bufferViews": bv,
    "accessors": [
        {
            "bufferView": 0,
            "componentType": 5126,
            "count": len(pos) // 3,
            "type": "VEC3",
            "min": pos.reshape(-1, 3).min(0).tolist(),
            "max": pos.reshape(-1, 3).max(0).tolist(),
        },
        {"bufferView": 1, "componentType": 5126, "count": len(nrm) // 3, "type": "VEC3"},
        {"bufferView": 2, "componentType": 5126, "count": len(uv) // 2, "type": "VEC2"},
        {"bufferView": 3, "componentType": 5123, "count": len(ix), "type": "SCALAR"},
    ],
    "images": [{"uri": "stump_baseColor.jpg"}, {"uri": "stump_normal.jpg"}],
    "samplers": [{"magFilter": 9729, "minFilter": 9987, "wrapS": CLAMP, "wrapT": CLAMP}],
    "textures": [{"sampler": 0, "source": 0}, {"sampler": 0, "source": 1}],
    "materials": [
        {
            "name": "stump",
            "doubleSided": True,
            "pbrMetallicRoughness": {
                "baseColorTexture": {"index": 0},
                "metallicFactor": 0,
                "roughnessFactor": 0.85,
            },
            "normalTexture": {"index": 1},
        }
    ],
    "meshes": [
        {
            "name": "stump",
            "primitives": [
                {
                    "attributes": {"POSITION": 0, "NORMAL": 1, "TEXCOORD_0": 2},
                    "indices": 3,
                    "material": 0,
                }
            ],
        }
    ],
    "nodes": [{"name": "stump", "mesh": 0}],
    "scenes": [{"nodes": [0]}],
    "scene": 0,
}
(out / "stump.gltf").write_text(json.dumps(gltf))
mn, mx = pos.reshape(-1, 3).min(0), pos.reshape(-1, 3).max(0)
u_min, u_max = float(uv.reshape(-1, 2)[:, 0].min()), float(uv.reshape(-1, 2)[:, 0].max())
print(
    "sealed",
    out,
    "verts",
    len(pos) // 3,
    "Y",
    float(mn[1]),
    float(mx[1]),
    "R",
    float(max(abs(mn[0]), abs(mx[0]), abs(mn[2]), abs(mx[2]))),
    "wrap",
    CLAMP,
    "u",
    u_min,
    u_max,
)
if u_min < -1e-4 or u_max > 1.0 + 1e-4:
    raise SystemExit(f"UV.u out of ClampToEdge range: [{u_min}, {u_max}]")
