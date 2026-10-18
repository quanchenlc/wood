# UI Parchment v2 — SIZE_MANIFEST

## Game textures (ship these)

| file | W×H | bytes | KB | 9-slice insets (L,T,R,B) | role |
|---|---|---|---|---|---|
| `bg_parchment.jpg` | 576×1024 | 104953 | 102.5 | — (uniform scale) | fullscreen parchment background (cover/contain) |
| `btn_leather.png` | 340×120 | 14836 | 14.5 | 40,28,40,28 | primary CTA leather button |
| `chip_boost.png` | 280×64 | 7323 | 7.2 | 20,14,20,14 | economy HUD chip accent for 加速中 |
| `chip_parchment.png` | 280×64 | 8319 | 8.1 | 20,14,20,14 | economy HUD chip (今日已砍 / 剩余树根 / 生长倒计时) |
| `panel_vellum.png` | 400×300 | 37360 | 36.5 | 60,60,60,60 | modal / ranking panel 9-slice |
| `ribbon_madder.png` | 380×75 | 8891 | 8.7 | 70,18,70,18 | title ribbon (swallowtail ends) |
| `seal_wax.png` | 128×129 | 7641 | 7.5 | — (uniform scale) | decorative wax seal accent |
| `strip_parchment.png` | 360×80 | 11642 | 11.4 | 24,16,24,16 | secondary button / list-row highlight strip |

**Total textures: 200965 bytes (196.3 KB)** — budget target &lt;600 KB ✅

## Mockups (review only, do not ship)

| file | W×H | KB | screen |
|---|---|---|---|
| `01_home.png` | 750×1334 | 1253 | 首页 · 开始砍柴 / 好友柴榜 |
| `02_daily_ad.png` | 750×1334 | 1310 | 树根用尽 + 看广告再领 |
| `03_ranking.png` | 750×1334 | 1251 | 好友柴榜框 |
| `04_loading_canvas.png` | 750×1334 | 787 | 画布内加载条（无贴图，程序绘制参考） |
| `05_economy_hud.png` | 750×1334 | 1236 | 经济 HUD 小条布局 + 安全区 |
| `overview.png` | 1719×1050 | 1238 | 总览 |

## Client 9-slice notes
- Use left/right/top/bottom border insets above; center tile stretches.
- `ribbon_madder`: large L/R insets so swallowtail forks never stretch.
- `chip_*`: stretch width only for variable label length; keep height ~56–64 logical px.
- `seal_wax`: scale uniformly; do not 9-slice.
- Runtime Chinese text: system font or OFL subset (see notes.md). Labels in mockups are baked for review only.
