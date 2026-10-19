# manifest.json 校验报告

脚本：src/build_manifest.py（生成+校验同一次运行）

| file | variant | exists | px | expected (pt×scale) | insets px | expected | OK |
|---|---|---|---|---|---|---|---|
| btn_icon_ad@2x.png | 2x | ✓ | [104, 104] | [104, 104] | None | None | ✓ |
| btn_icon_ad@3x.png | 3x | ✓ | [156, 156] | [156, 156] | None | None | ✓ |
| btn_icon_help@2x.png | 2x | ✓ | [104, 104] | [104, 104] | None | None | ✓ |
| btn_icon_help@3x.png | 3x | ✓ | [156, 156] | [156, 156] | None | None | ✓ |
| btn_icon_rank@2x.png | 2x | ✓ | [104, 104] | [104, 104] | None | None | ✓ |
| btn_icon_rank@3x.png | 3x | ✓ | [156, 156] | [156, 156] | None | None | ✓ |
| btn_leather@2x.png | 2x | ✓ | [440, 120] | [440, 120] | [52, 36, 52, 36] | [52, 36, 52, 36] | ✓ |
| btn_leather@3x.png | 3x | ✓ | [660, 180] | [660, 180] | [78, 54, 78, 54] | [78, 54, 78, 54] | ✓ |
| guide_bubble@2x.png | 2x | ✓ | [400, 128] | [400, 128] | [36, 32, 36, 32] | [36, 32, 36, 32] | ✓ |
| guide_bubble@3x.png | 3x | ✓ | [600, 192] | [600, 192] | [54, 48, 54, 48] | [54, 48, 54, 48] | ✓ |
| guide_hand@2x.png | 2x | ✓ | [128, 128] | [128, 128] | None | None | ✓ |
| guide_hand@3x.png | 3x | ✓ | [192, 192] | [192, 192] | None | None | ✓ |
| guide_ring@2x.png | 2x | ✓ | [192, 192] | [192, 192] | None | None | ✓ |
| guide_ring@3x.png | 3x | ✓ | [288, 288] | [288, 288] | None | None | ✓ |
| guide_tail@2x.png | 2x | ✓ | [56, 36] | [56, 36] | None | None | ✓ |
| guide_tail@3x.png | 3x | ✓ | [84, 54] | [84, 54] | None | None | ✓ |
| panel_vellum@2x.png | 2x | ✓ | [600, 450] | [600, 450] | [80, 80, 80, 80] | [80, 80, 80, 80] | ✓ |
| ribbon_madder@2x.png | 2x | ✓ | [520, 104] | [520, 104] | [96, 24, 96, 24] | [96, 24, 96, 24] | ✓ |
| ribbon_madder@3x.png | 3x | ✓ | [780, 156] | [780, 156] | [144, 36, 144, 36] | [144, 36, 144, 36] | ✓ |
| strip_parchment@2x.png | 2x | ✓ | [480, 96] | [480, 96] | [32, 24, 32, 24] | [32, 24, 32, 24] | ✓ |
| strip_parchment@3x.png | 3x | ✓ | [720, 144] | [720, 144] | [48, 36, 48, 36] | [48, 36, 48, 36] | ✓ |
| tag_parchment@2x.png | 2x | ✓ | [208, 80] | [208, 80] | [28, 24, 28, 24] | [28, 24, 28, 24] | ✓ |
| tag_parchment@3x.png | 3x | ✓ | [312, 120] | [312, 120] | [42, 36, 42, 36] | [42, 36, 42, 36] | ✓ |
| tag_madder@2x.png | 2x | ✓ | [208, 80] | [208, 80] | [28, 24, 28, 24] | [28, 24, 28, 24] | ✓ |
| tag_madder@3x.png | 3x | ✓ | [312, 120] | [312, 120] | [42, 36, 42, 36] | [42, 36, 42, 36] | ✓ |
| btn_icon_style@2x.png | 2x | ✓ | [104, 104] | [104, 104] | None | None | ✓ |
| btn_icon_style@3x.png | 3x | ✓ | [156, 156] | [156, 156] | None | None | ✓ |
| icon_check@2x.png | 2x | ✓ | [40, 40] | [40, 40] | None | None | ✓ |
| icon_check@3x.png | 3x | ✓ | [60, 60] | [60, 60] | None | None | ✓ |
| drawer_vellum@2x.png | 2x | ✓ | [400, 280] | [400, 280] | [56, 48, 56, 88] | [56, 48, 56, 88] | ✓ |
| drawer_vellum@3x.png | 3x | ✓ | [600, 420] | [600, 420] | [84, 72, 84, 132] | [84, 72, 84, 132] | ✓ |
| roll_paper@2x.png | 2x | ✓ | [320, 48] | [320, 48] | [32, 0, 32, 0] | [32, 0, 32, 0] | ✓ |
| roll_paper@3x.png | 3x | ✓ | [480, 72] | [480, 72] | [48, 0, 48, 0] | [48, 0, 48, 0] | ✓ |
| roll_shadow@2x.png | 2x | ✓ | [4, 32] | [4, 32] | None | None | ✓ |
| roll_shadow@3x.png | 3x | ✓ | [6, 48] | [6, 48] | None | None | ✓ |

可选（不进包，放在 optional/，路径相对 textures/）：

| file | variant | exists | px | expected (pt×scale) | insets px | expected | OK |
|---|---|---|---|---|---|---|---|
| chip_parchment@2x.png | 2x | ✓ | [300, 72] | [300, 72] | [28, 20, 28, 20] | [28, 20, 28, 20] | ✓ |
| chip_parchment@3x.png | 3x | ✓ | [450, 108] | [450, 108] | [42, 30, 42, 30] | [42, 30, 42, 30] | ✓ |
| chip_boost@2x.png | 2x | ✓ | [300, 72] | [300, 72] | [28, 20, 28, 20] | [28, 20, 28, 20] | ✓ |
| chip_boost@3x.png | 3x | ✓ | [450, 108] | [450, 108] | [42, 30, 42, 30] | [42, 30, 42, 30] | ✓ |
| seal_wax@2x.png | 2x | ✓ | [128, 128] | [128, 128] | None | None | ✓ |
| seal_wax@3x.png | 3x | ✓ | [192, 192] | [192, 192] | None | None | ✓ |
| btn_icon_menu@2x.png | 2x | ✓ | [104, 104] | [104, 104] | None | None | ✓ |
| btn_icon_menu@3x.png | 3x | ✓ | [156, 156] | [156, 156] | None | None | ✓ |
| btn_icon_menu_s@2x.png | 2x | ✓ | [80, 80] | [80, 80] | None | None | ✓ |
| btn_icon_menu_s@3x.png | 3x | ✓ | [120, 120] | [120, 120] | None | None | ✓ |

textures/ 里未登记的文件：无
结果：**PASS**（0 项不符）
@2x 套 328.6 KB · @3x 套（panel 用 @2x）533.6 KB · textures/ 合计（两套都放）769.8 KB
