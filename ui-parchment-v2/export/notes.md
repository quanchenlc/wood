# Parchment UI v2 — production notes

Game-ready export: `/workspace/ui-parchment-v2/export/`
(textures + mockups + `SIZE_MANIFEST.md` + `manifest.json`)

## Texture sources (public domain / CC0 via Wikimedia Commons)
All scans in `raw/`. Attribution one-liner for credits screen:

> Background & panel vellum from Wikimedia Commons PD scans — “Old paper1.jpg”, Towneley Lectionary blank page (NYPL); leather from “Leather brown.jpg” (PD); wax seal from “1778 wax seal of merchant guild in Sombor.jpg” (PD). Processed into UI slices; no third-party trademarks.

Detail:
- `bg_parchment.jpg`: “Old paper1.jpg” (PD) + high-pass grain/creases from Towneley Lectionary blank page (NYPL b12455533-1610008, PD)
- `panel_vellum.png` / `strip_parchment.png` / `chip_parchment.png` / `chip_boost.png`: Towneley Lectionary blank vellum, gradient-mapped to sepia, noise-torn alpha, singed rim (`chip_boost` = same cut with madder-warm tint for 加速中)
- `btn_leather.png` / `ribbon_madder.png`: “Leather brown.jpg” (PD); ribbon dyed madder red with swallowtail ends
- `seal_wax.png`: “1778 wax seal of merchant guild in Sombor.jpg” (PD), keyed off white bg, muted to brick red

## 9-slice insets (source pixels: L, T, R, B)
| file | insets | notes |
|---|---|---|
| panel_vellum.png 400×300 | 60,60,60,60 | modals / ranking sheet |
| strip_parchment.png 360×80 | 24,16,24,16 | secondary buttons, list highlight |
| chip_parchment.png 280×64 | 20,14,20,14 | economy HUD; stretch width |
| chip_boost.png 280×64 | 20,14,20,14 | same; 加速中 accent |
| btn_leather.png 340×120 | 40,28,40,28 | primary CTA |
| ribbon_madder.png 380×75 | 70,18,70,18 | large L/R — keep swallowtails |
| bg_parchment.jpg 576×1024 | — | cover/contain fullscreen |
| seal_wax.png 128×129 | — | uniform scale only |

See `export/SIZE_MANIFEST.md` / `export/manifest.json` for bytes and roles.

## Economy HUD chips (画布内)
Labels (runtime text, not baked into textures):
- 今日已砍 · 剩余树根 · 生长倒计时 · 加速中

Layout (ref `mockups/05_economy_hud.png`):
- Top-left two rows; keep right edge ≤ ~520 logical px so WeChat capsule (top-right) stays clear
- Avoid bottom-left art-set switcher and bottom-right vConsole
- Chip height ~56–64 px; width follows label+value

## Safe zones (750×1334 logical)
- WeChat capsule: ≈ (540,48)–(720,112)
- vConsole FAB: bottom-right ≈ 80×80
- Art-set switcher: bottom-left ≈ (20,1240)–(220,1290)

## Fonts (mockup / optional bake)
- Title: Ma Shan Zheng (OFL) — bake title glyphs or subset
- Body: LXGW WenKai (OFL, ~19 MB) — **subset** or fall back to system serif
- Numbers: Noto Serif CJK Bold
Runtime HUD / buttons should prefer system font or a tight glyph subset; do not ship full WenKai.

## Screens delivered
1. `01_home` — 开始砍柴 / 好友柴榜 / 每日签到
2. `02_daily_ad` — 树根用尽 + 看广告再领 +5
3. `03_ranking` — 好友柴榜 · 本周
4. `04_loading_canvas` — ink progress bar, **no texture load** (procedural reference)
5. `05_economy_hud` — chip layout + safe-zone guides

## Package budget
Textures total ≈ **196 KB** (target &lt;600 KB). Background long side = 1024.

## Scripts
`src/make_textures.py`, `src/make_mockups.py`. Re-run either to regenerate.

## Caveats
- Wax seal retains historical Latin legend + ship motif from the 1778 PD scan; not a modern brand, but if review wants zero lettering on seal, replace with a blank wax disc or a simple axe/tree relief (self-made).
- Mockup shadows / guide boxes are for review only — do not ship.
- Loading screen is intentionally texture-free so first paint works before asset I/O.
