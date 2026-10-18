# Parchment UI v2: textures from real scans

## Texture sources (all public domain / CC0, via Wikimedia Commons)
- bg_parchment.jpg: "Old paper1.jpg" (PD), with real vellum grain/creases high-passed in from "Towneley Lectionary (blank page) (NYPL b12455533-1610008)" (PD)
- panel_vellum.png / strip_parchment.png: Towneley Lectionary blank vellum page (PD), gradient-mapped to sepia, noise-torn alpha edge, uneven singed rim
- btn_leather.png / ribbon_madder.png: "Leather brown.jpg" (PD); ribbon is the same leather, dyed madder red, with swallowtail ends
- seal_wax.png: "1778 wax seal of merchant guild in Sombor.jpg" (PD), keyed off its white background and muted to brick red

## 9-slice
- panel_vellum.png 400x300: insets about 60px (used at 620x560 and 660x1030 in the mockups)
- strip_parchment.png 360x80: stretch horizontally only, ends about 24px

## Fonts (mockup only)
- Title: Ma Shan Zheng (OFL). Bake it into an image or subset the few glyphs for the game.
- Body: LXGW WenKai (OFL). 19 MB, so the game should use a subset, or fall back to a system serif.
- Numbers: Noto Serif CJK Bold

Scripts: src/make_textures.py, src/make_mockups.py. Source scans are in raw/.
