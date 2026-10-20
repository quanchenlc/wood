# UI Parchment v3 — SIZE_MANIFEST

Design space: **375×812 logical pt** (CSS px). Textures are authored at **@3x** (`scale` 3 = 3 texels per pt → 1:1 on dpr-3 phones); `panel_vellum` is @2x (soft paper, budget).
Draw size in pt = px ÷ scale. 9-slice: **source** insets in px, **destination** insets in pt (= px ÷ scale).

## Runtime textures (ship: `export/textures/` → `minigame/ui/parchment/` + `public/ui/parchment/`)

| file | W×H px | scale | logical pt | bytes | KB | 9-slice px (L,T,R,B) | 9-slice pt | role |
|---|---|---|---|---|---|---|---|---|
| `btn_icon_ad.png` | 156×156 | @3x | 52×52 | 15346 | 15.0 | — | — | round icon button 看短片加速/额度 (rewarded video); label drawn at runtime under the disc |
| `btn_icon_help.png` | 156×156 | @3x | 52×52 | 15768 | 15.4 | — | — | round icon button 重看新手引导; label drawn at runtime under the disc |
| `btn_icon_rank.png` | 156×156 | @3x | 52×52 | 15826 | 15.5 | — | — | round icon button 好友柴榜; label drawn at runtime under the disc |
| `btn_leather.png` | 660×180 | @3x | 220×60 | 65345 | 63.8 | 78,54,78,54 | 26,18,26,18 | primary CTA (claim / watch ad) |
| `chip_boost.png` | 450×108 | @3x | 150×36 | 26535 | 25.9 | 42,30,42,30 | 14,10,14,10 | economy HUD chip accent 加速中 |
| `chip_parchment.png` | 450×108 | @3x | 150×36 | 30700 | 30.0 | 42,30,42,30 | 14,10,14,10 | economy HUD chip 今日已砍/剩余树根/生长倒计时 |
| `guide_bubble.png` | 600×192 | @3x | 200×64 | 62664 | 61.2 | 54,48,54,48 | 18,16,18,16 | onboarding speech bubble 9-slice (text at runtime) |
| `guide_hand.png` | 192×192 | @3x | 64×64 | 2926 | 2.9 | — | — | tap pointer; fingertip hotspot at (30,3)pt from top-left; anim: scale 1->0.9 + 4pt press, 0.9s loop |
| `guide_ring.png` | 288×288 | @3x | 96×96 | 6530 | 6.4 | — | — | spotlight outline (cream ink stroke) drawn around the cutout; stretch to target rect |
| `guide_tail.png` | 84×54 | @3x | 28×18 | 842 | 0.8 | — | — | bubble tail, points down; overlap bubble bottom edge by 2pt; rotate/flip for other sides |
| `panel_vellum.png` | 600×450 | @2x | 300×225 | 116337 | 113.6 | 80,80,80,80 | 40,40,40,40 | modal / ranking panel 9-slice (density 2 texel/pt) |
| `ribbon_madder.png` | 780×156 | @3x | 260×52 | 50427 | 49.2 | 144,36,144,36 | 48,12,48,12 | title ribbon; L/R insets keep swallowtails |
| `seal_wax.png` | 192×192 | @3x | 64×64 | 28809 | 28.1 | — | — | wax seal accent; uniform scale |
| `strip_parchment.png` | 720×144 | @3x | 240×48 | 53772 | 52.5 | 48,36,48,36 | 16,12,16,12 | secondary button / list-row highlight |

**Total runtime textures: 491827 bytes (480.3 KB)** — budget < 600 KB ✅ (v1: 196 KB incl. bg, but 1x/256-colour)

## Optional (not in runtime set)

| `optional/bg_parchment.jpg` | 576×1024 | JPEG q88 | 155297 bytes | only if a textured splash is wanted; current loading is procedural |

## Mockups (review only, do not ship) — `export/mockups/`

| file | W×H | KB | screen |
|---|---|---|---|
| `01_launch_3d.png` | 750×1624 | 1112 | 启动即 3D 场景 + 经济小条 + 右侧图标按钮（无首页） |
| `02_exhausted_ad.png` | 750×1624 | 1111 | 树根用尽 + 看短片（场景上半透明遮罩） |
| `03_ranking.png` | 750×1624 | 1086 | 好友柴榜（场景上） |
| `04_loading_to_scene.png` | 1540×1624 | 1105 | 加载（纯 canvas）→ 100% 淡出直接进 3D |
| `05_safe_zones.png` | 750×1624 | 1110 | 安全区标注 |
| `06_guide_step1.png` | 750×1624 | 986 | 新手引导 1/3：点木头劈开 |
| `06_guide_step2.png` | 750×1624 | 967 | 新手引导 2/3：剩余树根 / 生长倒计时 |
| `06_guide_step3.png` | 750×1624 | 975 | 新手引导 3/3：看短片加速 / 好友柴榜 |
| `07_sharpness_before_after.png` | 1120×698 | 147 | 清晰度前后对比（dpr3 设备像素模拟） |
| `overview.png` | 1180×1368 | 1425 | 总览 |

Backup of the previous export: `/workspace/ui-parchment-v2/export_v1/`.

## v3.1 naming (client contract)
- Default runtime slices are now `name@2x.png` (2 px per pt), 14 files, total 281 KB. `name@3x.png` copies are optional for dpr 3 (panel_vellum has @2x only).
- 9-slice insets for @2x: `nine_slice_insets_2x` in manifest.json (= pt × 2). Destination insets: `nine_slice_insets_pt`.
