# Credits & licences — Firewood 0.4.11 axe-exit-snappy + swing-clip + pack4-audio

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
| `axe_swing_clip.glb` | Project `minigame/scripts/build_axe_swing_clip.mjs` (self-authored swing TRS) | Original |

Swing uses **mixer + clip + orientToCamera** (`AxeAnimation.ts` loads `axe_swing_clip.glb`). No screen.toys / ax_anim curves.

## Audio (pack4 层次)

Shipped `public/assets/sounds/*.mp3` (bg, drop, split×6, splitb×10, stack×14) are the **pack4 层次** set: CC0 Freesound sources only (no screen.toys audio). Built as mono 22.05 kHz CBR 48 kbps (bg 40 kbps). Original game audio was used only as a measurement reference (duration / loudness / spectrum).

Licence pages re-checked on 2026-10-19; each source is **CC0 1.0**. Attribution not legally required; listed for provenance.

### Sources (pack4 only)

| Freesound id | Author | Title | URL | Licence |
|---|---|---|---|---|
| 181801 | keweldog | breeze.wav | https://freesound.org/people/keweldog/sounds/181801/ | CC0 1.0 |
| 220951 | Islabonita | Splitting / chopping logs in a shed.wav | https://freesound.org/people/Islabonita/sounds/220951/ | CC0 1.0 |
| 249158 | MHockett | SplittingWood.wav | https://freesound.org/people/MHockett/sounds/249158/ | CC0 1.0 |
| 354104 | Bini_trns | splitting an old tree trunk, close up, one single crack, H6.wav | https://freesound.org/people/Bini_trns/sounds/354104/ | CC0 1.0 |
| 452114 | kyles | log wood branch drop in snow various and pick up.wav | https://freesound.org/people/kyles/sounds/452114/ | CC0 1.0 |
| 457263 | kylecutsfilms | Sticks Dropping.WAV | https://freesound.org/people/kylecutsfilms/sounds/457263/ | CC0 1.0 |
| 460178 | johanwestling | forest_ambience_steady_breeze_summer_sweden_leaves_light_wind_distant_highway_loop_m10.wav | https://freesound.org/people/johanwestling/sounds/460178/ | CC0 1.0 |
| 483350 | craigsmith | R17-38-Wood Clattering.wav | https://freesound.org/people/craigsmith/sounds/483350/ | CC0 1.0 |
| 489885 | douglasbruce@look.ca | STACKING - MOVING - SPLIT FIREWOOD.wav | https://freesound.org/people/douglasbruce@look.ca/sounds/489885/ | CC0 1.0 |
| 537435 | wavecal22 | Wood Chop 8.wav | https://freesound.org/people/wavecal22/sounds/537435/ | CC0 1.0 |
| 573812 | TRP | Axe chop sequence v2 MIXED.flac | https://freesound.org/people/TRP/sounds/573812/ | CC0 1.0 |
| 584891 | KrystianPawlowski | big log on dirt throwing.wav | https://freesound.org/people/KrystianPawlowski/sounds/584891/ | CC0 1.0 |
| 585324 | timetoarrive | SFX - Wood Splitting.wav | https://freesound.org/people/timetoarrive/sounds/585324/ | CC0 1.0 |
| 596484 | EugeneEverett | Planks Dropped.wav | https://freesound.org/people/EugeneEverett/sounds/596484/ | CC0 1.0 |
| 614449 | atomixsound | woodcutfx-001.WAV | https://freesound.org/people/atomixsound/sounds/614449/ | CC0 1.0 |

### Per-file provenance (pack4 层次)

Format: `file ← freesound_id @ start_seconds (pitch shift in semitones)`, plus any layers.

- bg.mp3 ← 460178 @ 39.0s (+0 dB) + 181801 @ 4.0s (-8 dB) — 57.9 s seamless loop
- drop.mp3 ← 489885 @ 8.2983s (+0 st) + low layer: 584891@4.1402s
- split1.mp3 ← 573812 @ 33.6981s (+0 st) + transient: 220951@73.4808s
- split2.mp3 ← 537435 @ 1.2366s (+0.3 st) + transient: 220951@49.4256s
- split3.mp3 ← 573812 @ 2.6618s (-0.3 st) + transient: 585324@37.9992s
- split4.mp3 ← 220951 @ 75.8402s (+0 st) + transient: 614449@5.1608s
- split5.mp3 ← 220951 @ 8.8666s (+0.3 st) + transient: 220951@6.1963s
- split6.mp3 ← 220951 @ 87.2532s (-0.3 st) + transient: 585324@3.2248s
- splitb1.mp3 ← 573812 @ 24.15s (+0 st) + transient: 220951@73.4808s; debris: 489885@5.235s→0.308s, 596484@2.1491s→0.436s, 457263@25.0575s→0.654s, 483350@3.2622s→0.687s
- splitb2.mp3 ← 585324 @ 28.5227s (+0.4 st) + transient: 220951@49.4256s; debris: 596484@2.1491s→0.267s, 457263@25.0575s→0.396s, 483350@3.2622s→0.587s
- splitb3.mp3 ← 573812 @ 14.4542s (-0.4 st) + transient: 585324@37.9992s; debris: 457263@25.0575s→0.333s, 483350@3.2622s→0.41s, 489885@8.2983s→0.628s, 483350@9.3332s→0.718s
- splitb4.mp3 ← 220951 @ 45.3003s (+0 st) + transient: 614449@5.1608s; debris: 483350@3.2622s→0.29s, 489885@8.2983s→0.402s, 483350@9.3332s→0.612s
- splitb5.mp3 ← 249158 @ 1.6788s (+0.4 st) + transient: 220951@6.1963s; debris: 489885@8.2983s→0.328s, 483350@9.3332s→0.401s, 457263@25.4424s→0.592s, 489885@5.235s→0.714s
- splitb6.mp3 ← 614449 @ 0.7483s (-0.4 st) + transient: 585324@3.2248s; debris: 483350@9.3332s→0.276s, 457263@25.4424s→0.433s, 489885@5.235s→0.619s
- splitb7.mp3 ← 573812 @ 19.2095s (+0 st) + transient: 220951@73.4808s; debris: 457263@25.4424s→0.289s, 489885@5.235s→0.384s, 596484@2.1491s→0.604s, 457263@25.0575s→0.728s
- splitb8.mp3 ← 354104 @ 2.3466s (+0.4 st) + transient: 220951@49.4256s; debris: 489885@5.235s→0.319s, 596484@2.1491s→0.402s, 457263@25.0575s→0.619s
- splitb9.mp3 ← 220951 @ 17.5261s (-0.4 st) + transient: 585324@37.9992s; debris: 596484@2.1491s→0.327s, 457263@25.0575s→0.381s, 483350@3.2622s→0.615s, 489885@8.2983s→0.694s
- splitb10.mp3 ← 220951 @ 82.0116s (+0 st) + transient: 614449@5.1608s; debris: 457263@25.0575s→0.293s, 483350@3.2622s→0.404s, 489885@8.2983s→0.587s
- stack1.mp3 ← 457263 @ 25.0575s (-0.8 st) + transient: 489885@5.235s
- stack2.mp3 ← 457263 @ 25.4424s (+1.9 st) + transient: 596484@2.1491s
- stack3.mp3 ← 596484 @ 2.1491s (+0 st) + transient: 457263@25.4424s
- stack4.mp3 ← 457263 @ 25.0575s (+1.4 st) + transient: 452114@55.3935s
- stack5.mp3 ← 489885 @ 8.2983s (+1.9 st) + transient: 452114@57.0049s
- stack6.mp3 ← 483350 @ 3.2622s (+0.7 st) + transient: 489885@8.2983s
- stack7.mp3 ← 483350 @ 3.2622s (+1.4 st) + transient: 489885@5.235s
- stack8.mp3 ← 489885 @ 8.2983s (-1.3 st) + transient: 596484@2.1491s
- stack9.mp3 ← 457263 @ 25.4424s (+0 st) + transient: 457263@25.4424s
- stack10.mp3 ← 483350 @ 9.3332s (+1.4 st) + transient: 452114@55.3935s
- stack11.mp3 ← 489885 @ 5.235s (-1.3 st) + transient: 452114@57.0049s
- stack12.mp3 ← 489885 @ 5.235s (+0.7 st) + transient: 489885@8.2983s
- stack13.mp3 ← 483350 @ 9.3332s (-0.8 st) + transient: 489885@5.235s
- stack14.mp3 ← 596484 @ 2.1491s (+1.9 st) + transient: 596484@2.1491s

## UI parchment

See `ui-parchment-D/notes.md` (public-domain / CC0 scans and project-authored slices). Unrelated to screen.toys.

## Verification

- Forbidden SHA-256 list: `scripts/ip-forbidden-hashes.json` (recorded before deletion).
- Forbidden ax_anim_v03 keyframe floats: `scripts/ip-forbidden-keyframes.json` (baked TRS from the discarded clip — must not reappear as literal curves in source or bundle).
- CI gate: `node scripts/check-ip-hashes.mjs` (fails on matching hashes or ≥8 consecutive keyframe floats within 1e-4).
