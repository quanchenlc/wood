# Credits & licences — Firewood 0.4.0 ip-clean

All previously unlicensed screen.toys/firewood assets were removed in 0.4.0.
Replacement sources below were verified on the download date **2026-10-19**.

## Log textures (bark / end grain / split face)

| Asset | Source | Licence | Notes | Downloaded |
|---|---|---|---|---|
| `outsidebark.jpg` (+ `_n`) | [ambientCG Bark007](https://ambientcg.com/view?id=Bark007) 1K JPG pack, recolored to mean RGB(115,107,98); fissure detail procedural | **CC0 1.0** | UV 2048×1024 | 2026-10-19 |
| `top.jpg` (+ `_n`) | Procedural growth rings + radial crack; colour matched to RGB(201,178,144); fibre modulate from [ambientCG Wood062](https://ambientcg.com/view?id=Wood062) / [Wood048](https://ambientcg.com/view?id=Wood048) (CC0) | **CC0** (ACG) + original procedural | 1024×1024 | 2026-10-19 |
| `insidegrain.jpg` (+ `_n`) | Procedural longitudinal fibre + [ambientCG Wood048](https://ambientcg.com/view?id=Wood048) recolor to RGB(213,190,157) | **CC0** + original procedural | 1024×1024 | 2026-10-19 |

Generator: `art-work/ip-clean/gen-log-textures.py`.

## Stump + forest floor

| Variant | Mesh / textures | Licence | Notes | Downloaded |
|---|---|---|---|---|
| **A** (default) | [Poly Haven `tree_stump_01`](https://polyhaven.com/a/tree_stump_01) glTF 1k (diff/nor) | **CC0** | Scaled to game radius; Y stretched for playable height; LOD simplified; flat end-grain cap uses our remade `top.jpg` | 2026-10-19 |
| **A** ground | [Poly Haven `forest_leaves_03`](https://polyhaven.com/a/forest_leaves_03) diffuse 1k | **CC0** | Disc albedo under stump | 2026-10-19 |
| **B** | Original procedural stump (`art-work/ip-clean/build-stumps.mjs`) textured with our log maps | Original | Uneven top silhouette | 2026-10-19 |
| **B** ground | [ambientCG Ground037](https://ambientcg.com/view?id=Ground037) (fallback: forest_leaves_03) | **CC0** | | 2026-10-19 |

Switch in drawer → 风格 → 「木桩 A / B」 (`fw_stump_variant`).

## Axe

| Asset | Source | Licence |
|---|---|---|
| `axe.gltf` / `axe.bin` / `axe_baseColor.jpg` / `axe_orm.png` | Project `minigame/scripts/build_axe_placeholder.mjs` (wood-handle placeholder) | Original |

Swing animation is **code-keyed** in `src/anim/AxeAnimation.ts` (no third-party clip).

## Audio

All `public/assets/sounds/*.mp3` (bg, drop, split×6, splitb×10, stack×14) are **synthesized** for this project (`art-work/ip-clean/gen-sounds.py` + ffmpeg LAME). No Freesound or commercial samples were embedded — synthesis was chosen to guarantee clear provenance while keeping the same event mapping and a small footprint (~134–200KB).

## UI parchment

See `ui-parchment-D/notes.md` (public-domain / CC0 scans and project-authored slices). Unrelated to screen.toys.

## Verification

- Forbidden SHA-256 list: `scripts/ip-forbidden-hashes.json` (recorded before deletion).
- CI gate: `node scripts/check-ip-hashes.mjs` (fails if any shipped file matches).
