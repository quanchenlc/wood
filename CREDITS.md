# Credits & licences — Firewood 0.4.5 final_A

All previously unlicensed screen.toys/firewood assets were removed in 0.4.0.
Replacement sources below were verified on the download date **2026-10-19**.
All four sources are **CC0 1.0 Universal (public domain dedication)**: no attribution legally required, listed for provenance.
No pixels from the screen.toys/firewood originals were used. Those originals were used only to measure scalar statistics (Lab means/std, crack count, ring count), which drove a global colour/tone grade.

## Log textures (bark / end grain / split face)

| Asset (public/assets/) | Source | Author / site | Licence | Processing |
|---|---|---|---|---|
| `outsidebark.jpg` + `outsidebark_n.png` | [ambientCG Bark013](https://ambientcg.com/view?id=Bark013) (1K Color + NormalGL) | Lennart Demes / ambientCG | **CC0 1.0** | Tiled ×2 round the circumference, 1024×512. Global Lab grade: L→47.7 mean (16.5 sd), a +7.1, b −16.2 shift, chroma ×0.56. Normal 512×256 PNG. |
| `top.jpg` + `top_n.png` | [ambientCG TreeEnd002](https://ambientcg.com/view?id=TreeEnd002) (1K Color + Opacity + NormalGL) | Lennart Demes / ambientCG | **CC0 1.0** | Opacity-masked disc warped to an inscribed circle. Global grade to L 81.5 / a 3.7 / b 23.3. 512² colour, 256² normal PNG. |
| `insidegrain.jpg` + `insidegrain_n.png` | [ambientCG Wood061](https://ambientcg.com/view?id=Wood061) (1K Color + NormalGL) | Lennart Demes / ambientCG | **CC0 1.0** | Rotated 90° so the fibres run along the log axis (normal vectors rotated to match). Global grade to L 77.6 / a 3.4 / b 19.4. 512² colour, 256² normal PNG. |

Generator: `art-work/ip-clean/gen-log-textures.py` (historical; no longer produces the shipped log maps).

## Stump atlas (A and B variants + root fallback)

| Asset | Source | Author / site | Licence | Processing |
|---|---|---|---|---|
| `stump_baseColor.jpg`, `stump_normal.png` (root, `stump-a/`, `stump-b/`, byte-identical) | Side band: [ambientCG Bark013](https://ambientcg.com/view?id=Bark013). Top cap: [ambientCG TreeEnd002](https://ambientcg.com/view?id=TreeEnd002) | Lennart Demes / ambientCG | **CC0 1.0** | Rebuilt into the existing gltf UV layout (side band v 0–0.42, cap centre (0.5, 0.78), r 0.18). Warm grade: bark L 62 / a 8.5 / b 25; cap L 89 / a 12 / b 28. |

Meshes are unchanged and remain the project's own (`art-work/ip-clean/build-stumps.mjs`).

| Variant | Mesh | Licence | Notes |
|---|---|---|---|
| **A** (default) | Solid chopping-block mesh (`art-work/ip-clean/build-stumps.mjs`) | Original mesh + CC0 atlas | Wide squat cylinder, sawn top, mild root flare |
| **B** | Same pipeline, taller flare / oval / ridge | Original | Solid block (not a ring) |

Switch in drawer → 风格 → 「木桩 A / B」 (`fw_stump_variant`).

## Forest floor

| Asset | Source | Author / site | Licence | Processing |
|---|---|---|---|---|
| `ground_floor.jpg` (root, `stump-a/`, `stump-b/`) | [Poly Haven leafy_grass](https://polyhaven.com/a/leafy_grass) (1K diffuse, 2 m × 2 m scan) | Charlotte Baglioni / Poly Haven | **CC0 1.0** | Seamless 512² wrap-resize. Large-scale gradient flattened (σ 40 px, 85 %). Grade to L 41 / a −4 / b 17, with a highlight knee at L 62. Repeated 6×6 over the disc. |

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
